-- ==============================================================================
-- Migration: 082_block_utilization_metrics.sql
-- Phase A5: Block Utilization Metrics, Release Efficiency & Rightsizing Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates block periodic utilization ledgers, governance actions,
--              analytical views for block wastage and opportunity cost, and RLS.
-- ==============================================================================

-- 1. Periodic Block Utilization Ledgers Table
CREATE TABLE IF NOT EXISTS public.or_block_utilization_period_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    block_definition_id UUID NOT NULL REFERENCES public.or_block_definitions(id) ON DELETE CASCADE,
    surgeon_id UUID,
    surgeon_name VARCHAR(255) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    period_type VARCHAR(32) NOT NULL DEFAULT 'MONTHLY', -- WEEKLY, MONTHLY, QUARTERLY
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    allocated_minutes INTEGER NOT NULL,
    utilized_minutes INTEGER NOT NULL DEFAULT 0,
    on_time_released_minutes INTEGER NOT NULL DEFAULT 0,
    late_released_minutes INTEGER NOT NULL DEFAULT 0,
    unused_abandoned_minutes INTEGER NOT NULL DEFAULT 0,
    out_of_block_minutes INTEGER NOT NULL DEFAULT 0,
    adjusted_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    raw_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    release_compliance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    sbpi_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00, -- Surgeon Block Performance Index
    wastage_opportunity_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    rightsizing_action VARCHAR(64) NOT NULL DEFAULT 'MAINTAIN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_or_block_util_period UNIQUE (facility_id, block_definition_id, period_type, period_start)
);

-- 2. Block Rightsizing Governance Actions Table
CREATE TABLE IF NOT EXISTS public.or_block_governance_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    block_definition_id UUID NOT NULL REFERENCES public.or_block_definitions(id) ON DELETE CASCADE,
    action_type VARCHAR(64) NOT NULL, -- RIGHTSIZE_DOWNGRADE, EXPAND_ALLOCATION, PROBATIONARY_NOTICE, SCHEDULE_ADJUSTMENT, VOLUNTARY_CONCESSION
    action_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_COMMITTEE_REVIEW', -- PENDING_COMMITTEE_REVIEW, APPROVED_EXECUTED, REJECTED, APPEAL_SUBMITTED
    effective_date DATE NOT NULL,
    previous_allocation_minutes INTEGER NOT NULL,
    proposed_allocation_minutes INTEGER NOT NULL,
    executive_rationale TEXT,
    approved_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_obupl_facility_block_period ON public.or_block_utilization_period_ledgers (facility_id, block_definition_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_obupl_facility_surgeon ON public.or_block_utilization_period_ledgers (facility_id, surgeon_name);
CREATE INDEX IF NOT EXISTS idx_obupl_facility_action ON public.or_block_utilization_period_ledgers (facility_id, rightsizing_action);
CREATE INDEX IF NOT EXISTS idx_obga_facility_block ON public.or_block_governance_actions (facility_id, block_definition_id);
CREATE INDEX IF NOT EXISTS idx_obga_status ON public.or_block_governance_actions (facility_id, action_status);

-- 4. Analytical View: Block Utilization Summary
CREATE OR REPLACE VIEW public.vw_or_block_utilization_summary AS
SELECT
    l.id AS ledger_id,
    l.facility_id,
    l.block_definition_id,
    b.block_name,
    b.operating_room_id,
    r.room_number,
    r.room_name,
    l.surgeon_name,
    l.specialty_code,
    l.period_type,
    l.period_start,
    l.period_end,
    l.allocated_minutes,
    l.utilized_minutes,
    l.on_time_released_minutes,
    l.late_released_minutes,
    l.unused_abandoned_minutes,
    l.out_of_block_minutes,
    l.adjusted_utilization_pct,
    l.release_compliance_pct,
    l.sbpi_score,
    l.wastage_opportunity_cost,
    l.rightsizing_action
FROM public.or_block_utilization_period_ledgers l
LEFT JOIN public.or_block_definitions b ON l.block_definition_id = b.id
LEFT JOIN public.operating_rooms r ON b.operating_room_id = r.id;

-- 5. Analytical View: Block Wastage & Opportunity Cost Leaderboard
CREATE OR REPLACE VIEW public.vw_or_block_wastage_leaderboard AS
SELECT
    l.facility_id,
    l.surgeon_name,
    l.specialty_code,
    SUM(l.allocated_minutes) AS total_allocated_minutes,
    SUM(l.utilized_minutes) AS total_utilized_minutes,
    SUM(l.unused_abandoned_minutes) AS total_wasted_minutes,
    SUM(l.wastage_opportunity_cost) AS total_opportunity_cost,
    ROUND(AVG(l.adjusted_utilization_pct), 2) AS avg_adjusted_utilization_pct,
    ROUND(AVG(l.release_compliance_pct), 2) AS avg_release_compliance_pct,
    ROUND(AVG(l.sbpi_score), 2) AS avg_sbpi_score
FROM public.or_block_utilization_period_ledgers l
GROUP BY l.facility_id, l.surgeon_name, l.specialty_code
ORDER BY total_opportunity_cost DESC;

-- 6. Row-Level Security (RLS) Multi-Tenancy Enforcement
ALTER TABLE public.or_block_utilization_period_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_block_governance_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_block_utilization_period_ledgers_facility ON public.or_block_utilization_period_ledgers
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_block_governance_actions_facility ON public.or_block_governance_actions
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
