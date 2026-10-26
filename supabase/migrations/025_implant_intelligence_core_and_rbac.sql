-- ==============================================================================
-- MIGRATION 025: IMPLANT INTELLIGENCE CORE, CASE DEVICES HARDENING & RBAC (PHASE 50)
-- ==============================================================================
-- Description: Establishes enterprise foundation for the Implant Intelligence Module:
--              1. Registers 11 canonical implants.* permissions in permissions catalog.
--              2. Maps implant permissions to system roles (CFO, Clinical Mgr, Biller, etc.).
--              3. Hardens public.case_devices with total_cost, total_charge generated columns.
--              4. Extends case_devices with invoice_number, expiration_date, UDI, duration.
--              5. Attaches trg_audit_case_devices to immutable public.audit_logs ledger.
--              6. Attaches trg_prevent_facility_relocation_case_devices for tenant protection.
--              7. Implements authoritative stored procedure fn_reconcile_case_device_totals.
-- Specification: docs/phases/50_IMPLANT_INTELLIGENCE_OVERVIEW.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. SEED CANONICAL IMPLANTS PERMISSIONS
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'permissions') THEN
        INSERT INTO public.permissions (code, category, name, description, risk_level) VALUES
        ('implants.view_catalog', 'finance', 'View Implant Catalog', 'View global categories, components, and product SKUs', 'standard'),
        ('implants.manage_catalog', 'finance', 'Manage Global Implant Catalog', 'Create/edit global SKUs, HCPCS C-code mappings, and UDI data', 'sensitive'),
        ('implants.view_contracts', 'finance', 'View Facility Vendor Contracts', 'View facility vendor contracts, pricing tiers, and terms', 'sensitive'),
        ('implants.manage_contracts', 'finance', 'Manage Facility Vendor Contracts', 'Author, update, or terminate facility vendor contracts and pricing', 'critical'),
        ('implants.view_costs', 'finance', 'View Implant Acquisition Costs', 'View acquisition costs, invoice rates, and margin variances', 'sensitive'),
        ('implants.override_pricing', 'finance', 'Override Implant Pricing Tier', 'Manually override resolved cost hierarchy tier on surgical case', 'critical'),
        ('implants.manage_preference_cards', 'surgeries', 'Manage Surgeon Preference Cards', 'Create and edit surgeon preference cards and construct SKUs', 'standard'),
        ('implants.log_usage', 'surgeries', 'Log Case Implant Usage', 'Record intra-operative implant consumption, serials, and lot numbers', 'standard'),
        ('implants.approve_invoice', 'finance', 'Approve Implant Invoice Reconciliation', 'Match and reconcile supplier invoice line items to case usage', 'sensitive'),
        ('implants.view_variance', 'finance', 'View Implant Cost Variance Analytics', 'View implant cost variance, price creep, and peer analytics', 'standard'),
        ('implants.export_reports', 'reports', 'Export Implant Intelligence Reports', 'Export unmasked implant purchase logs and pricing benchmarks', 'sensitive')
        ON CONFLICT (code) DO UPDATE SET
            category = EXCLUDED.category,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            risk_level = EXCLUDED.risk_level;
    END IF;
END $$;

-- ==============================================================================
-- 2. SEED ROLE PERMISSION MAPPINGS FOR SYSTEM ROLES
-- ==============================================================================

DO $$
DECLARE
    v_cfo_id UUID := '00000000-0000-0000-0001-000000000004';
    v_clin_id UUID := '00000000-0000-0000-0001-000000000005';
    v_sched_id UUID := '00000000-0000-0000-0001-000000000006';
    v_biller_id UUID := '00000000-0000-0000-0001-000000000007';
    v_coder_id UUID := '00000000-0000-0000-0001-000000000008';
    v_surg_id UUID := '00000000-0000-0000-0001-000000000009';
    v_view_id UUID := '00000000-0000-0000-0001-000000000010';
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'role_permissions') THEN
        -- CFO Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_cfo_id, id FROM public.permissions 
        WHERE code IN (
            'implants.view_catalog', 'implants.view_contracts', 'implants.manage_contracts',
            'implants.view_costs', 'implants.override_pricing', 'implants.approve_invoice',
            'implants.view_variance', 'implants.export_reports'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        -- Clinical Manager Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_clin_id, id FROM public.permissions 
        WHERE code IN (
            'implants.view_catalog', 'implants.view_costs', 'implants.manage_preference_cards',
            'implants.log_usage', 'implants.view_variance'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        -- Scheduler Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_sched_id, id FROM public.permissions 
        WHERE code IN (
            'implants.view_catalog', 'implants.manage_preference_cards'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        -- Biller Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_biller_id, id FROM public.permissions 
        WHERE code IN (
            'implants.view_catalog', 'implants.view_costs', 'implants.log_usage',
            'implants.approve_invoice', 'implants.view_variance'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        -- Coder Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_coder_id, id FROM public.permissions 
        WHERE code IN (
            'implants.view_catalog', 'implants.log_usage'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        -- Surgeon Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_surg_id, id FROM public.permissions 
        WHERE code IN (
            'implants.view_catalog', 'implants.manage_preference_cards', 'implants.view_variance'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING;

        -- Viewer Permissions
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT v_view_id, id FROM public.permissions 
        WHERE code = 'implants.view_catalog'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END IF;
END $$;

-- ==============================================================================
-- 3. CASE DEVICES SCHEMA HARDENING & EXTENSION
-- ==============================================================================

-- Compatibility: hcpcs_c_code column
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS hcpcs_c_code VARCHAR(10);

UPDATE public.case_devices
SET hcpcs_c_code = hcpcs_code
WHERE hcpcs_c_code IS NULL AND hcpcs_code IS NOT NULL;

-- Generated total cost & total charge columns
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    ADD COLUMN IF NOT EXISTS total_charge NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * charge_amount) STORED;

-- Clinical provenance & regulatory tracking columns
ALTER TABLE public.case_devices
    ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS invoice_line_cost NUMERIC(12, 2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS expiration_date DATE,
    ADD COLUMN IF NOT EXISTS udi VARCHAR(150),
    ADD COLUMN IF NOT EXISTS duration_classification VARCHAR(30) DEFAULT 'PERMANENT'
        CHECK (duration_classification IN ('PERMANENT', 'TEMPORARY', 'EXCHANGEABLE', 'ABSORBABLE', 'REMOVABLE')),
    ADD COLUMN IF NOT EXISTS usage_status VARCHAR(30) NOT NULL DEFAULT 'IMPLANTED'
        CHECK (usage_status IN ('PLANNED', 'OPENED_ON_FIELD', 'IMPLANTED', 'CONTAMINATED_WASTED', 'DEFECTIVE_RETURNED')),
    ADD COLUMN IF NOT EXISTS cost_hierarchy_tier VARCHAR(30) DEFAULT 'TIER_2_CONTRACT',
    ADD COLUMN IF NOT EXISTS sku_id UUID,
    ADD COLUMN IF NOT EXISTS vendor_id UUID,
    ADD COLUMN IF NOT EXISTS contract_id UUID;

-- Indexes for performance & scrubbing
CREATE INDEX IF NOT EXISTS idx_cd_hcpcs_c_code ON public.case_devices(hcpcs_c_code);
CREATE INDEX IF NOT EXISTS idx_cd_duration ON public.case_devices(duration_classification);
CREATE INDEX IF NOT EXISTS idx_cd_usage_status ON public.case_devices(usage_status);
CREATE INDEX IF NOT EXISTS idx_cd_invoice ON public.case_devices(invoice_number);

-- ==============================================================================
-- 4. ATTACH AUDIT TRIGGER TO CASE DEVICES
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_audit_case_devices ON public.case_devices;
CREATE TRIGGER trg_audit_case_devices
    AFTER INSERT OR UPDATE OR DELETE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- ==============================================================================
-- 5. ATTACH TENANT RELOCATION PREVENTION TRIGGER
-- ==============================================================================

-- Ensure prevent_facility_relocation exists defensively (matches Migration 001)
CREATE OR REPLACE FUNCTION public.prevent_facility_relocation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid()
              AND fm.facility_id = OLD.facility_id
              AND fm.role IN ('super_admin', 'org_admin')
              AND fm.is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Cross-facility relocation of records is forbidden. facility_id is immutable for non-enterprise administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Provide backward-compatible alias fn_prevent_facility_relocation
CREATE OR REPLACE FUNCTION public.fn_prevent_facility_relocation()
RETURNS TRIGGER AS $$
BEGIN
    RETURN public.prevent_facility_relocation();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_case_devices ON public.case_devices;
CREATE TRIGGER trg_prevent_facility_relocation_case_devices
    BEFORE UPDATE ON public.case_devices
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

-- ==============================================================================
-- 6. AUTHORITATIVE STORED PROCEDURE: RECONCILE CASE DEVICE TOTALS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_reconcile_case_device_totals(p_surgery_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_cost NUMERIC(12, 2) := 0.00;
    v_total_charges NUMERIC(12, 2) := 0.00;
    v_count INTEGER := 0;
BEGIN
    IF p_surgery_id IS NULL THEN
        RAISE EXCEPTION 'Surgery ID must not be null for device total reconciliation';
    END IF;

    -- Compute sums directly from itemized case_devices
    SELECT 
        COALESCE(SUM(quantity * unit_cost), 0.00),
        COALESCE(SUM(quantity * charge_amount), 0.00),
        COUNT(*)
    INTO v_total_cost, v_total_charges, v_count
    FROM public.case_devices
    WHERE surgery_id = p_surgery_id;

    -- Authoritative update to surgeries master record
    UPDATE public.surgeries
    SET implants_cost = v_total_cost,
        updated_at = NOW()
    WHERE id = p_surgery_id;

    RETURN jsonb_build_object(
        'success', true,
        'surgery_id', p_surgery_id,
        'device_count', v_count,
        'total_implants_cost', v_total_cost,
        'total_device_charges', v_total_charges,
        'reconciled_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_reconcile_case_device_totals(BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_case_device_totals(BIGINT) TO authenticated;

COMMIT;
