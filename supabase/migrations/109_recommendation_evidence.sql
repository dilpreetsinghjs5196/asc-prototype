-- ==============================================================================
-- Migration 109: Recommendation Evidence Model & Provenance Chain
-- Phase D2: Module 13 Decision Intelligence
-- Description: Establishes granular evidence citations linking financial actions
--              to claims, remittances, contracts, and operative notes.
-- ==============================================================================

-- 1. Recommendation Evidence Items Table
CREATE TABLE IF NOT EXISTS public.recommendation_evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    evidence_type VARCHAR(32) NOT NULL CHECK (evidence_type IN (
        'CLAIM_LINE',
        'REMITTANCE_CARC',
        'PAYER_CONTRACT_CLAUSE',
        'CLINICAL_OPERATIVE_NOTE',
        'FEE_SCHEDULE_RULE',
        'BENCHMARK_VARIANCE'
    )),
    source_table VARCHAR(64) NOT NULL,
    source_record_id VARCHAR(64) NOT NULL,
    title VARCHAR(160) NOT NULL,
    citation_snippet TEXT NOT NULL,
    evidence_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_1_CONTRACTUAL' CHECK (confidence_tier IN (
        'TIER_1_CONTRACTUAL',
        'TIER_2_REMITTANCE_PRIMARY',
        'TIER_3_CLINICAL_DOCUMENTATION',
        'TIER_4_EMPIRICAL_BENCHMARK'
    )),
    confidence_score NUMERIC(5, 2) NOT NULL DEFAULT 95.00 CHECK (confidence_score >= 0.00 AND confidence_score <= 100.00),
    verification_status VARCHAR(24) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN (
        'VERIFIED',
        'PENDING_REVIEW',
        'CONTESTED',
        'SUPERSEDED'
    )),
    verified_by_user_id VARCHAR(64),
    verified_at TIMESTAMPTZ,
    cryptographic_evidence_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_action_source_evidence UNIQUE(action_id, evidence_type, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_evidence_action ON public.recommendation_evidence_items(action_id);
CREATE INDEX IF NOT EXISTS idx_rec_evidence_facility ON public.recommendation_evidence_items(facility_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_rec_evidence_type ON public.recommendation_evidence_items(evidence_type);

-- 2. Recommendation Evidence Audits Table (Immutable Ledger)
CREATE TABLE IF NOT EXISTS public.recommendation_evidence_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_item_id UUID NOT NULL REFERENCES public.recommendation_evidence_items(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID NOT NULL REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    previous_status VARCHAR(24) NOT NULL,
    new_status VARCHAR(24) NOT NULL,
    rationale TEXT NOT NULL,
    performed_by_user_id VARCHAR(64) NOT NULL,
    performed_by_name VARCHAR(128) NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_audits_item ON public.recommendation_evidence_audits(evidence_item_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_audits_facility ON public.recommendation_evidence_audits(facility_id, performed_at DESC);

-- 3. Evidence Summary Aggregation View
CREATE OR REPLACE VIEW public.vw_recommendation_evidence_summary AS
SELECT
    a.id AS action_id,
    a.facility_id,
    a.action_code,
    a.category,
    a.expected_financial_value,
    COUNT(e.id) AS total_evidence_items,
    COUNT(e.id) FILTER (WHERE e.verification_status = 'VERIFIED') AS verified_evidence_items,
    COUNT(e.id) FILTER (WHERE e.verification_status = 'CONTESTED') AS contested_evidence_items,
    COUNT(e.id) FILTER (WHERE e.evidence_type = 'CLAIM_LINE') AS claim_line_citations_count,
    COUNT(e.id) FILTER (WHERE e.evidence_type = 'PAYER_CONTRACT_CLAUSE') AS contract_clause_citations_count,
    COUNT(e.id) FILTER (WHERE e.evidence_type = 'REMITTANCE_CARC') AS remittance_carc_citations_count,
    COUNT(e.id) FILTER (WHERE e.evidence_type = 'CLINICAL_OPERATIVE_NOTE') AS clinical_note_citations_count,
    COALESCE(ROUND(AVG(e.confidence_score), 1), 0.0) AS avg_evidence_confidence,
    MAX(e.updated_at) AS latest_evidence_updated_at
FROM public.next_best_financial_actions a
LEFT JOIN public.recommendation_evidence_items e ON a.id = e.action_id
GROUP BY a.id, a.facility_id, a.action_code, a.category, a.expected_financial_value;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.recommendation_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_evidence_audits ENABLE ROW LEVEL SECURITY;

-- 5. Tenancy Isolation Policies (Idempotent)
DROP POLICY IF EXISTS recommendation_evidence_items_facility_isolation ON public.recommendation_evidence_items;
CREATE POLICY recommendation_evidence_items_facility_isolation ON public.recommendation_evidence_items
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    );

DROP POLICY IF EXISTS recommendation_evidence_audits_facility_isolation ON public.recommendation_evidence_audits;
CREATE POLICY recommendation_evidence_audits_facility_isolation ON public.recommendation_evidence_audits
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
        OR current_setting('app.current_user_role', true) IN ('super_admin', 'org_admin')
    );
