-- ==============================================================================
-- MIGRATION: 056_edi_835_remittance.sql
-- PHASE: 82 — EDI 835 Remittance Ingestion & Line-Level Adjudication
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. EDI 835 Remittance Batches Table (BPR / Check / EFT Headers)
CREATE TABLE IF NOT EXISTS public.edi_835_remittance_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    check_eft_trace_number VARCHAR(64) NOT NULL,
    payment_method_code VARCHAR(16) NOT NULL DEFAULT 'ACH' CHECK (payment_method_code IN ('ACH', 'CHK', 'NON', 'BOP')),
    total_payment_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_payment_amount >= 0),
    payment_effective_date DATE NOT NULL,
    payer_name VARCHAR(150) NOT NULL,
    payer_identifier VARCHAR(64),
    payee_name VARCHAR(150),
    payee_npi VARCHAR(10),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'PROCESSING', 'BALANCED_POSTED', 'BALANCED_EXCEPTIONS', 'OUT_OF_BALANCE', 'REJECTED')
    ),
    total_claims_count INT NOT NULL DEFAULT 0 CHECK (total_claims_count >= 0),
    matched_claims_count INT NOT NULL DEFAULT 0 CHECK (matched_claims_count >= 0),
    exception_claims_count INT NOT NULL DEFAULT 0 CHECK (exception_claims_count >= 0),
    raw_payload_preview TEXT,
    error_summary TEXT,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_fac_835_hash UNIQUE (facility_id, file_hash_sha256)
);

CREATE INDEX IF NOT EXISTS idx_835_batches_fac ON public.edi_835_remittance_batches(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_835_batches_date ON public.edi_835_remittance_batches(facility_id, payment_effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_835_batches_trace ON public.edi_835_remittance_batches(check_eft_trace_number);

-- 2. Claim-Level Remittance Information (CLP Segments)
CREATE TABLE IF NOT EXISTS public.edi_835_claim_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.edi_835_remittance_batches(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    patient_control_number VARCHAR(64) NOT NULL,
    payer_claim_control_number VARCHAR(64),
    claim_status_code VARCHAR(8) NOT NULL DEFAULT '1' CHECK (
        claim_status_code IN ('1', '2', '3', '4', '19', '20', '21', '22')
    ),
    total_claim_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_claim_charge_amount >= 0),
    total_claim_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_claim_paid_amount >= 0),
    patient_responsibility_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (patient_responsibility_amount >= 0),
    contractual_adjustment_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (contractual_adjustment_amount >= 0),
    patient_name VARCHAR(150),
    subscriber_member_id VARCHAR(64),
    match_status VARCHAR(32) NOT NULL DEFAULT 'UNMATCHED' CHECK (
        match_status IN ('MATCHED_EXACT', 'MATCHED_PROBABLE', 'UNMATCHED', 'RESOLVED_MANUAL', 'DISCARDED')
    ),
    match_score INT NOT NULL DEFAULT 0 CHECK (match_score BETWEEN 0 AND 100),
    matched_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
    matched_surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_835_claim_pmt_batch ON public.edi_835_claim_payments(batch_id);
CREATE INDEX IF NOT EXISTS idx_835_claim_pmt_fac_match ON public.edi_835_claim_payments(facility_id, match_status);
CREATE INDEX IF NOT EXISTS idx_835_claim_pmt_ctrl ON public.edi_835_claim_payments(patient_control_number);

-- 3. Line-Level Remittance & CARC Splits (SVC & CAS Segments)
CREATE TABLE IF NOT EXISTS public.edi_835_line_adjudications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_payment_id UUID NOT NULL REFERENCES public.edi_835_claim_payments(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    revenue_code VARCHAR(8),
    cpt_code VARCHAR(16) NOT NULL,
    modifiers TEXT[],
    line_charge_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (line_charge_amount >= 0),
    line_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (line_paid_amount >= 0),
    units_paid NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (units_paid >= 0),
    adjustment_group_code VARCHAR(4),
    carc_code VARCHAR(16),
    carc_amount NUMERIC(12,2) DEFAULT 0.00 CHECK (carc_amount >= 0),
    rarc_code VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_835_line_adj_pmt ON public.edi_835_line_adjudications(claim_payment_id);
CREATE INDEX IF NOT EXISTS idx_835_line_adj_carc ON public.edi_835_line_adjudications(carc_code);

-- 4. Remittance Ingestion & Balancing Exceptions Queue
CREATE TABLE IF NOT EXISTS public.edi_835_remittance_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.edi_835_remittance_batches(id) ON DELETE CASCADE,
    claim_payment_id UUID REFERENCES public.edi_835_claim_payments(id) ON DELETE SET NULL,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    exception_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'ERROR' CHECK (severity IN ('WARNING', 'ERROR', 'FATAL')),
    error_message TEXT NOT NULL,
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (resolution_status IN ('OPEN', 'RESOLVED', 'DISCARDED')),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_action VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_835_exc_fac_status ON public.edi_835_remittance_exceptions(facility_id, resolution_status);

-- 5. Rollup Reporting Views
CREATE OR REPLACE VIEW public.vw_edi_835_batch_summary AS
SELECT
    b.id AS batch_id,
    b.facility_id,
    b.batch_number,
    b.file_name,
    b.check_eft_trace_number,
    b.payment_method_code,
    b.payer_name,
    b.payment_effective_date,
    b.total_payment_amount,
    b.status,
    b.total_claims_count,
    b.matched_claims_count,
    b.exception_claims_count,
    ROUND(CASE WHEN b.total_claims_count > 0 THEN (b.matched_claims_count::NUMERIC / b.total_claims_count::NUMERIC) * 100 ELSE 0 END, 2) AS auto_post_rate_pct,
    b.ingested_at
FROM public.edi_835_remittance_batches b;

CREATE OR REPLACE VIEW public.vw_edi_835_exceptions_queue AS
SELECT
    e.id AS exception_id,
    e.facility_id,
    b.batch_number,
    b.check_eft_trace_number,
    b.payer_name,
    cp.patient_control_number,
    cp.patient_name,
    cp.total_claim_charge_amount,
    cp.total_claim_paid_amount,
    e.exception_type,
    e.severity,
    e.error_message,
    e.resolution_status,
    e.created_at
FROM public.edi_835_remittance_exceptions e
JOIN public.edi_835_remittance_batches b ON e.batch_id = b.id
LEFT JOIN public.edi_835_claim_payments cp ON e.claim_payment_id = cp.id;

-- 6. Tenant-Isolated Row Level Security (RLS)
ALTER TABLE public.edi_835_remittance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_835_claim_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_835_line_adjudications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edi_835_remittance_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_835_batches_tenant ON public.edi_835_remittance_batches;
CREATE POLICY rls_835_batches_tenant ON public.edi_835_remittance_batches
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rls_835_claim_pmts_tenant ON public.edi_835_claim_payments;
CREATE POLICY rls_835_claim_pmts_tenant ON public.edi_835_claim_payments
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rls_835_lines_tenant ON public.edi_835_line_adjudications;
CREATE POLICY rls_835_lines_tenant ON public.edi_835_line_adjudications
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rls_835_exc_tenant ON public.edi_835_remittance_exceptions;
CREATE POLICY rls_835_exc_tenant ON public.edi_835_remittance_exceptions
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));

