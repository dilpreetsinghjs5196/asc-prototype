-- ==============================================================================
-- Migration: 135_import_exception_queue.sql
-- Module 16: Enterprise Data Quality Governance (Phase G3)
-- Description: Unified Import Exception Review Queue, Deterministic SLA
--              Tracking, Role-Based Auto-Ownership Routing, Inline Payload
--              Correction & Replay Ledger, and SHA-256 Provenance.
-- ==============================================================================

-- 1. Import Exception Queue Configuration Table
CREATE TABLE IF NOT EXISTS public.ieq_queue_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    critical_sla_hours INT NOT NULL DEFAULT 4,
    high_sla_hours INT NOT NULL DEFAULT 12,
    medium_sla_hours INT NOT NULL DEFAULT 24,
    low_sla_hours INT NOT NULL DEFAULT 72,
    auto_assign_by_domain BOOLEAN NOT NULL DEFAULT TRUE,
    require_reason_for_dismissal BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ieq_config UNIQUE (facility_id)
);

-- 2. Domain Ownership & SLA Routing Matrix Table
CREATE TABLE IF NOT EXISTS public.ieq_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    source_module VARCHAR(48) NOT NULL,
    exception_category VARCHAR(48) NOT NULL,
    assigned_role VARCHAR(64) NOT NULL,
    default_assignee_email VARCHAR(128) NOT NULL,
    sla_hours_override INT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ieq_route UNIQUE (facility_id, source_module, exception_category)
);

-- 3. Unified Import Exception Items Table
CREATE TABLE IF NOT EXISTS public.ieq_exception_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    exception_ticket_code VARCHAR(32) NOT NULL,
    source_module VARCHAR(48) NOT NULL CHECK (
        source_module IN ('SIS_EHR', 'HST_EHR', 'CLEARINGHOUSE_EDI', 'ACCOUNTING_GL', 'PAYROLL_WFM', 'INVENTORY_POU', 'VENDOR_INVOICE', 'EXCEL_CSV')
    ),
    batch_control_number VARCHAR(64) NOT NULL,
    exception_code VARCHAR(48) NOT NULL,
    exception_category VARCHAR(48) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    financial_impact_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    assigned_role VARCHAR(64) NOT NULL,
    assigned_to VARCHAR(128) NOT NULL,
    queue_status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (
        queue_status IN ('OPEN', 'ASSIGNED', 'IN_REVIEW', 'ESCALATED', 'RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED')
    ),
    sla_due_at TIMESTAMPTZ NOT NULL,
    raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    corrected_payload_json JSONB,
    resolution_notes TEXT,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT unq_facility_ieq_ticket UNIQUE (facility_id, exception_ticket_code)
);

-- 4. Per-Ticket Resolution Action Timeline Table
CREATE TABLE IF NOT EXISTS public.ieq_resolution_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    exception_id UUID NOT NULL REFERENCES public.ieq_exception_items(id) ON DELETE CASCADE,
    from_status VARCHAR(32) NOT NULL,
    to_status VARCHAR(32) NOT NULL,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('AUTO_ROUTE', 'CLAIM', 'REASSIGN', 'EDIT_PAYLOAD', 'REPLAY_SUCCESS', 'DISMISS', 'ESCALATE')
    ),
    actor_id VARCHAR(128) NOT NULL,
    action_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Owner Workload Accountability Table
CREATE TABLE IF NOT EXISTS public.ieq_owner_workloads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    role_name VARCHAR(64) NOT NULL,
    assignee_email VARCHAR(128) NOT NULL,
    open_tickets_count INT NOT NULL DEFAULT 0,
    sla_breached_count INT NOT NULL DEFAULT 0,
    avg_resolution_minutes INT NOT NULL DEFAULT 0,
    resolved_mtd_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ieq_owner UNIQUE (facility_id, assignee_email)
);

-- 6. Replay Batch Execution Ledger Table
CREATE TABLE IF NOT EXISTS public.ieq_replay_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    replay_code VARCHAR(64) NOT NULL,
    source_module VARCHAR(48) NOT NULL,
    tickets_replayed INT NOT NULL DEFAULT 0,
    succeeded_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    triggered_by VARCHAR(128) NOT NULL,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ieq_replay UNIQUE (facility_id, replay_code)
);

-- 7. Import Exception Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.ieq_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ieq_configs_fac ON public.ieq_queue_configs (facility_id);
CREATE INDEX IF NOT EXISTS idx_ieq_routes_fac ON public.ieq_routing_rules (facility_id, source_module);
CREATE INDEX IF NOT EXISTS idx_ieq_items_fac_status ON public.ieq_exception_items (facility_id, queue_status, severity);
CREATE INDEX IF NOT EXISTS idx_ieq_items_assignee ON public.ieq_exception_items (facility_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_ieq_actions_exc ON public.ieq_resolution_actions (exception_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ieq_workloads_fac ON public.ieq_owner_workloads (facility_id);
CREATE INDEX IF NOT EXISTS idx_ieq_replays_fac ON public.ieq_replay_batches (facility_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ieq_provenance_fac ON public.ieq_provenance_ledger (facility_id, created_at DESC);

-- Row Level Security (RLS) Tenancy Policies
ALTER TABLE public.ieq_queue_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ieq_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ieq_exception_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ieq_resolution_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ieq_owner_workloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ieq_replay_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ieq_provenance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ieq_config_tenant ON public.ieq_queue_configs;
CREATE POLICY p_ieq_config_tenant ON public.ieq_queue_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ieq_routes_tenant ON public.ieq_routing_rules;
CREATE POLICY p_ieq_routes_tenant ON public.ieq_routing_rules
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ieq_items_tenant ON public.ieq_exception_items;
CREATE POLICY p_ieq_items_tenant ON public.ieq_exception_items
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ieq_actions_tenant ON public.ieq_resolution_actions;
CREATE POLICY p_ieq_actions_tenant ON public.ieq_resolution_actions
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ieq_workloads_tenant ON public.ieq_owner_workloads;
CREATE POLICY p_ieq_workloads_tenant ON public.ieq_owner_workloads
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ieq_replays_tenant ON public.ieq_replay_batches;
CREATE POLICY p_ieq_replays_tenant ON public.ieq_replay_batches
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ieq_provenance_tenant ON public.ieq_provenance_ledger;
CREATE POLICY p_ieq_provenance_tenant ON public.ieq_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_import_exception_queue_telemetry AS
SELECT
    c.facility_id,
    c.critical_sla_hours,
    c.auto_assign_by_domain,
    c.sync_status,
    c.health_status,
    COALESCE(COUNT(i.id) FILTER (WHERE i.queue_status NOT IN ('RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED')), 0)::INT AS active_queue_count,
    COALESCE(COUNT(i.id) FILTER (WHERE i.queue_status = 'ESCALATED' OR (i.sla_due_at < NOW() AND i.queue_status NOT IN ('RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED'))), 0)::INT AS escalated_sla_count,
    COALESCE(SUM(i.financial_impact_usd) FILTER (WHERE i.queue_status NOT IN ('RESOLVED_REPLAYED', 'DISMISSED_SUPPRESSED')), 0.00)::NUMERIC(12,2) AS financial_impact_at_risk_usd,
    COALESCE(COUNT(i.id) FILTER (WHERE i.queue_status = 'RESOLVED_REPLAYED'), 0)::INT AS resolved_replayed_count,
    COALESCE(ROUND(AVG(w.avg_resolution_minutes), 0), 42)::INT AS avg_resolution_minutes,
    (SELECT sha256_sync_seal FROM public.ieq_replay_batches WHERE facility_id = c.facility_id ORDER BY executed_at DESC LIMIT 1) AS latest_sync_seal
FROM public.ieq_queue_configs c
LEFT JOIN public.ieq_exception_items i ON c.facility_id = i.facility_id
LEFT JOIN public.ieq_owner_workloads w ON c.facility_id = w.facility_id
GROUP BY c.facility_id, c.critical_sla_hours, c.auto_assign_by_domain, c.sync_status, c.health_status;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    exc_1_id UUID := gen_random_uuid();
    exc_2_id UUID := gen_random_uuid();
    exc_3_id UUID := gen_random_uuid();
    exc_4_id UUID := gen_random_uuid();
    exc_5_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.ieq_queue_configs (
            facility_id, critical_sla_hours, high_sla_hours, medium_sla_hours, low_sla_hours,
            auto_assign_by_domain, require_reason_for_dismissal, client_secret_encrypted,
            sync_status, health_status
        ) VALUES (
            naples_id, 4, 12, 24, 72, TRUE, TRUE,
            'enc_v2_33f50a46bc170824351607241560724156072415607241560724156072416632',
            'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET sync_status = EXCLUDED.sync_status;

        -- Seed Routing Rules
        INSERT INTO public.ieq_routing_rules (
            facility_id, source_module, exception_category, assigned_role, default_assignee_email, sla_hours_override, is_active
        ) VALUES
        (naples_id, 'VENDOR_INVOICE', 'PRICE_VARIANCE', 'Materials Manager', 'materials_mgr@naplesasc.com', 4, TRUE),
        (naples_id, 'PAYROLL_WFM', 'MISSED_PUNCH', 'HR & Payroll Coordinator', 'payroll_admin@naplesasc.com', 12, TRUE),
        (naples_id, 'INVENTORY_POU', 'EXPIRED_LOT_SCANNED', 'Materials Manager', 'materials_mgr@naplesasc.com', 4, TRUE),
        (naples_id, 'SIS_EHR', 'CHRONOLOGY_INVERSION', 'Clinical Nursing Director', 'nursing_dir@naplesasc.com', 4, TRUE),
        (naples_id, 'EXCEL_CSV', 'SCHEMA_MAPPING', 'Data Operations Steward', 'data_steward@naplesasc.com', 24, TRUE)
        ON CONFLICT (facility_id, source_module, exception_category) DO NOTHING;

        -- Seed Unified Queue Tickets
        INSERT INTO public.ieq_exception_items (
            id, facility_id, exception_ticket_code, source_module, batch_control_number,
            exception_code, exception_category, severity, financial_impact_usd,
            assigned_role, assigned_to, queue_status, sla_due_at,
            raw_payload_json, sha256_sync_seal
        ) VALUES
        (
            exc_1_id, naples_id, 'EXC-2026-101', 'VENDOR_INVOICE', 'INV-CH-442910',
            'ERR_PRICE_OVERBILLING', 'PRICE_VARIANCE', 'CRITICAL', 360.00,
            'Materials Manager', 'materials_mgr@naplesasc.com', 'IN_REVIEW', NOW() + INTERVAL '2 hours',
            '{"vendor": "Cardinal Health", "sku": "CH-J316H", "invoiced_price": 120.50, "contract_price": 84.50, "qty": 10}'::jsonb,
            'sha256_ieq_1c489fbc0123456789abcdef0123456789abcdef0123456789abc'
        ),
        (
            exc_2_id, naples_id, 'EXC-2026-102', 'PAYROLL_WFM', 'PAY-BAT-20260224-01',
            'ERR_MISSED_CLOCK_OUT', 'MISSED_PUNCH', 'HIGH', 415.00,
            'HR & Payroll Coordinator', 'payroll_admin@naplesasc.com', 'ASSIGNED', NOW() + INTERVAL '8 hours',
            '{"employee_id": "EMP-1082", "clock_in": "2026-02-21T06:30:00Z", "clock_out": "2026-02-22T01:00:00Z", "hours": 18.5}'::jsonb,
            'sha256_ieq_2d590acd1234567890abcdef1234567890abcdef1234567890abc'
        ),
        (
            exc_3_id, naples_id, 'EXC-2026-103', 'INVENTORY_POU', 'INV-SYNC-20260224-01',
            'ERR_EXPIRED_IMPLANT_SCANNED', 'EXPIRED_LOT_SCANNED', 'CRITICAL', 215.00,
            'Materials Manager', 'materials_mgr@naplesasc.com', 'ESCALATED', NOW() - INTERVAL '1 hour',
            '{"sku": "SKU-1003", "lot": "LOT-1902", "expiration": "2026-01-15", "surgery_date": "2026-02-24"}'::jsonb,
            'sha256_ieq_3e601bde2345678901abcdef2345678901abcdef2345678901abc'
        ),
        (
            exc_4_id, naples_id, 'EXC-2026-104', 'SIS_EHR', 'SIS_SYNC_20260224_04',
            'ERR_CHRONOLOGY_INVERSION', 'CHRONOLOGY_INVERSION', 'CRITICAL', 0.00,
            'Clinical Nursing Director', 'nursing_dir@naplesasc.com', 'OPEN', NOW() + INTERVAL '3 hours',
            '{"case_id": "CAS-20260224-008", "room_in": "09:30", "cut_time": "08:15"}'::jsonb,
            'sha256_ieq_4f712cef3456789012abcdef3456789012abcdef3456789012abc'
        ),
        (
            exc_5_id, naples_id, 'EXC-2026-105', 'EXCEL_CSV', 'CSV-IMP-20260222-01',
            'WARN_UNMAPPED_COLUMN', 'SCHEMA_MAPPING', 'MEDIUM', 0.00,
            'Data Operations Steward', 'data_steward@naplesasc.com', 'RESOLVED_REPLAYED', NOW() - INTERVAL '20 hours',
            '{"header": "Payer_Plan_Cd", "mapped_to": "primary_payer_code"}'::jsonb,
            'sha256_ieq_5a823dfa4567890123abcdef4567890123abcdef4567890123abc'
        )
        ON CONFLICT (facility_id, exception_ticket_code) DO NOTHING;

        -- Resolve persisted IDs in case tickets were already seeded on a prior run
        SELECT id INTO exc_1_id FROM public.ieq_exception_items WHERE facility_id = naples_id AND exception_ticket_code = 'EXC-2026-101' LIMIT 1;
        SELECT id INTO exc_3_id FROM public.ieq_exception_items WHERE facility_id = naples_id AND exception_ticket_code = 'EXC-2026-103' LIMIT 1;
        SELECT id INTO exc_5_id FROM public.ieq_exception_items WHERE facility_id = naples_id AND exception_ticket_code = 'EXC-2026-105' LIMIT 1;

        -- Seed Resolution Action Timeline (idempotent)
        INSERT INTO public.ieq_resolution_actions (
            facility_id, exception_id, from_status, to_status, action_type, actor_id, action_notes
        )
        SELECT naples_id, v.ex_id, v.from_st, v.to_st, v.act_type, v.actor, v.notes
        FROM (
            VALUES
            (exc_1_id, 'OPEN', 'IN_REVIEW', 'CLAIM', 'materials_mgr@naplesasc.com', 'Auto-routed via VENDOR_INVOICE rule; requested Vizient price sheet check.'),
            (exc_3_id, 'ASSIGNED', 'ESCALATED', 'ESCALATE', 'system_sla_monitor', '4-hour CRITICAL SLA expired; escalated to Materials Manager & Clinical Director.'),
            (exc_5_id, 'IN_REVIEW', 'RESOLVED_REPLAYED', 'REPLAY_SUCCESS', 'data_steward@naplesasc.com', 'Mapped Payer_Plan_Cd and replayed 18 staging rows cleanly.')
        ) AS v(ex_id, from_st, to_st, act_type, actor, notes)
        WHERE v.ex_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.ieq_resolution_actions a
              WHERE a.facility_id = naples_id
                AND a.exception_id = v.ex_id
                AND a.action_type = v.act_type
          );

        -- Seed Owner Workloads
        INSERT INTO public.ieq_owner_workloads (
            facility_id, role_name, assignee_email, open_tickets_count, sla_breached_count, avg_resolution_minutes, resolved_mtd_count
        ) VALUES
        (naples_id, 'Materials Manager', 'materials_mgr@naplesasc.com', 2, 1, 54, 14),
        (naples_id, 'HR & Payroll Coordinator', 'payroll_admin@naplesasc.com', 1, 0, 38, 9),
        (naples_id, 'Clinical Nursing Director', 'nursing_dir@naplesasc.com', 1, 0, 29, 11),
        (naples_id, 'Data Operations Steward', 'data_steward@naplesasc.com', 0, 0, 22, 18)
        ON CONFLICT (facility_id, assignee_email) DO NOTHING;

        -- Seed Replay Batch
        INSERT INTO public.ieq_replay_batches (
            facility_id, replay_code, source_module, tickets_replayed, succeeded_count, failed_count, triggered_by, sha256_sync_seal
        ) VALUES (
            naples_id, 'IEQ-RPL-20260222-01', 'EXCEL_CSV', 1, 1, 0, 'data_steward@naplesasc.com',
            'sha256_ieq_6b934efa5678901234abcdef5678901234abcdef5678901234abc'
        ) ON CONFLICT (facility_id, replay_code) DO NOTHING;

        -- Seed Provenance Ledger
        INSERT INTO public.ieq_provenance_ledger (
            facility_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id, 'IEQ_REPLAY_COMMITTED', 1,
            'sha256_ieq_6b934efa5678901234abcdef5678901234abcdef5678901234abc',
            'data_steward@naplesasc.com',
            '{"ticket": "EXC-2026-105", "replay_code": "IEQ-RPL-20260222-01"}'::jsonb
        ) ON CONFLICT DO NOTHING;
    END IF;
END $$;
