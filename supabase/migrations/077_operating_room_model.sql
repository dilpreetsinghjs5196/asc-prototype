-- ==============================================================================
-- Migration: 077_operating_room_model.sql
-- Phase A0: Operating Room Model & Physical Asset Architecture
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Tenancy: Enforced Facility Isolation via current_setting('app.current_facility_id', true)
-- Description: Physical and technical attributes of Operating Rooms, surgical suites,
--              clinical specialty compatibility, fixed/boom equipment inventory,
--              HVAC cleanroom ratings, turnover targets, and audit status events.
-- ==============================================================================

-- 1. Table: operating_rooms
CREATE TABLE IF NOT EXISTS public.operating_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  room_number VARCHAR(64) NOT NULL,
  room_name VARCHAR(128) NOT NULL,
  suite_designation VARCHAR(128) NOT NULL DEFAULT 'Main Surgical Suite',
  room_type VARCHAR(64) NOT NULL DEFAULT 'STANDARD_OR'
    CHECK (room_type IN ('STANDARD_OR', 'HYBRID_OR', 'PROCEDURE_ROOM', 'ENDOSCOPY_SUITE', 'MINIMAL_INVASIVE_SUITE', 'ROBOTIC_SUITE')),
  square_footage NUMERIC(8, 2) NOT NULL DEFAULT 450.00 CHECK (square_footage > 0),
  table_weight_capacity_lbs INTEGER NOT NULL DEFAULT 500 CHECK (table_weight_capacity_lbs >= 300),
  hvac_cleanroom_class VARCHAR(64) NOT NULL DEFAULT 'ISO_CLASS_7'
    CHECK (hvac_cleanroom_class IN ('ISO_CLASS_5', 'ISO_CLASS_6', 'ISO_CLASS_7', 'ISO_CLASS_8', 'STANDARD_VENTILATED')),
  positive_pressure_pa NUMERIC(6, 2) NOT NULL DEFAULT 2.50 CHECK (positive_pressure_pa >= 0),
  air_changes_per_hour INTEGER NOT NULL DEFAULT 20 CHECK (air_changes_per_hour >= 15),
  laminar_flow_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  hourly_cost_rate NUMERIC(10, 2) NOT NULL DEFAULT 1450.00 CHECK (hourly_cost_rate >= 0),
  standard_turnover_minutes INTEGER NOT NULL DEFAULT 25 CHECK (standard_turnover_minutes > 0),
  operating_status VARCHAR(64) NOT NULL DEFAULT 'OPERATIONAL'
    CHECK (operating_status IN ('OPERATIONAL', 'MAINTENANCE', 'RENOVATION', 'DECOMMISSIONED')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT uq_operating_rooms_facility_room UNIQUE (facility_id, room_number)
);

-- 2. Table: operating_room_specialties
CREATE TABLE IF NOT EXISTS public.operating_room_specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL,
  specialty_code VARCHAR(64) NOT NULL,
  specialty_name VARCHAR(128) NOT NULL,
  compatibility_tier VARCHAR(64) NOT NULL DEFAULT 'PRIMARY'
    CHECK (compatibility_tier IN ('PRIMARY', 'SECONDARY', 'RESTRICTED')),
  is_preferred BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_or_facility_specialty UNIQUE (operating_room_id, specialty_code)
);

-- 3. Table: operating_room_equipment
CREATE TABLE IF NOT EXISTS public.operating_room_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL,
  equipment_code VARCHAR(64) NOT NULL,
  equipment_name VARCHAR(128) NOT NULL,
  is_fixed_installation BOOLEAN NOT NULL DEFAULT TRUE,
  serial_number VARCHAR(128),
  maintenance_status VARCHAR(64) NOT NULL DEFAULT 'CERTIFIED'
    CHECK (maintenance_status IN ('CERTIFIED', 'PENDING_INSPECTION', 'OUT_OF_SERVICE')),
  last_inspection_date DATE,
  next_inspection_due DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_or_facility_equipment UNIQUE (operating_room_id, equipment_code)
);

-- 4. Table: operating_room_status_events
CREATE TABLE IF NOT EXISTS public.operating_room_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_room_id UUID NOT NULL REFERENCES public.operating_rooms(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL,
  previous_status VARCHAR(64) NOT NULL,
  new_status VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL,
  event_type VARCHAR(64) NOT NULL DEFAULT 'STATUS_CHANGE'
    CHECK (event_type IN ('STATUS_CHANGE', 'MAINTENANCE_SCHEDULED', 'HVAC_CERTIFICATION', 'DECOMMISSION')),
  start_downtime TIMESTAMPTZ,
  end_downtime TIMESTAMPTZ,
  changed_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_or_facility_status 
  ON public.operating_rooms (facility_id, operating_status, is_active);

CREATE INDEX IF NOT EXISTS idx_or_specialties_lookup 
  ON public.operating_room_specialties (operating_room_id, specialty_code);

CREATE INDEX IF NOT EXISTS idx_or_equipment_lookup 
  ON public.operating_room_equipment (operating_room_id, equipment_code);

CREATE INDEX IF NOT EXISTS idx_or_status_events_room 
  ON public.operating_room_status_events (operating_room_id, created_at DESC);

-- 6. Analytical Views
-- View 1: Active Operating Rooms with Capability Counts
CREATE OR REPLACE VIEW public.vw_operating_rooms_active AS
SELECT 
  r.id,
  r.facility_id,
  r.room_number,
  r.room_name,
  r.suite_designation,
  r.room_type,
  r.square_footage,
  r.table_weight_capacity_lbs,
  r.hvac_cleanroom_class,
  r.positive_pressure_pa,
  r.air_changes_per_hour,
  r.laminar_flow_enabled,
  r.hourly_cost_rate,
  r.standard_turnover_minutes,
  r.operating_status,
  r.is_active,
  COUNT(DISTINCT s.id) AS specialty_count,
  COUNT(DISTINCT e.id) AS equipment_count
FROM public.operating_rooms r
LEFT JOIN public.operating_room_specialties s ON s.operating_room_id = r.id
LEFT JOIN public.operating_room_equipment e ON e.operating_room_id = r.id
WHERE r.is_active = TRUE
GROUP BY r.id;

-- View 2: Facility Level OR Capacity Summary
CREATE OR REPLACE VIEW public.vw_operating_room_facility_summary AS
SELECT 
  facility_id,
  COUNT(*) AS total_rooms,
  COUNT(*) FILTER (WHERE operating_status = 'OPERATIONAL') AS operational_rooms,
  COUNT(*) FILTER (WHERE operating_status = 'MAINTENANCE') AS maintenance_rooms,
  ROUND(
    (COUNT(*) FILTER (WHERE operating_status = 'OPERATIONAL')::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 100, 
    2
  ) AS operational_rate_pct,
  COALESCE(ROUND(AVG(standard_turnover_minutes)::NUMERIC, 1), 0) AS avg_standard_turnover_min,
  COALESCE(ROUND(AVG(hourly_cost_rate)::NUMERIC, 2), 0.00) AS avg_hourly_cost_rate,
  COALESCE(SUM(square_footage), 0) AS total_surgical_sqft,
  COUNT(DISTINCT suite_designation) AS total_suites
FROM public.operating_rooms
WHERE is_active = TRUE
GROUP BY facility_id;

-- 7. Row Level Security (RLS) Isolation
ALTER TABLE public.operating_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_room_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_room_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_room_status_events ENABLE ROW LEVEL SECURITY;

-- 7.1 Policies for operating_rooms
DROP POLICY IF EXISTS rls_operating_rooms_facility ON public.operating_rooms;
CREATE POLICY rls_operating_rooms_facility ON public.operating_rooms
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 7.2 Policies for operating_room_specialties
DROP POLICY IF EXISTS rls_or_specialties_facility ON public.operating_room_specialties;
CREATE POLICY rls_or_specialties_facility ON public.operating_room_specialties
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 7.3 Policies for operating_room_equipment
DROP POLICY IF EXISTS rls_or_equipment_facility ON public.operating_room_equipment;
CREATE POLICY rls_or_equipment_facility ON public.operating_room_equipment
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 7.4 Policies for operating_room_status_events
DROP POLICY IF EXISTS rls_or_status_events_facility ON public.operating_room_status_events;
CREATE POLICY rls_or_status_events_facility ON public.operating_room_status_events
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
