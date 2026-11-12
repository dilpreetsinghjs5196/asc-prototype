-- ==============================================================================
-- Migration: 079_block_schedule_model.sql
-- Phase A2: Block Schedule Model & Allocation Architecture
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Tenancy: Enforced Facility Isolation via current_setting('app.current_facility_id', true)
-- Description: Core tables, indexes, views, and RLS policies for operating room block
--              schedules, ownership tiers, recurrence patterns, clinical specialty
--              alignment, auto-release lead-time parameters, and allocation governance.
-- ==============================================================================

-- 1. Table: or_block_definitions (Master Block Allocations)
CREATE TABLE IF NOT EXISTS public.or_block_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  block_name VARCHAR(150) NOT NULL,
  owner_type VARCHAR(64) NOT NULL DEFAULT 'INDIVIDUAL_SURGEON'
    CHECK (owner_type IN ('INDIVIDUAL_SURGEON', 'SURGICAL_GROUP', 'SERVICE_LINE', 'OPEN_TIME')),
  surgeon_id BIGINT REFERENCES public.surgeons(id) ON DELETE SET NULL,
  owner_name VARCHAR(256) NOT NULL,
  specialty_code VARCHAR(64) NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  recurrence_type VARCHAR(64) NOT NULL DEFAULT 'WEEKLY'
    CHECK (recurrence_type IN ('WEEKLY', 'EVERY_OTHER_WEEK_A', 'EVERY_OTHER_WEEK_B', 'MONTHLY_1ST', 'MONTHLY_2ND', 'MONTHLY_3RD', 'MONTHLY_4TH', 'ONE_TIME')),
  start_time TIME NOT NULL DEFAULT '07:00:00',
  end_time TIME NOT NULL DEFAULT '15:00:00',
  allocated_minutes INTEGER NOT NULL CHECK (allocated_minutes > 0),
  auto_release_lead_days INTEGER NOT NULL DEFAULT 5 CHECK (auto_release_lead_days >= 0),
  auto_release_lead_hours INTEGER NOT NULL DEFAULT 120 CHECK (auto_release_lead_hours >= 0),
  target_utilization_pct NUMERIC(5, 2) NOT NULL DEFAULT 75.00 CHECK (target_utilization_pct >= 0 AND target_utilization_pct <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT chk_block_time_window CHECK (end_time > start_time)
);

-- 2. Indexes for fast query lookup
CREATE INDEX IF NOT EXISTS idx_obd_facility_room_day 
  ON public.or_block_definitions (facility_id, operating_room_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_obd_facility_owner 
  ON public.or_block_definitions (facility_id, owner_type, surgeon_id);

CREATE INDEX IF NOT EXISTS idx_obd_facility_specialty 
  ON public.or_block_definitions (facility_id, specialty_code);

-- 3. Analytical Views
CREATE OR REPLACE VIEW public.vw_or_block_definitions_active AS
SELECT 
  b.id AS block_id,
  b.facility_id,
  b.operating_room_id,
  r.room_number,
  COALESCE(r.room_name, 'OR ' || r.room_number) AS room_name,
  r.suite_designation,
  b.block_name,
  b.owner_type,
  b.surgeon_id,
  b.owner_name,
  b.specialty_code,
  b.day_of_week,
  b.recurrence_type,
  b.start_time,
  b.end_time,
  b.allocated_minutes,
  ROUND(b.allocated_minutes::NUMERIC / 60.0, 2) AS allocated_hours,
  b.auto_release_lead_days,
  b.auto_release_lead_hours,
  b.target_utilization_pct,
  b.is_active
FROM public.or_block_definitions b
JOIN public.operating_rooms r ON r.id = b.operating_room_id
WHERE b.is_active = TRUE AND r.is_active = TRUE;

CREATE OR REPLACE VIEW public.vw_or_block_capacity_summary AS
SELECT 
  facility_id,
  COUNT(DISTINCT id) AS total_active_blocks,
  COUNT(DISTINCT operating_room_id) AS blocked_rooms_count,
  SUM(allocated_minutes) AS total_blocked_minutes,
  ROUND(SUM(allocated_minutes)::NUMERIC / 60.0, 1) AS total_blocked_hours,
  ROUND(AVG(target_utilization_pct), 1) AS avg_target_utilization_pct,
  COUNT(DISTINCT owner_name) AS unique_owners_count
FROM public.or_block_definitions
WHERE is_active = TRUE
GROUP BY facility_id;

-- 4. Row Level Security (RLS) Isolation
ALTER TABLE public.or_block_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_or_block_definitions_facility ON public.or_block_definitions;
CREATE POLICY rls_or_block_definitions_facility ON public.or_block_definitions
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

