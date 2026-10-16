-- ==============================================================================
-- ROLLBACK MIGRATION: 004_audit_logging_hardening_down.sql
-- DESCRIPTION: Reversible down-migration for 004_audit_logging_hardening.sql
-- ==============================================================================

BEGIN;

-- 1. Drop Immutability Trigger & Function
DROP TRIGGER IF EXISTS trg_protect_audit_logs_immutability ON public.audit_logs;
DROP FUNCTION IF EXISTS public.fn_prevent_audit_log_mutation();

-- 2. Drop Manual Audit Event RPC
DROP FUNCTION IF EXISTS public.fn_log_manual_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT);

-- 3. Revert RLS Policy to 003 Definition
DROP POLICY IF EXISTS "Authorized Roles Can View Audit Logs" ON public.audit_logs;
CREATE POLICY "Authorized Roles Can View Audit Logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director'])
);

-- 4. Revert fn_audit_log_trigger to basic version
-- (fn_audit_log_trigger definition from 003 can be reapplied if rolling back)

-- 5. Drop Sanitizer Function
DROP FUNCTION IF EXISTS public.fn_sanitize_audit_jsonb(JSONB);

-- 6. Drop Indexes Added in 004
DROP INDEX IF EXISTS public.idx_audit_logs_facility_action;
DROP INDEX IF EXISTS public.idx_audit_logs_correlation;
DROP INDEX IF EXISTS public.idx_audit_logs_source;

COMMIT;
