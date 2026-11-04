-- ==============================================================================
-- MIGRATION: 053_financial_calculation_versioning.sql
-- PHASE: 77 — Financial Calculation Versioning & Freeze Engine
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Financial Calculation Versions Table
CREATE TABLE IF NOT EXISTS public.financial_calculation_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    version_code VARCHAR(32) NOT NULL,
    version_name VARCHAR(128) NOT NULL,
    description TEXT,
    settings_id UUID REFERENCES public.facility_financial_settings(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('DRAFT', 'ACTIVE', 'FROZEN', 'SUPERSEDED', 'DEPRECATED')
    ),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by UUID REFERENCES auth.users(id),
    lock_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_facility_version_code UNIQUE (facility_id, version_code)
);

CREATE INDEX IF NOT EXISTS idx_calc_ver_facility ON public.financial_calculation_versions(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_calc_ver_dates ON public.financial_calculation_versions(facility_id, effective_from, effective_to);

-- 2. Accounting Period Freezes Table
CREATE TABLE IF NOT EXISTS public.accounting_period_freezes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    period_name VARCHAR(64) NOT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    calculation_version_id UUID NOT NULL REFERENCES public.financial_calculation_versions(id) ON DELETE RESTRICT,
    freeze_status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (
        freeze_status IN ('OPEN', 'PENDING_APPROVAL', 'FROZEN', 'REOPENED_AUDIT')
    ),
    total_cases_frozen INTEGER NOT NULL DEFAULT 0 CHECK (total_cases_frozen >= 0),
    total_frozen_revenue NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_frozen_direct_costs NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_frozen_contribution_margin NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    frozen_at TIMESTAMPTZ,
    frozen_by UUID REFERENCES auth.users(id),
    unfrozen_at TIMESTAMPTZ,
    unfrozen_by UUID REFERENCES auth.users(id),
    unfreeze_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT uq_facility_period_name UNIQUE (facility_id, period_name)
);

CREATE INDEX IF NOT EXISTS idx_period_freezes_fac ON public.accounting_period_freezes(facility_id, freeze_status);
CREATE INDEX IF NOT EXISTS idx_period_freezes_dates ON public.accounting_period_freezes(facility_id, period_start_date, period_end_date);

-- 3. Financial Recalculation Runs Table
CREATE TABLE IF NOT EXISTS public.financial_recalculation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    run_type VARCHAR(32) NOT NULL CHECK (
        run_type IN ('PRODUCTION_POST', 'DRY_RUN_SIMULATION', 'AUDIT_BENCHMARK', 'HISTORICAL_RESTATEMENT')
    ),
    source_version_id UUID REFERENCES public.financial_calculation_versions(id) ON DELETE SET NULL,
    target_version_id UUID REFERENCES public.financial_calculation_versions(id) ON DELETE SET NULL,
    cases_evaluated INTEGER NOT NULL DEFAULT 0 CHECK (cases_evaluated >= 0),
    total_baseline_margin NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_recalculated_margin NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    margin_variance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    variance_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_by UUID REFERENCES auth.users(id),
    run_summary JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recalc_runs_fac ON public.financial_recalculation_runs(facility_id, executed_at DESC);

-- 4. Rollup View: Accounting Period Freeze Status
CREATE OR REPLACE VIEW public.vw_accounting_period_freeze_status AS
SELECT
    apf.id,
    apf.facility_id,
    apf.period_name,
    apf.period_start_date,
    apf.period_end_date,
    apf.freeze_status,
    fcv.version_code,
    fcv.version_name,
    apf.total_cases_frozen,
    apf.total_frozen_revenue,
    apf.total_frozen_direct_costs,
    apf.total_frozen_contribution_margin,
    apf.frozen_at,
    apf.frozen_by,
    apf.unfreeze_reason
FROM public.accounting_period_freezes apf
JOIN public.financial_calculation_versions fcv ON fcv.id = apf.calculation_version_id;

-- 5. Rollup View: Calculation Version Inventory
CREATE OR REPLACE VIEW public.vw_calculation_version_inventory AS
SELECT
    v.id,
    v.facility_id,
    v.version_code,
    v.version_name,
    v.status,
    v.effective_from,
    v.effective_to,
    v.is_locked,
    v.locked_at,
    v.lock_rationale,
    s.schedule_name AS baseline_cost_schedule_name,
    s.or_minute_rate,
    s.default_labor_burden_multiplier,
    COUNT(apf.id) AS total_periods_frozen_using_version
FROM public.financial_calculation_versions v
LEFT JOIN public.facility_financial_settings s ON s.id = v.settings_id
LEFT JOIN public.accounting_period_freezes apf ON apf.calculation_version_id = v.id AND apf.freeze_status = 'FROZEN'
GROUP BY
    v.id,
    v.facility_id,
    v.version_code,
    v.version_name,
    v.status,
    v.effective_from,
    v.effective_to,
    v.is_locked,
    v.locked_at,
    v.lock_rationale,
    s.schedule_name,
    s.or_minute_rate,
    s.default_labor_burden_multiplier;

-- 6. Row-Level Security (RLS)
ALTER TABLE public.financial_calculation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_period_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_recalculation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY calc_versions_select_policy ON public.financial_calculation_versions
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY calc_versions_insert_policy ON public.financial_calculation_versions
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY period_freezes_select_policy ON public.accounting_period_freezes
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY period_freezes_insert_policy ON public.accounting_period_freezes
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY recalc_runs_select_policy ON public.financial_recalculation_runs
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY recalc_runs_insert_policy ON public.financial_recalculation_runs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));

