-- ==============================================================================
-- Migration: 138_reporting_architecture.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H0)
-- Description: Report Catalog Definitions (H1-H9), Saved Filter Presets,
--              Automated Cron Delivery Schedules, Execution Ledger,
--              Export Artifacts & Watermarking, and RBAC Access Audit Trail.
-- ==============================================================================

-- 1. Reporting Governance & Trust-Gate Config Table
CREATE TABLE IF NOT EXISTS public.rpt_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    enforce_dq_trust_gate BOOLEAN NOT NULL DEFAULT TRUE,
    min_financial_trust_score NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (
        min_financial_trust_score >= 50.00 AND min_financial_trust_score <= 100.00
    ),
    watermark_draft_exports BOOLEAN NOT NULL DEFAULT TRUE,
    max_export_rows INT NOT NULL DEFAULT 50000 CHECK (max_export_rows >= 100 AND max_export_rows <= 500000),
    default_timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
    retention_days INT NOT NULL DEFAULT 2555 CHECK (retention_days >= 2555),
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_rpt_config UNIQUE (facility_id)
);

-- 2. Canonical Report Definitions Catalog Table
CREATE TABLE IF NOT EXISTS public.rpt_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    report_code VARCHAR(48) NOT NULL,
    report_phase VARCHAR(16) NOT NULL,
    title VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (
        category IN ('EXECUTIVE', 'FINANCE', 'REVENUE_CYCLE', 'CLINICAL_OR', 'SURGEON', 'PAYER')
    ),
    default_filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    supported_formats_json JSONB NOT NULL DEFAULT '["PDF", "CSV", "XLSX", "JSON"]'::jsonb,
    required_permission VARCHAR(64) NOT NULL,
    allowed_roles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_source_modules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    version_tag VARCHAR(24) NOT NULL DEFAULT 'rpt-v1.0.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_rpt_def UNIQUE (facility_id, report_code)
);

-- 3. Saved Filter Presets Table
CREATE TABLE IF NOT EXISTS public.rpt_saved_filters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    filter_name VARCHAR(96) NOT NULL,
    report_code VARCHAR(48) NOT NULL,
    filter_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(128) NOT NULL,
    is_shared_facility_wide BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_rpt_filter_name UNIQUE (facility_id, report_code, filter_name)
);

-- 4. Automated Recurring Delivery Schedules Table
CREATE TABLE IF NOT EXISTS public.rpt_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    schedule_code VARCHAR(48) NOT NULL,
    report_code VARCHAR(48) NOT NULL,
    cadence VARCHAR(24) NOT NULL CHECK (
        cadence IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ON_CLOSE')
    ),
    cron_expression VARCHAR(64) NOT NULL,
    delivery_channel VARCHAR(32) NOT NULL CHECK (
        delivery_channel IN ('EMAIL_DIGEST', 'PORTAL_INBOX', 'SFTP_DROP', 'WEBHOOK')
    ),
    export_format VARCHAR(16) NOT NULL CHECK (export_format IN ('PDF', 'CSV', 'XLSX', 'JSON')),
    recipient_emails_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    filter_preset_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(24) DEFAULT 'READY',
    created_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_rpt_sched_code UNIQUE (facility_id, schedule_code)
);

-- 5. Report Execution Ledger Table
CREATE TABLE IF NOT EXISTS public.rpt_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    execution_code VARCHAR(48) NOT NULL,
    report_code VARCHAR(48) NOT NULL,
    schedule_id UUID REFERENCES public.rpt_schedules(id) ON DELETE SET NULL,
    generation_mode VARCHAR(24) NOT NULL CHECK (
        generation_mode IN ('ON_DEMAND', 'SCHEDULED', 'AI_TOOL')
    ),
    filter_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    export_format VARCHAR(16) NOT NULL CHECK (export_format IN ('PDF', 'CSV', 'XLSX', 'JSON')),
    row_count INT NOT NULL DEFAULT 0,
    dq_trust_score_at_run NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    trust_gate_status VARCHAR(32) NOT NULL CHECK (
        trust_gate_status IN ('CERTIFIED', 'PROVISIONAL_WATERMARKED', 'BLOCKED_TRUST_GATE')
    ),
    status VARCHAR(24) NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED')),
    duration_ms INT NOT NULL DEFAULT 0,
    generated_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_rpt_exec_code UNIQUE (facility_id, execution_code)
);

-- 6. Export Artifacts & Watermark Checksums Table
CREATE TABLE IF NOT EXISTS public.rpt_export_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES public.rpt_executions(id) ON DELETE CASCADE,
    artifact_code VARCHAR(48) NOT NULL,
    export_format VARCHAR(16) NOT NULL CHECK (export_format IN ('PDF', 'CSV', 'XLSX', 'JSON')),
    file_name VARCHAR(160) NOT NULL,
    byte_size INT NOT NULL DEFAULT 0,
    is_watermarked BOOLEAN NOT NULL DEFAULT FALSE,
    watermark_text VARCHAR(160),
    content_checksum_sha256 VARCHAR(128) NOT NULL,
    exported_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_rpt_artifact_code UNIQUE (facility_id, artifact_code)
);

-- 7. Security & Export Access Audit Log Table
CREATE TABLE IF NOT EXISTS public.rpt_access_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    report_code VARCHAR(48) NOT NULL,
    execution_id UUID REFERENCES public.rpt_executions(id) ON DELETE SET NULL,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('VIEW_REPORT', 'GENERATE_RUN', 'EXPORT_DOWNLOAD', 'SCHEDULE_CREATE', 'SCHEDULE_TOGGLE', 'ACCESS_DENIED')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    access_granted BOOLEAN NOT NULL DEFAULT TRUE,
    denial_reason TEXT,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rpt_defs_facility_cat ON public.rpt_definitions (facility_id, category, is_active);
CREATE INDEX IF NOT EXISTS idx_rpt_sched_facility_enabled ON public.rpt_schedules (facility_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_rpt_exec_facility_created ON public.rpt_executions (facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rpt_audit_facility_created ON public.rpt_access_audit (facility_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_rpt_telemetry AS
SELECT
    c.facility_id,
    c.enforce_dq_trust_gate,
    c.min_financial_trust_score,
    c.max_export_rows,
    c.sync_status,
    c.health_status,
    (SELECT COUNT(*) FROM public.rpt_definitions d WHERE d.facility_id = c.facility_id AND d.is_active = TRUE) AS active_definitions_count,
    (SELECT COUNT(*) FROM public.rpt_schedules s WHERE s.facility_id = c.facility_id AND s.is_enabled = TRUE) AS enabled_schedules_count,
    (SELECT COUNT(*) FROM public.rpt_executions e WHERE e.facility_id = c.facility_id AND e.status = 'COMPLETED') AS completed_executions_count,
    (SELECT COUNT(*) FROM public.rpt_access_audit a WHERE a.facility_id = c.facility_id AND a.access_granted = FALSE) AS access_denials_count,
    (SELECT e.sha256_report_seal FROM public.rpt_executions e WHERE e.facility_id = c.facility_id ORDER BY e.created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.rpt_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.rpt_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpt_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpt_saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpt_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpt_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpt_export_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rpt_access_audit ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS rpt_configs_tenant_iso ON public.rpt_configs;
CREATE POLICY rpt_configs_tenant_iso ON public.rpt_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rpt_defs_tenant_iso ON public.rpt_definitions;
CREATE POLICY rpt_defs_tenant_iso ON public.rpt_definitions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rpt_filters_tenant_iso ON public.rpt_saved_filters;
CREATE POLICY rpt_filters_tenant_iso ON public.rpt_saved_filters USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rpt_sched_tenant_iso ON public.rpt_schedules;
CREATE POLICY rpt_sched_tenant_iso ON public.rpt_schedules USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rpt_exec_tenant_iso ON public.rpt_executions;
CREATE POLICY rpt_exec_tenant_iso ON public.rpt_executions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rpt_artifacts_tenant_iso ON public.rpt_export_artifacts;
CREATE POLICY rpt_artifacts_tenant_iso ON public.rpt_export_artifacts USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rpt_audit_tenant_iso ON public.rpt_access_audit;
CREATE POLICY rpt_audit_tenant_iso ON public.rpt_access_audit USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    sched_h1_id UUID;
    exec_1_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.rpt_configs (
            facility_id, enforce_dq_trust_gate, min_financial_trust_score,
            watermark_draft_exports, max_export_rows, default_timezone, retention_days,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, TRUE, 75.00, TRUE, 50000, 'America/New_York', 2555,
            'rpt_sec_****_naples_8109', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.rpt_definitions (
            facility_id, report_code, report_phase, title, category,
            default_filters_json, supported_formats_json, required_permission,
            allowed_roles_json, data_source_modules_json, version_tag
        ) VALUES
        (naples_id, 'RPT-H1-DAILY-BRIEF', 'H1', 'Daily Administrator Operational Brief', 'EXECUTIVE', '{"window": "LAST_24H"}'::jsonb, '["PDF", "CSV", "JSON"]'::jsonb, 'reports.view_executive', '["Facility Administrator", "CFO / Finance Director", "Clinical Nursing Director", "Data Operations Steward"]'::jsonb, '["SIS_EHR", "OR_BLOCK", "DATA_QUALITY"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H2-LEAKAGE', 'H2', 'Weekly Revenue Leakage & Carveout Report', 'REVENUE_CYCLE', '{"window": "LAST_7D"}'::jsonb, '["PDF", "XLSX", "CSV", "JSON"]'::jsonb, 'reports.view_rcm', '["Facility Administrator", "CFO / Finance Director", "RCM Billing Lead", "Data Operations Steward"]'::jsonb, '["REVENUE_LEAKAGE", "CLEARINGHOUSE_EDI"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H3-MONTHLY-CFO', 'H3', 'Monthly CFO Margin, Cash & Variance Dossier', 'FINANCE', '{"window": "MTD"}'::jsonb, '["PDF", "XLSX", "JSON"]'::jsonb, 'reports.view_cfo', '["Facility Administrator", "CFO / Finance Director", "Controller"]'::jsonb, '["MANAGEMENT_PNL", "CASH_FORECAST", "FINANCIAL_COMPLETENESS"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H4-SURGEON-CARD', 'H4', 'Surgeon Financial & Preference Scorecard', 'SURGEON', '{"window": "LAST_30D"}'::jsonb, '["PDF", "XLSX", "CSV"]'::jsonb, 'reports.view_surgeon', '["Facility Administrator", "CFO / Finance Director", "Medical Director"]'::jsonb, '["SURGEON_INTELLIGENCE", "INVENTORY_POU"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H5-PAYER-CARD', 'H5', 'Payer Reimbursement & Contract Variance Scorecard', 'PAYER', '{"window": "LAST_90D"}'::jsonb, '["PDF", "XLSX", "CSV"]'::jsonb, 'reports.view_payer', '["Facility Administrator", "CFO / Finance Director", "RCM Billing Lead"]'::jsonb, '["PAYER_INTELLIGENCE", "EDI_835"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H6-CPT-ECON', 'H6', 'CPT Procedure Unit Economics & Cost Breakdown', 'FINANCE', '{"window": "LAST_90D"}'::jsonb, '["XLSX", "CSV", "PDF"]'::jsonb, 'reports.view_finance', '["Facility Administrator", "CFO / Finance Director", "Controller"]'::jsonb, '["CPT_INTELLIGENCE", "CASE_COST_MODEL"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H7-OR-BLOCK', 'H7', 'OR Block Utilization, Releases & Turnover Digest', 'CLINICAL_OR', '{"window": "LAST_30D"}'::jsonb, '["PDF", "CSV"]'::jsonb, 'reports.view_or', '["Facility Administrator", "Clinical Nursing Director", "OR Scheduler"]'::jsonb, '["OR_UTILIZATION", "SIS_EHR"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H8-DENIAL-AR', 'H8', 'Denials, Appeals & AR Aging Workqueue Report', 'REVENUE_CYCLE', '{"window": "CURRENT_AR"}'::jsonb, '["XLSX", "CSV", "PDF"]'::jsonb, 'reports.view_rcm', '["Facility Administrator", "CFO / Finance Director", "RCM Billing Lead"]'::jsonb, '["DENIALS_MODEL", "AR_AGING"]'::jsonb, 'rpt-v1.0.0'),
        (naples_id, 'RPT-H9-BOARD-PKG', 'H9', 'Quarterly Executive Board Governance Package', 'EXECUTIVE', '{"window": "QUARTERLY"}'::jsonb, '["PDF", "JSON"]'::jsonb, 'reports.approve_board_pkg', '["Facility Administrator", "CFO / Finance Director"]'::jsonb, '["BOARD_REPORTING", "ROI_VALUE_REPORT", "FINANCIAL_COMPLETENESS"]'::jsonb, 'rpt-v1.0.0')
        ON CONFLICT (facility_id, report_code) DO NOTHING;

        INSERT INTO public.rpt_saved_filters (
            facility_id, filter_name, report_code, filter_payload_json, created_by
        ) VALUES (
            naples_id, 'Ortho Q4 Margin Watch', 'RPT-H4-SURGEON-CARD',
            '{"date_from": "2026-10-01", "date_to": "2026-11-26", "specialty": "Orthopedic Surgery", "row_limit": 250}'::jsonb,
            'cfo@naplessurgery.com'
        ) ON CONFLICT (facility_id, report_code, filter_name) DO NOTHING;

        INSERT INTO public.rpt_schedules (
            facility_id, schedule_code, report_code, cadence, cron_expression,
            delivery_channel, export_format, recipient_emails_json,
            is_enabled, last_run_status, created_by
        ) VALUES
        (naples_id, 'SCH-DAILY-ADMIN', 'RPT-H1-DAILY-BRIEF', 'DAILY', '0 6 * * 1-5', 'EMAIL_DIGEST', 'PDF', '["admin@naplessurgery.com", "nursing_dir@naplessurgery.com"]'::jsonb, TRUE, 'SUCCESS', 'admin@naplessurgery.com'),
        (naples_id, 'SCH-WEEKLY-LEAK', 'RPT-H2-LEAKAGE', 'WEEKLY', '0 7 * * 1', 'PORTAL_INBOX', 'XLSX', '["cfo@naplessurgery.com", "rcm_lead@naplessurgery.com"]'::jsonb, TRUE, 'SUCCESS', 'cfo@naplessurgery.com')
        ON CONFLICT (facility_id, schedule_code) DO NOTHING;

        SELECT id INTO sched_h1_id FROM public.rpt_schedules WHERE facility_id = naples_id AND schedule_code = 'SCH-DAILY-ADMIN' LIMIT 1;

        INSERT INTO public.rpt_executions (
            facility_id, execution_code, report_code, schedule_id, generation_mode,
            filter_snapshot_json, export_format, row_count, dq_trust_score_at_run,
            trust_gate_status, status, duration_ms, generated_by, sha256_report_seal
        ) VALUES (
            naples_id, 'RPT-RUN-20261127-01', 'RPT-H1-DAILY-BRIEF', sched_h1_id, 'SCHEDULED',
            '{"date_from": "2026-11-26", "date_to": "2026-11-26", "row_limit": 120}'::jsonb,
            'PDF', 48, 94.80, 'CERTIFIED', 'COMPLETED', 312,
            'scheduler.bot@naplessurgery.com',
            'sha256_rpt_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4'
        ) ON CONFLICT (facility_id, execution_code) DO NOTHING;

        SELECT id INTO exec_1_id FROM public.rpt_executions WHERE facility_id = naples_id AND execution_code = 'RPT-RUN-20261127-01' LIMIT 1;

        IF exec_1_id IS NOT NULL THEN
            INSERT INTO public.rpt_export_artifacts (
                facility_id, execution_id, artifact_code, export_format, file_name,
                byte_size, is_watermarked, watermark_text, content_checksum_sha256, exported_by
            ) VALUES (
                naples_id, exec_1_id, 'ART-20261127-01', 'PDF', 'Naples_Daily_Admin_Brief_20261127.pdf',
                184320, FALSE, NULL,
                'sha256_rpt_b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5',
                'scheduler.bot@naplessurgery.com'
            ) ON CONFLICT (facility_id, artifact_code) DO NOTHING;
        END IF;

        INSERT INTO public.rpt_access_audit (
            facility_id, report_code, execution_id, action_type,
            actor_email, actor_role, access_granted, sha256_seal
        )
        SELECT naples_id, 'RPT-H1-DAILY-BRIEF', exec_1_id, 'GENERATE_RUN',
               'scheduler.bot@naplessurgery.com', 'Facility Administrator', TRUE,
               'sha256_rpt_c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.rpt_access_audit
            WHERE facility_id = naples_id AND report_code = 'RPT-H1-DAILY-BRIEF' AND action_type = 'GENERATE_RUN'
        );
    END IF;
END $$;
