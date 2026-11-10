-- ==============================================================================
-- MIGRATION: 068_payment_variance_validation.sql
-- PHASE: 93A — Payment Variance Validation (Revenue Cycle Management)
-- DESCRIPTION: Multi-line expected-vs-actual payment variance validation,
--              12-state root cause classification, and contract lineage tracing.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Payment Variances Validation Header Table
CREATE TABLE IF NOT EXISTS public.payment_variances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  case_id BIGINT REFERENCES public.surgeries(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  payer_id UUID,
  plan_id UUID,
  contract_id UUID,
  contract_version_id UUID,
  date_of_service DATE NOT NULL,
  
  -- Adjudication & Variance Totals
  expected_allowed NUMERIC(14,2) NOT NULL CHECK (expected_allowed >= 0),
  actual_allowed NUMERIC(14,2) CHECK (actual_allowed >= 0),
  actual_paid NUMERIC(14,2) CHECK (actual_paid >= 0),
  patient_responsibility NUMERIC(14,2) DEFAULT 0.00 CHECK (patient_responsibility >= 0),
  contractual_adjustment NUMERIC(14,2) DEFAULT 0.00 CHECK (contractual_adjustment >= 0),
  variance_amount NUMERIC(14,2) NOT NULL,
  variance_percent NUMERIC(9,4),
  variance_type VARCHAR(64) NOT NULL,
  
  -- 12-State Validation Outcome
  validation_status VARCHAR(40) NOT NULL CHECK (validation_status IN (
    'VALID_UNDERPAYMENT',
    'VALID_CONTRACTUAL_ADJUSTMENT',
    'PATIENT_RESPONSIBILITY',
    'SECONDARY_PAYER_PENDING',
    'CASE_RATE_OR_BUNDLED',
    'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION',
    'CODING_OR_MODIFIER_REVIEW',
    'IMPLANT_CARVEOUT_REVIEW',
    'COB_OR_OTHER_PAYER_REVIEW',
    'PAYMENT_POSTING_OR_RECONCILIATION_ISSUE',
    'INSUFFICIENT_DATA',
    'NEEDS_MANUAL_REVIEW'
  )),
  root_cause_code VARCHAR(64),
  
  -- Confidence & Data Completeness Scoring
  confidence_level VARCHAR(16) NOT NULL CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')),
  data_completeness_score NUMERIC(5,2) CHECK (data_completeness_score BETWEEN 0.00 AND 100.00),
  filing_deadline DATE,
  
  -- Lineage & Provenance
  owner_user_id UUID REFERENCES auth.users(id),
  calculation_version_id UUID,
  source_835_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pv_fac ON public.payment_variances(facility_id);
CREATE INDEX IF NOT EXISTS idx_pv_status ON public.payment_variances(facility_id, validation_status);
CREATE INDEX IF NOT EXISTS idx_pv_claim ON public.payment_variances(claim_id);
CREATE INDEX IF NOT EXISTS idx_pv_case ON public.payment_variances(case_id);
CREATE INDEX IF NOT EXISTS idx_pv_conf ON public.payment_variances(facility_id, confidence_level);
CREATE INDEX IF NOT EXISTS idx_pv_deadline ON public.payment_variances(facility_id, filing_deadline);

-- 2. Create Claim-Line Adjudication Evidence Trace Table
CREATE TABLE IF NOT EXISTS public.payment_variance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE,
  claim_line_id UUID NOT NULL,
  cpt_hcpcs_code VARCHAR(16) NOT NULL,
  modifiers TEXT[],
  units NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (units > 0),
  expected_allowed NUMERIC(14,2) NOT NULL CHECK (expected_allowed >= 0),
  actual_allowed NUMERIC(14,2) CHECK (actual_allowed >= 0),
  actual_paid NUMERIC(14,2) CHECK (actual_paid >= 0),
  line_variance NUMERIC(14,2) NOT NULL,
  rule_path JSONB NOT NULL DEFAULT '{}'::jsonb,
  carc_codes TEXT[],
  rarc_codes TEXT[],
  validation_result VARCHAR(40) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pvl_variance_id ON public.payment_variance_lines(payment_variance_id);
CREATE INDEX IF NOT EXISTS idx_pvl_cpt ON public.payment_variance_lines(cpt_hcpcs_code);

-- 3. Create Rule Evaluation Snapshot Table
CREATE TABLE IF NOT EXISTS public.payment_variance_rule_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE,
  rule_code VARCHAR(64) NOT NULL,
  rule_version VARCHAR(64) NOT NULL,
  result VARCHAR(24) NOT NULL,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_reference TEXT,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvre_variance_id ON public.payment_variance_rule_evaluations(payment_variance_id);
CREATE INDEX IF NOT EXISTS idx_pvre_rule_code ON public.payment_variance_rule_evaluations(rule_code);

-- 4. Enable Row Level Security
ALTER TABLE public.payment_variances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_variance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_variance_rule_evaluations ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies with 1:1 DROP and CREATE Parity
DROP POLICY IF EXISTS payment_variances_facility_isolation ON public.payment_variances;
CREATE POLICY payment_variances_facility_isolation
  ON public.payment_variances
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS payment_variance_lines_facility_isolation ON public.payment_variance_lines;
CREATE POLICY payment_variance_lines_facility_isolation
  ON public.payment_variance_lines
  FOR ALL
  USING (
    payment_variance_id IN (
      SELECT id FROM public.payment_variances
      WHERE facility_id IN (SELECT public.get_auth_user_facilities())
    )
  );

DROP POLICY IF EXISTS payment_variance_rule_evaluations_facility_isolation ON public.payment_variance_rule_evaluations;
CREATE POLICY payment_variance_rule_evaluations_facility_isolation
  ON public.payment_variance_rule_evaluations
  FOR ALL
  USING (
    payment_variance_id IN (
      SELECT id FROM public.payment_variances
      WHERE facility_id IN (SELECT public.get_auth_user_facilities())
    )
  );

-- 6. Analytical View: Active Payment Variances with Timeliness Countdown
CREATE OR REPLACE VIEW public.vw_payment_variances_active AS
SELECT
  pv.id,
  pv.organization_id,
  pv.facility_id,
  pv.case_id,
  pv.claim_id,
  pv.payer_id,
  pv.plan_id,
  pv.contract_id,
  pv.contract_version_id,
  pv.date_of_service,
  (CURRENT_DATE - pv.date_of_service) AS days_since_dos,
  (pv.filing_deadline - CURRENT_DATE) AS days_until_filing_deadline,
  pv.expected_allowed,
  pv.actual_allowed,
  pv.actual_paid,
  pv.patient_responsibility,
  pv.contractual_adjustment,
  pv.variance_amount,
  pv.variance_percent,
  pv.variance_type,
  pv.validation_status,
  pv.root_cause_code,
  pv.confidence_level,
  pv.data_completeness_score,
  pv.filing_deadline,
  pv.owner_user_id,
  pv.calculation_version_id,
  pv.source_835_id,
  pv.created_at,
  pv.validated_at,
  pv.validated_by,
  pv.updated_at
FROM public.payment_variances pv;

-- 7. Analytical View: Validation Summary by Facility & Status
CREATE OR REPLACE VIEW public.vw_payment_variance_validation_summary AS
SELECT
  facility_id,
  validation_status,
  confidence_level,
  COUNT(id) AS total_variances,
  SUM(variance_amount) AS total_variance_exposure,
  SUM(CASE WHEN validation_status = 'VALID_UNDERPAYMENT' THEN variance_amount ELSE 0.00 END) AS valid_underpayment_exposure,
  SUM(CASE WHEN validation_status = 'VALID_CONTRACTUAL_ADJUSTMENT' THEN variance_amount ELSE 0.00 END) AS contractual_adjustment_exposure,
  SUM(patient_responsibility) AS total_patient_responsibility,
  ROUND(AVG(data_completeness_score), 1) AS avg_completeness_score
FROM public.payment_variances
GROUP BY facility_id, validation_status, confidence_level;

