-- ==============================================================================
-- Migration: 080_block_release_events.sql
-- Phase A3: Block Release Events & Open-Pool Reallocation Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Tenancy: Enforced Facility Isolation via current_setting('app.current_facility_id', true)
-- Description: Core tables, indexes, views, and RLS policies for tracking single-date
--              block surrender events, lead-time timeliness calculation, open-pool
--              reallocation tracking, and downstaffing labor cost recovery.
-- ==============================================================================

-- 1. Table: or_block_release_events (Surrendered Block Time)
CREATE TABLE IF NOT EXISTS public.or_block_release_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  block_definition_id UUID NOT NULL REFERENCES public.or_block_definitions(id) ON DELETE CASCADE,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  surgery_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  released_minutes INTEGER NOT NULL CHECK (released_minutes > 0),
  release_trigger VARCHAR(64) NOT NULL DEFAULT 'VOLUNTARY_SURGEON'
    CHECK (release_trigger IN ('VOLUNTARY_SURGEON', 'AUTO_RELEASE_EXPIRATION', 'ADMINISTRATIVE_OVERRIDE', 'FACILITY_CLOSURE')),
  release_reason_code VARCHAR(64) NOT NULL DEFAULT 'PHYSICIAN_VACATION'
    CHECK (release_reason_code IN (
      'PHYSICIAN_VACATION', 
      'CME_CONFERENCE', 
      'LOW_CASE_VOLUME', 
      'EMERGENCY_MEDICAL_LEAVE', 
      'AUTO_EXPIRATION_UNBOOKED', 
      'FACILITY_MAINTENANCE_CLOSURE', 
      'CHRONIC_UNDERUTILIZATION_OVERRIDE', 
      'OTHER_ADMINISTRATIVE'
    )),
  release_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  lead_time_hours NUMERIC(7, 2) NOT NULL,
  timeliness_status VARCHAR(32) NOT NULL DEFAULT 'ON_TIME'
    CHECK (timeliness_status IN ('ON_TIME', 'LATE_RELEASE', 'SAME_DAY_RELEASE')),
  reallocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN_POOL'
    CHECK (reallocation_status IN ('OPEN_POOL', 'PARTIALLY_REALLOCATED', 'FULLY_REALLOCATED', 'ROOM_DOWNSTAFFED', 'EXPIRED_UNUTILIZED')),
  reallocated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (reallocated_minutes >= 0),
  downstaffed_savings_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  released_by_user_id UUID,
  released_by_name VARCHAR(256) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_release_time_window CHECK (end_time > start_time),
  CONSTRAINT chk_reallocated_bounds CHECK (reallocated_minutes <= released_minutes)
);

-- 2. Table: or_block_reallocations (Cases Booked into Released Open Pool)
CREATE TABLE IF NOT EXISTS public.or_block_reallocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  release_event_id UUID NOT NULL REFERENCES public.or_block_release_events(id) ON DELETE CASCADE,
  recipient_surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL,
  recipient_surgeon_name VARCHAR(256) NOT NULL,
  specialty_code VARCHAR(64) NOT NULL,
  case_id BIGINT,
  patient_name VARCHAR(256),
  procedure_name VARCHAR(512),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  reallocated_minutes INTEGER NOT NULL CHECK (reallocated_minutes > 0),
  reallocation_timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  reallocated_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_realloc_time_window CHECK (end_time > start_time)
);

-- 3. Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_obre_facility_date 
  ON public.or_block_release_events (facility_id, surgery_date);

CREATE INDEX IF NOT EXISTS idx_obre_block_def 
  ON public.or_block_release_events (facility_id, block_definition_id);

CREATE INDEX IF NOT EXISTS idx_obre_status 
  ON public.or_block_release_events (facility_id, reallocation_status, timeliness_status);

CREATE INDEX IF NOT EXISTS idx_obreal_release_event 
  ON public.or_block_reallocations (facility_id, release_event_id);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_or_block_releases_active AS
SELECT 
  r.id AS release_event_id,
  r.facility_id,
  r.block_definition_id,
  b.block_name,
  b.owner_name AS original_owner_name,
  b.owner_type AS original_owner_type,
  b.specialty_code AS original_specialty,
  b.auto_release_lead_hours AS required_lead_hours,
  r.operating_room_id,
  room.room_number,
  COALESCE(room.room_name, 'OR ' || room.room_number) AS room_name,
  r.surgery_date,
  r.start_time,
  r.end_time,
  r.released_minutes,
  ROUND(r.released_minutes::NUMERIC / 60.0, 2) AS released_hours,
  r.release_trigger,
  r.release_reason_code,
  r.release_timestamp,
  r.lead_time_hours,
  r.timeliness_status,
  r.reallocation_status,
  r.reallocated_minutes,
  ROUND(r.reallocated_minutes::NUMERIC / 60.0, 2) AS reallocated_hours,
  ROUND((r.released_minutes - r.reallocated_minutes)::NUMERIC / 60.0, 2) AS remaining_open_hours,
  r.downstaffed_savings_amount,
  r.released_by_name,
  r.notes
FROM public.or_block_release_events r
JOIN public.or_block_definitions b ON b.id = r.block_definition_id
JOIN public.operating_rooms room ON room.id = r.operating_room_id;

CREATE OR REPLACE VIEW public.vw_or_block_release_kpis AS
SELECT 
  facility_id,
  COUNT(id) AS total_releases_count,
  SUM(released_minutes) AS total_released_minutes,
  ROUND(SUM(released_minutes)::NUMERIC / 60.0, 1) AS total_released_hours,
  COUNT(CASE WHEN timeliness_status = 'ON_TIME' THEN 1 END) AS on_time_releases_count,
  ROUND(
    (COUNT(CASE WHEN timeliness_status = 'ON_TIME' THEN 1 END)::NUMERIC / NULLIF(COUNT(id), 0)::NUMERIC) * 100.0, 
    1
  ) AS on_time_release_rate_pct,
  SUM(reallocated_minutes) AS total_reallocated_minutes,
  ROUND(SUM(reallocated_minutes)::NUMERIC / 60.0, 1) AS total_reallocated_hours,
  ROUND(
    (SUM(reallocated_minutes)::NUMERIC / NULLIF(SUM(released_minutes), 0)::NUMERIC) * 100.0, 
    1
  ) AS reallocation_rate_pct,
  SUM(downstaffed_savings_amount) AS total_downstaffed_savings_amount,
  COUNT(CASE WHEN reallocation_status = 'OPEN_POOL' THEN 1 END) AS pending_open_pool_count
FROM public.or_block_release_events
GROUP BY facility_id;

-- 5. Row Level Security (RLS) Isolation
ALTER TABLE public.or_block_release_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_or_block_release_events_facility ON public.or_block_release_events;
CREATE POLICY rls_or_block_release_events_facility ON public.or_block_release_events
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

ALTER TABLE public.or_block_reallocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_or_block_reallocations_facility ON public.or_block_reallocations;
CREATE POLICY rls_or_block_reallocations_facility ON public.or_block_reallocations
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

