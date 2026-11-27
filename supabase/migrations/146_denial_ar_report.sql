-- ==============================================================================
-- Migration: 146_denial_ar_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H8)
-- Description: Denial & AR Aging Report Editions, Conserved GAAP 6-Bucket
--              AR Aging Snapshots, Prioritized Denial Workqueue, CARC Root-Cause
--              Clusters, Sealed Appeal Resolution Log, and H0 Dispatches.
-- ==============================================================================

-- 1. Denial & AR Governance Config Table
CREATE TABLE IF NOT EXISTS public.dar_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    dso_benchmark_days INT NOT NULL DEFAULT 35,
    max_ar_over_90_pct NUMERIC(5,2) NOT NULL DEFAULT 12.00,
    target_first_pass_resolution_pct NUMERIC(5,2) NOT NULL DEFAULT 92.00,
    timely_filing_warning_days INT NOT NULL DEFAULT 14,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dar_config UNIQUE (facility_id),
    CONSTRAINT chk_dar_thresholds CHECK (
        dso_benchmark_days >= 10 AND max_ar_over_90_pct > 0 AND timely_filing_warning_days >= 3
    )
);

-- 2. Denial & AR Compiled Editions Table
CREATE TABLE IF NOT EXISTS public.dar_report_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_code VARCHAR(48) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    edition_status VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED' CHECK (
        edition_status IN ('DRAFT', 'PUBLISHED', 'SIGNED_OFF')
    ),
    total_gross_ar_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ar_over_90_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ar_over_90_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    calculated_dso_days NUMERIC(6,1) NOT NULL DEFAULT 0.0,
    open_denied_exposure_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    expected_appeal_recovery_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dar_edition UNIQUE (facility_id, period_code)
);

-- 3. Conserved GAAP 6-Bucket AR Aging Snapshots Table
CREATE TABLE IF NOT EXISTS public.dar_aging_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.dar_report_editions(id) ON DELETE CASCADE,
    bucket_code VARCHAR(16) NOT NULL CHECK (
        bucket_code IN ('0_30', '31_60', '61_90', '91_120', '121_180', '181_PLUS')
    ),
    bucket_label VARCHAR(32) NOT NULL,
    claim_count INT NOT NULL DEFAULT 0,
    ar_amount_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    share_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    expected_collectible_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    risk_category VARCHAR(24) NOT NULL,
    CONSTRAINT unq_dar_aging_edition_bucket UNIQUE (edition_id, bucket_code)
);

-- 4. Prioritized Denial Workqueue Table
CREATE TABLE IF NOT EXISTS public.dar_denial_workqueue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.dar_report_editions(id) ON DELETE CASCADE,
    denial_code VARCHAR(32) NOT NULL,
    claim_number VARCHAR(48) NOT NULL,
    payer_name VARCHAR(128) NOT NULL,
    carc_code VARCHAR(16) NOT NULL,
    denial_category VARCHAR(48) NOT NULL,
    billed_amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    denied_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    recovery_probability_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    expected_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    days_to_timely_filing INT NOT NULL DEFAULT 30,
    urgency_tier VARCHAR(32) NOT NULL CHECK (
        urgency_tier IN ('CRITICAL_FILING_THREAT', 'HIGH_VALUE_APPEAL', 'STANDARD_FOLLOWUP', 'LOW_RECOVERY_WRITEOFF')
    ),
    assigned_team VARCHAR(48) NOT NULL,
    appeal_status VARCHAR(24) NOT NULL DEFAULT 'OPEN_TRIAGE',
    rank_in_facility INT NOT NULL DEFAULT 1,
    sha256_item_seal VARCHAR(128) NOT NULL,
    CONSTRAINT unq_dar_workqueue_edition_denial UNIQUE (edition_id, denial_code)
);

-- 5. CARC Root-Cause Denial Clusters Table
CREATE TABLE IF NOT EXISTS public.dar_carc_root_causes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.dar_report_editions(id) ON DELETE CASCADE,
    carc_code VARCHAR(16) NOT NULL,
    carc_description VARCHAR(160) NOT NULL,
    claim_count INT NOT NULL DEFAULT 0,
    denied_dollars_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    avg_recovery_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    primary_payer VARCHAR(64) NOT NULL,
    CONSTRAINT unq_dar_carc_edition_code UNIQUE (edition_id, carc_code)
);

-- 6. Sealed Appeal Resolution & Write-Off Audit Table
CREATE TABLE IF NOT EXISTS public.dar_appeal_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    workqueue_id UUID NOT NULL REFERENCES public.dar_denial_workqueue(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('SUBMIT_LEVEL_1_APPEAL', 'MEDICAL_NECESSITY_ADDENDUM', 'REBILL_CORRECTED_CLAIM', 'APPROVE_WRITEOFF')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    claimed_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Denial & AR H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.dar_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.dar_report_editions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_dar_editions_facility_period ON public.dar_report_editions (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_dar_workqueue_edition_rank ON public.dar_denial_workqueue (edition_id, rank_in_facility ASC);
CREATE INDEX IF NOT EXISTS idx_dar_appeals_item ON public.dar_appeal_resolutions (facility_id, workqueue_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_dar_telemetry AS
SELECT
    c.facility_id,
    c.dso_benchmark_days,
    c.max_ar_over_90_pct,
    c.timely_filing_warning_days,
    c.sync_status,
    c.health_status,
    (SELECT e.edition_code FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_edition_code,
    (SELECT e.total_gross_ar_usd FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_gross_ar_usd,
    (SELECT e.ar_over_90_pct FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS ar_over_90_pct,
    (SELECT e.calculated_dso_days FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS calculated_dso_days,
    (SELECT e.open_denied_exposure_usd FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS open_denied_exposure_usd,
    (SELECT e.expected_appeal_recovery_usd FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS expected_appeal_recovery_usd,
    (SELECT e.sha256_report_seal FROM public.dar_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_sync_seal
FROM public.dar_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.dar_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dar_report_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dar_aging_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dar_denial_workqueue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dar_carc_root_causes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dar_appeal_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dar_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS dar_configs_tenant_iso ON public.dar_configs;
CREATE POLICY dar_configs_tenant_iso ON public.dar_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dar_editions_tenant_iso ON public.dar_report_editions;
CREATE POLICY dar_editions_tenant_iso ON public.dar_report_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dar_aging_tenant_iso ON public.dar_aging_snapshots;
CREATE POLICY dar_aging_tenant_iso ON public.dar_aging_snapshots USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dar_workqueue_tenant_iso ON public.dar_denial_workqueue;
CREATE POLICY dar_workqueue_tenant_iso ON public.dar_denial_workqueue USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dar_carc_tenant_iso ON public.dar_carc_root_causes;
CREATE POLICY dar_carc_tenant_iso ON public.dar_carc_root_causes USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dar_appeals_tenant_iso ON public.dar_appeal_resolutions;
CREATE POLICY dar_appeals_tenant_iso ON public.dar_appeal_resolutions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dar_dispatch_tenant_iso ON public.dar_dispatch_logs;
CREATE POLICY dar_dispatch_tenant_iso ON public.dar_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_nov_id UUID;
    den_1_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.dar_configs (
            facility_id, dso_benchmark_days, max_ar_over_90_pct, target_first_pass_resolution_pct,
            timely_filing_warning_days, client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 35, 12.00, 92.00, 14,
            'dar_sec_****_naples_8412', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.dar_report_editions (
            facility_id, edition_code, period_code, edition_status,
            total_gross_ar_usd, ar_over_90_usd, ar_over_90_pct, calculated_dso_days,
            open_denied_exposure_usd, expected_appeal_recovery_usd,
            compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'DAR-2026-11-NAP', '2026-11', 'PUBLISHED',
            640000.00, 89600.00, 14.00, 32.0, 94500.00, 69160.00,
            'rcm_lead@naplessurgery.com',
            'sha256_dar_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, period_code) DO NOTHING;

        SELECT id INTO ed_nov_id FROM public.dar_report_editions
        WHERE facility_id = naples_id AND period_code = '2026-11' LIMIT 1;

        IF ed_nov_id IS NOT NULL THEN
            INSERT INTO public.dar_aging_snapshots (
                facility_id, edition_id, bucket_code, bucket_label, claim_count,
                ar_amount_usd, share_pct, expected_collectible_usd, risk_category
            ) VALUES
            (naples_id, ed_nov_id, '0_30', '0-30 Days', 142, 345600.00, 54.00, 338688.00, 'CURRENT'),
            (naples_id, ed_nov_id, '31_60', '31-60 Days', 58, 134400.00, 21.00, 120960.00, 'FOLLOW_UP'),
            (naples_id, ed_nov_id, '61_90', '61-90 Days', 31, 70400.00, 11.00, 56320.00, 'ESCALATION'),
            (naples_id, ed_nov_id, '91_120', '91-120 Days', 19, 44800.00, 7.00, 29120.00, 'HIGH_RISK'),
            (naples_id, ed_nov_id, '121_180', '121-180 Days', 11, 28800.00, 4.50, 14400.00, 'CRITICAL_AGING'),
            (naples_id, ed_nov_id, '181_PLUS', '181+ Days', 6, 16000.00, 2.50, 4800.00, 'WRITE_OFF_RISK')
            ON CONFLICT (edition_id, bucket_code) DO NOTHING;

            INSERT INTO public.dar_denial_workqueue (
                facility_id, edition_id, denial_code, claim_number, payer_name, carc_code,
                denial_category, billed_amount_usd, denied_exposure_usd, recovery_probability_pct,
                expected_recovery_usd, days_to_timely_filing, urgency_tier, assigned_team,
                appeal_status, rank_in_facility, sha256_item_seal
            ) VALUES
            (naples_id, ed_nov_id, 'DEN-2611-01', 'CLM-NAP-88412', 'UnitedHealthcare Commercial', '197', 'PRE_AUTH_ABSENT_EXPIRED', 38500.00, 32400.00, 75.00, 24300.00, 9, 'CRITICAL_FILING_THREAT', 'CLINICAL_APPEALS', 'OPEN_TRIAGE', 1, 'sha256_dar_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'),
            (naples_id, ed_nov_id, 'DEN-2611-02', 'CLM-NAP-88390', 'Aetna Choice POS II', '97', 'CODING_MODIFIER_UNBUNDLED', 29400.00, 24600.00, 88.00, 21648.00, 28, 'HIGH_VALUE_APPEAL', 'BILLING_AND_CODING', 'APPEAL_DRAFTED', 2, 'sha256_dar_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'),
            (naples_id, ed_nov_id, 'DEN-2611-03', 'CLM-NAP-88245', 'Florida Blue (BCBS PPO)', '50', 'MEDICAL_NECESSITY_LCD', 24000.00, 19500.00, 70.00, 13650.00, 42, 'HIGH_VALUE_APPEAL', 'CLINICAL_APPEALS', 'OPEN_TRIAGE', 3, 'sha256_dar_44d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d'),
            (naples_id, ed_nov_id, 'DEN-2611-04', 'CLM-NAP-88109', 'Cigna Open Access Plus', '16', 'CODING_MODIFIER_UNBUNDLED', 14200.00, 11200.00, 80.00, 8960.00, 19, 'HIGH_VALUE_APPEAL', 'BILLING_AND_CODING', 'OPEN_TRIAGE', 4, 'sha256_dar_55e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e'),
            (naples_id, ed_nov_id, 'DEN-2611-05', 'CLM-NAP-87904', 'UnitedHealthcare Commercial', '29', 'TIMELY_FILING_EXCEEDED', 9100.00, 6800.00, 8.85, 602.00, 4, 'LOW_RECOVERY_WRITEOFF', 'BILLING_AND_CODING', 'PENDING_WRITEOFF', 5, 'sha256_dar_66f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f')
            ON CONFLICT (edition_id, denial_code) DO NOTHING;

            INSERT INTO public.dar_carc_root_causes (
                facility_id, edition_id, carc_code, carc_description,
                claim_count, denied_dollars_usd, avg_recovery_pct, primary_payer
            ) VALUES
            (naples_id, ed_nov_id, '197', 'Precertification/authorization/notification absent', 14, 32400.00, 75.00, 'UnitedHealthcare Commercial'),
            (naples_id, ed_nov_id, '97', 'Payment adjusted because benefit included in another procedure', 11, 24600.00, 88.00, 'Aetna Choice POS II'),
            (naples_id, ed_nov_id, '50', 'Non-covered services / medical necessity LCD gap', 7, 19500.00, 70.00, 'Florida Blue (BCBS PPO)'),
            (naples_id, ed_nov_id, '16', 'Claim lacks information or has submission/billing error(s)', 9, 11200.00, 80.00, 'Cigna Open Access Plus'),
            (naples_id, ed_nov_id, '29', 'Time limit for filing has expired', 3, 6800.00, 8.85, 'UnitedHealthcare Commercial')
            ON CONFLICT (edition_id, carc_code) DO NOTHING;

            SELECT id INTO den_1_id FROM public.dar_denial_workqueue
            WHERE edition_id = ed_nov_id AND denial_code = 'DEN-2611-01' LIMIT 1;

            IF den_1_id IS NOT NULL THEN
                INSERT INTO public.dar_appeal_resolutions (
                    facility_id, workqueue_id, action_type, actor_email, actor_role,
                    claimed_recovery_usd, notes, sha256_seal
                )
                SELECT naples_id, den_1_id, 'MEDICAL_NECESSITY_ADDENDUM', 'rcm_lead@naplessurgery.com', 'RCM Billing Lead',
                       24300.00, 'Attached surgeon operative dictation and retro-auth peer-to-peer reference #UHC-9918.',
                       'sha256_dar_77a8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.dar_appeal_resolutions a
                    WHERE a.workqueue_id = den_1_id AND a.action_type = 'MEDICAL_NECESSITY_ADDENDUM'
                );
            END IF;

            INSERT INTO public.dar_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_nov_id, 'RPT-H8-RUN-NOV-01', 'PORTAL_INBOX', 'XLSX', 4, 'DELIVERED',
                   'rcm_lead@naplessurgery.com',
                   'sha256_dar_88b92a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.dar_dispatch_logs l WHERE l.edition_id = ed_nov_id AND l.rpt_execution_code = 'RPT-H8-RUN-NOV-01'
            );
        END IF;
    END IF;
END $$;
