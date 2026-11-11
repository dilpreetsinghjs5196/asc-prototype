-- ==============================================================================
-- MIGRATION: 073_patient_ar_recovery.sql
-- PHASE: 96 — Patient AR Recovery (Revenue Cycle Management)
-- DESCRIPTION: Post-insurance patient accounts receivable prioritization,
--              propensity-to-pay segmentation, structured payment plans,
--              and charity care compliance.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Patient AR Recovery Cases Ledger Table
CREATE TABLE IF NOT EXISTS public.patient_ar_recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  patient_name VARCHAR(128) NOT NULL,
  patient_mrn VARCHAR(64) NOT NULL,
  patient_phone VARCHAR(32),
  patient_email VARCHAR(128),
  
  -- Clinical & Statement Dates
  date_of_service DATE NOT NULL,
  statement_date DATE NOT NULL,
  days_in_patient_ar INTEGER NOT NULL CHECK (days_in_patient_ar >= 0),
  
  -- Financial Ledger
  total_charges NUMERIC(14,2) NOT NULL CHECK (total_charges >= 0),
  insurance_paid_amount NUMERIC(14,2) NOT NULL CHECK (insurance_paid_amount >= 0),
  contractual_adjustment NUMERIC(14,2) NOT NULL CHECK (contractual_adjustment >= 0),
  original_patient_resp NUMERIC(14,2) NOT NULL CHECK (original_patient_resp >= 0),
  patient_paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (patient_paid_amount >= 0),
  patient_balance_due NUMERIC(14,2) NOT NULL CHECK (patient_balance_due >= 0),
  
  -- Propensity & Engagement Tiers
  propensity_to_pay_tier VARCHAR(32) NOT NULL,
  engagement_tier VARCHAR(32) NOT NULL,
  
  -- 4-Factor Deterministic Subscores (0.00 - 100.00)
  balance_score NUMERIC(5,2) NOT NULL CHECK (balance_score BETWEEN 0.00 AND 100.00),
  propensity_score NUMERIC(5,2) NOT NULL CHECK (propensity_score BETWEEN 0.00 AND 100.00),
  urgency_score NUMERIC(5,2) NOT NULL CHECK (urgency_score BETWEEN 0.00 AND 100.00),
  engagement_score NUMERIC(5,2) NOT NULL CHECK (engagement_score BETWEEN 0.00 AND 100.00),
  priority_score NUMERIC(5,2) NOT NULL CHECK (priority_score BETWEEN 0.00 AND 100.00),
  
  -- Recovery Action Tier
  recovery_action_tier VARCHAR(32) NOT NULL CHECK (recovery_action_tier IN (
    'TIER_1_DIGITAL_NUDGE',
    'TIER_2_PAYMENT_PLAN_OFFER',
    'TIER_3_COUNSELOR_OUTREACH',
    'TIER_4_FINAL_NOTICE',
    'TIER_5_BAD_DEBT_OR_CHARITY'
  )),
  
  -- Workflow State
  case_status VARCHAR(32) NOT NULL CHECK (case_status IN (
    'NEW_STATEMENT',
    'ENGAGED',
    'ON_PAYMENT_PLAN',
    'PAID_IN_FULL',
    'CHARITY_APPROVED',
    'BAD_DEBT_ASSIGNED',
    'DISPUTED'
  )),
  
  payment_plan_id UUID,
  is_charity_screened BOOLEAN NOT NULL DEFAULT false,
  assigned_counselor_id UUID REFERENCES auth.users(id),
  last_contact_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parc_fac ON public.patient_ar_recovery_cases(facility_id);
CREATE INDEX IF NOT EXISTS idx_parc_claim ON public.patient_ar_recovery_cases(claim_id);
CREATE INDEX IF NOT EXISTS idx_parc_tier ON public.patient_ar_recovery_cases(facility_id, recovery_action_tier);
CREATE INDEX IF NOT EXISTS idx_parc_score ON public.patient_ar_recovery_cases(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_parc_balance ON public.patient_ar_recovery_cases(patient_balance_due DESC);
CREATE INDEX IF NOT EXISTS idx_parc_aging ON public.patient_ar_recovery_cases(days_in_patient_ar ASC);
CREATE INDEX IF NOT EXISTS idx_parc_status ON public.patient_ar_recovery_cases(facility_id, case_status);

-- 2. Create Structured Patient Payment Plans Table
CREATE TABLE IF NOT EXISTS public.patient_payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES public.patient_ar_recovery_cases(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  plan_total_amount NUMERIC(14,2) NOT NULL CHECK (plan_total_amount > 0),
  installment_count INTEGER NOT NULL CHECK (installment_count IN (3, 6, 12, 18, 24)),
  monthly_payment_amount NUMERIC(14,2) NOT NULL CHECK (monthly_payment_amount > 0),
  autopay_enrolled BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL,
  next_payment_date DATE NOT NULL,
  total_paid_to_date NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_paid_to_date >= 0),
  remaining_plan_balance NUMERIC(14,2) NOT NULL CHECK (remaining_plan_balance >= 0),
  plan_status VARCHAR(32) NOT NULL CHECK (plan_status IN ('ACTIVE', 'COMPLETED', 'DELINQUENT', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppp_fac ON public.patient_payment_plans(facility_id);
CREATE INDEX IF NOT EXISTS idx_ppp_case ON public.patient_payment_plans(case_id);
CREATE INDEX IF NOT EXISTS idx_ppp_next_date ON public.patient_payment_plans(next_payment_date);

-- 3. Analytical Views
CREATE OR REPLACE VIEW public.vw_patient_ar_active AS
SELECT 
  parc.id AS case_id,
  parc.facility_id,
  parc.claim_id,
  parc.patient_id,
  parc.patient_name,
  parc.patient_mrn,
  parc.date_of_service,
  parc.statement_date,
  parc.days_in_patient_ar,
  parc.original_patient_resp,
  parc.patient_paid_amount,
  parc.patient_balance_due,
  parc.propensity_to_pay_tier,
  parc.engagement_tier,
  parc.priority_score,
  parc.recovery_action_tier,
  parc.case_status,
  parc.payment_plan_id
FROM public.patient_ar_recovery_cases parc
WHERE parc.case_status NOT IN ('PAID_IN_FULL', 'CHARITY_APPROVED', 'BAD_DEBT_ASSIGNED');

CREATE OR REPLACE VIEW public.vw_patient_ar_summary AS
SELECT
  facility_id,
  recovery_action_tier,
  case_status,
  COUNT(*) AS account_count,
  SUM(patient_balance_due) AS total_balance_due,
  SUM(patient_paid_amount) AS total_recovered_cash,
  ROUND(AVG(days_in_patient_ar), 1) AS avg_days_in_ar,
  ROUND(AVG(priority_score), 2) AS avg_priority_score
FROM public.patient_ar_recovery_cases
GROUP BY facility_id, recovery_action_tier, case_status;

-- 4. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.patient_ar_recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_payment_plans ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies (1:1 Statement Parity)
DROP POLICY IF EXISTS patient_ar_recovery_cases_isolation ON public.patient_ar_recovery_cases;
CREATE POLICY patient_ar_recovery_cases_isolation ON public.patient_ar_recovery_cases
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS patient_payment_plans_isolation ON public.patient_payment_plans;
CREATE POLICY patient_payment_plans_isolation ON public.patient_payment_plans
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
