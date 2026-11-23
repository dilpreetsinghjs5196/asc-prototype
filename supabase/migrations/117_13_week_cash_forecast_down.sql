-- ==============================================================================
-- Migration 117 DOWN: Revert 13-Week Cash Forecast & Liquidity Management
-- ==============================================================================

DROP VIEW IF EXISTS public.vw_cash_forecast_telemetry CASCADE;

DROP TABLE IF EXISTS public.cash_forecast_line_items CASCADE;
DROP TABLE IF EXISTS public.cash_forecast_weeks CASCADE;
DROP TABLE IF EXISTS public.facility_cash_forecasts CASCADE;
