-- ==============================================================================
-- MIGRATION: 062_ar_aging.sql
-- PHASE: 88 — AR Aging, Definitions, Calculations & Work Queues (Revenue Cycle Management)
-- DESCRIPTION: Accounts Receivable aging engine, dual DOS/Bill Date calculation schedules,
--              collector work queues, activity touch ledger, and multi-tenant RLS.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create AR Work Queues Master Table
CREATE TABLE IF NOT EXISTS public.rcm_ar_work_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  queue_code VARCHAR(32) NOT NULL,
  queue_name VARCHAR(128) NOT NULL,
  description TEXT,
  min_balance_threshold NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (min_balance_threshold >= 0),
  min_aging_days INT NOT NULL DEFAULT 0 CHECK (min_aging_days >= 0),
  max_aging_days INT CHECK (max_aging_days IS NULL OR max_aging_days >= min_aging_days),
  target_financial_class VARCHAR(32) NOT NULL DEFAULT 'ALL' CHECK (target_financial_class IN (
    'ALL',
    'COMMERCIAL',
    'MEDICARE',
    'MEDICAID',
    'WORKERS_COMP',
    'SELF_PAY'
  )),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_queues_facility ON public.rcm_ar_work_queues(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_queues_code ON public.rcm_ar_work_queues(facility_id, queue_code);

-- 2. Create AR Work Items Table (Actionable Queue Claims)
CREATE TABLE IF NOT EXISTS public.rcm_ar_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES public.rcm_ar_work_queues(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  priority_score NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score >= 0 AND priority_score <= 100),
  assigned_to UUID REFERENCES auth.users(id),
  status VARCHAR(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN',
    'IN_PROGRESS',
    'PENDING_PAYER',
    'RESOLVED',
    'ESCALATED',
    'CLOSED'
  )),
  last_touched_at TIMESTAMPTZ,
  last_touched_by UUID REFERENCES auth.users(id),
  next_follow_up_date DATE,
  touch_count INT NOT NULL DEFAULT 0 CHECK (touch_count >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_items_facility ON public.rcm_ar_work_items(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_items_queue ON public.rcm_ar_work_items(queue_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_items_claim ON public.rcm_ar_work_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_items_status ON public.rcm_ar_work_items(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_work_items_priority ON public.rcm_ar_work_items(priority_score DESC);

-- 3. Create Collector Activity Ledger (Touches)
CREATE TABLE IF NOT EXISTS public.rcm_ar_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES public.rcm_ar_work_items(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL CHECK (action_type IN (
    'PAYER_CALL',
    'PORTAL_STATUS_CHECK',
    'CORRECTED_CLAIM_SUBMITTED',
    'APPEAL_PACKET_SENT',
    'MEDICAL_RECORDS_FAXED',
    'PROMISE_TO_PAY_LOGGED',
    'SUPERVISOR_ESCALATION',
    'PATIENT_OUTREACH',
    'WRITEOFF_RECOMMENDED'
  )),
  action_by UUID NOT NULL REFERENCES auth.users(id),
  contact_person VARCHAR(128),
  reference_number VARCHAR(64),
  promised_amount NUMERIC(14,2) DEFAULT 0.00 CHECK (promised_amount >= 0),
  promised_payment_date DATE,
  next_follow_up_date DATE,
  outcome_notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_ar_touches_facility ON public.rcm_ar_touches(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_touches_work_item ON public.rcm_ar_touches(work_item_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_touches_claim ON public.rcm_ar_touches(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_ar_touches_action_by ON public.rcm_ar_touches(action_by);

-- 4. Analytical Views
-- View 1: Real-time Claim-Level AR Aging Matrix (DOS & Bill Date)
CREATE OR REPLACE VIEW public.vw_rcm_ar_aging_summary AS
SELECT 
  c.id AS claim_id,
  c.facility_id,
  c.patient_control_number AS claim_number,
  c.rcm_status,
  c.total_gross_charge,
  c.total_expected_reimbursement,
  c.total_allowed_amount,
  c.total_paid_amount,
  c.total_contractual_adjustment,
  c.total_patient_balance,
  c.outstanding_ar_balance,
  
  -- Patient Details (patient_id is BIGINT)
  c.patient_id,
  COALESCE(p.name, 'Patient Encounter') AS patient_name,
  COALESCE(p.mrn, 'MRN-UNAVAILABLE') AS patient_mrn,
  
  -- Payer & Financial Class Details
  c.primary_payer_id,
  COALESCE(pay.name, 'Unassigned Payer') AS primary_payer_name,
  COALESCE(pay.payer_type, 'COMMERCIAL') AS financial_class,
  
  -- Surgery & Clinical Details (surgery_id is BIGINT)
  c.surgery_id,
  s.surgery_date AS date_of_service,
  c.initial_submitted_at,
  
  -- Deterministic Dual Aging Days Calculations
  GREATEST(0, (CURRENT_DATE - s.surgery_date)) AS aging_days_dos,
  GREATEST(0, (CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.surgery_date))) AS aging_days_bill,
  
  -- Standard GAAP Aging Buckets by DOS
  CASE 
    WHEN (CURRENT_DATE - s.surgery_date) <= 30 THEN '0_30'
    WHEN (CURRENT_DATE - s.surgery_date) <= 60 THEN '31_60'
    WHEN (CURRENT_DATE - s.surgery_date) <= 90 THEN '61_90'
    WHEN (CURRENT_DATE - s.surgery_date) <= 120 THEN '91_120'
    WHEN (CURRENT_DATE - s.surgery_date) <= 150 THEN '121_150'
    ELSE '150_PLUS'
  END AS aging_bucket_dos,
  
  -- Standard GAAP Aging Buckets by Bill Date
  CASE 
    WHEN (CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.surgery_date)) <= 30 THEN '0_30'
    WHEN (CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.surgery_date)) <= 60 THEN '31_60'
    WHEN (CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.surgery_date)) <= 90 THEN '61_90'
    WHEN (CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.surgery_date)) <= 120 THEN '91_120'
    WHEN (CURRENT_DATE - COALESCE(c.initial_submitted_at::DATE, s.surgery_date)) <= 150 THEN '121_150'
    ELSE '150_PLUS'
  END AS aging_bucket_bill

FROM public.claims c
JOIN public.surgeries s ON c.surgery_id = s.id
LEFT JOIN public.patients p ON c.patient_id = p.id
LEFT JOIN public.payers pay ON c.primary_payer_id = pay.id
WHERE c.outstanding_ar_balance > 0;

-- View 2: Financial Class Rollup Summary
CREATE OR REPLACE VIEW public.vw_rcm_ar_payer_class_summary AS
SELECT 
  v.facility_id,
  v.financial_class,
  COUNT(v.claim_id) AS total_claims,
  SUM(v.outstanding_ar_balance) AS total_ar_balance,
  
  -- Bucket Breakdown by DOS
  SUM(CASE WHEN v.aging_bucket_dos = '0_30' THEN v.outstanding_ar_balance ELSE 0 END) AS ar_0_30,
  SUM(CASE WHEN v.aging_bucket_dos = '31_60' THEN v.outstanding_ar_balance ELSE 0 END) AS ar_31_60,
  SUM(CASE WHEN v.aging_bucket_dos = '61_90' THEN v.outstanding_ar_balance ELSE 0 END) AS ar_61_90,
  SUM(CASE WHEN v.aging_bucket_dos = '91_120' THEN v.outstanding_ar_balance ELSE 0 END) AS ar_91_120,
  SUM(CASE WHEN v.aging_bucket_dos = '121_150' THEN v.outstanding_ar_balance ELSE 0 END) AS ar_121_150,
  SUM(CASE WHEN v.aging_bucket_dos = '150_PLUS' THEN v.outstanding_ar_balance ELSE 0 END) AS ar_150_plus,
  
  -- >90 Days Risk Exposure
  SUM(CASE WHEN v.aging_bucket_dos IN ('91_120', '121_150', '150_PLUS') THEN v.outstanding_ar_balance ELSE 0 END) AS ar_over_90_days,
  ROUND(
    CASE WHEN SUM(v.outstanding_ar_balance) > 0 
      THEN (SUM(CASE WHEN v.aging_bucket_dos IN ('91_120', '121_150', '150_PLUS') THEN v.outstanding_ar_balance ELSE 0 END) / SUM(v.outstanding_ar_balance)) * 100.0
      ELSE 0.00
    END, 2
  ) AS pct_ar_over_90_days
FROM public.vw_rcm_ar_aging_summary v
GROUP BY v.facility_id, v.financial_class;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.rcm_ar_work_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_ar_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_ar_touches ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies with 1:1 DROP/CREATE Parity
DROP POLICY IF EXISTS rls_rcm_ar_work_queues_tenant ON public.rcm_ar_work_queues;
CREATE POLICY rls_rcm_ar_work_queues_tenant ON public.rcm_ar_work_queues
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_ar_work_items_tenant ON public.rcm_ar_work_items;
CREATE POLICY rls_rcm_ar_work_items_tenant ON public.rcm_ar_work_items
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_ar_touches_tenant ON public.rcm_ar_touches;
CREATE POLICY rls_rcm_ar_touches_tenant ON public.rcm_ar_touches
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );
