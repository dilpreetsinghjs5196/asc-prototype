-- ==============================================================================
-- MIGRATION: 072_missing_secondary_payment.sql
-- PHASE: 95 — Missing Secondary Payment (Revenue Cycle Management)
-- DESCRIPTION: Secondary-payer and coordination-of-benefits (COB) leakage checks,
--              expected reimbursement calculation, patient statement hold guardian,
--              and prioritized secondary claim recovery queues.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Missing Secondary Payments Ledger Table
CREATE TABLE IF NOT EXISTS public.missing_secondary_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  patient_name VARCHAR(128) NOT NULL,
  patient_mrn VARCHAR(64) NOT NULL,
  
  -- Primary Adjudication Context
  primary_payer_id UUID NOT NULL,
  primary_payer_name VARCHAR(128) NOT NULL,
  primary_paid_amount NUMERIC(14,2) NOT NULL CHECK (primary_paid_amount >= 0),
  primary_allowed_amount NUMERIC(14,2) NOT NULL CHECK (primary_allowed_amount >= 0),
  primary_eob_date DATE NOT NULL,
  primary_patient_resp_amount NUMERIC(14,2) NOT NULL CHECK (primary_patient_resp_amount >= 0),
  
  -- Secondary Payer & Policy
  secondary_payer_id UUID NOT NULL,
  secondary_payer_name VARCHAR(128) NOT NULL,
  secondary_policy_number VARCHAR(64) NOT NULL,
  secondary_cob_model VARCHAR(32) NOT NULL CHECK (secondary_cob_model IN (
    'MEDIGAP_SUPPLEMENT',
    'STANDARD_COB',
    'NON_DUPLICATION_CARVEOUT'
  )),
  
  -- Secondary Financial Recovery
  secondary_expected_amount NUMERIC(14,2) NOT NULL CHECK (secondary_expected_amount >= 0),
  secondary_actual_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (secondary_actual_paid_amount >= 0),
  
  -- Deadlines & Urgency
  secondary_filing_deadline DATE NOT NULL,
  days_until_filing_deadline INTEGER NOT NULL,
  
  -- Root Cause & Readiness
  leakage_root_cause VARCHAR(40) NOT NULL CHECK (leakage_root_cause IN (
    'UNFILED_SECONDARY_CLAIM',
    'FAILED_CROSSOVER',
    'PREMATURE_PATIENT_BILLING',
    'SECONDARY_TIMELY_FILING_RISK',
    'MISSING_PRIMARY_EOB',
    'SECONDARY_COB_DENIAL',
    'SECONDARY_UNDERPAYMENT'
  )),
  coverage_certainty VARCHAR(32) NOT NULL,
  filing_readiness VARCHAR(32) NOT NULL,
  
  -- 4-Factor Deterministic Subscores (0.00 - 100.00)
  balance_score NUMERIC(5,2) NOT NULL CHECK (balance_score BETWEEN 0.00 AND 100.00),
  urgency_score NUMERIC(5,2) NOT NULL CHECK (urgency_score BETWEEN 0.00 AND 100.00),
  certainty_score NUMERIC(5,2) NOT NULL CHECK (certainty_score BETWEEN 0.00 AND 100.00),
  readiness_score NUMERIC(5,2) NOT NULL CHECK (readiness_score BETWEEN 0.00 AND 100.00),
  priority_score NUMERIC(5,2) NOT NULL CHECK (priority_score BETWEEN 0.00 AND 100.00),
  
  -- Priority Tier Classification
  priority_tier VARCHAR(32) NOT NULL CHECK (priority_tier IN (
    'CRITICAL_URGENT',
    'HIGH_PRIORITY',
    'MEDIUM_PRIORITY',
    'LOW_PRIORITY',
    'UNCOLLECTIBLE_HOLD'
  )),
  
  -- Queue Status & Protection
  queue_status VARCHAR(32) NOT NULL CHECK (queue_status IN (
    'IDENTIFIED',
    'READY_TO_FILE',
    'SUBMITTED',
    'PENDING_ADJUDICATION',
    'RECOVERED',
    'TRANSFERRED_TO_PATIENT',
    'WRITTEN_OFF'
  )),
  patient_statement_held BOOLEAN NOT NULL DEFAULT true,
  assigned_user_id UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msp_fac ON public.missing_secondary_payments(facility_id);
CREATE INDEX IF NOT EXISTS idx_msp_claim ON public.missing_secondary_payments(claim_id);
CREATE INDEX IF NOT EXISTS idx_msp_tier ON public.missing_secondary_payments(facility_id, priority_tier);
CREATE INDEX IF NOT EXISTS idx_msp_score ON public.missing_secondary_payments(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_msp_deadline ON public.missing_secondary_payments(days_until_filing_deadline ASC);
CREATE INDEX IF NOT EXISTS idx_msp_status ON public.missing_secondary_payments(facility_id, queue_status);
CREATE INDEX IF NOT EXISTS idx_msp_held ON public.missing_secondary_payments(facility_id, patient_statement_held);

-- 2. Create Secondary COB Rules Configuration Table
CREATE TABLE IF NOT EXISTS public.secondary_cob_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  payer_id UUID,
  rule_name VARCHAR(128) NOT NULL,
  cob_model VARCHAR(32) NOT NULL CHECK (cob_model IN (
    'MEDIGAP_SUPPLEMENT',
    'STANDARD_COB',
    'NON_DUPLICATION_CARVEOUT'
  )),
  timely_filing_days INTEGER NOT NULL DEFAULT 90 CHECK (timely_filing_days > 0),
  requires_primary_eob BOOLEAN NOT NULL DEFAULT true,
  supports_electronic_crossover BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scr_fac ON public.secondary_cob_rules(facility_id);
CREATE INDEX IF NOT EXISTS idx_scr_payer ON public.secondary_cob_rules(facility_id, payer_id);

-- 3. Analytical Views
CREATE OR REPLACE VIEW public.vw_missing_secondary_active AS
SELECT 
  msp.id AS secondary_payment_id,
  msp.facility_id,
  msp.claim_id,
  msp.patient_id,
  msp.patient_name,
  msp.patient_mrn,
  msp.primary_payer_name,
  msp.primary_paid_amount,
  msp.primary_patient_resp_amount,
  msp.primary_eob_date,
  msp.secondary_payer_name,
  msp.secondary_policy_number,
  msp.secondary_cob_model,
  msp.secondary_expected_amount,
  msp.secondary_filing_deadline,
  msp.days_until_filing_deadline,
  msp.leakage_root_cause,
  msp.priority_score,
  msp.priority_tier,
  msp.queue_status,
  msp.patient_statement_held
FROM public.missing_secondary_payments msp
WHERE msp.queue_status NOT IN ('RECOVERED', 'TRANSFERRED_TO_PATIENT', 'WRITTEN_OFF');

CREATE OR REPLACE VIEW public.vw_missing_secondary_summary AS
SELECT
  facility_id,
  priority_tier,
  queue_status,
  COUNT(*) AS claim_count,
  SUM(primary_patient_resp_amount) AS total_patient_resp,
  SUM(secondary_expected_amount) AS total_expected_secondary_recovery,
  COUNT(*) FILTER (WHERE patient_statement_held = true) AS statements_held_count,
  ROUND(AVG(priority_score), 2) AS avg_priority_score
FROM public.missing_secondary_payments
GROUP BY facility_id, priority_tier, queue_status;

-- 4. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.missing_secondary_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secondary_cob_rules ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies (1:1 Statement Parity)
DROP POLICY IF EXISTS missing_secondary_payments_isolation ON public.missing_secondary_payments;
CREATE POLICY missing_secondary_payments_isolation ON public.missing_secondary_payments
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS secondary_cob_rules_isolation ON public.secondary_cob_rules;
CREATE POLICY secondary_cob_rules_isolation ON public.secondary_cob_rules
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
