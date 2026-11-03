-- ==============================================================================
-- MIGRATION: 048_case_cost_model.sql
-- PHASE: 72 — Case Cost Model & Activity-Based Procedural Cost Accounting
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Facility Cost Rate Schedules (Configurable Baseline Rates)
CREATE TABLE IF NOT EXISTS public.facility_cost_rate_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    schedule_name VARCHAR(64) NOT NULL DEFAULT 'Standard Baseline Rates',
    or_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 10.00 CHECK (or_minute_rate >= 0.00),
    pacu_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 3.50 CHECK (pacu_minute_rate >= 0.00),
    labor_burden_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.2500 CHECK (labor_burden_multiplier >= 1.0000),
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fac_rate_active_unq
    ON public.facility_cost_rate_schedules(facility_id)
    WHERE is_active = TRUE;

-- 2. Central Sterile Instrument Tray Cost Catalog
CREATE TABLE IF NOT EXISTS public.instrument_tray_cost_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    tray_code VARCHAR(32) NOT NULL,
    tray_name VARCHAR(128) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    sterilization_method VARCHAR(32) NOT NULL DEFAULT 'STEAM_AUTOCLAVE' CHECK (
        sterilization_method IN ('STEAM_AUTOCLAVE', 'STERRAD_GAS_PLASMA', 'ETO', 'CHEMICAL_STERILANT')
    ),
    decontamination_minutes NUMERIC(6,2) NOT NULL DEFAULT 15.00,
    sterilization_minutes NUMERIC(6,2) NOT NULL DEFAULT 45.00,
    per_cycle_cost NUMERIC(10,2) NOT NULL DEFAULT 45.00 CHECK (per_cycle_cost >= 0.00),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(facility_id, tray_code)
);

-- 3. Case Direct Cost Line Items (Line-Item Accounting)
CREATE TABLE IF NOT EXISTS public.case_direct_cost_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    cost_category VARCHAR(32) NOT NULL CHECK (
        cost_category IN (
            'IMPLANT_COST',
            'SUPPLY_COST',
            'PHARMACY_COST',
            'LABOR_COST',
            'OR_TIME_COST',
            'PACU_TIME_COST',
            'REPROCESSING_COST',
            'EQUIPMENT_COST'
        )
    ),
    item_code VARCHAR(64),
    item_description TEXT NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0.00),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0.00),
    total_cost NUMERIC(12,2) NOT NULL CHECK (total_cost >= 0.00),
    source_module VARCHAR(64) NOT NULL,
    source_reference_id VARCHAR(128),
    vendor_invoice_number VARCHAR(64),
    is_reconciled BOOLEAN NOT NULL DEFAULT TRUE,
    completeness_flag VARCHAR(24) NOT NULL DEFAULT 'VERIFIED' CHECK (
        completeness_flag IN ('VERIFIED', 'ESTIMATED', 'PROVISIONAL')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for Fast Cost Lookup
CREATE INDEX IF NOT EXISTS idx_cost_items_surgery ON public.case_direct_cost_items(surgery_id, cost_category);
CREATE INDEX IF NOT EXISTS idx_cost_items_facility ON public.case_direct_cost_items(facility_id, created_at DESC);

-- 4. Rollup View: Case Cost Breakdown by Category
CREATE OR REPLACE VIEW public.vw_case_cost_breakdowns AS
SELECT
    surgery_id,
    facility_id,
    COALESCE(SUM(CASE WHEN cost_category = 'IMPLANT_COST' THEN total_cost ELSE 0 END), 0.00) AS implant_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'SUPPLY_COST' THEN total_cost ELSE 0 END), 0.00) AS supply_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'PHARMACY_COST' THEN total_cost ELSE 0 END), 0.00) AS pharmacy_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'LABOR_COST' THEN total_cost ELSE 0 END), 0.00) AS labor_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'OR_TIME_COST' THEN total_cost ELSE 0 END), 0.00) AS or_time_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'PACU_TIME_COST' THEN total_cost ELSE 0 END), 0.00) AS pacu_time_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'REPROCESSING_COST' THEN total_cost ELSE 0 END), 0.00) AS reprocessing_cost,
    COALESCE(SUM(CASE WHEN cost_category = 'EQUIPMENT_COST' THEN total_cost ELSE 0 END), 0.00) AS equipment_cost,
    COALESCE(SUM(total_cost), 0.00) AS total_direct_case_cost,
    COUNT(*) AS total_cost_items_count,
    BOOL_AND(is_reconciled) AS all_items_reconciled
FROM public.case_direct_cost_items
GROUP BY surgery_id, facility_id;

-- 5. Row-Level Security (RLS)
ALTER TABLE public.facility_cost_rate_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrument_tray_cost_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_direct_cost_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY fac_rates_policy ON public.facility_cost_rate_schedules
    FOR ALL TO authenticated
    USING (public.is_facility_accessible(facility_id))
    WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY tray_catalog_policy ON public.instrument_tray_cost_catalog
    FOR ALL TO authenticated
    USING (public.is_facility_accessible(facility_id))
    WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY cost_items_policy ON public.case_direct_cost_items
    FOR ALL TO authenticated
    USING (public.is_facility_accessible(facility_id))
    WITH CHECK (public.is_facility_accessible(facility_id));
