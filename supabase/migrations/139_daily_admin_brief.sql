-- ==============================================================================
-- Migration: 139_daily_admin_brief.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H1)
-- Description: Daily Administrator Brief Snapshots, Prioritized P0/P1 Action
--              Blockers, OR Suite Pulse, Surgeon Day Roster, Admin Sign-Offs,
--              and H0 Morning Digest Dispatch Provenance.
-- ==============================================================================

-- 1. Daily Brief Governance Configuration Table
CREATE TABLE IF NOT EXISTS public.dab_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    brief_cutoff_hour INT NOT NULL DEFAULT 6 CHECK (brief_cutoff_hour >= 0 AND brief_cutoff_hour <= 23),
    prebill_hold_alert_limit INT NOT NULL DEFAULT 3 CHECK (prebill_hold_alert_limit >= 1),
    or_idle_alert_minutes INT NOT NULL DEFAULT 45 CHECK (or_idle_alert_minutes >= 10),
    include_cash_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
    include_dq_gate_status BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dab_config UNIQUE (facility_id)
);

-- 2. Daily Brief Compiled Snapshots Table
CREATE TABLE IF NOT EXISTS public.dab_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    brief_code VARCHAR(48) NOT NULL,
    brief_date DATE NOT NULL,
    scheduled_cases_count INT NOT NULL DEFAULT 0,
    completed_cases_count INT NOT NULL DEFAULT 0,
    cancelled_cases_count INT NOT NULL DEFAULT 0,
    or_prime_time_util_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    fcots_on_time_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    avg_turnover_minutes INT NOT NULL DEFAULT 0,
    projected_net_revenue_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    projected_contribution_margin_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    unbilled_hold_cases_count INT NOT NULL DEFAULT 0,
    open_ieq_exceptions_count INT NOT NULL DEFAULT 0,
    dq_trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    readiness_status VARCHAR(32) NOT NULL CHECK (
        readiness_status IN ('GREEN_ON_TRACK', 'AMBER_ATTENTION_REQUIRED', 'RED_ACTION_CRITICAL')
    ),
    executive_headline TEXT NOT NULL,
    generated_by VARCHAR(128) NOT NULL,
    sha256_brief_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dab_snapshot_date UNIQUE (facility_id, brief_date)
);

-- 3. Prioritized Admin Action Blockers Table
CREATE TABLE IF NOT EXISTS public.dab_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.dab_daily_snapshots(id) ON DELETE CASCADE,
    action_code VARCHAR(48) NOT NULL,
    priority_tier VARCHAR(16) NOT NULL CHECK (priority_tier IN ('P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM')),
    domain VARCHAR(32) NOT NULL CHECK (
        domain IN ('OR_OPERATIONS', 'CLINICAL_DOCUMENTATION', 'REVENUE_CYCLE', 'MATERIALS_IMPLANT', 'DATA_QUALITY')
    ),
    title VARCHAR(160) NOT NULL,
    detail_summary TEXT NOT NULL,
    financial_impact_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    owner_role VARCHAR(64) NOT NULL,
    assignee_email VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DEFERRED')),
    acknowledged_by VARCHAR(128),
    resolution_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dab_action_code UNIQUE (facility_id, action_code)
);

-- 4. OR Suite Morning Pulse Table
CREATE TABLE IF NOT EXISTS public.dab_or_suite_pulse (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.dab_daily_snapshots(id) ON DELETE CASCADE,
    room_code VARCHAR(32) NOT NULL,
    specialty_primary VARCHAR(64) NOT NULL,
    scheduled_cases INT NOT NULL DEFAULT 0,
    booked_minutes INT NOT NULL DEFAULT 0,
    available_prime_minutes INT NOT NULL DEFAULT 480,
    utilization_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    fcots_delay_minutes INT NOT NULL DEFAULT 0,
    avg_turnover_minutes INT NOT NULL DEFAULT 0,
    open_backfill_minutes INT NOT NULL DEFAULT 0,
    CONSTRAINT unq_facility_dab_suite_room UNIQUE (snapshot_id, room_code)
);

-- 5. Surgeon Daily Schedule & Readiness Roster Table
CREATE TABLE IF NOT EXISTS public.dab_surgeon_day_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.dab_daily_snapshots(id) ON DELETE CASCADE,
    surgeon_name VARCHAR(128) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    scheduled_cases INT NOT NULL DEFAULT 0,
    doc_hold_count INT NOT NULL DEFAULT 0,
    implant_alert_count INT NOT NULL DEFAULT 0,
    projected_margin_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    readiness_flag VARCHAR(24) NOT NULL CHECK (readiness_flag IN ('CLEARED', 'HOLD_WARNING', 'CRITICAL_MISSING'))
);

-- 6. Administrator Acknowledgments & Sign-Off Trail Table
CREATE TABLE IF NOT EXISTS public.dab_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.dab_daily_snapshots(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('PUBLISH_BRIEF', 'ADMIN_SIGN_OFF', 'ESCALATE_HOLD', 'ACTION_RESOLVE')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    notes TEXT,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Morning Brief H0 Digest Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.dab_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.dab_daily_snapshots(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_dab_snapshots_facility_date ON public.dab_daily_snapshots (facility_id, brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_dab_actions_snapshot_status ON public.dab_action_items (facility_id, snapshot_id, status);
CREATE INDEX IF NOT EXISTS idx_dab_ack_snapshot_created ON public.dab_acknowledgments (facility_id, snapshot_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_dab_telemetry AS
SELECT
    c.facility_id,
    c.brief_cutoff_hour,
    c.prebill_hold_alert_limit,
    c.sync_status,
    c.health_status,
    (SELECT s.brief_code FROM public.dab_daily_snapshots s WHERE s.facility_id = c.facility_id ORDER BY s.brief_date DESC LIMIT 1) AS latest_brief_code,
    (SELECT s.or_prime_time_util_pct FROM public.dab_daily_snapshots s WHERE s.facility_id = c.facility_id ORDER BY s.brief_date DESC LIMIT 1) AS latest_or_util_pct,
    (SELECT s.projected_contribution_margin_usd FROM public.dab_daily_snapshots s WHERE s.facility_id = c.facility_id ORDER BY s.brief_date DESC LIMIT 1) AS latest_projected_margin_usd,
    (SELECT s.readiness_status FROM public.dab_daily_snapshots s WHERE s.facility_id = c.facility_id ORDER BY s.brief_date DESC LIMIT 1) AS latest_readiness_status,
    (SELECT COUNT(*) FROM public.dab_action_items a WHERE a.facility_id = c.facility_id AND a.status IN ('OPEN', 'ACKNOWLEDGED')) AS open_action_count,
    (SELECT s.sha256_brief_seal FROM public.dab_daily_snapshots s WHERE s.facility_id = c.facility_id ORDER BY s.brief_date DESC LIMIT 1) AS latest_sync_seal
FROM public.dab_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.dab_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dab_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dab_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dab_or_suite_pulse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dab_surgeon_day_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dab_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dab_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS dab_configs_tenant_iso ON public.dab_configs;
CREATE POLICY dab_configs_tenant_iso ON public.dab_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dab_snapshots_tenant_iso ON public.dab_daily_snapshots;
CREATE POLICY dab_snapshots_tenant_iso ON public.dab_daily_snapshots USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dab_actions_tenant_iso ON public.dab_action_items;
CREATE POLICY dab_actions_tenant_iso ON public.dab_action_items USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dab_suite_tenant_iso ON public.dab_or_suite_pulse;
CREATE POLICY dab_suite_tenant_iso ON public.dab_or_suite_pulse USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dab_roster_tenant_iso ON public.dab_surgeon_day_roster;
CREATE POLICY dab_roster_tenant_iso ON public.dab_surgeon_day_roster USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dab_ack_tenant_iso ON public.dab_acknowledgments;
CREATE POLICY dab_ack_tenant_iso ON public.dab_acknowledgments USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS dab_dispatch_tenant_iso ON public.dab_dispatch_logs;
CREATE POLICY dab_dispatch_tenant_iso ON public.dab_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    snap_today_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.dab_configs (
            facility_id, brief_cutoff_hour, prebill_hold_alert_limit, or_idle_alert_minutes,
            include_cash_snapshot, include_dq_gate_status, client_secret_encrypted,
            sync_status, health_status
        ) VALUES (
            naples_id, 6, 3, 45, TRUE, TRUE,
            'dab_sec_****_naples_6014', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.dab_daily_snapshots (
            facility_id, brief_code, brief_date,
            scheduled_cases_count, completed_cases_count, cancelled_cases_count,
            or_prime_time_util_pct, fcots_on_time_rate_pct, avg_turnover_minutes,
            projected_net_revenue_usd, projected_contribution_margin_usd,
            unbilled_hold_cases_count, open_ieq_exceptions_count, dq_trust_score,
            readiness_status, executive_headline, generated_by, sha256_brief_seal
        ) VALUES (
            naples_id, 'DAB-20261127-NAP', '2026-11-27',
            22, 0, 1,
            84.50, 80.00, 19,
            96400.00, 52180.00,
            2, 2, 94.80,
            'RED_ACTION_CRITICAL',
            '22 cases scheduled across 5 suites ($52,180 est. margin); 1 P0 expired implant lot & 1 OR-3 anesthesia start risk.',
            'scheduler.bot@naplessurgery.com',
            'sha256_dab_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, brief_date) DO NOTHING;

        SELECT id INTO snap_today_id FROM public.dab_daily_snapshots
        WHERE facility_id = naples_id AND brief_date = '2026-11-27' LIMIT 1;

        IF snap_today_id IS NOT NULL THEN
            INSERT INTO public.dab_action_items (
                facility_id, snapshot_id, action_code, priority_tier, domain,
                title, detail_summary, financial_impact_usd, owner_role, assignee_email, status
            ) VALUES
            (naples_id, snap_today_id, 'DAB-ACT-101', 'P0_CRITICAL', 'MATERIALS_IMPLANT', 'Quarantined SwiveLock Implant Lot Flagged for OR-2', 'SKU AR-2324BCM lot verification alert from Phase G3 IEQ ticket EXC-2026-103 before 08:30 AM case.', 4250.00, 'Materials Manager', 'materials_mgr@naplesasc.com', 'OPEN'),
            (naples_id, snap_today_id, 'DAB-ACT-102', 'P1_HIGH', 'CLINICAL_DOCUMENTATION', '2 Signed H&P / Consent Forms Missing for Afternoon Block', 'Orthopedic cases CAS-1127-14 and CAS-1127-17 require attending attestation prior to pre-op check-in.', 6800.00, 'Clinical Nursing Director', 'nursing_dir@naplesasc.com', 'OPEN'),
            (naples_id, snap_today_id, 'DAB-ACT-103', 'P2_MEDIUM', 'OR_OPERATIONS', 'OR-4 Backfill Opportunity (75 Min Open Prime Window)', 'Cancelled podiatry case opened 13:15–14:30 gap; push waitlist arthroscopy case to capture utilization.', 2950.00, 'OR Scheduler', 'or_scheduler@naplesasc.com', 'ACKNOWLEDGED')
            ON CONFLICT (facility_id, action_code) DO NOTHING;

            INSERT INTO public.dab_or_suite_pulse (
                facility_id, snapshot_id, room_code, specialty_primary,
                scheduled_cases, booked_minutes, available_prime_minutes, utilization_pct,
                fcots_delay_minutes, avg_turnover_minutes, open_backfill_minutes
            ) VALUES
            (naples_id, snap_today_id, 'OR-01', 'Orthopedic Surgery', 5, 435, 480, 90.63, 0, 18, 45),
            (naples_id, snap_today_id, 'OR-02', 'Sports Medicine', 5, 410, 480, 85.42, 5, 19, 70),
            (naples_id, snap_today_id, 'OR-03', 'Pain / Spine', 6, 420, 480, 87.50, 12, 16, 60),
            (naples_id, snap_today_id, 'OR-04', 'Podiatry / General', 3, 355, 480, 73.96, 0, 22, 125),
            (naples_id, snap_today_id, 'OR-05', 'Ophthalmology', 3, 408, 480, 85.00, 0, 18, 72)
            ON CONFLICT (snapshot_id, room_code) DO NOTHING;

            INSERT INTO public.dab_surgeon_day_roster (
                facility_id, snapshot_id, surgeon_name, specialty,
                scheduled_cases, doc_hold_count, implant_alert_count, projected_margin_usd, readiness_flag
            )
            SELECT naples_id, snap_today_id, v.s_name, v.spec, v.cnt, v.doc_h, v.imp_a, v.mrg, v.flg
            FROM (
                VALUES
                ('Dr. Malinoski Kelly', 'Orthopedic Surgery', 6, 0, 1, 21450.00, 'CRITICAL_MISSING'),
                ('Dr. Gardner Paul', 'Sports Medicine', 5, 1, 0, 14820.00, 'HOLD_WARNING'),
                ('Dr. Bonett Andrew', 'Pain / Spine', 6, 1, 0, 9860.00, 'HOLD_WARNING'),
                ('Dr. Walsh Mark', 'Ophthalmology', 5, 0, 0, 6050.00, 'CLEARED')
            ) AS v(s_name, spec, cnt, doc_h, imp_a, mrg, flg)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.dab_surgeon_day_roster r
                WHERE r.snapshot_id = snap_today_id AND r.surgeon_name = v.s_name
            );

            INSERT INTO public.dab_acknowledgments (
                facility_id, snapshot_id, action_type, actor_email, actor_role, notes, sha256_seal
            )
            SELECT naples_id, snap_today_id, 'PUBLISH_BRIEF', 'scheduler.bot@naplessurgery.com', 'System H0 Scheduler',
                   'Morning 06:00 AM automated compilation sealed from SIS_EHR, Case Completeness G1 & IEQ G3.',
                   'sha256_dab_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.dab_acknowledgments k
                WHERE k.snapshot_id = snap_today_id AND k.action_type = 'PUBLISH_BRIEF'
            );

            INSERT INTO public.dab_dispatch_logs (
                facility_id, snapshot_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, snap_today_id, 'RPT-RUN-20261127-01', 'EMAIL_DIGEST', 'PDF', 2, 'DELIVERED',
                   'scheduler.bot@naplessurgery.com',
                   'sha256_dab_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.dab_dispatch_logs l
                WHERE l.snapshot_id = snap_today_id AND l.rpt_execution_code = 'RPT-RUN-20261127-01'
            );
        END IF;
    END IF;
END $$;
