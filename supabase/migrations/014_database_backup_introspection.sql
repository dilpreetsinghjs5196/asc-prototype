-- ==============================================================================
-- MIGRATION 014: DATABASE BACKUP INTROSPECTION & COMPLETE EMERGENCY RECOVERY
-- ==============================================================================
-- Enables the client-side emergency backup utility to dynamically discover
-- and export all public tables in real time directly from PostgreSQL schema.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_get_public_tables()
RETURNS TABLE (table_name TEXT, table_type TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT 
    t.table_name::text, 
    t.table_type::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type IN ('BASE TABLE', 'VIEW')
  ORDER BY 
    CASE WHEN t.table_type = 'BASE TABLE' THEN 1 ELSE 2 END,
    t.table_name;
$$;

COMMENT ON FUNCTION public.fn_get_public_tables() IS 'Discovers all public tables and views dynamically for emergency database backups.';

-- Grant execution to authenticated users, anon (for platform export), and service_role
GRANT EXECUTE ON FUNCTION public.fn_get_public_tables() TO authenticated, anon, service_role;
