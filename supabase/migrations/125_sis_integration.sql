-- ==============================================================================
-- Migration: 125_sis_integration.sql
-- Description: Phase F3 Surgical Information Systems (SIS) EHR/PMS Gateway
--              Connector configuration, incremental sync batches, perioperative milestone
--              chronological normalization, AdvantX charge reconciliation, and SHA-256 seals.
-- Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
-- Strict Zero Prohibited Accent Tokens
-- ==============================================================================

-- 1. SIS Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.sis_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    api_endpoint_url VARCHAR(255) NOT NULL,
    sis_facility_code VARCHAR(64) NOT NULL,
    auth_type VARCHAR(32) NOT NULL DEFAULT 'OAUTH2' CHECK (auth_type IN ('OAUTH2', 'API_KEY', 'MTLS')),
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    polling_interval_minutes INT NOT NULL DEFAULT 15,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        sync_status IN ('CONNECTED', 'SYNCING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    last_successful_sync_at TIMESTAMPTZ,
    last_sync_cursor_at TIMESTAMPTZ,
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')),
    auto_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_sis_config UNIQUE (facility_id)
);

CREATE INDEX IF NOT EXISTS idx_sis_configs_fac ON public.sis_connector_configs(facility_id);

-- 2. SIS Sync Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.sis_sync_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    sync_type VARCHAR(32) NOT NULL DEFAULT 'INCREMENTAL' CHECK (
        sync_type IN ('INCREMENTAL', 'DAILY_RECONCILIATION', 'MANUAL_TRIGGER', 'HISTORICAL_BACKFILL')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED' CHECK (
        status IN ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED')
    ),
    cases_retrieved INT NOT NULL DEFAULT 0,
    cases_inserted INT NOT NULL DEFAULT 0,
    cases_updated INT NOT NULL DEFAULT 0,
    milestones_parsed INT NOT NULL DEFAULT 0,
    charges_synced INT NOT NULL DEFAULT 0,
    exceptions_flagged INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    sha256_sync_seal VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT unq_facility_sis_batch UNIQUE (facility_id, batch_code)
);

CREATE INDEX IF NOT EXISTS idx_sis_sync_batches_fac ON public.sis_sync_batches(facility_id, started_at DESC);

-- 3. SIS Case Cross-Reference Mapping Table
CREATE TABLE IF NOT EXISTS public.sis_case_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sis_case_id VARCHAR(64) NOT NULL,
    sis_patient_id VARCHAR(64) NOT NULL,
    sis_account_number VARCHAR(64),
    platform_case_id UUID REFERENCES public.surgical_cases(id) ON DELETE SET NULL,
    surgery_date DATE NOT NULL,
    surgeon_npi VARCHAR(10) NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    or_room_name VARCHAR(64) NOT NULL,
    case_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    clinical_documentation_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
    billing_status VARCHAR(32) NOT NULL DEFAULT 'BILLED',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_sis_case UNIQUE (facility_id, sis_case_id)
);

CREATE INDEX IF NOT EXISTS idx_sis_case_mappings_fac ON public.sis_case_mappings(facility_id, surgery_date DESC);
CREATE INDEX IF NOT EXISTS idx_sis_case_mappings_sis_id ON public.sis_case_mappings(facility_id, sis_case_id);

-- 4. SIS Perioperative Milestone Events Table
CREATE TABLE IF NOT EXISTS public.sis_milestone_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sis_case_id VARCHAR(64) NOT NULL,
    check_in_time TIMESTAMPTZ,
    room_in_time TIMESTAMPTZ,
    anesthesia_start_time TIMESTAMPTZ,
    incision_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    room_out_time TIMESTAMPTZ,
    pacu_in_time TIMESTAMPTZ,
    pacu_out_time TIMESTAMPTZ,
    total_room_minutes INT,
    surgical_duration_minutes INT,
    turnover_minutes INT,
    is_chronology_valid BOOLEAN NOT NULL DEFAULT TRUE,
    anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sis_milestones_fac ON public.sis_milestone_events(facility_id, sis_case_id);

-- 5. SIS Itemized Charge Items Table
CREATE TABLE IF NOT EXISTS public.sis_charge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sis_case_id VARCHAR(64) NOT NULL,
    line_item_id VARCHAR(64) NOT NULL,
    charge_category VARCHAR(32) NOT NULL CHECK (
        charge_category IN ('SURGICAL_PROCEDURE', 'ANESTHESIA', 'IMPLANT', 'SUPPLY', 'PHARMACY', 'FACILITY_FEE')
    ),
    code VARCHAR(32) NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_implant_construct BOOLEAN NOT NULL DEFAULT FALSE,
    lot_number VARCHAR(64),
    serial_number VARCHAR(64),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sis_charge_items_fac ON public.sis_charge_items(facility_id, sis_case_id);

-- 6. SIS Cryptographic Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.sis_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.sis_sync_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(64) NOT NULL,
    operator_id VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sis_provenance_fac ON public.sis_provenance_ledger(facility_id, created_at DESC);

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.sis_connector_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_case_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_milestone_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_charge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sis_provenance_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_sis_connector_configs_facility') THEN
        CREATE POLICY rls_sis_connector_configs_facility ON public.sis_connector_configs
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_sis_sync_batches_facility') THEN
        CREATE POLICY rls_sis_sync_batches_facility ON public.sis_sync_batches
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_sis_case_mappings_facility') THEN
        CREATE POLICY rls_sis_case_mappings_facility ON public.sis_case_mappings
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_sis_milestone_events_facility') THEN
        CREATE POLICY rls_sis_milestone_events_facility ON public.sis_milestone_events
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_sis_charge_items_facility') THEN
        CREATE POLICY rls_sis_charge_items_facility ON public.sis_charge_items
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_sis_provenance_ledger_facility') THEN
        CREATE POLICY rls_sis_provenance_ledger_facility ON public.sis_provenance_ledger
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
END $$;

-- 8. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_sis_integration_telemetry AS
SELECT
    c.facility_id,
    c.sync_status,
    c.health_status,
    c.last_successful_sync_at,
    COUNT(DISTINCT m.id) AS total_synced_cases,
    COUNT(DISTINCT e.id) AS total_milestones_logged,
    COUNT(DISTINCT ch.id) AS total_charges_captured,
    COALESCE(SUM(ch.total_charge), 0) AS total_synced_charges_amount,
    COUNT(DISTINCT CASE WHEN e.is_chronology_valid = FALSE THEN e.id END) AS milestone_anomalies_count,
    CASE 
        WHEN COUNT(DISTINCT m.id) > 0 
        THEN ROUND((COUNT(DISTINCT CASE WHEN e.is_chronology_valid = TRUE THEN e.id END)::NUMERIC / COUNT(DISTINCT m.id)::NUMERIC) * 100, 2)
        ELSE 100.00
    END AS milestone_completeness_pct,
    MAX(p.sha256_seal) AS latest_sync_seal
FROM public.sis_connector_configs c
LEFT JOIN public.sis_case_mappings m ON m.facility_id = c.facility_id
LEFT JOIN public.sis_milestone_events e ON e.facility_id = c.facility_id
LEFT JOIN public.sis_charge_items ch ON ch.facility_id = c.facility_id
LEFT JOIN public.sis_provenance_ledger p ON p.facility_id = c.facility_id
GROUP BY c.facility_id, c.sync_status, c.health_status, c.last_successful_sync_at;

-- 9. Seed Data for Naples Surgery Center (00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID := '00000000-0000-0000-0000-000000000002'::UUID;
    batch_1_id UUID := 'e1111111-1111-1111-1111-111111111111'::UUID;
    batch_2_id UUID := 'e2222222-2222-2222-2222-222222222222'::UUID;
    batch_3_id UUID := 'e3333333-3333-3333-3333-333333333333'::UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = naples_id) THEN
        -- Seed Active SIS Connector Configuration
        INSERT INTO public.sis_connector_configs (facility_id, api_endpoint_url, sis_facility_code, auth_type, client_id, polling_interval_minutes, sync_status, health_status, last_successful_sync_at, last_sync_cursor_at)
        VALUES
        (
            naples_id,
            'https://exchange.sissurgical.com/api/v2/naples-asc',
            'NAPLES-FL-01',
            'OAUTH2',
            'sis_client_naples_prod_902',
            15,
            'CONNECTED',
            'HEALTHY',
            NOW() - INTERVAL '4 minutes',
            NOW() - INTERVAL '15 minutes'
        )
        ON CONFLICT (facility_id) DO UPDATE SET
            sync_status = 'CONNECTED',
            health_status = 'HEALTHY',
            last_successful_sync_at = NOW() - INTERVAL '4 minutes';

        -- Seed 3 Sync Batches
        INSERT INTO public.sis_sync_batches (id, facility_id, batch_code, sync_type, status, cases_retrieved, cases_inserted, cases_updated, milestones_parsed, charges_synced, exceptions_flagged, duration_ms, started_at, completed_at, sha256_sync_seal)
        VALUES
        (
            batch_1_id,
            naples_id,
            'SIS_SYNC_20260224_01',
            'INCREMENTAL',
            'COMPLETED',
            24,
            6,
            18,
            24,
            112,
            0,
            412,
            NOW() - INTERVAL '64 minutes',
            NOW() - INTERVAL '63 minutes',
            'sha256_sis_7a189fbc01234567890abcdef1234567890abcdef1234567890abcdef123'
        ),
        (
            batch_2_id,
            naples_id,
            'SIS_SYNC_20260224_02',
            'INCREMENTAL',
            'COMPLETED',
            18,
            2,
            16,
            18,
            86,
            0,
            380,
            NOW() - INTERVAL '34 minutes',
            NOW() - INTERVAL '33 minutes',
            'sha256_sis_8b290acd1234567890abcdef1234567890abcdef1234567890abcdef124'
        ),
        (
            batch_3_id,
            naples_id,
            'SIS_SYNC_20260224_03',
            'INCREMENTAL',
            'COMPLETED',
            12,
            1,
            11,
            12,
            58,
            0,
            320,
            NOW() - INTERVAL '4 minutes',
            NOW() - INTERVAL '3 minutes',
            'sha256_sis_9c301bde2345678901abcdef1234567890abcdef1234567890abcdef125'
        )
        ON CONFLICT (facility_id, batch_code) DO NOTHING;

        -- Seed SIS Case Mappings
        INSERT INTO public.sis_case_mappings (facility_id, sis_case_id, sis_patient_id, sis_account_number, surgery_date, surgeon_npi, surgeon_name, primary_cpt, or_room_name, case_status, clinical_documentation_status, billing_status)
        VALUES
        (naples_id, 'SIS-2026-8801', 'PT-99401', 'ACC-2026-101', '2026-02-24', '1841392818', 'Dr. Brian Miller', '29881', 'OR-1', 'COMPLETED', 'LOCKED', 'BILLED'),
        (naples_id, 'SIS-2026-8802', 'PT-99402', 'ACC-2026-102', '2026-02-24', '1952403926', 'Dr. Sarah Jenkins', '45378', 'OR-3', 'COMPLETED', 'LOCKED', 'BILLED'),
        (naples_id, 'SIS-2026-8803', 'PT-99403', 'ACC-2026-103', '2026-02-24', '1063514034', 'Dr. Michael Chang', '66984', 'OR-2', 'COMPLETED', 'LOCKED', 'PENDING_FINAL_CODING'),
        (naples_id, 'SIS-2026-8804', 'PT-99404', 'ACC-2026-104', '2026-02-24', '1841392818', 'Dr. Brian Miller', '29827', 'OR-1', 'IN_ROOM', 'IN_PROGRESS', 'UNBILLED')
        ON CONFLICT (facility_id, sis_case_id) DO NOTHING;

        -- Seed Perioperative Milestones
        INSERT INTO public.sis_milestone_events (facility_id, sis_case_id, check_in_time, room_in_time, anesthesia_start_time, incision_time, close_time, room_out_time, pacu_in_time, pacu_out_time, total_room_minutes, surgical_duration_minutes, turnover_minutes, is_chronology_valid)
        VALUES
        (
            naples_id,
            'SIS-2026-8801',
            '2026-02-24 07:05:00-05',
            '2026-02-24 07:32:00-05',
            '2026-02-24 07:38:00-05',
            '2026-02-24 07:50:00-05',
            '2026-02-24 08:34:00-05',
            '2026-02-24 08:42:00-05',
            '2026-02-24 08:45:00-05',
            '2026-02-24 09:35:00-05',
            70,
            44,
            18,
            TRUE
        ),
        (
            naples_id,
            'SIS-2026-8802',
            '2026-02-24 07:15:00-05',
            '2026-02-24 07:45:00-05',
            '2026-02-24 07:50:00-05',
            '2026-02-24 08:02:00-05',
            '2026-02-24 08:31:00-05',
            '2026-02-24 08:38:00-05',
            '2026-02-24 08:40:00-05',
            '2026-02-24 09:15:00-05',
            53,
            29,
            14,
            TRUE
        ),
        (
            naples_id,
            'SIS-2026-8803',
            '2026-02-24 08:00:00-05',
            '2026-02-24 08:25:00-05',
            '2026-02-24 08:30:00-05',
            '2026-02-24 08:40:00-05',
            '2026-02-24 09:02:00-05',
            '2026-02-24 09:09:00-05',
            '2026-02-24 09:12:00-05',
            '2026-02-24 09:48:00-05',
            44,
            22,
            16,
            TRUE
        )
        ON CONFLICT DO NOTHING;

        -- Seed Itemized Charges from SIS AdvantX
        INSERT INTO public.sis_charge_items (facility_id, sis_case_id, line_item_id, charge_category, code, description, quantity, unit_charge, total_charge, cost_amount, is_implant_construct, lot_number)
        VALUES
        (naples_id, 'SIS-2026-8801', 'CHG-8801-01', 'SURGICAL_PROCEDURE', '29881', 'Arthroscopy Knee Meniscectomy', 1, 4850.00, 4850.00, 410.00, FALSE, NULL),
        (naples_id, 'SIS-2026-8801', 'CHG-8801-02', 'IMPLANT', 'AR-1380', 'Arthrex Bio-Composite Suture Anchor', 2, 850.00, 1700.00, 420.00, TRUE, 'LOT-78192'),
        (naples_id, 'SIS-2026-8801', 'CHG-8801-03', 'SUPPLY', 'MISC-TRAY-ORTHO', 'Custom Orthopedic Arthroscopy Pack', 1, 380.00, 380.00, 125.00, FALSE, NULL),
        (naples_id, 'SIS-2026-8802', 'CHG-8802-01', 'SURGICAL_PROCEDURE', '45378', 'Colonoscopy Diagnostic', 1, 2450.00, 2450.00, 195.00, FALSE, NULL),
        (naples_id, 'SIS-2026-8802', 'CHG-8802-02', 'PHARMACY', 'PROP-DIP-20', 'Propofol Injectable 20ml', 2, 75.00, 150.00, 18.50, FALSE, NULL),
        (naples_id, 'SIS-2026-8803', 'CHG-8803-01', 'SURGICAL_PROCEDURE', '66984', 'Cataract Extraction with IOL Insertion', 1, 3200.00, 3200.00, 240.00, FALSE, NULL),
        (naples_id, 'SIS-2026-8803', 'CHG-8803-02', 'IMPLANT', 'ALC-ACRY-01', 'Alcon AcrySof Foldable IOL Lens', 1, 650.00, 650.00, 210.00, TRUE, 'ALC-44091')
        ON CONFLICT DO NOTHING;

        -- Seed Provenance Record
        INSERT INTO public.sis_provenance_ledger (facility_id, batch_id, event_type, records_impacted, sha256_seal, operator_id, metadata)
        VALUES
        (
            naples_id,
            batch_3_id,
            'INCREMENTAL_SYNC_COMPLETED',
            71,
            'sha256_sis_9c301bde2345678901abcdef1234567890abcdef1234567890abcdef125',
            'sis_scheduler',
            '{"source": "SIS Exchange", "endpoint": "https://exchange.sissurgical.com/api/v2/naples-asc", "cases": 12, "charges": 58}'::jsonb
        )
        ON CONFLICT DO NOTHING;

    END IF;
END $$;
