-- ==============================================================================
-- MIGRATION: 064_revenue_leakage_engine.sql
-- PHASE: 90 — Revenue Leakage Engine (Revenue Cycle Management)
-- DESCRIPTION: Master revenue-leakage detection rules, opportunity identification model,
--              clinical/billing evidence capture, recovery scoring, and lifecycle state machine.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Master Revenue Leakage Rules Table
CREATE TABLE IF NOT EXISTS public.rcm_leakage_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  rule_code VARCHAR(32) NOT NULL UNIQUE,
  category VARCHAR(40) NOT NULL CHECK (category IN (
    'UNBILLED_IMPLANT',
    'UNBILLED_PROCEDURE',
    'MODIFIER_OMISSION',
    'CONTRACT_UNDERPAYMENT',
    'TIMELY_FILING_RISK',
    'DOCUMENTATION_DEFICIENCY'
  )),
  title VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  detection_logic TEXT NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  threshold_amount NUMERIC(14,2) NOT NULL DEFAULT 100.00 CHECK (threshold_amount >= 0),
  default_recovery_probability NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (default_recovery_probability BETWEEN 0.00 AND 100.00),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_leakage_rules_fac ON public.rcm_leakage_rules(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_rules_cat ON public.rcm_leakage_rules(facility_id, category);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_rules_code ON public.rcm_leakage_rules(rule_code);

-- 2. Create Revenue Leakage Opportunities Table
CREATE TABLE IF NOT EXISTS public.rcm_leakage_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  opportunity_number VARCHAR(64) NOT NULL UNIQUE,
  rule_id UUID NOT NULL REFERENCES public.rcm_leakage_rules(id) ON DELETE RESTRICT,
  surgery_id BIGINT REFERENCES public.surgeries(id) ON DELETE SET NULL,
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  patient_id BIGINT REFERENCES public.patients(id) ON DELETE SET NULL,
  surgeon_name VARCHAR(128) NOT NULL,
  specialty VARCHAR(64) NOT NULL,
  category VARCHAR(40) NOT NULL CHECK (category IN (
    'UNBILLED_IMPLANT',
    'UNBILLED_PROCEDURE',
    'MODIFIER_OMISSION',
    'CONTRACT_UNDERPAYMENT',
    'TIMELY_FILING_RISK',
    'DOCUMENTATION_DEFICIENCY'
  )),
  status VARCHAR(32) NOT NULL DEFAULT 'DETECTED' CHECK (status IN (
    'DETECTED',
    'UNDER_REVIEW',
    'VALIDATED_OPPORTUNITY',
    'REBILL_SUBMITTED',
    'RECOVERED',
    'DISMISSED_VALID_ADJ',
    'EXPIRED_TIMELY_FILING'
  )),
  potential_recovery_amount NUMERIC(14,2) NOT NULL CHECK (potential_recovery_amount >= 0),
  recovery_probability NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (recovery_probability BETWEEN 0.00 AND 100.00),
  expected_recovery_amount NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(potential_recovery_amount * recovery_probability / 100.0, 2)
  ) STORED,
  realized_recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (realized_recovered_amount >= 0),
  filing_deadline DATE,
  priority_score NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  action_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_leakage_opp_fac ON public.rcm_leakage_opportunities(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_opp_status ON public.rcm_leakage_opportunities(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_opp_cat ON public.rcm_leakage_opportunities(facility_id, category);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_opp_surg ON public.rcm_leakage_opportunities(surgery_id);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_opp_claim ON public.rcm_leakage_opportunities(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_opp_priority ON public.rcm_leakage_opportunities(facility_id, priority_score DESC);

-- 3. Create Revenue Leakage Evidence Table
CREATE TABLE IF NOT EXISTS public.rcm_leakage_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.rcm_leakage_opportunities(id) ON DELETE CASCADE,
  evidence_type VARCHAR(40) NOT NULL CHECK (evidence_type IN (
    'OPERATIVE_NOTE',
    'IMPLANT_LOG',
    'VENDOR_INVOICE',
    'PATHOLOGY_REPORT',
    'FEE_SCHEDULE_SCHEDULE',
    'ERA_835_CLP',
    'CODING_AUDIT_TRAIL'
  )),
  title VARCHAR(128) NOT NULL,
  description TEXT,
  source_reference VARCHAR(128),
  document_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_leakage_ev_opp ON public.rcm_leakage_evidence(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_rcm_leakage_ev_fac ON public.rcm_leakage_evidence(facility_id);

-- 4. Enable Row Level Security
ALTER TABLE public.rcm_leakage_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_leakage_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_leakage_evidence ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies with 1:1 DROP and CREATE Parity
DROP POLICY IF EXISTS rcm_leakage_rules_facility_isolation ON public.rcm_leakage_rules;
CREATE POLICY rcm_leakage_rules_facility_isolation
  ON public.rcm_leakage_rules
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_leakage_opportunities_facility_isolation ON public.rcm_leakage_opportunities;
CREATE POLICY rcm_leakage_opportunities_facility_isolation
  ON public.rcm_leakage_opportunities
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_leakage_evidence_facility_isolation ON public.rcm_leakage_evidence;
CREATE POLICY rcm_leakage_evidence_facility_isolation
  ON public.rcm_leakage_evidence
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

-- 6. Analytical View: Leakage Pipeline Summary by Category & Facility
CREATE OR REPLACE VIEW public.vw_rcm_leakage_opportunities_summary AS
SELECT
  facility_id,
  category,
  COUNT(id) AS total_opportunities,
  COUNT(CASE WHEN status IN ('DETECTED', 'UNDER_REVIEW') THEN 1 END) AS pending_review_count,
  COUNT(CASE WHEN status = 'VALIDATED_OPPORTUNITY' THEN 1 END) AS validated_count,
  COUNT(CASE WHEN status = 'REBILL_SUBMITTED' THEN 1 END) AS rebill_submitted_count,
  COUNT(CASE WHEN status = 'RECOVERED' THEN 1 END) AS recovered_count,
  COUNT(CASE WHEN status = 'DISMISSED_VALID_ADJ' THEN 1 END) AS dismissed_count,
  SUM(potential_recovery_amount) AS total_potential_amount,
  SUM(expected_recovery_amount) AS total_expected_amount,
  SUM(realized_recovered_amount) AS total_realized_amount,
  ROUND(
    CASE 
      WHEN SUM(potential_recovery_amount) > 0 
      THEN (SUM(realized_recovered_amount) / SUM(potential_recovery_amount)) * 100.0
      ELSE 0.00
    END, 2
  ) AS recovery_yield_pct
FROM public.rcm_leakage_opportunities
GROUP BY facility_id, category;

-- 7. Analytical View: Surgeon & Specialty Leakage Scorecard
CREATE OR REPLACE VIEW public.vw_rcm_leakage_surgeon_scorecard AS
SELECT
  facility_id,
  surgeon_name,
  specialty,
  COUNT(id) AS total_opportunities,
  SUM(potential_recovery_amount) AS total_potential_leakage,
  SUM(expected_recovery_amount) AS total_expected_recovery,
  SUM(realized_recovered_amount) AS total_realized_recovery,
  COUNT(CASE WHEN category = 'UNBILLED_IMPLANT' THEN 1 END) AS unbilled_implant_cases,
  COUNT(CASE WHEN category = 'UNBILLED_PROCEDURE' THEN 1 END) AS unbilled_procedure_cases,
  COUNT(CASE WHEN category = 'MODIFIER_OMISSION' THEN 1 END) AS modifier_omission_cases,
  COUNT(CASE WHEN category = 'DOCUMENTATION_DEFICIENCY' THEN 1 END) AS doc_deficiency_cases
FROM public.rcm_leakage_opportunities
GROUP BY facility_id, surgeon_name, specialty;

