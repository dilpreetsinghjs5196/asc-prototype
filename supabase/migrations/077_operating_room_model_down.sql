-- ==============================================================================
-- Rollback Migration: 077_operating_room_model_down.sql
-- Phase A0: Operating Room Model & Physical Asset Architecture
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_operating_room_facility_summary CASCADE;
DROP VIEW IF EXISTS public.vw_operating_rooms_active CASCADE;

-- 2. Drop Tables with Cascade
DROP TABLE IF EXISTS public.operating_room_status_events CASCADE;
DROP TABLE IF EXISTS public.operating_room_equipment CASCADE;
DROP TABLE IF EXISTS public.operating_room_specialties CASCADE;
DROP TABLE IF EXISTS public.operating_rooms CASCADE;
