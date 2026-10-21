-- ==============================================================================
-- MIGRATION 014 DOWN: REVERT DATABASE BACKUP INTROSPECTION
-- ==============================================================================

DROP FUNCTION IF EXISTS public.fn_get_public_tables();
