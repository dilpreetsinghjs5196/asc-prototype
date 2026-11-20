-- ==============================================================================
-- Migration 114: Management P&L & Reconciliation Boundaries
-- Phase E0: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes managerial chart of accounts, accounting period governance,
--              gross-to-net patient revenue deductions, direct clinical margin,
--              operating EBITDA, and multi-boundary reconciliation checkpoints.
-- ==============================================================================

-- 1. Management P&L Accounting Periods Table
CREATE TABLE IF NOT EXISTS public.management_pnl_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    period_name VARCHAR(64) NOT NULL,
    period_type VARCHAR(16) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'PROVISIONAL_CLOSE', 'HARD_CLOSE_FROZEN')
    ),
    is_closed BOOLEAN NOT NULL DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_pnl_period UNIQUE (facility_id, period_code)
);

CREATE INDEX IF NOT EXISTS idx_pnl_periods_facility ON public.management_pnl_periods(facility_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_pnl_periods_status ON public.management_pnl_periods(status);

-- 2. Management P&L Statement Lines Table (Hierarchical Chart of Accounts)
CREATE TABLE IF NOT EXISTS public.management_pnl_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.management_pnl_periods(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_code VARCHAR(32) NOT NULL,
    line_number INT NOT NULL,
    line_name VARCHAR(128) NOT NULL,
    section VARCHAR(32) NOT NULL CHECK (section IN (
        'GROSS_REVENUE',
        'CONTRACTUAL_DEDUCTIONS',
        'NET_REVENUE',
        'DIRECT_CLINICAL_COSTS',
        'CLINICAL_MARGIN',
        'VARIABLE_FACILITY_COSTS',
        'GROSS_OPERATING_PROFIT',
        'FIXED_OVERHEAD_OPEX',
        'EBITDA',
        'DEPRECIATION_AMORTIZATION',
        'NET_OPERATING_INCOME'
    )),
    tier INT NOT NULL CHECK (tier BETWEEN 1 AND 5),
    is_summary_line BOOLEAN NOT NULL DEFAULT false,
    parent_line_code VARCHAR(32),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    prior_period_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    percent_of_npr NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    calculation_formula TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_period_line_code UNIQUE (period_id, line_code)
);

CREATE INDEX IF NOT EXISTS idx_pnl_lines_period ON public.management_pnl_statement_lines(period_id, line_number ASC);
CREATE INDEX IF NOT EXISTS idx_pnl_lines_facility ON public.management_pnl_statement_lines(facility_id);
CREATE INDEX IF NOT EXISTS idx_pnl_lines_section ON public.management_pnl_statement_lines(section);

-- 3. Multi-Boundary Reconciliations Table
CREATE TABLE IF NOT EXISTS public.management_pnl_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.management_pnl_periods(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    boundary_type VARCHAR(32) NOT NULL CHECK (boundary_type IN (
        'TRANSACTION_LEDGER_TO_REVENUE',
        'REMITTANCE_835_TO_CASH',
        'INVENTORY_PURCHASE_TO_COST',
        'PAYROLL_JOURNAL_TO_LABOR',
        'OVERHEAD_ALLOCATION_BALANCE'
    )),
    boundary_name VARCHAR(128) NOT NULL,
    source_system VARCHAR(64) NOT NULL,
    source_amount NUMERIC(14, 2) NOT NULL,
    pnl_line_amount NUMERIC(14, 2) NOT NULL,
    variance_amount NUMERIC(14, 2) NOT NULL,
    tolerance_threshold NUMERIC(10, 2) NOT NULL DEFAULT 0.01,
    reconciliation_status VARCHAR(24) NOT NULL CHECK (
        reconciliation_status IN ('RECONCILED_BALANCED', 'VARIANCE_FLAGGED', 'UNDER_INVESTIGATION')
    ),
    reconciliation_notes TEXT,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconciled_by UUID REFERENCES auth.users(id),
    audit_hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pnl_recon_period ON public.management_pnl_reconciliations(period_id, boundary_type);
CREATE INDEX IF NOT EXISTS idx_pnl_recon_status ON public.management_pnl_reconciliations(reconciliation_status);

-- 4. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_management_pnl_telemetry AS
SELECT
    p.facility_id,
    p.id AS period_id,
    p.period_code,
    p.period_name,
    p.status AS period_status,
    p.start_date,
    p.end_date,
    COALESCE(MAX(CASE WHEN l.line_code = 'NET_PATIENT_REVENUE' THEN l.amount END), 0.00) AS net_patient_revenue,
    COALESCE(MAX(CASE WHEN l.line_code = 'GROSS_PATIENT_REVENUE' THEN l.amount END), 0.00) AS gross_patient_revenue,
    COALESCE(MAX(CASE WHEN l.line_code = 'DIRECT_CLINICAL_MARGIN' THEN l.amount END), 0.00) AS direct_clinical_margin,
    COALESCE(MAX(CASE WHEN l.line_code = 'EBITDA' THEN l.amount END), 0.00) AS ebitda,
    COALESCE(MAX(CASE WHEN l.line_code = 'NET_OPERATING_INCOME' THEN l.amount END), 0.00) AS net_operating_income,
    COUNT(r.id) AS total_reconciliations_count,
    COUNT(CASE WHEN r.reconciliation_status = 'RECONCILED_BALANCED' THEN 1 END) AS balanced_reconciliations_count,
    COUNT(CASE WHEN r.reconciliation_status != 'RECONCILED_BALANCED' THEN 1 END) AS flagged_reconciliations_count
FROM public.management_pnl_periods p
LEFT JOIN public.management_pnl_statement_lines l ON l.period_id = p.id
LEFT JOIN public.management_pnl_reconciliations r ON r.period_id = p.id
GROUP BY p.facility_id, p.id, p.period_code, p.period_name, p.status, p.start_date, p.end_date;

-- 5. Row Level Security Policies
ALTER TABLE public.management_pnl_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_pnl_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_pnl_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_pnl_periods ON public.management_pnl_periods;
CREATE POLICY tenant_isolation_pnl_periods ON public.management_pnl_periods
    FOR ALL
    USING (facility_id = auth.uid() OR facility_id IN (
        SELECT facility_id FROM public.user_facility_access WHERE user_id = auth.uid()
    ) OR current_user = 'postgres' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS tenant_isolation_pnl_lines ON public.management_pnl_statement_lines;
CREATE POLICY tenant_isolation_pnl_lines ON public.management_pnl_statement_lines
    FOR ALL
    USING (facility_id = auth.uid() OR facility_id IN (
        SELECT facility_id FROM public.user_facility_access WHERE user_id = auth.uid()
    ) OR current_user = 'postgres' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS tenant_isolation_pnl_recon ON public.management_pnl_reconciliations;
CREATE POLICY tenant_isolation_pnl_recon ON public.management_pnl_reconciliations
    FOR ALL
    USING (facility_id = auth.uid() OR facility_id IN (
        SELECT facility_id FROM public.user_facility_access WHERE user_id = auth.uid()
    ) OR current_user = 'postgres' OR auth.role() = 'authenticated');
