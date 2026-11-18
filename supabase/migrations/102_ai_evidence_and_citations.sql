-- ==============================================================================
-- Phase C4 Migration: AI Evidence, Citations & Explainability Architecture
-- Tables: ai_evidence_sources, ai_evidence_citations, ai_explainability_traces
-- Views: vw_ai_citation_summary, vw_ai_unverified_citations
-- Tenancy: PostgreSQL Row-Level Security (RLS) via app.current_facility_id
-- ==============================================================================

-- 1. AI Evidence Sources Registry (Authoritative data source classifications)
CREATE TABLE IF NOT EXISTS public.ai_evidence_sources (
    source_type VARCHAR(64) PRIMARY KEY, -- 'EHR_CASE', 'CLAIM_837', 'REMITTANCE_835', 'PAYER_CONTRACT', 'OR_LOG', 'IMPLANT_INVOICE'
    display_name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    source_table VARCHAR(128) NOT NULL,
    primary_key_column VARCHAR(64) NOT NULL DEFAULT 'id',
    facility_fk_column VARCHAR(64) NOT NULL DEFAULT 'facility_id',
    sensitivity_level VARCHAR(32) NOT NULL DEFAULT 'PHI_RESTRICTED', -- 'PUBLIC', 'INTERNAL', 'FINANCIAL', 'PHI_RESTRICTED'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Evidence Citations Ledger (Persistent citation links to source records)
CREATE TABLE IF NOT EXISTS public.ai_evidence_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    citation_code VARCHAR(32) NOT NULL, -- e.g. 'CIT-1042', 'E-882'
    source_type VARCHAR(64) NOT NULL REFERENCES public.ai_evidence_sources(source_type),
    source_record_id VARCHAR(128) NOT NULL,
    source_record_key VARCHAR(128) NOT NULL, -- Human-readable identifier (e.g. 'CASE-9041', 'CLM-77210')
    field_path VARCHAR(256) NOT NULL, -- e.g. 'financial.net_margin', 'remit.allowed_amount'
    statement_context TEXT NOT NULL, -- The text sentence or insight using this evidence
    claimed_value JSONB NOT NULL, -- The exact scalar or structured value asserted by the AI
    current_value JSONB, -- The latest value fetched from active DB during verification
    calculation_formula TEXT, -- Formula string if value is derived (e.g. 'allowable - paid')
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 98.50,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED', -- 'VERIFIED', 'DATA_DRIFT', 'UNVERIFIED', 'REVOKED'
    provenance_hash VARCHAR(64) NOT NULL, -- SHA-256 fingerprint of the source record snapshot
    created_by VARCHAR(64) NOT NULL DEFAULT 'ai_analyst',
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Explainability Traces (Step-by-step mathematical decomposition of complex KPIs)
CREATE TABLE IF NOT EXISTS public.ai_explainability_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    trace_code VARCHAR(32) NOT NULL,
    citation_id UUID REFERENCES public.ai_evidence_citations(id) ON DELETE SET NULL,
    metric_name VARCHAR(128) NOT NULL,
    primary_formula TEXT NOT NULL,
    inputs JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of [{ name, value, sourceRecord, unit }]
    intermediate_steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Step-by-step resolution
    computed_result NUMERIC(14,4) NOT NULL,
    tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    verified BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_citations_facility ON public.ai_evidence_citations(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_citations_source ON public.ai_evidence_citations(source_type, source_record_id);
CREATE INDEX IF NOT EXISTS idx_ai_citations_status ON public.ai_evidence_citations(verification_status);
CREATE INDEX IF NOT EXISTS idx_ai_citations_code ON public.ai_evidence_citations(citation_code);
CREATE INDEX IF NOT EXISTS idx_ai_explainability_facility ON public.ai_explainability_traces(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_explainability_citation ON public.ai_explainability_traces(citation_id);

-- Analytical Views
CREATE OR REPLACE VIEW public.vw_ai_citation_summary AS
SELECT 
    facility_id,
    COUNT(*) AS total_citations,
    COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') AS verified_citations,
    COUNT(*) FILTER (WHERE verification_status = 'DATA_DRIFT') AS drifted_citations,
    COUNT(*) FILTER (WHERE verification_status = 'UNVERIFIED') AS unverified_citations,
    COUNT(DISTINCT source_type) AS distinct_source_types,
    ROUND(AVG(confidence_score), 2) AS avg_confidence_score,
    MAX(last_verified_at) AS latest_verification_timestamp
FROM public.ai_evidence_citations
GROUP BY facility_id;

CREATE OR REPLACE VIEW public.vw_ai_unverified_citations AS
SELECT 
    c.id,
    c.facility_id,
    c.citation_code,
    c.source_type,
    c.source_record_key,
    c.field_path,
    c.claimed_value,
    c.current_value,
    c.verification_status,
    c.last_verified_at,
    c.statement_context
FROM public.ai_evidence_citations c
WHERE c.verification_status IN ('DATA_DRIFT', 'UNVERIFIED', 'REVOKED');

-- Row-Level Security
ALTER TABLE public.ai_evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_evidence_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_explainability_traces ENABLE ROW LEVEL SECURITY;

-- Sources is a global reference table readable by all authenticated users
DROP POLICY IF EXISTS p_ai_evidence_sources_all ON public.ai_evidence_sources;
CREATE POLICY p_ai_evidence_sources_all ON public.ai_evidence_sources FOR ALL USING (true);

-- Citations tenancy policy
DROP POLICY IF EXISTS p_ai_evidence_citations_tenant ON public.ai_evidence_citations;
CREATE POLICY p_ai_evidence_citations_tenant ON public.ai_evidence_citations
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Explainability traces tenancy policy
DROP POLICY IF EXISTS p_ai_explainability_traces_tenant ON public.ai_explainability_traces;
CREATE POLICY p_ai_explainability_traces_tenant ON public.ai_explainability_traces
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Seed Canonical Evidence Sources
INSERT INTO public.ai_evidence_sources (source_type, display_name, description, source_table, primary_key_column, facility_fk_column, sensitivity_level)
VALUES 
    ('EHR_CASE', 'EHR Surgical Case Master', 'Primary clinical and operational surgical procedure record, operative times, and physician logs.', 'cases', 'id', 'facility_id', 'PHI_RESTRICTED'),
    ('CLAIM_837', 'Electronic 837 Claim File', 'Billed charges, line-level CPT codes, modifiers, and submission envelopes.', 'claims', 'id', 'facility_id', 'FINANCIAL'),
    ('REMITTANCE_835', 'ERA 835 Remittance Advice', 'Payer adjudication, line-item contractual allowances, paid amounts, and CARC/RARC codes.', 'payments', 'id', 'facility_id', 'FINANCIAL'),
    ('PAYER_CONTRACT', 'Payer Contract & Fee Schedule', 'Authoritative commercial and CMS negotiated base rates, multipliers, and carveout clauses.', 'payer_contracts', 'id', 'facility_id', 'FINANCIAL'),
    ('OR_LOG', 'Operating Room Sensor & Time Log', 'Operating room wheels-in/out timestamps, turnover durations, and staffed room availability.', 'operating_rooms', 'id', 'facility_id', 'INTERNAL'),
    ('IMPLANT_INVOICE', 'Implant Vendor Purchase Invoice', 'Sterile surgical supply usage, vendor SKU catalog pricing, and itemized purchase orders.', 'implant_usage', 'id', 'facility_id', 'FINANCIAL')
ON CONFLICT (source_type) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    source_table = EXCLUDED.source_table,
    sensitivity_level = EXCLUDED.sensitivity_level;
