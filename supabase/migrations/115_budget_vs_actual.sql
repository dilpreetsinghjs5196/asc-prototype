-- ==============================================================================
-- Migration 115: Budget vs. Actual & Variance Reporting
-- Phase E1: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes facility annual budget models, versioning, line-item
--              target allocations, deterministic 3-way variance decomposition
--              (volume, rate, mix), severity tiers, and cryptographic budget freeze.
-- ==============================================================================

-- 1. Facility Budgets Master Table
CREATE TABLE IF NOT EXISTS public.facility_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    budget_code VARCHAR(32) NOT NULL,
    budget_name VARCHAR(128) NOT NULL,
    fiscal_year INT NOT NULL CHECK (fiscal_year BETWEEN 2020 AND 2050),
    version_number INT NOT NULL DEFAULT 1,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED_ACTIVE', 'SUPERSEDED', 'ARCHIVED')
    ),
    effective_start_date DATE NOT NULL,
    effective_end_date DATE NOT NULL,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_budget_code UNIQUE (facility_id, budget_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_budgets_facility ON public.facility_budgets(facility_id, fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_facility_budgets_status ON public.facility_budgets(status);

-- 2. Budget Line Items Target Table
CREATE TABLE IF NOT EXISTS public.budget_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.facility_budgets(id) ON DELETE CASCADE,
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
    unit_of_measure VARCHAR(24) NOT NULL DEFAULT 'CURRENCY' CHECK (
        unit_of_measure IN ('CURRENCY', 'CASES', 'MINUTES', 'RATIO_PERCENT')
    ),
    target_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    target_unit_rate NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    calculation_formula TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_budget_period_line UNIQUE (budget_id, period_code, line_code)
);

CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON public.budget_line_items(budget_id, period_code);
CREATE INDEX IF NOT EXISTS idx_budget_lines_category ON public.budget_line_items(account_category);

-- 3. Budget Variance Analyses Table
CREATE TABLE IF NOT EXISTS public.budget_variance_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES public.facility_budgets(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    line_code VARCHAR(32) NOT NULL,
    line_name VARCHAR(128) NOT NULL,
    account_category VARCHAR(32) NOT NULL,
    actual_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    dollar_variance NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    percent_variance NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    is_favorable BOOLEAN NOT NULL DEFAULT true,
    severity VARCHAR(24) NOT NULL DEFAULT 'NORMAL' CHECK (
        severity IN ('NORMAL', 'ATTENTION', 'CRITICAL')
    ),
    flexible_budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    volume_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    rate_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    mix_impact NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    explanation TEXT,
    action_plan TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_variance_period_line UNIQUE (budget_id, period_code, line_code)
);

CREATE INDEX IF NOT EXISTS idx_bva_analyses_budget ON public.budget_variance_analyses(budget_id, period_code);
CREATE INDEX IF NOT EXISTS idx_bva_analyses_severity ON public.budget_variance_analyses(severity);
CREATE INDEX IF NOT EXISTS idx_bva_analyses_favorable ON public.budget_variance_analyses(is_favorable);

-- 4. Telemetry View
CREATE OR REPLACE VIEW public.vw_budget_vs_actual_telemetry AS
SELECT
    b.facility_id,
    b.id AS budget_id,
    b.budget_code,
    b.budget_name,
    b.fiscal_year,
    b.status AS budget_status,
    v.period_code,
    COALESCE(MAX(CASE WHEN v.line_code = 'NPR' THEN v.actual_amount END), 0.00) AS actual_npr,
    COALESCE(MAX(CASE WHEN v.line_code = 'NPR' THEN v.budget_amount END), 0.00) AS budget_npr,
    COALESCE(MAX(CASE WHEN v.line_code = 'NPR' THEN v.dollar_variance END), 0.00) AS npr_dollar_variance,
    COALESCE(MAX(CASE WHEN v.line_code = 'EBITDA' THEN v.actual_amount END), 0.00) AS actual_ebitda,
    COALESCE(MAX(CASE WHEN v.line_code = 'EBITDA' THEN v.budget_amount END), 0.00) AS budget_ebitda,
    COALESCE(MAX(CASE WHEN v.line_code = 'EBITDA' THEN v.dollar_variance END), 0.00) AS ebitda_dollar_variance,
    COALESCE(MAX(CASE WHEN v.line_code = 'CASE_VOLUME' THEN v.actual_amount END), 0.00) AS actual_case_volume,
    COALESCE(MAX(CASE WHEN v.line_code = 'CASE_VOLUME' THEN v.budget_amount END), 0.00) AS budget_case_volume,
    COUNT(v.id) AS total_line_items_count,
    COUNT(CASE WHEN v.is_favorable = true THEN 1 END) AS favorable_count,
    COUNT(CASE WHEN v.is_favorable = false THEN 1 END) AS unfavorable_count,
    COUNT(CASE WHEN v.severity = 'CRITICAL' THEN 1 END) AS critical_alerts_count
FROM public.facility_budgets b
JOIN public.budget_variance_analyses v ON v.budget_id = b.id
GROUP BY b.facility_id, b.id, b.budget_code, b.budget_name, b.fiscal_year, b.status, v.period_code;

-- 5. Row Level Security Policies
ALTER TABLE public.facility_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_variance_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_budgets ON public.facility_budgets;
CREATE POLICY tenant_isolation_budgets ON public.facility_budgets
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_budget_lines ON public.budget_line_items;
CREATE POLICY tenant_isolation_budget_lines ON public.budget_line_items
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_bva_analyses ON public.budget_variance_analyses;
CREATE POLICY tenant_isolation_bva_analyses ON public.budget_variance_analyses
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );
