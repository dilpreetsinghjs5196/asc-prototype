-- ==============================================================================
-- ROLLBACK MIGRATION: 002_clinical_normalization_down.sql
-- DESCRIPTION: Reversible down-migration for 002_clinical_normalization.sql
-- ==============================================================================

BEGIN;

-- 1. Drop RLS Policies on Normalized Tables
DROP POLICY IF EXISTS "Tenant Scoped Surgery Procedures Access" ON public.surgery_procedures;
DROP POLICY IF EXISTS "Tenant Scoped Payer Fee Schedules Access" ON public.payer_fee_schedules;
DROP POLICY IF EXISTS "Tenant Scoped Payers Access" ON public.payers;
DROP POLICY IF EXISTS "Tenant Scoped Operating Rooms Access" ON public.operating_rooms;

-- 2. Drop Foreign Keys from or_block_schedule
ALTER TABLE public.or_block_schedule
DROP COLUMN IF EXISTS surgeon_id,
DROP COLUMN IF EXISTS operating_room_id;

-- 3. Drop Foreign Key from surgeries
ALTER TABLE public.surgeries
DROP COLUMN IF EXISTS operating_room_id;

-- 4. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.surgery_procedures CASCADE;
DROP TABLE IF EXISTS public.payer_fee_schedules CASCADE;
DROP TABLE IF EXISTS public.payers CASCADE;
DROP TABLE IF EXISTS public.operating_rooms CASCADE;

COMMIT;
