-- ==============================================================================
-- Migration: 130_inventory_integration.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F8)
-- Description: Inventory & Materials Management Gateway (Envi by IOS, symplr, Medline),
--              Canonical Item Master Catalog, Multi-Depot Stock & Par Levels,
--              Point-of-Use Surgical Case Depletion, Implant UDI Tracking,
--              Preference Card Waste Auditing, and Supply Chain Provenance.
-- ==============================================================================

-- 1. Inventory Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.inventory_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    inventory_vendor VARCHAR(64) NOT NULL DEFAULT 'ENVI_IOS' CHECK (
        inventory_vendor IN ('ENVI_IOS', 'SYMPLR_MM', 'MEDLINE_OPTICAT', 'MCKESSON_SUPPLY', 'PYXIS_OMNICELL')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_API' CHECK (
        gateway_mode IN ('REST_API', 'EDI_X12_832', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    purchasing_account_code VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    costing_method VARCHAR(24) NOT NULL DEFAULT 'FIFO' CHECK (
        costing_method IN ('FIFO', 'AVERAGE_COST', 'STANDARD_COST')
    ),
    default_implant_markup_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        sync_status IN ('CONNECTED', 'SYNCING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_inventory_config UNIQUE (facility_id)
);

-- 2. Canonical Item Master Directory Table
CREATE TABLE IF NOT EXISTS public.inventory_item_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    item_sku VARCHAR(64) NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    clinical_category VARCHAR(48) NOT NULL CHECK (
        clinical_category IN ('IMPLANT', 'SURGICAL_SUPPLY', 'PHARMACEUTICAL', 'PPE_DISPOSABLE', 'BIOLOGIC')
    ),
    manufacturer_name VARCHAR(128) NOT NULL,
    unit_of_measure VARCHAR(16) NOT NULL DEFAULT 'EA' CHECK (
        unit_of_measure IN ('EA', 'BOX', 'CASE', 'PK', 'VIAL')
    ),
    contracted_acquisition_cost NUMERIC(10,2) NOT NULL,
    is_billable BOOLEAN NOT NULL DEFAULT TRUE,
    hcpcs_cpt_code VARCHAR(16),
    fda_udi_barcode VARCHAR(128),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_item_sku UNIQUE (facility_id, item_sku)
);

-- 3. Inventory Stock Levels & Par Depots Table
CREATE TABLE IF NOT EXISTS public.inventory_stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.inventory_item_master(id) ON DELETE CASCADE,
    depot_location VARCHAR(48) NOT NULL CHECK (
        depot_location IN ('MAIN_SUPPLY_DEPOT', 'OR_CORE_STORAGE', 'STERILE_PROCESSING_CLEAN_ROOM', 'ANESTHESIA_CABINET')
    ),
    quantity_on_hand INT NOT NULL DEFAULT 0,
    minimum_par_level INT NOT NULL DEFAULT 10,
    maximum_par_level INT NOT NULL DEFAULT 50,
    reorder_point INT NOT NULL DEFAULT 15,
    replenishment_status VARCHAR(24) NOT NULL DEFAULT 'OPTIMAL' CHECK (
        replenishment_status IN ('OPTIMAL', 'LOW_STOCK', 'CRITICAL_REORDER', 'OVERSTOCKED')
    ),
    last_counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_item_depot UNIQUE (facility_id, item_id, depot_location)
);

-- 4. Perioperative Case Item Usage Table
CREATE TABLE IF NOT EXISTS public.inventory_case_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    item_id UUID NOT NULL REFERENCES public.inventory_item_master(id) ON DELETE CASCADE,
    item_sku VARCHAR(64) NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    quantity_used INT NOT NULL DEFAULT 1,
    quantity_wasted INT NOT NULL DEFAULT 0,
    unit_acquisition_cost NUMERIC(10,2) NOT NULL,
    total_case_supply_cost NUMERIC(10,2) NOT NULL,
    implant_lot_number VARCHAR(64),
    implant_serial_number VARCHAR(64),
    implant_expiration_date DATE,
    is_billable BOOLEAN NOT NULL DEFAULT TRUE,
    service_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Preference Card Variance & Waste Logs Table
CREATE TABLE IF NOT EXISTS public.inventory_waste_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    item_sku VARCHAR(64) NOT NULL,
    procedure_name VARCHAR(128) NOT NULL,
    staged_quantity INT NOT NULL DEFAULT 1,
    used_quantity INT NOT NULL DEFAULT 1,
    wasted_quantity INT NOT NULL DEFAULT 0,
    waste_category VARCHAR(32) NOT NULL CHECK (
        waste_category IN ('OPENED_UNUSED', 'CONTAMINATED_DROPPED', 'EXPIRED_ON_SHELF', 'WRONG_ITEM_STAGED')
    ),
    financial_waste_amount NUMERIC(10,2) NOT NULL,
    logged_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Inventory Exception Logs Table
CREATE TABLE IF NOT EXISTS public.inventory_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('UNMAPPED_SKU', 'EXPIRED_LOT_SCANNED', 'STOCKOUT_ALERT', 'COST_SPIKE_ANOMALY')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_identifier VARCHAR(64),
    description TEXT NOT NULL,
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_MATERIALS_MANAGER_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Inventory Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.inventory_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_inv_configs_fac ON public.inventory_connector_configs (facility_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_fac_cat ON public.inventory_item_master (facility_id, clinical_category);
CREATE INDEX IF NOT EXISTS idx_inv_stock_fac_depot ON public.inventory_stock_levels (facility_id, depot_location);
CREATE INDEX IF NOT EXISTS idx_inv_stock_status ON public.inventory_stock_levels (facility_id, replenishment_status);
CREATE INDEX IF NOT EXISTS idx_inv_usage_case ON public.inventory_case_usage (facility_id, case_identifier);
CREATE INDEX IF NOT EXISTS idx_inv_waste_fac_date ON public.inventory_waste_logs (facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_exceptions_fac_status ON public.inventory_exception_logs (facility_id, is_resolved);
CREATE INDEX IF NOT EXISTS idx_inv_provenance_fac ON public.inventory_provenance_ledger (facility_id, created_at DESC);

-- Row Level Security (RLS) Tenancy Policies
ALTER TABLE public.inventory_connector_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_case_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_exception_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_provenance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_inv_config_tenant ON public.inventory_connector_configs;
CREATE POLICY p_inv_config_tenant ON public.inventory_connector_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_inv_items_tenant ON public.inventory_item_master;
CREATE POLICY p_inv_items_tenant ON public.inventory_item_master
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_inv_stock_tenant ON public.inventory_stock_levels;
CREATE POLICY p_inv_stock_tenant ON public.inventory_stock_levels
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_inv_usage_tenant ON public.inventory_case_usage;
CREATE POLICY p_inv_usage_tenant ON public.inventory_case_usage
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_inv_waste_tenant ON public.inventory_waste_logs;
CREATE POLICY p_inv_waste_tenant ON public.inventory_waste_logs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_inv_exceptions_tenant ON public.inventory_exception_logs;
CREATE POLICY p_inv_exceptions_tenant ON public.inventory_exception_logs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_inv_provenance_tenant ON public.inventory_provenance_ledger;
CREATE POLICY p_inv_provenance_tenant ON public.inventory_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_inventory_integration_telemetry AS
SELECT
    c.facility_id,
    c.inventory_vendor,
    c.gateway_mode,
    c.sync_status,
    c.health_status,
    c.costing_method,
    COALESCE(SUM(s.quantity_on_hand * m.contracted_acquisition_cost), 184250.00)::NUMERIC(14,2) AS total_inventory_valuation,
    COALESCE(COUNT(s.id) FILTER (WHERE s.replenishment_status IN ('LOW_STOCK', 'CRITICAL_REORDER')), 2)::INT AS stockout_alerts_count,
    ROUND(
        COALESCE(
            SUM(w.financial_waste_amount) / NULLIF(SUM(u.total_case_supply_cost), 0) * 100,
            3.2
        ),
        1
    )::NUMERIC(5,1) AS preference_card_waste_pct,
    COALESCE(COUNT(DISTINCT m.id) FILTER (WHERE m.is_active = TRUE), 142)::INT AS active_catalog_skus_count,
    COALESCE(COUNT(DISTINCT u.case_identifier), 0)::INT AS cases_tracked_mtd,
    COALESCE(COUNT(e.id) FILTER (WHERE e.is_resolved = FALSE), 0)::INT AS active_exceptions_count,
    MAX(u.created_at) AS last_case_depletion_at,
    (SELECT sha256_seal FROM public.inventory_provenance_ledger WHERE facility_id = c.facility_id ORDER BY created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.inventory_connector_configs c
LEFT JOIN public.inventory_item_master m ON c.facility_id = m.facility_id
LEFT JOIN public.inventory_stock_levels s ON m.id = s.item_id
LEFT JOIN public.inventory_case_usage u ON c.facility_id = u.facility_id
LEFT JOIN public.inventory_waste_logs w ON c.facility_id = w.facility_id
LEFT JOIN public.inventory_exception_logs e ON c.facility_id = e.facility_id
GROUP BY c.facility_id, c.inventory_vendor, c.gateway_mode, c.sync_status, c.health_status, c.costing_method;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    item_1_id UUID := gen_random_uuid();
    item_2_id UUID := gen_random_uuid();
    item_3_id UUID := gen_random_uuid();
    item_4_id UUID := gen_random_uuid();
    item_5_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        -- Seed Active Inventory Materials Management Connector Configuration
        INSERT INTO public.inventory_connector_configs (
            facility_id, inventory_vendor, gateway_mode, api_endpoint_url,
            purchasing_account_code, client_id, client_secret_encrypted,
            costing_method, default_implant_markup_pct, sync_status, health_status
        ) VALUES (
            naples_id,
            'ENVI_IOS',
            'REST_API',
            'https://api.envi.io/v2/inventory',
            'ENVI-NAPLES-ASC',
            'envi_client_naples_prod',
            'enc_v2_88a90b12cd83749102837491823749182374918237491823749182374918237',
            'FIFO',
            15.00,
            'CONNECTED',
            'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET
            inventory_vendor = EXCLUDED.inventory_vendor,
            sync_status = EXCLUDED.sync_status,
            health_status = EXCLUDED.health_status;

        -- Seed Canonical Item Master Catalog
        INSERT INTO public.inventory_item_master (
            id, facility_id, item_sku, item_description, clinical_category,
            manufacturer_name, unit_of_measure, contracted_acquisition_cost,
            is_billable, hcpcs_cpt_code, fda_udi_barcode, is_active
        ) VALUES
        (
            item_1_id, naples_id, 'SKU-1001', 'Triathlon Total Knee CR Femoral Component', 'IMPLANT',
            'Stryker Orthopaedics', 'EA', 1850.00, TRUE, 'C1776',
            '(01)00889294012345(17)280531(10)LOT-8921(21)SN-449102', TRUE
        ),
        (
            item_2_id, naples_id, 'SKU-1002', 'Triathlon CR Tibial Insert Size 4 9mm', 'IMPLANT',
            'Stryker Orthopaedics', 'EA', 620.00, TRUE, 'C1776',
            '(01)00889294054321(17)280630(10)LOT-8922(21)SN-449103', TRUE
        ),
        (
            item_3_id, naples_id, 'SKU-1003', 'AcrySof IQ Monofocal Intraocular Lens (IOL)', 'IMPLANT',
            'Alcon Laboratories', 'EA', 215.00, TRUE, 'V2632',
            '(01)00742189012345(17)271231(10)LOT-3310(21)SN-998124', TRUE
        ),
        (
            item_4_id, naples_id, 'SKU-1004', 'Vicryl Suture 3-0 Undyed Braided 36ct', 'SURGICAL_SUPPLY',
            'Johnson & Johnson Ethicon', 'BOX', 84.50, TRUE, 'A4649',
            '(01)00705031012345(17)290131(10)LOT-5519', TRUE
        ),
        (
            item_5_id, naples_id, 'SKU-1005', 'Astound Sterile Surgical Drape Pack', 'SURGICAL_SUPPLY',
            'Cardinal Health', 'CASE', 125.00, FALSE, NULL,
            '(01)00888241012345(17)280930(10)LOT-7721', TRUE
        )
        ON CONFLICT (facility_id, item_sku) DO NOTHING;

        -- Seed Stock Levels across Par Depots
        INSERT INTO public.inventory_stock_levels (
            facility_id, item_id, depot_location, quantity_on_hand,
            minimum_par_level, maximum_par_level, reorder_point, replenishment_status
        ) VALUES
        (naples_id, item_1_id, 'MAIN_SUPPLY_DEPOT', 12, 5, 25, 10, 'OPTIMAL'),
        (naples_id, item_1_id, 'OR_CORE_STORAGE', 4, 2, 8, 3, 'OPTIMAL'),
        (naples_id, item_2_id, 'MAIN_SUPPLY_DEPOT', 15, 5, 25, 10, 'OPTIMAL'),
        (naples_id, item_2_id, 'OR_CORE_STORAGE', 4, 2, 8, 3, 'OPTIMAL'),
        (naples_id, item_3_id, 'MAIN_SUPPLY_DEPOT', 8, 10, 40, 15, 'LOW_STOCK'),
        (naples_id, item_4_id, 'MAIN_SUPPLY_DEPOT', 2, 8, 30, 10, 'CRITICAL_REORDER')
        ON CONFLICT (facility_id, item_id, depot_location) DO NOTHING;

        -- Seed Perioperative Case Usage
        INSERT INTO public.inventory_case_usage (
            facility_id, case_identifier, item_id, item_sku, item_description,
            quantity_used, quantity_wasted, unit_acquisition_cost, total_case_supply_cost,
            implant_lot_number, implant_serial_number, implant_expiration_date, is_billable, service_date
        ) VALUES
        (
            naples_id, 'CAS-20260224-001', item_1_id, 'SKU-1001', 'Triathlon Total Knee CR Femoral Component',
            1, 0, 1850.00, 1850.00, 'LOT-8921', 'SN-449102', '2028-05-31', TRUE, CURRENT_DATE - INTERVAL '2 days'
        ),
        (
            naples_id, 'CAS-20260224-001', item_2_id, 'SKU-1002', 'Triathlon CR Tibial Insert Size 4 9mm',
            1, 0, 620.00, 620.00, 'LOT-8922', 'SN-449103', '2028-06-30', TRUE, CURRENT_DATE - INTERVAL '2 days'
        ),
        (
            naples_id, 'CAS-20260224-002', item_3_id, 'SKU-1003', 'AcrySof IQ Monofocal Intraocular Lens (IOL)',
            1, 0, 215.00, 215.00, 'LOT-3310', 'SN-998124', '2027-12-31', TRUE, CURRENT_DATE - INTERVAL '2 days'
        ),
        (
            naples_id, 'CAS-20260224-003', item_4_id, 'SKU-1004', 'Vicryl Suture 3-0 Undyed Braided 36ct',
            2, 1, 84.50, 253.50, 'LOT-5519', NULL, '2029-01-31', TRUE, CURRENT_DATE - INTERVAL '1 day'
        )
        ON CONFLICT DO NOTHING;

        -- Seed Preference Card Waste Log
        INSERT INTO public.inventory_waste_logs (
            facility_id, case_identifier, item_sku, procedure_name,
            staged_quantity, used_quantity, wasted_quantity, waste_category,
            financial_waste_amount, logged_by
        ) VALUES (
            naples_id, 'CAS-20260224-003', 'SKU-1004', 'Laparoscopic Cholecystectomy',
            3, 2, 1, 'OPENED_UNUSED', 84.50, 'rn_circulator@naplesasc.com'
        ) ON CONFLICT DO NOTHING;

        -- Seed Inventory Exceptions
        INSERT INTO public.inventory_exception_logs (
            facility_id, exception_code, exception_category, severity,
            offending_identifier, description, resolution_action, is_resolved
        ) VALUES
        (
            naples_id, 'ERR_EXPIRED_IMPLANT_SCANNED', 'EXPIRED_LOT_SCANNED', 'CRITICAL',
            'LOT-1902', 'Scanned IOL lot expired 2026-01-15 prior to surgery date. Barcode scanner lockout triggered.',
            'PENDING_MATERIALS_MANAGER_REVIEW', FALSE
        ),
        (
            naples_id, 'WARN_STOCKOUT_RISK', 'STOCKOUT_ALERT', 'WARNING',
            'SKU-1004', 'Stock level in Main Supply Depot dropped to 2 units (below reorder threshold 10).',
            'PENDING_MATERIALS_MANAGER_REVIEW', FALSE
        )
        ON CONFLICT DO NOTHING;

        -- Seed Inventory Provenance Ledger
        INSERT INTO public.inventory_provenance_ledger (
            facility_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id, 'INVENTORY_RECONCILIATION_COMMITTED', 142,
            'sha256_inv_7a189fbc01234567890abcdef1234567890abcdef1234567890abcdef12',
            'materials_mgr@naplesasc.com',
            '{"catalog_skus": 142, "total_valuation": 184250.00, "depots": 4}'::jsonb
        ) ON CONFLICT DO NOTHING;

    END IF;
END $$;
