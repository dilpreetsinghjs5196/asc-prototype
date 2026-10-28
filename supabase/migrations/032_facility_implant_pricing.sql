-- ==============================================================================
-- MIGRATION: 032_facility_implant_pricing.sql
-- DESCRIPTION: Phase 57 Facility Implant Pricing: Contract Schedules,
--              Itemized SKU Prices, Supplier Invoices, 3-Way Reconciliation,
--              Case Cost Allocations, and Benchmark Intelligence.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.facility_implant_price_schedules
-- Groups itemized SKU pricing agreements under a master contract or local schedule
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_price_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE CASCADE,
    
    -- Identification & Description
    schedule_code VARCHAR(50) NOT NULL,
    schedule_name VARCHAR(150) NOT NULL,
    description TEXT,
    
    -- Commercial Framework
    pricing_model VARCHAR(30) NOT NULL DEFAULT 'FIXED_FEE_SCHEDULE'
        CHECK (pricing_model IN (
            'FIXED_FEE_SCHEDULE',       -- Fixed unit price per catalog SKU
            'LIST_LESS_DISCOUNT',       -- MSRP minus contract discount percent
            'COST_PLUS_PERCENT',        -- Distributor acquisition plus margin
            'CAPITATED_PROCEDURE_RATE',  -- Flat fee per procedural construct
            'CONSIGNMENT_TIERED'        -- Volume-bracketed consignment schedule
        )),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    
    -- Temporal Boundaries
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    
    -- Lifecycle Governance
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'superseded', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Approval Provenance (Two-Person Separation of Duties)
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_price_schedule_dates CHECK (effective_to >= effective_from),
    CONSTRAINT chk_price_schedule_active_sync CHECK (is_active = (status = 'active')),
    CONSTRAINT chk_price_schedule_approval_integrity CHECK (
        (status IN ('approved', 'active') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (status NOT IN ('approved', 'active'))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_price_schedule_code 
    ON public.facility_implant_price_schedules (facility_id, UPPER(TRIM(schedule_code)));

CREATE INDEX IF NOT EXISTS idx_fips_vendor ON public.facility_implant_price_schedules(vendor_id);
CREATE INDEX IF NOT EXISTS idx_fips_contract ON public.facility_implant_price_schedules(contract_id);
CREATE INDEX IF NOT EXISTS idx_fips_facility_dates ON public.facility_implant_price_schedules(facility_id, effective_from, effective_to);

-- ==============================================================================
-- 2. TABLE: public.facility_implant_sku_prices
-- Itemized unit price per physical SKU under a price schedule
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_sku_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_schedule_id UUID NOT NULL REFERENCES public.facility_implant_price_schedules(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    
    -- Monetary Specifications (4 decimal places for unit precision)
    contract_unit_price NUMERIC(12, 4) NOT NULL CHECK (contract_unit_price >= 0.0000),
    list_price_at_signing NUMERIC(12, 4) CHECK (list_price_at_signing IS NULL OR list_price_at_signing >= 0.0000),
    discount_off_list_percent NUMERIC(5, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN list_price_at_signing > 0 AND contract_unit_price <= list_price_at_signing 
            THEN ROUND(((list_price_at_signing - contract_unit_price) / list_price_at_signing) * 100.0, 2)
            ELSE 0.00 
        END
    ) STORED,

    -- Packaging & Unit Conversion
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA' CHECK (unit_of_measure IN ('EA', 'KIT', 'BOX', 'SET', 'PAIR')),
    package_quantity INTEGER NOT NULL DEFAULT 1 CHECK (package_quantity >= 1),
    package_unit_price NUMERIC(12, 4) GENERATED ALWAYS AS (contract_unit_price * package_quantity) STORED,

    -- Volume Commitments & Tiers
    minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity >= 1),
    pricing_tier VARCHAR(30) NOT NULL DEFAULT 'STANDARD'
        CHECK (pricing_tier IN ('STANDARD', 'TIER_1_VOLUME', 'TIER_2_VOLUME', 'PREFERRED_FACILITY', 'PROMOTIONAL')),
    
    -- Temporal Window
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    
    -- Status & Audit
    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'superseded', 'terminated')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sku_price_dates CHECK (effective_to >= effective_from)
);

-- Partial unique index: Exactly one active price per SKU per schedule
CREATE UNIQUE INDEX IF NOT EXISTS uq_facility_sku_price_active 
    ON public.facility_implant_sku_prices (facility_id, sku_id, price_schedule_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_fisp_sku ON public.facility_implant_sku_prices(sku_id);
CREATE INDEX IF NOT EXISTS idx_fisp_facility_sku_active ON public.facility_implant_sku_prices(facility_id, sku_id, is_active);

-- ==============================================================================
-- 3. TABLE: public.implant_supplier_invoices
-- Invoiced commercial accounts payable records received from medical device suppliers
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_supplier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.implant_vendors(id) ON DELETE RESTRICT,
    contract_id UUID REFERENCES public.facility_vendor_contracts(id) ON DELETE SET NULL,
    
    -- Supplier Invoice Identification
    invoice_number VARCHAR(100) NOT NULL,
    vendor_invoice_reference VARCHAR(150),
    invoice_date DATE NOT NULL,
    due_date DATE,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Financial Totals
    currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_amount NUMERIC(12, 2) NOT NULL CHECK (subtotal_amount >= 0.00),
    freight_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (freight_amount >= 0.00),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0.00),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0.00),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0.00),
    
    -- Payment Terms Snapshots
    payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
    prompt_pay_discount_percent NUMERIC(5, 2) DEFAULT 0.00 CHECK (prompt_pay_discount_percent >= 0.00),
    
    -- 3-Way Reconciliation Status
    reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'unreconciled'
        CHECK (reconciliation_status IN (
            'unreconciled',             -- Newly ingested, pending item matching
            'fully_matched',            -- 100% lines matched clean to PO/Cases
            'partially_matched',        -- Some lines matched, others in variance
            'variance_flagged',         -- Price breach or quantity discrepancy
            'approved_for_payment',     -- Finance/CFO approved for AP payout
            'rejected',                 -- Returned to vendor for credit memo
            'disputed'                  -- Formal commercial dispute logged
        )),
    
    -- Auditing & Sign-off
    reconciled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mathematical balance check
    CONSTRAINT chk_invoice_balance CHECK (
        total_amount = (subtotal_amount + freight_amount + tax_amount - discount_amount)
    )
);

-- Idempotency: Prevent duplicate ingestion of same vendor invoice
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_vendor_number 
    ON public.implant_supplier_invoices (facility_id, vendor_id, UPPER(TRIM(invoice_number)));

CREATE INDEX IF NOT EXISTS idx_isi_facility_status ON public.implant_supplier_invoices(facility_id, reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_isi_vendor ON public.implant_supplier_invoices(vendor_id);

-- ==============================================================================
-- 4. TABLE: public.implant_supplier_invoice_lines
-- Line items within supplier invoices linked to catalog SKUs and PO/surgical cases
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_supplier_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.implant_supplier_invoices(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL CHECK (line_number >= 1),
    
    -- Physical Catalog Matching
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE RESTRICT,
    vendor_catalog_number VARCHAR(100) NOT NULL,
    vendor_description TEXT,
    
    -- Regulatory Traceability
    lot_number VARCHAR(50),
    serial_number VARCHAR(50),
    expiration_date DATE,
    udi VARCHAR(150),
    
    -- Quantity & Pricing Billed
    billed_quantity INTEGER NOT NULL CHECK (billed_quantity >= 1),
    billed_unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA',
    packaging_multiplier INTEGER NOT NULL DEFAULT 1 CHECK (packaging_multiplier >= 1),
    billed_unit_cost NUMERIC(12, 4) NOT NULL CHECK (billed_unit_cost >= 0.0000),
    extended_cost NUMERIC(12, 2) NOT NULL CHECK (extended_cost >= 0.00),
    
    -- Contract Comparison & Variance Analysis
    contract_sku_price_id UUID REFERENCES public.facility_implant_sku_prices(id) ON DELETE SET NULL,
    contract_unit_price NUMERIC(12, 4),
    price_variance_unit NUMERIC(12, 4) GENERATED ALWAYS AS (
        CASE 
            WHEN contract_unit_price IS NOT NULL 
            THEN billed_unit_cost - contract_unit_price 
            ELSE 0.0000 
        END
    ) STORED,
    price_variance_extended NUMERIC(12, 2) GENERATED ALWAYS AS (
        CASE 
            WHEN contract_unit_price IS NOT NULL 
            THEN (billed_unit_cost - contract_unit_price) * billed_quantity 
            ELSE 0.00 
        END
    ) STORED,

    -- Line Reconciliation Lifecycle
    match_status VARCHAR(30) NOT NULL DEFAULT 'UNMATCHED'
        CHECK (match_status IN (
            'UNMATCHED',                -- Ingested, unmapped to SKU or Case
            'MATCHED_CLEAN',            -- Matched to contract & PO within tolerance
            'PRICE_VARIANCE_BREACH',    -- Billed rate exceeds contract rate
            'QUANTITY_MISMATCH',        -- Invoiced quantity exceeds surgical usage
            'OFF_CONTRACT_UNAUTHORIZED', -- Vendor SKU not covered under contract
            'MANUALLY_APPROVED',        -- Variance explicitly approved by CFO
            'DISPUTED_LINE'             -- Line credited or disputed with vendor
        )),
    variance_reason TEXT,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_invoice_line_number UNIQUE (invoice_id, line_number)
);

CREATE INDEX IF NOT EXISTS idx_isil_sku ON public.implant_supplier_invoice_lines(sku_id);
CREATE INDEX IF NOT EXISTS idx_isil_match_status ON public.implant_supplier_invoice_lines(facility_id, match_status);

-- ==============================================================================
-- 5. TABLE: public.case_device_cost_allocations
-- Authoritative junction assigning verified actual acquisition cost to case_devices
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_device_cost_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_device_id UUID NOT NULL REFERENCES public.case_devices(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Hierarchy Tier Assigned
    cost_hierarchy_tier VARCHAR(40) NOT NULL
        CHECK (cost_hierarchy_tier IN (
            'TIER_1_RECONCILED_INVOICE',     -- Highest certainty: Exact reconciled invoice line
            'TIER_2_ACCRUED_CONTRACT',       -- High certainty: Active approved contract schedule
            'TIER_3_HISTORICAL_MOVING_AVG',  -- Medium: Trailing facility 90-day moving average
            'TIER_4_MANUAL_FINANCE_OVERRIDE', -- Low: Explicitly approved finance override
            'TIER_5_MISSING_UNVERIFIED'      -- Critical blocker: Zero verifiable cost source
        )),

    -- Cost Evidence References
    invoice_line_id UUID REFERENCES public.implant_supplier_invoice_lines(id) ON DELETE SET NULL,
    contract_sku_price_id UUID REFERENCES public.facility_implant_sku_prices(id) ON DELETE SET NULL,
    
    -- Financial Values
    allocated_unit_acquisition_cost NUMERIC(12, 4) NOT NULL CHECK (allocated_unit_acquisition_cost >= 0.0000),
    allocated_quantity INTEGER NOT NULL DEFAULT 1 CHECK (allocated_quantity >= 1),
    allocated_extended_acquisition_cost NUMERIC(12, 2) GENERATED ALWAYS AS (
        allocated_unit_acquisition_cost * allocated_quantity
    ) STORED,

    -- Net Adjustments Applied
    prompt_pay_discount_applied NUMERIC(12, 4) DEFAULT 0.0000,
    freight_allocated NUMERIC(12, 4) DEFAULT 0.0000,
    volume_rebate_accrued NUMERIC(12, 4) DEFAULT 0.0000,

    -- Verification & Immutability Lock
    is_locked_for_billing BOOLEAN NOT NULL DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    allocated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    allocation_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_case_device_cost UNIQUE (case_device_id)
);

CREATE INDEX IF NOT EXISTS idx_cdca_surgery ON public.case_device_cost_allocations(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cdca_facility_tier ON public.case_device_cost_allocations(facility_id, cost_hierarchy_tier);

-- ==============================================================================
-- 6. TABLE: public.implant_benchmark_prices
-- Regional, national, and GPO benchmark distributions for renegotiation analytics
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_benchmark_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = National / GPO baseline
    component_id UUID REFERENCES public.implant_components(id) ON DELETE CASCADE,
    sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE CASCADE,
    
    -- Benchmark Authority
    source_name VARCHAR(100) NOT NULL,
    benchmark_type VARCHAR(30) NOT NULL DEFAULT 'GPO_MEDIAN'
        CHECK (benchmark_type IN ('GPO_MEDIAN', 'REGIONAL_ASC_COHORT', 'CMS_OPPS_MEDIAN', 'INTERNAL_NETWORK_BEST')),
    specialty VARCHAR(50) NOT NULL,
    
    -- Statistical Distribution Values
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    percentile_25_unit_cost NUMERIC(12, 2) NOT NULL CHECK (percentile_25_unit_cost >= 0.00),
    median_unit_cost NUMERIC(12, 2) NOT NULL CHECK (median_unit_cost >= 0.00),
    percentile_75_unit_cost NUMERIC(12, 2) NOT NULL CHECK (percentile_75_unit_cost >= 0.00),
    sample_size_cases INTEGER NOT NULL DEFAULT 100 CHECK (sample_size_cases >= 1),
    
    -- Temporal Validity
    benchmark_year_quarter VARCHAR(10) NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_benchmark_percentiles CHECK (
        percentile_75_unit_cost >= median_unit_cost AND median_unit_cost >= percentile_25_unit_cost
    ),
    CONSTRAINT chk_benchmark_dates CHECK (effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_ibp_component ON public.implant_benchmark_prices(component_id);
CREATE INDEX IF NOT EXISTS idx_ibp_sku ON public.implant_benchmark_prices(sku_id);

-- ==============================================================================
-- 7. TABLE: public.facility_implant_price_audits
-- Immutable ledger tracking before/after mutations to price schedules and costs
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.facility_implant_price_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    entity_name VARCHAR(50) NOT NULL,
    record_id UUID NOT NULL,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE', 'OVERRIDE', 'RECONCILE')),
    old_values JSONB,
    new_values JSONB,
    performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fipa_record ON public.facility_implant_price_audits(entity_name, record_id);
CREATE INDEX IF NOT EXISTS idx_fipa_facility_date ON public.facility_implant_price_audits(facility_id, created_at DESC);

-- ==============================================================================
-- 8. INTEGRITY TRIGGERS & PROCEDURES
-- ==============================================================================

-- Trigger 8.1: Prevent modification of locked case cost allocations
CREATE OR REPLACE FUNCTION public.fn_prevent_locked_case_cost_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_locked_for_billing = TRUE THEN
        RAISE EXCEPTION 'COMPLIANCE VIOLATION: Case cost allocation % is locked for billing and cannot be mutated or deleted.', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lock_case_cost ON public.case_device_cost_allocations;
CREATE TRIGGER trg_lock_case_cost
    BEFORE UPDATE OR DELETE ON public.case_device_cost_allocations
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_locked_case_cost_mutation();

-- Trigger 8.2: Sync surgeries.implants_cost from case_devices
CREATE OR REPLACE FUNCTION public.fn_sync_surgery_implants_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_surgery_id BIGINT;
    v_total NUMERIC(12, 2);
BEGIN
    v_surgery_id := COALESCE(NEW.surgery_id, OLD.surgery_id);
    
    SELECT COALESCE(SUM(total_cost), 0.00)
    INTO v_total
    FROM public.case_devices
    WHERE surgery_id = v_surgery_id AND usage_status = 'IMPLANTED';
    
    UPDATE public.surgeries
    SET implants_cost = v_total,
        updated_at = NOW()
    WHERE id = v_surgery_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_surgery_implants_cost ON public.case_devices;
CREATE TRIGGER trg_sync_surgery_implants_cost
    AFTER INSERT OR UPDATE OR DELETE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_surgery_implants_cost();

-- Procedure 8.3: Deterministic Price Hierarchy Resolution
CREATE OR REPLACE FUNCTION public.fn_resolve_sku_price_hierarchy(
    p_facility_id UUID,
    p_sku_id UUID,
    p_surgery_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    resolved_unit_cost NUMERIC(12, 4),
    hierarchy_tier VARCHAR(40),
    source_reference VARCHAR(150),
    discount_off_list NUMERIC(5, 2),
    currency VARCHAR(3),
    is_authorized BOOLEAN
) AS $$
DECLARE
    v_sku RECORD;
    v_contract_price RECORD;
    v_scope RECORD;
BEGIN
    -- 1. Fetch SKU baseline
    SELECT s.id, s.vendor_id, s.component_id, s.list_price
    INTO v_sku
    FROM public.implant_product_skus s
    WHERE s.id = p_sku_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 0.0000, 'TIER_5_MISSING_UNVERIFIED'::VARCHAR(40), 'SKU Not Found'::VARCHAR(150), 0.00::NUMERIC(5, 2), 'USD'::VARCHAR(3), FALSE;
        RETURN;
    END IF;

    -- Step 1: Active itemized contract price schedule
    SELECT p.contract_unit_price, p.discount_off_list_percent, ps.schedule_code, ps.currency
    INTO v_contract_price
    FROM public.facility_implant_sku_prices p
    JOIN public.facility_implant_price_schedules ps ON p.price_schedule_id = ps.id
    WHERE p.facility_id = p_facility_id
      AND p.sku_id = p_sku_id
      AND p.is_active = TRUE
      AND ps.is_active = TRUE
      AND p_surgery_date >= p.effective_from
      AND p_surgery_date <= p.effective_to
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT 
            v_contract_price.contract_unit_price,
            'TIER_1_CONTRACT_SCHEDULE'::VARCHAR(40),
            format('Schedule %s', v_contract_price.schedule_code)::VARCHAR(150),
            v_contract_price.discount_off_list_percent,
            v_contract_price.currency,
            TRUE;
        RETURN;
    END IF;

    -- Step 2: Contract Scope Discount applied to list_price
    SELECT cs.tier_discount_percent, c.contract_number
    INTO v_scope
    FROM public.facility_vendor_contract_scopes cs
    JOIN public.facility_vendor_contracts c ON cs.contract_id = c.id
    WHERE c.facility_id = p_facility_id
      AND c.vendor_id = v_sku.vendor_id
      AND c.is_active = TRUE
      AND cs.is_active = TRUE
      AND cs.is_excluded = FALSE
      AND p_surgery_date >= c.effective_from
      AND p_surgery_date <= c.effective_to
      AND (
          cs.scope_type = 'ALL_VENDOR_PRODUCTS' OR
          (cs.scope_type = 'COMPONENT' AND cs.component_id = v_sku.component_id) OR
          (cs.scope_type = 'SKU_LINE_ITEM' AND cs.sku_id = p_sku_id)
      )
    ORDER BY 
        CASE cs.scope_type
            WHEN 'SKU_LINE_ITEM' THEN 1
            WHEN 'COMPONENT' THEN 2
            WHEN 'ALL_VENDOR_PRODUCTS' THEN 3
            ELSE 4
        END
    LIMIT 1;

    IF FOUND AND v_scope.tier_discount_percent > 0 THEN
        RETURN QUERY SELECT 
            ROUND(v_sku.list_price * (1 - (v_scope.tier_discount_percent / 100.0)), 4),
            'TIER_2_CONTRACT_SCOPE_DISCOUNT'::VARCHAR(40),
            format('Contract %s (Scope %s%%)', v_scope.contract_number, v_scope.tier_discount_percent)::VARCHAR(150),
            v_scope.tier_discount_percent,
            'USD'::VARCHAR(3),
            TRUE;
        RETURN;
    END IF;

    -- Step 3: Off-Contract Fallback
    RETURN QUERY SELECT 
        v_sku.list_price,
        'TIER_5_LIST_PRICE_UNVERIFIED'::VARCHAR(40),
        'Catalog List Price (Off-Contract)'::VARCHAR(150),
        0.00::NUMERIC(5, 2),
        'USD'::VARCHAR(3),
        FALSE;
    RETURN;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 9. ROW-LEVEL SECURITY POLICIES
-- ==============================================================================

ALTER TABLE public.facility_implant_price_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_implant_sku_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_supplier_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_device_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_benchmark_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_implant_price_audits ENABLE ROW LEVEL SECURITY;

-- Price Schedules
CREATE POLICY "facility_implant_price_schedules_select" ON public.facility_implant_price_schedules
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "facility_implant_price_schedules_modify" ON public.facility_implant_price_schedules
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- SKU Prices
CREATE POLICY "facility_implant_sku_prices_select" ON public.facility_implant_sku_prices
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "facility_implant_sku_prices_modify" ON public.facility_implant_sku_prices
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Supplier Invoices
CREATE POLICY "implant_supplier_invoices_select" ON public.implant_supplier_invoices
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "implant_supplier_invoices_modify" ON public.implant_supplier_invoices
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Invoice Lines
CREATE POLICY "implant_supplier_invoice_lines_select" ON public.implant_supplier_invoice_lines
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "implant_supplier_invoice_lines_modify" ON public.implant_supplier_invoice_lines
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Cost Allocations
CREATE POLICY "case_device_cost_allocations_select" ON public.case_device_cost_allocations
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

CREATE POLICY "case_device_cost_allocations_modify" ON public.case_device_cost_allocations
    FOR ALL TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    )
    WITH CHECK (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- Benchmark Prices (Accessible globally or by facility)
CREATE POLICY "implant_benchmark_prices_select" ON public.implant_benchmark_prices
    FOR SELECT TO authenticated
    USING (
        (facility_id IS NULL OR facility_id IN (SELECT public.get_auth_user_facilities()))
    );

-- Price Audits
CREATE POLICY "facility_implant_price_audits_select" ON public.facility_implant_price_audits
    FOR SELECT TO authenticated
    USING (
        facility_id IN (SELECT public.get_auth_user_facilities())
    );

-- ==============================================================================
-- 10. SEED BASELINE DATA (Naples Surgery Center: 00000000-0000-0000-0000-000000000002)
-- ==============================================================================

DO $$
DECLARE
    v_fac_id UUID := '00000000-0000-0000-0000-000000000002';
    v_stryker_id UUID := '00000000-0000-0000-0053-000000000001';
    v_zim_id UUID := '00000000-0000-0000-0053-000000000002';
    v_admin_id UUID := '00000000-0000-0000-0001-000000000001';
    v_cfo_id UUID := '00000000-0000-0000-0001-000000000002';
    v_contract_id UUID;
    v_schedule_id UUID;
    v_invoice_id UUID;
    v_femoral_sku UUID := '00000000-0000-0000-0054-000000000001';
    v_tibial_sku UUID := '00000000-0000-0000-0054-000000000002';
    v_insert_sku UUID := '00000000-0000-0000-0054-000000000003';
    v_patella_sku UUID := '00000000-0000-0000-0054-000000000004';
BEGIN
    -- Check if vendor and SKUs exist
    IF EXISTS (SELECT 1 FROM public.implant_vendors WHERE id = v_stryker_id) AND
       EXISTS (SELECT 1 FROM public.implant_product_skus WHERE id = v_femoral_sku) THEN

        -- Find Stryker contract
        SELECT id INTO v_contract_id
        FROM public.facility_vendor_contracts
        WHERE facility_id = v_fac_id AND vendor_id = v_stryker_id
        LIMIT 1;

        -- 1. Create Price Schedule
        INSERT INTO public.facility_implant_price_schedules (
            id, facility_id, vendor_id, contract_id, schedule_code, schedule_name,
            description, pricing_model, currency, effective_from, effective_to,
            status, is_active, approved_by, approved_at, created_by
        ) VALUES (
            '00000000-0000-0000-0057-000000000001',
            v_fac_id, v_stryker_id, v_contract_id, 'SCH-STR-2026-01',
            'Stryker Orthopaedics Master Joint Fee Schedule 2026',
            'Authoritative contracted unit prices for Triathlon Knee & Accolade Hip items',
            'FIXED_FEE_SCHEDULE', 'USD', '2026-01-01', '2026-12-31',
            'active', TRUE, v_cfo_id, NOW(), v_admin_id
        ) ON CONFLICT (id) DO NOTHING;

        -- 2. Itemized SKU Prices
        INSERT INTO public.facility_implant_sku_prices (
            id, price_schedule_id, facility_id, sku_id, vendor_id,
            contract_unit_price, list_price_at_signing, unit_of_measure, package_quantity,
            effective_from, effective_to, status, is_active
        ) VALUES
        (
            '00000000-0000-0000-0057-skuprice-0001',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_femoral_sku, v_stryker_id,
            1450.0000, 2850.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        ),
        (
            '00000000-0000-0000-0057-skuprice-0002',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_tibial_sku, v_stryker_id,
            980.0000, 1950.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        ),
        (
            '00000000-0000-0000-0057-skuprice-0003',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_insert_sku, v_stryker_id,
            550.0000, 1200.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        ),
        (
            '00000000-0000-0000-0057-skuprice-0004',
            '00000000-0000-0000-0057-000000000001', v_fac_id, v_patella_sku, v_stryker_id,
            320.0000, 650.0000, 'EA', 1, '2026-01-01', '2026-12-31', 'active', TRUE
        )
        ON CONFLICT DO NOTHING;

        -- 3. Supplier Invoice Example
        INSERT INTO public.implant_supplier_invoices (
            id, facility_id, vendor_id, contract_id, invoice_number,
            invoice_date, due_date, subtotal_amount, freight_amount, tax_amount,
            discount_amount, total_amount, reconciliation_status, approved_by, approved_at
        ) VALUES (
            '00000000-0000-0000-0057-invoice-0001',
            v_fac_id, v_stryker_id, v_contract_id, 'INV-STR-2026-8901',
            '2026-02-15', '2026-03-17', 3300.00, 0.00, 0.00, 66.00, 3234.00,
            'fully_matched', v_cfo_id, NOW()
        ) ON CONFLICT (id) DO NOTHING;

        -- 4. Supplier Invoice Lines
        INSERT INTO public.implant_supplier_invoice_lines (
            id, invoice_id, facility_id, line_number, sku_id,
            vendor_catalog_number, vendor_description, billed_quantity,
            billed_unit_cost, extended_cost, contract_sku_price_id, contract_unit_price,
            match_status
        ) VALUES
        (
            '00000000-0000-0000-0057-invline-0001',
            '00000000-0000-0000-0057-invoice-0001', v_fac_id, 1, v_femoral_sku,
            '5510-F-401', 'Triathlon CR Femoral Component Size 4', 1,
            1450.0000, 1450.00, '00000000-0000-0000-0057-skuprice-0001', 1450.0000,
            'MATCHED_CLEAN'
        ),
        (
            '00000000-0000-0000-0057-invline-0002',
            '00000000-0000-0000-0057-invoice-0001', v_fac_id, 2, v_tibial_sku,
            '5520-B-400', 'Triathlon Primary Tibial Baseplate Size 4', 1,
            980.0000, 980.00, '00000000-0000-0000-0057-skuprice-0002', 980.0000,
            'MATCHED_CLEAN'
        )
        ON CONFLICT DO NOTHING;

        -- 5. Benchmark Data
        INSERT INTO public.implant_benchmark_prices (
            id, facility_id, sku_id, source_name, benchmark_type, specialty,
            percentile_25_unit_cost, median_unit_cost, percentile_75_unit_cost,
            sample_size_cases, benchmark_year_quarter, effective_from, effective_to
        ) VALUES
        (
            '00000000-0000-0000-0057-bench-0001',
            v_fac_id, v_femoral_sku, 'Vizient Regional ASC Cohort', 'REGIONAL_ASC_COHORT', 'Orthopedics',
            1320.00, 1460.00, 1680.00, 240, '2026-Q1', '2026-01-01', '2026-12-31'
        ),
        (
            '00000000-0000-0000-0057-bench-0002',
            v_fac_id, v_tibial_sku, 'Vizient Regional ASC Cohort', 'REGIONAL_ASC_COHORT', 'Orthopedics',
            890.00, 995.00, 1150.00, 240, '2026-Q1', '2026-01-01', '2026-12-31'
        )
        ON CONFLICT DO NOTHING;

    END IF;
END $$;

COMMIT;
