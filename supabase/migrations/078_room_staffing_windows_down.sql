-- ==============================================================================
-- Rollback Migration: 078_room_staffing_windows_down.sql
-- Phase A1: Room Staffing Windows, Closures & Denominator Rules
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_room_staffed_capacity_summary CASCADE;
DROP VIEW IF EXISTS public.vw_room_staffing_weekly_matrix CASCADE;

-- 2. Drop Tables with Cascade
DROP TABLE IF EXISTS public.room_staffing_exceptions CASCADE;
DROP TABLE IF EXISTS public.room_closure_events CASCADE;
DROP TABLE IF EXISTS public.room_staffing_windows CASCADE;

