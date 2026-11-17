-- ==============================================================================
-- Migration: 097_vendor_cost_comparison.sql
-- Phase B8: Vendor and Product Cost Comparisons by Implant, CPT, Surgeon, and Facility
-- Module: Module 11: Surgeon & Clinical Intelligence / Supply Chain & Materials Management
-- Description: Establishes vendor cost comparison metrics, product SKU pricing
--              comparisons, surgeon vendor sourcing preferences, analytical views,
--              indexes, and multi-tenant RLS.
-- ==============================================================================

-- 1. Vendor Cost Comparison Metrics Table
CREATE TABLE IF NOT EXISTS public.vendor_cost_comparison_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    construct_category VARCHAR(64) NOT NULL, -- 'TOTAL_KNEE', 'ROTATOR_CUFF', 'CATARACT_IOL', 'ACDF_SPINE', etc.
    cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(256) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    vendor_code VARCHAR(64) NOT NULL,
    vendor_name VARCHAR(256) NOT NULL,
    annual_case_volume INTEGER NOT NULL DEFAULT 0,
    avg_construct_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    facility_benchmark_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cost_variance_dollars NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cost_variance_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    annual_spend_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    potential_savings_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    contract_compliance_rate_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    rebate_yield_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    effective_net_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_contracted BOOLEAN NOT NULL DEFAULT true,
    value_grade VARCHAR(32) NOT NULL DEFAULT 'COMPETITIVE_STANDARD', -- 'TIER_1_PREFERRED', 'COMPETITIVE_STANDARD', 'COST_DISADVANTAGE', 'OFF_CONTRACT_EXPENSIVE'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vendor_cost_facility_construct UNIQUE (facility_id, cpt_code, vendor_code)
);

-- 2. Vendor Product SKU Pricing Table
CREATE TABLE IF NOT EXISTS public.vendor_product_sku_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sku_code VARCHAR(64) NOT NULL,
    product_name VARCHAR(256) NOT NULL,
    construct_category VARCHAR(64) NOT NULL,
    vendor_code VARCHAR(64) NOT NULL,
    vendor_name VARCHAR(256) NOT NULL,
    list_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    contracted_tier_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    actual_invoice_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    invoice_variance_dollars NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    annual_units_used INTEGER NOT NULL DEFAULT 0,
    is_consignment BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Surgeon Vendor Preferences Table
CREATE TABLE IF NOT EXISTS public.surgeon_vendor_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id BIGINT NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    cpt_code VARCHAR(16) NOT NULL,
    primary_vendor_code VARCHAR(64) NOT NULL,
    primary_vendor_name VARCHAR(256) NOT NULL,
    vendor_volume_share_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    avg_surgeon_construct_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    facility_tier1_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    excess_spend_per_case NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    potential_annual_savings NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_vendor_cost_variance_summary AS
SELECT
    facility_id,
    construct_category,
    COUNT(DISTINCT vendor_code) AS competing_vendors_count,
    SUM(annual_case_volume) AS total_category_volume,
    MIN(avg_construct_cost) AS lowest_market_cost,
    MAX(avg_construct_cost) AS highest_market_cost,
    ROUND(MAX(avg_construct_cost) - MIN(avg_construct_cost), 2) AS price_spread_dollars,
    ROUND(((MAX(avg_construct_cost) - MIN(avg_construct_cost)) / NULLIF(MIN(avg_construct_cost), 0)) * 100, 2) AS price_spread_pct,
    SUM(annual_spend_dollars) AS total_category_spend,
    SUM(potential_savings_dollars) AS total_potential_savings
FROM public.vendor_cost_comparison_metrics
GROUP BY facility_id, construct_category;

CREATE OR REPLACE VIEW public.vw_vendor_contract_compliance_radar AS
SELECT
    id,
    facility_id,
    sku_code,
    product_name,
    vendor_name,
    contracted_tier_price,
    actual_invoice_price,
    invoice_variance_dollars,
    annual_units_used,
    ROUND(invoice_variance_dollars * annual_units_used, 2) AS total_invoice_leakage
FROM public.vendor_product_sku_pricing
WHERE invoice_variance_dollars > 0;

-- 5. Indexes for Query Performance
CREATE INDEX IF NOT EXISTS idx_vcc_facility ON public.vendor_cost_comparison_metrics(facility_id);
CREATE INDEX IF NOT EXISTS idx_vcc_cpt ON public.vendor_cost_comparison_metrics(cpt_code);
CREATE INDEX IF NOT EXISTS idx_vcc_vendor ON public.vendor_cost_comparison_metrics(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vcc_grade ON public.vendor_cost_comparison_metrics(value_grade);
CREATE INDEX IF NOT EXISTS idx_vcc_sku_vendor ON public.vendor_product_sku_pricing(vendor_code, construct_category);
CREATE INDEX IF NOT EXISTS idx_vcc_surgeon_pref ON public.surgeon_vendor_preferences(surgeon_id, cpt_code);

-- 6. Multi-Tenancy Row Level Security (RLS)
ALTER TABLE public.vendor_cost_comparison_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_product_sku_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeon_vendor_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_vendor_cost_comparison_metrics_facility ON public.vendor_cost_comparison_metrics
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_vendor_product_sku_pricing_facility ON public.vendor_product_sku_pricing
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );

CREATE POLICY rls_surgeon_vendor_preferences_facility ON public.surgeon_vendor_preferences
    FOR ALL USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::UUID
    );
