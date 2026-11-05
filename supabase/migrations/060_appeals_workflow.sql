-- ==============================================================================
-- MIGRATION: 060_appeals_workflow.sql
-- PHASE: 86 — Appeals Workflow & Dispute Management (Revenue Cycle Management)
-- DESCRIPTION: Multi-level appeal case tracking, clinical & billing evidence exhibits,
--              payer turnaround date math, settlement reconciliation, and facility tenancy RLS.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Appeal Case Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  denial_id UUID NOT NULL REFERENCES public.rcm_denials(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE RESTRICT,
  payer_id UUID REFERENCES public.payers(id) ON DELETE RESTRICT,
  
  -- Identifiers & Appeal Stage
  appeal_control_number VARCHAR(64) NOT NULL UNIQUE,
  appeal_level VARCHAR(32) NOT NULL DEFAULT 'LEVEL_1_RECONSIDERATION' CHECK (appeal_level IN (
    'LEVEL_1_RECONSIDERATION',
    'LEVEL_2_FORMAL_APPEAL',
    'LEVEL_3_EXTERNAL_ALJ'
  )),
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT',
    'EVIDENCE_GATHERING',
    'READY_FOR_SUBMISSION',
    'SUBMITTED',
    'IN_PAYER_REVIEW',
    'ADDITIONAL_INFO_REQUESTED',
    'OVERTURNED_FULL',
    'OVERTURNED_PARTIAL',
    'UPHELD_DENIED',
    'WITHDRAWN'
  )),
  
  -- Financial Disputed & Settled Amounts
  appealed_amount NUMERIC(14,2) NOT NULL CHECK (appealed_amount >= 0),
  recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0),
  settlement_variance NUMERIC(14,2) GENERATED ALWAYS AS (appealed_amount - recovered_amount) STORED,
  
  -- Submission & Turnaround Tracking
  submission_channel VARCHAR(32) NOT NULL DEFAULT 'PAYER_PORTAL_API' CHECK (submission_channel IN (
    'PAYER_PORTAL_API',
    'CLEARINGHOUSE_ELECTRONIC_275',
    'CERTIFIED_MAIL',
    'SECURE_FAX'
  )),
  carrier_tracking_number VARCHAR(128),
  submission_date DATE,
  statutory_turnaround_days INT NOT NULL DEFAULT 45 CHECK (statutory_turnaround_days > 0),
  payer_response_due_date DATE,
  actual_response_date DATE,
  
  -- Clinical & Assignment Attributes
  assigned_specialist_id UUID REFERENCES auth.users(id),
  clinical_rationale TEXT,
  outcome_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rapid lookup
CREATE INDEX IF NOT EXISTS idx_rcm_appeals_facility ON public.rcm_appeals(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_appeals_denial ON public.rcm_appeals(denial_id);
CREATE INDEX IF NOT EXISTS idx_rcm_appeals_claim ON public.rcm_appeals(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_appeals_status ON public.rcm_appeals(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_appeals_due_date ON public.rcm_appeals(payer_response_due_date);

-- 2. Create Appeal Evidence Exhibits Table
CREATE TABLE IF NOT EXISTS public.rcm_appeal_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  appeal_id UUID NOT NULL REFERENCES public.rcm_appeals(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL CHECK (document_type IN (
    'OPERATIVE_NOTE',
    'LETTER_OF_MEDICAL_NECESSITY',
    'PRIOR_AUTH_DOCUMENT',
    'PEER_REVIEW_RATIONALE',
    'CLINICAL_CHART_NOTES',
    'NCCI_UNBUNDLING_PROOF',
    'PROOF_OF_TIMELY_FILING',
    'PRIMARY_PAYER_EOB',
    'OTHER_CLINICAL_EXHIBIT'
  )),
  title VARCHAR(200) NOT NULL,
  file_url TEXT,
  file_hash VARCHAR(64),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_appeal_evidence_appeal ON public.rcm_appeal_evidence(appeal_id);
CREATE INDEX IF NOT EXISTS idx_rcm_appeal_evidence_type ON public.rcm_appeal_evidence(document_type);

-- 3. Create Appeal Audit Events Ledger
CREATE TABLE IF NOT EXISTS public.rcm_appeal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  appeal_id UUID NOT NULL REFERENCES public.rcm_appeals(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
    'CREATED',
    'EVIDENCE_ATTACHED',
    'EVIDENCE_VERIFIED',
    'SUBMITTED_TO_PAYER',
    'PAYER_ACKNOWLEDGED',
    'PAYER_INFO_REQUESTED',
    'OUTCOME_OVERTURNED',
    'OUTCOME_UPHELD',
    'ESCALATED_NEXT_LEVEL',
    'WITHDRAWN'
  )),
  from_status VARCHAR(32),
  to_status VARCHAR(32),
  action_by UUID REFERENCES auth.users(id),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_appeal_events_appeal ON public.rcm_appeal_events(appeal_id);

-- 4. Analytical Views
-- View: Active Appeals Queue with Overdue Tracking
CREATE OR REPLACE VIEW public.vw_rcm_active_appeals_queue AS
SELECT 
  a.id,
  a.facility_id,
  a.appeal_control_number,
  a.denial_id,
  a.claim_id,
  cl.patient_control_number AS claim_number,
  COALESCE(pat.name, 'Patient Encounter') AS patient_name,
  COALESCE(pat.mrn, 'MRN-UNAVAILABLE') AS patient_mrn,
  COALESCE(pay.name, 'Commercial Payer') AS payer_name,
  a.appeal_level,
  a.status,
  a.appealed_amount,
  a.recovered_amount,
  a.settlement_variance,
  a.submission_channel,
  a.carrier_tracking_number,
  a.submission_date,
  a.payer_response_due_date,
  (a.payer_response_due_date - CURRENT_DATE) AS days_to_response,
  CASE 
    WHEN a.status IN ('OVERTURNED_FULL', 'OVERTURNED_PARTIAL', 'UPHELD_DENIED', 'WITHDRAWN') THEN 'RESOLVED'
    WHEN a.payer_response_due_date IS NULL THEN 'NOT_SUBMITTED'
    WHEN (a.payer_response_due_date - CURRENT_DATE) < 0 THEN 'OVERDUE'
    WHEN (a.payer_response_due_date - CURRENT_DATE) <= 10 THEN 'URGENT'
    ELSE 'ON_TRACK'
  END AS turnaround_status,
  (SELECT COUNT(*) FROM public.rcm_appeal_evidence e WHERE e.appeal_id = a.id) AS total_evidence_exhibits,
  (SELECT COUNT(*) FROM public.rcm_appeal_evidence e WHERE e.appeal_id = a.id AND e.is_verified = TRUE) AS verified_evidence_exhibits,
  a.created_at
FROM public.rcm_appeals a
JOIN public.claims cl ON a.claim_id = cl.id
LEFT JOIN public.patients pat ON cl.patient_id = pat.id
LEFT JOIN public.payers pay ON COALESCE(a.payer_id, cl.primary_payer_id) = pay.id;

-- View: Appeals Settlement & Overturn Analytics
CREATE OR REPLACE VIEW public.vw_rcm_appeals_settlement_analytics AS
SELECT 
  a.facility_id,
  a.appeal_level,
  COALESCE(pay.name, 'Commercial Payer') AS payer_name,
  COUNT(a.id) AS total_appeals,
  SUM(a.appealed_amount) AS total_disputed_dollars,
  SUM(a.recovered_amount) AS total_overturned_dollars,
  ROUND(
    CASE WHEN SUM(a.appealed_amount) > 0 
      THEN (SUM(a.recovered_amount) / SUM(a.appealed_amount)) * 100.0 
      ELSE 0.00 
    END, 2
  ) AS financial_recovery_yield_pct,
  COUNT(CASE WHEN a.status IN ('OVERTURNED_FULL', 'OVERTURNED_PARTIAL') THEN 1 END) AS successful_overturns,
  COUNT(CASE WHEN a.status = 'UPHELD_DENIED' THEN 1 END) AS upheld_denials
FROM public.rcm_appeals a
JOIN public.claims cl ON a.claim_id = cl.id
LEFT JOIN public.payers pay ON COALESCE(a.payer_id, cl.primary_payer_id) = pay.id
GROUP BY a.facility_id, a.appeal_level, pay.name;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.rcm_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_appeal_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_appeal_events ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS rls_rcm_appeals_tenant ON public.rcm_appeals;
CREATE POLICY rls_rcm_appeals_tenant ON public.rcm_appeals
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_appeal_evidence_tenant ON public.rcm_appeal_evidence;
CREATE POLICY rls_rcm_appeal_evidence_tenant ON public.rcm_appeal_evidence
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

DROP POLICY IF EXISTS rls_rcm_appeal_events_tenant ON public.rcm_appeal_events;
CREATE POLICY rls_rcm_appeal_events_tenant ON public.rcm_appeal_events
  FOR ALL
  TO authenticated
  USING (
    facility_id IN (SELECT public.get_auth_user_facilities())
  );

