-- ==============================================================================
-- MIGRATION: 070_recurring_payer_underpayment_patterns.sql
-- PHASE: 93C — Recurring Payer Underpayment Patterns (Revenue Cycle Management)
-- DESCRIPTION: Multi-claim pattern grouping across payer, plan, CPT, modifier,
--              contract rule, earliest filing deadline, and batch opportunities.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Recurring Payer Underpayment Patterns Header Table
CREATE TABLE IF NOT EXISTS public.payer_underpayment_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL,
  plan_id UUID,
  contract_id UUID,
  contract_version_id UUID,
  pattern_code VARCHAR(64) NOT NULL,
  root_cause_code VARCHAR(64) NOT NULL,
  cpt_hcpcs_code VARCHAR(16),
  modifier_signature TEXT,
  rule_signature TEXT NOT NULL,
  first_detected_date DATE NOT NULL,
  last_detected_date DATE NOT NULL,
  
  -- Quantitative Volume & Recovery Metrics
  claim_count INTEGER NOT NULL CHECK (claim_count >= 0),
  validated_claim_count INTEGER NOT NULL CHECK (validated_claim_count >= 0),
  aggregate_variance NUMERIC(14,2) NOT NULL CHECK (aggregate_variance >= 0),
  validated_recoverable_amount NUMERIC(14,2) NOT NULL CHECK (validated_recoverable_amount >= 0),
  
  -- Confidence & Status Taxonomy
  confidence_level VARCHAR(16) NOT NULL CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN')),
  status VARCHAR(32) NOT NULL CHECK (status IN (
    'OPEN',
    'UNDER_REVIEW',
    'VALIDATED',
    'BATCH_RECOVERY_READY',
    'IN_RECOVERY',
    'RESOLVED',
    'DISMISSED',
    'EXPIRED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pup_fac ON public.payer_underpayment_patterns(facility_id);
CREATE INDEX IF NOT EXISTS idx_pup_payer ON public.payer_underpayment_patterns(facility_id, payer_id);
CREATE INDEX IF NOT EXISTS idx_pup_status ON public.payer_underpayment_patterns(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_pup_cpt ON public.payer_underpayment_patterns(cpt_hcpcs_code);
CREATE INDEX IF NOT EXISTS idx_pup_root_cause ON public.payer_underpayment_patterns(facility_id, root_cause_code);

-- 2. Create Pattern-Claim Junction Table
CREATE TABLE IF NOT EXISTS public.payer_underpayment_pattern_claims (
  pattern_id UUID NOT NULL REFERENCES public.payer_underpayment_patterns(id) ON DELETE CASCADE,
  payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  date_of_service DATE NOT NULL,
  variance_amount NUMERIC(14,2) NOT NULL CHECK (variance_amount >= 0),
  validation_status VARCHAR(40) NOT NULL,
  PRIMARY KEY (pattern_id, payment_variance_id)
);

CREATE INDEX IF NOT EXISTS idx_pupc_claim ON public.payer_underpayment_pattern_claims(claim_id);
CREATE INDEX IF NOT EXISTS idx_pupc_variance ON public.payer_underpayment_pattern_claims(payment_variance_id);
CREATE INDEX IF NOT EXISTS idx_pupc_dos ON public.payer_underpayment_pattern_claims(date_of_service);

-- 3. Create Batch Recovery Opportunities Table
CREATE TABLE IF NOT EXISTS public.batch_recovery_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES public.payer_underpayment_patterns(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  batch_number VARCHAR(64) NOT NULL,
  claim_count INTEGER NOT NULL CHECK (claim_count >= 0),
  potential_recovery NUMERIC(14,2) NOT NULL CHECK (potential_recovery >= 0),
  validated_recovery NUMERIC(14,2) NOT NULL CHECK (validated_recovery >= 0),
  filing_deadline_earliest DATE,
  priority_score NUMERIC(6,2) CHECK (priority_score BETWEEN 0.00 AND 100.00),
  owner_user_id UUID REFERENCES auth.users(id),
  status VARCHAR(32) NOT NULL CHECK (status IN (
    'DRAFT',
    'READY_FOR_SUPERVISOR',
    'APPROVED',
    'DISPATCHED_TO_PAYER',
    'SETTLED',
    'CLOSED',
    'EXPIRED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bro_fac ON public.batch_recovery_opportunities(facility_id);
CREATE INDEX IF NOT EXISTS idx_bro_pattern ON public.batch_recovery_opportunities(pattern_id);
CREATE INDEX IF NOT EXISTS idx_bro_status ON public.batch_recovery_opportunities(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_bro_deadline ON public.batch_recovery_opportunities(facility_id, filing_deadline_earliest);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_payer_patterns_active AS
SELECT 
  pup.id AS pattern_id,
  pup.organization_id,
  pup.facility_id,
  pup.payer_id,
  pup.plan_id,
  pup.pattern_code,
  pup.root_cause_code,
  pup.cpt_hcpcs_code,
  pup.claim_count,
  pup.validated_claim_count,
  pup.aggregate_variance,
  pup.validated_recoverable_amount,
  ROUND(pup.validated_recoverable_amount / NULLIF(pup.validated_claim_count, 0), 2) AS avg_claim_recovery,
  pup.confidence_level,
  pup.status,
  pup.first_detected_date,
  pup.last_detected_date,
  bro.id AS batch_opportunity_id,
  bro.batch_number,
  bro.status AS batch_status,
  bro.filing_deadline_earliest
FROM public.payer_underpayment_patterns pup
LEFT JOIN public.batch_recovery_opportunities bro ON pup.id = bro.pattern_id
WHERE pup.status NOT IN ('RESOLVED', 'DISMISSED', 'EXPIRED');

CREATE OR REPLACE VIEW public.vw_payer_patterns_summary AS
SELECT
  facility_id,
  payer_id,
  root_cause_code,
  COUNT(*) AS total_patterns,
  SUM(claim_count) AS total_affected_claims,
  SUM(aggregate_variance) AS total_variance,
  SUM(validated_recoverable_amount) AS total_validated_recoverable
FROM public.payer_underpayment_patterns
GROUP BY facility_id, payer_id, root_cause_code;

-- 5. Enable Row Level Security (RLS) on all 3 tables
ALTER TABLE public.payer_underpayment_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payer_underpayment_pattern_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_recovery_opportunities ENABLE ROW LEVEL SECURITY;

-- 6. Row Level Security Policies (1:1 Statement Parity)
DROP POLICY IF EXISTS payer_underpayment_patterns_isolation ON public.payer_underpayment_patterns;
CREATE POLICY payer_underpayment_patterns_isolation ON public.payer_underpayment_patterns
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS payer_pattern_claims_isolation ON public.payer_underpayment_pattern_claims;
CREATE POLICY payer_pattern_claims_isolation ON public.payer_underpayment_pattern_claims
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.payer_underpayment_patterns pup
      WHERE pup.id = payer_underpayment_pattern_claims.pattern_id
        AND pup.facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
  );

DROP POLICY IF EXISTS batch_recovery_opportunities_isolation ON public.batch_recovery_opportunities;
CREATE POLICY batch_recovery_opportunities_isolation ON public.batch_recovery_opportunities
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

