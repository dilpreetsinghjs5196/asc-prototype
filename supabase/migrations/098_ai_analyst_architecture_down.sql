-- ==============================================================================
-- Migration Rollback: 098_ai_analyst_architecture_down.sql
-- Phase C0: AI Analyst Architecture & Tool-Gated Data Access
-- Module: Module 12: AI & Intelligence
-- Description: Clean idempotent rollback for Phase C0 tables, views, and policies.
-- ==============================================================================

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_ai_tool_execution_logs_facility ON public.ai_tool_execution_logs;
DROP POLICY IF EXISTS rls_ai_analyst_messages_facility ON public.ai_analyst_messages;
DROP POLICY IF EXISTS rls_ai_analyst_conversations_facility ON public.ai_analyst_conversations;

-- 2. Drop Views
DROP VIEW IF EXISTS public.vw_ai_security_audit_radar CASCADE;
DROP VIEW IF EXISTS public.vw_ai_tool_usage_summary CASCADE;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_ai_tool_log_created;
DROP INDEX IF EXISTS public.idx_ai_tool_log_status;
DROP INDEX IF EXISTS public.idx_ai_tool_log_name;
DROP INDEX IF EXISTS public.idx_ai_tool_log_facility;
DROP INDEX IF EXISTS public.idx_ai_msg_facility;
DROP INDEX IF EXISTS public.idx_ai_msg_conv;
DROP INDEX IF EXISTS public.idx_ai_conv_user;
DROP INDEX IF EXISTS public.idx_ai_conv_facility;

-- 4. Drop Tables
DROP TABLE IF EXISTS public.ai_tool_execution_logs CASCADE;
DROP TABLE IF EXISTS public.ai_analyst_messages CASCADE;
DROP TABLE IF EXISTS public.ai_analyst_conversations CASCADE;
