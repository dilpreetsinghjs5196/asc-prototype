-- ==============================================================================
-- ROLLBACK MIGRATION: 003_audit_and_snapshots_down.sql
-- DESCRIPTION: Reversible down-migration for 003_audit_and_snapshots.sql
-- ==============================================================================

BEGIN;

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS "Billers and Admins Can Freeze Snapshots" ON public.surgery_financial_snapshots;
DROP POLICY IF EXISTS "Tenant Members Can View Snapshots" ON public.surgery_financial_snapshots;
DROP POLICY IF EXISTS "Authorized Roles Can View Audit Logs" ON public.audit_logs;

-- 2. Drop Audit Triggers from Operational Tables
DROP TRIGGER IF EXISTS trg_audit_staff ON public.staff;
DROP TRIGGER IF EXISTS trg_audit_or_block_schedule ON public.or_block_schedule;
DROP TRIGGER IF EXISTS trg_audit_cpt_codes ON public.cpt_codes;
DROP TRIGGER IF EXISTS trg_audit_payer_fee_schedules ON public.payer_fee_schedules;
DROP TRIGGER IF EXISTS trg_audit_payers ON public.payers;
DROP TRIGGER IF EXISTS trg_audit_operating_rooms ON public.operating_rooms;
DROP TRIGGER IF EXISTS trg_audit_surgeons ON public.surgeons;
DROP TRIGGER IF EXISTS trg_audit_patients ON public.patients;
DROP TRIGGER IF EXISTS trg_audit_surgery_procedures ON public.surgery_procedures;
DROP TRIGGER IF EXISTS trg_audit_surgeries ON public.surgeries;

-- 3. Drop Trigger Function
DROP FUNCTION IF EXISTS public.fn_audit_log_trigger();

-- 4. Drop Tables
DROP TABLE IF EXISTS public.surgery_financial_snapshots CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;

COMMIT;
