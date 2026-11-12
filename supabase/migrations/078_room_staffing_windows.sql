-- ==============================================================================
-- Migration: 078_room_staffing_windows.sql
-- Phase A1: Room Staffing Windows, Closures & Denominator Rules
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Tenancy: Enforced Facility Isolation via current_setting('app.current_facility_id', true)
-- Description: Core tables, indexes, views, and RLS policies for recurring staffed
--              operating room windows, planned room closures, ad-hoc staffing exceptions,
--              and authoritative utilization denominator calculations.
-- ==============================================================================

-- 1. Table: room_staffing_windows (Recurring Day-of-Week Operating Shifts)
CREATE TABLE IF NOT EXISTS public.room_staffing_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday, ..., 6=Saturday
  shift_name VARCHAR(100) NOT NULL DEFAULT 'Standard Surgical Day',
  start_time TIME NOT NULL DEFAULT '07:00:00',
  end_time TIME NOT NULL DEFAULT '17:00:00',
  gross_staffed_minutes INTEGER NOT NULL CHECK (gross_staffed_minutes > 0),
  circulator_rn_count INTEGER NOT NULL DEFAULT 1 CHECK (circulator_rn_count >= 1),
  scrub_tech_count INTEGER NOT NULL DEFAULT 1 CHECK (scrub_tech_count >= 1),
  anesthesia_provider_count INTEGER NOT NULL DEFAULT 1 CHECK (anesthesia_provider_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT uq_room_day_shift UNIQUE (operating_room_id, day_of_week, shift_name),
  CONSTRAINT chk_shift_time_window CHECK (end_time > start_time)
);

-- 2. Table: room_closure_events (Planned Shutdowns, Holidays & Maintenance)
CREATE TABLE IF NOT EXISTS public.room_closure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID REFERENCES public.operating_rooms(id) ON DELETE CASCADE, -- NULL = facility-wide closure
  closure_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  closure_type VARCHAR(64) NOT NULL DEFAULT 'FACILITY_HOLIDAY'
    CHECK (closure_type IN ('FACILITY_HOLIDAY', 'PLANNED_MAINTENANCE', 'HVAC_CERTIFICATION', 'STAFF_TRAINING', 'STAFFING_SHORTAGE', 'EMERGENCY_REPAIR')),
  reason TEXT NOT NULL,
  deducted_denominator_minutes INTEGER NOT NULL CHECK (deducted_denominator_minutes > 0),
  is_all_day BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Table: room_staffing_exceptions (Ad-Hoc Extensions & Schedule Adjustments)
CREATE TABLE IF NOT EXISTS public.room_staffing_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(64) NOT NULL DEFAULT 'OVERTIME_EXTENSION'
    CHECK (exception_type IN ('EARLY_START', 'OVERTIME_EXTENSION', 'PARTIAL_CLOSURE', 'CREW_AUGMENTATION')),
  adjusted_start_time TIME,
  adjusted_end_time TIME,
  adjustment_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  is_overtime_burden BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_rsw_facility_room_day 
  ON public.room_staffing_windows (facility_id, operating_room_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_rce_facility_date 
  ON public.room_closure_events (facility_id, closure_date);

CREATE INDEX IF NOT EXISTS idx_rse_facility_date 
  ON public.room_staffing_exceptions (facility_id, exception_date);

-- 5. Analytical Views
-- View 1: Weekly Staffing Schedule Matrix with Room Details
CREATE OR REPLACE VIEW public.vw_room_staffing_weekly_matrix AS
SELECT 
  w.id AS window_id,
  w.facility_id,
  w.operating_room_id,
  r.room_number,
  COALESCE(r.room_name, 'OR ' || r.room_number) AS room_name,
  r.suite_designation,
  w.day_of_week,
  w.shift_name,
  w.start_time,
  w.end_time,
  w.gross_staffed_minutes,
  ROUND(w.gross_staffed_minutes::NUMERIC / 60.0, 2) AS gross_staffed_hours,
  w.circulator_rn_count,
  w.scrub_tech_count,
  w.anesthesia_provider_count,
  w.is_active
FROM public.room_staffing_windows w
JOIN public.operating_rooms r ON r.id = w.operating_room_id
WHERE w.is_active = TRUE AND r.is_active = TRUE;

-- View 2: Facility Staffed Capacity Summary
CREATE OR REPLACE VIEW public.vw_room_staffed_capacity_summary AS
SELECT 
  facility_id,
  COUNT(DISTINCT operating_room_id) AS staffed_rooms_count,
  SUM(gross_staffed_minutes) AS weekly_gross_staffed_minutes,
  ROUND(SUM(gross_staffed_minutes)::NUMERIC / 60.0, 1) AS weekly_gross_staffed_hours,
  ROUND(AVG(gross_staffed_minutes)::NUMERIC / 60.0, 1) AS avg_daily_shift_hours,
  COUNT(*) AS total_weekly_shifts
FROM public.room_staffing_windows
WHERE is_active = TRUE
GROUP BY facility_id;

-- 6. Row Level Security (RLS) Isolation
ALTER TABLE public.room_staffing_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_closure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_staffing_exceptions ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies for room_staffing_windows
DROP POLICY IF EXISTS rls_rsw_facility ON public.room_staffing_windows;
CREATE POLICY rls_rsw_facility ON public.room_staffing_windows
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 6.2 Policies for room_closure_events
DROP POLICY IF EXISTS rls_rce_facility ON public.room_closure_events;
CREATE POLICY rls_rce_facility ON public.room_closure_events
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 6.3 Policies for room_staffing_exceptions
DROP POLICY IF EXISTS rls_rse_facility ON public.room_staffing_exceptions;
CREATE POLICY rls_rse_facility ON public.room_staffing_exceptions
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

