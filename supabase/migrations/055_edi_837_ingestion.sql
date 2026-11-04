-- ==============================================================================
-- MIGRATION: 055_edi_837_ingestion.sql
-- PHASE: 81 — EDI 837 Ingestion & Case Matching Engine
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. EDI 837 Ingestion Batches Table
CREATE TABLE IF NOT EXISTS public.edi_837_ingestion_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    format_type VARCHAR(24) NOT NULL DEFAULT '837I' CHECK (format_type IN ('837I', '837P')),
    isa_control_number VARCHAR(32),
    submitter_identifier VARCHAR(64),
    receiver_identifier VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'PROCESSING', 'VALIDATED', 'COMPLETED_WITH_EXCEPTIONS', 'COMPLETED_CLEAN', 'REJECTED')
    ),
    total_claims_count INT NOT NULL DEFAULT 0 CHECK (total_claims_count >= 0),
    matched_claims_count INT NOT NULL DEFAULT 0 CHECK (matched_claims_count >= 0),
    exception_claims_count INT NOT NULL DEFAULT 0 CHECK (exception_claims_count >= 0),
    total_billed_charge NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_billed_charge >= 0),
    raw_payload_preview TEXT,
    error_summary TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_fac_837_hash UNIQUE (facility_id, file_hash_sha256)
);

CREATE INDEX IF NOT EXISTS idx_837_batches_fac ON public.edi_837_ingestion_batches(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_837_batches_date ON public.edi_837_ingestion_batches(facility_id, ingested_at DESC);

-- 2. Staged Claims Extracted from EDI 837
CREATE TABLE IF NOT EXISTS public.edi_837_staged_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.edi_837_ingestion_batches(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    patient_control_number VARCHAR(64) NOT NULL,
    subscriber_member_id VARCHAR(64) NOT NULL,
    patient_first_name VARCHAR(100) NOT NULL,
    patient_last_name VARCHAR(100) NOT NULL,
    patient_dob DATE,
    date_of_service DATE NOT NULL,
    billing_provider_npi VARCHAR(10) NOT NULL,
    rendering_provider_npi VARCHAR(10),
    primary_payer_name VARCHAR(128) NOT NULL,
    total_billed_charge NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_billed_charge >= 0),
    claim_frequency_code VARCHAR(4) NOT NULL DEFAULT '1',
    line_item_count INT NOT NULL DEFAULT 0 CHECK (line_item_count >= 0),
    snip_validation_status VARCHAR(24) NOT NULL DEFAULT 'PASSED' CHECK (
        snip_validation_status IN ('PASSED', 'FAILED_SNIP1', 'FAILED_SNIP2', 'FAILED_SNIP3', 'FAILED_SNIP4')
    ),
    match_status VARCHAR(32) NOT NULL DEFAULT 'UNMATCHED' CHECK (
        match_status IN ('MATCHED_EXACT', 'MATCHED_PROBABLE', 'UNMATCHED', 'RESOLVED_MANUAL', 'DISCARDED')
    ),
    matched_surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
    created_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
    raw_segments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_837_staged_batch ON public.edi_837_staged_claims(batch_id, match_status);
CREATE INDEX IF NOT EXISTS idx_837_staged_ctrl ON public.edi_837_staged_claims(facility_id, patient_control_number);

-- 3. Ingestion Exceptions Queue Table
CREATE TABLE IF NOT EXISTS public.edi_837_ingestion_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.edi_837_ingestion_batches(id) ON DELETE CASCADE,
    staged_claim_id UUID NOT NULL REFERENCES public.edi_837_staged_claims(id) ON DELETE CASCADE,
    exception_type VARCHAR(48) NOT NULL CHECK (
        exception_type IN (
            'UNMATCHED_SURGERY_CASE', 'DUPLICATE_CLAIM_SUBMISSION', 'SNIP_SYNTAX_ERROR',
            'NPI_FACILITY_MISMATCH', 'BALANCE_SUM_MISMATCH', 'INVALID_REVENUE_CODE'
        )
    ),
    severity VARCHAR(16) NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('WARNING', 'ERROR', 'FATAL')),
    error_message TEXT NOT NULL,
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        resolution_status IN ('OPEN', 'RESOLVED', 'IGNORED')
    ),
    resolution_action VARCHAR(32),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_837_exceptions_fac ON public.edi_837_ingestion_exceptions(facility_id, resolution_status);

-- 4. Rollup View: EDI 837 Batch Summary
CREATE OR REPLACE VIEW public.vw_edi_837_batch_summary AS
SELECT
    b.id AS batch_id,
    b.facility_id,
    b.batch_number,
    b.file_name,
    b.format_type,
    b.status,
    b.total_claims_count,
    b.matched_claims_count,
    b.exception_claims_count,
    b.total_billed_charge,
    ROUND(CASE WHEN b.total_claims_count > 0 THEN (b.matched_claims_count::numeric / b.total_claims_count) * 100 ELSE 0.00 END, 2) AS auto_match_rate_pct,
    b.ingested_at,
    b.ingested_by
FROM public.edi_837_ingestion_batches b;

-- 5. Rollup View: EDI 837 Exceptions Queue
CREATE OR REPLACE VIEW public.vw_edi_837_exceptions_queue AS
SELECT
    e.id AS exception_id,
    e.facility_id,
    e.batch_id,
    b.batch_number,
    e.staged_claim_id,
    sc.patient_control_number,
    sc.patient_first_name || ' ' || sc.patient_last_name AS patient_name,
    sc.date_of_service,
    sc.primary_payer_name,
    sc.total_billed_charge,
    e.exception_type,
    e.severity,
    e.error_message,
    e.resolution_status,
    e.resolution_action,
    e.created_at
FROM public.edi_837_ingestion_exceptions e
JOIN public.edi_837_ingestion_batches b ON b.id = e.batch_id
JOIN public.edi_837_staged_claims sc ON sc.id = e.staged_claim_id;

-- 6. Row-Level Security (RLS)
ALTER TABLE public.edi_837_ingestion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_837_staged_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_837_ingestion_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY batches_select_policy ON public.edi_837_ingestion_batches
    FOR SELECT TO authenticated USING (public.is_facility_accessible(facility_id));

CREATE POLICY batches_insert_policy ON public.edi_837_ingestion_batches
    FOR INSERT TO authenticated WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY staged_claims_select_policy ON public.edi_837_staged_claims
    FOR SELECT TO authenticated USING (public.is_facility_accessible(facility_id));

CREATE POLICY staged_claims_insert_policy ON public.edi_837_staged_claims
    FOR INSERT TO authenticated WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY exceptions_select_policy ON public.edi_837_ingestion_exceptions
    FOR SELECT TO authenticated USING (public.is_facility_accessible(facility_id));

CREATE POLICY exceptions_insert_policy ON public.edi_837_ingestion_exceptions
    FOR INSERT TO authenticated WITH CHECK (public.is_facility_accessible(facility_id));
