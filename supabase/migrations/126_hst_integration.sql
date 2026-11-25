-- ==============================================================================
-- Migration: 126_hst_integration.sql
-- Description: Phase F4 HST Pathways EHR/PMS Integration Gateway
--              Connector configuration, incremental sync batches, perioperative milestone
--              chronological normalization, HST Practice Management charge reconciliation, and SHA-256 seals.
-- Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
-- Strict Zero Prohibited Accent Tokens
-- ==============================================================================

-- 1. HST Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.hst_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    api_endpoint_url VARCHAR(255) NOT NULL,
    hst_center_id VARCHAR(64) NOT NULL,
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
    CONSTRAINT unq_facility_hst_config UNIQUE (facility_id)
);

CREATE INDEX IF NOT EXISTS idx_hst_configs_fac ON public.hst_connector_configs(facility_id);

-- 2. HST Sync Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.hst_sync_batches (
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
    sha256_sync_seal VARCHAR(128) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT unq_facility_hst_batch UNIQUE (facility_id, batch_code)
);

CREATE INDEX IF NOT EXISTS idx_hst_sync_batches_fac ON public.hst_sync_batches(facility_id, started_at DESC);

-- 3. HST Case Cross-Reference Mapping Table
CREATE TABLE IF NOT EXISTS public.hst_case_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    hst_case_id VARCHAR(64) NOT NULL,
    hst_case_number VARCHAR(64) NOT NULL,
    hst_patient_mrn VARCHAR(64) NOT NULL,
    hst_account_number VARCHAR(64),
    platform_case_id UUID,
    surgery_date DATE NOT NULL,
    surgeon_npi VARCHAR(10) NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    or_room_name VARCHAR(64) NOT NULL,
    case_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    echart_documentation_status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
    billing_status VARCHAR(32) NOT NULL DEFAULT 'BILLED',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_hst_case UNIQUE (facility_id, hst_case_id)
);

CREATE INDEX IF NOT EXISTS idx_hst_case_mappings_fac ON public.hst_case_mappings(facility_id, surgery_date DESC);
CREATE INDEX IF NOT EXISTS idx_hst_case_mappings_hst_id ON public.hst_case_mappings(facility_id, hst_case_id);

-- 4. HST Perioperative Milestone Events Table
CREATE TABLE IF NOT EXISTS public.hst_milestone_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    hst_case_id VARCHAR(64) NOT NULL,
    patient_arrival_time TIMESTAMPTZ,
    preop_in_time TIMESTAMPTZ,
    room_in_time TIMESTAMPTZ,
    anesthesia_start_time TIMESTAMPTZ,
    incision_time TIMESTAMPTZ,
    close_time TIMESTAMPTZ,
    anesthesia_end_time TIMESTAMPTZ,
    room_out_time TIMESTAMPTZ,
    pacu_in_time TIMESTAMPTZ,
    discharge_time TIMESTAMPTZ,
    total_room_minutes INT,
    surgical_duration_minutes INT,
    anesthesia_duration_minutes INT,
    turnover_minutes INT,
    is_chronology_valid BOOLEAN NOT NULL DEFAULT TRUE,
    anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hst_milestones_fac ON public.hst_milestone_events(facility_id, hst_case_id);

-- 5. HST Itemized Charge Items Table
CREATE TABLE IF NOT EXISTS public.hst_charge_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    hst_case_id VARCHAR(64) NOT NULL,
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
    revenue_code VARCHAR(16),
    modifier_code VARCHAR(16),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hst_charge_items_fac ON public.hst_charge_items(facility_id, hst_case_id);

-- 6. HST Cryptographic Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.hst_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.hst_sync_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_hst_provenance_fac ON public.hst_provenance_ledger(facility_id, created_at DESC);

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.hst_connector_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hst_sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hst_case_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hst_milestone_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hst_charge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hst_provenance_ledger ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_hst_connector_configs_facility') THEN
        CREATE POLICY rls_hst_connector_configs_facility ON public.hst_connector_configs
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_hst_sync_batches_facility') THEN
        CREATE POLICY rls_hst_sync_batches_facility ON public.hst_sync_batches
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_hst_case_mappings_facility') THEN
        CREATE POLICY rls_hst_case_mappings_facility ON public.hst_case_mappings
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_hst_milestone_events_facility') THEN
        CREATE POLICY rls_hst_milestone_events_facility ON public.hst_milestone_events
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_hst_charge_items_facility') THEN
        CREATE POLICY rls_hst_charge_items_facility ON public.hst_charge_items
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_hst_provenance_ledger_facility') THEN
        CREATE POLICY rls_hst_provenance_ledger_facility ON public.hst_provenance_ledger
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
END $$;

-- 8. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_hst_integration_telemetry AS
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
FROM public.hst_connector_configs c
LEFT JOIN public.hst_case_mappings m ON m.facility_id = c.facility_id
LEFT JOIN public.hst_milestone_events e ON e.facility_id = c.facility_id
LEFT JOIN public.hst_charge_items ch ON ch.facility_id = c.facility_id
LEFT JOIN public.hst_provenance_ledger p ON p.facility_id = c.facility_id
GROUP BY c.facility_id, c.sync_status, c.health_status, c.last_successful_sync_at;

-- 9. Seed Data for Naples Surgery Center (00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID := '00000000-0000-0000-0000-000000000002'::UUID;
    batch_1_id UUID := 'd1111111-1111-1111-1111-111111111111'::UUID;
    batch_2_id UUID := 'd2222222-2222-2222-2222-222222222222'::UUID;
    batch_3_id UUID := 'd3333333-3333-3333-3333-333333333333'::UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = naples_id) THEN
        -- Seed Active HST Connector Configuration
        INSERT INTO public.hst_connector_configs (facility_id, api_endpoint_url, hst_center_id, auth_type, client_id, polling_interval_minutes, sync_status, health_status, last_successful_sync_at, last_sync_cursor_at)
        VALUES
        (
            naples_id,
            'https://api.hstpathways.com/v1/centers/naples-fl-02',
            'HST-CTR-NAPLES-02',
            'OAUTH2',
            'hst_client_naples_prod_804',
            15,
            'CONNECTED',
            'HEALTHY',
            NOW() - INTERVAL '6 minutes',
            NOW() - INTERVAL '15 minutes'
        )
        ON CONFLICT (facility_id) DO UPDATE SET
            sync_status = 'CONNECTED',
            health_status = 'HEALTHY',
            last_successful_sync_at = NOW() - INTERVAL '6 minutes';

        -- Seed 3 Sync Batches
        INSERT INTO public.hst_sync_batches (id, facility_id, batch_code, sync_type, status, cases_retrieved, cases_inserted, cases_updated, milestones_parsed, charges_synced, exceptions_flagged, duration_ms, started_at, completed_at, sha256_sync_seal)
        VALUES
        (
            batch_1_id,
            naples_id,
            'HST_SYNC_20260224_01',
            'INCREMENTAL',
            'COMPLETED',
            28,
            8,
            20,
            28,
            134,
            0,
            445,
            NOW() - INTERVAL '70 minutes',
            NOW() - INTERVAL '69 minutes',
            'sha256_hst_7a189fbc01234567890abcdef1234567890abcdef1234567890ab'
        ),
        (
            batch_2_id,
            naples_id,
            'HST_SYNC_20260224_02',
            'INCREMENTAL',
            'COMPLETED',
            22,
            4,
            18,
            22,
            98,
            0,
            395,
            NOW() - INTERVAL '36 minutes',
            NOW() - INTERVAL '35 minutes',
            'sha256_hst_8b290acd01234567890abcdef1234567890abcdef1234567890ab'
        ),
        (
            batch_3_id,
            naples_id,
            'HST_SYNC_20260224_03',
            'INCREMENTAL',
            'COMPLETED',
            16,
            2,
            14,
            16,
            72,
            0,
            340,
            NOW() - INTERVAL '6 minutes',
            NOW() - INTERVAL '5 minutes',
            'sha256_hst_9c301bde01234567890abcdef1234567890abcdef1234567890ab'
        )
        ON CONFLICT (facility_id, batch_code) DO NOTHING;

        -- Seed HST Case Mappings
        INSERT INTO public.hst_case_mappings (facility_id, hst_case_id, hst_case_number, hst_patient_mrn, hst_account_number, surgery_date, surgeon_npi, surgeon_name, primary_cpt, or_room_name, case_status, echart_documentation_status, billing_status)
        VALUES
        (naples_id, 'HST-2026-901', 'CASE-901', 'MRN-78101', 'ACT-90101', '2026-02-24', '1841392818', 'Dr. Brian Miller', '29881', 'OR-1', 'COMPLETED', 'LOCKED', 'BILLED'),
        (naples_id, 'HST-2026-902', 'CASE-902', 'MRN-78102', 'ACT-90102', '2026-02-24', '1952403926', 'Dr. Sarah Jenkins', '45378', 'OR-3', 'COMPLETED', 'LOCKED', 'BILLED'),
        (naples_id, 'HST-2026-903', 'CASE-903', 'MRN-78103', 'ACT-90103', '2026-02-24', '1063514034', 'Dr. Michael Chang', '66984', 'OR-2', 'COMPLETED', 'LOCKED', 'PENDING_FINAL_CODING'),
        (naples_id, 'HST-2026-904', 'CASE-904', 'MRN-78104', 'ACT-90104', '2026-02-24', '1841392818', 'Dr. Brian Miller', '29827', 'OR-1', 'IN_ROOM', 'IN_PROGRESS', 'UNBILLED')
        ON CONFLICT (facility_id, hst_case_id) DO NOTHING;

        -- Seed Perioperative Milestones
        INSERT INTO public.hst_milestone_events (facility_id, hst_case_id, patient_arrival_time, preop_in_time, room_in_time, anesthesia_start_time, incision_time, close_time, anesthesia_end_time, room_out_time, pacu_in_time, discharge_time, total_room_minutes, surgical_duration_minutes, anesthesia_duration_minutes, turnover_minutes, is_chronology_valid)
        VALUES
        (
            naples_id,
            'HST-2026-901',
            '2026-02-24 06:50:00-05',
            '2026-02-24 07:10:00-05',
            '2026-02-24 07:30:00-05',
            '2026-02-24 07:35:00-05',
            '2026-02-24 07:48:00-05',
            '2026-02-24 08:32:00-05',
            '2026-02-24 08:36:00-05',
            '2026-02-24 08:40:00-05',
            '2026-02-24 08:44:00-05',
            '2026-02-24 09:30:00-05',
            70,
            44,
            61,
            16,
            TRUE
        ),
        (
            naples_id,
            'HST-2026-902',
            '2026-02-24 07:00:00-05',
            '2026-02-24 07:20:00-05',
            '2026-02-24 07:40:00-05',
            '2026-02-24 07:45:00-05',
            '2026-02-24 07:58:00-05',
            '2026-02-24 08:28:00-05',
            '2026-02-24 08:32:00-05',
            '2026-02-24 08:35:00-05',
            '2026-02-24 08:38:00-05',
            '2026-02-24 09:10:00-05',
            55,
            30,
            47,
            14,
            TRUE
        ),
        (
            naples_id,
            'HST-2026-903',
            '2026-02-24 07:45:00-05',
            '2026-02-24 08:05:00-05',
            '2026-02-24 08:20:00-05',
            '2026-02-24 08:24:00-05',
            '2026-02-24 08:36:00-05',
            '2026-02-24 08:58:00-05',
            '2026-02-24 09:02:00-05',
            '2026-02-24 09:05:00-05',
            '2026-02-24 09:08:00-05',
            '2026-02-24 09:45:00-05',
            45,
            22,
            38,
            15,
            TRUE
        )
        ON CONFLICT DO NOTHING;

        -- Seed Itemized Charges from HST Practice Management
        INSERT INTO public.hst_charge_items (facility_id, hst_case_id, line_item_id, charge_category, code, description, quantity, unit_charge, total_charge, cost_amount, is_implant_construct, lot_number, revenue_code, modifier_code)
        VALUES
        (naples_id, 'HST-2026-901', 'HST-CHG-901-01', 'SURGICAL_PROCEDURE', '29881', 'Arthroscopy Knee Meniscectomy', 1, 5100.00, 5100.00, 425.00, FALSE, NULL, '0360', 'RT'),
        (naples_id, 'HST-2026-901', 'HST-CHG-901-02', 'IMPLANT', 'AR-1920', 'Arthrex Bio-Composite PushLock Anchor', 2, 890.00, 1780.00, 440.00, TRUE, 'LOT-HST-8821', '0278', NULL),
        (naples_id, 'HST-2026-901', 'HST-CHG-901-03', 'SUPPLY', 'HST-TRAY-KNEE', 'Custom Knee Meniscus Pack', 1, 395.00, 395.00, 130.00, FALSE, NULL, '0270', NULL),
        (naples_id, 'HST-2026-902', 'HST-CHG-902-01', 'SURGICAL_PROCEDURE', '45378', 'Colonoscopy Diagnostic', 1, 2600.00, 2600.00, 210.00, FALSE, NULL, '0360', NULL),
        (naples_id, 'HST-2026-902', 'HST-CHG-902-02', 'PHARMACY', 'PROP-DIP-20', 'Propofol Injectable 20ml', 2, 80.00, 160.00, 19.00, FALSE, NULL, '0250', NULL),
        (naples_id, 'HST-2026-903', 'HST-CHG-903-01', 'SURGICAL_PROCEDURE', '66984', 'Cataract Extraction with IOL Insertion', 1, 3350.00, 3350.00, 255.00, FALSE, NULL, '0360', 'RT'),
        (naples_id, 'HST-2026-903', 'HST-CHG-903-02', 'IMPLANT', 'HST-IOL-TORIC', 'Alcon AcrySof IQ Toric IOL Lens', 1, 720.00, 720.00, 230.00, TRUE, 'HST-LOT-9921', '0278', NULL)
        ON CONFLICT DO NOTHING;

        -- Seed Provenance Record
        INSERT INTO public.hst_provenance_ledger (facility_id, batch_id, event_type, records_impacted, sha256_seal, operator_id, metadata)
        VALUES
        (
            naples_id,
            batch_3_id,
            'INCREMENTAL_SYNC_COMPLETED',
            88,
            'sha256_hst_9c301bde01234567890abcdef1234567890abcdef1234567890ab',
            'hst_scheduler',
            '{"source": "HST Practice Management", "endpoint": "https://api.hstpathways.com/v1/centers/naples-fl-02", "cases": 16, "charges": 72}'::jsonb
        )
        ON CONFLICT DO NOTHING;

    END IF;
END $$;
