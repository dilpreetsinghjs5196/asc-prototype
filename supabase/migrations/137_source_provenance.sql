-- ==============================================================================
-- Migration: 137_source_provenance.sql
-- Module 16: Enterprise Data Quality Governance (Phase G5)
-- Description: Source System Registry, SemVer Schema Mapping Versions,
--              Ingestion Batch Envelopes, Record Lineage Maps, Cryptographic
--              Hash-Chained Audit Ledger, and Integrity Verification Runs.
-- ==============================================================================

-- 1. Source Provenance Configuration Table
CREATE TABLE IF NOT EXISTS public.spr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    retention_days INT NOT NULL DEFAULT 2555 CHECK (retention_days >= 2555),
    require_batch_manifest_seal BOOLEAN NOT NULL DEFAULT TRUE,
    require_mapping_version_tag BOOLEAN NOT NULL DEFAULT TRUE,
    enforce_immutable_append_only BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_config UNIQUE (facility_id)
);

-- 2. Canonical Source Systems Registry Table
CREATE TABLE IF NOT EXISTS public.spr_source_systems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    source_system VARCHAR(48) NOT NULL CHECK (
        source_system IN ('SIS_EHR', 'HST_EHR', 'CLEARINGHOUSE_EDI', 'ACCOUNTING_GL', 'PAYROLL_WFM', 'INVENTORY_POU', 'VENDOR_INVOICE', 'EXCEL_CSV')
    ),
    connector_code VARCHAR(48) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    source_priority_rank INT NOT NULL DEFAULT 1,
    active_schema_version VARCHAR(32) NOT NULL,
    trust_tier VARCHAR(24) NOT NULL DEFAULT 'TIER_1_SYSTEM_OF_RECORD' CHECK (
        trust_tier IN ('TIER_1_SYSTEM_OF_RECORD', 'TIER_2_CLEARINGHOUSE', 'TIER_3_MANUAL_UPLOAD')
    ),
    last_batch_control_number VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_source UNIQUE (facility_id, source_system)
);

-- 3. Schema Mapping Versions Registry Table
CREATE TABLE IF NOT EXISTS public.spr_mapping_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    mapping_code VARCHAR(48) NOT NULL,
    source_system VARCHAR(48) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    version_tag VARCHAR(32) NOT NULL,
    field_transform_spec_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by VARCHAR(128) NOT NULL,
    sha256_spec_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_mapping_code UNIQUE (facility_id, mapping_code)
);

-- 4. Ingestion Batch Envelopes Table
CREATE TABLE IF NOT EXISTS public.spr_ingestion_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    source_system VARCHAR(48) NOT NULL,
    mapping_version_id UUID REFERENCES public.spr_mapping_versions(id) ON DELETE SET NULL,
    mapping_version_tag VARCHAR(32) NOT NULL,
    payload_format VARCHAR(24) NOT NULL,
    records_received INT NOT NULL DEFAULT 0,
    records_accepted INT NOT NULL DEFAULT 0,
    records_quarantined INT NOT NULL DEFAULT 0,
    source_checksum VARCHAR(128) NOT NULL,
    batch_status VARCHAR(24) NOT NULL DEFAULT 'COMMITTED' CHECK (
        batch_status IN ('INGESTED', 'VALIDATED', 'COMMITTED', 'SUPERSEDED', 'ROLLED_BACK')
    ),
    ingested_by VARCHAR(128) NOT NULL,
    sha256_batch_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_batch UNIQUE (facility_id, batch_control_number)
);

-- 5. Record-Level Source Lineage Map Table
CREATE TABLE IF NOT EXISTS public.spr_record_lineage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    lineage_code VARCHAR(48) NOT NULL,
    target_entity_type VARCHAR(32) NOT NULL,
    target_record_id VARCHAR(64) NOT NULL,
    source_system VARCHAR(48) NOT NULL,
    source_record_id VARCHAR(64) NOT NULL,
    batch_id UUID REFERENCES public.spr_ingestion_batches(id) ON DELETE SET NULL,
    batch_control_number VARCHAR(64) NOT NULL,
    mapping_version_tag VARCHAR(32) NOT NULL,
    raw_payload_hash VARCHAR(128) NOT NULL,
    transformed_payload_hash VARCHAR(128) NOT NULL,
    is_current_active BOOLEAN NOT NULL DEFAULT TRUE,
    sha256_lineage_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_lineage_code UNIQUE (facility_id, lineage_code)
);

-- 6. Cryptographic Hash-Chained Audit Ledger Table
CREATE TABLE IF NOT EXISTS public.spr_audit_chain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    event_seq INT NOT NULL,
    lineage_id UUID REFERENCES public.spr_record_lineage(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (
        event_type IN ('INGESTED', 'TRANSFORMED', 'MANUAL_OVERRIDE', 'REPLAYED', 'MERGED_TO_GOLDEN', 'CALCULATION_FREEZE')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    before_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    mapping_version_tag VARCHAR(32) NOT NULL,
    prev_chain_seal VARCHAR(128) NOT NULL,
    sha256_event_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_event_seq UNIQUE (facility_id, event_seq)
);

-- 7. Chain Integrity Verification Runs Table
CREATE TABLE IF NOT EXISTS public.spr_verification_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_code VARCHAR(48) NOT NULL,
    records_audited INT NOT NULL DEFAULT 0,
    chain_breaks_detected INT NOT NULL DEFAULT 0,
    orphaned_batches_detected INT NOT NULL DEFAULT 0,
    reproducibility_rate NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    executed_by VARCHAR(128) NOT NULL,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_spr_run_code UNIQUE (facility_id, run_code)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_spr_lineage_target ON public.spr_record_lineage (facility_id, target_entity_type, target_record_id);
CREATE INDEX IF NOT EXISTS idx_spr_lineage_source ON public.spr_record_lineage (facility_id, source_system, source_record_id);
CREATE INDEX IF NOT EXISTS idx_spr_batches_facility ON public.spr_ingestion_batches (facility_id, source_system, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spr_chain_seq ON public.spr_audit_chain (facility_id, event_seq DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_spr_telemetry AS
SELECT
    c.facility_id,
    c.retention_days,
    c.require_batch_manifest_seal,
    c.enforce_immutable_append_only,
    c.sync_status,
    c.health_status,
    (SELECT COUNT(*) FROM public.spr_record_lineage l WHERE l.facility_id = c.facility_id AND l.is_current_active = TRUE) AS tracked_lineage_count,
    (SELECT COUNT(*) FROM public.spr_mapping_versions m WHERE m.facility_id = c.facility_id AND m.is_active = TRUE) AS active_mapping_versions_count,
    (SELECT COUNT(*) FROM public.spr_ingestion_batches b WHERE b.facility_id = c.facility_id) AS ingestion_batches_count,
    (SELECT COUNT(*) FROM public.spr_audit_chain ch WHERE ch.facility_id = c.facility_id) AS audit_chain_events_count,
    (SELECT COALESCE(r.reproducibility_rate, 100.00) FROM public.spr_verification_runs r WHERE r.facility_id = c.facility_id ORDER BY r.created_at DESC LIMIT 1) AS chain_reproducibility_rate,
    (SELECT r.sha256_sync_seal FROM public.spr_verification_runs r WHERE r.facility_id = c.facility_id ORDER BY r.created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.spr_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.spr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spr_source_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spr_mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spr_ingestion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spr_record_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spr_audit_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spr_verification_runs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS spr_configs_tenant_iso ON public.spr_configs;
CREATE POLICY spr_configs_tenant_iso ON public.spr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS spr_sources_tenant_iso ON public.spr_source_systems;
CREATE POLICY spr_sources_tenant_iso ON public.spr_source_systems USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS spr_mappings_tenant_iso ON public.spr_mapping_versions;
CREATE POLICY spr_mappings_tenant_iso ON public.spr_mapping_versions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS spr_batches_tenant_iso ON public.spr_ingestion_batches;
CREATE POLICY spr_batches_tenant_iso ON public.spr_ingestion_batches USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS spr_lineage_tenant_iso ON public.spr_record_lineage;
CREATE POLICY spr_lineage_tenant_iso ON public.spr_record_lineage USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS spr_chain_tenant_iso ON public.spr_audit_chain;
CREATE POLICY spr_chain_tenant_iso ON public.spr_audit_chain USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS spr_runs_tenant_iso ON public.spr_verification_runs;
CREATE POLICY spr_runs_tenant_iso ON public.spr_verification_runs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    map_sis_id UUID;
    map_835_id UUID;
    map_inv_id UUID;
    bat_sis_id UUID;
    bat_835_id UUID;
    lin_1_id UUID;
    lin_2_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.spr_configs (
            facility_id, retention_days, require_batch_manifest_seal,
            require_mapping_version_tag, enforce_immutable_append_only,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 2555, TRUE, TRUE, TRUE,
            'spr_sec_****_naples_7721', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.spr_source_systems (
            facility_id, source_system, connector_code, display_name,
            source_priority_rank, active_schema_version, trust_tier, last_batch_control_number
        ) VALUES
        (naples_id, 'SIS_EHR', 'CONN-SIS-NAP', 'SIS Perioperative EHR & Scheduling', 1, 'map-v2.4.0', 'TIER_1_SYSTEM_OF_RECORD', 'SIS-BAT-20261126-01'),
        (naples_id, 'CLEARINGHOUSE_EDI', 'CONN-WAYSTAR-NAP', 'Waystar 837/835 EDI Clearinghouse', 2, 'map-v1.9.2', 'TIER_2_CLEARINGHOUSE', 'EDI-BAT-20261126-08'),
        (naples_id, 'VENDOR_INVOICE', 'CONN-EDI810-NAP', 'Vendor 810 & AP Invoice OCR Gateway', 3, 'map-v1.5.0', 'TIER_1_SYSTEM_OF_RECORD', 'INV-BAT-20261125-04'),
        (naples_id, 'ACCOUNTING_GL', 'CONN-NS-NAP', 'NetSuite ASC General Ledger', 4, 'map-v1.3.1', 'TIER_1_SYSTEM_OF_RECORD', 'GL-BAT-20261125-02')
        ON CONFLICT (facility_id, source_system) DO NOTHING;

        INSERT INTO public.spr_mapping_versions (
            facility_id, mapping_code, source_system, entity_type, version_tag,
            field_transform_spec_json, is_active, approved_by, sha256_spec_seal
        ) VALUES
        (
            naples_id, 'MAP-SIS-CASE-240', 'SIS_EHR', 'SURGICAL_CASE', 'map-v2.4.0',
            '{"patient_mrn": "TRIM_UPPER", "dos": "ISO_DATE", "cut_start": "UTC_TIMESTAMPTZ", "cpt_codes": "ARRAY_DEDUP"}'::jsonb,
            TRUE, 'data_steward@naplessurgery.com',
            'sha256_spr_10a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ),
        (
            naples_id, 'MAP-EDI-835-192', 'CLEARINGHOUSE_EDI', 'CLAIM_REMIT', 'map-v1.9.2',
            '{"clp01_claim_id": "TRIM", "clp03_billed": "CENTS_TO_USD_2DP", "clp04_paid": "CENTS_TO_USD_2DP", "cas_carc": "WEDI_NORM"}'::jsonb,
            TRUE, 'rcm_lead@naplessurgery.com',
            'sha256_spr_20b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4'
        ),
        (
            naples_id, 'MAP-VND-810-150', 'VENDOR_INVOICE', 'VENDOR_INVOICE', 'map-v1.5.0',
            '{"invoice_no": "ALPHANUM_NORM", "unit_price": "USD_2DP", "sku": "VENDOR_ALIAS_MAP"}'::jsonb,
            TRUE, 'controller@naplessurgery.com',
            'sha256_spr_30c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5'
        ) ON CONFLICT (facility_id, mapping_code) DO NOTHING;

        SELECT id INTO map_sis_id FROM public.spr_mapping_versions WHERE facility_id = naples_id AND mapping_code = 'MAP-SIS-CASE-240' LIMIT 1;
        SELECT id INTO map_835_id FROM public.spr_mapping_versions WHERE facility_id = naples_id AND mapping_code = 'MAP-EDI-835-192' LIMIT 1;
        SELECT id INTO map_inv_id FROM public.spr_mapping_versions WHERE facility_id = naples_id AND mapping_code = 'MAP-VND-810-150' LIMIT 1;

        INSERT INTO public.spr_ingestion_batches (
            facility_id, batch_control_number, source_system, mapping_version_id, mapping_version_tag,
            payload_format, records_received, records_accepted, records_quarantined,
            source_checksum, batch_status, ingested_by, sha256_batch_seal
        ) VALUES
        (
            naples_id, 'SIS-BAT-20261126-01', 'SIS_EHR', map_sis_id, 'map-v2.4.0',
            'HL7_JSON', 42, 41, 1,
            'sha256_raw_sis_8812aa9901cc', 'COMMITTED', 'sis.gateway@naplessurgery.com',
            'sha256_spr_40d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6'
        ),
        (
            naples_id, 'EDI-BAT-20261126-08', 'CLEARINGHOUSE_EDI', map_835_id, 'map-v1.9.2',
            'X12_835', 118, 118, 0,
            'sha256_raw_edi_9941bb7722dd', 'COMMITTED', 'waystar.bot@naplessurgery.com',
            'sha256_spr_50e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7'
        ) ON CONFLICT (facility_id, batch_control_number) DO NOTHING;

        SELECT id INTO bat_sis_id FROM public.spr_ingestion_batches WHERE facility_id = naples_id AND batch_control_number = 'SIS-BAT-20261126-01' LIMIT 1;
        SELECT id INTO bat_835_id FROM public.spr_ingestion_batches WHERE facility_id = naples_id AND batch_control_number = 'EDI-BAT-20261126-08' LIMIT 1;

        INSERT INTO public.spr_record_lineage (
            facility_id, lineage_code, target_entity_type, target_record_id,
            source_system, source_record_id, batch_id, batch_control_number, mapping_version_tag,
            raw_payload_hash, transformed_payload_hash, is_current_active, sha256_lineage_seal
        ) VALUES
        (
            naples_id, 'SPR-LIN-501', 'SURGICAL_CASE', 'CAS-20261126-104',
            'SIS_EHR', 'SIS-ENC-998142', bat_sis_id, 'SIS-BAT-20261126-01', 'map-v2.4.0',
            'sha256_raw_998142a', 'sha256_trf_104b', TRUE,
            'sha256_spr_60f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8'
        ),
        (
            naples_id, 'SPR-LIN-502', 'CLAIM_REMIT', 'ERA-20261126-882',
            'CLEARINGHOUSE_EDI', 'CLP-UHC-55219', bat_835_id, 'EDI-BAT-20261126-08', 'map-v1.9.2',
            'sha256_raw_55219c', 'sha256_trf_882d', TRUE,
            'sha256_spr_70a8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'
        ) ON CONFLICT (facility_id, lineage_code) DO NOTHING;

        SELECT id INTO lin_1_id FROM public.spr_record_lineage WHERE facility_id = naples_id AND lineage_code = 'SPR-LIN-501' LIMIT 1;
        SELECT id INTO lin_2_id FROM public.spr_record_lineage WHERE facility_id = naples_id AND lineage_code = 'SPR-LIN-502' LIMIT 1;

        INSERT INTO public.spr_audit_chain (
            facility_id, event_seq, lineage_id, event_type,
            actor_email, actor_role, before_state_json, after_state_json,
            mapping_version_tag, prev_chain_seal, sha256_event_seal
        ) VALUES
        (
            naples_id, 1, lin_1_id, 'INGESTED',
            'sis.gateway@naplessurgery.com', 'Ingestion Gateway',
            '{}'::jsonb, '{"case_id": "CAS-20261126-104", "status": "INGESTED"}'::jsonb,
            'map-v2.4.0', 'GENESIS_00000000000000000000000000000000000000000000000000000000',
            'sha256_spr_80b92a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a'
        ),
        (
            naples_id, 2, lin_1_id, 'TRANSFORMED',
            'data_steward@naplessurgery.com', 'Data Operations Steward',
            '{"status": "INGESTED"}'::jsonb, '{"status": "COMMITTED", "primary_cpt": "29881"}'::jsonb,
            'map-v2.4.0', 'sha256_spr_80b92a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a',
            'sha256_spr_90c03b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b'
        ),
        (
            naples_id, 3, lin_2_id, 'INGESTED',
            'waystar.bot@naplessurgery.com', 'EDI Clearinghouse Bot',
            '{}'::jsonb, '{"era_id": "ERA-20261126-882", "paid_usd": 3180.50}'::jsonb,
            'map-v1.9.2', 'sha256_spr_90c03b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b',
            'sha256_spr_a1d14c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c'
        ) ON CONFLICT (facility_id, event_seq) DO NOTHING;

        INSERT INTO public.spr_verification_runs (
            facility_id, run_code, records_audited, chain_breaks_detected,
            orphaned_batches_detected, reproducibility_rate, executed_by, sha256_sync_seal
        ) VALUES (
            naples_id, 'SPR-VER-20261126-01', 2, 0, 0, 100.00, 'compliance@naplessurgery.com',
            'sha256_spr_b2e25d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d'
        ) ON CONFLICT (facility_id, run_code) DO NOTHING;
    END IF;
END $$;
