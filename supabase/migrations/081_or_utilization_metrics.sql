-- ==============================================================================
-- Migration: 081_or_utilization_metrics.sql
-- Phase A4: OR Utilization Metrics & Benchmarking Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates daily OR room utilization snapshots, surgeon block
--              utilization compliance ledgers, analytical views, and RLS policies.
-- ==============================================================================

-- 1. Daily Operating Room Utilization Snapshots Table
CREATE TABLE IF NOT EXISTS public.or_utilization_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
    utilization_date DATE NOT NULL,
    staffed_minutes INTEGER NOT NULL DEFAULT 0,
    prime_time_staffed_minutes INTEGER NOT NULL DEFAULT 480, -- 07:00 to 15:00
    in_room_case_minutes INTEGER NOT NULL DEFAULT 0,         -- Wheels-in to Wheels-out
    turnover_minutes INTEGER NOT NULL DEFAULT 0,             -- Between-case changeover
    prime_time_case_minutes INTEGER NOT NULL DEFAULT 0,      -- Within 07:00-15:00 window
    overtime_minutes INTEGER NOT NULL DEFAULT 0,             -- Running past staffed shift
    unutilized_staffed_minutes INTEGER NOT NULL DEFAULT 0,   -- Idle staffed capacity
    raw_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    turnover_inclusive_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    prime_time_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    case_count INTEGER NOT NULL DEFAULT 0,
    delayed_starts_count INTEGER NOT NULL DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    calculation_version VARCHAR(32) NOT NULL DEFAULT 'v1.0-deterministic',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_or_utilization_facility_room_date UNIQUE (facility_id, operating_room_id, utilization_date)
);

-- 2. Surgeon Block Utilization & Compliance Snapshots Table
CREATE TABLE IF NOT EXISTS public.or_surgeon_block_utilization_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    block_definition_id UUID NOT NULL REFERENCES public.or_block_definitions(id) ON DELETE CASCADE,
    surgeon_id UUID,
    surgeon_name VARCHAR(255) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    reporting_period_start DATE NOT NULL,
    reporting_period_end DATE NOT NULL,
    allocated_block_minutes INTEGER NOT NULL,
    on_time_released_minutes INTEGER NOT NULL DEFAULT 0,
    late_released_minutes INTEGER NOT NULL DEFAULT 0,
    net_adjusted_denominator_minutes INTEGER NOT NULL,
    utilized_in_block_minutes INTEGER NOT NULL DEFAULT 0,
    utilized_out_of_block_minutes INTEGER NOT NULL DEFAULT 0,
    block_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    target_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 75.00,
    utilization_tier VARCHAR(32) NOT NULL, -- EXCEEDS_BENCHMARK, MEETS_BENCHMARK, UNDERUTILIZED_WARNING, CRITICAL_UNDERUTILIZATION
    total_cases_performed INTEGER NOT NULL DEFAULT 0,
    net_revenue_generated NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contribution_margin_generated NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    rightsizing_recommendation VARCHAR(64) NOT NULL DEFAULT 'MAINTAIN_BLOCK',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_ouds_facility_room_date ON public.or_utilization_daily_snapshots (facility_id, operating_room_id, utilization_date);
CREATE INDEX IF NOT EXISTS idx_ouds_facility_date ON public.or_utilization_daily_snapshots (facility_id, utilization_date);
CREATE INDEX IF NOT EXISTS idx_osbus_facility_block ON public.or_surgeon_block_utilization_snapshots (facility_id, block_definition_id);
CREATE INDEX IF NOT EXISTS idx_osbus_surgeon_period ON public.or_surgeon_block_utilization_snapshots (facility_id, surgeon_name, reporting_period_start, reporting_period_end);

-- 4. Analytical View: Facility Summary Utilization
CREATE OR REPLACE VIEW public.vw_or_utilization_facility_summary AS
SELECT
    facility_id,
    DATE_TRUNC('month', utilization_date)::DATE AS reporting_month,
    COUNT(DISTINCT operating_room_id) AS active_rooms_count,
    COUNT(DISTINCT utilization_date) AS operating_days_count,
    SUM(staffed_minutes) AS total_staffed_minutes,
    SUM(in_room_case_minutes) AS total_in_room_minutes,
    SUM(turnover_minutes) AS total_turnover_minutes,
    SUM(prime_time_case_minutes) AS total_prime_time_case_minutes,
    SUM(overtime_minutes) AS total_overtime_minutes,
    SUM(case_count) AS total_cases_performed,
    CASE 
        WHEN SUM(staffed_minutes) > 0 
        THEN ROUND((SUM(in_room_case_minutes)::NUMERIC / SUM(staffed_minutes)::NUMERIC) * 100, 2)
        ELSE 0.00 
    END AS facility_raw_utilization_pct,
    CASE 
        WHEN SUM(staffed_minutes) > 0 
        THEN ROUND(((SUM(in_room_case_minutes) + SUM(turnover_minutes))::NUMERIC / SUM(staffed_minutes)::NUMERIC) * 100, 2)
        ELSE 0.00 
    END AS facility_turnover_inclusive_pct,
    CASE 
        WHEN SUM(prime_time_staffed_minutes) > 0 
        THEN ROUND((SUM(prime_time_case_minutes)::NUMERIC / SUM(prime_time_staffed_minutes)::NUMERIC) * 100, 2)
        ELSE 0.00 
    END AS facility_prime_time_utilization_pct
FROM public.or_utilization_daily_snapshots
GROUP BY facility_id, DATE_TRUNC('month', utilization_date)::DATE;

-- 5. Analytical View: Surgeon Block Compliance Scorecard
CREATE OR REPLACE VIEW public.vw_or_surgeon_block_compliance AS
SELECT
    s.id AS snapshot_id,
    s.facility_id,
    s.block_definition_id,
    b.block_name,
    s.surgeon_name,
    s.specialty_code,
    s.reporting_period_start,
    s.reporting_period_end,
    s.allocated_block_minutes,
    s.on_time_released_minutes,
    s.late_released_minutes,
    s.net_adjusted_denominator_minutes,
    s.utilized_in_block_minutes,
    s.block_utilization_pct,
    s.target_utilization_pct,
    s.utilization_tier,
    s.rightsizing_recommendation,
    s.total_cases_performed,
    s.net_revenue_generated,
    s.contribution_margin_generated,
    CASE 
        WHEN s.net_adjusted_denominator_minutes > 0
        THEN ROUND((s.contribution_margin_generated / (s.net_adjusted_denominator_minutes::NUMERIC / 60.0)), 2)
        ELSE 0.00
    END AS margin_per_block_hour
FROM public.or_surgeon_block_utilization_snapshots s
LEFT JOIN public.or_block_definitions b ON s.block_definition_id = b.id;

-- 6. Row-Level Security (RLS) Multi-Tenancy Enforcement
ALTER TABLE public.or_utilization_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_surgeon_block_utilization_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_utilization_daily_snapshots_facility ON public.or_utilization_daily_snapshots
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_surgeon_block_utilization_facility ON public.or_surgeon_block_utilization_snapshots
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

