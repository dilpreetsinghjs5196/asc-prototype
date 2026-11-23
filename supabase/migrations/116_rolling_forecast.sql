-- ==============================================================================
-- Migration 116: Rolling Forecast & Continuous Projections
-- Phase E2: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes facility rolling forecast plans, sequential horizon
--              periods (12-month forward trajectory), line-item multi-scenario
--              projections (Baseline, Optimistic, Conservative), forecasting
--              methods, telemetry view, RLS policies, and seed data for Naples.
-- ==============================================================================

-- 1. Facility Rolling Forecasts Master Table
CREATE TABLE IF NOT EXISTS public.facility_rolling_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    forecast_code VARCHAR(32) NOT NULL,
    forecast_name VARCHAR(128) NOT NULL,
    horizon_type VARCHAR(24) NOT NULL DEFAULT '12_MONTH' CHECK (
        horizon_type IN ('3_MONTH', '6_MONTH', '12_MONTH', '4_QUARTER')
    ),
    baseline_period_code VARCHAR(16) NOT NULL,
    primary_method VARCHAR(32) NOT NULL DEFAULT 'BLENDED_COMPOSITE' CHECK (
        primary_method IN ('T3M_RUN_RATE', 'SEASONAL_INDEX', 'CAPACITY_PIPELINE', 'SCHEDULED_BACKLOG', 'BLENDED_COMPOSITE')
    ),
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'ACTIVE_PROJECTION', 'SUPERSEDED', 'ARCHIVED')
    ),
    start_period_code VARCHAR(16) NOT NULL,
    end_period_code VARCHAR(16) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_forecast_code UNIQUE (facility_id, forecast_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_forecasts_facility ON public.facility_rolling_forecasts(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facility_forecasts_status ON public.facility_rolling_forecasts(status);

-- 2. Rolling Forecast Periods Table
CREATE TABLE IF NOT EXISTS public.rolling_forecast_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_rolling_forecasts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    period_name VARCHAR(64) NOT NULL,
    sequence_order INT NOT NULL CHECK (sequence_order BETWEEN 1 AND 24),
    calendar_year INT NOT NULL,
    calendar_month INT NOT NULL CHECK (calendar_month BETWEEN 1 AND 12),
    quarter_code VARCHAR(16) NOT NULL,
    seasonality_index NUMERIC(5, 4) NOT NULL DEFAULT 1.0000,
    working_days INT NOT NULL DEFAULT 21,
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9500,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_period UNIQUE (forecast_id, period_code)
);

CREATE INDEX IF NOT EXISTS idx_rf_periods_forecast ON public.rolling_forecast_periods(forecast_id, sequence_order);

-- 3. Rolling Forecast Line Items Table
CREATE TABLE IF NOT EXISTS public.rolling_forecast_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_rolling_forecasts(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES public.rolling_forecast_periods(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    line_code VARCHAR(32) NOT NULL,
    line_name VARCHAR(128) NOT NULL,
    account_category VARCHAR(32) NOT NULL CHECK (account_category IN (
        'VOLUME',
        'GROSS_REVENUE',
        'CONTRACTUAL_DEDUCTION',
        'NET_REVENUE',
        'DIRECT_COST',
        'VARIABLE_COST',
        'FIXED_OVERHEAD',
        'MARGIN'
    )),
    baseline_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    optimistic_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    conservative_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    method_used VARCHAR(32) NOT NULL DEFAULT 'BLENDED_COMPOSITE',
    unit_benchmark_rate NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variance_vs_annual_budget NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_period_line UNIQUE (forecast_id, period_code, line_code)
);

CREATE INDEX IF NOT EXISTS idx_rf_lines_forecast ON public.rolling_forecast_line_items(forecast_id, period_code);
CREATE INDEX IF NOT EXISTS idx_rf_lines_code ON public.rolling_forecast_line_items(line_code);

-- 4. Rolling Forecast Methods Configuration Table
CREATE TABLE IF NOT EXISTS public.rolling_forecast_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    method_code VARCHAR(32) NOT NULL,
    method_name VARCHAR(128) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_method_code UNIQUE (facility_id, method_code)
);

-- 5. Executive Telemetry View
CREATE OR REPLACE VIEW public.vw_rolling_forecast_telemetry AS
SELECT
    f.facility_id,
    f.id AS forecast_id,
    f.forecast_code,
    f.forecast_name,
    f.horizon_type,
    f.baseline_period_code,
    f.primary_method,
    f.status,
    f.is_active,
    f.start_period_code,
    f.end_period_code,
    COALESCE(SUM(CASE WHEN l.line_code = 'NPR' THEN l.baseline_amount END), 0.00) AS projected_12m_npr,
    COALESCE(SUM(CASE WHEN l.line_code = 'EBITDA' THEN l.baseline_amount END), 0.00) AS projected_12m_ebitda,
    COALESCE(SUM(CASE WHEN l.line_code = 'CASE_VOLUME' THEN l.baseline_amount END), 0.00) AS projected_12m_case_volume,
    COALESCE(SUM(CASE WHEN l.line_code = 'DIR_COSTS' THEN l.baseline_amount END), 0.00) AS projected_12m_direct_costs,
    COALESCE(AVG(p.confidence_score), 0.0000) AS avg_confidence_score,
    COUNT(DISTINCT p.period_code) AS horizon_period_count
FROM public.facility_rolling_forecasts f
JOIN public.rolling_forecast_periods p ON p.forecast_id = f.id
JOIN public.rolling_forecast_line_items l ON l.forecast_id = f.id AND l.period_code = p.period_code
GROUP BY f.facility_id, f.id, f.forecast_code, f.forecast_name, f.horizon_type, f.baseline_period_code, f.primary_method, f.status, f.is_active, f.start_period_code, f.end_period_code;

-- 6. Row Level Security Policies
ALTER TABLE public.facility_rolling_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolling_forecast_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolling_forecast_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rolling_forecast_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_rolling_forecasts ON public.facility_rolling_forecasts;
CREATE POLICY tenant_isolation_rolling_forecasts ON public.facility_rolling_forecasts
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_rf_periods ON public.rolling_forecast_periods;
CREATE POLICY tenant_isolation_rf_periods ON public.rolling_forecast_periods
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_rf_lines ON public.rolling_forecast_line_items;
CREATE POLICY tenant_isolation_rf_lines ON public.rolling_forecast_line_items
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_rf_methods ON public.rolling_forecast_methods;
CREATE POLICY tenant_isolation_rf_methods ON public.rolling_forecast_methods
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 7. Seed Data: Naples Surgery Center 12-Month Rolling Forecast
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_forecast_id UUID := '00000000-0000-0000-0000-000000000030';
    v_period_id UUID;
    v_period RECORD;
BEGIN
    -- Only seed if Naples facility exists in facilities table
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        -- Insert Forecast Plan Master
        INSERT INTO public.facility_rolling_forecasts (
            id, facility_id, forecast_code, forecast_name, horizon_type,
            baseline_period_code, primary_method, version_number, status,
            start_period_code, end_period_code, is_active, metadata
        ) VALUES (
            v_forecast_id, v_facility_id, 'RF2026_12M_BASE',
            '12-Month Rolling Operating Forecast (Nov 2026 - Oct 2027)',
            '12_MONTH', '2026-M10', 'BLENDED_COMPOSITE', 1, 'ACTIVE_PROJECTION',
            '2026-M11', '2027-M10', true,
            '{"author": "CFO Office", "methodology": "Blended 40% Backlog / 35% Seasonal / 25% T3M"}'::jsonb
        ) ON CONFLICT (facility_id, forecast_code) DO NOTHING;

        -- Insert Methods Configuration
        INSERT INTO public.rolling_forecast_methods (facility_id, method_code, method_name, parameters)
        VALUES 
            (v_facility_id, 'T3M_RUN_RATE', 'Trailing 3-Month Moving Average', '{"weights": {"m1": 0.50, "m2": 0.30, "m3": 0.20}}'::jsonb),
            (v_facility_id, 'SEASONAL_INDEX', 'ASC Empirical Seasonal Index', '{"q1": 0.92, "q2": 1.02, "q3": 0.97, "q4": 1.13}'::jsonb),
            (v_facility_id, 'CAPACITY_PIPELINE', 'OR Capacity-Constrained Pipeline', '{"or_rooms": 4, "days_per_month": 21, "hours_per_day": 9, "utilization_target": 0.78, "avg_case_minutes": 76}'::jsonb),
            (v_facility_id, 'BLENDED_COMPOSITE', 'CFO Blended Multi-Method Ensemble', '{"weights": {"backlog": 0.40, "seasonal": 0.35, "run_rate": 0.25}}'::jsonb)
        ON CONFLICT (facility_id, method_code) DO NOTHING;

    END IF;
END $$;
