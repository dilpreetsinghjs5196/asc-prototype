-- ==============================================================================
-- Migration: 124_excel_csv_import_down.sql
-- Description: Rollback Phase F2 Excel/CSV File Ingestion & Schema Engine
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_excel_csv_import_telemetry;

-- Drop RLS Policies
DROP POLICY IF EXISTS rls_excel_import_provenance_facility ON public.excel_import_provenance_records;
DROP POLICY IF EXISTS rls_excel_import_exceptions_facility ON public.excel_import_exceptions;
DROP POLICY IF EXISTS rls_excel_import_staged_rows_facility ON public.excel_import_staged_rows;
DROP POLICY IF EXISTS rls_excel_import_batches_facility ON public.excel_import_batches;
DROP POLICY IF EXISTS rls_excel_import_templates_facility ON public.excel_import_templates;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.excel_import_provenance_records CASCADE;
DROP TABLE IF EXISTS public.excel_import_exceptions CASCADE;
DROP TABLE IF EXISTS public.excel_import_staged_rows CASCADE;
DROP TABLE IF EXISTS public.excel_import_batches CASCADE;
DROP TABLE IF EXISTS public.excel_import_templates CASCADE;
