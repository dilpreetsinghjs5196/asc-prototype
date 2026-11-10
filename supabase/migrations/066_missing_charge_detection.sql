-- ==============================================================================
-- MIGRATION: 066_missing_charge_detection.sql
-- PHASE: 92 — Missing Charge Detection Engine (Revenue Cycle Management)
-- DESCRIPTION: Algorithmic cross-system charge audits comparing clinical docs,
--              OR supply/implant logs, MAR pharmacy, and anesthesia records against claims.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Master Missing Charge Detection Rules Table
CREATE TABLE IF NOT EXISTS public.rcm_missing_charge_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  rule_code VARCHAR(32) NOT NULL UNIQUE,
  charge_category VARCHAR(40) NOT NULL CHECK (charge_category IN (
    'SECONDARY_CPT',
    'IMPLANT_HARDWARE',
    'HIGH_COST_DRUG',
    'SURGICAL_SUPPLY',
    'ANESTHESIA_UNITS',
    'PATHOLOGY_SPECIMEN'
  )),
  title VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  detection_trigger TEXT NOT NULL,
  threshold_amount NUMERIC(14,2) NOT NULL DEFAULT 150.00 CHECK (threshold_amount >= 0),
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 85.00 CHECK (confidence_score BETWEEN 0.00 AND 100.00),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_rules_fac ON public.rcm_missing_charge_rules(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_rules_cat ON public.rcm_missing_charge_rules(facility_id, charge_category);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_rules_code ON public.rcm_missing_charge_rules(rule_code);

-- 2. Create Missing Charge Alert Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_missing_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  charge_alert_number VARCHAR(64) NOT NULL UNIQUE,
  surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  claim_id UUID REFERENCES public.claims(id) ON DELETE SET NULL,
  
  -- Item Classification
  charge_category VARCHAR(40) NOT NULL CHECK (charge_category IN (
    'SECONDARY_CPT',
    'IMPLANT_HARDWARE',
    'HIGH_COST_DRUG',
    'SURGICAL_SUPPLY',
    'ANESTHESIA_UNITS',
    'PATHOLOGY_SPECIMEN'
  )),
  item_code VARCHAR(32) NOT NULL,
  item_description VARCHAR(256) NOT NULL,
  
  -- Clinical Encounter & Provider Context
  surgeon_name VARCHAR(128) NOT NULL,
  specialty VARCHAR(64) NOT NULL,
  procedure_name VARCHAR(256) NOT NULL,
  payer_name VARCHAR(128) NOT NULL,
  date_of_service DATE NOT NULL,
  
  -- Financial Dimensions with Stored Deterministic Invariant
  estimated_lost_charge NUMERIC(14,2) NOT NULL CHECK (estimated_lost_charge >= 0),
  expected_reimbursement_rate NUMERIC(5,2) NOT NULL DEFAULT 40.00 CHECK (expected_reimbursement_rate BETWEEN 0.00 AND 100.00),
  estimated_net_recovery NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(estimated_lost_charge * expected_reimbursement_rate / 100.0, 2)
  ) STORED,
  
  -- Evidence & Detection Score
  clinical_evidence_source VARCHAR(64) NOT NULL CHECK (clinical_evidence_source IN (
    'OPERATIVE_DICTATION',
    'OR_NURSING_LOG',
    'IMPLANT_USAGE_LOG',
    'MAR_PHARMACY',
    'ANESTHESIA_RECORD',
    'PATHOLOGY_REQUISITION'
  )),
  evidence_text TEXT NOT NULL,
  detection_confidence NUMERIC(5,2) NOT NULL DEFAULT 85.00 CHECK (detection_confidence BETWEEN 0.00 AND 100.00),
  priority_score NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00),
  
  -- Lifecycle Status
  status VARCHAR(32) NOT NULL DEFAULT 'DETECTED' CHECK (status IN (
    'DETECTED',
    'UNDER_AUDIT',
    'CHARGE_CONFIRMED',
    'CLAIM_AMENDED',
    'DISMISSED_NOT_BILLABLE'
  )),
  
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_fac ON public.rcm_missing_charges(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_status ON public.rcm_missing_charges(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_cat ON public.rcm_missing_charges(facility_id, charge_category);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_surg ON public.rcm_missing_charges(surgery_id);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_claim ON public.rcm_missing_charges(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_priority ON public.rcm_missing_charges(facility_id, priority_score DESC);

-- 3. Create Missing Charge Audit & Workflow Action Log Table
CREATE TABLE IF NOT EXISTS public.rcm_missing_charge_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  missing_charge_id UUID NOT NULL REFERENCES public.rcm_missing_charges(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL CHECK (action_type IN (
    'CHARGE_DETECTED',
    'AUDIT_ASSIGNED',
    'EVIDENCE_VERIFIED',
    'CHARGE_CONFIRMED',
    'CLAIM_AMENDED',
    'CHARGE_DISMISSED'
  )),
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  notes TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_act_chg ON public.rcm_missing_charge_actions(missing_charge_id);
CREATE INDEX IF NOT EXISTS idx_rcm_missing_chg_act_fac ON public.rcm_missing_charge_actions(facility_id);

-- 4. Enable Row Level Security
ALTER TABLE public.rcm_missing_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_missing_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_missing_charge_actions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies with 1:1 DROP and CREATE Parity
DROP POLICY IF EXISTS rcm_missing_charge_rules_facility_isolation ON public.rcm_missing_charge_rules;
CREATE POLICY rcm_missing_charge_rules_facility_isolation
  ON public.rcm_missing_charge_rules
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_missing_charges_facility_isolation ON public.rcm_missing_charges;
CREATE POLICY rcm_missing_charges_facility_isolation
  ON public.rcm_missing_charges
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_missing_charge_actions_facility_isolation ON public.rcm_missing_charge_actions;
CREATE POLICY rcm_missing_charge_actions_facility_isolation
  ON public.rcm_missing_charge_actions
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

-- 6. Analytical View: Active Missing Charges with Priority & Age
CREATE OR REPLACE VIEW public.vw_rcm_missing_charges_active AS
SELECT
  c.id,
  c.facility_id,
  c.charge_alert_number,
  c.surgery_id,
  c.patient_id,
  c.claim_id,
  c.charge_category,
  c.item_code,
  c.item_description,
  c.surgeon_name,
  c.specialty,
  c.procedure_name,
  c.payer_name,
  c.date_of_service,
  (CURRENT_DATE - c.date_of_service) AS days_elapsed,
  c.estimated_lost_charge,
  c.expected_reimbursement_rate,
  c.estimated_net_recovery,
  c.clinical_evidence_source,
  c.evidence_text,
  c.detection_confidence,
  c.priority_score,
  c.status,
  c.reviewed_by,
  c.reviewed_at,
  c.resolution_notes,
  c.created_at,
  c.updated_at
FROM public.rcm_missing_charges c;

-- 7. Analytical View: Missing Charges Summary by Category
CREATE OR REPLACE VIEW public.vw_rcm_missing_charges_summary AS
SELECT
  facility_id,
  charge_category,
  COUNT(id) AS total_alerts,
  COUNT(CASE WHEN status IN ('DETECTED', 'UNDER_AUDIT') THEN 1 END) AS pending_audit_count,
  COUNT(CASE WHEN status = 'CHARGE_CONFIRMED' THEN 1 END) AS confirmed_count,
  COUNT(CASE WHEN status = 'CLAIM_AMENDED' THEN 1 END) AS amended_count,
  COUNT(CASE WHEN status = 'DISMISSED_NOT_BILLABLE' THEN 1 END) AS dismissed_count,
  SUM(estimated_lost_charge) AS total_lost_charges,
  SUM(estimated_net_recovery) AS total_net_recovery,
  SUM(CASE WHEN status = 'CLAIM_AMENDED' THEN estimated_net_recovery ELSE 0.00 END) AS realized_amended_recovery,
  ROUND(AVG(detection_confidence), 1) AS avg_confidence_score
FROM public.rcm_missing_charges
GROUP BY facility_id, charge_category;
