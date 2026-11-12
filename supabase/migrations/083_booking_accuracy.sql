-- ==============================================================================
-- Migration: 083_booking_accuracy.sql
-- Phase A6: Booking Accuracy & Duration Calibration Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates case duration variance tracking, surgeon bias profiles,
--              analytical views for booking accuracy and CPT calibration, and RLS.
-- ==============================================================================

-- 1. Case Booking Accuracy Logs Table
CREATE TABLE IF NOT EXISTS public.or_case_booking_accuracy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_id VARCHAR(64) NOT NULL,
    surgery_date DATE NOT NULL,
    operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE SET NULL,
    surgeon_id UUID,
    surgeon_name VARCHAR(255) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    primary_cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    scheduled_duration_minutes INTEGER NOT NULL,
    actual_in_room_minutes INTEGER NOT NULL,
    duration_variance_minutes INTEGER NOT NULL, -- (actual - scheduled)
    variance_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    accuracy_status VARCHAR(32) NOT NULL, -- 'ACCURATE', 'UNDER_ESTIMATED', 'OVER_ESTIMATED'
    downstream_delay_minutes INTEGER NOT NULL DEFAULT 0,
    caused_room_overtime BOOLEAN NOT NULL DEFAULT FALSE,
    overtime_minutes INTEGER NOT NULL DEFAULT 0,
    historical_median_cpt_minutes INTEGER NOT NULL DEFAULT 0,
    financial_labor_impact NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Surgeon Booking Tendency & Calibration Profiles Table
CREATE TABLE IF NOT EXISTS public.or_surgeon_booking_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id UUID,
    surgeon_name VARCHAR(255) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    evaluated_cases_count INTEGER NOT NULL DEFAULT 0,
    accurate_cases_count INTEGER NOT NULL DEFAULT 0,
    under_estimated_cases_count INTEGER NOT NULL DEFAULT 0,
    over_estimated_cases_count INTEGER NOT NULL DEFAULT 0,
    overall_accuracy_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    mean_duration_bias_minutes NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    scheduling_tendency VARCHAR(32) NOT NULL DEFAULT 'CALIBRATED', -- 'CHRONIC_UNDER_BOOKER', 'CALIBRATED', 'CHRONIC_PADDER'
    total_overrun_minutes INTEGER NOT NULL DEFAULT 0,
    total_idle_gap_minutes INTEGER NOT NULL DEFAULT 0,
    net_financial_delay_impact NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    calibration_action VARCHAR(64) NOT NULL DEFAULT 'MAINTAIN', -- 'MANDATORY_CPT_MEDIAN', 'EXTEND_DEFAULT_TEMPLATE', 'SHRINK_DEFAULT_TEMPLATE', 'MAINTAIN'
    last_reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_or_surgeon_booking_profile UNIQUE (facility_id, surgeon_name)
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_ocbal_facility_date ON public.or_case_booking_accuracy_logs (facility_id, surgery_date);
CREATE INDEX IF NOT EXISTS idx_ocbal_facility_surgeon ON public.or_case_booking_accuracy_logs (facility_id, surgeon_name);
CREATE INDEX IF NOT EXISTS idx_ocbal_facility_status ON public.or_case_booking_accuracy_logs (facility_id, accuracy_status);
CREATE INDEX IF NOT EXISTS idx_ocbal_facility_cpt ON public.or_case_booking_accuracy_logs (facility_id, primary_cpt_code);
CREATE INDEX IF NOT EXISTS idx_osbp_facility_tendency ON public.or_surgeon_booking_profiles (facility_id, scheduling_tendency);

-- 4. Analytical View: Facility Booking Accuracy Summary
CREATE OR REPLACE VIEW public.vw_or_booking_accuracy_facility_summary AS
SELECT
    facility_id,
    COUNT(*) AS total_cases,
    COUNT(*) FILTER (WHERE accuracy_status = 'ACCURATE') AS accurate_cases,
    COUNT(*) FILTER (WHERE accuracy_status = 'UNDER_ESTIMATED') AS under_estimated_cases,
    COUNT(*) FILTER (WHERE accuracy_status = 'OVER_ESTIMATED') AS over_estimated_cases,
    ROUND(
        (COUNT(*) FILTER (WHERE accuracy_status = 'ACCURATE')::NUMERIC / NULLIF(COUNT(*), 0) * 100),
        2
    ) AS overall_accuracy_rate_pct,
    ROUND(AVG(duration_variance_minutes), 2) AS mean_duration_bias_minutes,
    SUM(downstream_delay_minutes) AS total_downstream_delay_minutes,
    SUM(overtime_minutes) AS total_overtime_minutes,
    SUM(financial_labor_impact) AS total_financial_labor_impact
FROM public.or_case_booking_accuracy_logs
GROUP BY facility_id;

-- 5. Analytical View: Surgeon Scheduling Bias Leaderboard
CREATE OR REPLACE VIEW public.vw_or_surgeon_scheduling_bias AS
SELECT
    facility_id,
    surgeon_name,
    specialty_code,
    evaluated_cases_count,
    overall_accuracy_rate_pct,
    mean_duration_bias_minutes,
    scheduling_tendency,
    total_overrun_minutes,
    total_idle_gap_minutes,
    net_financial_delay_impact,
    calibration_action,
    last_reviewed_at
FROM public.or_surgeon_booking_profiles
ORDER BY ABS(mean_duration_bias_minutes) DESC;

-- 6. Row-Level Security (RLS) Multi-Tenancy Enforcement
ALTER TABLE public.or_case_booking_accuracy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_surgeon_booking_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_case_booking_accuracy_logs_facility ON public.or_case_booking_accuracy_logs
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_surgeon_booking_profiles_facility ON public.or_surgeon_booking_profiles
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
