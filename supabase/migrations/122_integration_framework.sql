-- ==============================================================================
-- Migration 122: Common Integration Framework & Connector Engine
-- Phase F0: Module 15 Enterprise Healthcare Integrations
-- Description: Establishes connector registry, automated batch executions,
--              canonical field mappings, data provenance ledger, RLS policies,
--              and enterprise connectors (EHR, Clearinghouse, ERP, GL).
-- ==============================================================================

-- 1. Integration Connectors Registry Table
CREATE TABLE IF NOT EXISTS public.integration_connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_code VARCHAR(32) NOT NULL,
    connector_name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (
        category IN ('EHR_PMS', 'CLEARINGHOUSE_EDI', 'SUPPLY_CHAIN_ERP', 'ACCOUNTING_GL', 'ANALYTICS_WAREHOUSE')
    ),
    protocol VARCHAR(24) NOT NULL CHECK (
        protocol IN ('REST_API', 'SFTP', 'FHIR_R4', 'HL7_V2', 'DATABASE_CDC', 'WEBHOOK')
    ),
    endpoint_url VARCHAR(256) NOT NULL,
    sync_frequency VARCHAR(24) NOT NULL DEFAULT 'HOURLY',
    status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        status IN ('HEALTHY', 'DEGRADED', 'DOWN', 'PAUSED')
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_heartbeat_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    uptime_percent NUMERIC(5, 2) NOT NULL DEFAULT 99.90,
    credentials_masked JSONB NOT NULL DEFAULT '{"auth_type": "API_KEY", "masked_key": "sk_live_...9f4a"}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_connector UNIQUE (facility_id, connector_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_connectors ON public.integration_connectors(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_connectors_category ON public.integration_connectors(category);

-- 2. Integration Batches Execution Ledger Table
CREATE TABLE IF NOT EXISTS public.integration_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    job_type VARCHAR(24) NOT NULL DEFAULT 'INBOUND_SYNC' CHECK (
        job_type IN ('INBOUND_SYNC', 'OUTBOUND_DISPATCH', 'CDC_POLL', 'MANUAL_REPLAY')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED')
    ),
    records_extracted INT NOT NULL DEFAULT 0,
    records_transformed INT NOT NULL DEFAULT 0,
    records_ingested INT NOT NULL DEFAULT 0,
    records_rejected INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    bytes_transferred INT NOT NULL DEFAULT 0,
    error_summary TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_batch UNIQUE (facility_id, batch_code)
);

CREATE INDEX IF NOT EXISTS idx_integration_batches ON public.integration_batches(facility_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_connector ON public.integration_batches(connector_id, status);

-- 3. Integration Mappings Table
CREATE TABLE IF NOT EXISTS public.integration_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
    mapping_code VARCHAR(32) NOT NULL,
    source_entity VARCHAR(64) NOT NULL,
    target_entity VARCHAR(64) NOT NULL,
    version_number INT NOT NULL DEFAULT 1,
    field_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_connector_mapping UNIQUE (connector_id, mapping_code)
);

CREATE INDEX IF NOT EXISTS idx_integration_mappings ON public.integration_mappings(connector_id);

-- 4. Integration Provenance Records Table
CREATE TABLE IF NOT EXISTS public.integration_provenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    connector_id UUID NOT NULL REFERENCES public.integration_connectors(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.integration_batches(id) ON DELETE CASCADE,
    source_record_id VARCHAR(64) NOT NULL,
    target_table VARCHAR(64) NOT NULL,
    target_record_id UUID NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    source_timestamp TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_provenance ON public.integration_provenance_records(batch_id, source_record_id);

-- 5. Integration Framework Telemetry View
CREATE OR REPLACE VIEW public.vw_integration_framework_telemetry AS
SELECT
    c.facility_id,
    COUNT(DISTINCT c.id) AS total_connectors,
    COUNT(DISTINCT CASE WHEN c.is_active = true AND c.status = 'HEALTHY' THEN c.id END) AS healthy_connectors,
    COUNT(DISTINCT b.id) AS total_batches_24h,
    COUNT(DISTINCT CASE WHEN b.status = 'COMPLETED' THEN b.id END) AS completed_batches_24h,
    COALESCE(SUM(b.records_ingested), 0) AS total_records_ingested_24h,
    COALESCE(SUM(b.records_rejected), 0) AS total_records_rejected_24h,
    ROUND(
        CASE WHEN COUNT(b.id) > 0 THEN
            (COUNT(CASE WHEN b.status = 'COMPLETED' THEN 1 END)::numeric / COUNT(b.id)::numeric) * 100
        ELSE 100.0 END, 2
    ) AS batch_success_rate_percent,
    COALESCE(ROUND(AVG(b.duration_ms)), 0) AS avg_duration_ms
FROM public.integration_connectors c
LEFT JOIN public.integration_batches b ON b.connector_id = c.id AND b.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY c.facility_id;

-- 6. Row Level Security Policies
ALTER TABLE public.integration_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_provenance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_connectors ON public.integration_connectors;
CREATE POLICY tenant_isolation_connectors ON public.integration_connectors
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_batches ON public.integration_batches;
CREATE POLICY tenant_isolation_batches ON public.integration_batches
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_mappings ON public.integration_mappings;
CREATE POLICY tenant_isolation_mappings ON public.integration_mappings
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_provenance ON public.integration_provenance_records;
CREATE POLICY tenant_isolation_provenance ON public.integration_provenance_records
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 7. Seed Data: Naples Surgery Center Enterprise Connectors & Batches
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_conn_hst UUID := '00000000-0000-0000-0000-000000000091';
    v_conn_waystar UUID := '00000000-0000-0000-0000-000000000092';
    v_conn_medline UUID := '00000000-0000-0000-0000-000000000093';
    v_conn_netsuite UUID := '00000000-0000-0000-0000-000000000094';
    v_batch_1 UUID := '00000000-0000-0000-0000-000000000095';
    v_batch_2 UUID := '00000000-0000-0000-0000-000000000096';
    v_batch_3 UUID := '00000000-0000-0000-0000-000000000097';
    v_batch_4 UUID := '00000000-0000-0000-0000-000000000098';
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        -- Connector 1: HST Pathways EHR/PMS
        INSERT INTO public.integration_connectors (
            id, facility_id, connector_code, connector_name, category, protocol,
            endpoint_url, sync_frequency, status, is_active, last_heartbeat_at, last_sync_at,
            uptime_percent, credentials_masked, metadata
        ) VALUES (
            v_conn_hst, v_facility_id, 'CONN_HST_PATHWAYS', 'HST Pathways EHR / Practice Management',
            'EHR_PMS', 'FHIR_R4', 'https://api.hstpathways.com/v1/fhir', '15_MINUTES',
            'HEALTHY', true, NOW(), NOW() - INTERVAL '8 minutes', 99.95,
            '{"auth_type": "OAUTH2_BEARER", "client_id": "hst_naples_prod", "masked_secret": "sec_live_...9f4a"}'::jsonb,
            '{"version": "v4.2.1", "entities": ["cases", "bookings", "patients"], "rate_limit_rpm": 600}'::jsonb
        ) ON CONFLICT (facility_id, connector_code) DO NOTHING;

        -- Connector 2: Waystar Clearinghouse EDI
        INSERT INTO public.integration_connectors (
            id, facility_id, connector_code, connector_name, category, protocol,
            endpoint_url, sync_frequency, status, is_active, last_heartbeat_at, last_sync_at,
            uptime_percent, credentials_masked, metadata
        ) VALUES (
            v_conn_waystar, v_facility_id, 'CONN_WAYSTAR_EDI', 'Waystar Clearinghouse EDI Gateway',
            'CLEARINGHOUSE_EDI', 'SFTP', 'sftp://sftp.waystar.com:22/inbound', 'HOURLY',
            'HEALTHY', true, NOW(), NOW() - INTERVAL '22 minutes', 99.85,
            '{"auth_type": "SSH_KEY_PAIR", "user": "naples_asc_edi", "key_fingerprint": "SHA256:d1e2f3...9a0b"}'::jsonb,
            '{"supported_trans": ["837I", "837P", "835_ERA", "277_ACK"], "batch_retention_days": 90}'::jsonb
        ) ON CONFLICT (facility_id, connector_code) DO NOTHING;

        -- Connector 3: Medline ERP Materials Management
        INSERT INTO public.integration_connectors (
            id, facility_id, connector_code, connector_name, category, protocol,
            endpoint_url, sync_frequency, status, is_active, last_heartbeat_at, last_sync_at,
            uptime_percent, credentials_masked, metadata
        ) VALUES (
            v_conn_medline, v_facility_id, 'CONN_MEDLINE_ERP', 'Medline Supply Chain & Materials ERP',
            'SUPPLY_CHAIN_ERP', 'REST_API', 'https://edi-api.medline.com/v2/orders', 'DAILY',
            'HEALTHY', true, NOW(), NOW() - INTERVAL '45 minutes', 99.90,
            '{"auth_type": "API_KEY", "masked_key": "med_live_...44b1"}'::jsonb,
            '{"catalog_items_synced": 4820, "edi_850_orders": true, "edi_810_invoices": true}'::jsonb
        ) ON CONFLICT (facility_id, connector_code) DO NOTHING;

        -- Connector 4: NetSuite General Ledger
        INSERT INTO public.integration_connectors (
            id, facility_id, connector_code, connector_name, category, protocol,
            endpoint_url, sync_frequency, status, is_active, last_heartbeat_at, last_sync_at,
            uptime_percent, credentials_masked, metadata
        ) VALUES (
            v_conn_netsuite, v_facility_id, 'CONN_NETSUITE_GL', 'NetSuite Financial GL & Journal Engine',
            'ACCOUNTING_GL', 'REST_API', 'https://rest.netsuite.com/app/accounting/v1', 'REALTIME',
            'HEALTHY', true, NOW(), NOW() - INTERVAL '5 minutes', 99.98,
            '{"auth_type": "TBA_TOKEN", "realm": "7841209", "masked_token": "ns_tok_...882c"}'::jsonb,
            '{"auto_post_journals": false, "chart_of_accounts_synced": 142}'::jsonb
        ) ON CONFLICT (facility_id, connector_code) DO NOTHING;

        -- Seed Batches
        INSERT INTO public.integration_batches (
            id, facility_id, connector_id, batch_code, job_type, status,
            records_extracted, records_transformed, records_ingested, records_rejected,
            duration_ms, bytes_transferred, started_at, completed_at
        ) VALUES
        (v_batch_1, v_facility_id, v_conn_hst, 'BATCH_20261125_001', 'INBOUND_SYNC', 'COMPLETED', 240, 240, 240, 0, 1240, 482100, NOW() - INTERVAL '8 minutes', NOW() - INTERVAL '7 minutes 58 seconds'),
        (v_batch_2, v_facility_id, v_conn_waystar, 'BATCH_20261125_002', 'INBOUND_SYNC', 'COMPLETED', 85, 85, 85, 0, 2150, 1245000, NOW() - INTERVAL '22 minutes', NOW() - INTERVAL '21 minutes 57 seconds'),
        (v_batch_3, v_facility_id, v_conn_medline, 'BATCH_20261125_003', 'INBOUND_SYNC', 'COMPLETED', 112, 110, 110, 2, 1680, 312000, NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '44 minutes 58 seconds'),
        (v_batch_4, v_facility_id, v_conn_netsuite, 'BATCH_20261125_004', 'OUTBOUND_DISPATCH', 'COMPLETED', 18, 18, 18, 0, 610, 45200, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '4 minutes 59 seconds')
        ON CONFLICT (facility_id, batch_code) DO NOTHING;

        -- Seed Field Mappings
        INSERT INTO public.integration_mappings (
            facility_id, connector_id, mapping_code, source_entity, target_entity, version_number, field_rules
        ) VALUES
        (v_facility_id, v_conn_hst, 'MAP_HST_CASE', 'hst.surgery_case', 'public.surgical_cases', 1, '[
            {"source": "case_id", "target": "external_id", "type": "STRING"},
            {"source": "dos", "target": "surgery_date", "type": "DATE"},
            {"source": "primary_cpt", "target": "cpt_code", "type": "STRING"},
            {"source": "surgeon_npi", "target": "npi", "type": "STRING"},
            {"source": "room_name", "target": "operating_room_name", "type": "STRING"}
        ]'::jsonb),
        (v_facility_id, v_conn_waystar, 'MAP_WAYSTAR_835', 'waystar.clp_segment', 'public.remittance_claims', 1, '[
            {"source": "claim_control_number", "target": "claim_id", "type": "STRING"},
            {"source": "total_claim_charge", "target": "billed_amount", "type": "CURRENCY"},
            {"source": "claim_payment_amount", "target": "paid_amount", "type": "CURRENCY"},
            {"source": "patient_responsibility", "target": "patient_due", "type": "CURRENCY"}
        ]'::jsonb)
        ON CONFLICT (connector_id, mapping_code) DO NOTHING;

    END IF;
END $$;
