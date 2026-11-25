-- ==============================================================================
-- Migration: 130_inventory_integration_down.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F8)
-- Description: Rollback script for Phase F8 Inventory & Materials Management Gateway.
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_inventory_integration_telemetry CASCADE;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.inventory_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.inventory_exception_logs CASCADE;
DROP TABLE IF EXISTS public.inventory_waste_logs CASCADE;
DROP TABLE IF EXISTS public.inventory_case_usage CASCADE;
DROP TABLE IF EXISTS public.inventory_stock_levels CASCADE;
DROP TABLE IF EXISTS public.inventory_item_master CASCADE;
DROP TABLE IF EXISTS public.inventory_connector_configs CASCADE;
