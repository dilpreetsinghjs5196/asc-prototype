-- ==============================================================================
-- Migration Rollback: 079_block_schedule_model_down.sql
-- Phase A2: Block Schedule Model & Allocation Architecture
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A2 block schedule definitions.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_block_capacity_summary CASCADE;
DROP VIEW IF EXISTS public.vw_or_block_definitions_active CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_block_definitions_facility ON public.or_block_definitions;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_obd_facility_room_day;
DROP INDEX IF EXISTS public.idx_obd_facility_owner;
DROP INDEX IF EXISTS public.idx_obd_facility_specialty;

-- 4. Drop Master Block Table
DROP TABLE IF EXISTS public.or_block_definitions CASCADE;
