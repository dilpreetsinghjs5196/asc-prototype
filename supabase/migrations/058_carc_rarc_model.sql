-- Migration: 058_carc_rarc_model.sql
-- Description: Phase 84 Claim Adjustment Reason Codes (CARC) and Remittance Advice Remark Codes (RARC) Master Model
-- Includes official master registries, combinatorial mapping rules, denial interpretations ledger, and views.

-- 1. Create rcm_carc_master Table
CREATE TABLE IF NOT EXISTS public.rcm_carc_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) NOT NULL UNIQUE,
  group_code VARCHAR(4) NOT NULL CHECK (group_code IN ('CO', 'PR', 'OA', 'PI', 'CR')),
  short_description VARCHAR(200) NOT NULL,
  formal_title TEXT NOT NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN ('CONTRACTUAL', 'PATIENT_SHARE', 'DENIAL', 'COORDINATION_OF_BENEFITS', 'ADMINISTRATIVE')),
  is_denial BOOLEAN NOT NULL DEFAULT FALSE,
  is_recoverable BOOLEAN NOT NULL DEFAULT FALSE,
  default_action VARCHAR(32) NOT NULL CHECK (default_action IN ('CONTRACTUAL_WRITE_OFF', 'TRANSFER_TO_PATIENT', 'APPEALABLE', 'CORRECT_AND_RESUBMIT', 'ADMIN_WRITE_OFF')),
  recovery_likelihood_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (recovery_likelihood_pct BETWEEN 0 AND 100),
  effective_from DATE NOT NULL DEFAULT '2020-01-01',
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create rcm_rarc_master Table
CREATE TABLE IF NOT EXISTS public.rcm_rarc_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) NOT NULL UNIQUE,
  code_type VARCHAR(20) NOT NULL CHECK (code_type IN ('SUPPLEMENTAL', 'INFORMATIONAL')),
  short_description VARCHAR(200) NOT NULL,
  full_text TEXT NOT NULL,
  effective_from DATE NOT NULL DEFAULT '2020-01-01',
  effective_to DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create rcm_carc_rarc_mapping_rules Table
CREATE TABLE IF NOT EXISTS public.rcm_carc_rarc_mapping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carc_code VARCHAR(16) NOT NULL,
  rarc_code VARCHAR(16),
  root_cause_category VARCHAR(32) NOT NULL CHECK (root_cause_category IN ('AUTHORIZATION_PRECERT', 'MEDICAL_NECESSITY', 'CODING_BILLING', 'TIMELY_FILING', 'ELIGIBILITY', 'DUPLICATE', 'COB', 'CONTRACTUAL_FEE_SCHEDULE', 'PATIENT_COST_SHARE', 'ADMINISTRATIVE')),
  action_workflow VARCHAR(32) NOT NULL CHECK (action_workflow IN ('APPEALABLE', 'CORRECT_AND_RESUBMIT', 'TRANSFER_TO_PATIENT', 'CONTRACTUAL_WRITE_OFF', 'ADMIN_WRITE_OFF')),
  recovery_probability_pct NUMERIC(5,2) NOT NULL CHECK (recovery_probability_pct BETWEEN 0 AND 100),
  priority_level VARCHAR(16) NOT NULL DEFAULT 'MEDIUM' CHECK (priority_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  guidance_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_carc_rarc_rule UNIQUE (carc_code, rarc_code)
);

-- 4. Create rcm_claim_denial_interpretations Table
CREATE TABLE IF NOT EXISTS public.rcm_claim_denial_interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE NOT NULL,
  claim_id UUID REFERENCES public.claims(id) ON DELETE CASCADE NOT NULL,
  claim_line_id UUID REFERENCES public.claim_lines(id) ON DELETE SET NULL,
  remittance_id UUID REFERENCES public.rcm_payment_transactions(id) ON DELETE SET NULL,
  group_code VARCHAR(4) NOT NULL CHECK (group_code IN ('CO', 'PR', 'OA', 'PI', 'CR')),
  carc_code VARCHAR(16) NOT NULL,
  rarc_code VARCHAR(16),
  adjustment_amount NUMERIC(12,2) NOT NULL CHECK (adjustment_amount >= 0),
  root_cause_category VARCHAR(32) NOT NULL,
  action_workflow VARCHAR(32) NOT NULL,
  recovery_score NUMERIC(5,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_ACTION' CHECK (status IN ('PENDING_ACTION', 'APPEAL_INITIATED', 'REBILLED', 'WRITTEN_OFF', 'PATIENT_BILLED', 'RESOLVED')),
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for high performance querying
CREATE INDEX IF NOT EXISTS idx_carc_master_code ON public.rcm_carc_master(code);
CREATE INDEX IF NOT EXISTS idx_carc_master_category ON public.rcm_carc_master(category);
CREATE INDEX IF NOT EXISTS idx_rarc_master_code ON public.rcm_rarc_master(code);
CREATE INDEX IF NOT EXISTS idx_mapping_rules_carc ON public.rcm_carc_rarc_mapping_rules(carc_code);
CREATE INDEX IF NOT EXISTS idx_denial_interp_facility ON public.rcm_claim_denial_interpretations(facility_id);
CREATE INDEX IF NOT EXISTS idx_denial_interp_claim ON public.rcm_claim_denial_interpretations(claim_id);
CREATE INDEX IF NOT EXISTS idx_denial_interp_status ON public.rcm_claim_denial_interpretations(status);

-- 5. Rollup Views

-- View: CARC Frequency & Financial Impact Analysis
CREATE OR REPLACE VIEW public.vw_rcm_carc_frequency_analysis AS
SELECT 
  c.carc_code,
  COALESCE(m.short_description, 'Other Adjustment') AS short_description,
  COALESCE(m.group_code, 'CO') AS group_code,
  COALESCE(m.category, 'DENIAL') AS category,
  COALESCE(m.default_action, 'APPEALABLE') AS default_action,
  COUNT(c.id) AS total_occurrences,
  SUM(c.adjustment_amount) AS total_adjustment_dollars,
  AVG(c.recovery_score) AS average_recovery_score
FROM public.rcm_claim_denial_interpretations c
LEFT JOIN public.rcm_carc_master m ON c.carc_code = m.code
GROUP BY c.carc_code, m.short_description, m.group_code, m.category, m.default_action;

-- View: Actionable Denial Queue
CREATE OR REPLACE VIEW public.vw_rcm_actionable_denial_queue AS
SELECT 
  d.id,
  d.facility_id,
  d.claim_id,
  cl.claim_number,
  cl.patient_name,
  cl.patient_mrn,
  cl.payer_name,
  d.group_code,
  d.carc_code,
  d.rarc_code,
  d.adjustment_amount,
  d.root_cause_category,
  d.action_workflow,
  d.recovery_score,
  d.status,
  d.created_at
FROM public.rcm_claim_denial_interpretations d
JOIN public.claims cl ON d.claim_id = cl.id
WHERE d.status IN ('PENDING_ACTION', 'APPEAL_INITIATED', 'REBILLED')
ORDER BY d.adjustment_amount DESC;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.rcm_carc_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_rarc_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_carc_rarc_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_claim_denial_interpretations ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS "Allow read access to CARC master for authenticated users" ON public.rcm_carc_master;
CREATE POLICY "Allow read access to CARC master for authenticated users"
  ON public.rcm_carc_master FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow read access to RARC master for authenticated users" ON public.rcm_rarc_master;
CREATE POLICY "Allow read access to RARC master for authenticated users"
  ON public.rcm_rarc_master FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow read access to mapping rules for authenticated users" ON public.rcm_carc_rarc_mapping_rules;
CREATE POLICY "Allow read access to mapping rules for authenticated users"
  ON public.rcm_carc_rarc_mapping_rules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Facility isolation on claim denial interpretations" ON public.rcm_claim_denial_interpretations;
CREATE POLICY "Facility isolation on claim denial interpretations"
  ON public.rcm_claim_denial_interpretations FOR ALL
  TO authenticated
  USING (
    facility_id IN (
      SELECT facility_id FROM public.user_facility_memberships
      WHERE user_id = auth.uid()
    )
  );
