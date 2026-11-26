-- ==============================================================================
-- Migration: 135_import_exception_queue_down.sql
-- Module 16: Enterprise Data Quality Governance (Phase G3)
-- Description: Rollback script for Phase G3 Import Exception Queue.
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_import_exception_queue_telemetry CASCADE;

DROP TABLE IF EXISTS public.ieq_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.ieq_replay_batches CASCADE;
DROP TABLE IF EXISTS public.ieq_owner_workloads CASCADE;
DROP TABLE IF EXISTS public.ieq_resolution_actions CASCADE;
DROP TABLE IF EXISTS public.ieq_exception_items CASCADE;
DROP TABLE IF EXISTS public.ieq_routing_rules CASCADE;
DROP TABLE IF EXISTS public.ieq_queue_configs CASCADE;
