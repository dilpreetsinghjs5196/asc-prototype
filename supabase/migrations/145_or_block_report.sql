-- ==============================================================================
-- Migration: 145_or_block_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H7)
-- Description: OR Block Utilization Report Editions, Suite Benchmarks,
--              Conserved Block Time & Opportunity Cost Scorecards,
--              Release Compliance Events, MEC Governance Actions & H0 Dispatches.
-- ==============================================================================

-- 1. OR Block Report Governance & Benchmark Config Table
CREATE TABLE IF NOT EXISTS public.obr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    target_block_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 75.00,
    max_allowable_turnover_mins INT NOT NULL DEFAULT 45 CHECK (max_allowable_turnover_mins >= 10),
    release_notice_cutoff_hours INT NOT NULL DEFAULT 72 CHECK (release_notice_cutoff_hours >= 12),
    hourly_margin_benchmark_usd NUMERIC(10,2) NOT NULL DEFAULT 1250.00,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_obr_config UNIQUE (facility_id),
    CONSTRAINT chk_obr_target_util CHECK (
        target_block_utilization_pct >= 20.00 AND target_block_utilization_pct <= 100.00
    )
);

-- 2. OR Suite Benchmark Matrix Table
CREATE TABLE IF NOT EXISTS public.obr_suite_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    suite_name VARCHAR(64) NOT NULL,
    target_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 75.00,
    target_turnover_minutes INT NOT NULL DEFAULT 18,
    fcots_target_pct NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    revenue_per_hour_target_usd NUMERIC(10,2) NOT NULL DEFAULT 3200.00,
    CONSTRAINT unq_facility_obr_suite UNIQUE (facility_id, suite_name)
);

-- 3. OR Block Report Compiled Editions Table
CREATE TABLE IF NOT EXISTS public.obr_report_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_code VARCHAR(48) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    edition_status VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED' CHECK (
        edition_status IN ('DRAFT', 'PUBLISHED', 'MEC_REVIEWED')
    ),
    blocks_evaluated INT NOT NULL DEFAULT 0,
    total_allocated_hours NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    total_released_hours NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    total_utilized_hours NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    total_abandoned_idle_hours NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    facility_adjusted_util_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    total_contribution_margin_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    recoverable_capacity_value_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_obr_edition UNIQUE (facility_id, period_code)
);

-- 4. Ranked OR Block Utilization Scorecards Table
CREATE TABLE IF NOT EXISTS public.obr_block_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.obr_report_editions(id) ON DELETE CASCADE,
    block_owner_code VARCHAR(32) NOT NULL,
    block_owner_name VARCHAR(128) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    suite_name VARCHAR(64) NOT NULL,
    allocated_minutes INT NOT NULL DEFAULT 0,
    on_time_released_minutes INT NOT NULL DEFAULT 0,
    utilized_in_block_minutes INT NOT NULL DEFAULT 0,
    abandoned_idle_minutes INT NOT NULL DEFAULT 0,
    raw_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    adjusted_utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    avg_turnover_minutes INT NOT NULL DEFAULT 18,
    fcots_on_time_pct NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    contribution_margin_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    margin_per_utilized_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    opportunity_cost_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    block_tier VARCHAR(32) NOT NULL CHECK (
        block_tier IN ('EXCEEDS_BENCHMARK', 'MEETS_BENCHMARK', 'UNDERUTILIZED_WARNING', 'CRITICAL_UNDERUTILIZATION')
    ),
    rightsizing_action VARCHAR(32) NOT NULL CHECK (
        rightsizing_action IN ('EXPAND_ALLOCATION', 'MAINTAIN', 'PROBATIONARY_NOTICE', 'RIGHTSIZE_DOWNGRADE')
    ),
    rank_in_facility INT NOT NULL DEFAULT 1,
    sha256_card_seal VARCHAR(128) NOT NULL,
    CONSTRAINT unq_obr_card_edition_owner UNIQUE (edition_id, block_owner_code)
);

-- 5. OR Block Release Compliance Events Table
CREATE TABLE IF NOT EXISTS public.obr_release_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.obr_block_scorecards(id) ON DELETE CASCADE,
    block_date DATE NOT NULL,
    suite_name VARCHAR(64) NOT NULL,
    released_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    notice_hours_prior INT NOT NULL DEFAULT 72,
    release_classification VARCHAR(32) NOT NULL CHECK (
        release_classification IN ('COMPLIANT_ON_TIME', 'LATE_RELEASE', 'NO_SHOW_ABANDONED')
    ),
    backfilled_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    recovered_margin_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00
);

-- 6. MEC Block Governance Action Audit Table
CREATE TABLE IF NOT EXISTS public.obr_mec_governance_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.obr_block_scorecards(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('EXPAND_BLOCK', 'ISSUE_60D_NOTICE', 'DOWNGRADE_FORFEIT', 'APPROVE_REALLOCATION')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    hours_delta NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. OR Block Report H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.obr_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.obr_report_editions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_obr_editions_facility_period ON public.obr_report_editions (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_obr_cards_edition_rank ON public.obr_block_scorecards (edition_id, rank_in_facility ASC);
CREATE INDEX IF NOT EXISTS idx_obr_mec_card ON public.obr_mec_governance_actions (facility_id, scorecard_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_obr_telemetry AS
SELECT
    c.facility_id,
    c.target_block_utilization_pct,
    c.release_notice_cutoff_hours,
    c.hourly_margin_benchmark_usd,
    c.sync_status,
    c.health_status,
    (SELECT e.edition_code FROM public.obr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_edition_code,
    (SELECT e.blocks_evaluated FROM public.obr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS blocks_evaluated,
    (SELECT e.facility_adjusted_util_pct FROM public.obr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS facility_adjusted_util_pct,
    (SELECT e.total_utilized_hours FROM public.obr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_utilized_hours,
    (SELECT e.recoverable_capacity_value_usd FROM public.obr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS recoverable_capacity_value_usd,
    (SELECT e.sha256_report_seal FROM public.obr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_sync_seal
FROM public.obr_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.obr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obr_suite_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obr_report_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obr_block_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obr_release_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obr_mec_governance_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obr_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS obr_configs_tenant_iso ON public.obr_configs;
CREATE POLICY obr_configs_tenant_iso ON public.obr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS obr_bench_tenant_iso ON public.obr_suite_benchmarks;
CREATE POLICY obr_bench_tenant_iso ON public.obr_suite_benchmarks USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS obr_editions_tenant_iso ON public.obr_report_editions;
CREATE POLICY obr_editions_tenant_iso ON public.obr_report_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS obr_cards_tenant_iso ON public.obr_block_scorecards;
CREATE POLICY obr_cards_tenant_iso ON public.obr_block_scorecards USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS obr_rel_tenant_iso ON public.obr_release_events;
CREATE POLICY obr_rel_tenant_iso ON public.obr_release_events USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS obr_mec_tenant_iso ON public.obr_mec_governance_actions;
CREATE POLICY obr_mec_tenant_iso ON public.obr_mec_governance_actions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS obr_dispatch_tenant_iso ON public.obr_dispatch_logs;
CREATE POLICY obr_dispatch_tenant_iso ON public.obr_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_nov_id UUID;
    card_wal_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.obr_configs (
            facility_id, target_block_utilization_pct, max_allowable_turnover_mins,
            release_notice_cutoff_hours, hourly_margin_benchmark_usd,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 75.00, 45, 72, 1250.00,
            'obr_sec_****_naples_7301', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.obr_suite_benchmarks (
            facility_id, suite_name, target_utilization_pct, target_turnover_minutes,
            fcots_target_pct, revenue_per_hour_target_usd
        ) VALUES
        (naples_id, 'OR Suite 1 (Ortho)', 80.00, 19, 92.00, 4100.00),
        (naples_id, 'OR Suite 2 (Sports)', 78.00, 18, 90.00, 3800.00),
        (naples_id, 'OR Suite 3 (Spine)', 76.00, 15, 91.00, 3200.00),
        (naples_id, 'OR Suite 4 (Ophth)', 74.00, 14, 94.00, 2600.00)
        ON CONFLICT (facility_id, suite_name) DO NOTHING;

        INSERT INTO public.obr_report_editions (
            facility_id, edition_code, period_code, edition_status,
            blocks_evaluated, total_allocated_hours, total_released_hours,
            total_utilized_hours, total_abandoned_idle_hours, facility_adjusted_util_pct,
            total_contribution_margin_usd, recoverable_capacity_value_usd,
            compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'OBR-2026-11-NAP', '2026-11', 'PUBLISHED',
            4, 240.00, 16.00, 197.00, 27.00, 87.95, 706240.00, 33750.00,
            'or_director@naplessurgery.com',
            'sha256_obr_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, period_code) DO NOTHING;

        SELECT id INTO ed_nov_id FROM public.obr_report_editions
        WHERE facility_id = naples_id AND period_code = '2026-11' LIMIT 1;

        IF ed_nov_id IS NOT NULL THEN
            INSERT INTO public.obr_block_scorecards (
                facility_id, edition_id, block_owner_code, block_owner_name, specialty, suite_name,
                allocated_minutes, on_time_released_minutes, utilized_in_block_minutes, abandoned_idle_minutes,
                raw_utilization_pct, adjusted_utilization_pct, avg_turnover_minutes, fcots_on_time_pct,
                contribution_margin_usd, margin_per_utilized_hour_usd, opportunity_cost_usd,
                block_tier, rightsizing_action, rank_in_facility, sha256_card_seal
            ) VALUES
            (naples_id, ed_nov_id, 'BLK-MAL', 'Dr. Malinoski Kelly Block', 'Orthopedic Surgery', 'OR Suite 1 (Ortho)', 4200, 240, 3750, 210, 89.29, 94.70, 17, 94.50, 263450.00, 4215.20, 4375.00, 'EXCEEDS_BENCHMARK', 'EXPAND_ALLOCATION', 1, 'sha256_obr_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'),
            (naples_id, ed_nov_id, 'BLK-GAR', 'Dr. Gardner Paul Block', 'Sports Medicine', 'OR Suite 2 (Sports)', 3600, 240, 3060, 300, 85.00, 91.07, 18, 91.20, 215630.00, 4228.04, 6250.00, 'EXCEEDS_BENCHMARK', 'EXPAND_ALLOCATION', 2, 'sha256_obr_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'),
            (naples_id, ed_nov_id, 'BLK-BON', 'Dr. Bonett Andrew Block', 'Pain / Spine', 'OR Suite 3 (Spine)', 3600, 240, 2970, 390, 82.50, 88.39, 16, 89.00, 157850.00, 3188.89, 8125.00, 'EXCEEDS_BENCHMARK', 'EXPAND_ALLOCATION', 3, 'sha256_obr_44d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d'),
            (naples_id, ed_nov_id, 'BLK-WAL', 'Dr. Walsh Mark Block', 'Ophthalmology', 'OR Suite 4 (Ophth)', 3000, 240, 2040, 720, 68.00, 73.91, 21, 82.40, 69310.00, 2038.53, 15000.00, 'UNDERUTILIZED_WARNING', 'PROBATIONARY_NOTICE', 4, 'sha256_obr_55e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e')
            ON CONFLICT (edition_id, block_owner_code) DO NOTHING;

            SELECT id INTO card_wal_id FROM public.obr_block_scorecards
            WHERE edition_id = ed_nov_id AND block_owner_code = 'BLK-WAL' LIMIT 1;

            IF card_wal_id IS NOT NULL THEN
                INSERT INTO public.obr_release_events (
                    facility_id, scorecard_id, block_date, suite_name, released_hours,
                    notice_hours_prior, release_classification, backfilled_hours, recovered_margin_usd
                )
                SELECT naples_id, card_wal_id, v.bdt::date, v.ste, v.rhrs, v.nhrs, v.cls, v.bhrs, v.rec
                FROM (
                    VALUES
                    ('2026-11-12', 'OR Suite 4 (Ophth)', 4.00, 96, 'COMPLIANT_ON_TIME', 3.50, 7350.00),
                    ('2026-11-19', 'OR Suite 4 (Ophth)', 6.00, 18, 'LATE_RELEASE', 1.50, 2800.00)
                ) AS v(bdt, ste, rhrs, nhrs, cls, bhrs, rec)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.obr_release_events r
                    WHERE r.scorecard_id = card_wal_id AND r.block_date = v.bdt::date
                );

                INSERT INTO public.obr_mec_governance_actions (
                    facility_id, scorecard_id, action_type, actor_email, actor_role,
                    hours_delta, notes, sha256_seal
                )
                SELECT naples_id, card_wal_id, 'ISSUE_60D_NOTICE', 'or_director@naplessurgery.com', 'Clinical Nursing Director',
                       -4.00, '73.9% adjusted utilization below 75% benchmark; 18h late release caused 10.5 idle OR hrs.',
                       'sha256_obr_66f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.obr_mec_governance_actions m
                    WHERE m.scorecard_id = card_wal_id AND m.action_type = 'ISSUE_60D_NOTICE'
                );
            END IF;

            INSERT INTO public.obr_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_nov_id, 'RPT-H7-RUN-NOV-01', 'PORTAL_INBOX', 'PDF', 4, 'DELIVERED',
                   'or_director@naplessurgery.com',
                   'sha256_obr_77a8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.obr_dispatch_logs l WHERE l.edition_id = ed_nov_id AND l.rpt_execution_code = 'RPT-H7-RUN-NOV-01'
            );
        END IF;
    END IF;
END $$;
