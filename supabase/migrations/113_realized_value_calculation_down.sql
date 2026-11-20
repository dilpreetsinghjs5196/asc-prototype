-- ==============================================================================
-- Migration 113 Down: Rollback Realized Value Calculation & Multi-Pillar ROI
-- Phase D6: Module 13 Decision Intelligence
-- ==============================================================================

DROP POLICY IF EXISTS realized_value_line_items_facility_isolation ON public.realized_value_line_items;
DROP POLICY IF EXISTS realized_value_calculations_facility_isolation ON public.realized_value_calculations;

DROP VIEW IF EXISTS public.vw_realized_value_telemetry;

DROP TABLE IF EXISTS public.realized_value_line_items;
DROP TABLE IF EXISTS public.realized_value_calculations;
