-- ==============================================================================
-- MIGRATION: 057_rcm_payments_adjustments.sql
-- PHASE: 83 — Payments, Contractual Adjustments, Refunds & Cash Posting Ledger
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Deposit Batches Table (Lockbox, ERA, Credit Card Batches)
CREATE TABLE IF NOT EXISTS public.rcm_payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    batch_number VARCHAR(64) NOT NULL,
    deposit_date DATE NOT NULL,
    bank_account_name VARCHAR(100) NOT NULL,
    batch_type VARCHAR(32) NOT NULL DEFAULT 'MANUAL_LOCKBOX' CHECK (
        batch_type IN ('ELECTRONIC_ERA', 'MANUAL_LOCKBOX', 'CREDIT_CARD_GATEWAY', 'PATIENT_PORTAL')
    ),
    total_batch_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_batch_amount >= 0),
    posted_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (posted_amount >= 0),
    unapplied_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (unapplied_amount >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'BALANCED_POSTED', 'OUT_OF_BALANCE', 'CLOSED_FROZEN')
    ),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fac_pmt_batch UNIQUE (facility_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_rcm_pmt_batches_fac ON public.rcm_payment_batches(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_pmt_batches_date ON public.rcm_payment_batches(facility_id, deposit_date DESC);

-- 2. Cash Posting Transactions Ledger
CREATE TABLE IF NOT EXISTS public.rcm_payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.rcm_payment_batches(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    claim_id UUID REFERENCES public.claims(id) ON DELETE RESTRICT,
    claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE SET NULL,
    transaction_type VARCHAR(32) NOT NULL CHECK (
        transaction_type IN ('PAYER_PAYMENT', 'PATIENT_PAYMENT', 'CONTRACTUAL_ADJUSTMENT', 'ADMIN_WRITE_OFF', 'REFUND', 'RECOUPMENT')
    ),
    payment_method VARCHAR(24) NOT NULL DEFAULT 'CHECK' CHECK (
        payment_method IN ('EFT', 'CHECK', 'CREDIT_CARD', 'CASH', 'ACH', 'OFFSET')
    ),
    reference_number VARCHAR(64) NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    carc_code VARCHAR(16),
    patient_mrn VARCHAR(64),
    patient_name VARCHAR(150),
    payer_name VARCHAR(150),
    transaction_date DATE NOT NULL,
    reversal_of_transaction_id UUID REFERENCES public.rcm_payment_transactions(id) ON DELETE SET NULL,
    posted_by UUID REFERENCES auth.users(id),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_pmt_tx_batch ON public.rcm_payment_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_rcm_pmt_tx_claim ON public.rcm_payment_transactions(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_pmt_tx_fac_type ON public.rcm_payment_transactions(facility_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_rcm_pmt_tx_date ON public.rcm_payment_transactions(facility_id, transaction_date DESC);

-- 3. Refunds & Recoupments Approval Ledger
CREATE TABLE IF NOT EXISTS public.rcm_refund_recoupment_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    claim_id UUID REFERENCES public.claims(id) ON DELETE RESTRICT,
    original_transaction_id UUID REFERENCES public.rcm_payment_transactions(id) ON DELETE SET NULL,
    type VARCHAR(32) NOT NULL CHECK (
        type IN ('PATIENT_REFUND', 'PAYER_REFUND', 'PAYER_RECOUPMENT')
    ),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason_code VARCHAR(64) NOT NULL CHECK (
        reason_code IN ('OVERPAYMENT', 'BILLING_ERROR', 'MEDICARE_AUDIT', 'DUPLICATE_PAYMENT', 'RETROACTIVE_DENIAL')
    ),
    disbursement_reference VARCHAR(64),
    approval_status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (
        approval_status IN ('PENDING_APPROVAL', 'APPROVED', 'DISBURSED', 'REJECTED')
    ),
    requested_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_refund_fac_status ON public.rcm_refund_recoupment_ledger(facility_id, approval_status);

-- 4. Rollup Reporting Views
CREATE OR REPLACE VIEW public.vw_rcm_cash_posting_summary AS
SELECT
    b.id AS batch_id,
    b.facility_id,
    b.batch_number,
    b.deposit_date,
    b.bank_account_name,
    b.batch_type,
    b.total_batch_amount,
    b.posted_amount,
    b.unapplied_amount,
    b.status,
    COUNT(t.id) AS transaction_count,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('PAYER_PAYMENT', 'PATIENT_PAYMENT') THEN t.amount ELSE 0 END), 0) AS total_cash_collected,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'CONTRACTUAL_ADJUSTMENT' THEN t.amount ELSE 0 END), 0) AS total_contractual_writeoffs,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'ADMIN_WRITE_OFF' THEN t.amount ELSE 0 END), 0) AS total_admin_writeoffs
FROM public.rcm_payment_batches b
LEFT JOIN public.rcm_payment_transactions t ON b.id = t.batch_id
GROUP BY b.id, b.facility_id, b.batch_number, b.deposit_date, b.bank_account_name, b.batch_type, b.total_batch_amount, b.posted_amount, b.unapplied_amount, b.status;

CREATE OR REPLACE VIEW public.vw_rcm_unapplied_cash_ledger AS
SELECT
    b.id AS batch_id,
    b.facility_id,
    b.batch_number,
    b.deposit_date,
    b.bank_account_name,
    b.unapplied_amount,
    (CURRENT_DATE - b.deposit_date) AS aging_days,
    CASE
        WHEN (CURRENT_DATE - b.deposit_date) <= 30 THEN '0-30 Days'
        WHEN (CURRENT_DATE - b.deposit_date) <= 60 THEN '31-60 Days'
        WHEN (CURRENT_DATE - b.deposit_date) <= 90 THEN '61-90 Days'
        ELSE '90+ Days'
    END AS aging_tier
FROM public.rcm_payment_batches b
WHERE b.unapplied_amount > 0;

-- 5. Tenant-Isolated Row Level Security (RLS) - Idempotent
ALTER TABLE public.rcm_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_refund_recoupment_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_rcm_batches_tenant ON public.rcm_payment_batches;
CREATE POLICY rls_rcm_batches_tenant ON public.rcm_payment_batches
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rls_rcm_pmt_tx_tenant ON public.rcm_payment_transactions;
CREATE POLICY rls_rcm_pmt_tx_tenant ON public.rcm_payment_transactions
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rls_rcm_refunds_tenant ON public.rcm_refund_recoupment_ledger;
CREATE POLICY rls_rcm_refunds_tenant ON public.rcm_refund_recoupment_ledger
    FOR ALL USING (facility_id IN (SELECT public.get_auth_user_facilities()));
