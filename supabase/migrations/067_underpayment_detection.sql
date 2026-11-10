-- ==============================================================================
-- MIGRATION: 067_underpayment_detection.sql
-- PHASE: 93 — Underpayment Detection Engine (Revenue Cycle Management)
-- DESCRIPTION: Algorithmic cross-auditing of expected contracted fee schedules
--              against 835 remittance actual allowed and paid amounts.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Master Underpayment Detection Rules Table
CREATE TABLE IF NOT EXISTS public.rcm_underpayment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  rule_code VARCHAR(32) NOT NULL UNIQUE,
  underpayment_category VARCHAR(40) NOT NULL CHECK (underpayment_category IN (
    'FEE_SCHEDULE_MISMATCH',
    'IMPLANT_CARVEOUT_UNPAID',
    'MPPR_OVER_DISCOUNT',
    'DEVICE_INTENSIVE_OFFSET_ERROR',
    'CONTRACT_RATE_EXPIRED',
    'BILATERAL_DISCOUNT_ERROR'
  )),
  title VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  variance_threshold NUMERIC(14,2) NOT NULL DEFAULT 50.00 CHECK (variance_threshold >= 0),
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 90.00 CHECK (confidence_score BETWEEN 0.00 AND 100.00),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_und_rules_fac ON public.rcm_underpayment_rules(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_und_rules_cat ON public.rcm_underpayment_rules(facility_id, underpayment_category);
CREATE INDEX IF NOT EXISTS idx_rcm_und_rules_code ON public.rcm_underpayment_rules(rule_code);

-- 2. Create Underpayment Detection Ledger Table
CREATE TABLE IF NOT EXISTS public.rcm_underpayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  underpayment_alert_number VARCHAR(64) NOT NULL UNIQUE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  
  -- Payer & Procedure Context
  payer_name VARCHAR(128) NOT NULL,
  procedure_name VARCHAR(256) NOT NULL,
  cpt_code VARCHAR(16) NOT NULL,
  date_of_service DATE NOT NULL,
  remittance_date DATE NOT NULL,
  
  -- Classification
  underpayment_category VARCHAR(40) NOT NULL CHECK (underpayment_category IN (
    'FEE_SCHEDULE_MISMATCH',
    'IMPLANT_CARVEOUT_UNPAID',
    'MPPR_OVER_DISCOUNT',
    'DEVICE_INTENSIVE_OFFSET_ERROR',
    'CONTRACT_RATE_EXPIRED',
    'BILATERAL_DISCOUNT_ERROR'
  )),
  
  -- Financial Dimensions with Stored Deterministic Invariants
  expected_allowed_amount NUMERIC(14,2) NOT NULL CHECK (expected_allowed_amount >= 0),
  actual_allowed_amount NUMERIC(14,2) NOT NULL CHECK (actual_allowed_amount >= 0),
  variance_amount NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(expected_allowed_amount - actual_allowed_amount, 2)
  ) STORED,
  variance_percentage NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN expected_allowed_amount > 0 
      THEN ROUND(((expected_allowed_amount - actual_allowed_amount) / expected_allowed_amount) * 100.0, 2)
      ELSE 0.00 
    END
  ) STORED,
  
  expected_payment_amount NUMERIC(14,2) NOT NULL CHECK (expected_payment_amount >= 0),
  actual_payment_amount NUMERIC(14,2) NOT NULL CHECK (actual_payment_amount >= 0),
  recovered_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0),
  
  -- Scoring & Confidence
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 90.00 CHECK (confidence_score BETWEEN 0.00 AND 100.00),
  priority_score NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00),
  
  -- Lifecycle Status
  status VARCHAR(32) NOT NULL DEFAULT 'DETECTED' CHECK (status IN (
    'DETECTED',
    'AUDIT_CONFIRMED',
    'DISPUTE_SUBMITTED',
    'RECOVERED',
    'DISMISSED_VALID_ADJUSTMENT'
  )),
  
  dispute_letter_reference VARCHAR(64),
  disputed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcm_und_fac ON public.rcm_underpayments(facility_id);
CREATE INDEX IF NOT EXISTS idx_rcm_und_status ON public.rcm_underpayments(facility_id, status);
CREATE INDEX IF NOT EXISTS idx_rcm_und_cat ON public.rcm_underpayments(facility_id, underpayment_category);
CREATE INDEX IF NOT EXISTS idx_rcm_und_claim ON public.rcm_underpayments(claim_id);
CREATE INDEX IF NOT EXISTS idx_rcm_und_surg ON public.rcm_underpayments(surgery_id);
CREATE INDEX IF NOT EXISTS idx_rcm_und_priority ON public.rcm_underpayments(facility_id, priority_score DESC);

-- 3. Create Underpayment Audit & Dispute Action Log Table
CREATE TABLE IF NOT EXISTS public.rcm_underpayment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  underpayment_id UUID NOT NULL REFERENCES public.rcm_underpayments(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL CHECK (action_type IN (
    'UNDERPAYMENT_DETECTED',
    'AUDIT_CONFIRMED',
    'DISPUTE_SUBMITTED',
    'PAYER_RESPONSE_RECEIVED',
    'PAYMENT_RECOVERED',
    'UNDERPAYMENT_DISMISSED'
  )),
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  previous_status VARCHAR(32),
  new_status VARCHAR(32),
  notes TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rcm_und_act_und ON public.rcm_underpayment_actions(underpayment_id);
CREATE INDEX IF NOT EXISTS idx_rcm_und_act_fac ON public.rcm_underpayment_actions(facility_id);

-- 4. Enable Row Level Security
ALTER TABLE public.rcm_underpayment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_underpayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rcm_underpayment_actions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies with 1:1 DROP and CREATE Parity
DROP POLICY IF EXISTS rcm_underpayment_rules_facility_isolation ON public.rcm_underpayment_rules;
CREATE POLICY rcm_underpayment_rules_facility_isolation
  ON public.rcm_underpayment_rules
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_underpayments_facility_isolation ON public.rcm_underpayments;
CREATE POLICY rcm_underpayments_facility_isolation
  ON public.rcm_underpayments
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

DROP POLICY IF EXISTS rcm_underpayment_actions_facility_isolation ON public.rcm_underpayment_actions;
CREATE POLICY rcm_underpayment_actions_facility_isolation
  ON public.rcm_underpayment_actions
  FOR ALL
  USING (facility_id IN (SELECT public.get_auth_user_facilities()));

-- 6. Analytical View: Active Underpayments with Dynamic Days Elapsed
CREATE OR REPLACE VIEW public.vw_rcm_underpayments_active AS
SELECT
  u.id,
  u.facility_id,
  u.underpayment_alert_number,
  u.claim_id,
  u.surgery_id,
  u.patient_id,
  u.payer_name,
  u.procedure_name,
  u.cpt_code,
  u.date_of_service,
  u.remittance_date,
  (CURRENT_DATE - u.remittance_date) AS days_elapsed,
  u.underpayment_category,
  u.expected_allowed_amount,
  u.actual_allowed_amount,
  u.variance_amount,
  u.variance_percentage,
  u.expected_payment_amount,
  u.actual_payment_amount,
  u.recovered_amount,
  u.confidence_score,
  u.priority_score,
  u.status,
  u.dispute_letter_reference,
  u.disputed_at,
  u.resolved_at,
  u.reviewed_by,
  u.resolution_notes,
  u.created_at,
  u.updated_at
FROM public.rcm_underpayments u;

-- 7. Analytical View: Underpayments Summary by Payer & Category
CREATE OR REPLACE VIEW public.vw_rcm_underpayments_summary AS
SELECT
  facility_id,
  payer_name,
  underpayment_category,
  COUNT(id) AS total_alerts,
  COUNT(CASE WHEN status = 'DETECTED' THEN 1 END) AS detected_count,
  COUNT(CASE WHEN status = 'AUDIT_CONFIRMED' THEN 1 END) AS confirmed_count,
  COUNT(CASE WHEN status = 'DISPUTE_SUBMITTED' THEN 1 END) AS disputed_count,
  COUNT(CASE WHEN status = 'RECOVERED' THEN 1 END) AS recovered_count,
  COUNT(CASE WHEN status = 'DISMISSED_VALID_ADJUSTMENT' THEN 1 END) AS dismissed_count,
  SUM(variance_amount) AS total_variance_exposure,
  SUM(CASE WHEN status IN ('AUDIT_CONFIRMED', 'DISPUTE_SUBMITTED') THEN variance_amount ELSE 0.00 END) AS pipeline_exposure,
  SUM(recovered_amount) AS total_recovered_amount,
  ROUND(AVG(variance_percentage), 1) AS avg_variance_percentage
FROM public.rcm_underpayments
GROUP BY facility_id, payer_name, underpayment_category;
