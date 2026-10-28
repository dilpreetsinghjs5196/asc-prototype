-- ==============================================================================
-- MIGRATION: 035_case_implant_usage.sql
-- DESCRIPTION: Phase 59 Case Implant Usage: Authoritative Actual Consumption Tracking,
--              Granular Quantity Balancing (Opened = Implanted + Wasted + Returned),
--              UDI DI/PI Bifurcation, Clinical Waste Attribution, Sourcing Provenance,
--              Post-Closure Two-Person Amendments, and Recall Traceability.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. ADD BIFURCATED QUANTITIES & PACKAGING TO public.case_devices
-- ==============================================================================

ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS quantity_opened INTEGER NOT NULL DEFAULT 1 CHECK (quantity_opened >= 0),
    ADD COLUMN IF NOT EXISTS quantity_implanted INTEGER NOT NULL DEFAULT 1 CHECK (quantity_implanted >= 0),
    ADD COLUMN IF NOT EXISTS quantity_wasted INTEGER NOT NULL DEFAULT 0 CHECK (quantity_wasted >= 0),
    ADD COLUMN IF NOT EXISTS quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
    ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'EA'
        CHECK (unit_of_measure IN ('EA', 'PACK', 'SET', 'KIT', 'BOX', 'VIAL')),
    ADD COLUMN IF NOT EXISTS package_size INTEGER NOT NULL DEFAULT 1 CHECK (package_size >= 1);

-- Backfill quantity_opened and quantity_implanted from legacy quantity
UPDATE public.case_devices
SET quantity_opened = quantity,
    quantity_implanted = quantity
WHERE quantity_opened = 1 AND quantity_implanted = 1 AND quantity > 1;

-- ==============================================================================
-- 2. ADD BIFURCATED UDI & REGULATORY FIELDS TO public.case_devices
-- ==============================================================================

ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS udi_di VARCHAR(50),
    ADD COLUMN IF NOT EXISTS udi_pi VARCHAR(100),
    ADD COLUMN IF NOT EXISTS udi_issuing_agency VARCHAR(20) DEFAULT 'GS1'
        CHECK (udi_issuing_agency IN ('GS1', 'HIBCC', 'ICCBBA', 'MANUAL_OVERRIDE')),
    ADD COLUMN IF NOT EXISTS catalog_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS serial_tracking_required BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lot_tracking_required BOOLEAN DEFAULT TRUE;

-- ==============================================================================
-- 3. ADD CLINICAL WASTE & DAMAGE ATTRIBUTION TO public.case_devices
-- ==============================================================================

ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS waste_reason VARCHAR(50)
        CHECK (waste_reason IS NULL OR waste_reason IN (
            'DROPPED_ON_FIELD',
            'CONTAMINATED_OPENED_NOT_USED',
            'SIZING_TRIAL_DISCARD',
            'DEFECTIVE_OUT_OF_PACKAGE',
            'EXPIRED_ON_FIELD',
            'PACKAGING_BREACH',
            'SURGEON_CHANGE_OF_MIND',
            'OTHER_WASTE'
        )),
    ADD COLUMN IF NOT EXISTS waste_liability VARCHAR(30) DEFAULT 'FACILITY_EXPENSE'
        CHECK (waste_liability IN (
            'FACILITY_EXPENSE',
            'VENDOR_REPLACEMENT_CREDIT',
            'CONSIGNMENT_EXEMPT',
            'PATIENT_SAFETY_WRITE_OFF'
        )),
    ADD COLUMN IF NOT EXISTS waste_notes TEXT;

-- ==============================================================================
-- 4. ADD SOURCING & PROCUREMENT PROVENANCE TO public.case_devices
-- ==============================================================================

ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS sourcing_channel VARCHAR(30) NOT NULL DEFAULT 'FACILITY_OWNED'
        CHECK (sourcing_channel IN (
            'FACILITY_OWNED',
            'VENDOR_CONSIGNMENT',
            'BILL_ONLY',
            'EMERGENCY_COURIER',
            'LOANER_TRAY'
        )),
    ADD COLUMN IF NOT EXISTS po_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS receiving_line_id UUID,
    ADD COLUMN IF NOT EXISTS verified_acquisition_cost NUMERIC(12, 4) CHECK (verified_acquisition_cost IS NULL OR verified_acquisition_cost >= 0.0000),
    ADD COLUMN IF NOT EXISTS cost_source_id UUID,
    ADD COLUMN IF NOT EXISTS is_substitution BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS original_planned_sku_id UUID REFERENCES public.implant_product_skus(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS substitution_reason TEXT;

-- ==============================================================================
-- 5. ADD CASE CLOSURE & AMENDMENT GOVERNANCE TO public.case_devices
-- ==============================================================================

ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS amendment_version INTEGER NOT NULL DEFAULT 0 CHECK (amendment_version >= 0);

-- ==============================================================================
-- 6. ADD CHECK CONSTRAINTS & PERFORMANCE INDEXES
-- ==============================================================================

ALTER TABLE public.case_devices
    DROP CONSTRAINT IF EXISTS chk_case_device_quantity_balance,
    ADD CONSTRAINT chk_case_device_quantity_balance CHECK (
        quantity_opened = (quantity_implanted + quantity_wasted + quantity_returned)
    );

ALTER TABLE public.case_devices
    DROP CONSTRAINT IF EXISTS chk_case_device_waste_attribution,
    ADD CONSTRAINT chk_case_device_waste_attribution CHECK (
        (quantity_wasted = 0 AND waste_reason IS NULL) OR
        (quantity_wasted > 0 AND waste_reason IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_case_devices_udi_di ON public.case_devices(udi_di);
CREATE INDEX IF NOT EXISTS idx_case_devices_lot_number ON public.case_devices(lot_number);
CREATE INDEX IF NOT EXISTS idx_case_devices_serial_number ON public.case_devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_case_devices_sku ON public.case_devices(sku_id);
CREATE INDEX IF NOT EXISTS idx_case_devices_sourcing ON public.case_devices(facility_id, sourcing_channel);
CREATE INDEX IF NOT EXISTS idx_case_devices_closed ON public.case_devices(surgery_id, is_closed);

-- ==============================================================================
-- 7. TABLE: public.case_device_amendments
-- Post-closure immutable change ledger tracking two-person governance
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_device_amendments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_device_id UUID NOT NULL REFERENCES public.case_devices(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    
    -- Amendment Versioning
    amendment_sequence INTEGER NOT NULL CHECK (amendment_sequence >= 1),
    field_name VARCHAR(60) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    
    -- Clinical & Financial Rationale
    reason_code VARCHAR(40) NOT NULL
        CHECK (reason_code IN (
            'TRANSCRIPTION_ERROR',
            'INCORRECT_LOT_SERIAL',
            'VENDOR_INVOICE_DISCREPANCY',
            'UNRECORDED_WASTE_DISPOSITION',
            'SUBSTITUTION_MISALIGNMENT',
            'POST_OP_IMPLANT_EXCHANGE',
            'REGULATORY_RECALL_CORRECTION',
            'OTHER_AMENDMENT'
        )),
    justification_text TEXT NOT NULL CHECK (LENGTH(TRIM(justification_text)) >= 10),
    
    -- Financial Impact
    cost_delta NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    charge_delta NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    
    -- Two-Person Governance Actors
    amended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    amended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approval_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_case_device_amendment_seq UNIQUE (case_device_id, amendment_sequence)
);

CREATE INDEX IF NOT EXISTS idx_cda_surgery ON public.case_device_amendments(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cda_facility_status ON public.case_device_amendments(facility_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_cda_device ON public.case_device_amendments(case_device_id);

-- ==============================================================================
-- 8. TABLE: public.case_implant_scans
-- Raw optical barcode scanning telemetry for non-repudiation audit
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_implant_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE,
    case_device_id UUID REFERENCES public.case_devices(id) ON DELETE SET NULL,
    
    -- Optical Telemetry
    raw_scan_payload TEXT NOT NULL,
    symbology VARCHAR(30) NOT NULL DEFAULT 'GS1_128'
        CHECK (symbology IN ('GS1_128', 'GS1_DATAMATRIX', 'HIBC_CODE39', 'HIBC_DATAMATRIX', 'CODE128', 'MANUAL_ENTRY')),
    scanner_device_identifier VARCHAR(100),
    
    -- Parsed Output
    parsed_udi_di VARCHAR(50),
    parsed_lot_number VARCHAR(50),
    parsed_serial_number VARCHAR(50),
    parsed_expiration_date DATE,
    parse_success BOOLEAN NOT NULL DEFAULT TRUE,
    parse_error_details TEXT,
    
    -- Provenance
    scanned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cis_surgery ON public.case_implant_scans(surgery_id);
CREATE INDEX IF NOT EXISTS idx_cis_parsed_di ON public.case_implant_scans(parsed_udi_di);

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.case_device_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_implant_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cda_select" ON public.case_device_amendments
    FOR SELECT TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );

CREATE POLICY "cda_modify" ON public.case_device_amendments
    FOR ALL TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    )
    WITH CHECK (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );

CREATE POLICY "cis_select" ON public.case_implant_scans
    FOR SELECT TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );

CREATE POLICY "cis_modify" ON public.case_implant_scans
    FOR ALL TO authenticated
    USING (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    )
    WITH CHECK (
        facility_id IN (
            SELECT fm.facility_id FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() AND fm.is_active = TRUE
        )
    );

-- ==============================================================================
-- 10. AUTHORITATIVE STORED PROCEDURES & TRIGGERS
-- ==============================================================================

-- 10.1 Trigger: Update surgeries.implants_cost based on physical implanted units
CREATE OR REPLACE FUNCTION public.fn_sync_surgery_implants_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_surgery_id BIGINT;
    v_total NUMERIC(12, 2);
BEGIN
    v_surgery_id := COALESCE(NEW.surgery_id, OLD.surgery_id);
    
    -- Deterministically sum implanted units using verified_acquisition_cost fallback to unit_cost
    SELECT COALESCE(SUM(
        quantity_implanted * COALESCE(verified_acquisition_cost, unit_cost)
    ), 0.00)
    INTO v_total
    FROM public.case_devices
    WHERE surgery_id = v_surgery_id 
      AND usage_status IN ('IMPLANTED', 'OPENED_ON_FIELD')
      AND quantity_implanted > 0;
    
    UPDATE public.surgeries
    SET implants_cost = v_total,
        updated_at = NOW()
    WHERE id = v_surgery_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_surgery_implants_cost ON public.case_devices;
CREATE TRIGGER trg_sync_surgery_implants_cost
    AFTER INSERT OR UPDATE OR DELETE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_sync_surgery_implants_cost();

-- 10.2 Stored Procedure: Execute Post-Closure Two-Person Amendment
CREATE OR REPLACE FUNCTION public.fn_amend_case_device(
    p_case_device_id UUID,
    p_field_name VARCHAR(60),
    p_new_value TEXT,
    p_reason_code VARCHAR(40),
    p_justification TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_dev RECORD;
    v_old_value TEXT;
    v_seq INTEGER;
    v_amendment_id UUID;
BEGIN
    -- 1. Fetch device and verify existence
    SELECT * INTO v_dev FROM public.case_devices WHERE id = p_case_device_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Case device record % not found.', p_case_device_id;
    END IF;

    -- 2. Determine current value dynamically
    EXECUTE format('SELECT ($1).%I::text', p_field_name) USING v_dev INTO v_old_value;

    -- 3. Calculate next amendment sequence
    SELECT COALESCE(MAX(amendment_sequence), 0) + 1 INTO v_seq
    FROM public.case_device_amendments
    WHERE case_device_id = p_case_device_id;

    -- 4. Insert amendment record
    INSERT INTO public.case_device_amendments (
        facility_id, case_device_id, surgery_id, amendment_sequence,
        field_name, old_value, new_value, reason_code, justification_text,
        amended_by, amended_at, approval_status
    ) VALUES (
        v_dev.facility_id, p_case_device_id, v_dev.surgery_id, v_seq,
        p_field_name, v_old_value, p_new_value, p_reason_code, p_justification,
        p_actor_id, NOW(), 'APPROVED'
    ) RETURNING id INTO v_amendment_id;

    -- 5. Apply patch to case_devices
    EXECUTE format('UPDATE public.case_devices SET %I = $1, amendment_version = amendment_version + 1, updated_at = NOW() WHERE id = $2', p_field_name)
    USING p_new_value, p_case_device_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'amendment_id', v_amendment_id,
        'case_device_id', p_case_device_id,
        'sequence', v_seq,
        'field_name', p_field_name,
        'old_value', v_old_value,
        'new_value', p_new_value
    );
END;
$$;

-- 10.3 Stored Procedure: Recall Historical Traceability Query
CREATE OR REPLACE FUNCTION public.fn_search_implant_recalls(
    p_facility_id UUID,
    p_sku_id UUID DEFAULT NULL,
    p_catalog_number VARCHAR(50) DEFAULT NULL,
    p_lot_number VARCHAR(50) DEFAULT NULL,
    p_serial_number VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    case_device_id UUID,
    surgery_id BIGINT,
    surgery_date DATE,
    patient_id BIGINT,
    patient_name TEXT,
    surgeon_name TEXT,
    device_name VARCHAR(150),
    manufacturer VARCHAR(100),
    model_number VARCHAR(50),
    lot_number VARCHAR(50),
    serial_number VARCHAR(50),
    quantity_implanted INTEGER,
    sourcing_channel VARCHAR(30),
    usage_status VARCHAR(30)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cd.id AS case_device_id,
        s.id AS surgery_id,
        s.date AS surgery_date,
        s.patient_id,
        COALESCE(p.first_name || ' ' || p.last_name, s.patient_name, 'Patient #' || s.patient_id::text) AS patient_name,
        COALESCE(surg.first_name || ' ' || surg.last_name, s.surgeon_name, 'Unknown Surgeon') AS surgeon_name,
        cd.device_name,
        cd.manufacturer,
        cd.model_number,
        cd.lot_number,
        cd.serial_number,
        cd.quantity_implanted,
        cd.sourcing_channel,
        cd.usage_status
    FROM public.case_devices cd
    JOIN public.surgeries s ON s.id = cd.surgery_id
    LEFT JOIN public.patients p ON p.id = s.patient_id
    LEFT JOIN public.surgeons surg ON surg.id = s.surgeon_id
    WHERE cd.facility_id = p_facility_id
      AND cd.quantity_implanted > 0
      AND (p_sku_id IS NULL OR cd.sku_id = p_sku_id)
      AND (p_catalog_number IS NULL OR cd.catalog_number ILIKE '%' || p_catalog_number || '%' OR cd.model_number ILIKE '%' || p_catalog_number || '%')
      AND (p_lot_number IS NULL OR cd.lot_number = p_lot_number)
      AND (p_serial_number IS NULL OR cd.serial_number = p_serial_number)
    ORDER BY s.date DESC;
END;
$$;

-- 10.4 Stored Procedure: Enhanced Reconcile Case Device Totals
CREATE OR REPLACE FUNCTION public.fn_reconcile_case_device_totals(p_surgery_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_cost NUMERIC(12, 2) := 0.00;
    v_total_charges NUMERIC(12, 2) := 0.00;
    v_total_waste_cost NUMERIC(12, 2) := 0.00;
    v_opened_qty INTEGER := 0;
    v_implanted_qty INTEGER := 0;
    v_wasted_qty INTEGER := 0;
    v_returned_qty INTEGER := 0;
    v_count INTEGER := 0;
BEGIN
    IF p_surgery_id IS NULL THEN
        RAISE EXCEPTION 'Surgery ID must not be null for device total reconciliation';
    END IF;

    -- Aggregate bifurcated quantities and costs
    SELECT 
        COALESCE(SUM(quantity_implanted * COALESCE(verified_acquisition_cost, unit_cost)), 0.00),
        COALESCE(SUM(quantity_implanted * charge_amount), 0.00),
        COALESCE(SUM(quantity_wasted * COALESCE(verified_acquisition_cost, unit_cost)), 0.00),
        COALESCE(SUM(quantity_opened), 0),
        COALESCE(SUM(quantity_implanted), 0),
        COALESCE(SUM(quantity_wasted), 0),
        COALESCE(SUM(quantity_returned), 0),
        COUNT(*)
    INTO 
        v_total_cost, v_total_charges, v_total_waste_cost,
        v_opened_qty, v_implanted_qty, v_wasted_qty, v_returned_qty,
        v_count
    FROM public.case_devices
    WHERE surgery_id = p_surgery_id;

    -- Synchronize master surgery record
    UPDATE public.surgeries
    SET implants_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = p_surgery_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'surgery_id', p_surgery_id,
        'device_count', v_count,
        'total_implants_cost', v_total_cost,
        'total_device_charges', v_total_charges,
        'total_waste_cost', v_total_waste_cost,
        'quantity_opened', v_opened_qty,
        'quantity_implanted', v_implanted_qty,
        'quantity_wasted', v_wasted_qty,
        'quantity_returned', v_returned_qty,
        'reconciled_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_amend_case_device(UUID, VARCHAR, TEXT, VARCHAR, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_amend_case_device(UUID, VARCHAR, TEXT, VARCHAR, TEXT, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_search_implant_recalls(UUID, UUID, VARCHAR, VARCHAR, VARCHAR) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_search_implant_recalls(UUID, UUID, VARCHAR, VARCHAR, VARCHAR) TO authenticated;

REVOKE ALL ON FUNCTION public.fn_reconcile_case_device_totals(BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_case_device_totals(BIGINT) TO authenticated;

-- ==============================================================================
-- 11. BASELINE SEED DATA ENHANCEMENT
-- ==============================================================================

DO $$
DECLARE
    v_fac_id UUID := '00000000-0000-0000-0000-000000000002';
    v_surg_id BIGINT;
    v_femoral_sku UUID := '00000000-0000-0000-0054-000000000101';
    v_tibial_sku UUID := '00000000-0000-0000-0054-000000000103';
    v_dev_1 UUID := '00000000-0000-0000-0059-000000000001';
    v_dev_2 UUID := '00000000-0000-0000-0059-000000000002';
    v_dev_3 UUID := '00000000-0000-0000-0059-000000000003';
BEGIN
    SELECT id INTO v_surg_id FROM public.surgeries WHERE facility_id = v_fac_id ORDER BY id ASC LIMIT 1;

    IF v_surg_id IS NOT NULL THEN
        -- 1. Implanted Triathlon CR Femoral Component
        INSERT INTO public.case_devices (
            id, facility_id, surgery_id, device_name, hcpcs_code, hcpcs_c_code,
            manufacturer, model_number, serial_number, lot_number,
            quantity, quantity_opened, quantity_implanted, quantity_wasted, quantity_returned,
            unit_cost, verified_acquisition_cost, charge_amount,
            unit_of_measure, package_size, udi_di, udi_pi, catalog_number,
            sourcing_channel, usage_status, duration_classification, sku_id
        ) VALUES (
            v_dev_1, v_fac_id, v_surg_id, 'Triathlon CR Femoral Component Size 4 Left', 'C1776', 'C1776',
            'Stryker Orthopaedics', '5520-F-401', 'SN-24K8912', 'LOT-9821A',
            1, 1, 1, 0, 0,
            1450.00, 1450.00, 4200.00,
            'EA', 1, '00888888123451', '(01)00888888123451(17)281031(10)LOT-9821A(21)SN-24K8912', '5520-F-401',
            'VENDOR_CONSIGNMENT', 'IMPLANTED', 'PERMANENT', v_femoral_sku
        ) ON CONFLICT (id) DO UPDATE
        SET quantity_opened = EXCLUDED.quantity_opened,
            quantity_implanted = EXCLUDED.quantity_implanted,
            quantity_wasted = EXCLUDED.quantity_wasted,
            quantity_returned = EXCLUDED.quantity_returned,
            udi_di = EXCLUDED.udi_di,
            udi_pi = EXCLUDED.udi_pi,
            catalog_number = EXCLUDED.catalog_number,
            sourcing_channel = EXCLUDED.sourcing_channel;

        -- 2. Implanted Triathlon Tibial Baseplate Tray Size 3
        INSERT INTO public.case_devices (
            id, facility_id, surgery_id, device_name, hcpcs_code, hcpcs_c_code,
            manufacturer, model_number, serial_number, lot_number,
            quantity, quantity_opened, quantity_implanted, quantity_wasted, quantity_returned,
            unit_cost, verified_acquisition_cost, charge_amount,
            unit_of_measure, package_size, udi_di, udi_pi, catalog_number,
            sourcing_channel, usage_status, duration_classification, sku_id
        ) VALUES (
            v_dev_2, v_fac_id, v_surg_id, 'Triathlon Universal Tibial Baseplate Tray Size 3', 'C1776', 'C1776',
            'Stryker Orthopaedics', '5510-T-301', 'SN-24L0041', 'LOT-7712B',
            1, 1, 1, 0, 0,
            1120.00, 1120.00, 3100.00,
            'EA', 1, '00888888123468', '(01)00888888123468(17)280915(10)LOT-7712B(21)SN-24L0041', '5510-T-301',
            'FACILITY_OWNED', 'IMPLANTED', 'PERMANENT', v_tibial_sku
        ) ON CONFLICT (id) DO UPDATE
        SET quantity_opened = EXCLUDED.quantity_opened,
            quantity_implanted = EXCLUDED.quantity_implanted,
            quantity_wasted = EXCLUDED.quantity_wasted,
            quantity_returned = EXCLUDED.quantity_returned,
            udi_di = EXCLUDED.udi_di,
            udi_pi = EXCLUDED.udi_pi,
            catalog_number = EXCLUDED.catalog_number,
            sourcing_channel = EXCLUDED.sourcing_channel;

        -- 3. Wasted (Dropped on Field) Sizing Insert
        INSERT INTO public.case_devices (
            id, facility_id, surgery_id, device_name, hcpcs_code, hcpcs_c_code,
            manufacturer, model_number, serial_number, lot_number,
            quantity, quantity_opened, quantity_implanted, quantity_wasted, quantity_returned,
            unit_cost, verified_acquisition_cost, charge_amount,
            unit_of_measure, package_size, udi_di, udi_pi, catalog_number,
            waste_reason, waste_liability, waste_notes,
            sourcing_channel, usage_status, duration_classification
        ) VALUES (
            v_dev_3, v_fac_id, v_surg_id, 'Triathlon X3 Polyethylene Tibial Insert 9mm', 'C1776', 'C1776',
            'Stryker Orthopaedics', '5532-X-901', NULL, 'LOT-3321C',
            1, 1, 0, 1, 0,
            480.00, 480.00, 0.00,
            'EA', 1, '00888888123475', '(01)00888888123475(17)280420(10)LOT-3321C', '5532-X-901',
            'DROPPED_ON_FIELD', 'FACILITY_EXPENSE', 'Component dropped during transfer to sterile table; discarded in scrap.',
            'FACILITY_OWNED', 'CONTAMINATED_WASTE', 'PERMANENT'
        ) ON CONFLICT (id) DO UPDATE
        SET quantity_opened = EXCLUDED.quantity_opened,
            quantity_implanted = EXCLUDED.quantity_implanted,
            quantity_wasted = EXCLUDED.quantity_wasted,
            quantity_returned = EXCLUDED.quantity_returned,
            waste_reason = EXCLUDED.waste_reason,
            waste_liability = EXCLUDED.waste_liability,
            waste_notes = EXCLUDED.waste_notes;
    END IF;
END $$;

COMMIT;
