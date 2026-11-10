-- ==============================================================================
-- MIGRATION: 065_unbilled_case_detection.sql
-- PHASE: 91 — Unbilled Case Detection Engine (Revenue Cycle Management)
-- DESCRIPTION: Completed/coded but unbilled case detection, hold reason diagnosis,
--              aging bucket classification, timely filing risk tiering, and resolution.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Unbilled Case Tracking Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_unbilled_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  
  -- Identifiers & Clinical Procedure
  case_number VARCHAR(64) NOT NULL UNIQUE,
  surgeon_name VARCHAR(128) NOT NULL,
  specialty VARCHAR(64) NOT NULL,
  procedure_name VARCHAR(256) NOT NULL,
  primary_cpt VARCHAR(16) NOT NULL,
  
  -- Payer & Encounter Dates
  payer_name VARCHAR(128) NOT NULL,
  payer_type VARCHAR(32) NOT NULL CHECK (payer_type IN (
    'COMMERCIAL',
    'MEDICARE',
    'MEDICAID',
    'WORKERS_COMP',
    'SELF_PAY'
  )),
  date_of_service DATE NOT NULL,
  coded_date DATE,
  
  -- Financial Dimensions
  total_charges NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_charges >= 0),
  expected_reimbursement NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (expected_reimbursement >= 0),
  
  -- Hold Reason & Lifecycle Status
  hold_reason VARCHAR(64) NOT NULL CHECK (hold_reason IN (
    'IMPLANT_INVOICE_LAG',
    'PHYSICIAN_QUERY_PENDING',
    'PATHOLOGY_PENDING',
    'AUTH_RETRO_PENDING',
    'COB_VALIDATION',
    'BILLING_SCRUB_ERROR',
    'READY_TO_RELEASE'
  )),
  unbilled_status VARCHAR(32) NOT NULL DEFAULT 'HELD' CHECK (unbilled_status IN (
    'HELD',
    'UNDER_INVESTIGATION',
    'HOLD_RESOLVED',
    'CLAIM_RELEASED',
    'WRITTEN_OFF_TIMELY_FILING'
  )),
  
  -- Timely Filing Risk & Priority
  filing_deadline DATE NOT NULL,
  timely_filing_risk_tier VARCHAR(16) NOT NULL DEFAULT 'NORMAL' CHECK (timely_filing_risk_tier IN (
    'CRITICAL',
    'URGENT',
    'WARNING',
    'NORMAL'
  )),
  priority_score NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00),
  
  -- Assignment, Resolution & Release
  assigned_to UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  released_at TIMESTAMPTZ,
  released_claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_cases_fac ON public.rcm_unbilled_cases(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_cases_status ON public.rcm_unbilled_cases(facility_id, unbilled_status);
CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_cases_hold ON public.rcm_unbilled_cases(facility_id, hold_reason);
CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_cases_surg ON public.rcm_unbilled_cases(surgery_id);
CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_cases_deadline ON public.rcm_unbilled_cases(filing_deadline);
CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_cases_priority ON public.rcm_unbilled_cases(facility_id, priority_score DESC);

-- 2. Create Unbilled Case Audit & Workflow Action Log Table
CREATE TABLE IF NOT EXISTS public.rcm_unbilled_case_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  unbilled_case_id UUID NOT NULL REFERENCES public.rcm_unbilled_cases(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL CHECK (action_type IN (
    'HOLD_APPLIED',
    'QUERY_SENT_SURGEON',
    'INVOICE_ATTACHED',
    'AUTH_CONFIRMED',
    'HOLD_RESOLVED',
    'CLAIM_RELEASED',
    'DEADLINE_ALERT_SENT',
    'WRITTEN_OFF_TIMELY_FILING'
  )),
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  notes TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_act_case ON public.rcm_unbilled_case_actions(unbilled_case_id);
CREATE INDEX IF NOT EXISTS idx_rcm_unbilled_act_fac ON public.rcm_unbilled_case_actions(facility_id);

-- 3. Enable Row Level Security
ALTER TABLE public.rcm_unbilled_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_unbilled_case_actions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies with 1:1 DROP and CREATE Parity
DROP POLICY IF EXISTS rcm_unbilled_cases_facility_isolation ON public.rcm_unbilled_cases;
CREATE POLICY rcm_unbilled_cases_facility_isolation
  ON public.rcm_unbilled_cases
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_unbilled_case_actions_facility_isolation ON public.rcm_unbilled_case_actions;
CREATE POLICY rcm_unbilled_case_actions_facility_isolation
  ON public.rcm_unbilled_case_actions
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

-- 5. Analytical View: Active Unbilled Cases with Dynamic Aging & Risk Tiering
CREATE OR REPLACE VIEW public.vw_rcm_unbilled_cases_active AS
SELECT
  c.id,
  c.facility_id,
  c.case_number,
  c.surgery_id,
  c.patient_id,
  c.surgeon_name,
  c.specialty,
  c.procedure_name,
  c.primary_cpt,
  c.payer_name,
  c.payer_type,
  c.date_of_service,
  c.coded_date,
  (CURRENT_DATE - c.date_of_service) AS days_unbilled,
  c.total_charges,
  c.expected_reimbursement,
  c.hold_reason,
  c.unbilled_status,
  c.filing_deadline,
  (c.filing_deadline - CURRENT_DATE) AS days_remaining,
  CASE
    WHEN (c.filing_deadline - CURRENT_DATE) <= 15 THEN 'CRITICAL'
    WHEN (c.filing_deadline - CURRENT_DATE) <= 30 THEN 'URGENT'
    WHEN (c.filing_deadline - CURRENT_DATE) <= 60 THEN 'WARNING'
    ELSE 'NORMAL'
  END AS calculated_risk_tier,
  CASE
    WHEN (CURRENT_DATE - c.date_of_service) <= 15 THEN '0_15_DAYS'
    WHEN (CURRENT_DATE - c.date_of_service) <= 30 THEN '16_30_DAYS'
    WHEN (CURRENT_DATE - c.date_of_service) <= 60 THEN '31_60_DAYS'
    ELSE '61_PLUS_DAYS'
  END AS aging_bucket,
  c.priority_score,
  c.assigned_to,
  c.resolution_notes,
  c.released_at,
  c.released_claim_id,
  c.created_at,
  c.updated_at
FROM public.rcm_unbilled_cases c;

-- 6. Analytical View: Unbilled Aging Buckets Summary
CREATE OR REPLACE VIEW public.vw_rcm_unbilled_aging_summary AS
SELECT
  facility_id,
  CASE
    WHEN (CURRENT_DATE - date_of_service) <= 15 THEN '0_15_DAYS'
    WHEN (CURRENT_DATE - date_of_service) <= 30 THEN '16_30_DAYS'
    WHEN (CURRENT_DATE - date_of_service) <= 60 THEN '31_60_DAYS'
    ELSE '61_PLUS_DAYS'
  END AS aging_bucket,
  COUNT(id) AS unbilled_case_count,
  SUM(total_charges) AS total_gross_charges,
  SUM(expected_reimbursement) AS total_expected_reimbursement,
  COUNT(CASE WHEN (filing_deadline - CURRENT_DATE) <= 30 THEN 1 END) AS critical_filing_risk_count,
  ROUND(AVG(CURRENT_DATE - date_of_service), 1) AS avg_days_unbilled
FROM public.rcm_unbilled_cases
WHERE unbilled_status IN ('HELD', 'UNDER_INVESTIGATION', 'HOLD_RESOLVED')
GROUP BY
  facility_id,
  CASE
    WHEN (CURRENT_DATE - date_of_service) <= 15 THEN '0_15_DAYS'
    WHEN (CURRENT_DATE - date_of_service) <= 30 THEN '16_30_DAYS'
    WHEN (CURRENT_DATE - date_of_service) <= 60 THEN '31_60_DAYS'
    ELSE '61_PLUS_DAYS'
  END;
