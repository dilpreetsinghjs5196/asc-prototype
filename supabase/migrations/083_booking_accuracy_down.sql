-- ==============================================================================
-- Migration Rollback: 083_booking_accuracy_down.sql
-- Phase A6: Booking Accuracy & Duration Calibration Engine
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A6 booking accuracy.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_surgeon_scheduling_bias CASCADE;
DROP VIEW IF EXISTS public.vw_or_booking_accuracy_facility_summary CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_surgeon_booking_profiles_facility ON public.or_surgeon_booking_profiles;
DROP POLICY IF EXISTS rls_or_case_booking_accuracy_logs_facility ON public.or_case_booking_accuracy_logs;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_osbp_facility_tendency;
DROP INDEX IF EXISTS public.idx_ocbal_facility_cpt;
DROP INDEX IF EXISTS public.idx_ocbal_facility_status;
DROP INDEX IF EXISTS public.idx_ocbal_facility_surgeon;
DROP INDEX IF EXISTS public.idx_ocbal_facility_date;

-- 4. Drop Tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS public.or_surgeon_booking_profiles CASCADE;
DROP TABLE IF EXISTS public.or_case_booking_accuracy_logs CASCADE;

