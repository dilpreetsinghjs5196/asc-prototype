-- ==============================================================================
-- MIGRATION: 061_patient_balances.sql
-- PHASE: 87 — Patient Responsibility, Collections & Aging (Revenue Cycle Management)
-- DESCRIPTION: Post-adjudication patient liability, WEDI/X12 CARC PR cost share tracking,
--              GAAP aging schedules, structured payment plans, and facility tenancy RLS.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Patient Balances Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_patient_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT,
  
  -- Identifiers & Responsibility Classification
  balance_control_number VARCHAR(64) NOT NULL UNIQUE,
  responsibility_type VARCHAR(32) NOT NULL DEFAULT 'DEDUCTIBLE' CHECK (responsibility_type IN (
    'DEDUCTIBLE',
    'COINSURANCE',
    'COPAY',
    'NON_COVERED',
    'SELF_PAY'
  )),
  status VARCHAR(32) NOT NULL DEFAULT 'ADJUDICATED_FINAL' CHECK (status IN (
    'PENDING_INSURANCE',
    'ADJUDICATED_FINAL',
    'STATEMENT_SENT',
    'PAYMENT_PLAN_ACTIVE',
    'PARTIALLY_PAID',
    'PAID_IN_FULL',
    'DELINQUENT_PRE_COLLECTIONS',
    'EXTERNAL_COLLECTIONS',
    'BAD_DEBT_WRITEOFF',
    'CHARITY_CARE_WRITEOFF'
  )),
  
  -- Deterministic Financial Arithmetic
  original_balance_amount NUMERIC(14,2) NOT NULL CHECK (original_balance_amount >= 0),
  adjustments_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (adjustments_amount >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  current_balance_amount NUMERIC(14,2) GENERATED ALWAYS AS (original_balance_amount - adjustments_amount - paid_amount) STORED,
  
  -- Statement & Billing Lifecycle
  statement_date DATE,
  statement_count INT NOT NULL DEFAULT 0 CHECK (statement_count >= 0),
  last_payment_date DATE,
  
  -- Installment Payment Plan Details
  is_payment_plan BOOLEAN NOT NULL DEFAULT FALSE,
  payment_plan_monthly_amt NUMERIC(10,2) DEFAULT 0.00 CHECK (payment_plan_monthly_amt >= 0),
  payment_plan_terms_months INT DEFAULT 0 CHECK (payment_plan_terms_months >= 0),
  
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rapid lookup and query acceleration
CREATE INDEX IF NOT EXISTS idx_rcm_patient_balances_facility ON public.rcm_patient_balances(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_patient_balances_patient ON public.rcm_patient_balances(patient_id);
CREATE INDEX IF NOT EXISTS idx_rcm_patient_balances_claim ON public.rcm_patient_balances(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_patient_balances_status ON public.rcm_patient_balances(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_patient_balances_statement_date ON public.rcm_patient_balances(statement_date);

-- 2. Create Patient Balance Audit Events Ledger
CREATE TABLE IF NOT EXISTS public.rcm_patient_balance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  balance_id UUID NOT NULL REFERENCES public.rcm_patient_balances(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
    'INITIAL_BALANCE_POSTED',
    'STATEMENT_GENERATED',
    'PAYMENT_APPLIED',
    'DISCOUNT_APPLIED',
    'PAYMENT_PLAN_INITIATED',
    'PAYMENT_PLAN_DEFAULTED',
    'COLLECTION_DEMAND_SERVED',
    'TRANSFERRED_TO_COLLECTIONS',
    'BAD_DEBT_WRITEOFF',
    'CHARITY_CARE_APPLIED'
  )),
  amount NUMERIC(14,2) DEFAULT 0.00,
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  action_by UUID REFERENCES auth.users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_patient_balance_events_balance ON public.rcm_patient_balance_events(balance_id);
CREATE INDEX IF NOT EXISTS idx_rcm_patient_balance_events_facility ON public.rcm_patient_balance_events(facility_id);

-- 3. Analytical Views
-- View: Real-time Patient Aging Schedule
CREATE OR REPLACE VIEW public.vw_rcm_patient_balances_aging AS
SELECT 
  b.id,
  b.facility_id,
  b.balance_control_number,
  b.patient_id,
  COALESCE(pat.name, 'Patient Encounter') AS patient_name,
  COALESCE(pat.mrn, 'MRN-UNAVAILABLE') AS patient_mrn,
  b.claim_id,
  cl.patient_control_number AS claim_number,
  b.responsibility_type,
  b.status,
  b.original_balance_amount,
  b.adjustments_amount,
  b.paid_amount,
  b.current_balance_amount,
  b.statement_date,
  b.statement_count,
  COALESCE(CURRENT_DATE - b.statement_date, 0) AS aging_days,
  CASE 
    WHEN b.statement_date IS NULL THEN 'UNBILLED'
    WHEN (CURRENT_DATE - b.statement_date) <= 30 THEN 'CURRENT_0_30'
    WHEN (CURRENT_DATE - b.statement_date) <= 60 THEN 'AGING_31_60'
    WHEN (CURRENT_DATE - b.statement_date) <= 90 THEN 'AGING_61_90'
    WHEN (CURRENT_DATE - b.statement_date) <= 120 THEN 'AGING_91_120'
    ELSE 'AGING_120_PLUS'
  END AS aging_bucket,
  b.is_payment_plan,
  b.payment_plan_monthly_amt,
  b.created_at
FROM public.rcm_patient_balances b
JOIN public.claims cl ON b.claim_id = cl.id
JOIN public.patients pat ON b.patient_id = pat.id;

-- View: Delinquent & Collection Priority Worklist
CREATE OR REPLACE VIEW public.vw_rcm_patient_collections_worklist AS
SELECT 
  b.facility_id,
  b.status,
  COUNT(b.id) AS total_accounts,
  SUM(b.original_balance_amount) AS total_original_dollars,
  SUM(b.paid_amount) AS total_collected_dollars,
  SUM(b.current_balance_amount) AS total_outstanding_dollars,
  ROUND(
    CASE WHEN SUM(b.original_balance_amount) > 0 
      THEN (SUM(b.paid_amount) / SUM(b.original_balance_amount)) * 100.0 
      ELSE 0.00 
    END, 2
  ) AS collection_rate_pct,
  COUNT(CASE WHEN b.is_payment_plan = TRUE THEN 1 END) AS payment_plan_accounts,
  COUNT(CASE WHEN b.statement_count >= 3 THEN 1 END) AS high_statement_accounts
FROM public.rcm_patient_balances b
GROUP BY b.facility_id, b.status;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.rcm_patient_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_patient_balance_events ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies with 1:1 DROP/CREATE Parity
DROP POLICY IF EXISTS rls_rcm_patient_balances_tenant ON public.rcm_patient_balances;
CREATE POLICY rls_rcm_patient_balances_tenant ON public.rcm_patient_balances
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_patient_balance_events_tenant ON public.rcm_patient_balance_events;
CREATE POLICY rls_rcm_patient_balance_events_tenant ON public.rcm_patient_balance_events
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );
