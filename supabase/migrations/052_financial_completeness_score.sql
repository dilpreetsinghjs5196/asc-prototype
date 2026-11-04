-- ==============================================================================
-- MIGRATION: 052_financial_completeness_score.sql
-- PHASE: 76 — Financial Completeness Score & Trust Thresholds Engine
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Case Financial Completeness Records Table
CREATE TABLE IF NOT EXISTS public.case_financial_completeness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    overall_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (overall_score >= 0.00 AND overall_score <= 100.00),
    trust_tier VARCHAR(32) NOT NULL DEFAULT 'PROVISIONAL_ESTIMATED' CHECK (
        trust_tier IN ('VERIFIED_AUDIT_READY', 'SUBSTANTIAL_TRUST', 'PROVISIONAL_ESTIMATED', 'CRITICAL_INCOMPLETE')
    ),
    reimbursement_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (reimbursement_score >= 0.00 AND reimbursement_score <= 25.00),
    direct_cost_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (direct_cost_score >= 0.00 AND direct_cost_score <= 25.00),
    time_staffing_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (time_staffing_score >= 0.00 AND time_staffing_score <= 20.00),
    pharmacy_sterile_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (pharmacy_sterile_score >= 0.00 AND pharmacy_sterile_score <= 10.00),
    coding_modifier_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (coding_modifier_score >= 0.00 AND coding_modifier_score <= 10.00),
    ledger_verification_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (ledger_verification_score >= 0.00 AND ledger_verification_score <= 10.00),
    is_audit_ready BOOLEAN NOT NULL DEFAULT FALSE,
    missing_elements TEXT[] NOT NULL DEFAULT '{}',
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scored_by UUID REFERENCES auth.users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_completeness_surgery ON public.case_financial_completeness(surgery_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_completeness_facility ON public.case_financial_completeness(facility_id, trust_tier);
CREATE INDEX IF NOT EXISTS idx_completeness_audit ON public.case_financial_completeness(facility_id, is_audit_ready);

-- 2. Deterministic Completeness Calculation Trigger
CREATE OR REPLACE FUNCTION public.fn_calculate_case_completeness()
RETURNS TRIGGER AS $$
DECLARE
    v_total NUMERIC(5,2);
BEGIN
    v_total := ROUND(
        COALESCE(NEW.reimbursement_score, 0.00) +
        COALESCE(NEW.direct_cost_score, 0.00) +
        COALESCE(NEW.time_staffing_score, 0.00) +
        COALESCE(NEW.pharmacy_sterile_score, 0.00) +
        COALESCE(NEW.coding_modifier_score, 0.00) +
        COALESCE(NEW.ledger_verification_score, 0.00),
        2
    );

    NEW.overall_score := LEAST(GREATEST(v_total, 0.00), 100.00);

    -- Trust tier classification
    IF NEW.overall_score >= 90.00 THEN
        NEW.trust_tier := 'VERIFIED_AUDIT_READY';
        NEW.is_audit_ready := TRUE;
    ELSIF NEW.overall_score >= 75.00 THEN
        NEW.trust_tier := 'SUBSTANTIAL_TRUST';
        NEW.is_audit_ready := FALSE;
    ELSIF NEW.overall_score >= 50.00 THEN
        NEW.trust_tier := 'PROVISIONAL_ESTIMATED';
        NEW.is_audit_ready := FALSE;
    ELSE
        NEW.trust_tier := 'CRITICAL_INCOMPLETE';
        NEW.is_audit_ready := FALSE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_case_completeness ON public.case_financial_completeness;
CREATE TRIGGER trg_calculate_case_completeness
    BEFORE INSERT OR UPDATE ON public.case_financial_completeness
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_calculate_case_completeness();

-- 3. Rollup View: Facility Completeness Scorecard
CREATE OR REPLACE VIEW public.vw_facility_completeness_scorecard AS
SELECT
    fc.facility_id,
    COUNT(fc.id) AS total_cases_evaluated,
    ROUND(AVG(fc.overall_score), 2) AS avg_completeness_score,
    ROUND(AVG(fc.reimbursement_score), 2) AS avg_reimbursement_score,
    ROUND(AVG(fc.direct_cost_score), 2) AS avg_direct_cost_score,
    ROUND(AVG(fc.time_staffing_score), 2) AS avg_time_staffing_score,
    ROUND(AVG(fc.pharmacy_sterile_score), 2) AS avg_pharmacy_sterile_score,
    ROUND(AVG(fc.coding_modifier_score), 2) AS avg_coding_modifier_score,
    ROUND(AVG(fc.ledger_verification_score), 2) AS avg_ledger_verification_score,
    COUNT(CASE WHEN fc.trust_tier = 'VERIFIED_AUDIT_READY' THEN 1 END) AS audit_ready_case_count,
    COUNT(CASE WHEN fc.trust_tier = 'PROVISIONAL_ESTIMATED' THEN 1 END) AS provisional_case_count,
    COUNT(CASE WHEN fc.trust_tier = 'CRITICAL_INCOMPLETE' THEN 1 END) AS critical_incomplete_case_count,
    ROUND(
        (COUNT(CASE WHEN fc.trust_tier = 'VERIFIED_AUDIT_READY' THEN 1 END)::NUMERIC / NULLIF(COUNT(fc.id), 0)) * 100.00,
        1
    ) AS audit_ready_case_pct
FROM public.case_financial_completeness fc
GROUP BY fc.facility_id;

-- 4. Rollup View: Payer Completeness Summary
CREATE OR REPLACE VIEW public.vw_payer_completeness_summary AS
SELECT
    fc.facility_id,
    COALESCE(s.payment_model, 'Insurance') AS payer_name,
    COUNT(fc.id) AS total_cases,
    ROUND(AVG(fc.overall_score), 2) AS avg_completeness_score,
    COUNT(CASE WHEN fc.is_audit_ready THEN 1 END) AS audit_ready_cases,
    ROUND(
        (COUNT(CASE WHEN fc.is_audit_ready THEN 1 END)::NUMERIC / NULLIF(COUNT(fc.id), 0)) * 100.00,
        1
    ) AS audit_readiness_pct
FROM public.case_financial_completeness fc
JOIN public.surgeries s ON s.id = fc.surgery_id
GROUP BY fc.facility_id, s.payment_model;

-- 5. Rollup View: Surgeon Documentation Completeness
CREATE OR REPLACE VIEW public.vw_surgeon_documentation_completeness AS
SELECT
    fc.facility_id,
    s.surgeon_id,
    COALESCE(NULLIF(TRIM(COALESCE(su.firstname, '') || ' ' || COALESCE(su.lastname, '')), ''), s.doctor_name, 'Unassigned Surgeon') AS surgeon_name,
    COALESCE(su.specialty, 'General Surgery') AS specialty,
    COUNT(fc.id) AS total_cases,
    ROUND(AVG(fc.overall_score), 2) AS avg_completeness_score,
    COUNT(CASE WHEN fc.is_audit_ready THEN 1 END) AS audit_ready_cases,
    COUNT(CASE WHEN fc.trust_tier = 'CRITICAL_INCOMPLETE' THEN 1 END) AS critical_incomplete_cases,
    ROUND(
        (COUNT(CASE WHEN fc.is_audit_ready THEN 1 END)::NUMERIC / NULLIF(COUNT(fc.id), 0)) * 100.00,
        1
    ) AS documentation_compliance_pct
FROM public.case_financial_completeness fc
JOIN public.surgeries s ON s.id = fc.surgery_id
LEFT JOIN public.surgeons su ON su.id = s.surgeon_id
GROUP BY
    fc.facility_id,
    s.surgeon_id,
    su.firstname,
    su.lastname,
    s.doctor_name,
    su.specialty;

-- 6. Row-Level Security (RLS)
ALTER TABLE public.case_financial_completeness ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_completeness_select_policy ON public.case_financial_completeness
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY case_completeness_insert_policy ON public.case_financial_completeness
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));

