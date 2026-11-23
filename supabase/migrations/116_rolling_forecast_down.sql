-- ==============================================================================
-- Migration 116 DOWN: Revert Rolling Forecast & Continuous Projections
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_rolling_forecast_telemetry CASCADE;

DROP TABLE IF EXISTS public.rolling_forecast_methods CASCADE;
DROP TABLE IF EXISTS public.rolling_forecast_line_items CASCADE;
DROP TABLE IF EXISTS public.rolling_forecast_periods CASCADE;
DROP TABLE IF EXISTS public.facility_rolling_forecasts CASCADE;
