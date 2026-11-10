-- ==============================================================================
-- MIGRATION: 069_recovery_evidence_and_timeline.sql
-- PHASE: 93B — Recovery Evidence and Timeline (Revenue Cycle Management)
-- DESCRIPTION: Auditable recovery cases, multi-source evidence packages,
--              chronological audit timeline, submission tracking across channels,
--              payer responses, and incremental cash reconciliation.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Recovery Cases Header Table
CREATE TABLE IF NOT EXISTS public.recovery_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  case_id BIGINT REFERENCES public.surgeries(id) ON DELETE CASCADE,
  payer_id UUID,
  plan_id UUID,
  recovery_type VARCHAR(40) NOT NULL,
  
  -- 15-State Recovery Case Lifecycle
  status VARCHAR(40) NOT NULL CHECK (status IN (
    'DRAFT',
    'EVIDENCE_INCOMPLETE',
    'READY_FOR_REVIEW',
    'APPROVED',
    'SUBMITTED',
    'ACKNOWLEDGED',
    'PAYER_INFO_REQUESTED',
    'UNDER_PAYER_REVIEW',
    'REPROCESSING',
    'PARTIALLY_RECOVERED',
    'FULLY_RECOVERED',
    'REJECTED',
    'WITHDRAWN',
    'CLOSED_NO_RECOVERY',
    'EXPIRED'
  )),
  
  -- Recovery Financials
  potential_recovery NUMERIC(14,2) NOT NULL CHECK (potential_recovery >= 0),
  validated_recovery_amount NUMERIC(14,2) CHECK (validated_recovery_amount >= 0),
  recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0),
  filing_deadline DATE,
  
  -- Human Governance & Dispatch Metadata
  owner_user_id UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  package_hash TEXT,
  submitted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rc_fac ON public.recovery_cases(facility_id);
CREATE INDEX IF NOT EXISTS idx_rc_status ON public.recovery_cases(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rc_claim ON public.recovery_cases(claim_id);
CREATE INDEX IF NOT EXISTS idx_rc_variance ON public.recovery_cases(payment_variance_id);
CREATE INDEX IF NOT EXISTS idx_rc_deadline ON public.recovery_cases(facility_id, filing_deadline);

-- 2. Create Chronological Recovery Case Events Timeline Table
CREATE TABLE IF NOT EXISTS public.recovery_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID REFERENCES auth.users(id),
  source_system VARCHAR(64),
  external_reference VARCHAR(128),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_rce_case ON public.recovery_case_events(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_rce_event_at ON public.recovery_case_events(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_rce_type ON public.recovery_case_events(recovery_case_id, event_type);

-- 3. Create Recovery Evidence Package Table
CREATE TABLE IF NOT EXISTS public.recovery_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE,
  evidence_type VARCHAR(64) NOT NULL CHECK (evidence_type IN (
    'CONTRACT_CLAUSE',
    'CONTRACT_RATE',
    'EXPECTED_REIMBURSEMENT_TRACE',
    'CLAIM',
    'CLAIM_LINE',
    'ERA_835',
    'CARC_RARC',
    'IMPLANT_INVOICE',
    'IMPLANT_CARVEOUT_RULE',
    'OPERATIVE_NOTE',
    'CODING_REVIEW',
    'PAYMENT_POSTING',
    'OTHER'
  )),
  source_record_type VARCHAR(64),
  source_record_id TEXT,
  document_uri TEXT,
  content_hash TEXT,
  title VARCHAR(255),
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_present BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_case ON public.recovery_evidence(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_re_type ON public.recovery_evidence(recovery_case_id, evidence_type);
CREATE INDEX IF NOT EXISTS idx_re_req ON public.recovery_evidence(recovery_case_id, is_required, is_present);

-- 4. Create Recovery Submissions Tracking Table
CREATE TABLE IF NOT EXISTS public.recovery_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE,
  submission_type VARCHAR(40) NOT NULL,
  submission_channel VARCHAR(40) NOT NULL CHECK (submission_channel IN (
    'WAYSTAR',
    'CLEARINGHOUSE',
    'PAYER_PORTAL',
    'SFTP',
    'SECURE_EMAIL',
    'MAIL',
    'MANUAL',
    'OTHER'
  )),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  external_reference VARCHAR(128),
  payload_hash TEXT,
  status VARCHAR(40) NOT NULL CHECK (status IN (
    'PENDING_DISPATCH',
    'DISPATCHED',
    'DELIVERED',
    'ACKNOWLEDGED',
    'FAILED',
    'REJECTED'
  )),
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_case ON public.recovery_submissions(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_rs_channel ON public.recovery_submissions(submission_channel);
CREATE INDEX IF NOT EXISTS idx_rs_status ON public.recovery_submissions(status);

-- 5. Create Payer Responses Table
CREATE TABLE IF NOT EXISTS public.payer_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE,
  response_type VARCHAR(64) NOT NULL CHECK (response_type IN (
    'ACKNOWLEDGMENT',
    'INFO_REQUESTED',
    'UNDER_REVIEW',
    'UPHELD_DENIAL',
    'PARTIAL_OVERTURN',
    'FULL_OVERTURN',
    'REPROCESSING',
    'ADDITIONAL_PAYMENT_SCHEDULED',
    'OTHER'
  )),
  response_date DATE NOT NULL,
  amount NUMERIC(14,2) CHECK (amount >= 0),
  reason_code VARCHAR(64),
  source_document_uri TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pr_case ON public.payer_responses(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_pr_date ON public.payer_responses(response_date DESC);
CREATE INDEX IF NOT EXISTS idx_pr_type ON public.payer_responses(recovery_case_id, response_type);

-- 6. Create Recovery Outcomes & Incremental Cash Verification Table
CREATE TABLE IF NOT EXISTS public.recovery_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_case_id UUID NOT NULL REFERENCES public.recovery_cases(id) ON DELETE CASCADE,
  outcome_type VARCHAR(40) NOT NULL CHECK (outcome_type IN (
    'FULL_RECOVERY',
    'PARTIAL_RECOVERY',
    'NO_RECOVERY_UPHELD',
    'WITHDRAWN_CLINICAL_DISCRETION',
    'EXPIRED_STATUTORY_DEADLINE',
    'COMPROMISE_SETTLEMENT'
  )),
  verified_recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (verified_recovered_amount >= 0),
  verification_source VARCHAR(64) NOT NULL,
  verification_record_id TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_case ON public.recovery_outcomes(recovery_case_id);
CREATE INDEX IF NOT EXISTS idx_ro_type ON public.recovery_outcomes(outcome_type);

-- 7. Analytical Views
CREATE OR REPLACE VIEW public.vw_recovery_cases_active AS
SELECT 
  rc.id AS recovery_case_id,
  rc.organization_id,
  rc.facility_id,
  rc.payment_variance_id,
  rc.claim_id,
  rc.case_id,
  rc.payer_id,
  rc.recovery_type,
  rc.status,
  rc.potential_recovery,
  rc.validated_recovery_amount,
  rc.recovered_amount,
  (COALESCE(rc.validated_recovery_amount, rc.potential_recovery) - rc.recovered_amount) AS remaining_balance,
  rc.filing_deadline,
  rc.approved_at,
  rc.approved_by,
  rc.submitted_at,
  rc.created_at,
  COUNT(re.id) AS total_evidence_items,
  COUNT(CASE WHEN re.is_present THEN 1 END) AS present_evidence_items,
  COUNT(CASE WHEN re.is_required AND NOT re.is_present THEN 1 END) AS missing_required_items
FROM public.recovery_cases rc
LEFT JOIN public.recovery_evidence re ON rc.id = re.recovery_case_id
WHERE rc.status NOT IN ('CLOSED_NO_RECOVERY', 'EXPIRED', 'WITHDRAWN')
GROUP BY rc.id;

CREATE OR REPLACE VIEW public.vw_recovery_cases_summary AS
SELECT
  facility_id,
  status,
  COUNT(*) AS case_count,
  SUM(potential_recovery) AS total_potential,
  SUM(COALESCE(validated_recovery_amount, 0.00)) AS total_validated,
  SUM(recovered_amount) AS total_recovered,
  ROUND(AVG(COALESCE(validated_recovery_amount, 0.00)), 2) AS avg_validated_amount
FROM public.recovery_cases
GROUP BY facility_id, status;

-- 8. Enable Row Level Security (RLS) on all 6 tables
ALTER TABLE public.recovery_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_outcomes ENABLE ROW LEVEL SECURITY;

-- 9. Row Level Security Policies (1:1 Statement Parity)
DROP POLICY IF EXISTS recovery_cases_facility_isolation ON public.recovery_cases;
CREATE POLICY recovery_cases_facility_isolation ON public.recovery_cases
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS recovery_case_events_isolation ON public.recovery_case_events;
CREATE POLICY recovery_case_events_isolation ON public.recovery_case_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_cases rc
      WHERE rc.id = recovery_case_events.recovery_case_id
        AND rc.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS recovery_evidence_isolation ON public.recovery_evidence;
CREATE POLICY recovery_evidence_isolation ON public.recovery_evidence
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_cases rc
      WHERE rc.id = recovery_evidence.recovery_case_id
        AND rc.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS recovery_submissions_isolation ON public.recovery_submissions;
CREATE POLICY recovery_submissions_isolation ON public.recovery_submissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_cases rc
      WHERE rc.id = recovery_submissions.recovery_case_id
        AND rc.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS payer_responses_isolation ON public.payer_responses;
CREATE POLICY payer_responses_isolation ON public.payer_responses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_cases rc
      WHERE rc.id = payer_responses.recovery_case_id
        AND rc.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS recovery_outcomes_isolation ON public.recovery_outcomes;
CREATE POLICY recovery_outcomes_isolation ON public.recovery_outcomes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_cases rc
      WHERE rc.id = recovery_outcomes.recovery_case_id
        AND rc.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
  );

