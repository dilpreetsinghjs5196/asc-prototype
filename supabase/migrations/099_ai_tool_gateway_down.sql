-- ==============================================================================
-- Migration: 099_ai_tool_gateway_down.sql
-- Phase C1: AI Tool Gateway Tier Rollback
-- Module: Module 12: AI & Intelligence
-- Description: Cleanly drops all views, policies, indexes, and tables established
--              in migration 099_ai_tool_gateway.sql.
-- ==============================================================================

-- 1. Drop Policies
DROP POLICY IF EXISTS p_ai_tool_circuit_tenant ON public.ai_tool_circuit_breakers;
DROP POLICY IF EXISTS p_ai_tool_executions_tenant ON public.ai_tool_executions;
DROP POLICY IF EXISTS p_ai_tool_definitions_read ON public.ai_tool_definitions;

-- 2. Drop Analytical Views
DROP VIEW IF EXISTS public.vw_ai_circuit_breaker_health CASCADE;
DROP VIEW IF EXISTS public.vw_ai_tool_gateway_telemetry CASCADE;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_ai_tool_circuit_facility;
DROP INDEX IF EXISTS public.idx_ai_tool_executions_created;
DROP INDEX IF EXISTS public.idx_ai_tool_executions_status;
DROP INDEX IF EXISTS public.idx_ai_tool_executions_tool;
DROP INDEX IF EXISTS public.idx_ai_tool_executions_facility;

-- 4. Drop Tables (in reverse dependency order)
DROP TABLE IF EXISTS public.ai_tool_circuit_breakers CASCADE;
DROP TABLE IF EXISTS public.ai_tool_executions CASCADE;
DROP TABLE IF EXISTS public.ai_tool_definitions CASCADE;
