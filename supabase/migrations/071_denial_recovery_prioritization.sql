-- ==============================================================================
-- MIGRATION: 071_denial_recovery_prioritization.sql
-- PHASE: 94 — Denial Recovery Prioritization (Revenue Cycle Management)
-- DESCRIPTION: Multi-factor denial ranking by value, overturn probability,
--              deadline urgency, and administrative effort-to-yield ratio.
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Create Denial Recovery Priorities Ledger Table
CREATE TABLE IF NOT EXISTS public.denial_recovery_priorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  denial_id UUID NOT NULL REFERENCES public.rcm_denials(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  payer_id UUID,
  carc_code VARCHAR(16) NOT NULL,
  rarc_code VARCHAR(16),
  denial_category VARCHAR(40) NOT NULL,
  
  -- Financial & Recovery Expectations
  denied_amount NUMERIC(14,2) NOT NULL CHECK (denied_amount >= 0),
  overturn_probability_pct NUMERIC(5,2) NOT NULL CHECK (overturn_probability_pct BETWEEN 0.00 AND 100.00),
  expected_recovery_amount NUMERIC(14,2) NOT NULL CHECK (expected_recovery_amount >= 0),
  
  -- Deadlines & Urgency
  filing_deadline DATE NOT NULL,
  days_until_deadline INTEGER NOT NULL,
  
  -- Administrative Effort & Yield per Hour
  effort_level VARCHAR(20) NOT NULL CHECK (effort_level IN (
    'MINIMAL_EFFORT',
    'MODERATE_EFFORT',
    'HIGH_EFFORT',
    'EXTREME_EFFORT'
  )),
  estimated_effort_hours NUMERIC(4,2) NOT NULL DEFAULT 0.5 CHECK (estimated_effort_hours > 0),
  yield_per_hour NUMERIC(14,2) NOT NULL CHECK (yield_per_hour >= 0),
  
  -- Multi-Factor Subscores (0.00 - 100.00)
  value_score NUMERIC(5,2) NOT NULL CHECK (value_score BETWEEN 0.00 AND 100.00),
  probability_score NUMERIC(5,2) NOT NULL CHECK (probability_score BETWEEN 0.00 AND 100.00),
  urgency_score NUMERIC(5,2) NOT NULL CHECK (urgency_score BETWEEN 0.00 AND 100.00),
  effort_score NUMERIC(5,2) NOT NULL CHECK (effort_score BETWEEN 0.00 AND 100.00),
  priority_score NUMERIC(5,2) NOT NULL CHECK (priority_score BETWEEN 0.00 AND 100.00),
  
  -- Priority Tier Classification
  priority_tier VARCHAR(32) NOT NULL CHECK (priority_tier IN (
    'CRITICAL_URGENT',
    'HIGH_PRIORITY',
    'MEDIUM_PRIORITY',
    'LOW_PRIORITY',
    'UNRECOVERABLE_HOLD'
  )),
  
  -- Queue Status & Specialist Routing
  queue_status VARCHAR(32) NOT NULL CHECK (queue_status IN (
    'QUEUED',
    'ASSIGNED',
    'IN_APPEAL',
    'RECOVERED',
    'DISMISSED_WRITE_OFF',
    'EXPIRED'
  )),
  assigned_user_id UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  last_scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drp_fac ON public.denial_recovery_priorities(facility_id);
CREATE INDEX IF NOT EXISTS idx_drp_denial ON public.denial_recovery_priorities(denial_id);
CREATE INDEX IF NOT EXISTS idx_drp_claim ON public.denial_recovery_priorities(claim_id);
CREATE INDEX IF NOT EXISTS idx_drp_tier ON public.denial_recovery_priorities(facility_id, priority_tier);
CREATE INDEX IF NOT EXISTS idx_drp_score ON public.denial_recovery_priorities(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_drp_yield ON public.denial_recovery_priorities(yield_per_hour DESC);
CREATE INDEX IF NOT EXISTS idx_drp_days ON public.denial_recovery_priorities(days_until_deadline ASC);
CREATE INDEX IF NOT EXISTS idx_drp_queue ON public.denial_recovery_priorities(facility_id, queue_status);

-- 2. Create Facility Prioritization Rules Configuration Table
CREATE TABLE IF NOT EXISTS public.denial_prioritization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  rule_name VARCHAR(128) NOT NULL,
  carc_code VARCHAR(16),
  payer_id UUID,
  default_probability_pct NUMERIC(5,2) NOT NULL CHECK (default_probability_pct BETWEEN 0 AND 100),
  default_effort_level VARCHAR(20) NOT NULL CHECK (default_effort_level IN (
    'MINIMAL_EFFORT',
    'MODERATE_EFFORT',
    'HIGH_EFFORT',
    'EXTREME_EFFORT'
  )),
  default_effort_hours NUMERIC(4,2) NOT NULL CHECK (default_effort_hours > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dpr_fac ON public.denial_prioritization_rules(facility_id);
CREATE INDEX IF NOT EXISTS idx_dpr_carc ON public.denial_prioritization_rules(facility_id, carc_code);

-- 3. Analytical Views
CREATE OR REPLACE VIEW public.vw_denial_recovery_priorities_active AS
SELECT 
  drp.id AS priority_id,
  drp.facility_id,
  drp.denial_id,
  drp.claim_id,
  drp.payer_id,
  drp.carc_code,
  drp.rarc_code,
  drp.denial_category,
  drp.denied_amount,
  drp.overturn_probability_pct,
  drp.expected_recovery_amount,
  drp.filing_deadline,
  drp.days_until_deadline,
  drp.effort_level,
  drp.estimated_effort_hours,
  drp.yield_per_hour,
  drp.priority_score,
  drp.priority_tier,
  drp.queue_status,
  drp.assigned_user_id,
  drp.assigned_at
FROM public.denial_recovery_priorities drp
WHERE drp.queue_status NOT IN ('RECOVERED', 'DISMISSED_WRITE_OFF', 'EXPIRED');

CREATE OR REPLACE VIEW public.vw_denial_recovery_priorities_summary AS
SELECT
  facility_id,
  priority_tier,
  queue_status,
  COUNT(*) AS denial_count,
  SUM(denied_amount) AS total_denied_amount,
  SUM(expected_recovery_amount) AS total_expected_recovery,
  ROUND(AVG(priority_score), 2) AS avg_priority_score,
  ROUND(AVG(yield_per_hour), 2) AS avg_yield_per_hour
FROM public.denial_recovery_priorities
GROUP BY facility_id, priority_tier, queue_status;

-- 4. Enable Row Level Security (RLS) on both tables
ALTER TABLE public.denial_recovery_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.denial_prioritization_rules ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies (1:1 Statement Parity)
DROP POLICY IF EXISTS denial_recovery_priorities_isolation ON public.denial_recovery_priorities;
CREATE POLICY denial_recovery_priorities_isolation ON public.denial_recovery_priorities
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS denial_prioritization_rules_isolation ON public.denial_prioritization_rules;
CREATE POLICY denial_prioritization_rules_isolation ON public.denial_prioritization_rules
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

