-- ==============================================================================
-- Migration: 089_surgeon_intelligence.sql
-- Phase B0: Surgeon Intelligence Framework
-- Module: Module 11: Surgeon & Clinical Intelligence
-- Description: Creates surgeon intelligence profiles, anomaly alerts, specialty
--              benchmarks, analytical summary views, and multi-tenant RLS.
-- ==============================================================================

-- 1. Surgeon Intelligence Profiles Table
CREATE TABLE IF NOT EXISTS public.surgeon_intelligence_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    evaluation_period_start DATE NOT NULL,
    evaluation_period_end DATE NOT NULL,
    composite_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    performance_tier VARCHAR(32) NOT NULL DEFAULT 'CORE_PERFORMER', -- 'PINNACLE', 'CORE_PERFORMER', 'OPPORTUNITY', 'AT_RISK'
    financial_yield_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    or_efficiency_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    block_utilization_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    clinical_quality_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    supply_discipline_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_cases_performed INTEGER NOT NULL DEFAULT 0,
    total_or_minutes INTEGER NOT NULL DEFAULT 0,
    net_collections NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_contribution_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    first_case_ontime_start_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    avg_turnover_minutes NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    block_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    late_cancellation_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    supply_cost_variance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_surgeon_eval_period UNIQUE (facility_id, surgeon_id, evaluation_period_start, evaluation_period_end)
);

-- 2. Surgeon Intelligence Operational Alerts Table
CREATE TABLE IF NOT EXISTS public.surgeon_intelligence_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL REFERENCES public.surgeons(id) ON DELETE CASCADE,
    alert_type VARCHAR(64) NOT NULL, -- 'VOLUME_CHURN_RISK', 'CHRONIC_START_DELAY', 'SUPPLY_COST_OUTLIER', 'BLOCK_UNDERUTILIZATION', 'EXCESSIVE_TURNOVER'
    severity VARCHAR(16) NOT NULL DEFAULT 'WARNING', -- 'INFO', 'WARNING', 'CRITICAL'
    metric_name VARCHAR(64) NOT NULL,
    observed_value NUMERIC(10, 2) NOT NULL,
    benchmark_threshold NUMERIC(10, 2) NOT NULL,
    variance_pct NUMERIC(6, 2) NOT NULL,
    alert_message TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    resolution_status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_REVIEW', 'ACTION_TAKEN', 'DISMISSED'
    resolved_by_user_id UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Surgeon Specialty Benchmarks Table
CREATE TABLE IF NOT EXISTS public.surgeon_intelligence_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(64) NOT NULL,
    benchmark_year INTEGER NOT NULL DEFAULT 2026,
    target_margin_per_hour NUMERIC(10, 2) NOT NULL DEFAULT 1500.00,
    target_ontime_start_pct NUMERIC(5, 2) NOT NULL DEFAULT 85.00,
    target_turnover_same_surgeon INTEGER NOT NULL DEFAULT 25,
    target_turnover_diff_surgeon INTEGER NOT NULL DEFAULT 40,
    target_block_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 75.00,
    max_acceptable_cancel_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    max_supply_variance_pct NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_specialty_benchmark UNIQUE (facility_id, specialty_code, benchmark_year)
);

-- 4. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_sip_facility_surgeon ON public.surgeon_intelligence_profiles (facility_id, surgeon_id);
CREATE INDEX IF NOT EXISTS idx_sip_tier ON public.surgeon_intelligence_profiles (facility_id, performance_tier);
CREATE INDEX IF NOT EXISTS idx_sia_facility_status ON public.surgeon_intelligence_alerts (facility_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_sia_surgeon ON public.surgeon_intelligence_alerts (surgeon_id, alert_type);

-- 5. Analytical Summary Views
CREATE OR REPLACE VIEW public.vw_surgeon_intelligence_summary AS
SELECT
    p.id AS profile_id,
    p.facility_id,
    p.surgeon_id,
    s.firstname,
    s.lastname,
    CONCAT(s.firstname, ' ', s.lastname) AS surgeon_full_name,
    s.specialty,
    s.license_number,
    p.evaluation_period_start,
    p.evaluation_period_end,
    p.composite_score,
    p.performance_tier,
    p.financial_yield_score,
    p.or_efficiency_score,
    p.block_utilization_score,
    p.clinical_quality_score,
    p.supply_discipline_score,
    p.total_cases_performed,
    p.total_or_minutes,
    p.net_collections,
    p.total_contribution_margin,
    p.margin_per_or_hour,
    p.first_case_ontime_start_pct,
    p.avg_turnover_minutes,
    p.block_utilization_pct,
    p.late_cancellation_rate,
    p.supply_cost_variance_pct,
    p.is_active,
    p.updated_at
FROM public.surgeon_intelligence_profiles p
JOIN public.surgeons s ON s.id = p.surgeon_id;

CREATE OR REPLACE VIEW public.vw_surgeon_intelligence_active_alerts AS
SELECT
    a.id AS alert_id,
    a.facility_id,
    a.surgeon_id,
    CONCAT(s.firstname, ' ', s.lastname) AS surgeon_full_name,
    s.specialty,
    a.alert_type,
    a.severity,
    a.metric_name,
    a.observed_value,
    a.benchmark_threshold,
    a.variance_pct,
    a.alert_message,
    a.recommended_action,
    a.resolution_status,
    a.created_at
FROM public.surgeon_intelligence_alerts a
JOIN public.surgeons s ON s.id = a.surgeon_id
WHERE a.resolution_status IN ('OPEN', 'IN_REVIEW');

-- 6. Multi-Tenant Row Level Security (RLS)
ALTER TABLE public.surgeon_intelligence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_intelligence_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_intelligence_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_surgeon_intelligence_profiles_facility ON public.surgeon_intelligence_profiles
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_surgeon_intelligence_alerts_facility ON public.surgeon_intelligence_alerts
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_surgeon_intelligence_benchmarks_facility ON public.surgeon_intelligence_benchmarks
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
