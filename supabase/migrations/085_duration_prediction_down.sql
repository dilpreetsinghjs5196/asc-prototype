-- ==============================================================================
-- Migration Rollback: 085_duration_prediction_down.sql
-- Phase A8: Duration Prediction Models (P50/P75/P80/P90)
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Clean, idempotent drop of all views, policies, indexes, and tables
--              associated with Phase A8 duration prediction models.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_or_duration_models_by_cpt CASCADE;
DROP VIEW IF EXISTS public.vw_or_duration_prediction_accuracy CASCADE;

-- 2. Drop RLS Policies
DROP POLICY IF EXISTS rls_or_case_duration_predictions_log_facility ON public.or_case_duration_predictions_log;
DROP POLICY IF EXISTS rls_or_case_duration_prediction_models_facility ON public.or_case_duration_prediction_models;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_ocdpl_facility_cpt;
DROP INDEX IF EXISTS public.idx_ocdpl_facility_date;
DROP INDEX IF EXISTS public.idx_ocdpm_facility_confidence;
DROP INDEX IF EXISTS public.idx_ocdpm_facility_cpt;
DROP INDEX IF EXISTS public.idx_ocdpm_facility_surgeon;

-- 4. Drop Tables (CASCADE removes foreign key constraints)
DROP TABLE IF EXISTS public.or_case_duration_predictions_log CASCADE;
DROP TABLE IF EXISTS public.or_case_duration_prediction_models CASCADE;
