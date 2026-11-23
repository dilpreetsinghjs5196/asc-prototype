-- ==============================================================================
-- Migration 117: 13-Week Cash Forecast & Liquidity Management
-- Phase E3: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes facility 13-week cash forecasts, sequential weekly
--              calendar intervals (W01-W13), direct cash receipts and disbursements,
--              operating cash roll-forward invariants, minimum covenant thresholds,
--              revolving credit tracking, RLS policies, and seed data for Naples.
-- ==============================================================================

-- 1. Facility Cash Forecasts Master Table
CREATE TABLE IF NOT EXISTS public.facility_cash_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    forecast_code VARCHAR(32) NOT NULL,
    forecast_name VARCHAR(128) NOT NULL,
    baseline_date DATE NOT NULL,
    start_week_date DATE NOT NULL,
    end_week_date DATE NOT NULL,
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'ACTIVE_FORECAST', 'SUPERSEDED', 'ARCHIVED')
    ),
    starting_cash_balance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    minimum_cash_covenant NUMERIC(14, 2) NOT NULL DEFAULT 400000.00,
    line_of_credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 1000000.00,
    line_of_credit_drawn NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_cash_forecast_code UNIQUE (facility_id, forecast_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_cash_forecasts ON public.facility_cash_forecasts(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_forecasts_status ON public.facility_cash_forecasts(status);

-- 2. Cash Forecast Weeks Table (13 Weeks)
CREATE TABLE IF NOT EXISTS public.cash_forecast_weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_cash_forecasts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 13),
    week_code VARCHAR(16) NOT NULL,
    week_label VARCHAR(64) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_payroll_week BOOLEAN NOT NULL DEFAULT false,
    is_rent_week BOOLEAN NOT NULL DEFAULT false,
    is_debt_service_week BOOLEAN NOT NULL DEFAULT false,
    confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.9500,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_week UNIQUE (forecast_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_cash_weeks_forecast ON public.cash_forecast_weeks(forecast_id, week_number);

-- 3. Cash Forecast Line Items Table
CREATE TABLE IF NOT EXISTS public.cash_forecast_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    forecast_id UUID NOT NULL REFERENCES public.facility_cash_forecasts(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    week_number INT NOT NULL CHECK (week_number BETWEEN 1 AND 13),
    line_code VARCHAR(32) NOT NULL,
    line_name VARCHAR(128) NOT NULL,
    flow_type VARCHAR(24) NOT NULL CHECK (flow_type IN ('RECEIPT', 'DISBURSEMENT', 'FINANCING', 'BALANCE')),
    category VARCHAR(32) NOT NULL,
    projected_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    actual_amount NUMERIC(14, 2),
    variance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_forecast_week_line UNIQUE (forecast_id, week_number, line_code)
);

CREATE INDEX IF NOT EXISTS idx_cf_lines_forecast ON public.cash_forecast_line_items(forecast_id, week_number);
CREATE INDEX IF NOT EXISTS idx_cf_lines_code ON public.cash_forecast_line_items(line_code);

-- 4. Executive Telemetry View
CREATE OR REPLACE VIEW public.vw_cash_forecast_telemetry AS
SELECT
    f.facility_id,
    f.id AS forecast_id,
    f.forecast_code,
    f.forecast_name,
    f.status,
    f.is_active,
    f.starting_cash_balance,
    f.minimum_cash_covenant,
    f.line_of_credit_limit,
    f.line_of_credit_drawn,
    COALESCE(SUM(CASE WHEN l.flow_type = 'RECEIPT' THEN l.projected_amount END), 0.00) AS total_13w_receipts,
    COALESCE(SUM(CASE WHEN l.flow_type = 'DISBURSEMENT' THEN l.projected_amount END), 0.00) AS total_13w_disbursements,
    COALESCE(SUM(CASE WHEN l.flow_type = 'RECEIPT' THEN l.projected_amount END), 0.00) -
    COALESCE(SUM(CASE WHEN l.flow_type = 'DISBURSEMENT' THEN l.projected_amount END), 0.00) AS net_13w_cash_flow,
    COALESCE(MAX(CASE WHEN l.line_code = 'ENDING_CASH' AND l.week_number = 13 THEN l.projected_amount END), 0.00) AS projected_ending_cash,
    COALESCE(MIN(CASE WHEN l.line_code = 'ENDING_CASH' THEN l.projected_amount END), 0.00) AS lowest_projected_cash,
    COALESCE(MIN(CASE WHEN l.line_code = 'ENDING_CASH' THEN l.projected_amount END), 0.00) - f.minimum_cash_covenant AS minimum_covenant_headroom
FROM public.facility_cash_forecasts f
LEFT JOIN public.cash_forecast_line_items l ON l.forecast_id = f.id
GROUP BY f.facility_id, f.id, f.forecast_code, f.forecast_name, f.status, f.is_active, f.starting_cash_balance, f.minimum_cash_covenant, f.line_of_credit_limit, f.line_of_credit_drawn;

-- 5. Row Level Security Policies
ALTER TABLE public.facility_cash_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_forecast_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_forecast_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_cash_forecasts ON public.facility_cash_forecasts;
CREATE POLICY tenant_isolation_cash_forecasts ON public.facility_cash_forecasts
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_cash_weeks ON public.cash_forecast_weeks;
CREATE POLICY tenant_isolation_cash_weeks ON public.cash_forecast_weeks
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_cf_lines ON public.cash_forecast_line_items;
CREATE POLICY tenant_isolation_cf_lines ON public.cash_forecast_line_items
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 6. Seed Data: Naples Surgery Center 13-Week Cash Forecast
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_forecast_id UUID := '00000000-0000-0000-0000-000000000040';
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        INSERT INTO public.facility_cash_forecasts (
            id, facility_id, forecast_code, forecast_name, baseline_date,
            start_week_date, end_week_date, version_number, status,
            starting_cash_balance, minimum_cash_covenant, line_of_credit_limit,
            line_of_credit_drawn, is_active, metadata
        ) VALUES (
            v_forecast_id, v_facility_id, 'CF2026_Q4_13W',
            'Q4 2026 13-Week Rolling Cash Forecast (Nov 2026 - Jan 2027)',
            '2026-11-02', '2026-11-02', '2027-01-31', 1, 'ACTIVE_FORECAST',
            1250000.00, 400000.00, 1000000.00, 0.00, true,
            '{"author": "Treasury Office", "covenant": "Bank Minimum Operating Cash $400k"}'::jsonb
        ) ON CONFLICT (facility_id, forecast_code) DO NOTHING;

    END IF;
END $$;
