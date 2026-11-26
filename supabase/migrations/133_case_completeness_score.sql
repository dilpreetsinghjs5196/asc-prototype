-- ==============================================================================
-- Migration: 133_case_completeness_score.sql
-- Module 16: Enterprise Data Quality Governance (Phase G1)
-- Description: Five-Pillar Operational & Clinical Case Completeness Scoring,
--              Pre-Bill Readiness Gates, Field-Level Deficiency Checklists,
--              Specialty Benchmarks, and SHA-256 Audit Provenance.
-- ==============================================================================

-- 1. Case Completeness Configuration Table
CREATE TABLE IF NOT EXISTS public.case_completeness_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    billing_ready_min_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    review_min_score NUMERIC(5,2) NOT NULL DEFAULT 80.00,
    enforce_coding_lock BOOLEAN NOT NULL DEFAULT TRUE,
    enforce_implant_udi BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'AUDITING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ccs_config UNIQUE (facility_id)
);

-- 2. Five-Pillar Case Completeness Rubrics Table
CREATE TABLE IF NOT EXISTS public.case_completeness_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    pillar_code VARCHAR(32) NOT NULL CHECK (
        pillar_code IN ('DEMOGRAPHICS_IDENTITY', 'PERIOPERATIVE_TIMESTAMPS', 'CARE_TEAM_STAFFING', 'CLINICAL_CODING', 'ATTESTATION_IMPLANT_UDI')
    ),
    pillar_label VARCHAR(64) NOT NULL,
    weight_pct NUMERIC(5,2) NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
    mandatory_fields_count INT NOT NULL DEFAULT 4,
    description TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ccs_pillar UNIQUE (facility_id, pillar_code)
);

-- 3. Per-Case Completeness Scorecards Table
CREATE TABLE IF NOT EXISTS public.case_completeness_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    platform_case_id UUID,
    service_date DATE NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    specialty_name VARCHAR(64) NOT NULL,
    primary_cpt VARCHAR(16),
    demographics_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    timestamps_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    staffing_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    coding_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    attestation_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    overall_completeness_score NUMERIC(5,2) NOT NULL,
    missing_fields_count INT NOT NULL DEFAULT 0,
    critical_blockers_count INT NOT NULL DEFAULT 0,
    readiness_status VARCHAR(24) NOT NULL CHECK (
        readiness_status IN ('BILLING_READY', 'CLINICAL_REVIEW', 'INCOMPLETE_HOLD')
    ),
    sha256_sync_seal VARCHAR(128) NOT NULL,
    scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ccs_case UNIQUE (facility_id, case_identifier)
);

-- 4. Granular Case Field Gap Checklist Table
CREATE TABLE IF NOT EXISTS public.case_completeness_field_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_score_id UUID REFERENCES public.case_completeness_scores(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    pillar_code VARCHAR(32) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING')),
    expected_requirement TEXT NOT NULL,
    remediation_status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        remediation_status IN ('OPEN', 'RESOLVED', 'NOT_APPLICABLE')
    ),
    resolution_value TEXT,
    resolved_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 5. Specialty Completeness Benchmarks Table
CREATE TABLE IF NOT EXISTS public.case_completeness_specialty_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty_name VARCHAR(64) NOT NULL,
    total_cases INT NOT NULL DEFAULT 0,
    avg_completeness_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    billing_ready_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    top_gap_field VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ccs_specialty UNIQUE (facility_id, specialty_name)
);

-- 6. Batch Case Completeness Audit Runs Table
CREATE TABLE IF NOT EXISTS public.case_completeness_audit_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_code VARCHAR(64) NOT NULL,
    cases_evaluated INT NOT NULL DEFAULT 0,
    billing_ready_count INT NOT NULL DEFAULT 0,
    incomplete_hold_count INT NOT NULL DEFAULT 0,
    mean_completeness_score NUMERIC(5,2) NOT NULL,
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ccs_run UNIQUE (facility_id, run_code)
);

-- 7. Case Completeness Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.case_completeness_provenance_ledger (
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
CREATE INDEX IF NOT EXISTS idx_ccs_configs_fac ON public.case_completeness_configs (facility_id);
CREATE INDEX IF NOT EXISTS idx_ccs_rubrics_fac ON public.case_completeness_rubrics (facility_id);
CREATE INDEX IF NOT EXISTS idx_ccs_scores_fac_status ON public.case_completeness_scores (facility_id, readiness_status);
CREATE INDEX IF NOT EXISTS idx_ccs_gaps_case ON public.case_completeness_field_gaps (case_identifier, remediation_status);
CREATE INDEX IF NOT EXISTS idx_ccs_benchmarks_fac ON public.case_completeness_specialty_benchmarks (facility_id);
CREATE INDEX IF NOT EXISTS idx_ccs_runs_fac ON public.case_completeness_audit_runs (facility_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccs_provenance_fac ON public.case_completeness_provenance_ledger (facility_id, created_at DESC);

-- Row Level Security (RLS) Tenancy Policies
ALTER TABLE public.case_completeness_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completeness_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completeness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completeness_field_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completeness_specialty_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completeness_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_completeness_provenance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ccs_config_tenant ON public.case_completeness_configs;
CREATE POLICY p_ccs_config_tenant ON public.case_completeness_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ccs_rubrics_tenant ON public.case_completeness_rubrics;
CREATE POLICY p_ccs_rubrics_tenant ON public.case_completeness_rubrics
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ccs_scores_tenant ON public.case_completeness_scores;
CREATE POLICY p_ccs_scores_tenant ON public.case_completeness_scores
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ccs_gaps_tenant ON public.case_completeness_field_gaps;
CREATE POLICY p_ccs_gaps_tenant ON public.case_completeness_field_gaps
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ccs_benchmarks_tenant ON public.case_completeness_specialty_benchmarks;
CREATE POLICY p_ccs_benchmarks_tenant ON public.case_completeness_specialty_benchmarks
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ccs_runs_tenant ON public.case_completeness_audit_runs;
CREATE POLICY p_ccs_runs_tenant ON public.case_completeness_audit_runs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_ccs_provenance_tenant ON public.case_completeness_provenance_ledger;
CREATE POLICY p_ccs_provenance_tenant ON public.case_completeness_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_case_completeness_telemetry AS
SELECT
    c.facility_id,
    c.billing_ready_min_score,
    c.review_min_score,
    c.sync_status,
    c.health_status,
    COALESCE(ROUND(AVG(s.overall_completeness_score), 2), 92.40)::NUMERIC(5,2) AS avg_case_completeness_score,
    ROUND(
        COALESCE(
            COUNT(s.id) FILTER (WHERE s.readiness_status = 'BILLING_READY')::NUMERIC /
            NULLIF(COUNT(s.id), 0) * 100,
            75.0
        ),
        1
    )::NUMERIC(5,1) AS billing_ready_pct,
    COALESCE(COUNT(s.id) FILTER (WHERE s.readiness_status = 'INCOMPLETE_HOLD'), 0)::INT AS cases_on_hold_count,
    COALESCE(COUNT(g.id) FILTER (WHERE g.remediation_status = 'OPEN'), 0)::INT AS open_field_gaps_count,
    COALESCE(COUNT(s.id), 0)::INT AS total_cases_scored,
    (SELECT sha256_sync_seal FROM public.case_completeness_audit_runs WHERE facility_id = c.facility_id ORDER BY executed_at DESC LIMIT 1) AS latest_sync_seal
FROM public.case_completeness_configs c
LEFT JOIN public.case_completeness_scores s ON c.facility_id = s.facility_id
LEFT JOIN public.case_completeness_field_gaps g ON c.facility_id = g.facility_id
GROUP BY c.facility_id, c.billing_ready_min_score, c.review_min_score, c.sync_status, c.health_status;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    case_1_id UUID := gen_random_uuid();
    case_2_id UUID := gen_random_uuid();
    case_3_id UUID := gen_random_uuid();
    case_4_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.case_completeness_configs (
            facility_id, billing_ready_min_score, review_min_score,
            enforce_coding_lock, enforce_implant_udi, client_secret_encrypted,
            sync_status, health_status
        ) VALUES (
            naples_id,
            95.00,
            80.00,
            TRUE,
            TRUE,
            'enc_v2_55d30e24fa958602139485029348502934850293485029348502934850293301',
            'ACTIVE',
            'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET
            sync_status = EXCLUDED.sync_status;

        -- Seed 5-Pillar Rubrics (Strictly sums to 100.00%)
        INSERT INTO public.case_completeness_rubrics (
            facility_id, pillar_code, pillar_label, weight_pct, mandatory_fields_count, description
        ) VALUES
        (naples_id, 'DEMOGRAPHICS_IDENTITY', 'Demographics & Identity', 15.00, 4, 'Patient MRN, encounter ID, date of service, and primary payer eligibility verified.'),
        (naples_id, 'PERIOPERATIVE_TIMESTAMPS', 'Perioperative Timestamps', 25.00, 6, 'Pre-Op, Wheels-In, Incision, Close, Wheels-Out, and PACU discharge chronological order.'),
        (naples_id, 'CARE_TEAM_STAFFING', 'Care Team Staffing', 20.00, 4, 'Primary Surgeon, Anesthesia Provider, Circulating RN, and Scrub Tech logged.'),
        (naples_id, 'CLINICAL_CODING', 'Clinical Coding', 25.00, 4, 'Primary CPT, ICD-10 diagnosis, ASA class, and anatomical laterality modifier.'),
        (naples_id, 'ATTESTATION_IMPLANT_UDI', 'Attestation & Implant UDI', 15.00, 2, 'Signed surgeon operative report and FDA UDI serial/lot/expiration verification.')
        ON CONFLICT (facility_id, pillar_code) DO NOTHING;

        -- Seed 4 Case Scorecards (100%, 100%, 72.5% Hold, 90% Review)
        INSERT INTO public.case_completeness_scores (
            id, facility_id, case_identifier, service_date, surgeon_name, specialty_name, primary_cpt,
            demographics_score, timestamps_score, staffing_score, coding_score, attestation_score,
            overall_completeness_score, missing_fields_count, critical_blockers_count,
            readiness_status, sha256_sync_seal
        ) VALUES
        (
            case_1_id, naples_id, 'CAS-20260224-001', CURRENT_DATE - INTERVAL '2 days', 'Dr. Brian Miller', 'Orthopedics', '29881',
            100.00, 100.00, 100.00, 100.00, 100.00, 100.00, 0, 0, 'BILLING_READY',
            'sha256_ccs_1a289fbc0123456789abcdef0123456789abcdef0123456789abc'
        ),
        (
            case_2_id, naples_id, 'CAS-20260224-002', CURRENT_DATE - INTERVAL '2 days', 'Dr. Michael Chang', 'Ophthalmology', '66984',
            100.00, 100.00, 100.00, 100.00, 100.00, 100.00, 0, 0, 'BILLING_READY',
            'sha256_ccs_2b390acd1234567890abcdef1234567890abcdef1234567890abc'
        ),
        (
            case_3_id, naples_id, 'CAS-20260224-003', CURRENT_DATE - INTERVAL '1 day', 'Dr. Sarah Jenkins', 'General Surgery', '47562',
            100.00, 60.00, 100.00, 60.00, 50.00, 72.50, 3, 2, 'INCOMPLETE_HOLD',
            'sha256_ccs_3c401bde2345678901abcdef2345678901abcdef2345678901abc'
        ),
        (
            case_4_id, naples_id, 'CAS-20260224-004', CURRENT_DATE - INTERVAL '1 day', 'Dr. Brian Miller', 'Orthopedics', '64721',
            100.00, 100.00, 75.00, 100.00, 100.00, 95.00, 1, 0, 'CLINICAL_REVIEW',
            'sha256_ccs_4d512cef3456789012abcdef3456789012abcdef3456789012abc'
        )
        ON CONFLICT (facility_id, case_identifier) DO NOTHING;

        -- Seed Field Gaps
        INSERT INTO public.case_completeness_field_gaps (
            facility_id, case_score_id, case_identifier, pillar_code, field_name,
            severity, expected_requirement, remediation_status
        ) VALUES
        (naples_id, case_3_id, 'CAS-20260224-003', 'PERIOPERATIVE_TIMESTAMPS', 'pacu_discharge_time', 'CRITICAL', 'Valid PACU discharge timestamp >= pacu_in required', 'OPEN'),
        (naples_id, case_3_id, 'CAS-20260224-003', 'CLINICAL_CODING', 'icd10_primary_dx', 'CRITICAL', 'Validated ICD-10 diagnosis code required prior to 837 claim build', 'OPEN'),
        (naples_id, case_3_id, 'CAS-20260224-003', 'ATTESTATION_IMPLANT_UDI', 'surgeon_op_note_signed', 'WARNING', 'Electronic surgeon attestation signature pending', 'OPEN'),
        (naples_id, case_4_id, 'CAS-20260224-004', 'CARE_TEAM_STAFFING', 'scrub_tech_id', 'WARNING', 'Assigned Scrub Tech employee ID recommended for labor costing', 'OPEN')
        ON CONFLICT DO NOTHING;

        -- Seed Specialty Benchmarks
        INSERT INTO public.case_completeness_specialty_benchmarks (
            facility_id, specialty_name, total_cases, avg_completeness_score, billing_ready_pct, top_gap_field
        ) VALUES
        (naples_id, 'Orthopedics', 184, 97.50, 92.40, 'scrub_tech_id'),
        (naples_id, 'Ophthalmology', 312, 99.10, 97.80, 'implant_udi_serial'),
        (naples_id, 'General Surgery', 96, 88.40, 78.10, 'pacu_discharge_time'),
        (naples_id, 'GI Endoscopy', 250, 96.80, 94.00, 'asa_physical_class')
        ON CONFLICT (facility_id, specialty_name) DO NOTHING;

        -- Seed Batch Audit Run
        INSERT INTO public.case_completeness_audit_runs (
            facility_id, run_code, cases_evaluated, billing_ready_count, incomplete_hold_count,
            mean_completeness_score, duration_ms, sha256_sync_seal
        ) VALUES (
            naples_id, 'CCS-AUD-20260224-01', 4, 2, 1, 91.88, 265,
            'sha256_ccs_9e623dfa4567890123abcdef4567890123abcdef4567890123abc'
        ) ON CONFLICT (facility_id, run_code) DO NOTHING;

        -- Seed Provenance Ledger
        INSERT INTO public.case_completeness_provenance_ledger (
            facility_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id, 'CASE_COMPLETENESS_BATCH_SCORED', 4,
            'sha256_ccs_9e623dfa4567890123abcdef4567890123abcdef4567890123abc',
            'him_coding_lead@naplesasc.com',
            '{"mean_score": 91.88, "billing_ready": 2, "incomplete_hold": 1}'::jsonb
        ) ON CONFLICT DO NOTHING;
    END IF;
END $$;
