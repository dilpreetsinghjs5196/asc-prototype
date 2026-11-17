-- ==============================================================================
-- Migration Rollback: 097_vendor_cost_comparison_down.sql
-- Phase B8: Vendor and Product Cost Comparisons by Implant, CPT, Surgeon, and Facility
-- Module: Module 11: Surgeon & Clinical Intelligence / Supply Chain & Materials Management
-- Description: Clean idempotent rollback for Phase B8 tables, views, and policies.
-- ==============================================================================

-- 1. Drop RLS Policies
DROP POLICY IF EXISTS rls_surgeon_vendor_preferences_facility ON public.surgeon_vendor_preferences;
DROP POLICY IF EXISTS rls_vendor_product_sku_pricing_facility ON public.vendor_product_sku_pricing;
DROP POLICY IF EXISTS rls_vendor_cost_comparison_metrics_facility ON public.vendor_cost_comparison_metrics;

-- 2. Drop Views
DROP VIEW IF EXISTS public.vw_vendor_contract_compliance_radar CASCADE;
DROP VIEW IF EXISTS public.vw_vendor_cost_variance_summary CASCADE;

-- 3. Drop Indexes
DROP INDEX IF EXISTS public.idx_vcc_surgeon_pref;
DROP INDEX IF EXISTS public.idx_vcc_sku_vendor;
DROP INDEX IF EXISTS public.idx_vcc_grade;
DROP INDEX IF EXISTS public.idx_vcc_vendor;
DROP INDEX IF EXISTS public.idx_vcc_cpt;
DROP INDEX IF EXISTS public.idx_vcc_facility;

-- 4. Drop Tables
DROP TABLE IF EXISTS public.surgeon_vendor_preferences CASCADE;
DROP TABLE IF EXISTS public.vendor_product_sku_pricing CASCADE;
DROP TABLE IF EXISTS public.vendor_cost_comparison_metrics CASCADE;
