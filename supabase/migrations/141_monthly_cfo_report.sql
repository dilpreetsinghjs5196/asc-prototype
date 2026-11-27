-- ==============================================================================
-- Migration: 141_monthly_cfo_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H3)
-- Description: Monthly CFO Report Editions, Reconciled P&L Waterfall,
--              Cash & Working Capital Bridge, Variance Commentary, Dual-Key
--              Close Certifications, and H0 Digest Dispatches.
-- ==============================================================================

-- 1. Monthly CFO Close Governance Configuration Table
CREATE TABLE IF NOT EXISTS public.mcr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    close_day_of_month INT NOT NULL DEFAULT 5 CHECK (close_day_of_month >= 1 AND close_day_of_month <= 28),
    require_dq_trust_gate BOOLEAN NOT NULL DEFAULT TRUE,
    min_trust_score_for_signoff NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (
        min_trust_score_for_signoff >= 50.00 AND min_trust_score_for_signoff <= 100.00
    ),
    material_variance_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    ebitda_target_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 22.00,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_mcr_config UNIQUE (facility_id)
);

-- 2. Monthly CFO Compiled Editions Table
CREATE TABLE IF NOT EXISTS public.mcr_monthly_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    report_code VARCHAR(48) NOT NULL,
    fiscal_period VARCHAR(16) NOT NULL,
    completed_cases INT NOT NULL DEFAULT 0,
    gross_charges_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    contractual_allowances_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    net_patient_revenue_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_operating_expense_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ebitda_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ebitda_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    cash_collections_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cash_to_ebitda_conversion_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    ending_cash_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    days_cash_on_hand INT NOT NULL DEFAULT 0,
    ar_days_dso INT NOT NULL DEFAULT 0,
    budget_variance_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    dq_trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    signoff_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (
        signoff_status IN ('DRAFT', 'CONTROLLER_VERIFIED', 'CFO_SIGNED_OFF', 'LOCKED_CLOSED')
    ),
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_mcr_period UNIQUE (facility_id, fiscal_period)
);

-- 3. Reconciled Monthly P&L Bridge Table
CREATE TABLE IF NOT EXISTS public.mcr_pnl_bridge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.mcr_monthly_editions(id) ON DELETE CASCADE,
    line_order INT NOT NULL,
    line_code VARCHAR(32) NOT NULL,
    line_label VARCHAR(128) NOT NULL,
    section VARCHAR(24) NOT NULL CHECK (section IN ('REVENUE', 'COGS_DIRECT', 'OPERATING_EXPENSE', 'EBITDA')),
    actual_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    budget_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    variance_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    variance_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    is_favorable BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unq_mcr_pnl_line UNIQUE (edition_id, line_code)
);

-- 4. Monthly Cash Flow & AR Roll-Forward Bridge Table
CREATE TABLE IF NOT EXISTS public.mcr_cash_ar_bridges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.mcr_monthly_editions(id) ON DELETE CASCADE,
    opening_cash_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    operating_cash_inflows_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    payroll_ap_outflows_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    capex_debt_outflows_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    closing_cash_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    cash_variance_against_gl_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT unq_mcr_cash_edition UNIQUE (edition_id)
);

-- 5. Material Budget Variance Commentary Table
CREATE TABLE IF NOT EXISTS public.mcr_variance_commentary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.mcr_monthly_editions(id) ON DELETE CASCADE,
    variance_code VARCHAR(48) NOT NULL,
    line_code VARCHAR(32) NOT NULL,
    line_label VARCHAR(128) NOT NULL,
    variance_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    variance_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    driver_summary TEXT NOT NULL,
    corrective_action TEXT NOT NULL,
    owner_role VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN_EXPLANATION' CHECK (
        status IN ('OPEN_EXPLANATION', 'VERIFIED')
    ),
    verified_by VARCHAR(128),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_mcr_var_code UNIQUE (facility_id, variance_code)
);

-- 6. Controller & CFO Close Sign-Off Ledger Table
CREATE TABLE IF NOT EXISTS public.mcr_signoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.mcr_monthly_editions(id) ON DELETE CASCADE,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    notes TEXT,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Monthly CFO Report H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.mcr_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.mcr_monthly_editions(id) ON DELETE CASCADE,
    rpt_execution_code VARCHAR(64) NOT NULL,
    delivery_channel VARCHAR(32) NOT NULL,
    export_format VARCHAR(16) NOT NULL,
    recipient_count INT NOT NULL DEFAULT 0,
    dispatch_status VARCHAR(24) NOT NULL DEFAULT 'DELIVERED',
    dispatched_by VARCHAR(128) NOT NULL,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mcr_editions_facility_period ON public.mcr_monthly_editions (facility_id, fiscal_period DESC);
CREATE INDEX IF NOT EXISTS idx_mcr_pnl_edition_order ON public.mcr_pnl_bridge (edition_id, line_order);
CREATE INDEX IF NOT EXISTS idx_mcr_signoffs_edition ON public.mcr_signoffs (facility_id, edition_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_mcr_telemetry AS
SELECT
    c.facility_id,
    c.min_trust_score_for_signoff,
    c.ebitda_target_margin_pct,
    c.sync_status,
    c.health_status,
    (SELECT e.report_code FROM public.mcr_monthly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.fiscal_period DESC LIMIT 1) AS latest_report_code,
    (SELECT e.net_patient_revenue_usd FROM public.mcr_monthly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.fiscal_period DESC LIMIT 1) AS latest_net_revenue_usd,
    (SELECT e.ebitda_usd FROM public.mcr_monthly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.fiscal_period DESC LIMIT 1) AS latest_ebitda_usd,
    (SELECT e.ebitda_margin_pct FROM public.mcr_monthly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.fiscal_period DESC LIMIT 1) AS latest_ebitda_margin_pct,
    (SELECT e.signoff_status FROM public.mcr_monthly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.fiscal_period DESC LIMIT 1) AS latest_signoff_status,
    (SELECT e.sha256_report_seal FROM public.mcr_monthly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.fiscal_period DESC LIMIT 1) AS latest_sync_seal
FROM public.mcr_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.mcr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcr_monthly_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcr_pnl_bridge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcr_cash_ar_bridges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcr_variance_commentary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcr_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcr_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS mcr_configs_tenant_iso ON public.mcr_configs;
CREATE POLICY mcr_configs_tenant_iso ON public.mcr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS mcr_editions_tenant_iso ON public.mcr_monthly_editions;
CREATE POLICY mcr_editions_tenant_iso ON public.mcr_monthly_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS mcr_pnl_tenant_iso ON public.mcr_pnl_bridge;
CREATE POLICY mcr_pnl_tenant_iso ON public.mcr_pnl_bridge USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS mcr_cash_tenant_iso ON public.mcr_cash_ar_bridges;
CREATE POLICY mcr_cash_tenant_iso ON public.mcr_cash_ar_bridges USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS mcr_vars_tenant_iso ON public.mcr_variance_commentary;
CREATE POLICY mcr_vars_tenant_iso ON public.mcr_variance_commentary USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS mcr_signoffs_tenant_iso ON public.mcr_signoffs;
CREATE POLICY mcr_signoffs_tenant_iso ON public.mcr_signoffs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS mcr_dispatch_tenant_iso ON public.mcr_dispatch_logs;
CREATE POLICY mcr_dispatch_tenant_iso ON public.mcr_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_nov_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.mcr_configs (
            facility_id, close_day_of_month, require_dq_trust_gate, min_trust_score_for_signoff,
            material_variance_pct, ebitda_target_margin_pct, client_secret_encrypted,
            sync_status, health_status
        ) VALUES (
            naples_id, 5, TRUE, 75.00, 5.00, 22.00,
            'mcr_sec_****_naples_5012', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.mcr_monthly_editions (
            facility_id, report_code, fiscal_period, completed_cases,
            gross_charges_usd, contractual_allowances_usd, net_patient_revenue_usd,
            total_operating_expense_usd, ebitda_usd, ebitda_margin_pct,
            cash_collections_usd, cash_to_ebitda_conversion_pct, ending_cash_usd,
            days_cash_on_hand, ar_days_dso, budget_variance_usd, dq_trust_score,
            signoff_status, compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'MCR-2026-11-NAP', '2026-11', 418,
            4680000.00, 2820000.00, 1860000.00,
            1428000.00, 432000.00, 23.23,
            1815000.00, 91.40, 2418500.00,
            52, 34, 28500.00, 94.80,
            'DRAFT', 'controller@naplessurgery.com',
            'sha256_mcr_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, fiscal_period) DO NOTHING;

        SELECT id INTO ed_nov_id FROM public.mcr_monthly_editions
        WHERE facility_id = naples_id AND fiscal_period = '2026-11' LIMIT 1;

        IF ed_nov_id IS NOT NULL THEN
            INSERT INTO public.mcr_pnl_bridge (
                facility_id, edition_id, line_order, line_code, line_label, section,
                actual_usd, budget_usd, variance_usd, variance_pct, is_favorable
            ) VALUES
            (naples_id, ed_nov_id, 1, 'REV_NET', 'Net Patient Service Revenue', 'REVENUE', 1860000.00, 1810000.00, 50000.00, 2.76, TRUE),
            (naples_id, ed_nov_id, 2, 'COGS_IMP', 'Implants & Surgical Supplies', 'COGS_DIRECT', 584000.00, 542000.00, 42000.00, 7.75, FALSE),
            (naples_id, ed_nov_id, 3, 'COGS_LAB', 'Clinical & RN/Tech Labor', 'COGS_DIRECT', 488000.00, 495000.00, -7000.00, -1.41, TRUE),
            (naples_id, ed_nov_id, 4, 'OPEX_FAC', 'Facility Rent, Utilities & Admin', 'OPERATING_EXPENSE', 356000.00, 369500.00, -13500.00, -3.65, TRUE),
            (naples_id, ed_nov_id, 5, 'EBITDA_TOT', 'Monthly Operating EBITDA', 'EBITDA', 432000.00, 403500.00, 28500.00, 7.06, TRUE)
            ON CONFLICT (edition_id, line_code) DO NOTHING;

            INSERT INTO public.mcr_cash_ar_bridges (
                facility_id, edition_id, opening_cash_usd, operating_cash_inflows_usd,
                payroll_ap_outflows_usd, capex_debt_outflows_usd, closing_cash_usd, cash_variance_against_gl_usd
            ) VALUES (
                naples_id, ed_nov_id, 2195000.00, 1815000.00, 1495000.00, 96500.00, 2418500.00, 0.00
            ) ON CONFLICT (edition_id) DO NOTHING;

            INSERT INTO public.mcr_variance_commentary (
                facility_id, edition_id, variance_code, line_code, line_label,
                variance_usd, variance_pct, driver_summary, corrective_action, owner_role, status
            ) VALUES (
                naples_id, ed_nov_id, 'MCR-VAR-101', 'COGS_IMP', 'Implants & Surgical Supplies',
                42000.00, 7.75, 'High-acuity spine & arthroplasty volume up +14 cases over Nov budget.',
                'Reconcile Stryker/Arthrex carveout reimbursements via Phase H2.', 'Materials Manager', 'OPEN_EXPLANATION'
            ) ON CONFLICT (facility_id, variance_code) DO NOTHING;

            INSERT INTO public.mcr_signoffs (
                facility_id, edition_id, from_status, to_status, actor_email, actor_role, notes, sha256_seal
            )
            SELECT naples_id, ed_nov_id, 'NONE', 'DRAFT', 'controller@naplessurgery.com', 'Controller',
                   'Compiled November 2026 P&L & Cash roll-forward from Module 14 E0-E3 ledgers.',
                   'sha256_mcr_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.mcr_signoffs s WHERE s.edition_id = ed_nov_id AND s.to_status = 'DRAFT'
            );

            INSERT INTO public.mcr_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_nov_id, 'RPT-H3-RUN-NOV-01', 'PORTAL_INBOX', 'PDF', 3, 'DELIVERED',
                   'controller@naplessurgery.com',
                   'sha256_mcr_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.mcr_dispatch_logs d WHERE d.edition_id = ed_nov_id AND d.rpt_execution_code = 'RPT-H3-RUN-NOV-01'
            );
        END IF;
    END IF;
END $$;
