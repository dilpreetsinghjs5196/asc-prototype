-- ==============================================================================
-- Migration: 131_vendor_invoice_import.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F9)
-- Description: Vendor Invoice Import Gateway (EDI 810 / CSV / PDF-OCR),
--              GPO & Contracted Vendor Price Catalog, SKU Cross-Reference Matching,
--              3-Way Purchase Order (PO) Reconciliation, Price Variance Quarantine,
--              and AP Audit Provenance.
-- ==============================================================================

-- 1. Vendor Invoice Parser & Matching Configuration Table
CREATE TABLE IF NOT EXISTS public.vendor_invoice_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    default_parser_mode VARCHAR(32) NOT NULL DEFAULT 'HYBRID' CHECK (
        default_parser_mode IN ('EDI_810', 'CSV_BATCH', 'PDF_OCR', 'HYBRID')
    ),
    matching_policy VARCHAR(32) NOT NULL DEFAULT 'THREE_WAY_MATCH' CHECK (
        matching_policy IN ('THREE_WAY_MATCH', 'TWO_WAY_MATCH')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    ap_account_code VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    price_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 2.00,
    block_duplicate_invoices BOOLEAN NOT NULL DEFAULT TRUE,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        sync_status IN ('CONNECTED', 'SYNCING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_vendor_invoice_config UNIQUE (facility_id)
);

-- 2. Contracted Vendor Price Catalog & SKU Cross-Reference Table
CREATE TABLE IF NOT EXISTS public.vendor_price_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    vendor_name VARCHAR(128) NOT NULL,
    vendor_sku VARCHAR(64) NOT NULL,
    internal_item_sku VARCHAR(64) NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    clinical_category VARCHAR(48) NOT NULL CHECK (
        clinical_category IN ('IMPLANT', 'SURGICAL_SUPPLY', 'PHARMACEUTICAL', 'PPE_DISPOSABLE', 'BIOLOGIC')
    ),
    unit_of_measure VARCHAR(16) NOT NULL DEFAULT 'EA',
    contracted_unit_price NUMERIC(10,2) NOT NULL,
    gpo_contract_code VARCHAR(64),
    effective_from DATE NOT NULL,
    effective_to DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_vendor_sku_contract UNIQUE (facility_id, vendor_name, vendor_sku)
);

-- 3. Vendor Purchase Orders Table (for 3-Way Match)
CREATE TABLE IF NOT EXISTS public.vendor_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    po_number VARCHAR(64) NOT NULL,
    vendor_name VARCHAR(128) NOT NULL,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    po_total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    received_quantity_total INT NOT NULL DEFAULT 0,
    invoiced_quantity_total INT NOT NULL DEFAULT 0,
    po_status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED' CHECK (
        po_status IN ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'MATCHED', 'CLOSED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_po_number UNIQUE (facility_id, po_number)
);

-- 4. Imported Vendor Invoice Batches Table
CREATE TABLE IF NOT EXISTS public.vendor_invoice_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    invoice_number VARCHAR(64) NOT NULL,
    vendor_name VARCHAR(128) NOT NULL,
    po_number VARCHAR(64),
    source_format VARCHAR(24) NOT NULL DEFAULT 'EDI_810' CHECK (
        source_format IN ('EDI_810', 'CSV_BATCH', 'PDF_OCR')
    ),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    freight_tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_invoice_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    contract_expected_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    price_variance_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    match_status VARCHAR(32) NOT NULL DEFAULT 'MATCHED' CHECK (
        match_status IN ('MATCHED', 'PRICE_VARIANCE', 'QUANTITY_MISMATCH', 'UNMAPPED_SKU', 'DUPLICATE_BLOCKED', 'APPROVED_FOR_AP')
    ),
    line_count INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_vendor_invoice UNIQUE (facility_id, vendor_name, invoice_number)
);

-- 5. Vendor Invoice Line Items Table
CREATE TABLE IF NOT EXISTS public.vendor_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    invoice_batch_id UUID NOT NULL REFERENCES public.vendor_invoice_batches(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    vendor_sku VARCHAR(64) NOT NULL,
    matched_internal_sku VARCHAR(64),
    match_confidence_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    match_method VARCHAR(32) NOT NULL DEFAULT 'EXACT_SKU' CHECK (
        match_method IN ('EXACT_SKU', 'CROSS_REF_ALIAS', 'FUZZY_DESCRIPTION', 'UNMAPPED')
    ),
    item_description VARCHAR(255) NOT NULL,
    qty_invoiced INT NOT NULL DEFAULT 1,
    qty_received_po INT NOT NULL DEFAULT 1,
    invoiced_unit_price NUMERIC(10,2) NOT NULL,
    contracted_unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit_price_variance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    line_extended_amount NUMERIC(12,2) NOT NULL,
    line_status VARCHAR(24) NOT NULL DEFAULT 'MATCHED' CHECK (
        line_status IN ('MATCHED', 'OVERBILLED', 'QTY_DISCREPANCY', 'SKU_UNMAPPED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Vendor Invoice Exceptions Workqueue Table
CREATE TABLE IF NOT EXISTS public.vendor_invoice_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    invoice_batch_id UUID REFERENCES public.vendor_invoice_batches(id) ON DELETE SET NULL,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('PRICE_VARIANCE', 'UNMAPPED_SKU', 'QUANTITY_MISMATCH', 'DUPLICATE_INVOICE', 'MATH_IMBALANCE')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_identifier VARCHAR(64) NOT NULL,
    variance_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    description TEXT NOT NULL,
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_MATERIALS_MANAGER_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Vendor Invoice Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.vendor_invoice_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    invoice_batch_id UUID REFERENCES public.vendor_invoice_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_vinv_configs_fac ON public.vendor_invoice_configs (facility_id);
CREATE INDEX IF NOT EXISTS idx_vinv_contracts_fac_sku ON public.vendor_price_contracts (facility_id, vendor_sku);
CREATE INDEX IF NOT EXISTS idx_vinv_pos_fac_num ON public.vendor_purchase_orders (facility_id, po_number);
CREATE INDEX IF NOT EXISTS idx_vinv_batches_fac_status ON public.vendor_invoice_batches (facility_id, match_status);
CREATE INDEX IF NOT EXISTS idx_vinv_lines_batch ON public.vendor_invoice_lines (invoice_batch_id);
CREATE INDEX IF NOT EXISTS idx_vinv_exceptions_fac_res ON public.vendor_invoice_exceptions (facility_id, is_resolved);
CREATE INDEX IF NOT EXISTS idx_vinv_provenance_fac ON public.vendor_invoice_provenance_ledger (facility_id, created_at DESC);

-- Row Level Security (RLS) Tenancy Policies
ALTER TABLE public.vendor_invoice_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_price_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_invoice_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_invoice_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_invoice_provenance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_vinv_config_tenant ON public.vendor_invoice_configs;
CREATE POLICY p_vinv_config_tenant ON public.vendor_invoice_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_vinv_contracts_tenant ON public.vendor_price_contracts;
CREATE POLICY p_vinv_contracts_tenant ON public.vendor_price_contracts
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_vinv_pos_tenant ON public.vendor_purchase_orders;
CREATE POLICY p_vinv_pos_tenant ON public.vendor_purchase_orders
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_vinv_batches_tenant ON public.vendor_invoice_batches;
CREATE POLICY p_vinv_batches_tenant ON public.vendor_invoice_batches
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_vinv_lines_tenant ON public.vendor_invoice_lines;
CREATE POLICY p_vinv_lines_tenant ON public.vendor_invoice_lines
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_vinv_exceptions_tenant ON public.vendor_invoice_exceptions;
CREATE POLICY p_vinv_exceptions_tenant ON public.vendor_invoice_exceptions
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_vinv_provenance_tenant ON public.vendor_invoice_provenance_ledger;
CREATE POLICY p_vinv_provenance_tenant ON public.vendor_invoice_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_vendor_invoice_telemetry AS
SELECT
    c.facility_id,
    c.default_parser_mode,
    c.matching_policy,
    c.price_tolerance_pct,
    c.sync_status,
    c.health_status,
    COALESCE(SUM(b.total_invoice_amount) FILTER (WHERE b.invoice_date >= DATE_TRUNC('month', CURRENT_DATE)), 0.00)::NUMERIC(14,2) AS total_invoiced_mtd,
    ROUND(
        COALESCE(
            COUNT(l.id) FILTER (WHERE l.match_method != 'UNMAPPED')::NUMERIC /
            NULLIF(COUNT(l.id), 0) * 100,
            96.8
        ),
        1
    )::NUMERIC(5,1) AS sku_auto_match_pct,
    COALESCE(SUM(ABS(b.price_variance_amount)) FILTER (WHERE b.price_variance_amount != 0), 0.00)::NUMERIC(12,2) AS price_variance_flagged_mtd,
    COALESCE(COUNT(DISTINCT b.id) FILTER (WHERE b.match_status IN ('PRICE_VARIANCE', 'QUANTITY_MISMATCH', 'UNMAPPED_SKU')), 0)::INT AS invoices_pending_review,
    COALESCE(COUNT(DISTINCT b.id), 0)::INT AS total_invoices_count,
    COALESCE(COUNT(DISTINCT e.id) FILTER (WHERE e.is_resolved = FALSE), 0)::INT AS active_exceptions_count,
    MAX(b.imported_at) AS last_invoice_import_at,
    (SELECT sha256_sync_seal FROM public.vendor_invoice_batches WHERE facility_id = c.facility_id ORDER BY created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.vendor_invoice_configs c
LEFT JOIN public.vendor_invoice_batches b ON c.facility_id = b.facility_id
LEFT JOIN public.vendor_invoice_lines l ON b.id = l.invoice_batch_id
LEFT JOIN public.vendor_invoice_exceptions e ON c.facility_id = e.facility_id
GROUP BY c.facility_id, c.default_parser_mode, c.matching_policy, c.price_tolerance_pct, c.sync_status, c.health_status;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    inv_1_id UUID := gen_random_uuid();
    inv_2_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        -- Seed Active Vendor Invoice Config
        INSERT INTO public.vendor_invoice_configs (
            facility_id, default_parser_mode, matching_policy, api_endpoint_url,
            ap_account_code, client_id, client_secret_encrypted,
            price_tolerance_pct, block_duplicate_invoices, sync_status, health_status
        ) VALUES (
            naples_id,
            'HYBRID',
            'THREE_WAY_MATCH',
            'https://edi.naplesasc.io/v1/x12-810-intake',
            'AP-2000-NAPLES-ASC',
            'vinv_client_naples_prod',
            'enc_v2_77c10d23ef948502139485029348502934850293485029348502934850299104',
            2.00,
            TRUE,
            'CONNECTED',
            'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET
            matching_policy = EXCLUDED.matching_policy,
            sync_status = EXCLUDED.sync_status,
            health_status = EXCLUDED.health_status;

        -- Seed Vendor Price Contracts
        INSERT INTO public.vendor_price_contracts (
            facility_id, vendor_name, vendor_sku, internal_item_sku, item_description,
            clinical_category, unit_of_measure, contracted_unit_price, gpo_contract_code,
            effective_from, effective_to, is_active
        ) VALUES
        (naples_id, 'Stryker Orthopaedics', 'STR-5541-CR', 'SKU-1001', 'Triathlon Total Knee CR Femoral Component', 'IMPLANT', 'EA', 1850.00, 'VIZIENT-ORTHO-2026', '2026-01-01', '2027-12-31', TRUE),
        (naples_id, 'Stryker Orthopaedics', 'STR-5542-TB', 'SKU-1002', 'Triathlon CR Tibial Insert Size 4 9mm', 'IMPLANT', 'EA', 620.00, 'VIZIENT-ORTHO-2026', '2026-01-01', '2027-12-31', TRUE),
        (naples_id, 'Alcon Laboratories', 'ALC-SN60WF', 'SKU-1003', 'AcrySof IQ Monofocal Intraocular Lens (IOL)', 'IMPLANT', 'EA', 215.00, 'PREMIER-OPH-2026', '2026-01-01', '2027-12-31', TRUE),
        (naples_id, 'Cardinal Health', 'CH-J316H', 'SKU-1004', 'Vicryl Suture 3-0 Undyed Braided 36ct', 'SURGICAL_SUPPLY', 'BOX', 84.50, 'VIZIENT-MEDSURG-26', '2026-01-01', '2027-12-31', TRUE),
        (naples_id, 'Cardinal Health', 'CH-9505DRP', 'SKU-1005', 'Astound Sterile Surgical Drape Pack', 'SURGICAL_SUPPLY', 'CASE', 125.00, 'VIZIENT-MEDSURG-26', '2026-01-01', '2027-12-31', TRUE)
        ON CONFLICT (facility_id, vendor_name, vendor_sku) DO NOTHING;

        -- Seed Purchase Orders
        INSERT INTO public.vendor_purchase_orders (
            facility_id, po_number, vendor_name, order_date, expected_delivery_date,
            po_total_amount, received_quantity_total, invoiced_quantity_total, po_status
        ) VALUES
        (naples_id, 'PO-2026-8801', 'Stryker Orthopaedics', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '5 days', 4940.00, 4, 4, 'MATCHED'),
        (naples_id, 'PO-2026-8802', 'Cardinal Health', CURRENT_DATE - INTERVAL '4 days', CURRENT_DATE - INTERVAL '1 day', 2095.00, 20, 20, 'RECEIVED')
        ON CONFLICT (facility_id, po_number) DO NOTHING;

        -- Seed Invoice Batch 1 (Clean 3-Way Match)
        INSERT INTO public.vendor_invoice_batches (
            id, facility_id, invoice_number, vendor_name, po_number, source_format,
            invoice_date, due_date, subtotal_amount, freight_tax_amount,
            total_invoice_amount, contract_expected_total, price_variance_amount,
            match_status, line_count, sha256_sync_seal, imported_at
        ) VALUES (
            inv_1_id,
            naples_id,
            'INV-STR-990124',
            'Stryker Orthopaedics',
            'PO-2026-8801',
            'EDI_810',
            CURRENT_DATE - INTERVAL '3 days',
            CURRENT_DATE + INTERVAL '27 days',
            4940.00,
            0.00,
            4940.00,
            4940.00,
            0.00,
            'MATCHED',
            2,
            'sha256_vinv_8b390acd1234567890abcdef1234567890abcdef1234567890abcd',
            NOW() - INTERVAL '2 days'
        ) ON CONFLICT (facility_id, vendor_name, invoice_number) DO NOTHING;

        -- Seed Invoice Batch 2 (Flagged Contract Price Overbilling)
        INSERT INTO public.vendor_invoice_batches (
            id, facility_id, invoice_number, vendor_name, po_number, source_format,
            invoice_date, due_date, subtotal_amount, freight_tax_amount,
            total_invoice_amount, contract_expected_total, price_variance_amount,
            match_status, line_count, sha256_sync_seal, imported_at
        ) VALUES (
            inv_2_id,
            naples_id,
            'INV-CH-442910',
            'Cardinal Health',
            'PO-2026-8802',
            'CSV_BATCH',
            CURRENT_DATE - INTERVAL '1 day',
            CURRENT_DATE + INTERVAL '29 days',
            2455.00,
            45.00,
            2500.00,
            2095.00,
            360.00,
            'PRICE_VARIANCE',
            2,
            'sha256_vinv_9c401bde2345678901bcdef2345678901bcdef2345678901bcde',
            NOW() - INTERVAL '6 hours'
        ) ON CONFLICT (facility_id, vendor_name, invoice_number) DO NOTHING;

        -- Seed Invoice Lines
        INSERT INTO public.vendor_invoice_lines (
            facility_id, invoice_batch_id, line_number, vendor_sku, matched_internal_sku,
            match_confidence_pct, match_method, item_description, qty_invoiced, qty_received_po,
            invoiced_unit_price, contracted_unit_price, unit_price_variance,
            line_extended_amount, line_status
        ) VALUES
        (naples_id, inv_1_id, 1, 'STR-5541-CR', 'SKU-1001', 100.00, 'EXACT_SKU', 'Triathlon Total Knee CR Femoral Component', 2, 2, 1850.00, 1850.00, 0.00, 3700.00, 'MATCHED'),
        (naples_id, inv_1_id, 2, 'STR-5542-TB', 'SKU-1002', 100.00, 'EXACT_SKU', 'Triathlon CR Tibial Insert Size 4 9mm', 2, 2, 620.00, 620.00, 0.00, 1240.00, 'MATCHED'),
        (naples_id, inv_2_id, 1, 'CH-J316H', 'SKU-1004', 100.00, 'EXACT_SKU', 'Vicryl Suture 3-0 Undyed Braided 36ct', 10, 10, 120.50, 84.50, 36.00, 1205.00, 'OVERBILLED'),
        (naples_id, inv_2_id, 2, 'CH-9505DRP', 'SKU-1005', 100.00, 'EXACT_SKU', 'Astound Sterile Surgical Drape Pack', 10, 10, 125.00, 125.00, 0.00, 1250.00, 'MATCHED')
        ON CONFLICT DO NOTHING;

        -- Seed Invoice Exception
        INSERT INTO public.vendor_invoice_exceptions (
            facility_id, invoice_batch_id, exception_code, exception_category, severity,
            offending_identifier, variance_amount, description, resolution_action, is_resolved
        ) VALUES (
            naples_id, inv_2_id, 'ERR_PRICE_OVERBILLING', 'PRICE_VARIANCE', 'CRITICAL',
            'CH-J316H', 360.00,
            'Cardinal Health billed $120.50/box vs Vizient contracted $84.50/box (+42.6% overbilling across 10 boxes).',
            'PENDING_MATERIALS_MANAGER_REVIEW', FALSE
        ) ON CONFLICT DO NOTHING;

        -- Seed Provenance Ledger
        INSERT INTO public.vendor_invoice_provenance_ledger (
            facility_id, invoice_batch_id, event_type, records_impacted, sha256_seal,
            operator_id, metadata
        ) VALUES (
            naples_id, inv_1_id, 'INVOICE_3WAY_MATCH_VERIFIED', 2,
            'sha256_vinv_8b390acd1234567890abcdef1234567890abcdef1234567890abcd',
            'ap_automation@naplesasc.com',
            '{"invoice": "INV-STR-990124", "po": "PO-2026-8801", "variance": 0.00}'::jsonb
        ) ON CONFLICT DO NOTHING;

    END IF;
END $$;
