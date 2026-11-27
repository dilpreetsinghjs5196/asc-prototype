-- ==============================================================================
-- Migration: 140_weekly_revenue_leakage_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H2)
-- Description: Weekly Revenue Leakage Editions, Prioritized Recovery Queue,
--              Category & Payer Leakage Summaries, Recovery Action Provenance,
--              and H0 Monday Digest Dispatch Logs.
-- ==============================================================================

-- 1. Weekly Leakage Report Configuration Table
CREATE TABLE IF NOT EXISTS public.wlr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    week_start_day VARCHAR(16) NOT NULL DEFAULT 'MONDAY',
    materiality_threshold_usd NUMERIC(12,2) NOT NULL DEFAULT 250.00 CHECK (materiality_threshold_usd >= 0.00),
    auto_rank_by VARCHAR(32) NOT NULL DEFAULT 'EXPECTED_NET_RECOVERY',
    include_unbilled_cases BOOLEAN NOT NULL DEFAULT TRUE,
    include_implant_carveouts BOOLEAN NOT NULL DEFAULT TRUE,
    include_payer_underpayments BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_wlr_config UNIQUE (facility_id)
);

-- 2. Weekly Compiled Leakage Report Editions Table
CREATE TABLE IF NOT EXISTS public.wlr_weekly_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    week_code VARCHAR(32) NOT NULL,
    week_start_date DATE NOT NULL,
    week_end_date DATE NOT NULL,
    total_identified_leakage_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_net_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    realized_recovered_wow_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    wow_leakage_delta_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    unbilled_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    underpayment_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    implant_carveout_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    modifier_omission_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    timely_filing_risk_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    open_opportunities_count INT NOT NULL DEFAULT 0,
    edition_status VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED' CHECK (
        edition_status IN ('DRAFT', 'PUBLISHED', 'REVIEWED')
    ),
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_wlr_week_code UNIQUE (facility_id, week_code)
);

-- 3. Prioritized Weekly Recovery Opportunities Queue Table
CREATE TABLE IF NOT EXISTS public.wlr_priority_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.wlr_weekly_editions(id) ON DELETE CASCADE,
    opportunity_code VARCHAR(48) NOT NULL,
    leakage_category VARCHAR(32) NOT NULL CHECK (
        leakage_category IN ('UNBILLED_CASE', 'PAYER_UNDERPAYMENT', 'IMPLANT_CARVEOUT', 'MODIFIER_OMISSION', 'DENIAL_TIMELY_FILING')
    ),
    source_module VARCHAR(48) NOT NULL,
    payer_name VARCHAR(96) NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    case_or_claim_ref VARCHAR(64) NOT NULL,
    gross_leakage_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    recovery_probability_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    expected_net_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    days_to_timely_filing_limit INT NOT NULL DEFAULT 45,
    priority_score NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    priority_tier VARCHAR(24) NOT NULL CHECK (priority_tier IN ('P0_IMMEDIATE', 'P1_THIS_WEEK', 'P2_STANDARD')),
    owner_role VARCHAR(64) NOT NULL,
    assignee_email VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'IN_RECOVERY', 'SUBMITTED_PAYER', 'RECOVERED', 'WRITTEN_OFF')
    ),
    recovered_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    resolution_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_wlr_opp_code UNIQUE (facility_id, opportunity_code)
);

-- 4. Weekly Leakage Category Breakdown Table
CREATE TABLE IF NOT EXISTS public.wlr_category_breakdown (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.wlr_weekly_editions(id) ON DELETE CASCADE,
    leakage_category VARCHAR(32) NOT NULL,
    item_count INT NOT NULL DEFAULT 0,
    gross_leakage_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_net_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    wow_change_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT unq_wlr_cat_edition UNIQUE (edition_id, leakage_category)
);

-- 5. Weekly Payer Leakage Concentration Table
CREATE TABLE IF NOT EXISTS public.wlr_payer_leakage_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.wlr_weekly_editions(id) ON DELETE CASCADE,
    payer_name VARCHAR(96) NOT NULL,
    item_count INT NOT NULL DEFAULT 0,
    gross_leakage_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_net_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    min_timely_filing_days INT NOT NULL DEFAULT 30,
    CONSTRAINT unq_wlr_payer_edition UNIQUE (edition_id, payer_name)
);

-- 6. Weekly Recovery Action Audit Table
CREATE TABLE IF NOT EXISTS public.wlr_weekly_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.wlr_weekly_editions(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES public.wlr_priority_opportunities(id) ON DELETE SET NULL,
    action_type VARCHAR(32) NOT NULL,
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    recovered_amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Weekly Leakage Report H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.wlr_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.wlr_weekly_editions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_wlr_editions_facility_dates ON public.wlr_weekly_editions (facility_id, week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_wlr_opps_edition_prio ON public.wlr_priority_opportunities (facility_id, edition_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_wlr_actions_edition ON public.wlr_weekly_actions (facility_id, edition_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_wlr_telemetry AS
SELECT
    c.facility_id,
    c.materiality_threshold_usd,
    c.sync_status,
    c.health_status,
    (SELECT e.week_code FROM public.wlr_weekly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.week_start_date DESC LIMIT 1) AS latest_week_code,
    (SELECT e.total_identified_leakage_usd FROM public.wlr_weekly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.week_start_date DESC LIMIT 1) AS latest_gross_leakage_usd,
    (SELECT e.expected_net_recovery_usd FROM public.wlr_weekly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.week_start_date DESC LIMIT 1) AS latest_expected_recovery_usd,
    (SELECT e.realized_recovered_wow_usd FROM public.wlr_weekly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.week_start_date DESC LIMIT 1) AS latest_realized_recovered_usd,
    (SELECT COUNT(*) FROM public.wlr_priority_opportunities o WHERE o.facility_id = c.facility_id AND o.priority_tier = 'P0_IMMEDIATE' AND o.status NOT IN ('RECOVERED', 'WRITTEN_OFF')) AS open_p0_count,
    (SELECT e.sha256_report_seal FROM public.wlr_weekly_editions e WHERE e.facility_id = c.facility_id ORDER BY e.week_start_date DESC LIMIT 1) AS latest_sync_seal
FROM public.wlr_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.wlr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wlr_weekly_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wlr_priority_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wlr_category_breakdown ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wlr_payer_leakage_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wlr_weekly_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wlr_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS wlr_configs_tenant_iso ON public.wlr_configs;
CREATE POLICY wlr_configs_tenant_iso ON public.wlr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS wlr_editions_tenant_iso ON public.wlr_weekly_editions;
CREATE POLICY wlr_editions_tenant_iso ON public.wlr_weekly_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS wlr_opps_tenant_iso ON public.wlr_priority_opportunities;
CREATE POLICY wlr_opps_tenant_iso ON public.wlr_priority_opportunities USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS wlr_cats_tenant_iso ON public.wlr_category_breakdown;
CREATE POLICY wlr_cats_tenant_iso ON public.wlr_category_breakdown USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS wlr_payers_tenant_iso ON public.wlr_payer_leakage_summary;
CREATE POLICY wlr_payers_tenant_iso ON public.wlr_payer_leakage_summary USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS wlr_actions_tenant_iso ON public.wlr_weekly_actions;
CREATE POLICY wlr_actions_tenant_iso ON public.wlr_weekly_actions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS wlr_dispatch_tenant_iso ON public.wlr_dispatch_logs;
CREATE POLICY wlr_dispatch_tenant_iso ON public.wlr_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_w48_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.wlr_configs (
            facility_id, week_start_day, materiality_threshold_usd, auto_rank_by,
            include_unbilled_cases, include_implant_carveouts, include_payer_underpayments,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 'MONDAY', 250.00, 'EXPECTED_NET_RECOVERY',
            TRUE, TRUE, TRUE, 'wlr_sec_****_naples_7022', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.wlr_weekly_editions (
            facility_id, week_code, week_start_date, week_end_date,
            total_identified_leakage_usd, expected_net_recovery_usd, realized_recovered_wow_usd,
            wow_leakage_delta_pct, unbilled_exposure_usd, underpayment_exposure_usd,
            implant_carveout_exposure_usd, modifier_omission_exposure_usd, timely_filing_risk_usd,
            open_opportunities_count, edition_status, compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'WLR-2026-W48', '2026-11-23', '2026-11-29',
            46820.00, 36914.50, 12450.00, -8.40,
            14200.00, 16840.00, 9450.00, 3480.00, 2850.00,
            5, 'PUBLISHED', 'scheduler.bot@naplessurgery.com',
            'sha256_wlr_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4'
        ) ON CONFLICT (facility_id, week_code) DO NOTHING;

        SELECT id INTO ed_w48_id FROM public.wlr_weekly_editions
        WHERE facility_id = naples_id AND week_code = 'WLR-2026-W48' LIMIT 1;

        IF ed_w48_id IS NOT NULL THEN
            INSERT INTO public.wlr_priority_opportunities (
                facility_id, edition_id, opportunity_code, leakage_category, source_module,
                payer_name, surgeon_name, case_or_claim_ref,
                gross_leakage_usd, recovery_probability_pct, expected_net_recovery_usd,
                days_to_timely_filing_limit, priority_score, priority_tier,
                owner_role, assignee_email, status
            ) VALUES
            (naples_id, ed_w48_id, 'WLR-OPP-401', 'UNBILLED_CASE', 'UNBILLED_CASES', 'UnitedHealthcare', 'Dr. Malinoski Kelly', 'CAS-20261119-08', 14200.00, 92.00, 13064.00, 18, 16330.00, 'P0_IMMEDIATE', 'RCM Billing Lead', 'rcm_lead@naplesasc.com', 'OPEN'),
            (naples_id, ed_w48_id, 'WLR-OPP-402', 'PAYER_UNDERPAYMENT', 'EDI_835', 'Florida Blue', 'Dr. Gardner Paul', 'CLM-835-99102', 16840.00, 78.00, 13135.20, 11, 19702.80, 'P0_IMMEDIATE', 'CFO / Finance Director', 'cfo@naplesasc.com', 'IN_RECOVERY'),
            (naples_id, ed_w48_id, 'WLR-OPP-403', 'IMPLANT_CARVEOUT', 'IMPLANT_CARVEOUT', 'Aetna', 'Dr. Malinoski Kelly', 'CLM-IMP-44210', 9450.00, 75.00, 7087.50, 26, 8859.38, 'P0_IMMEDIATE', 'Materials Manager', 'materials_mgr@naplesasc.com', 'OPEN'),
            (naples_id, ed_w48_id, 'WLR-OPP-404', 'MODIFIER_OMISSION', 'REVENUE_LEAKAGE', 'Medicare', 'Dr. Bonett Andrew', 'CLM-M59-77219', 3480.00, 70.00, 2436.00, 42, 2436.00, 'P1_THIS_WEEK', 'RCM Billing Lead', 'rcm_lead@naplesasc.com', 'OPEN'),
            (naples_id, ed_w48_id, 'WLR-OPP-405', 'DENIAL_TIMELY_FILING', 'DENIALS_MODEL', 'UnitedHealthcare', 'Dr. Walsh Mark', 'CLM-DNL-33108', 2850.00, 41.82, 1191.80, 9, 1787.70, 'P0_IMMEDIATE', 'RCM Billing Lead', 'rcm_lead@naplesasc.com', 'OPEN')
            ON CONFLICT (facility_id, opportunity_code) DO NOTHING;

            INSERT INTO public.wlr_category_breakdown (
                facility_id, edition_id, leakage_category, item_count,
                gross_leakage_usd, expected_net_recovery_usd, wow_change_pct
            ) VALUES
            (naples_id, ed_w48_id, 'UNBILLED_CASE', 1, 14200.00, 13064.00, -12.50),
            (naples_id, ed_w48_id, 'PAYER_UNDERPAYMENT', 1, 16840.00, 13135.20, -6.20),
            (naples_id, ed_w48_id, 'IMPLANT_CARVEOUT', 1, 9450.00, 7087.50, -4.10),
            (naples_id, ed_w48_id, 'MODIFIER_OMISSION', 1, 3480.00, 2436.00, 2.00),
            (naples_id, ed_w48_id, 'DENIAL_TIMELY_FILING', 1, 2850.00, 1191.80, -15.00)
            ON CONFLICT (edition_id, leakage_category) DO NOTHING;

            INSERT INTO public.wlr_payer_leakage_summary (
                facility_id, edition_id, payer_name, item_count,
                gross_leakage_usd, expected_net_recovery_usd, min_timely_filing_days
            ) VALUES
            (naples_id, ed_w48_id, 'UnitedHealthcare', 2, 17050.00, 14255.80, 9),
            (naples_id, ed_w48_id, 'Florida Blue', 1, 16840.00, 13135.20, 11),
            (naples_id, ed_w48_id, 'Aetna', 1, 9450.00, 7087.50, 26),
            (naples_id, ed_w48_id, 'Medicare', 1, 3480.00, 2436.00, 42)
            ON CONFLICT (edition_id, payer_name) DO NOTHING;

            INSERT INTO public.wlr_weekly_actions (
                facility_id, edition_id, opportunity_id, action_type, actor_email, actor_role,
                recovered_amount_usd, notes, sha256_seal
            )
            SELECT naples_id, ed_w48_id, NULL, 'EDITION_PUBLISHED', 'scheduler.bot@naplessurgery.com', 'System H0 Scheduler',
                   12450.00, 'Compiled Monday W48 Revenue Leakage & Recovery Dossier ($36,914.50 expected net recovery).',
                   'sha256_wlr_b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.wlr_weekly_actions a
                WHERE a.edition_id = ed_w48_id AND a.action_type = 'EDITION_PUBLISHED'
            );

            INSERT INTO public.wlr_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_w48_id, 'RPT-H2-RUN-W48-01', 'PORTAL_INBOX', 'XLSX',
                   2, 'DELIVERED', 'scheduler.bot@naplessurgery.com',
                   'sha256_wlr_c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.wlr_dispatch_logs d
                WHERE d.edition_id = ed_w48_id AND d.rpt_execution_code = 'RPT-H2-RUN-W48-01'
            );
        END IF;
    END IF;
END $$;
