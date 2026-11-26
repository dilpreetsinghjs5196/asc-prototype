-- ==============================================================================
-- Migration: 131_vendor_invoice_import_down.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F9)
-- Description: Rollback script for Phase F9 Vendor Invoice Import Gateway.
-- ==============================================================================

-- Drop Telemetry View
DROP VIEW IF EXISTS public.vw_vendor_invoice_telemetry CASCADE;

-- Drop Tables in reverse dependency order
DROP TABLE IF EXISTS public.vendor_invoice_provenance_ledger CASCADE;
DROP TABLE IF EXISTS public.vendor_invoice_exceptions CASCADE;
DROP TABLE IF EXISTS public.vendor_invoice_lines CASCADE;
DROP TABLE IF EXISTS public.vendor_invoice_batches CASCADE;
DROP TABLE IF EXISTS public.vendor_purchase_orders CASCADE;
DROP TABLE IF EXISTS public.vendor_price_contracts CASCADE;
DROP TABLE IF EXISTS public.vendor_invoice_configs CASCADE;
