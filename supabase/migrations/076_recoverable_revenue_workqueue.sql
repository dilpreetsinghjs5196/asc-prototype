-- ==============================================================================
-- Migration: 076_recoverable_revenue_workqueue.sql
-- Phase 99: Recoverable Revenue Workqueue & Execution Workbench
-- Tenancy: Enforced Facility Isolation via current_setting('app.current_facility_id', true)
-- Description: Core tables, indexes, views, and RLS policies for managing recovery workqueues,
--              specialist allocations, SLA deadlines, lifecycle states, and immutable audit logs.
-- ==============================================================================

-- 1. Table: revenue_recovery_workqueues
CREATE TABLE IF NOT EXISTS public.revenue_recovery_workqueues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  queue_code VARCHAR(64) NOT NULL,
  queue_name VARCHAR(128) NOT NULL,
  description TEXT,
  target_sla_hours INTEGER NOT NULL DEFAULT 48,
  required_role VARCHAR(64) NOT NULL DEFAULT 'RECOVERY_SPECIALIST',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_facility_queue_code UNIQUE (facility_id, queue_code)
);

-- 2. Table: recoverable_revenue_work_items
CREATE TABLE IF NOT EXISTS public.recoverable_revenue_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  queue_id UUID NOT NULL REFERENCES public.revenue_recovery_workqueues(id) ON DELETE RESTRICT,
  source_module VARCHAR(64) NOT NULL,
  source_record_id VARCHAR(128) NOT NULL,
  claim_number VARCHAR(128) NOT NULL,
  patient_name VARCHAR(256) NOT NULL,
  payer_name VARCHAR(256) NOT NULL,
  procedure_name VARCHAR(512) NOT NULL,
  gross_recoverable_amount NUMERIC(12, 2) NOT NULL CHECK (gross_recoverable_amount >= 0),
  expected_realizable_yield NUMERIC(12, 2) NOT NULL CHECK (expected_realizable_yield >= 0),
  rops_priority_score NUMERIC(5, 2) NOT NULL CHECK (rops_priority_score >= 0 AND rops_priority_score <= 100),
  priority_tier VARCHAR(64) NOT NULL,
  assigned_specialist_id UUID,
  assigned_specialist_name VARCHAR(256),
  assigned_at TIMESTAMPTZ,
  lifecycle_status VARCHAR(64) NOT NULL DEFAULT 'UNASSIGNED',
  sla_deadline TIMESTAMPTZ NOT NULL,
  sla_status VARCHAR(32) NOT NULL DEFAULT 'ON_SCHEDULE',
  touch_count INTEGER NOT NULL DEFAULT 0,
  last_action_type VARCHAR(64),
  last_action_at TIMESTAMPTZ,
  actual_cash_recovered NUMERIC(12, 2) DEFAULT 0.00,
  recovery_reconciled_at TIMESTAMPTZ,
  dismissal_reason_code VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Table: recoverable_revenue_audit_log
CREATE TABLE IF NOT EXISTS public.recoverable_revenue_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  work_item_id UUID NOT NULL REFERENCES public.recoverable_revenue_work_items(id) ON DELETE CASCADE,
  action_type VARCHAR(64) NOT NULL,
  performed_by_id UUID,
  performed_by_name VARCHAR(256) NOT NULL,
  previous_status VARCHAR(64),
  new_status VARCHAR(64),
  previous_specialist VARCHAR(256),
  new_specialist VARCHAR(256),
  dollar_amount NUMERIC(12, 2),
  action_notes TEXT,
  event_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Indexes for Real-Time Query Performance
CREATE INDEX IF NOT EXISTS idx_rrw_items_facility_status 
  ON public.recoverable_revenue_work_items (facility_id, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_rrw_items_specialist 
  ON public.recoverable_revenue_work_items (facility_id, assigned_specialist_id) 
  WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE');

CREATE INDEX IF NOT EXISTS idx_rrw_items_sla_deadline 
  ON public.recoverable_revenue_work_items (facility_id, sla_deadline, sla_status);

CREATE INDEX IF NOT EXISTS idx_rrw_items_rops 
  ON public.recoverable_revenue_work_items (facility_id, rops_priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_rrw_audit_work_item 
  ON public.recoverable_revenue_audit_log (facility_id, work_item_id, created_at DESC);

-- 5. Operational Views

-- View 1: Active Workqueue Items with Priority & Realized Status
CREATE OR REPLACE VIEW public.vw_recoverable_revenue_workqueue_active AS
SELECT 
  wi.id,
  wi.facility_id,
  wi.queue_id,
  wq.queue_code,
  wq.queue_name,
  wi.source_module,
  wi.source_record_id,
  wi.claim_number,
  wi.patient_name,
  wi.payer_name,
  wi.procedure_name,
  wi.gross_recoverable_amount,
  wi.expected_realizable_yield,
  wi.rops_priority_score,
  wi.priority_tier,
  wi.assigned_specialist_id,
  wi.assigned_specialist_name,
  wi.assigned_at,
  wi.lifecycle_status,
  wi.sla_deadline,
  CASE 
    WHEN wi.lifecycle_status IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE') THEN 'RESOLVED'
    WHEN now() > wi.sla_deadline THEN 'SLA_BREACHED'
    WHEN wi.sla_deadline - now() <= interval '24 hours' THEN 'WARNING_AT_RISK'
    ELSE 'ON_SCHEDULE'
  END AS live_sla_status,
  ROUND(EXTRACT(EPOCH FROM (wi.sla_deadline - now())) / 3600.0, 1) AS hours_until_sla,
  wi.touch_count,
  wi.last_action_type,
  wi.last_action_at,
  wi.actual_cash_recovered,
  wi.recovery_reconciled_at,
  wi.created_at,
  wi.updated_at
FROM public.recoverable_revenue_work_items wi
JOIN public.revenue_recovery_workqueues wq ON wi.queue_id = wq.id;

-- View 2: Workqueue Executive Portfolio Metrics
CREATE OR REPLACE VIEW public.vw_recoverable_revenue_workqueue_metrics AS
SELECT 
  facility_id,
  COUNT(*) AS total_cases,
  COUNT(*) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE')) AS active_cases,
  COALESCE(SUM(gross_recoverable_amount) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE')), 0.00) AS active_gross_recoverable,
  COALESCE(SUM(expected_realizable_yield) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE')), 0.00) AS active_expected_yield,
  COALESCE(SUM(actual_cash_recovered), 0.00) AS total_cash_recovered,
  COUNT(*) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE') AND now() > sla_deadline) AS breached_sla_count,
  COUNT(*) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE') AND sla_deadline - now() <= interval '24 hours' AND now() <= sla_deadline) AS at_risk_sla_count,
  ROUND(
    CASE 
      WHEN COUNT(*) FILTER (WHERE lifecycle_status = 'RECOVERED_RECONCILED') = 0 THEN 100.0
      ELSE (COUNT(*) FILTER (WHERE lifecycle_status = 'RECOVERED_RECONCILED' AND recovery_reconciled_at <= sla_deadline)::numeric / 
            NULLIF(COUNT(*) FILTER (WHERE lifecycle_status = 'RECOVERED_RECONCILED'), 0)::numeric) * 100.0
    END, 
    2
  ) AS sla_compliance_rate_pct
FROM public.recoverable_revenue_work_items
GROUP BY facility_id;

-- View 3: Specialist Capacity & Productivity
CREATE OR REPLACE VIEW public.vw_specialist_workload_summary AS
SELECT 
  facility_id,
  COALESCE(assigned_specialist_name, 'Unassigned') AS specialist_name,
  assigned_specialist_id,
  COUNT(*) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE')) AS active_claims,
  COALESCE(SUM(expected_realizable_yield) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE')), 0.00) AS total_assigned_yield,
  COALESCE(SUM(actual_cash_recovered), 0.00) AS total_cash_recovered,
  COUNT(*) FILTER (WHERE lifecycle_status = 'RECOVERED_RECONCILED') AS resolved_count,
  COUNT(*) FILTER (WHERE lifecycle_status NOT IN ('RECOVERED_RECONCILED', 'CLOSED_UNRECOVERABLE') AND now() > sla_deadline) AS breached_count
FROM public.recoverable_revenue_work_items
GROUP BY facility_id, assigned_specialist_name, assigned_specialist_id;

-- 6. Row Level Security (RLS) Isolation
ALTER TABLE public.revenue_recovery_workqueues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recoverable_revenue_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recoverable_revenue_audit_log ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies for revenue_recovery_workqueues
DROP POLICY IF EXISTS rls_rrw_queues_facility ON public.revenue_recovery_workqueues;
CREATE POLICY rls_rrw_queues_facility ON public.revenue_recovery_workqueues
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 6.2 Policies for recoverable_revenue_work_items
DROP POLICY IF EXISTS rls_rrw_items_facility ON public.recoverable_revenue_work_items;
CREATE POLICY rls_rrw_items_facility ON public.recoverable_revenue_work_items
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 6.3 Policies for recoverable_revenue_audit_log
DROP POLICY IF EXISTS rls_rrw_audit_facility ON public.recoverable_revenue_audit_log;
CREATE POLICY rls_rrw_audit_facility ON public.recoverable_revenue_audit_log
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

