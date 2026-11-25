-- ==============================================================================
-- Migration: 123_import_validation_pipeline.sql
-- Description: Phase F1 Import Validation Pipeline
--              Deterministic 6-Stage Workflow:
--              Import > Validate > Normalize > Match > Exception > Commit
--              Multi-tenancy RLS, Validation Rules Registry, Exception Workqueue,
--              and Cryptographic Commit Provenance.
-- Maestro Clinical Design System: Emerald, Sky, Amber, Crimson, Slate, Neutral
-- Zero Prohibited Accent Tokens
-- ==============================================================================

-- 1. Pipeline Execution Batches Table
CREATE TABLE IF NOT EXISTS public.import_pipeline_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_code VARCHAR(32) NOT NULL,
    source_connector_code VARCHAR(32) NOT NULL,
    source_connector_name VARCHAR(128) NOT NULL,
    current_stage VARCHAR(24) NOT NULL DEFAULT 'IMPORT' CHECK (
        current_stage IN ('IMPORT', 'VALIDATE', 'NORMALIZE', 'MATCH', 'EXCEPTION', 'COMMIT', 'COMPLETED', 'FAILED')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'PROCESSING' CHECK (
        status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_EXCEPTIONS', 'FAILED', 'CANCELLED')
    ),
    records_staged INT NOT NULL DEFAULT 0,
    records_validated INT NOT NULL DEFAULT 0,
    records_normalized INT NOT NULL DEFAULT 0,
    records_matched INT NOT NULL DEFAULT 0,
    records_quarantined INT NOT NULL DEFAULT 0,
    records_committed INT NOT NULL DEFAULT 0,
    records_rejected INT NOT NULL DEFAULT 0,
    total_duration_ms INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_pipeline_batch UNIQUE (facility_id, batch_code)
);

CREATE INDEX IF NOT EXISTS idx_import_pipeline_batches_fac ON public.import_pipeline_batches(facility_id, started_at DESC);

-- 2. Staged Records Buffer Table
CREATE TABLE IF NOT EXISTS public.import_staged_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.import_pipeline_batches(id) ON DELETE CASCADE,
    source_record_id VARCHAR(64) NOT NULL,
    record_type VARCHAR(32) NOT NULL CHECK (
        record_type IN ('SURGICAL_CASE', 'CLAIM_837', 'REMITTANCE_835', 'IMPLANT_PURCHASE', 'PATIENT_DEMOGRAPHIC')
    ),
    stage VARCHAR(24) NOT NULL DEFAULT 'STAGED' CHECK (
        stage IN ('STAGED', 'VALIDATED', 'NORMALIZED', 'MATCHED', 'EXCEPTION', 'COMMITTED', 'REJECTED')
    ),
    raw_payload JSONB NOT NULL,
    normalized_payload JSONB,
    match_status VARCHAR(24) DEFAULT 'PENDING' CHECK (
        match_status IN ('PENDING', 'EXACT_MATCH', 'COMPOSITE_MATCH', 'NEW_RECORD', 'DUPLICATE_SUSPECT', 'CONFLICT')
    ),
    matched_target_id UUID,
    payload_hash VARCHAR(64) NOT NULL,
    error_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_staged_records_batch ON public.import_staged_records(batch_id, stage);
CREATE INDEX IF NOT EXISTS idx_import_staged_records_fac ON public.import_staged_records(facility_id, source_record_id);

-- 3. Validation Rules Registry Table
CREATE TABLE IF NOT EXISTS public.import_validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code VARCHAR(32) NOT NULL UNIQUE,
    rule_name VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL CHECK (
        category IN ('SYNTACTIC', 'SEMANTIC', 'REFERENTIAL', 'FINANCIAL', 'CLINICAL')
    ),
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL' CHECK (
        severity IN ('CRITICAL', 'WARNING', 'INFO')
    ),
    target_record_type VARCHAR(32) NOT NULL,
    target_field VARCHAR(64) NOT NULL,
    validation_logic VARCHAR(128) NOT NULL,
    failure_message TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_val_rules_cat ON public.import_validation_rules(category, is_active);

-- 4. Import Exceptions Workqueue Table
CREATE TABLE IF NOT EXISTS public.import_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.import_pipeline_batches(id) ON DELETE CASCADE,
    staged_record_id UUID NOT NULL REFERENCES public.import_staged_records(id) ON DELETE CASCADE,
    rule_code VARCHAR(32) NOT NULL,
    severity VARCHAR(16) NOT NULL DEFAULT 'CRITICAL' CHECK (
        severity IN ('CRITICAL', 'WARNING', 'INFO')
    ),
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('SCHEMA_ERROR', 'UNRECOGNIZED_CODE', 'UNMATCHED_SURGEON', 'UNMAPPED_PAYER', 'DUPLICATE_SUSPECT', 'FINANCIAL_IMBALANCE')
    ),
    field_name VARCHAR(64),
    source_value TEXT,
    suggested_value TEXT,
    resolution_status VARCHAR(24) NOT NULL DEFAULT 'PENDING' CHECK (
        resolution_status IN ('PENDING', 'RESOLVED', 'REJECTED', 'IGNORED')
    ),
    resolution_action VARCHAR(32) CHECK (
        resolution_action IN ('OVERRIDE_AND_COMMIT', 'REMAP_FIELD', 'REJECT_RECORD', 'MERGE_RECORD')
    ),
    resolution_notes TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_exceptions_fac ON public.import_exceptions(facility_id, resolution_status);

-- 5. Import Provenance Audit Table
CREATE TABLE IF NOT EXISTS public.import_provenance_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.import_pipeline_batches(id) ON DELETE CASCADE,
    staged_record_id UUID NOT NULL REFERENCES public.import_staged_records(id) ON DELETE CASCADE,
    target_table VARCHAR(64) NOT NULL,
    target_record_id UUID NOT NULL,
    action_type VARCHAR(24) NOT NULL DEFAULT 'INSERT' CHECK (
        action_type IN ('INSERT', 'UPDATE', 'MERGE')
    ),
    commit_seal VARCHAR(64) NOT NULL,
    committed_by UUID,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_audit_fac ON public.import_provenance_audit(facility_id, committed_at DESC);

-- 6. Pipeline Telemetry View
CREATE OR REPLACE VIEW public.vw_import_pipeline_telemetry AS
SELECT
    b.facility_id,
    COUNT(DISTINCT b.id) AS total_batches_24h,
    COALESCE(SUM(b.records_staged), 0) AS total_staged_24h,
    COALESCE(SUM(b.records_committed), 0) AS total_committed_24h,
    COALESCE(SUM(b.records_quarantined), 0) AS total_quarantined_24h,
    ROUND(
        CASE WHEN SUM(b.records_staged) > 0 THEN
            (SUM(b.records_committed)::numeric / SUM(b.records_staged)::numeric) * 100
        ELSE 100.0 END, 2
    ) AS clean_pass_rate_percent,
    COALESCE(ROUND(AVG(b.total_duration_ms)), 0) AS avg_duration_ms
FROM public.import_pipeline_batches b
WHERE b.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY b.facility_id;

-- 7. Row Level Security Policies
ALTER TABLE public.import_pipeline_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_staged_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_provenance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_pipeline_batches ON public.import_pipeline_batches;
CREATE POLICY tenant_isolation_pipeline_batches ON public.import_pipeline_batches
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_staged_records ON public.import_staged_records;
CREATE POLICY tenant_isolation_staged_records ON public.import_staged_records
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS public_read_validation_rules ON public.import_validation_rules;
CREATE POLICY public_read_validation_rules ON public.import_validation_rules
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS tenant_isolation_import_exceptions ON public.import_exceptions;
CREATE POLICY tenant_isolation_import_exceptions ON public.import_exceptions
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_provenance_audit ON public.import_provenance_audit;
CREATE POLICY tenant_isolation_provenance_audit ON public.import_provenance_audit
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 8. Seed Data for Naples Surgery Center
INSERT INTO public.import_validation_rules (
    rule_code, rule_name, category, severity, target_record_type, target_field, validation_logic, failure_message
) VALUES
('VAL_NPI_001', 'Surgeon NPI Luhn Checksum', 'SYNTACTIC', 'CRITICAL', 'SURGICAL_CASE', 'surgeon_npi', 'REGEX_10_DIGIT_LUHN', 'NPI must be exactly 10 digits and satisfy CMS Luhn check'),
('VAL_DOS_002', 'Date of Service Boundary', 'SEMANTIC', 'CRITICAL', 'SURGICAL_CASE', 'surgery_date', 'DATE_BETWEEN_2020_AND_NOW_PLUS_30D', 'DOS cannot be prior to 2020 or >30 days in the future'),
('VAL_CPT_003', 'CPT / HCPCS Code Format', 'SYNTACTIC', 'CRITICAL', 'SURGICAL_CASE', 'primary_cpt', 'REGEX_CPT_STANDARD', 'CPT must be 5 numeric digits or 4 digits followed by alpha character'),
('VAL_CURR_004', 'Financial Non-Negative Integrity', 'FINANCIAL', 'CRITICAL', 'CLAIM_837', 'billed_amount', 'NUMERIC_GTE_ZERO', 'Billed charges and reimbursement values must be >= 0.00'),
('VAL_TIME_005', 'Operative Duration Range', 'CLINICAL', 'WARNING', 'SURGICAL_CASE', 'duration_minutes', 'NUMERIC_BETWEEN_1_AND_720', 'Operating room surgical duration must be between 1 and 720 minutes')
ON CONFLICT (rule_code) DO UPDATE SET
    rule_name = EXCLUDED.rule_name,
    category = EXCLUDED.category,
    severity = EXCLUDED.severity,
    failure_message = EXCLUDED.failure_message;

-- Seed Pipeline Batch
INSERT INTO public.import_pipeline_batches (
    id, facility_id, batch_code, source_connector_code, source_connector_name,
    current_stage, status, records_staged, records_validated, records_normalized,
    records_matched, records_quarantined, records_committed, records_rejected,
    total_duration_ms, started_at, completed_at
) VALUES (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000002',
    'PIPE_20261125_001',
    'CONN_HST_PATHWAYS',
    'HST Pathways EHR / Practice Management',
    'COMPLETED',
    'COMPLETED_WITH_EXCEPTIONS',
    250, 246, 246, 245, 5, 245, 0,
    840, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '58 minutes'
) ON CONFLICT (facility_id, batch_code) DO NOTHING;
