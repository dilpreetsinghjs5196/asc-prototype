-- ==============================================================================
-- Migration: 134_financial_completeness.sql
-- Module 16: Enterprise Data Quality Governance (Phase G2)
-- Description: Five-Pillar Financial Completeness Rules, Case Margin Integrity,
--              Cash-to-Bank Variance Thresholds, Executive Trust Gates, and
--              SHA-256 Financial Provenance.
-- ==============================================================================

-- 1. Financial Completeness Configuration Table
CREATE TABLE IF NOT EXISTS public.fin_completeness_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    trusted_min_score NUMERIC(5,2) NOT NULL DEFAULT 96.00,
    provisional_min_score NUMERIC(5,2) NOT NULL DEFAULT 88.00,
    max_cash_variance_usd NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    block_board_export_on_hold BOOLEAN NOT NULL DEFAULT TRUE,
    block_ai_recommendations_on_hold BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'AUDITING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_fcs_config UNIQUE (facility_id)
);

-- 2. Five-Pillar Financial Completeness Rubrics Table
CREATE TABLE IF NOT EXISTS public.fin_completeness_pillars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    pillar_code VARCHAR(36) NOT NULL CHECK (
        pillar_code IN (
            'REVENUE_CHARGE_COMPLETENESS',
            'DIRECT_COST_COMPLETENESS',
            'LABOR_OVERHEAD_ALLOCATION',
            'CASH_REMITTANCE_RECONCILIATION',
            'GL_CLOSING_PERIOD_INTEGRITY'
        )
    ),
    pillar_label VARCHAR(64) NOT NULL,
    weight_pct NUMERIC(5,2) NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
    sla_target_score NUMERIC(5,2) NOT NULL DEFAULT 96.00,
    description TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_fcs_pillar UNIQUE (facility_id, pillar_code)
);

-- 3. Accounting Period Trust Assessments Table
CREATE TABLE IF NOT EXISTS public.fin_period_trust_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    revenue_score NUMERIC(5,2) NOT NULL,
    direct_cost_score NUMERIC(5,2) NOT NULL,
    labor_score NUMERIC(5,2) NOT NULL,
    cash_recon_score NUMERIC(5,2) NOT NULL,
    gl_integrity_score NUMERIC(5,2) NOT NULL,
    financial_trust_score NUMERIC(5,2) NOT NULL,
    unbilled_revenue_exposure NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    missing_cost_cases_count INT NOT NULL DEFAULT 0,
    cash_variance_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    critical_imbalances_count INT NOT NULL DEFAULT 0,
    trust_tier VARCHAR(24) NOT NULL CHECK (
        trust_tier IN ('BOARD_TRUSTED', 'PROVISIONAL_ESTIMATE', 'UNRELIABLE_HOLD')
    ),
    sha256_sync_seal VARCHAR(128) NOT NULL,
    assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_fcs_period UNIQUE (facility_id, period_code)
);

-- 4. Per-Case Margin Completeness Readiness Table
CREATE TABLE IF NOT EXISTS public.fin_case_margin_readiness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    service_date DATE NOT NULL,
    primary_cpt VARCHAR(16) NOT NULL,
    billed_revenue NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    direct_supply_implant_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    direct_labor_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    has_revenue_charge BOOLEAN NOT NULL DEFAULT TRUE,
    has_supply_implant_cost BOOLEAN NOT NULL DEFAULT TRUE,
    has_labor_allocation BOOLEAN NOT NULL DEFAULT TRUE,
    margin_readiness_status VARCHAR(32) NOT NULL CHECK (
        margin_readiness_status IN ('MARGIN_VERIFIED', 'MISSING_IMPLANT_COST', 'MISSING_LABOR_COST', 'UNBILLED_REVENUE')
    ),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_fcs_case_margin UNIQUE (facility_id, case_identifier)
);

-- 5. Financial Blind-Spot Exceptions Table
CREATE TABLE IF NOT EXISTS public.fin_completeness_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL,
    exception_code VARCHAR(48) NOT NULL,
    pillar_code VARCHAR(36) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_identifier VARCHAR(64) NOT NULL,
    financial_exposure_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    description TEXT NOT NULL,
    remediation_status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        remediation_status IN ('OPEN', 'REMEDIATED', 'ACCRUED_ESTIMATE')
    ),
    resolved_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 6. Financial Trust Gate Audit Runs Table
CREATE TABLE IF NOT EXISTS public.fin_trust_gate_audit_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_code VARCHAR(64) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    financial_trust_score NUMERIC(5,2) NOT NULL,
    trust_tier VARCHAR(24) NOT NULL,
    cases_margin_verified INT NOT NULL DEFAULT 0,
    total_cases_audited INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_fcs_run UNIQUE (facility_id, run_code)
);

-- 7. Financial Completeness Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.fin_completeness_provenance_ledger (
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
CREATE INDEX IF NOT EXISTS idx_fcs_configs_fac ON public.fin_completeness_configs (facility_id);
CREATE INDEX IF NOT EXISTS idx_fcs_pillars_fac ON public.fin_completeness_pillars (facility_id);
CREATE INDEX IF NOT EXISTS idx_fcs_periods_fac ON public.fin_period_trust_assessments (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_fcs_margins_fac_status ON public.fin_case_margin_readiness (facility_id, margin_readiness_status);
CREATE INDEX IF NOT EXISTS idx_fcs_exceptions_fac_status ON public.fin_completeness_exceptions (facility_id, remediation_status);
CREATE INDEX IF NOT EXISTS idx_fcs_runs_fac ON public.fin_trust_gate_audit_runs (facility_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fcs_provenance_fac ON public.fin_completeness_provenance_ledger (facility_id, created_at DESC);

-- Row Level Security (RLS) Tenancy Policies
ALTER TABLE public.fin_completeness_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_completeness_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_period_trust_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_case_margin_readiness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_completeness_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_trust_gate_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_completeness_provenance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_fcs_config_tenant ON public.fin_completeness_configs;
CREATE POLICY p_fcs_config_tenant ON public.fin_completeness_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_fcs_pillars_tenant ON public.fin_completeness_pillars;
CREATE POLICY p_fcs_pillars_tenant ON public.fin_completeness_pillars
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_fcs_periods_tenant ON public.fin_period_trust_assessments;
CREATE POLICY p_fcs_periods_tenant ON public.fin_period_trust_assessments
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_fcs_margins_tenant ON public.fin_case_margin_readiness;
CREATE POLICY p_fcs_margins_tenant ON public.fin_case_margin_readiness
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_fcs_exceptions_tenant ON public.fin_completeness_exceptions;
CREATE POLICY p_fcs_exceptions_tenant ON public.fin_completeness_exceptions
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_fcs_runs_tenant ON public.fin_trust_gate_audit_runs;
CREATE POLICY p_fcs_runs_tenant ON public.fin_trust_gate_audit_runs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_fcs_provenance_tenant ON public.fin_completeness_provenance_ledger;
CREATE POLICY p_fcs_provenance_tenant ON public.fin_completeness_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_financial_completeness_telemetry AS
SELECT
    c.facility_id,
    c.trusted_min_score,
    c.provisional_min_score,
    c.max_cash_variance_usd,
    c.sync_status,
    c.health_status,
    COALESCE((SELECT financial_trust_score FROM public.fin_period_trust_assessments WHERE facility_id = c.facility_id ORDER BY period_code DESC LIMIT 1), 93.45)::NUMERIC(5,2) AS latest_trust_score,
    COALESCE((SELECT trust_tier FROM public.fin_period_trust_assessments WHERE facility_id = c.facility_id ORDER BY period_code DESC LIMIT 1), 'UNRELIABLE_HOLD') AS latest_trust_tier,
    ROUND(
        COALESCE(
            COUNT(m.id) FILTER (WHERE m.margin_readiness_status = 'MARGIN_VERIFIED')::NUMERIC /
            NULLIF(COUNT(m.id), 0) * 100,
            75.0
        ),
        1
    )::NUMERIC(5,1) AS margin_verified_pct,
    COALESCE((SELECT cash_variance_usd FROM public.fin_period_trust_assessments WHERE facility_id = c.facility_id ORDER BY period_code DESC LIMIT 1), 0.00)::NUMERIC(10,2) AS latest_cash_variance_usd,
    COALESCE(SUM(e.financial_exposure_usd) FILTER (WHERE e.remediation_status = 'OPEN'), 0.00)::NUMERIC(12,2) AS total_exposure_on_hold_usd,
    (SELECT sha256_sync_seal FROM public.fin_trust_gate_audit_runs WHERE facility_id = c.facility_id ORDER BY executed_at DESC LIMIT 1) AS latest_sync_seal
FROM public.fin_completeness_configs c
LEFT JOIN public.fin_case_margin_readiness m ON c.facility_id = m.facility_id
LEFT JOIN public.fin_completeness_exceptions e ON c.facility_id = e.facility_id
GROUP BY c.facility_id, c.trusted_min_score, c.provisional_min_score, c.max_cash_variance_usd, c.sync_status, c.health_status;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.fin_completeness_configs (
            facility_id, trusted_min_score, provisional_min_score, max_cash_variance_usd,
            block_board_export_on_hold, block_ai_recommendations_on_hold,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id,
            96.00,
            88.00,
            1.00,
            TRUE,
            TRUE,
            'enc_v2_44e40f35ab069713240596130459613045961304596130459613045961305521',
            'ACTIVE',
            'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET
            sync_status = EXCLUDED.sync_status;

        -- Seed 5-Pillar Financial Completeness Matrix (Strictly sums to 100.00%)
        INSERT INTO public.fin_completeness_pillars (
            facility_id, pillar_code, pillar_label, weight_pct, sla_target_score, description
        ) VALUES
        (naples_id, 'REVENUE_CHARGE_COMPLETENESS', 'Revenue & Charge Completeness', 25.00, 98.00, 'Completed clinical encounters matched to billed 837 claims and contracted fee schedules.'),
        (naples_id, 'DIRECT_COST_COMPLETENESS', 'Direct Supply & Implant COGS', 25.00, 96.00, 'Implant constructs and surgical supplies matched to contracted GPO or vendor invoice costs.'),
        (naples_id, 'LABOR_OVERHEAD_ALLOCATION', 'Labor & Overhead Allocation', 20.00, 95.00, 'Perioperative RN, Scrub Tech, and CRNA payroll costs allocated per surgical OR minute.'),
        (naples_id, 'CASH_REMITTANCE_RECONCILIATION', 'Cash & 835 ERA Reconciliation', 15.00, 99.00, '4-way balancing across 837 claims, 835 remittances, and EFT operating bank deposits.'),
        (naples_id, 'GL_CLOSING_PERIOD_INTEGRITY', 'GL Closing Period Integrity', 15.00, 100.00, 'Double-entry journal debit-to-credit zero variance and cutoff integrity.')
        ON CONFLICT (facility_id, pillar_code) DO NOTHING;

        -- Seed Period Trust Assessments (2026-02 Provisional/Hold with open exception, 2026-01 Board Trusted)
        INSERT INTO public.fin_period_trust_assessments (
            facility_id, period_code, revenue_score, direct_cost_score, labor_score,
            cash_recon_score, gl_integrity_score, financial_trust_score,
            unbilled_revenue_exposure, missing_cost_cases_count, cash_variance_usd,
            critical_imbalances_count, trust_tier, sha256_sync_seal
        ) VALUES
        (
            naples_id, '2026-02', 94.00, 86.00, 92.00, 100.00, 100.00, 93.40,
            4250.00, 1, 0.00, 1, 'UNRELIABLE_HOLD',
            'sha256_fcs_1b389fbc0123456789abcdef0123456789abcdef0123456789abc'
        ),
        (
            naples_id, '2026-01', 99.20, 98.40, 97.50, 100.00, 100.00, 98.90,
            0.00, 0, 0.00, 0, 'BOARD_TRUSTED',
            'sha256_fcs_2c490acd1234567890abcdef1234567890abcdef1234567890abc'
        )
        ON CONFLICT (facility_id, period_code) DO NOTHING;

        -- Seed Case Margin Readiness Rows
        INSERT INTO public.fin_case_margin_readiness (
            facility_id, case_identifier, service_date, primary_cpt,
            billed_revenue, direct_supply_implant_cost, direct_labor_cost,
            has_revenue_charge, has_supply_implant_cost, has_labor_allocation,
            margin_readiness_status
        ) VALUES
        (naples_id, 'CAS-20260224-001', CURRENT_DATE - INTERVAL '2 days', '29881', 6450.00, 2470.00, 259.49, TRUE, TRUE, TRUE, 'MARGIN_VERIFIED'),
        (naples_id, 'CAS-20260224-002', CURRENT_DATE - INTERVAL '2 days', '66984', 2890.00, 215.00, 59.13, TRUE, TRUE, TRUE, 'MARGIN_VERIFIED'),
        (naples_id, 'CAS-20260224-003', CURRENT_DATE - INTERVAL '1 day', '47562', 4250.00, 0.00, 472.15, TRUE, FALSE, TRUE, 'MISSING_IMPLANT_COST'),
        (naples_id, 'CAS-20260224-004', CURRENT_DATE - INTERVAL '1 day', '64721', 3120.00, 145.00, 0.00, TRUE, TRUE, FALSE, 'MISSING_LABOR_COST')
        ON CONFLICT (facility_id, case_identifier) DO NOTHING;

        -- Seed Open Financial Completeness Exceptions
        INSERT INTO public.fin_completeness_exceptions (
            facility_id, period_code, exception_code, pillar_code, severity,
            offending_identifier, financial_exposure_usd, description, remediation_status
        ) VALUES
        (
            naples_id, '2026-02', 'ERR_MISSING_IMPLANT_COGS', 'DIRECT_COST_COMPLETENESS', 'CRITICAL',
            'CAS-20260224-003', 1850.00,
            'Completed case CAS-20260224-003 has billed revenue ($4,250) but $0 implant/supply COGS attached; creates overstated margin.',
            'OPEN'
        ),
        (
            naples_id, '2026-02', 'WARN_MISSING_CRNA_LABOR', 'LABOR_OVERHEAD_ALLOCATION', 'WARNING',
            'CAS-20260224-004', 210.00,
            'Direct OR nursing & anesthesia labor cost pending timesheet sync for CAS-20260224-004.',
            'OPEN'
        )
        ON CONFLICT DO NOTHING;

        -- Seed Audit Run
        INSERT INTO public.fin_trust_gate_audit_runs (
            facility_id, run_code, period_code, financial_trust_score, trust_tier,
            cases_margin_verified, total_cases_audited, duration_ms, sha256_sync_seal
        ) VALUES (
            naples_id, 'FCS-AUD-20260224-01', '2026-02', 93.40, 'UNRELIABLE_HOLD',
            2, 4, 310, 'sha256_fcs_3d501bde2345678901abcdef2345678901abcdef2345678901abc'
        ) ON CONFLICT (facility_id, run_code) DO NOTHING;

        -- Seed Provenance Ledger
        INSERT INTO public.fin_completeness_provenance_ledger (
            facility_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id, 'FINANCIAL_TRUST_GATE_EVALUATED', 4,
            'sha256_fcs_3d501bde2345678901abcdef2345678901abcdef2345678901abc',
            'cfo_controller@naplesasc.com',
            '{"period": "2026-02", "trust_score": 93.40, "trust_tier": "UNRELIABLE_HOLD"}'::jsonb
        ) ON CONFLICT DO NOTHING;
    END IF;
END $$;
