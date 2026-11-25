-- ==============================================================================
-- Migration: 127_clearinghouse_integration.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F5)
-- Description: Clearinghouse Claims Transmission (EDI 837I/P), 999 Functional
--              Acknowledgments, 277CA Claim Status, 835 Remittance Advice (ERA),
--              WEDI SNIP 1-7 Validation Engine, and Balancing Ledger for ASCs.
-- ==============================================================================

-- 1. Clearinghouse Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    clearinghouse_vendor VARCHAR(64) NOT NULL DEFAULT 'AVAILITY' CHECK (
        clearinghouse_vendor IN ('AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'EXPERIAN_HEALTH', 'TRIZETTO')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_SFTP' CHECK (
        gateway_mode IN ('REST_API', 'SFTP', 'REST_SFTP', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    sftp_host VARCHAR(255),
    sftp_port INT DEFAULT 22,
    submitter_id VARCHAR(64) NOT NULL,
    receiver_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    auto_batch_schedule VARCHAR(32) NOT NULL DEFAULT 'DAILY_5PM',
    connection_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        connection_status IN ('CONNECTED', 'TRANSMITTING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    wedi_snip_level INT NOT NULL DEFAULT 7 CHECK (wedi_snip_level BETWEEN 1 AND 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_clearinghouse_config UNIQUE (facility_id)
);

-- 2. Clearinghouse Transmission Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_transmission_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    transmission_type VARCHAR(24) NOT NULL CHECK (
        transmission_type IN ('OUTBOUND_837I', 'OUTBOUND_837P', 'INBOUND_835', 'INBOUND_999', 'INBOUND_277CA')
    ),
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    status VARCHAR(24) NOT NULL DEFAULT 'COMPLETED' CHECK (
        status IN ('QUEUED', 'TRANSMITTING', 'COMPLETED', 'ACKNOWLEDGED_999', 'ACCEPTED_277CA', 'REJECTED', 'ERROR')
    ),
    claim_count INT NOT NULL DEFAULT 0,
    total_billed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    acknowledgment_999_code VARCHAR(16),
    claim_ack_277ca_code VARCHAR(16),
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    transmitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_batch_control UNIQUE (facility_id, batch_control_number)
);

-- 3. Clearinghouse Claim Records Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_claim_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE SET NULL,
    patient_control_number VARCHAR(64) NOT NULL,
    platform_case_id UUID,
    patient_name VARCHAR(128) NOT NULL,
    subscriber_member_id VARCHAR(64) NOT NULL,
    payer_name VARCHAR(128) NOT NULL,
    payer_id VARCHAR(32) NOT NULL,
    claim_format VARCHAR(16) NOT NULL DEFAULT '837I' CHECK (claim_format IN ('837I', '837P')),
    bill_type VARCHAR(8) NOT NULL DEFAULT '831',
    total_billed_charge NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    claim_status VARCHAR(24) NOT NULL DEFAULT 'TRANSMITTED' CHECK (
        claim_status IN ('READY', 'TRANSMITTING', 'TRANSMITTED', 'ACCEPTED_999', 'ACCEPTED_277CA', 'REJECTED', 'PAID', 'DENIED', 'UNDERPAID')
    ),
    wedi_snip_status VARCHAR(24) NOT NULL DEFAULT 'PASSED_SNIP_7' CHECK (
        wedi_snip_status IN ('PASSED_SNIP_7', 'PASSED_SNIP_4', 'WARNING_SNIP_5', 'FAILED_SNIP_1', 'FAILED_SNIP_2', 'FAILED_SNIP_3')
    ),
    error_description TEXT,
    service_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_pcn UNIQUE (facility_id, patient_control_number)
);

-- 4. Clearinghouse Remittance Adjudications Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_remit_adjudications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE SET NULL,
    claim_record_id UUID REFERENCES public.clearinghouse_claim_records(id) ON DELETE CASCADE,
    patient_control_number VARCHAR(64) NOT NULL,
    payer_claim_control_number VARCHAR(64) NOT NULL,
    billed_charge NUMERIC(12,2) NOT NULL,
    allowed_amount NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL,
    contractual_adjustment NUMERIC(12,2) NOT NULL,
    patient_responsibility NUMERIC(12,2) NOT NULL,
    carc_codes TEXT[] NOT NULL DEFAULT '{}',
    rarc_codes TEXT[] NOT NULL DEFAULT '{}',
    is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
    remit_status VARCHAR(24) NOT NULL DEFAULT 'ADJUDICATED' CHECK (
        remit_status IN ('ADJUDICATED', 'DENIED', 'REVERSAL', 'IMBALANCED')
    ),
    check_eft_trace_number VARCHAR(64) NOT NULL,
    check_eft_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_remit_claim UNIQUE (facility_id, patient_control_number, payer_claim_control_number)
);

-- 5. Clearinghouse Exception Logs Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE CASCADE,
    claim_record_id UUID REFERENCES public.clearinghouse_claim_records(id) ON DELETE SET NULL,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('SYNTAX_999', 'CLAIM_STATUS_277CA', 'SNIP_VALIDATION', 'REMIT_IMBALANCE', 'UNMAPPED_PAYER')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_segment VARCHAR(128),
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_BILLER_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Clearinghouse Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.clearinghouse_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.clearinghouse_transmission_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-throughput queries
CREATE INDEX IF NOT EXISTS idx_clh_config_fac ON public.clearinghouse_connector_configs(facility_id);
CREATE INDEX IF NOT EXISTS idx_clh_batches_fac_date ON public.clearinghouse_transmission_batches(facility_id, transmitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_clh_claims_fac_status ON public.clearinghouse_claim_records(facility_id, claim_status);
CREATE INDEX IF NOT EXISTS idx_clh_claims_pcn ON public.clearinghouse_claim_records(patient_control_number);
CREATE INDEX IF NOT EXISTS idx_clh_remit_fac ON public.clearinghouse_remit_adjudications(facility_id, is_balanced);
CREATE INDEX IF NOT EXISTS idx_clh_exceptions_fac_res ON public.clearinghouse_exception_logs(facility_id, is_resolved);
CREATE INDEX IF NOT EXISTS idx_clh_provenance_fac ON public.clearinghouse_provenance_ledger(facility_id, created_at DESC);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.clearinghouse_connector_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearinghouse_transmission_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearinghouse_claim_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearinghouse_remit_adjudications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearinghouse_exception_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearinghouse_provenance_ledger ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DROP POLICY IF EXISTS p_clh_config_tenant ON public.clearinghouse_connector_configs;
CREATE POLICY p_clh_config_tenant ON public.clearinghouse_connector_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_clh_batches_tenant ON public.clearinghouse_transmission_batches;
CREATE POLICY p_clh_batches_tenant ON public.clearinghouse_transmission_batches
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_clh_claims_tenant ON public.clearinghouse_claim_records;
CREATE POLICY p_clh_claims_tenant ON public.clearinghouse_claim_records
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_clh_remit_tenant ON public.clearinghouse_remit_adjudications;
CREATE POLICY p_clh_remit_tenant ON public.clearinghouse_remit_adjudications
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_clh_exceptions_tenant ON public.clearinghouse_exception_logs;
CREATE POLICY p_clh_exceptions_tenant ON public.clearinghouse_exception_logs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_clh_provenance_tenant ON public.clearinghouse_provenance_ledger;
CREATE POLICY p_clh_provenance_tenant ON public.clearinghouse_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_clearinghouse_integration_telemetry AS
SELECT
    c.facility_id,
    c.clearinghouse_vendor,
    c.gateway_mode,
    c.connection_status,
    c.health_status,
    c.wedi_snip_level,
    COALESCE(SUM(CASE WHEN b.direction = 'OUTBOUND' AND b.transmitted_at >= NOW() - INTERVAL '24 hours' THEN b.claim_count ELSE 0 END), 0)::INT AS claims_transmitted_24h,
    COALESCE(SUM(CASE WHEN b.direction = 'OUTBOUND' AND b.transmitted_at >= NOW() - INTERVAL '24 hours' THEN b.total_billed_amount ELSE 0 END), 0.00)::NUMERIC(14,2) AS total_billed_amount_24h,
    COALESCE(SUM(CASE WHEN b.direction = 'INBOUND' AND b.transmission_type = 'INBOUND_835' AND b.transmitted_at >= NOW() - INTERVAL '24 hours' THEN b.total_paid_amount ELSE 0 END), 0.00)::NUMERIC(14,2) AS total_era_paid_24h,
    ROUND(
        COALESCE(
            COUNT(cl.id) FILTER (WHERE cl.claim_status IN ('ACCEPTED_999', 'ACCEPTED_277CA', 'PAID'))::NUMERIC /
            NULLIF(COUNT(cl.id), 0) * 100,
            100.0
        ),
        1
    )::NUMERIC(5,1) AS clean_claim_acceptance_pct,
    COALESCE(AVG(b.duration_ms) FILTER (WHERE b.transmitted_at >= NOW() - INTERVAL '24 hours'), 245.0)::INT AS avg_gateway_latency_ms,
    COALESCE(COUNT(e.id) FILTER (WHERE e.is_resolved = FALSE), 0)::INT AS active_exceptions_count,
    MAX(b.transmitted_at) AS last_transmission_at,
    (SELECT sha256_sync_seal FROM public.clearinghouse_transmission_batches WHERE facility_id = c.facility_id ORDER BY created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.clearinghouse_connector_configs c
LEFT JOIN public.clearinghouse_transmission_batches b ON c.facility_id = b.facility_id
LEFT JOIN public.clearinghouse_claim_records cl ON c.facility_id = cl.facility_id
LEFT JOIN public.clearinghouse_exception_logs e ON c.facility_id = e.facility_id
GROUP BY c.facility_id, c.clearinghouse_vendor, c.gateway_mode, c.connection_status, c.health_status, c.wedi_snip_level;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    batch_837_id UUID := gen_random_uuid();
    batch_835_id UUID := gen_random_uuid();
    batch_999_id UUID := gen_random_uuid();
    claim_1_id UUID := gen_random_uuid();
    claim_2_id UUID := gen_random_uuid();
    claim_3_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        -- Seed Active Clearinghouse Configuration
        INSERT INTO public.clearinghouse_connector_configs (
            facility_id, clearinghouse_vendor, gateway_mode, api_endpoint_url, sftp_host, sftp_port,
            submitter_id, receiver_id, client_id, client_secret_encrypted, auto_batch_schedule,
            connection_status, health_status, wedi_snip_level
        ) VALUES (
            naples_id,
            'AVAILITY',
            'REST_SFTP',
            'https://api.availity.com/availity/v1/claims',
            'sftp.availity.com',
            22,
            'SUB-NAPLES-FL-01',
            'AVAILITY-EDI-GW',
            'clh_client_availity_naples_prod',
            'enc_v2_f88b901cd82e9123847291823719827389172938719283719283712983712983',
            'DAILY_5PM',
            'CONNECTED',
            'HEALTHY',
            7
        ) ON CONFLICT (facility_id) DO UPDATE SET
            clearinghouse_vendor = EXCLUDED.clearinghouse_vendor,
            connection_status = EXCLUDED.connection_status,
            health_status = EXCLUDED.health_status;

        -- Seed Outbound 837 Batch
        INSERT INTO public.clearinghouse_transmission_batches (
            id, facility_id, batch_control_number, transmission_type, direction, status,
            claim_count, total_billed_amount, total_paid_amount, acknowledgment_999_code,
            claim_ack_277ca_code, duration_ms, sha256_sync_seal, transmitted_at
        ) VALUES (
            batch_837_id,
            naples_id,
            'BAT-837I-20260224-01',
            'OUTBOUND_837I',
            'OUTBOUND',
            'ACCEPTED_277CA',
            28,
            142650.00,
            0.00,
            'A',
            'A2',
            215,
            'sha256_clh_9a189fbc01234567890abcdef1234567890abcdef1234567890abcdef12',
            NOW() - INTERVAL '4 hours'
        ) ON CONFLICT DO NOTHING;

        -- Seed Inbound 835 ERA Batch
        INSERT INTO public.clearinghouse_transmission_batches (
            id, facility_id, batch_control_number, transmission_type, direction, status,
            claim_count, total_billed_amount, total_paid_amount, acknowledgment_999_code,
            claim_ack_277ca_code, duration_ms, sha256_sync_seal, transmitted_at
        ) VALUES (
            batch_835_id,
            naples_id,
            'BAT-835-20260224-01',
            'INBOUND_835',
            'INBOUND',
            'COMPLETED',
            26,
            131800.00,
            89450.00,
            'A',
            'A2',
            180,
            'sha256_clh_8b290acd1234567890abcdef1234567890abcdef1234567890abcdef13',
            NOW() - INTERVAL '2 hours'
        ) ON CONFLICT DO NOTHING;

        -- Seed Claim Records
        INSERT INTO public.clearinghouse_claim_records (
            id, facility_id, batch_id, patient_control_number, platform_case_id,
            patient_name, subscriber_member_id, payer_name, payer_id,
            claim_format, bill_type, total_billed_charge, claim_status,
            wedi_snip_status, error_description, service_date
        ) VALUES
        (
            claim_1_id,
            naples_id,
            batch_837_id,
            'CLM-NAP-2026-901',
            gen_random_uuid(),
            'ANDERSON, MARK',
            'BCBS-FL-9081293',
            'Blue Cross Blue Shield Florida',
            '00590',
            '837I',
            '831',
            7275.00,
            'PAID',
            'PASSED_SNIP_7',
            NULL,
            CURRENT_DATE - INTERVAL '3 days'
        ),
        (
            claim_2_id,
            naples_id,
            batch_837_id,
            'CLM-NAP-2026-902',
            gen_random_uuid(),
            'WILLIAMS, SARAH',
            'AET-4491823',
            'Aetna Health Commercial',
            '60054',
            '837I',
            '831',
            2760.00,
            'ACCEPTED_277CA',
            'PASSED_SNIP_7',
            NULL,
            CURRENT_DATE - INTERVAL '2 days'
        ),
        (
            claim_3_id,
            naples_id,
            batch_837_id,
            'CLM-NAP-2026-903',
            gen_random_uuid(),
            'MARTINEZ, DAVID',
            'UHC-9921029',
            'UnitedHealthcare Community Plan',
            '87726',
            '837I',
            '831',
            4070.00,
            'ACCEPTED_999',
            'PASSED_SNIP_7',
            NULL,
            CURRENT_DATE - INTERVAL '1 day'
        ) ON CONFLICT DO NOTHING;

        -- Seed 835 Remittance Adjudication (Mathematical Balancing: Billed - Adj - Paid - Patient = 0)
        -- 7275.00 - 2325.00 (CO-45) - 4450.00 (Paid) - 500.00 (PR-2) = 0.00
        INSERT INTO public.clearinghouse_remit_adjudications (
            facility_id, batch_id, claim_record_id, patient_control_number, payer_claim_control_number,
            billed_charge, allowed_amount, paid_amount, contractual_adjustment, patient_responsibility,
            carc_codes, rarc_codes, is_balanced, remit_status, check_eft_trace_number, check_eft_date
        ) VALUES (
            naples_id,
            batch_835_id,
            claim_1_id,
            'CLM-NAP-2026-901',
            'ICN-BCBS-20260224-88910',
            7275.00,
            4950.00,
            4450.00,
            2325.00,
            500.00,
            ARRAY['CO-45', 'PR-2'],
            ARRAY['N30'],
            TRUE,
            'ADJUDICATED',
            'EFT-99102938102',
            CURRENT_DATE - INTERVAL '1 day'
        ) ON CONFLICT DO NOTHING;

        -- Seed Provenance Record
        INSERT INTO public.clearinghouse_provenance_ledger (
            facility_id, batch_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id,
            batch_837_id,
            'CLAIM_BATCH_TRANSMITTED',
            28,
            'sha256_clh_9a189fbc01234567890abcdef1234567890abcdef1234567890abcdef12',
            'clearinghouse_scheduler',
            '{"clearinghouse": "AVAILITY", "format": "837I", "claims": 28, "total_billed": 142650.00}'::jsonb
        ) ON CONFLICT DO NOTHING;

    END IF;
END $$;
