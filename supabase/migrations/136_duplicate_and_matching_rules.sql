-- ==============================================================================
-- Migration: 136_duplicate_and_matching_rules.sql
-- Module 16: Enterprise Data Quality Governance (Phase G4)
-- Description: Duplicate Detection, Deterministic Weighted Record Matching,
--              Field-Level Survivorship Policies, Golden Master Records,
--              Reversible Merge/Unmerge History, and SHA-256 Provenance.
-- ==============================================================================

-- 1. Facility Duplicate & Matching Configuration Table
CREATE TABLE IF NOT EXISTS public.dmr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    auto_merge_threshold NUMERIC(5,2) NOT NULL DEFAULT 95.00 CHECK (
        auto_merge_threshold >= 70.00 AND auto_merge_threshold <= 100.00
    ),
    manual_review_threshold NUMERIC(5,2) NOT NULL DEFAULT 75.00 CHECK (
        manual_review_threshold >= 50.00 AND manual_review_threshold < auto_merge_threshold
    ),
    block_exact_collisions BOOLEAN NOT NULL DEFAULT TRUE,
    enable_cross_source_blocking BOOLEAN NOT NULL DEFAULT TRUE,
    require_reason_for_unmerge BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dmr_config UNIQUE (facility_id)
);

-- 2. Deterministic Entity Matching Rules Table
CREATE TABLE IF NOT EXISTS public.dmr_matching_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    rule_code VARCHAR(48) NOT NULL,
    entity_type VARCHAR(32) NOT NULL CHECK (
        entity_type IN ('PATIENT', 'SURGICAL_CASE', 'CLAIM', 'VENDOR', 'VENDOR_INVOICE', 'IMPLANT_SKU')
    ),
    rule_name VARCHAR(128) NOT NULL,
    match_algorithm VARCHAR(48) NOT NULL CHECK (
        match_algorithm IN ('EXACT_KEY', 'NORMALIZED_JARO_WINKLER', 'TOKEN_SET_RATIO', 'COMPOSITE_WEIGHTED')
    ),
    blocking_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    field_weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    exact_override_keys_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    version_tag VARCHAR(24) NOT NULL DEFAULT 'dmr-v1.0.0',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dmr_rule_code UNIQUE (facility_id, rule_code)
);

-- 3. Field-Level Survivorship Policies Table
CREATE TABLE IF NOT EXISTS public.dmr_survivorship_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    policy_code VARCHAR(48) NOT NULL,
    entity_type VARCHAR(32) NOT NULL CHECK (
        entity_type IN ('PATIENT', 'SURGICAL_CASE', 'CLAIM', 'VENDOR', 'VENDOR_INVOICE', 'IMPLANT_SKU')
    ),
    source_precedence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    field_strategies_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    tie_breaker_strategy VARCHAR(48) NOT NULL DEFAULT 'MOST_RECENT_VERIFIED',
    allow_manual_override BOOLEAN NOT NULL DEFAULT TRUE,
    version_tag VARCHAR(24) NOT NULL DEFAULT 'dmr-v1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dmr_survivorship UNIQUE (facility_id, entity_type)
);

-- 4. Golden Master Records Table
CREATE TABLE IF NOT EXISTS public.dmr_golden_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    golden_code VARCHAR(48) NOT NULL,
    entity_type VARCHAR(32) NOT NULL CHECK (
        entity_type IN ('PATIENT', 'SURGICAL_CASE', 'CLAIM', 'VENDOR', 'VENDOR_INVOICE', 'IMPLANT_SKU')
    ),
    canonical_key VARCHAR(128) NOT NULL,
    survived_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    field_provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    lineage_source_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    merged_source_count INT NOT NULL DEFAULT 1,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dmr_golden_code UNIQUE (facility_id, golden_code)
);

-- 5. Candidate Duplicate Pairs Queue Table
CREATE TABLE IF NOT EXISTS public.dmr_candidate_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    pair_code VARCHAR(48) NOT NULL,
    entity_type VARCHAR(32) NOT NULL CHECK (
        entity_type IN ('PATIENT', 'SURGICAL_CASE', 'CLAIM', 'VENDOR', 'VENDOR_INVOICE', 'IMPLANT_SKU')
    ),
    source_record_a_id VARCHAR(64) NOT NULL,
    source_module_a VARCHAR(48) NOT NULL,
    record_a_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_record_b_id VARCHAR(64) NOT NULL,
    source_module_b VARCHAR(48) NOT NULL,
    record_b_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_score NUMERIC(5,2) NOT NULL,
    match_classification VARCHAR(32) NOT NULL CHECK (
        match_classification IN ('EXACT_DUPLICATE', 'HIGH_CONFIDENCE_CANDIDATE', 'AMBIGUOUS_REVIEW', 'DISTINCT_NON_MATCH')
    ),
    matched_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    score_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (
        resolution_status IN ('PENDING_REVIEW', 'AUTO_MERGED', 'MANUALLY_MERGED', 'CONFIRMED_DISTINCT', 'DEFERRED_HOLD', 'REVERSED')
    ),
    golden_record_id UUID REFERENCES public.dmr_golden_records(id) ON DELETE SET NULL,
    financial_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    reviewed_by VARCHAR(128),
    reviewed_at TIMESTAMPTZ,
    review_reason TEXT,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dmr_pair_code UNIQUE (facility_id, pair_code)
);

-- 6. Immutable Merge & Unmerge Provenance History Table
CREATE TABLE IF NOT EXISTS public.dmr_merge_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    pair_id UUID REFERENCES public.dmr_candidate_pairs(id) ON DELETE CASCADE,
    golden_record_id UUID REFERENCES public.dmr_golden_records(id) ON DELETE SET NULL,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('AUTO_MERGE', 'MANUAL_MERGE', 'CONFIRM_DISTINCT', 'UNMERGE_REVERT', 'SURVIVORSHIP_OVERRIDE')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    before_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason TEXT,
    rule_version VARCHAR(24) NOT NULL DEFAULT 'dmr-v1.0.0',
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Batch Deduplication Match Runs Table
CREATE TABLE IF NOT EXISTS public.dmr_match_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    entity_scope VARCHAR(32) NOT NULL DEFAULT 'ALL',
    records_scanned INT NOT NULL DEFAULT 0,
    pairs_evaluated INT NOT NULL DEFAULT 0,
    exact_duplicates_found INT NOT NULL DEFAULT 0,
    candidates_queued INT NOT NULL DEFAULT 0,
    auto_merged_count INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    executed_by VARCHAR(128) NOT NULL,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dmr_run_batch UNIQUE (facility_id, batch_control_number)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_dmr_rules_facility ON public.dmr_matching_rules (facility_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_dmr_pairs_facility_status ON public.dmr_candidate_pairs (facility_id, resolution_status, entity_type);
CREATE INDEX IF NOT EXISTS idx_dmr_golden_facility_entity ON public.dmr_golden_records (facility_id, entity_type, is_active);
CREATE INDEX IF NOT EXISTS idx_dmr_history_pair_created ON public.dmr_merge_history (facility_id, pair_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dmr_runs_facility_created ON public.dmr_match_runs (facility_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_dmr_telemetry AS
SELECT
    c.facility_id,
    c.auto_merge_threshold,
    c.manual_review_threshold,
    c.block_exact_collisions,
    c.sync_status,
    c.health_status,
    COALESCE(COUNT(p.id) FILTER (WHERE p.resolution_status IN ('PENDING_REVIEW', 'DEFERRED_HOLD')), 0) AS pending_review_count,
    COALESCE(COUNT(p.id) FILTER (WHERE p.resolution_status IN ('AUTO_MERGED', 'MANUALLY_MERGED')), 0) AS merged_pairs_count,
    COALESCE(COUNT(p.id) FILTER (WHERE p.resolution_status = 'CONFIRMED_DISTINCT'), 0) AS confirmed_distinct_count,
    COALESCE(SUM(p.financial_exposure_usd) FILTER (WHERE p.resolution_status IN ('PENDING_REVIEW', 'AUTO_MERGED', 'MANUALLY_MERGED')), 0.00) AS total_exposure_protected_usd,
    COALESCE(ROUND(AVG(p.confidence_score), 2), 0.00) AS avg_match_confidence,
    (SELECT COUNT(*) FROM public.dmr_golden_records g WHERE g.facility_id = c.facility_id AND g.is_active = TRUE) AS active_golden_records_count,
    (SELECT r.sha256_sync_seal FROM public.dmr_match_runs r WHERE r.facility_id = c.facility_id ORDER BY r.created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.dmr_configs c
LEFT JOIN public.dmr_candidate_pairs p ON p.facility_id = c.facility_id
GROUP BY c.facility_id, c.auto_merge_threshold, c.manual_review_threshold, c.block_exact_collisions, c.sync_status, c.health_status;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.dmr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmr_matching_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmr_survivorship_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmr_golden_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmr_candidate_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmr_merge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dmr_match_runs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies
CREATE POLICY dmr_configs_tenant_iso ON public.dmr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
CREATE POLICY dmr_rules_tenant_iso ON public.dmr_matching_rules USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
CREATE POLICY dmr_surv_tenant_iso ON public.dmr_survivorship_policies USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
CREATE POLICY dmr_golden_tenant_iso ON public.dmr_golden_records USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
CREATE POLICY dmr_pairs_tenant_iso ON public.dmr_candidate_pairs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
CREATE POLICY dmr_hist_tenant_iso ON public.dmr_merge_history USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
CREATE POLICY dmr_runs_tenant_iso ON public.dmr_match_runs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Seed Data for Naples Surgery Center (00000000-0000-0000-0000-000000000002)
-- ==============================================================================

INSERT INTO public.dmr_configs (
    id, facility_id, auto_merge_threshold, manual_review_threshold,
    block_exact_collisions, enable_cross_source_blocking, require_reason_for_unmerge,
    client_secret_encrypted, sync_status, health_status
) VALUES (
    'd4000001-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    95.00, 75.00, TRUE, TRUE, TRUE,
    'dmr_sec_****_naples_9402', 'ACTIVE', 'HEALTHY'
) ON CONFLICT (facility_id) DO NOTHING;

INSERT INTO public.dmr_matching_rules (
    facility_id, rule_code, entity_type, rule_name, match_algorithm,
    blocking_keys_json, field_weights_json, exact_override_keys_json, version_tag
) VALUES
(
    '00000000-0000-0000-0000-000000000002',
    'DMR-PAT-001', 'PATIENT', 'Patient EMPI Composite Matching', 'COMPOSITE_WEIGHTED',
    '["dob", "last_name_soundex", "zip5"]'::jsonb,
    '{"mrn": 30.00, "last_name": 25.00, "first_name": 20.00, "dob": 15.00, "ssn_last4": 10.00}'::jsonb,
    '[["mrn", "dob"], ["ssn_last4", "dob", "last_name"]]'::jsonb,
    'dmr-v1.0.0'
),
(
    '00000000-0000-0000-0000-000000000002',
    'DMR-CASE-001', 'SURGICAL_CASE', 'Surgical Encounter Cross-System Match', 'COMPOSITE_WEIGHTED',
    '["dos", "or_room_code"]'::jsonb,
    '{"patient_mrn": 30.00, "dos": 25.00, "surgeon_npi": 20.00, "primary_cpt": 15.00, "case_number": 10.00}'::jsonb,
    '[["case_number", "dos"], ["patient_mrn", "dos", "primary_cpt"]]'::jsonb,
    'dmr-v1.0.0'
),
(
    '00000000-0000-0000-0000-000000000002',
    'DMR-CLM-001', 'CLAIM', '837/Payer Duplicate Claim Guard', 'COMPOSITE_WEIGHTED',
    '["payer_id", "dos"]'::jsonb,
    '{"payer_control_number": 35.00, "patient_mrn": 25.00, "dos": 20.00, "billed_amount_usd": 20.00}'::jsonb,
    '[["payer_control_number"], ["patient_mrn", "dos", "billed_amount_usd", "primary_cpt"]]'::jsonb,
    'dmr-v1.0.0'
),
(
    '00000000-0000-0000-0000-000000000002',
    'DMR-VND-001', 'VENDOR', 'Vendor Master Legal Entity & EIN Match', 'NORMALIZED_JARO_WINKLER',
    '["tax_id_ein", "name_prefix_4"]'::jsonb,
    '{"tax_id_ein": 35.00, "legal_name": 35.00, "vendor_code": 20.00, "remit_zip": 10.00}'::jsonb,
    '[["tax_id_ein"], ["vendor_code"]]'::jsonb,
    'dmr-v1.0.0'
),
(
    '00000000-0000-0000-0000-000000000002',
    'DMR-INV-001', 'VENDOR_INVOICE', 'AP 810/OCR Duplicate Invoice Detection', 'EXACT_KEY',
    '["vendor_code", "invoice_month"]'::jsonb,
    '{"vendor_code": 30.00, "invoice_number": 40.00, "invoice_total_usd": 20.00, "invoice_date": 10.00}'::jsonb,
    '[["vendor_code", "invoice_number"], ["vendor_code", "invoice_total_usd", "invoice_date"]]'::jsonb,
    'dmr-v1.0.0'
),
(
    '00000000-0000-0000-0000-000000000002',
    'DMR-SKU-001', 'IMPLANT_SKU', 'Implant UDI & Catalog Deduplication', 'TOKEN_SET_RATIO',
    '["manufacturer_code", "udi_di"]'::jsonb,
    '{"udi_gtin": 40.00, "catalog_number": 30.00, "item_description": 20.00, "manufacturer_name": 10.00}'::jsonb,
    '[["udi_gtin"], ["manufacturer_name", "catalog_number"]]'::jsonb,
    'dmr-v1.0.0'
) ON CONFLICT (facility_id, rule_code) DO NOTHING;

INSERT INTO public.dmr_survivorship_policies (
    facility_id, policy_code, entity_type, source_precedence_json, field_strategies_json, tie_breaker_strategy
) VALUES
(
    '00000000-0000-0000-0000-000000000002', 'SURV-PAT-01', 'PATIENT',
    '["SIS_EHR", "HST_EHR", "CLEARINGHOUSE_EDI", "EXCEL_CSV"]'::jsonb,
    '{"mrn": "SOURCE_SYSTEM_RANK", "legal_name": "MOST_RECENT_VERIFIED", "dob": "SOURCE_SYSTEM_RANK", "phone": "MOST_COMPLETE_NON_NULL"}'::jsonb,
    'MOST_RECENT_VERIFIED'
),
(
    '00000000-0000-0000-0000-000000000002', 'SURV-VND-01', 'VENDOR',
    '["ACCOUNTING_GL", "VENDOR_INVOICE", "INVENTORY_POU", "EXCEL_CSV"]'::jsonb,
    '{"tax_id_ein": "SOURCE_SYSTEM_RANK", "legal_name": "MOST_RECENT_VERIFIED", "remit_address": "MOST_COMPLETE_NON_NULL", "contract_rate": "MAX_FINANCIAL_PRECISION"}'::jsonb,
    'SOURCE_SYSTEM_RANK'
),
(
    '00000000-0000-0000-0000-000000000002', 'SURV-INV-01', 'VENDOR_INVOICE',
    '["VENDOR_INVOICE", "ACCOUNTING_GL", "EXCEL_CSV"]'::jsonb,
    '{"invoice_number": "SOURCE_SYSTEM_RANK", "invoice_total_usd": "MAX_FINANCIAL_PRECISION", "po_number": "MOST_COMPLETE_NON_NULL"}'::jsonb,
    'MAX_FINANCIAL_PRECISION'
) ON CONFLICT (facility_id, entity_type) DO NOTHING;

INSERT INTO public.dmr_golden_records (
    id, facility_id, golden_code, entity_type, canonical_key,
    survived_payload_json, field_provenance_json, lineage_source_ids_json,
    merged_source_count, confidence_score, is_active, sha256_sync_seal
) VALUES (
    'd4100001-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'GLD-INV-9001', 'VENDOR_INVOICE', 'STRYKER::INV-2026-88412',
    '{"vendor_code": "VND-STRYKER", "invoice_number": "INV-2026-88412", "invoice_total_usd": 4250.00, "invoice_date": "2026-11-18", "po_number": "PO-NAP-7721"}'::jsonb,
    '{"vendor_code": {"winning_source": "VENDOR_INVOICE", "strategy": "SOURCE_SYSTEM_RANK"}, "invoice_total_usd": {"winning_source": "VENDOR_INVOICE", "strategy": "MAX_FINANCIAL_PRECISION"}}'::jsonb,
    '["inv-810-9910", "csv-ap-3302"]'::jsonb,
    2, 100.00, TRUE,
    'sha256_dmr_91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
) ON CONFLICT (facility_id, golden_code) DO NOTHING;

INSERT INTO public.dmr_candidate_pairs (
    id, facility_id, pair_code, entity_type,
    source_record_a_id, source_module_a, record_a_snapshot_json,
    source_record_b_id, source_module_b, record_b_snapshot_json,
    confidence_score, match_classification, matched_fields_json, score_breakdown_json,
    resolution_status, golden_record_id, financial_exposure_usd, sha256_sync_seal
) VALUES
(
    'd4200001-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'DMR-PAIR-201', 'VENDOR_INVOICE',
    'inv-810-9910', 'VENDOR_INVOICE', '{"vendor_code": "VND-STRYKER", "invoice_number": "INV-2026-88412", "invoice_total_usd": 4250.00, "invoice_date": "2026-11-18", "po_number": "PO-NAP-7721"}'::jsonb,
    'csv-ap-3302', 'EXCEL_CSV', '{"vendor_code": "VND-STRYKER", "invoice_number": "INV2026-88412", "invoice_total_usd": 4250.00, "invoice_date": "2026-11-18", "po_number": ""}'::jsonb,
    100.00, 'EXACT_DUPLICATE', '["vendor_code", "invoice_number", "invoice_total_usd", "invoice_date"]'::jsonb,
    '{"vendor_code": 30.00, "invoice_number": 40.00, "invoice_total_usd": 20.00, "invoice_date": 10.00}'::jsonb,
    'AUTO_MERGED', 'd4100001-0000-4000-8000-000000000001', 4250.00,
    'sha256_dmr_a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4'
),
(
    'd4200002-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'DMR-PAIR-202', 'VENDOR',
    'vnd-zb-01', 'ACCOUNTING_GL', '{"vendor_code": "ZIMMER-01", "legal_name": "Zimmer Biomet Holdings Inc", "tax_id_ein": "13-4041511", "remit_zip": "46580"}'::jsonb,
    'vnd-zb-imp-09', 'INVENTORY_POU', '{"vendor_code": "ZIMMER-SURG", "legal_name": "Zimmer Biomet Surgical LLC", "tax_id_ein": "13-4041511", "remit_zip": "46580"}'::jsonb,
    91.40, 'HIGH_CONFIDENCE_CANDIDATE', '["tax_id_ein", "legal_name", "remit_zip"]'::jsonb,
    '{"tax_id_ein": 35.00, "legal_name": 31.40, "vendor_code": 15.00, "remit_zip": 10.00}'::jsonb,
    'PENDING_REVIEW', NULL, 18450.00,
    'sha256_dmr_b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5'
),
(
    'd4200003-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'DMR-PAIR-203', 'PATIENT',
    'pat-sis-4410', 'SIS_EHR', '{"mrn": "MRN-884102", "first_name": "Eleanor", "last_name": "Vance-Miller", "dob": "1964-08-19", "ssn_last4": "4921"}'::jsonb,
    'pat-hst-9021', 'HST_EHR', '{"mrn": "MRN-884102", "first_name": "Eleanor", "last_name": "Vance", "dob": "1964-08-19", "ssn_last4": "4921"}'::jsonb,
    93.20, 'HIGH_CONFIDENCE_CANDIDATE', '["mrn", "first_name", "dob", "ssn_last4"]'::jsonb,
    '{"mrn": 30.00, "last_name": 18.20, "first_name": 20.00, "dob": 15.00, "ssn_last4": 10.00}'::jsonb,
    'PENDING_REVIEW', NULL, 0.00,
    'sha256_dmr_c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6'
),
(
    'd4200004-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000002',
    'DMR-PAIR-204', 'CLAIM',
    'clm-837-7741', 'CLEARINGHOUSE_EDI', '{"payer_control_number": "PCN-UHC-55219", "patient_mrn": "MRN-77310", "dos": "2026-11-20", "billed_amount_usd": 6890.00}'::jsonb,
    'clm-sis-7741b', 'SIS_EHR', '{"payer_control_number": "PCN-UHC-55219", "patient_mrn": "MRN-77310", "dos": "2026-11-20", "billed_amount_usd": 6890.00}'::jsonb,
    100.00, 'EXACT_DUPLICATE', '["payer_control_number", "patient_mrn", "dos", "billed_amount_usd"]'::jsonb,
    '{"payer_control_number": 35.00, "patient_mrn": 25.00, "dos": 20.00, "billed_amount_usd": 20.00}'::jsonb,
    'PENDING_REVIEW', NULL, 6890.00,
    'sha256_dmr_d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7'
) ON CONFLICT (facility_id, pair_code) DO NOTHING;

INSERT INTO public.dmr_match_runs (
    facility_id, batch_control_number, entity_scope, records_scanned,
    pairs_evaluated, exact_duplicates_found, candidates_queued, auto_merged_count,
    duration_ms, executed_by, sha256_sync_seal
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    'DMR-BATCH-20261126-01', 'ALL', 1842, 4, 2, 3, 1, 218,
    'system.scheduler@naplessurgery.com',
    'sha256_dmr_e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8'
) ON CONFLICT (facility_id, batch_control_number) DO NOTHING;
