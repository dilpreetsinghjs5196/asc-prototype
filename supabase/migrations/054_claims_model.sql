-- ==============================================================================
-- MIGRATION: 054_claims_model.sql
-- PHASE: 80 — Claims Model (Revenue Cycle Management)
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Extend public.claims with RCM lifecycle and external trace attributes
ALTER TABLE public.claims
    ADD COLUMN IF NOT EXISTS rcm_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
        CHECK (rcm_status IN (
            'DRAFT', 'READY_TO_SCRUB', 'SCRUBBING', 'SCRUB_FAILED', 'SCRUB_PASSED',
            'READY_TO_TRANSMIT', 'TRANSMITTED', 'ACCEPTED_CLEARINGHOUSE',
            'ACCEPTED_PAYER', 'REJECTED_CLEARINGHOUSE', 'REJECTED_PAYER',
            'IN_ADJUDICATION', 'PAID', 'PARTIALLY_PAID', 'DENIED',
            'APPEALED', 'REBILLED', 'VOIDED', 'CLOSED_BALANCED'
        )),
    ADD COLUMN IF NOT EXISTS billing_format VARCHAR(24) NOT NULL DEFAULT 'UB04_INSTITUTIONAL'
        CHECK (billing_format IN ('UB04_INSTITUTIONAL', 'CMS1500_PROFESSIONAL')),
    ADD COLUMN IF NOT EXISTS clearinghouse_claim_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS payer_claim_control_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS transmission_batch_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS source_system_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS clearinghouse_ack_status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS clearinghouse_ack_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payer_ack_status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS payer_ack_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS initial_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS adjudicated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS total_allowed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_allowed_amount >= 0),
    ADD COLUMN IF NOT EXISTS total_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_paid_amount >= 0),
    ADD COLUMN IF NOT EXISTS total_contractual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_patient_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_patient_balance >= 0),
    ADD COLUMN IF NOT EXISTS outstanding_ar_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_status_change_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_claims_rcm_status ON public.claims(facility_id, rcm_status);
CREATE INDEX IF NOT EXISTS idx_claims_payer_icn ON public.claims(payer_claim_control_number);
CREATE INDEX IF NOT EXISTS idx_claims_clearinghouse_id ON public.claims(clearinghouse_claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_batch ON public.claims(transmission_batch_id);

-- 2. Extend public.claim_lines with financial adjudication and revenue codes
ALTER TABLE public.claim_lines
    ADD COLUMN IF NOT EXISTS revenue_code VARCHAR(4) DEFAULT '0490',
    ADD COLUMN IF NOT EXISTS line_rcm_status VARCHAR(32) NOT NULL DEFAULT 'ENTERED'
        CHECK (line_rcm_status IN ('ENTERED', 'SUBMITTED', 'ADJUDICATED_PAID', 'ADJUDICATED_DENIED', 'ADJUSTED', 'APPEAL_PENDING')),
    ADD COLUMN IF NOT EXISTS allowed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (allowed_amount >= 0),
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    ADD COLUMN IF NOT EXISTS contractual_adjustment NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS patient_copay NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_copay >= 0),
    ADD COLUMN IF NOT EXISTS patient_coinsurance NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_coinsurance >= 0),
    ADD COLUMN IF NOT EXISTS patient_deductible NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_deductible >= 0),
    ADD COLUMN IF NOT EXISTS disallowed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (disallowed_amount >= 0),
    ADD COLUMN IF NOT EXISTS line_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_claim_lines_rev_code ON public.claim_lines(revenue_code);
CREATE INDEX IF NOT EXISTS idx_claim_lines_rcm_status ON public.claim_lines(line_rcm_status);

-- 3. Claim Lifecycle Audit History Table
CREATE TABLE IF NOT EXISTS public.claim_lifecycle_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
    from_status VARCHAR(32),
    to_status VARCHAR(32) NOT NULL,
    transition_event VARCHAR(64) NOT NULL,
    actor_id UUID REFERENCES auth.users(id),
    actor_role VARCHAR(32),
    clearinghouse_trace_id VARCHAR(64),
    payer_icn VARCHAR(64),
    notes TEXT,
    event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_life_hist_claim ON public.claim_lifecycle_history(claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_life_hist_fac ON public.claim_lifecycle_history(facility_id);

-- 4. Analytical Rollup View: Claims RCM Summary
CREATE OR REPLACE VIEW public.vw_claims_rcm_summary AS
SELECT
    c.id AS claim_id,
    c.facility_id,
    c.patient_control_number,
    c.billing_format,
    c.claim_type,
    c.claim_frequency_type,
    c.rcm_status,
    c.scrub_status,
    c.clearinghouse_claim_id,
    c.payer_claim_control_number,
    p.name AS primary_payer_name,
    p.payer_type AS primary_payer_type,
    c.total_gross_charge,
    c.total_allowed_amount,
    c.total_paid_amount,
    c.total_contractual_adjustment,
    c.total_patient_balance,
    c.outstanding_ar_balance,
    c.initial_submitted_at,
    c.last_submitted_at,
    c.adjudicated_at,
    COUNT(cl.id) AS total_line_count,
    ROUND(CASE WHEN c.total_gross_charge > 0 THEN (c.total_paid_amount / c.total_gross_charge) * 100 ELSE 0.00 END, 2) AS payment_yield_pct
FROM public.claims c
LEFT JOIN public.payers p ON p.id = c.primary_payer_id
LEFT JOIN public.claim_lines cl ON cl.claim_id = c.id
GROUP BY
    c.id,
    c.facility_id,
    c.patient_control_number,
    c.billing_format,
    c.claim_type,
    c.claim_frequency_type,
    c.rcm_status,
    c.scrub_status,
    c.clearinghouse_claim_id,
    c.payer_claim_control_number,
    p.name,
    p.payer_type,
    c.total_gross_charge,
    c.total_allowed_amount,
    c.total_paid_amount,
    c.total_contractual_adjustment,
    c.total_patient_balance,
    c.outstanding_ar_balance,
    c.initial_submitted_at,
    c.last_submitted_at,
    c.adjudicated_at;

-- 5. Analytical Rollup View: Claim Line Adjudication
CREATE OR REPLACE VIEW public.vw_claim_line_adjudication AS
SELECT
    cl.id AS claim_line_id,
    cl.claim_id,
    cl.facility_id,
    cl.line_number,
    cl.date_of_service,
    cl.revenue_code,
    cl.cpt_code,
    cl.procedure_description,
    cl.modifiers,
    cl.units,
    cl.gross_charge,
    cl.allowed_amount,
    cl.paid_amount,
    cl.contractual_adjustment,
    cl.patient_copay,
    cl.patient_coinsurance,
    cl.patient_deductible,
    (cl.patient_copay + cl.patient_coinsurance + cl.patient_deductible) AS total_patient_responsibility,
    cl.disallowed_amount,
    cl.line_balance,
    cl.line_rcm_status
FROM public.claim_lines cl;

-- 6. Row-Level Security (RLS)
ALTER TABLE public.claim_lifecycle_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY claim_life_hist_select_policy ON public.claim_lifecycle_history
    FOR SELECT TO authenticated
    USING (public.is_facility_accessible(facility_id));

CREATE POLICY claim_life_hist_insert_policy ON public.claim_lifecycle_history
    FOR INSERT TO authenticated
    WITH CHECK (public.is_facility_accessible(facility_id));
