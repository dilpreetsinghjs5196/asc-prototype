-- ==============================================================================
-- Migration: 124_excel_csv_import.sql
-- Description: Phase F2 Excel/CSV File Ingestion & Schema Engine
--              Multi-template registry (Surgical Cases, 835 Remittance, Implant POs, Fee Schedules)
--              Fuzzy column header auto-mapping, row-level validation, inline exception quarantine,
--              atomic transactional domain commit, and SHA-256 cryptographic provenance seals.
-- Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
-- Strict Zero Prohibited Accent Tokens
-- ==============================================================================

-- 1. Ingestion Templates Table
CREATE TABLE IF NOT EXISTS public.excel_import_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    template_code VARCHAR(32) NOT NULL,
    template_name VARCHAR(128) NOT NULL,
    description TEXT,
    target_table VARCHAR(64) NOT NULL,
    required_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    optional_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    column_aliases JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_import_template UNIQUE (facility_id, template_code)
);

CREATE INDEX IF NOT EXISTS idx_excel_import_templates_fac ON public.excel_import_templates(facility_id, template_code);

-- 2. File Import Batches Ledger Table
CREATE TABLE IF NOT EXISTS public.excel_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    template_code VARCHAR(32) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size_bytes INT NOT NULL DEFAULT 0,
    file_mime_type VARCHAR(128) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PARSED' CHECK (
        status IN ('UPLOADED', 'PARSED', 'MAPPING_PENDING', 'VALIDATING', 'EXCEPTION_REVIEW', 'COMMITTED', 'FAILED')
    ),
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    quarantined_rows INT NOT NULL DEFAULT 0,
    committed_rows INT NOT NULL DEFAULT 0,
    mapping_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing_duration_ms INT NOT NULL DEFAULT 0,
    uploaded_by VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT unq_facility_excel_batch UNIQUE (facility_id, batch_code)
);

CREATE INDEX IF NOT EXISTS idx_excel_import_batches_fac ON public.excel_import_batches(facility_id, created_at DESC);

-- 3. Staged Rows Buffer Table
CREATE TABLE IF NOT EXISTS public.excel_import_staged_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.excel_import_batches(id) ON DELETE CASCADE,
    row_index INT NOT NULL,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    mapped_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (
        validation_status IN ('PENDING', 'VALIDATED', 'QUARANTINED', 'COMMITTED', 'REJECTED')
    ),
    error_count INT NOT NULL DEFAULT 0,
    error_details JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
    corrected_at TIMESTAMPTZ,
    corrected_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_excel_import_staged_rows_batch ON public.excel_import_staged_rows(batch_id, validation_status);
CREATE INDEX IF NOT EXISTS idx_excel_import_staged_rows_fac ON public.excel_import_staged_rows(facility_id, row_index);

-- 4. Import Row Exceptions Table
CREATE TABLE IF NOT EXISTS public.excel_import_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.excel_import_batches(id) ON DELETE CASCADE,
    staged_row_id UUID NOT NULL REFERENCES public.excel_import_staged_rows(id) ON DELETE CASCADE,
    field_name VARCHAR(64) NOT NULL,
    offending_value TEXT,
    suggested_value TEXT,
    error_code VARCHAR(32) NOT NULL,
    error_message TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL' CHECK (severity IN ('CRITICAL', 'WARNING')),
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'UNRESOLVED' CHECK (
        resolution_status IN ('UNRESOLVED', 'MANUALLY_CORRECTED', 'OVERRIDDEN', 'REJECTED')
    ),
    resolution_notes TEXT,
    resolved_by VARCHAR(128),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_excel_import_exceptions_batch ON public.excel_import_exceptions(batch_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_excel_import_exceptions_fac ON public.excel_import_exceptions(facility_id, error_code);

-- 5. Provenance & Cryptographic Commit Records Table
CREATE TABLE IF NOT EXISTS public.excel_import_provenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.excel_import_batches(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    template_code VARCHAR(32) NOT NULL,
    rows_committed INT NOT NULL,
    sha256_commit_seal VARCHAR(64) NOT NULL,
    committed_by VARCHAR(128) NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_excel_import_provenance_fac ON public.excel_import_provenance_records(facility_id, committed_at DESC);

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.excel_import_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_import_staged_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_import_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_import_provenance_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_excel_import_templates_facility') THEN
        CREATE POLICY rls_excel_import_templates_facility ON public.excel_import_templates
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_excel_import_batches_facility') THEN
        CREATE POLICY rls_excel_import_batches_facility ON public.excel_import_batches
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_excel_import_staged_rows_facility') THEN
        CREATE POLICY rls_excel_import_staged_rows_facility ON public.excel_import_staged_rows
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_excel_import_exceptions_facility') THEN
        CREATE POLICY rls_excel_import_exceptions_facility ON public.excel_import_exceptions
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'rls_excel_import_provenance_facility') THEN
        CREATE POLICY rls_excel_import_provenance_facility ON public.excel_import_provenance_records
            USING (facility_id = CURRENT_SETTING('app.current_facility_id', TRUE)::UUID OR CURRENT_SETTING('app.current_facility_id', TRUE) IS NULL);
    END IF;
END $$;

-- 7. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_excel_csv_import_telemetry AS
SELECT
    b.facility_id,
    COUNT(DISTINCT b.id) AS total_batches_uploaded,
    COALESCE(SUM(b.total_rows), 0) AS total_imported_rows,
    COALESCE(SUM(b.valid_rows), 0) AS total_valid_rows,
    COALESCE(SUM(b.quarantined_rows), 0) AS total_quarantined_rows,
    COALESCE(SUM(b.committed_rows), 0) AS total_committed_rows,
    CASE 
        WHEN COALESCE(SUM(b.total_rows), 0) > 0 
        THEN ROUND((COALESCE(SUM(b.valid_rows), 0)::NUMERIC / SUM(b.total_rows)::NUMERIC) * 100, 2)
        ELSE 100.00
    END AS clean_ingestion_rate_pct,
    COALESCE(AVG(b.processing_duration_ms), 0) AS avg_processing_duration_ms,
    MAX(p.sha256_commit_seal) AS latest_commit_seal,
    MAX(b.created_at) AS last_upload_timestamp
FROM public.excel_import_batches b
LEFT JOIN public.excel_import_provenance_records p ON p.batch_id = b.id
GROUP BY b.facility_id;

-- 8. Seed Data for Naples Surgery Center (00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID := '00000000-0000-0000-0000-000000000002'::UUID;
    batch_1_id UUID := 'c1111111-1111-1111-1111-111111111111'::UUID;
    batch_2_id UUID := 'c2222222-2222-2222-2222-222222222222'::UUID;
    batch_3_id UUID := 'c3333333-3333-3333-3333-333333333333'::UUID;
    row_1_id UUID := 'd1111111-1111-1111-1111-111111111111'::UUID;
    row_2_id UUID := 'd2222222-2222-2222-2222-222222222222'::UUID;
    row_3_id UUID := 'd3333333-3333-3333-3333-333333333333'::UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = naples_id) THEN
        -- Seed Canonical Templates
        INSERT INTO public.excel_import_templates (facility_id, template_code, template_name, description, target_table, required_columns, optional_columns, column_aliases)
        VALUES
        (
            naples_id,
            'TEMPLATE_SURGICAL_CASES',
            'Surgical Cases Intake',
            'Surgical scheduling, operative minutes, primary CPT, and surgeon NPI attribution',
            'surgical_cases',
            '["surgery_date", "patient_mrn", "surgeon_npi", "primary_cpt", "or_room_name"]'::jsonb,
            '["operative_minutes", "case_type", "anesthesia_type", "patient_dob", "secondary_cpts"]'::jsonb,
            '{"surgery_date": ["surg date", "dos", "case date", "date of service"], "surgeon_npi": ["npi", "doctor npi", "physician npi", "provider id"], "primary_cpt": ["cpt", "cpt code", "primary px", "procedure code"]}'::jsonb
        ),
        (
            naples_id,
            'TEMPLATE_REMITTANCE_835',
            '835 Electronic Remittance Advice',
            'Payer adjudication, allowed amounts, paid amounts, contractual write-offs, and CARC denial codes',
            'claim_payments',
            '["claim_number", "service_date", "billed_amount", "paid_amount", "allowed_amount"]'::jsonb,
            '["patient_responsibility", "carc_code", "rarc_code", "payer_claim_control_number", "adjustment_amount"]'::jsonb,
            '{"claim_number": ["claim id", "pcn", "account no", "claim #"], "billed_amount": ["charges", "gross charges", "billed"], "paid_amount": ["payment", "paid", "net paid", "check amount"]}'::jsonb
        ),
        (
            naples_id,
            'TEMPLATE_IMPLANT_PURCHASES',
            'Implant & Supply Purchase Log',
            'Vendor purchase orders, catalog numbers, lot/serial tracking, and itemized construct costs',
            'case_costs',
            '["invoice_number", "vendor_name", "catalog_number", "quantity", "unit_cost"]'::jsonb,
            '["lot_number", "serial_number", "implant_description", "surgeon_name", "case_reference"]'::jsonb,
            '{"invoice_number": ["inv #", "invoice no", "po number", "order number"], "catalog_number": ["item number", "cat #", "part number", "sku"], "unit_cost": ["cost", "unit price", "price each", "item cost"]}'::jsonb
        ),
        (
            naples_id,
            'TEMPLATE_FEE_SCHEDULE',
            'Payer Contract Fee Schedule',
            'Allowable reimbursement schedules negotiated by commercial, Medicare Advantage, and workers comp payers',
            'payer_fee_schedules',
            '["payer_name", "cpt_code", "allowable_amount", "effective_date"]'::jsonb,
            '["modifier", "termination_date", "notes", "contract_version"]'::jsonb,
            '{"payer_name": ["payer", "carrier", "insurance company"], "allowable_amount": ["allowable", "contract rate", "reimbursement", "fee amount"]}'::jsonb
        )
        ON CONFLICT (facility_id, template_code) DO UPDATE SET
            template_name = EXCLUDED.template_name,
            description = EXCLUDED.description,
            required_columns = EXCLUDED.required_columns,
            optional_columns = EXCLUDED.optional_columns,
            column_aliases = EXCLUDED.column_aliases;

        -- Seed 3 Recent Batches
        INSERT INTO public.excel_import_batches (id, facility_id, batch_code, template_code, filename, file_size_bytes, file_mime_type, file_hash_sha256, status, total_rows, valid_rows, quarantined_rows, committed_rows, processing_duration_ms, uploaded_by)
        VALUES
        (
            batch_1_id,
            naples_id,
            'EXCEL_BATCH_20260224_01',
            'TEMPLATE_SURGICAL_CASES',
            'Naples_Surg_Cases_2026_W08.xlsx',
            452100,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'd9841fba73491bc92a875d409e3e7845ba01c34a9bfe451290faef9081234567',
            'COMMITTED',
            142,
            142,
            0,
            142,
            820,
            'facility_admin'
        ),
        (
            batch_2_id,
            naples_id,
            'EXCEL_BATCH_20260224_02',
            'TEMPLATE_IMPLANT_PURCHASES',
            'Stryker_Arthrex_Implant_Invoices_Feb2026.csv',
            128400,
            'text/csv',
            'e8731adbc89234fa761029c48b7123ef6509bc12ea4390f14238590123456789',
            'EXCEPTION_REVIEW',
            88,
            83,
            5,
            0,
            640,
            'materials_manager'
        ),
        (
            batch_3_id,
            naples_id,
            'EXCEL_BATCH_20260224_03',
            'TEMPLATE_REMITTANCE_835',
            'BCBS_Florida_ERA_Remit_835_Export.xlsx',
            312000,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'f129840912abcf89712345ba890123ef1234567890abcdef1234567890abcdef',
            'COMMITTED',
            195,
            195,
            0,
            195,
            910,
            'billing_supervisor'
        )
        ON CONFLICT (facility_id, batch_code) DO NOTHING;

        -- Seed Staged Rows for Batch 2 (Implant Purchases with Exceptions)
        INSERT INTO public.excel_import_staged_rows (id, facility_id, batch_id, row_index, raw_data, mapped_data, validation_status, error_count, error_details)
        VALUES
        (
            row_1_id,
            naples_id,
            batch_2_id,
            14,
            '{"Invoice #": "INV-2026-9041", "Vendor": "Arthrex Inc", "Cat #": "AR-1380", "Qty": "2", "Cost": "-420.00"}'::jsonb,
            '{"invoice_number": "INV-2026-9041", "vendor_name": "Arthrex Inc", "catalog_number": "AR-1380", "quantity": 2, "unit_cost": -420.00}'::jsonb,
            'QUARANTINED',
            1,
            '[{"field": "unit_cost", "code": "ERR_NEGATIVE_CURRENCY", "message": "Implant unit cost cannot be negative"}]'::jsonb
        ),
        (
            row_2_id,
            naples_id,
            batch_2_id,
            27,
            '{"Invoice #": "INV-2026-9054", "Vendor": "Stryker Orthopaedics", "Cat #": "", "Qty": "1", "Cost": "1850.00"}'::jsonb,
            '{"invoice_number": "INV-2026-9054", "vendor_name": "Stryker Orthopaedics", "catalog_number": "", "quantity": 1, "unit_cost": 1850.00}'::jsonb,
            'QUARANTINED',
            1,
            '[{"field": "catalog_number", "code": "ERR_MISSING_REQUIRED", "message": "Catalog number is required for implant construct"}]'::jsonb
        ),
        (
            row_3_id,
            naples_id,
            batch_2_id,
            42,
            '{"Invoice #": "INV-2026-9088", "Vendor": "Depuy Synthes", "Cat #": "DPS-7721", "Qty": "1", "Cost": "940.00"}'::jsonb,
            '{"invoice_number": "INV-2026-9088", "vendor_name": "Depuy Synthes", "catalog_number": "DPS-7721", "quantity": 1, "unit_cost": 940.00}'::jsonb,
            'VALIDATED',
            0,
            '[]'::jsonb
        )
        ON CONFLICT DO NOTHING;

        -- Seed Exceptions for Quarantined Rows
        INSERT INTO public.excel_import_exceptions (facility_id, batch_id, staged_row_id, field_name, offending_value, suggested_value, error_code, error_message, severity, resolution_status)
        VALUES
        (
            naples_id,
            batch_2_id,
            row_1_id,
            'unit_cost',
            '-420.00',
            '420.00',
            'ERR_NEGATIVE_CURRENCY',
            'Negative unit cost detected on implant purchase invoice line item',
            'CRITICAL',
            'UNRESOLVED'
        ),
        (
            naples_id,
            batch_2_id,
            row_2_id,
            'catalog_number',
            '',
            'STR-TRITON-22',
            'ERR_MISSING_REQUIRED',
            'Missing catalog or SKU identifier for itemized Stryker implant line',
            'CRITICAL',
            'UNRESOLVED'
        )
        ON CONFLICT DO NOTHING;

        -- Seed Provenance Record for Batch 1 and Batch 3
        INSERT INTO public.excel_import_provenance_records (facility_id, batch_id, batch_code, template_code, rows_committed, sha256_commit_seal, committed_by, metadata)
        VALUES
        (
            naples_id,
            batch_1_id,
            'EXCEL_BATCH_20260224_01',
            'TEMPLATE_SURGICAL_CASES',
            142,
            '8f912cb84912abdf3890214ea56810cba48902ef12485901abcf890123456789',
            'facility_admin',
            '{"source_file": "Naples_Surg_Cases_2026_W08.xlsx", "rows_written": 142, "table": "surgical_cases"}'::jsonb
        ),
        (
            naples_id,
            batch_3_id,
            'EXCEL_BATCH_20260224_03',
            'TEMPLATE_REMITTANCE_835',
            195,
            '9a01234bc56789def01234567890abcdef1234567890abcdef1234567890abcd',
            'billing_supervisor',
            '{"source_file": "BCBS_Florida_ERA_Remit_835_Export.xlsx", "rows_written": 195, "table": "claim_payments"}'::jsonb
        )
        ON CONFLICT DO NOTHING;

    END IF;
END $$;
