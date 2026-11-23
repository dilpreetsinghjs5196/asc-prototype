-- ==============================================================================
-- Migration 121 Down: Rollback ASC Analyst ROI & Value Reporting Engine
-- Phase E7: Module 14 CFO Dashboard & Financial Accounting
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_facility_roi_telemetry CASCADE;
DROP TABLE IF EXISTS public.roi_value_line_items CASCADE;
DROP TABLE IF EXISTS public.facility_roi_reports CASCADE;
