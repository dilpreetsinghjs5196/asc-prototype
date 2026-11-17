-- ==============================================================================
-- Migration: 096_cpt_denial_and_payment_performance.sql
-- Phase B7: CPT Denial Patterns, Payment Speed, Underpayment, and Payer Variation
-- Module: Module 11: Surgeon & Clinical Intelligence / Executive Intelligence
-- Description: Establishes CPT procedural denial and payment performance metrics,
--              CARC/RARC root-cause breakdowns, payer payment velocity variations,
--              analytical views, indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. CPT Denial and Payment Performance Metrics Table
CREATE TABLE IF NOT EXISTS public.cpt_denial_payment_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    total_billed_claims INTEGER NOT NULL DEFAULT 0,
    clean_claims_count INTEGER NOT NULL DEFAULT 0,
    clean_claim_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    first_pass_denied_claims INTEGER NOT NULL DEFAULT 0,
    first_pass_denial_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    avg_days_to_pay NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    appealed_claims_count INTEGER NOT NULL DEFAULT 0,
    overturned_claims_count INTEGER NOT NULL DEFAULT 0,
    overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    overturned_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    underpaid_claims_count INTEGER NOT NULL DEFAULT 0,
    underpayment_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    underpayment_variance_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    aged_ar_over_90_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    payment_velocity_index NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
    performance_tier VARCHAR(32) NOT NULL DEFAULT 'ACCEPTABLE_FLOW', -- 'EXCELLENT_FLOW', 'ACCEPTABLE_FLOW', 'FRICTION_AT_RISK', 'CHRONIC_DENIAL_SINK'
    primary_carc_code VARCHAR(16),
    primary_carc_description VARCHAR(256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cpt_denial_payment_facility UNIQUE (facility_id, cpt_code)
);

-- 2. CPT CARC Denial Root-Cause Breakdown Table
CREATE TABLE IF NOT EXISTS public.cpt_carc_denial_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    carc_code VARCHAR(16) NOT NULL,
    carc_category VARCHAR(64) NOT NULL, -- 'MEDICAL_NECESSITY', 'AUTHORIZATION', 'BUNDLING_CCI', 'DOCUMENTATION', 'FEE_SCHEDULE', 'DUPLICATE'
    carc_description TEXT NOT NULL,
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    denied_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    preventable_by_scrubber BOOLEAN NOT NULL DEFAULT false,
    recommended_scrubber_rule VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CPT Payer Payment Velocity & Variation Table
CREATE TABLE IF NOT EXISTS public.cpt_payer_payment_velocity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    payer_code VARCHAR(64) NOT NULL,
    payer_name VARCHAR(256) NOT NULL,
    claims_count INTEGER NOT NULL DEFAULT 0,
    denial_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    avg_days_to_pay NUMERIC(6, 1) NOT NULL DEFAULT 0.0,
    underpayment_variance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    overturn_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_cpt_denial_velocity_summary AS
SELECT
    facility_id,
    specialty,
    COUNT(DISTINCT cpt_code) AS procedure_count,
    SUM(total_billed_claims) AS total_billed_claims,
    ROUND(AVG(clean_claim_rate), 2) AS avg_clean_claim_rate,
    ROUND(AVG(first_pass_denial_rate), 2) AS avg_denial_rate,
    ROUND(AVG(avg_days_to_pay), 1) AS avg_days_to_pay,
    SUM(underpayment_variance_dollars) AS total_underpayment_variance,
    ROUND(AVG(overturn_rate_pct), 2) AS avg_overturn_rate
FROM public.cpt_denial_payment_metrics
GROUP BY facility_id, specialty;

CREATE OR REPLACE VIEW public.vw_cpt_underpayment_leakage_radar AS
SELECT
    id,
    facility_id,
    cpt_code,
    procedure_name,
    specialty,
    total_billed_claims,
    first_pass_denial_rate,
    avg_days_to_pay,
    underpayment_rate_pct,
    underpayment_variance_dollars,
    payment_velocity_index,
    performance_tier,
    primary_carc_code
FROM public.cpt_denial_payment_metrics
WHERE underpayment_variance_dollars > 0 OR first_pass_denial_rate > 8.0;

-- 5. Indexes for Query Performance
CREATE INDEX IF NOT EXISTS idx_cpt_denial_facility ON public.cpt_denial_payment_metrics(facility_id);
CREATE INDEX IF NOT EXISTS idx_cpt_denial_code ON public.cpt_denial_payment_metrics(cpt_code);
CREATE INDEX IF NOT EXISTS idx_cpt_denial_tier ON public.cpt_denial_payment_metrics(performance_tier);
CREATE INDEX IF NOT EXISTS idx_cpt_denial_specialty ON public.cpt_denial_payment_metrics(specialty);
CREATE INDEX IF NOT EXISTS idx_cpt_carc_code ON public.cpt_carc_denial_reasons(cpt_code, carc_code);
CREATE INDEX IF NOT EXISTS idx_cpt_payer_velocity_code ON public.cpt_payer_payment_velocity(cpt_code, payer_code);

-- 6. Multi-Tenancy Row Level Security (RLS)
ALTER TABLE public.cpt_denial_payment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_carc_denial_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_payer_payment_velocity ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_cpt_denial_payment_metrics_facility ON public.cpt_denial_payment_metrics
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_cpt_carc_denial_reasons_facility ON public.cpt_carc_denial_reasons
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_cpt_payer_payment_velocity_facility ON public.cpt_payer_payment_velocity
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );
