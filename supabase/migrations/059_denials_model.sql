-- ==============================================================================
-- MIGRATION: 059_denials_model.sql
-- PHASE: 85 — Denials Model & Management Engine (Revenue Cycle Management)
-- DESCRIPTION: Core schema, status machine, deadline urgency tracking, team ownership,
--              audit events ledger, analytical views, and facility tenancy RLS.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Denials Header Table
CREATE TABLE IF NOT EXISTS public.rcm_denials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT,
  claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE SET NULL,
  payer_id UUID REFERENCES public.payers(id) ON DELETE RESTRICT,
  
  -- Identifiers & Code Details
  denial_control_number VARCHAR(64) NOT NULL UNIQUE,
  carc_code VARCHAR(16) NOT NULL,
  rarc_code VARCHAR(16),
  group_code VARCHAR(4) NOT NULL DEFAULT 'CO' CHECK (group_code IN ('CO', 'PR', 'OA', 'PI', 'CR')),
  
  -- Root Cause & Type
  denial_category VARCHAR(40) NOT NULL CHECK (denial_category IN (
    'PRE_AUTH_ABSENT_EXPIRED',
    'MEDICAL_NECESSITY_LCD',
    'CODING_MODIFIER_UNBUNDLED',
    'TIMELY_FILING_EXCEEDED',
    'ELIGIBILITY_TERMINATED',
    'COB_PRIMARY_EOB_MISSING',
    'DUPLICATE_CLAIM_SERVICE',
    'NON_COVERED_PROCEDURE',
    'CREDENTIALING_BILLING_NPI',
    'OTHER_ADMINISTRATIVE'
  )),
  denial_type VARCHAR(20) NOT NULL DEFAULT 'TECHNICAL' CHECK (denial_type IN ('CLINICAL', 'TECHNICAL', 'ADMINISTRATIVE')),
  
  -- Financial Attributes & Recovery Calculations
  denied_amount NUMERIC(14,2) NOT NULL CHECK (denied_amount >= 0),
  billed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (billed_amount >= 0),
  expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (expected_amount >= 0),
  is_recoverable BOOLEAN NOT NULL DEFAULT TRUE,
  recovery_probability_pct NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (recovery_probability_pct BETWEEN 0 AND 100),
  expected_recovery_amount NUMERIC(14,2) GENERATED ALWAYS AS (ROUND((denied_amount * recovery_probability_pct / 100.0), 2)) STORED,
  recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0),
  written_off_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (written_off_amount >= 0),
  
  -- Deadlines & Dates
  denial_date DATE NOT NULL DEFAULT CURRENT_DATE,
  filing_deadline_days INT NOT NULL DEFAULT 90 CHECK (filing_deadline_days > 0),
  appeal_deadline_date DATE NOT NULL,
  
  -- Ownership & Team Routing
  assigned_team VARCHAR(32) NOT NULL DEFAULT 'BILLING_AND_CODING' CHECK (assigned_team IN (
    'CLINICAL_APPEALS',
    'BILLING_AND_CODING',
    'PATIENT_ACCESS',
    'MANAGED_CARE_CONTRACTING'
  )),
  assigned_user_id UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  
  -- Workflow Status & Appeal Stage
  status VARCHAR(32) NOT NULL DEFAULT 'IDENTIFIED' CHECK (status IN (
    'IDENTIFIED',
    'TRIAGED',
    'IN_PROGRESS',
    'ADDITIONAL_INFO_REQUESTED',
    'APPEALED_LEVEL_1',
    'APPEALED_LEVEL_2',
    'REBILLED',
    'OVERTURNED_PAID',
    'UPHELD_FINAL',
    'WRITTEN_OFF'
  )),
  current_appeal_level INT NOT NULL DEFAULT 0 CHECK (current_appeal_level BETWEEN 0 AND 3),
  notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rapid lookup and performance
CREATE INDEX IF NOT EXISTS idx_rcm_denials_facility ON public.rcm_denials(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_denials_claim ON public.rcm_denials(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_denials_status ON public.rcm_denials(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_denials_deadline ON public.rcm_denials(appeal_deadline_date);
CREATE INDEX IF NOT EXISTS idx_rcm_denials_category ON public.rcm_denials(denial_category);
CREATE INDEX IF NOT EXISTS idx_rcm_denials_team ON public.rcm_denials(assigned_team);

-- 2. Create Denial Events Audit Ledger
CREATE TABLE IF NOT EXISTS public.rcm_denial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  denial_id UUID NOT NULL REFERENCES public.rcm_denials(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
    'CREATED',
    'STATUS_CHANGED',
    'ASSIGNED',
    'APPEAL_SUBMITTED',
    'REBILL_SUBMITTED',
    'INFO_REQUESTED',
    'OVERTURNED',
    'UPHELD',
    'WRITTEN_OFF'
  )),
  from_status VARCHAR(32),
  to_status VARCHAR(32),
  action_by UUID REFERENCES auth.users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_denial_events_denial ON public.rcm_denial_events(denial_id);
CREATE INDEX IF NOT EXISTS idx_rcm_denial_events_facility ON public.rcm_denial_events(facility_id);

-- 3. Analytical Views
-- View: Denials Aging and Deadline Urgency Matrix
CREATE OR REPLACE VIEW public.vw_rcm_denials_aging_and_deadlines AS
SELECT 
  d.id,
  d.facility_id,
  d.denial_control_number,
  d.claim_id,
  cl.patient_control_number AS claim_number,
  COALESCE(pat.name, 'Patient Encounter') AS patient_name,
  COALESCE(pat.mrn, 'MRN-UNAVAILABLE') AS patient_mrn,
  COALESCE(pay.name, 'Commercial Payer') AS payer_name,
  d.group_code,
  d.carc_code,
  d.rarc_code,
  d.denial_category,
  d.denial_type,
  d.denied_amount,
  d.expected_recovery_amount,
  d.recovery_probability_pct,
  d.denial_date,
  d.appeal_deadline_date,
  (d.appeal_deadline_date - CURRENT_DATE) AS days_to_deadline,
  CASE 
    WHEN (d.appeal_deadline_date - CURRENT_DATE) < 0 THEN 'CRITICAL_OVERDUE'
    WHEN (d.appeal_deadline_date - CURRENT_DATE) <= 14 THEN 'URGENT_UNDER_15_DAYS'
    WHEN (d.appeal_deadline_date - CURRENT_DATE) <= 30 THEN 'APPROACHING_30_DAYS'
    ELSE 'ON_TRACK'
  END AS urgency_tier,
  d.assigned_team,
  d.assigned_user_id,
  d.status,
  d.current_appeal_level,
  d.created_at
FROM public.rcm_denials d
JOIN public.claims cl ON d.claim_id = cl.id
LEFT JOIN public.patients pat ON cl.patient_id = pat.id
LEFT JOIN public.payers pay ON COALESCE(d.payer_id, cl.primary_payer_id) = pay.id;

-- View: Denials by Root Cause Category & Overturn KPI
CREATE OR REPLACE VIEW public.vw_rcm_denials_by_root_cause_kpi AS
SELECT 
  facility_id,
  denial_category,
  denial_type,
  COUNT(id) AS total_denials,
  SUM(denied_amount) AS total_denied_dollars,
  SUM(expected_recovery_amount) AS total_expected_recovery_dollars,
  SUM(recovered_amount) AS total_recovered_dollars,
  SUM(written_off_amount) AS total_written_off_dollars,
  ROUND(
    CASE WHEN SUM(denied_amount) > 0 
      THEN (SUM(recovered_amount) / SUM(denied_amount)) * 100.0 
      ELSE 0.00 
    END, 2
  ) AS actual_overturn_rate_pct
FROM public.rcm_denials
GROUP BY facility_id, denial_category, denial_type;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.rcm_denials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_denial_events ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS rls_rcm_denials_tenant ON public.rcm_denials;
CREATE POLICY rls_rcm_denials_tenant ON public.rcm_denials
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_denial_events_tenant ON public.rcm_denial_events;
CREATE POLICY rls_rcm_denial_events_tenant ON public.rcm_denial_events
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

