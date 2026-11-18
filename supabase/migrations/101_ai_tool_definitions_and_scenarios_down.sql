-- ==============================================================================
-- Rollback Migration: 101_ai_tool_definitions_and_scenarios_down.sql
-- Phase C3: AI Tool Definitions & What-If Simulation Engines
-- Module: Module 12: AI & Intelligence
-- Description: Reverts tables, views, policies, and indexes created in 101.
-- ==============================================================================

-- 1. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_ai_scenario_simulation_history CASCADE;
DROP VIEW IF EXISTS public.vw_ai_tool_catalog_summary CASCADE;

-- 2. Drop Tables
DROP TABLE IF EXISTS public.ai_query_catalogs CASCADE;
DROP TABLE IF EXISTS public.ai_scenario_simulations CASCADE;
DROP TABLE IF EXISTS public.ai_tool_schemas CASCADE;
