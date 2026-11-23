-- ==============================================================================
-- Migration 118 DOWN: Revert Break-Even Analysis & Cost-Volume-Profit Engine
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_break_even_telemetry CASCADE;

DROP TABLE IF EXISTS public.break_even_specialty_benchmarks CASCADE;
DROP TABLE IF EXISTS public.facility_break_even_models CASCADE;
