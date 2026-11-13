-- ==============================================================================
-- Migration: 086_recoverable_capacity.sql
-- Phase A9: Recoverable Capacity & Opportunity Value Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates recoverable capacity slots, specialty actionability thresholds,
--              analytical views, and multi-tenant RLS policies.
-- ==============================================================================

-- 1. Recoverable Capacity Slots Table
CREATE TABLE IF NOT EXISTS public.or_recoverable_capacity_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INTEGER NOT NULL,
    is_actionable BOOLEAN NOT NULL DEFAULT FALSE,
    actionability_tier VARCHAR(32) NOT NULL DEFAULT 'FRAGMENTED_STRANDED', -- 'PRIME_ACTIONABLE_BLOCK', 'MARGINAL_SLOT', 'FRAGMENTED_STRANDED'
    lead_time_days NUMERIC(4, 1) NOT NULL DEFAULT 0.0,
    lead_time_hours INTEGER NOT NULL DEFAULT 0,
    recovery_pathway VARCHAR(32) NOT NULL DEFAULT 'UNRECOVERABLE_FRAGMENT', -- 'CASE_BACKFILL', 'LABOR_DOWNSTAFFING', 'UNRECOVERABLE_FRAGMENT'
    recovery_status VARCHAR(32) NOT NULL DEFAULT 'IDENTIFIED', -- 'IDENTIFIED', 'BACKFILL_PROPOSED', 'DOWNSTAFFING_INITIATED', 'RECOVERED', 'EXPIRED_UNACTIONED'
    assigned_specialty_code VARCHAR(64),
    assigned_case_id VARCHAR(64),
    potential_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avoided_labor_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    net_recoverable_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    action_notes TEXT,
    actioned_by_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Capacity Actionability Thresholds Table
CREATE TABLE IF NOT EXISTS public.or_capacity_actionability_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(64) NOT NULL,
    min_viable_case_duration_minutes INTEGER NOT NULL DEFAULT 90,
    min_lead_time_hours INTEGER NOT NULL DEFAULT 48,
    hourly_contribution_margin NUMERIC(10, 2) NOT NULL DEFAULT 1250.00,
    hourly_downstaffing_rate NUMERIC(10, 2) NOT NULL DEFAULT 175.00,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_or_capacity_threshold UNIQUE (facility_id, specialty_code)
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_orcs_facility_date ON public.or_recoverable_capacity_slots (facility_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_orcs_facility_actionable ON public.or_recoverable_capacity_slots (facility_id, is_actionable);
CREATE INDEX IF NOT EXISTS idx_orcs_facility_status ON public.or_recoverable_capacity_slots (facility_id, recovery_status);
CREATE INDEX IF NOT EXISTS idx_orcs_facility_tier ON public.or_recoverable_capacity_slots (facility_id, actionability_tier);
CREATE INDEX IF NOT EXISTS idx_ocat_facility_specialty ON public.or_capacity_actionability_thresholds (facility_id, specialty_code);

-- 4. Analytical View: Facility Recoverable Capacity Summary
CREATE OR REPLACE VIEW public.vw_or_recoverable_capacity_facility_summary AS
SELECT
    facility_id,
    COUNT(*) AS total_unused_slots,
    SUM(slot_duration_minutes) AS total_unused_minutes,
    ROUND(SUM(slot_duration_minutes) / 60.0, 1) AS total_unused_hours,
    COUNT(*) FILTER (WHERE is_actionable = TRUE) AS actionable_slots_count,
    SUM(CASE WHEN is_actionable = TRUE THEN slot_duration_minutes ELSE 0 END) AS actionable_minutes,
    ROUND(SUM(CASE WHEN is_actionable = TRUE THEN slot_duration_minutes ELSE 0 END) / 60.0, 1) AS actionable_hours,
    ROUND(
        (SUM(CASE WHEN is_actionable = TRUE THEN slot_duration_minutes ELSE 0 END)::NUMERIC / NULLIF(SUM(slot_duration_minutes), 0) * 100),
        1
    ) AS actionability_ratio_pct,
    ROUND(SUM(CASE WHEN is_actionable = FALSE THEN slot_duration_minutes ELSE 0 END) / 60.0, 1) AS fragmented_wastage_hours,
    SUM(potential_contribution_margin) AS total_potential_backfill_margin,
    SUM(avoided_labor_cost) AS total_potential_labor_savings,
    SUM(net_recoverable_value) AS total_net_recoverable_value
FROM public.or_recoverable_capacity_slots
GROUP BY facility_id;

-- 5. Analytical View: Actionable Slots Forward Horizon
CREATE OR REPLACE VIEW public.vw_or_actionable_slots_horizon AS
SELECT
    s.id AS slot_id,
    s.facility_id,
    s.operating_room_id,
    r.room_number,
    r.room_name,
    s.slot_date,
    s.start_time,
    s.end_time,
    s.slot_duration_minutes,
    s.actionability_tier,
    s.lead_time_days,
    s.lead_time_hours,
    s.recovery_pathway,
    s.recovery_status,
    s.potential_contribution_margin,
    s.avoided_labor_cost,
    s.net_recoverable_value,
    s.action_notes
FROM public.or_recoverable_capacity_slots s
LEFT JOIN public.operating_rooms r ON s.operating_room_id = r.id
WHERE s.is_actionable = TRUE
ORDER BY s.slot_date ASC, s.start_time ASC;

-- 6. Row-Level Security (RLS) Multi-Tenancy Enforcement
ALTER TABLE public.or_recoverable_capacity_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_capacity_actionability_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_recoverable_capacity_slots_facility ON public.or_recoverable_capacity_slots
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_capacity_actionability_thresholds_facility ON public.or_capacity_actionability_thresholds
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

