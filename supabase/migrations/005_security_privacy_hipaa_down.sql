-- ==============================================================================
-- ROLLBACK SCRIPT: MIGRATION 005 (DOWN)
-- Reverts Phase 25 Security, Privacy & HIPAA changes safely without opening anon access
-- ==============================================================================

-- 1. Drop export audit logging RPC
DROP FUNCTION IF EXISTS public.fn_log_export_audit_event(TEXT, TEXT, INT, UUID, JSONB);

-- 2. Drop unique MRN index
DROP INDEX IF EXISTS public.uq_patients_facility_mrn;

-- 3. Revert NOT NULL constraints
ALTER TABLE public.patients ALTER COLUMN facility_id DROP NOT NULL;
ALTER TABLE public.surgeries ALTER COLUMN facility_id DROP NOT NULL;

-- 4. Re-add nullable password column to surgeons if required for rollback compatibility
ALTER TABLE public.surgeons ADD COLUMN IF NOT EXISTS password TEXT;

-- 5. Restore baseline read on users for transitional auth
GRANT SELECT ON public.users TO authenticated;
