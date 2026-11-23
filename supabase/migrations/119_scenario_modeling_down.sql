-- ==============================================================================
-- Migration 119 DOWN: Scenario Modeling & What-If Stress Testing Engine
-- Phase E5: Module 14 CFO Dashboard & Financial Accounting
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_scenario_telemetry CASCADE;
DROP TABLE IF EXISTS public.scenario_specialty_impacts CASCADE;
DROP TABLE IF EXISTS public.facility_scenarios CASCADE;
