-- ==============================================================================
-- Migration: 084_turnover_metrics.sql
-- Phase A7: Turnover Metrics & Benchmark Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates operating room turnover tracking, specialty benchmarks,
--              analytical views for turnover performance and delay attribution, and RLS.
-- ==============================================================================

-- 1. Operating Room Turnover Events Table
CREATE TABLE IF NOT EXISTS public.or_turnover_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL,
    surgery_date DATE NOT NULL,
    prior_case_id VARCHAR(64) NOT NULL,
    prior_surgeon_name VARCHAR(255) NOT NULL,
    prior_specialty_code VARCHAR(64) NOT NULL,
    prior_procedure_name VARCHAR(255) NOT NULL,
    next_case_id VARCHAR(64) NOT NULL,
    next_surgeon_name VARCHAR(255) NOT NULL,
    next_specialty_code VARCHAR(64) NOT NULL,
    next_procedure_name VARCHAR(255) NOT NULL,
    turnover_type VARCHAR(32) NOT NULL DEFAULT 'SAME_SURGEON', -- 'SAME_SURGEON', 'DIFFERENT_SURGEON'
    prior_wheels_out_time TIMESTAMPTZ NOT NULL,
    clean_start_time TIMESTAMPTZ,
    clean_complete_time TIMESTAMPTZ,
    setup_ready_time TIMESTAMPTZ,
    next_wheels_in_time TIMESTAMPTZ NOT NULL,
    actual_turnover_minutes INTEGER NOT NULL,
    benchmark_target_minutes INTEGER NOT NULL,
    turnover_variance_minutes INTEGER NOT NULL, -- (actual - benchmark)
    turnover_status VARCHAR(32) NOT NULL, -- 'COMPLIANT', 'MINOR_DELAY', 'PROLONGED_TURNOVER'
    delay_reason_code VARCHAR(64), -- EVS_CLEANING_DELAY, SURGEON_UNAVAILABLE, etc.
    delay_description TEXT,
    financial_idle_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    excess_delay_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Operating Room Specialty Turnover Benchmarks Table
CREATE TABLE IF NOT EXISTS public.or_turnover_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_code VARCHAR(64) NOT NULL,
    same_surgeon_benchmark_minutes INTEGER NOT NULL DEFAULT 20,
    different_surgeon_benchmark_minutes INTEGER NOT NULL DEFAULT 35,
    warning_threshold_minutes INTEGER NOT NULL DEFAULT 10,
    hourly_run_rate_cost NUMERIC(10, 2) NOT NULL DEFAULT 650.00,
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_or_turnover_benchmark UNIQUE (facility_id, specialty_code)
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_ote_facility_date ON public.or_turnover_events (facility_id, surgery_date);
CREATE INDEX IF NOT EXISTS idx_ote_facility_room ON public.or_turnover_events (facility_id, operating_room_id);
CREATE INDEX IF NOT EXISTS idx_ote_facility_status ON public.or_turnover_events (facility_id, turnover_status);
CREATE INDEX IF NOT EXISTS idx_ote_facility_delay_code ON public.or_turnover_events (facility_id, delay_reason_code);
CREATE INDEX IF NOT EXISTS idx_otb_facility_specialty ON public.or_turnover_benchmarks (facility_id, specialty_code);

-- 4. Analytical View: Facility Turnover Performance Summary
CREATE OR REPLACE VIEW public.vw_or_turnover_facility_summary AS
SELECT
    facility_id,
    COUNT(*) AS total_turnovers,
    COUNT(*) FILTER (WHERE turnover_type = 'SAME_SURGEON') AS same_surgeon_count,
    COUNT(*) FILTER (WHERE turnover_type = 'DIFFERENT_SURGEON') AS different_surgeon_count,
    ROUND(AVG(actual_turnover_minutes), 1) AS avg_turnover_minutes,
    ROUND(AVG(actual_turnover_minutes) FILTER (WHERE turnover_type = 'SAME_SURGEON'), 1) AS avg_same_surgeon_minutes,
    ROUND(AVG(actual_turnover_minutes) FILTER (WHERE turnover_type = 'DIFFERENT_SURGEON'), 1) AS avg_different_surgeon_minutes,
    COUNT(*) FILTER (WHERE turnover_status = 'COMPLIANT') AS compliant_turnovers,
    ROUND(
        (COUNT(*) FILTER (WHERE turnover_status = 'COMPLIANT')::NUMERIC / NULLIF(COUNT(*), 0) * 100),
        1
    ) AS compliance_rate_pct,
    COUNT(*) FILTER (WHERE turnover_status = 'PROLONGED_TURNOVER') AS prolonged_turnovers,
    ROUND(
        (COUNT(*) FILTER (WHERE turnover_status = 'PROLONGED_TURNOVER')::NUMERIC / NULLIF(COUNT(*), 0) * 100),
        1
    ) AS prolonged_rate_pct,
    SUM(CASE WHEN turnover_variance_minutes > 0 THEN turnover_variance_minutes ELSE 0 END) AS total_delay_minutes,
    SUM(financial_idle_cost) AS total_idle_cost,
    SUM(excess_delay_cost) AS total_excess_delay_cost
FROM public.or_turnover_events
GROUP BY facility_id;

-- 5. Analytical View: Turnover Delay Root Cause Pareto Analysis
CREATE OR REPLACE VIEW public.vw_or_turnover_delay_attribution AS
SELECT
    facility_id,
    COALESCE(delay_reason_code, 'NO_DELAY_REPORTED') AS delay_reason_code,
    COUNT(*) AS incident_count,
    SUM(CASE WHEN turnover_variance_minutes > 0 THEN turnover_variance_minutes ELSE 0 END) AS total_delay_minutes,
    ROUND(AVG(actual_turnover_minutes), 1) AS avg_turnover_minutes,
    SUM(excess_delay_cost) AS total_excess_cost
FROM public.or_turnover_events
WHERE turnover_variance_minutes > 0
GROUP BY facility_id, delay_reason_code
ORDER BY total_delay_minutes DESC;

-- 6. Row-Level Security (RLS) Multi-Tenancy Enforcement
ALTER TABLE public.or_turnover_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_turnover_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_turnover_events_facility ON public.or_turnover_events
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_turnover_benchmarks_facility ON public.or_turnover_benchmarks
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

