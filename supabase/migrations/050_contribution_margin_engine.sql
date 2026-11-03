-- ==============================================================================
-- MIGRATION: 050_contribution_margin_engine.sql
-- PHASE: 74 — Contribution Margin Engine & Deterministic Profitability Analytics
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Case Contribution Margin Snapshots Table (Version-Locked Margin Records)
CREATE TABLE IF NOT EXISTS public.case_contribution_margin_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    calculation_version VARCHAR(16) NOT NULL DEFAULT '2026.1',
    gross_billed_charges NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_contract_allowable NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_net_collections NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_direct_costs NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_indirect_overhead NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_contribution_margin NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    actual_contribution_margin NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_margin_percentage NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    actual_margin_percentage NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    margin_leakage_variance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    breakeven_revenue_threshold NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    profitability_tier VARCHAR(24) NOT NULL DEFAULT 'TARGET' CHECK (
        profitability_tier IN ('HIGH_MARGIN', 'TARGET', 'MARGINAL', 'NEGATIVE_MARGIN')
    ),
    completeness_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETE' CHECK (
        completeness_status IN ('COMPLETE', 'PARTIALLY_COMPLETE', 'ESTIMATED', 'PENDING_VERIFICATION', 'MISSING_SOURCE_DATA', 'RATE_NOT_FOUND')
    ),
    is_provisional BOOLEAN NOT NULL DEFAULT FALSE,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    calculated_by UUID REFERENCES auth.users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_margin_snapshots_surgery ON public.case_contribution_margin_snapshots(surgery_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_margin_snapshots_facility ON public.case_contribution_margin_snapshots(facility_id, profitability_tier);
CREATE INDEX IF NOT EXISTS idx_margin_snapshots_tier ON public.case_contribution_margin_snapshots(profitability_tier, expected_margin_percentage DESC);

-- 2. Rollup View: Case Profitability Matrix (Aggregated by Surgeon, Specialty & Payer)
CREATE OR REPLACE VIEW public.vw_case_profitability_matrix AS
SELECT
    m.facility_id,
    s.surgeon_id,
    COALESCE(su.name, 'Unassigned Surgeon') AS surgeon_name,
    COALESCE(s.specialty, 'General') AS specialty,
    COALESCE(s.payer_name, 'Self-Pay / Other') AS payer_name,
    COUNT(m.id) AS total_cases_evaluated,
    SUM(m.gross_billed_charges) AS total_gross_billed,
    SUM(m.expected_contract_allowable) AS total_expected_allowable,
    SUM(m.total_net_collections) AS total_net_collected,
    SUM(m.total_direct_costs) AS total_direct_costs,
    SUM(m.expected_contribution_margin) AS total_expected_margin,
    SUM(m.actual_contribution_margin) AS total_actual_margin,
    ROUND(
        AVG(CASE WHEN m.expected_contract_allowable > 0 
            THEN (m.expected_contribution_margin / m.expected_contract_allowable) * 100.00 
            ELSE 0.00 END), 
        2
    ) AS avg_expected_margin_pct,
    SUM(CASE WHEN m.expected_contribution_margin < 0 THEN 1 ELSE 0 END) AS negative_margin_case_count,
    BOOL_AND(NOT m.is_provisional) AS all_cases_fully_verified
FROM public.case_contribution_margin_snapshots m
JOIN public.surgeries s ON s.id = m.surgery_id
LEFT JOIN public.surgeons su ON su.id = s.surgeon_id
GROUP BY m.facility_id, s.surgeon_id, su.name, s.specialty, s.payer_name;

-- 3. Row-Level Security (RLS)
ALTER TABLE public.case_contribution_margin_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_margins_select_policy ON public.case_contribution_margin_snapshots
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY case_margins_insert_policy ON public.case_contribution_margin_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));
