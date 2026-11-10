-- ==============================================================================
-- MIGRATION: 063_reconciliation_engine.sql
-- PHASE: 89 — Claim/Remittance/Payment Reconciliation Engine (Revenue Cycle Management)
-- DESCRIPTION: Four-way financial reconciliation across billed claims, 835 remittance,
--              bank deposits, and patient balances; discrepancy handling and tenant RLS.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Reconciliation Header Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_reconciliation_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT,
  remittance_id UUID REFERENCES public.edi_835_claim_payments(id) ON DELETE SET NULL,
  payment_batch_id UUID REFERENCES public.rcm_payment_batches(id) ON DELETE SET NULL,
  
  -- Identifiers & Reconciliation Classification
  reconciliation_control_number VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'PARTIALLY_RECONCILED' CHECK (status IN (
    'FULLY_RECONCILED',
    'PARTIALLY_RECONCILED',
    'UNDERPAYMENT_DISCREPANCY',
    'OVERPAYMENT_DISCREPANCY',
    'UNMATCHED_REMITTANCE',
    'SUSPENSE_UNIDENTIFIED_CASH',
    'CLOSED_BALANCED'
  )),
  
  -- Deterministic Financial Arithmetic
  billed_amount NUMERIC(14,2) NOT NULL CHECK (billed_amount >= 0),
  expected_reimbursement NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (expected_reimbursement >= 0),
  remittance_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (remittance_paid_amount >= 0),
  bank_deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (bank_deposit_amount >= 0),
  contractual_adjustment_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  patient_responsibility_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_responsibility_amount >= 0),
  
  -- Stored Invariant Variance: Billed - Paid - Contractual - Patient
  variance_amount NUMERIC(14,2) GENERATED ALWAYS AS (
    billed_amount - remittance_paid_amount - contractual_adjustment_amount - patient_responsibility_amount
  ) STORED,
  
  bank_deposit_variance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_recon_records_fac ON public.rcm_reconciliation_records(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_recon_records_claim ON public.rcm_reconciliation_records(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_recon_records_status ON public.rcm_reconciliation_records(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_recon_records_ctrl ON public.rcm_reconciliation_records(reconciliation_control_number);

-- 2. Create Reconciliation Discrepancy Exception Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_reconciliation_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  reconciliation_id UUID NOT NULL REFERENCES public.rcm_reconciliation_records(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  discrepancy_type VARCHAR(40) NOT NULL CHECK (discrepancy_type IN (
    'UNDERPAYMENT_CONTRACT_RATE',
    'OVERPAYMENT_DUPLICATE',
    'UNMATCHED_EFT_DEPOSIT',
    'MISSING_ERA_REMITTANCE',
    'UNBALANCED_CAS_SPLIT',
    'UNAUTHORIZED_FEE_DISALLOWANCE'
  )),
  variance_amount NUMERIC(14,2) NOT NULL,
  disposition_status VARCHAR(32) NOT NULL DEFAULT 'OPEN_INVESTIGATION' CHECK (disposition_status IN (
    'OPEN_INVESTIGATION',
    'RESOLVED_ADJUSTED',
    'APPEALED_UNDERPAYMENT',
    'REFUNDED_OVERPAYMENT',
    'WRITTEN_OFF'
  )),
  assigned_to UUID REFERENCES auth.users(id),
  resolution_action VARCHAR(40),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_recon_disc_fac ON public.rcm_reconciliation_discrepancies(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_recon_disc_recon ON public.rcm_reconciliation_discrepancies(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_rcm_recon_disc_claim ON public.rcm_reconciliation_discrepancies(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_recon_disc_status ON public.rcm_reconciliation_discrepancies(facility_id, disposition_status);

-- 3. Analytical Views
-- View 1: Real-time Reconciliation Summary
CREATE OR REPLACE VIEW public.vw_rcm_reconciliation_summary AS
SELECT 
  r.id AS reconciliation_id,
  r.facility_id,
  r.reconciliation_control_number,
  r.status,
  r.claim_id,
  c.patient_control_number AS claim_number,
  c.patient_id,
  COALESCE(p.name, 'Patient Encounter') AS patient_name,
  COALESCE(p.mrn, 'MRN-UNAVAILABLE') AS patient_mrn,
  c.primary_payer_id,
  COALESCE(pay.name, 'Unassigned Payer') AS primary_payer_name,
  COALESCE(pay.payer_type, 'COMMERCIAL') AS financial_class,
  s.date::DATE AS date_of_service,
  r.billed_amount,
  r.expected_reimbursement,
  r.remittance_paid_amount,
  r.bank_deposit_amount,
  r.contractual_adjustment_amount,
  r.patient_responsibility_amount,
  r.variance_amount,
  r.bank_deposit_variance,
  r.reconciled_at,
  r.created_at
FROM public.rcm_reconciliation_records r
JOIN public.claims c ON r.claim_id = c.id
JOIN public.surgeries s ON c.surgery_id = s.id
LEFT JOIN public.patients p ON c.patient_id = p.id
LEFT JOIN public.payers pay ON c.primary_payer_id = pay.id;

-- View 2: Discrepancy Priority Worklist
CREATE OR REPLACE VIEW public.vw_rcm_discrepancy_worklist AS
SELECT 
  d.id AS discrepancy_id,
  d.facility_id,
  d.discrepancy_type,
  d.variance_amount,
  d.disposition_status,
  d.created_at AS reported_at,
  r.reconciliation_control_number,
  c.patient_control_number AS claim_number,
  COALESCE(p.name, 'Patient Encounter') AS patient_name,
  COALESCE(pay.name, 'Unassigned Payer') AS primary_payer_name,
  d.assigned_to,
  d.resolution_action,
  d.resolved_at
FROM public.rcm_reconciliation_discrepancies d
JOIN public.rcm_reconciliation_records r ON d.reconciliation_id = r.id
JOIN public.claims c ON d.claim_id = c.id
LEFT JOIN public.patients p ON c.patient_id = p.id
LEFT JOIN public.payers pay ON c.primary_payer_id = pay.id;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.rcm_reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies with 1:1 DROP/CREATE Parity
DROP POLICY IF EXISTS rls_rcm_reconciliation_records_tenant ON public.rcm_reconciliation_records;
CREATE POLICY rls_rcm_reconciliation_records_tenant ON public.rcm_reconciliation_records
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_reconciliation_discrepancies_tenant ON public.rcm_reconciliation_discrepancies;
CREATE POLICY rls_rcm_reconciliation_discrepancies_tenant ON public.rcm_reconciliation_discrepancies
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

