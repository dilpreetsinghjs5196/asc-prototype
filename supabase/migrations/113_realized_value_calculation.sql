-- ==============================================================================
-- Migration 113: Realized Value Calculation & Multi-Pillar ROI Engine
-- Phase D6: Module 13 Decision Intelligence
-- Description: Quantifies realized economic value across Recovered Revenue,
--              Direct Savings, Capacity Value, and Avoided Costs net of labor.
-- ==============================================================================

-- 1. Realized Value Calculations Table (4-Pillar Economic Summary)
CREATE TABLE IF NOT EXISTS public.realized_value_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    action_id UUID REFERENCES public.next_best_financial_actions(id) ON DELETE CASCADE,
    ledger_entry_id UUID REFERENCES public.decision_ledger_entries(id) ON DELETE SET NULL,
    calculation_code VARCHAR(32) NOT NULL UNIQUE,
    action_code VARCHAR(32) NOT NULL,
    category VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    value_pillar VARCHAR(32) NOT NULL CHECK (value_pillar IN (
        'RECOVERED_REVENUE',
        'DIRECT_SAVINGS',
        'CAPACITY_VALUE',
        'AVOIDED_COST'
    )),
    recovered_revenue_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (recovered_revenue_amount >= 0),
    direct_savings_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (direct_savings_amount >= 0),
    capacity_value_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (capacity_value_amount >= 0),
    avoided_cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (avoided_cost_amount >= 0),
    gross_realized_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    intervention_labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (intervention_labor_cost >= 0),
    net_realized_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    roi_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1.00,
    capacity_hours_freed NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    capacity_cm_per_hour NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avoided_risk_type VARCHAR(64),
    calculation_provenance_hash VARCHAR(64) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_by_user_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rvc_facility ON public.realized_value_calculations(facility_id, value_pillar);
CREATE INDEX IF NOT EXISTS idx_rvc_action ON public.realized_value_calculations(action_id);
CREATE INDEX IF NOT EXISTS idx_rvc_category ON public.realized_value_calculations(category);
CREATE INDEX IF NOT EXISTS idx_rvc_code ON public.realized_value_calculations(calculation_code);

-- 2. Realized Value Line Items Table (Granular Audit Breakdown)
CREATE TABLE IF NOT EXISTS public.realized_value_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calculation_id UUID NOT NULL REFERENCES public.realized_value_calculations(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_item_name VARCHAR(128) NOT NULL,
    pillar VARCHAR(32) NOT NULL CHECK (pillar IN (
        'RECOVERED_REVENUE',
        'DIRECT_SAVINGS',
        'CAPACITY_VALUE',
        'AVOIDED_COST',
        'INTERVENTION_COST'
    )),
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    source_table VARCHAR(64),
    source_record_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rv_items_calculation ON public.realized_value_line_items(calculation_id);
CREATE INDEX IF NOT EXISTS idx_rv_items_facility ON public.realized_value_line_items(facility_id);

-- 3. Telemetry View
CREATE OR REPLACE VIEW public.vw_realized_value_telemetry AS
SELECT
    facility_id,
    COUNT(id) AS total_calculations_count,
    COALESCE(SUM(gross_realized_value), 0.00) AS total_gross_realized_value,
    COALESCE(SUM(recovered_revenue_amount), 0.00) AS total_recovered_revenue_amount,
    COALESCE(SUM(direct_savings_amount), 0.00) AS total_direct_savings_amount,
    COALESCE(SUM(capacity_value_amount), 0.00) AS total_capacity_value_amount,
    COALESCE(SUM(avoided_cost_amount), 0.00) AS total_avoided_cost_amount,
    COALESCE(SUM(intervention_labor_cost), 0.00) AS total_intervention_labor_cost,
    COALESCE(SUM(net_realized_value), 0.00) AS total_net_realized_value,
    COALESCE(SUM(capacity_hours_freed), 0.00) AS total_capacity_hours_freed,
    CASE 
        WHEN COALESCE(SUM(intervention_labor_cost), 0.00) > 0 
        THEN ROUND((COALESCE(SUM(net_realized_value), 0.00) / SUM(intervention_labor_cost)), 2)
        ELSE ROUND(COALESCE(SUM(gross_realized_value), 0.00) / 1000.0, 2)
    END AS cumulative_roi_multiplier,
    MAX(updated_at) AS latest_calculation_at
FROM public.realized_value_calculations
GROUP BY facility_id;

-- 4. Enable Row-Level Security
ALTER TABLE public.realized_value_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realized_value_line_items ENABLE ROW LEVEL SECURITY;

-- 5. Row-Level Security Policies (with idempotent DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS realized_value_calculations_facility_isolation ON public.realized_value_calculations;
CREATE POLICY realized_value_calculations_facility_isolation ON public.realized_value_calculations
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS realized_value_line_items_facility_isolation ON public.realized_value_line_items;
CREATE POLICY realized_value_line_items_facility_isolation ON public.realized_value_line_items
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );
