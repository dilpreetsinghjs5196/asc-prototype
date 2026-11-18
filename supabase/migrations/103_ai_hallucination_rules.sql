-- ==============================================================================
-- Phase C5 Migration: AI Hallucination Rules, Deterministic Number Governance
-- Tables: ai_hallucination_guardrails, ai_hallucination_intercept_logs, ai_unknown_handling_templates
-- Views: vw_ai_hallucination_intercept_metrics, vw_ai_guardrail_health
-- Tenancy: PostgreSQL Row-Level Security (RLS) via app.current_facility_id
-- ==============================================================================

-- 1. AI Hallucination Guardrail Policies
CREATE TABLE IF NOT EXISTS public.ai_hallucination_guardrails (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'RULE-DETERMINISTIC-MATH', 'RULE-NUMBER-SCRUBBER'
    name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL, -- 'ARITHMETIC', 'EVIDENCE_GROUNDING', 'UNKNOWN_HANDLING', 'TERMINOLOGY', 'SAFETY'
    description TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'BLOCK', -- 'BLOCK', 'WARN', 'REDACT'
    detection_pattern TEXT, -- Regex or AST rule identifier
    confidence_threshold NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Hallucination Intercept Audit Log
CREATE TABLE IF NOT EXISTS public.ai_hallucination_intercept_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    session_id VARCHAR(64) NOT NULL,
    rule_id VARCHAR(64) NOT NULL REFERENCES public.ai_hallucination_guardrails(id),
    intercept_type VARCHAR(32) NOT NULL, -- 'UNGROUNDED_NUMBER', 'FABRICATED_CODE', 'ARITHMETIC_DRIFT', 'UNVERIFIED_ASSERTION'
    raw_prompt TEXT NOT NULL,
    candidate_response TEXT NOT NULL,
    flagged_tokens JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of [{ token, expectedGroundTruth, reason }]
    action_taken VARCHAR(32) NOT NULL DEFAULT 'BLOCKED_AND_LOGGED', -- 'BLOCKED_AND_LOGGED', 'REPLACED_WITH_UNKNOWN', 'REDACTED'
    sanitized_response TEXT,
    provenance_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Unknown Handling Templates
CREATE TABLE IF NOT EXISTS public.ai_unknown_handling_templates (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'UNKNOWN-MISSING-CASE', 'UNKNOWN-UNCONTRACTED-PAYER'
    category VARCHAR(32) NOT NULL,
    title VARCHAR(128) NOT NULL,
    standard_message TEXT NOT NULL,
    suggested_alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_guardrails_active ON public.ai_hallucination_guardrails(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_guardrails_category ON public.ai_hallucination_guardrails(category);
CREATE INDEX IF NOT EXISTS idx_ai_intercepts_facility ON public.ai_hallucination_intercept_logs(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_intercepts_rule ON public.ai_hallucination_intercept_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_ai_intercepts_type ON public.ai_hallucination_intercept_logs(intercept_type);
CREATE INDEX IF NOT EXISTS idx_ai_intercepts_created ON public.ai_hallucination_intercept_logs(created_at);

-- Analytical Views
CREATE OR REPLACE VIEW public.vw_ai_hallucination_intercept_metrics AS
SELECT 
    facility_id,
    COUNT(*) AS total_intercepts,
    COUNT(*) FILTER (WHERE intercept_type = 'UNGROUNDED_NUMBER') AS ungrounded_number_count,
    COUNT(*) FILTER (WHERE intercept_type = 'FABRICATED_CODE') AS fabricated_code_count,
    COUNT(*) FILTER (WHERE intercept_type = 'ARITHMETIC_DRIFT') AS arithmetic_drift_count,
    COUNT(*) FILTER (WHERE action_taken = 'BLOCKED_AND_LOGGED') AS blocked_count,
    MAX(created_at) AS latest_intercept_at
FROM public.ai_hallucination_intercept_logs
GROUP BY facility_id;

CREATE OR REPLACE VIEW public.vw_ai_guardrail_health AS
SELECT 
    g.id AS rule_id,
    g.name AS rule_name,
    g.category,
    g.severity,
    g.is_active,
    COUNT(l.id) AS total_violations_intercepted,
    MAX(l.created_at) AS last_violation_at
FROM public.ai_hallucination_guardrails g
LEFT JOIN public.ai_hallucination_intercept_logs l ON g.id = l.rule_id
GROUP BY g.id, g.name, g.category, g.severity, g.is_active;

-- Row-Level Security
ALTER TABLE public.ai_hallucination_guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_hallucination_intercept_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_unknown_handling_templates ENABLE ROW LEVEL SECURITY;

-- Global reference tables
DROP POLICY IF EXISTS p_ai_guardrails_all ON public.ai_hallucination_guardrails;
CREATE POLICY p_ai_guardrails_all ON public.ai_hallucination_guardrails FOR ALL USING (true);

DROP POLICY IF EXISTS p_ai_unknown_templates_all ON public.ai_unknown_handling_templates;
CREATE POLICY p_ai_unknown_templates_all ON public.ai_unknown_handling_templates FOR ALL USING (true);

-- Facility tenant isolation
DROP POLICY IF EXISTS p_ai_intercepts_tenant ON public.ai_hallucination_intercept_logs;
CREATE POLICY p_ai_intercepts_tenant ON public.ai_hallucination_intercept_logs
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Seed Canonical Guardrails
INSERT INTO public.ai_hallucination_guardrails (id, name, category, description, severity, detection_pattern, confidence_threshold)
VALUES 
    ('RULE-DETERMINISTIC-MATH', 'Zero Generative Arithmetic', 'ARITHMETIC', 'Prohibits generative LLM math; all calculations must run via server-side routines.', 'BLOCK', 'NO_UNVERIFIED_ARITHMETIC', 99.00),
    ('RULE-NUMBER-SCRUBBER', 'Ungrounded Number Scrubber', 'EVIDENCE_GROUNDING', 'Intercepts candidate responses containing numerical claims not backed by Phase C4 citations.', 'BLOCK', 'EXTRACT_NUMERICS_AND_MATCH', 95.00),
    ('RULE-UNKNOWN-DATA', 'Formal Unknown Refusal Protocol', 'UNKNOWN_HANDLING', 'Mandates structured "I do not know" format when queried records are missing from facility DB.', 'BLOCK', 'REQUIRE_UNKNOWN_SCHEMA', 95.00),
    ('RULE-CPT-VALIDATION', 'CPT Code Authoritative Validation', 'TERMINOLOGY', 'Validates all 5-digit CPT codes against the licensed AMA CPT manual; blocks fabricated codes.', 'BLOCK', 'CPT_MASTER_LOOKUP', 100.00),
    ('RULE-PAYER-RATES', 'Payer Contract Rate Gating', 'EVIDENCE_GROUNDING', 'Prohibits claiming negotiated allowable rates without an active payer contract record.', 'BLOCK', 'CONTRACT_TERMS_VERIFICATION', 98.00),
    ('RULE-PHYSICIAN-CREDENTIALS', 'Physician Credential Verification', 'TERMINOLOGY', 'Prohibits fabricating provider NPIs, specialty privileges, or surgical staff assignments.', 'BLOCK', 'PROVIDER_DIRECTORY_LOOKUP', 100.00),
    ('RULE-OR-SENSOR-BOUNDS', 'OR Timestamp Sensor Bounding', 'SAFETY', 'Enforces physical reality bounds on room times (e.g. non-negative turnover, wheels-in before incision).', 'BLOCK', 'CHRONOLOGICAL_TIME_VALIDATOR', 99.00),
    ('RULE-CONFIDENCE-THRESHOLD', 'Minimum Confidence Gating', 'SAFETY', 'Rejects analytical assertions where underlying data confidence score is below 90.0%.', 'BLOCK', 'MIN_CONFIDENCE_90_PCT', 90.00),
    ('RULE-NON-CLINICAL-DIRECTIVE', 'Prohibited Clinical Directives', 'SAFETY', 'Intercepts prescriptive medical diagnoses or surgical treatment directives (non-clinical decision support only).', 'BLOCK', 'MEDICAL_DIRECTIVE_BLOCKER', 99.50),
    ('RULE-SYNTHETIC-LEAK-DEFENSE', 'Synthetic Test Data Guard', 'SAFETY', 'Prohibits presenting synthetic mock fixtures or placeholder test values as production financial truth.', 'BLOCK', 'SYNTHETIC_DATA_FLAG', 99.00)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    confidence_threshold = EXCLUDED.confidence_threshold;

-- Seed Unknown Handling Templates
INSERT INTO public.ai_unknown_handling_templates (id, category, title, standard_message, suggested_alternatives)
VALUES 
    ('UNKNOWN-CASE-RECORD', 'CLINICAL', 'Unrecorded Surgical Case', 'Authoritative surgical records for the requested case ID or patient are unavailable in the facility database.', '["cpt_economics_query", "surgeon_scorecard_query"]'::jsonb),
    ('UNKNOWN-PAYER-CONTRACT', 'FINANCIAL', 'Uncontracted Commercial Payer', 'Naples Surgery Center maintains no active commercial fee schedule agreement for the requested payer ID.', '["payer_contract_performance_query", "payer_realization_rate"]'::jsonb),
    ('UNKNOWN-SURGEON-PREFERENCE', 'SUPPLY_CHAIN', 'Missing Surgeon Preference Card', 'No standardized implant construct or preference card has been filed for the specified procedure.', '["construct_standardization_scenario", "case_cost_composition"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    standard_message = EXCLUDED.standard_message,
    suggested_alternatives = EXCLUDED.suggested_alternatives;
