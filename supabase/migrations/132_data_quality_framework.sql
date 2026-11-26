-- ==============================================================================
-- Migration: 132_data_quality_framework.sql
-- Module 16: Enterprise Data Quality Governance (Phase G0)
-- Description: Six-Dimension Data Quality Index (DQI) Engine, Configurable Weights,
--              Declarative Cross-Domain Validation Rules Registry, Domain Trust
--              Scorecards, Exception Remediation Workqueue, and SHA-256 Provenance.
-- ==============================================================================

-- 1. Data Quality Framework Governance Configuration Table
CREATE TABLE IF NOT EXISTS public.dq_framework_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    certified_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    warning_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 85.00,
    block_ai_on_quarantine BOOLEAN NOT NULL DEFAULT TRUE,
    auto_scan_cron VARCHAR(32) NOT NULL DEFAULT 'HOURLY',
    alert_webhook_url VARCHAR(255),
    client_secret_encrypted TEXT,
    governance_owner VARCHAR(128) NOT NULL DEFAULT 'data_steward@naplesasc.com',
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'SCANNING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dq_config UNIQUE (facility_id)
);

-- 2. Six-Dimension Quality Weight Matrix Table
CREATE TABLE IF NOT EXISTS public.dq_dimension_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    dimension_code VARCHAR(32) NOT NULL CHECK (
        dimension_code IN ('COMPLETENESS', 'ACCURACY', 'CONSISTENCY', 'TIMELINESS', 'UNIQUENESS', 'VALIDITY')
    ),
    dimension_label VARCHAR(64) NOT NULL,
    weight_pct NUMERIC(5,2) NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
    sla_target_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    description TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dq_dimension UNIQUE (facility_id, dimension_code)
);

-- 3. Declarative Data Quality Rule Definitions Table
CREATE TABLE IF NOT EXISTS public.dq_rule_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    rule_code VARCHAR(48) NOT NULL,
    rule_name VARCHAR(128) NOT NULL,
    dimension_code VARCHAR(32) NOT NULL CHECK (
        dimension_code IN ('COMPLETENESS', 'ACCURACY', 'CONSISTENCY', 'TIMELINESS', 'UNIQUENESS', 'VALIDITY')
    ),
    target_domain VARCHAR(48) NOT NULL CHECK (
        target_domain IN ('EHR_CASES', 'CLAIMS_837', 'REMIT_835', 'GL_ACCOUNTING', 'PAYROLL_LABOR', 'INVENTORY_SUPPLY', 'VENDOR_INVOICE')
    ),
    operator_type VARCHAR(32) NOT NULL CHECK (
        operator_type IN ('NOT_NULL', 'CHRONOLOGY_LTE', 'NON_NEGATIVE', 'EQUAL_BALANCE', 'REGEX_MATCH', 'RANGE_PCT')
    ),
    rule_expression TEXT NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dq_rule_code UNIQUE (facility_id, rule_code)
);

-- 4. Data Quality Assessment Runs Table
CREATE TABLE IF NOT EXISTS public.dq_assessment_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_code VARCHAR(64) NOT NULL,
    overall_dqi_score NUMERIC(5,2) NOT NULL,
    completeness_score NUMERIC(5,2) NOT NULL,
    accuracy_score NUMERIC(5,2) NOT NULL,
    consistency_score NUMERIC(5,2) NOT NULL,
    timeliness_score NUMERIC(5,2) NOT NULL,
    uniqueness_score NUMERIC(5,2) NOT NULL,
    validity_score NUMERIC(5,2) NOT NULL,
    records_evaluated INT NOT NULL DEFAULT 0,
    rules_passed INT NOT NULL DEFAULT 0,
    rules_failed INT NOT NULL DEFAULT 0,
    gate_status VARCHAR(24) NOT NULL CHECK (
        gate_status IN ('CERTIFIED', 'CAUTION_REVIEW', 'QUARANTINED_HOLD')
    ),
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dq_run_code UNIQUE (facility_id, run_code)
);

-- 5. Domain Trust Scorecards Table
CREATE TABLE IF NOT EXISTS public.dq_domain_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    domain_code VARCHAR(48) NOT NULL,
    domain_label VARCHAR(128) NOT NULL,
    dqi_score NUMERIC(5,2) NOT NULL,
    records_scanned INT NOT NULL DEFAULT 0,
    open_exceptions INT NOT NULL DEFAULT 0,
    trust_status VARCHAR(24) NOT NULL CHECK (
        trust_status IN ('CERTIFIED', 'CAUTION_REVIEW', 'QUARANTINED_HOLD')
    ),
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_dq_domain UNIQUE (facility_id, domain_code)
);

-- 6. Data Quality Exception & Waiver Logs Table
CREATE TABLE IF NOT EXISTS public.dq_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_id UUID REFERENCES public.dq_assessment_runs(id) ON DELETE SET NULL,
    rule_code VARCHAR(48) NOT NULL,
    dimension_code VARCHAR(32) NOT NULL,
    target_domain VARCHAR(48) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_record_id VARCHAR(64) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    observed_value TEXT,
    expected_rule TEXT NOT NULL,
    remediation_status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        remediation_status IN ('OPEN', 'IN_REVIEW', 'REMEDIATED', 'WAIVED')
    ),
    waiver_reason TEXT,
    resolved_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 7. Data Quality Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.dq_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_id UUID REFERENCES public.dq_assessment_runs(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_dq_configs_fac ON public.dq_framework_configs (facility_id);
CREATE INDEX IF NOT EXISTS idx_dq_weights_fac ON public.dq_dimension_weights (facility_id);
CREATE INDEX IF NOT EXISTS idx_dq_rules_fac_dim ON public.dq_rule_definitions (facility_id, dimension_code, is_active);
CREATE INDEX IF NOT EXISTS idx_dq_runs_fac_date ON public.dq_assessment_runs (facility_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dq_domains_fac ON public.dq_domain_scores (facility_id, trust_status);
CREATE INDEX IF NOT EXISTS idx_dq_exceptions_fac_status ON public.dq_exception_logs (facility_id, remediation_status);
CREATE INDEX IF NOT EXISTS idx_dq_provenance_fac ON public.dq_provenance_ledger (facility_id, created_at DESC);

-- Row Level Security (RLS) Tenancy Policies
ALTER TABLE public.dq_framework_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dq_dimension_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dq_rule_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dq_assessment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dq_domain_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dq_exception_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dq_provenance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_dq_config_tenant ON public.dq_framework_configs;
CREATE POLICY p_dq_config_tenant ON public.dq_framework_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_dq_weights_tenant ON public.dq_dimension_weights;
CREATE POLICY p_dq_weights_tenant ON public.dq_dimension_weights
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_dq_rules_tenant ON public.dq_rule_definitions;
CREATE POLICY p_dq_rules_tenant ON public.dq_rule_definitions
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_dq_runs_tenant ON public.dq_assessment_runs;
CREATE POLICY p_dq_runs_tenant ON public.dq_assessment_runs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_dq_domains_tenant ON public.dq_domain_scores;
CREATE POLICY p_dq_domains_tenant ON public.dq_domain_scores
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_dq_exceptions_tenant ON public.dq_exception_logs;
CREATE POLICY p_dq_exceptions_tenant ON public.dq_exception_logs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_dq_provenance_tenant ON public.dq_provenance_ledger;
CREATE POLICY p_dq_provenance_tenant ON public.dq_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_data_quality_telemetry AS
SELECT
    c.facility_id,
    c.certified_threshold_pct,
    c.warning_threshold_pct,
    c.block_ai_on_quarantine,
    c.sync_status,
    c.health_status,
    COALESCE((SELECT overall_dqi_score FROM public.dq_assessment_runs WHERE facility_id = c.facility_id ORDER BY executed_at DESC LIMIT 1), 95.80)::NUMERIC(5,2) AS latest_dqi_score,
    COALESCE((SELECT gate_status FROM public.dq_assessment_runs WHERE facility_id = c.facility_id ORDER BY executed_at DESC LIMIT 1), 'CAUTION_REVIEW') AS latest_gate_status,
    COALESCE(COUNT(DISTINCT r.id) FILTER (WHERE r.is_active = TRUE), 0)::INT AS active_rules_count,
    COALESCE(COUNT(DISTINCT d.id) FILTER (WHERE d.trust_status = 'CERTIFIED'), 0)::INT AS certified_domains_count,
    COALESCE(COUNT(DISTINCT d.id), 0)::INT AS total_domains_count,
    COALESCE(COUNT(DISTINCT e.id) FILTER (WHERE e.remediation_status IN ('OPEN', 'IN_REVIEW')), 0)::INT AS open_exceptions_count,
    COALESCE(COUNT(DISTINCT e.id) FILTER (WHERE e.remediation_status IN ('OPEN', 'IN_REVIEW') AND e.severity = 'CRITICAL'), 0)::INT AS critical_exceptions_count,
    (SELECT sha256_sync_seal FROM public.dq_assessment_runs WHERE facility_id = c.facility_id ORDER BY executed_at DESC LIMIT 1) AS latest_sync_seal
FROM public.dq_framework_configs c
LEFT JOIN public.dq_rule_definitions r ON c.facility_id = r.facility_id
LEFT JOIN public.dq_domain_scores d ON c.facility_id = d.facility_id
LEFT JOIN public.dq_exception_logs e ON c.facility_id = e.facility_id
GROUP BY c.facility_id, c.certified_threshold_pct, c.warning_threshold_pct, c.block_ai_on_quarantine, c.sync_status, c.health_status;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    run_1_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        -- Seed Active Governance Config
        INSERT INTO public.dq_framework_configs (
            facility_id, certified_threshold_pct, warning_threshold_pct,
            block_ai_on_quarantine, auto_scan_cron, alert_webhook_url,
            client_secret_encrypted, governance_owner, sync_status, health_status
        ) VALUES (
            naples_id,
            95.00,
            85.00,
            TRUE,
            'HOURLY',
            'https://alerts.naplesasc.io/v1/dq-webhook',
            'enc_v2_66b20c13de847591028374918237491823749182374918237491823749184412',
            'data_steward@naplesasc.com',
            'ACTIVE',
            'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET
            certified_threshold_pct = EXCLUDED.certified_threshold_pct,
            sync_status = EXCLUDED.sync_status;

        -- Seed Six Dimension Weights (Strictly sums to 100.00)
        INSERT INTO public.dq_dimension_weights (
            facility_id, dimension_code, dimension_label, weight_pct, sla_target_score, description
        ) VALUES
        (naples_id, 'COMPLETENESS', 'Completeness', 25.00, 98.00, 'Mandatory clinical, CPT, payer, and demographic fields populated without nulls.'),
        (naples_id, 'ACCURACY', 'Accuracy', 25.00, 97.00, 'Arithmetic balancing invariants and contracted pricing tolerances.'),
        (naples_id, 'CONSISTENCY', 'Consistency', 20.00, 95.00, 'Cross-system parity across EHR cases, 837/835 claims, GL cash, and vendor POs.'),
        (naples_id, 'TIMELINESS', 'Timeliness', 15.00, 95.00, 'Data feed latency adherence against real-time and batch SLA targets.'),
        (naples_id, 'UNIQUENESS', 'Uniqueness', 10.00, 99.00, 'Zero duplicate surgical cases, claims, patient records, or vendor invoices.'),
        (naples_id, 'VALIDITY', 'Validity', 5.00, 98.00, 'Format compliance for CPT/ICD-10 codes, FDA UDI strings, and milestone chronology.')
        ON CONFLICT (facility_id, dimension_code) DO NOTHING;

        -- Seed Core Data Quality Rules
        INSERT INTO public.dq_rule_definitions (
            facility_id, rule_code, rule_name, dimension_code, target_domain,
            operator_type, rule_expression, severity, is_active
        ) VALUES
        (naples_id, 'DQ-EHR-001', 'Perioperative Milestone Chronology Order', 'VALIDITY', 'EHR_CASES', 'CHRONOLOGY_LTE', 'room_in <= cut <= close <= room_out', 'CRITICAL', TRUE),
        (naples_id, 'DQ-EHR-002', 'Mandatory Primary Surgeon & CPT Assignment', 'COMPLETENESS', 'EHR_CASES', 'NOT_NULL', 'surgeon_id IS NOT NULL AND primary_cpt IS NOT NULL', 'CRITICAL', TRUE),
        (naples_id, 'DQ-CLM-001', '835 Remittance Zero-Balance Equation', 'ACCURACY', 'REMIT_835', 'EQUAL_BALANCE', 'billed - adjustments - paid - patient_resp == 0', 'CRITICAL', TRUE),
        (naples_id, 'DQ-GL-001', 'Double-Entry Journal Debit Credit Balance', 'ACCURACY', 'GL_ACCOUNTING', 'EQUAL_BALANCE', 'sum(debits) - sum(credits) == 0', 'CRITICAL', TRUE),
        (naples_id, 'DQ-PAY-001', 'Shift Clock Punch Maximum Duration Guard', 'ACCURACY', 'PAYROLL_LABOR', 'NON_NEGATIVE', '0 < shift_hours <= 16.0', 'WARNING', TRUE),
        (naples_id, 'DQ-INV-001', 'Implant UDI GS1-128 & Non-Expired Lot Check', 'VALIDITY', 'INVENTORY_SUPPLY', 'REGEX_MATCH', 'udi LIKE %(01)% AND exp_date >= surgery_date', 'CRITICAL', TRUE),
        (naples_id, 'DQ-VINV-001', 'Vendor Invoice Contract Price Tolerance Check', 'CONSISTENCY', 'VENDOR_INVOICE', 'RANGE_PCT', 'abs(invoiced_price - contract_price) / contract_price <= 0.02', 'CRITICAL', TRUE),
        (naples_id, 'DQ-UNQ-001', 'Duplicate Vendor Invoice Number Blocker', 'UNIQUENESS', 'VENDOR_INVOICE', 'NOT_NULL', 'UNIQUE(facility_id, vendor_name, invoice_number)', 'CRITICAL', TRUE)
        ON CONFLICT (facility_id, rule_code) DO NOTHING;

        -- Seed Latest Assessment Run
        INSERT INTO public.dq_assessment_runs (
            id, facility_id, run_code, overall_dqi_score,
            completeness_score, accuracy_score, consistency_score,
            timeliness_score, uniqueness_score, validity_score,
            records_evaluated, rules_passed, rules_failed, gate_status,
            duration_ms, sha256_sync_seal, executed_at
        ) VALUES (
            run_1_id,
            naples_id,
            'DQ-SCAN-20260224-01',
            95.80,
            97.50,
            96.20,
            92.40,
            96.00,
            99.20,
            95.50,
            2840,
            2837,
            3,
            'CAUTION_REVIEW',
            420,
            'sha256_dq_7a189fbc0123456789abcdef0123456789abcdef0123456789abcd',
            NOW() - INTERVAL '1 hour'
        ) ON CONFLICT (facility_id, run_code) DO NOTHING;

        -- Seed Domain Scorecards
        INSERT INTO public.dq_domain_scores (
            facility_id, domain_code, domain_label, dqi_score, records_scanned, open_exceptions, trust_status
        ) VALUES
        (naples_id, 'EHR_CASES', 'EHR Clinical & OR Milestones (SIS / HST)', 98.40, 842, 0, 'CERTIFIED'),
        (naples_id, 'CLAIMS_837', 'Clearinghouse Claims & 835 Remittances', 97.60, 620, 0, 'CERTIFIED'),
        (naples_id, 'GL_ACCOUNTING', 'General Ledger & Bank Reconciliation', 99.10, 412, 0, 'CERTIFIED'),
        (naples_id, 'PAYROLL_LABOR', 'Payroll Timecards & Case Labor Costing', 94.20, 380, 1, 'CAUTION_REVIEW'),
        (naples_id, 'INVENTORY_SUPPLY', 'Inventory Par Depots & Implant UDI', 96.10, 444, 1, 'CAUTION_REVIEW'),
        (naples_id, 'VENDOR_INVOICE', 'Vendor Invoices & 3-Way PO Matching', 88.50, 142, 1, 'CAUTION_REVIEW')
        ON CONFLICT (facility_id, domain_code) DO NOTHING;

        -- Seed Open Data Quality Exceptions
        INSERT INTO public.dq_exception_logs (
            facility_id, run_id, rule_code, dimension_code, target_domain,
            severity, offending_record_id, field_name, observed_value, expected_rule,
            remediation_status
        ) VALUES
        (
            naples_id, run_1_id, 'DQ-VINV-001', 'CONSISTENCY', 'VENDOR_INVOICE',
            'CRITICAL', 'INV-CH-442910 / CH-J316H', 'invoiced_unit_price', '$120.50 (+42.6%)',
            'Contracted unit price $84.50 ± 2.00%', 'OPEN'
        ),
        (
            naples_id, run_1_id, 'DQ-PAY-001', 'ACCURACY', 'PAYROLL_LABOR',
            'WARNING', 'SHIFT-EMP-1082', 'shift_duration_hours', '18.4 hrs',
            '0 < shift_hours <= 16.0 hrs', 'OPEN'
        )
        ON CONFLICT DO NOTHING;

        -- Seed Provenance Ledger
        INSERT INTO public.dq_provenance_ledger (
            facility_id, run_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id, run_1_id, 'DQ_ASSESSMENT_SCAN_COMPLETED', 2840,
            'sha256_dq_7a189fbc0123456789abcdef0123456789abcdef0123456789abcd',
            'data_steward@naplesasc.com',
            '{"overall_dqi": 95.80, "gate_status": "CAUTION_REVIEW", "open_exceptions": 2}'::jsonb
        ) ON CONFLICT DO NOTHING;

    END IF;
END $$;
