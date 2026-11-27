-- ==============================================================================
-- Migration: 143_payer_scorecard_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H5)
-- Description: Payer Scorecard Editions, Category Benchmarks,
--              Conserved 4-Pillar Composite Grading, CPT Contract Shortfalls,
--              Negotiation & Demand Action Log, and H0 Dispatches.
-- ==============================================================================

-- 1. Payer Scorecard Rubric & Governance Config Table
CREATE TABLE IF NOT EXISTS public.psr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    weight_contract_yield_pct NUMERIC(5,2) NOT NULL DEFAULT 35.00,
    weight_payment_velocity_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    weight_clean_claim_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    weight_carveout_recovery_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    target_yield_floor_pct NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    target_days_to_pay INT NOT NULL DEFAULT 30 CHECK (target_days_to_pay >= 5),
    critical_renewal_window_days INT NOT NULL DEFAULT 90 CHECK (critical_renewal_window_days >= 15),
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_psr_config UNIQUE (facility_id),
    CONSTRAINT chk_psr_weights_100 CHECK (
        ROUND(weight_contract_yield_pct + weight_payment_velocity_pct + weight_clean_claim_rate_pct + weight_carveout_recovery_pct, 2) = 100.00
    )
);

-- 2. Payer Category Peer Benchmark Table
CREATE TABLE IF NOT EXISTS public.psr_category_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_category VARCHAR(48) NOT NULL,
    target_yield_pct NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    target_days_to_pay INT NOT NULL DEFAULT 28,
    max_denial_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 6.00,
    target_carveout_recovery_pct NUMERIC(5,2) NOT NULL DEFAULT 90.00,
    CONSTRAINT unq_facility_psr_cat_bench UNIQUE (facility_id, payer_category)
);

-- 3. Payer Scorecard Compiled Editions Table
CREATE TABLE IF NOT EXISTS public.psr_report_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_code VARCHAR(48) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    edition_status VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED' CHECK (
        edition_status IN ('DRAFT', 'PUBLISHED', 'SIGNED_OFF')
    ),
    payers_evaluated INT NOT NULL DEFAULT 0,
    avg_composite_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    total_net_collections_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_underpayment_leakage_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_psr_edition UNIQUE (facility_id, period_code)
);

-- 4. Individual Payer Scorecards Table
CREATE TABLE IF NOT EXISTS public.psr_payer_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.psr_report_editions(id) ON DELETE CASCADE,
    payer_code VARCHAR(32) NOT NULL,
    payer_name VARCHAR(128) NOT NULL,
    payer_category VARCHAR(48) NOT NULL,
    methodology VARCHAR(48) NOT NULL,
    claim_count INT NOT NULL DEFAULT 0,
    billed_charges_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    expected_allowed_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    actual_collected_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    underpayment_leakage_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    contract_yield_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    avg_days_to_pay INT NOT NULL DEFAULT 30,
    first_pass_denial_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    carveout_recovery_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    ar_over_90_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    days_to_renewal INT NOT NULL DEFAULT 180,
    renewal_alert_status VARCHAR(32) NOT NULL DEFAULT 'MONITORING',
    composite_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    performance_grade VARCHAR(24) NOT NULL CHECK (
        performance_grade IN ('A_PREFERRED', 'B_STANDARD', 'C_FRICTIONAL', 'D_HIGH_RISK', 'F_CRITICAL')
    ),
    rank_in_facility INT NOT NULL DEFAULT 1,
    sha256_card_seal VARCHAR(128) NOT NULL,
    CONSTRAINT unq_psr_card_edition_payer UNIQUE (edition_id, payer_code)
);

-- 5. CPT Contract Shortfalls & Carve-Out Variance Table
CREATE TABLE IF NOT EXISTS public.psr_contract_variance_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.psr_payer_scorecards(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_label VARCHAR(128) NOT NULL,
    claim_count INT NOT NULL DEFAULT 0,
    contract_allowed_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    actual_paid_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    shortfall_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    variance_reason VARCHAR(64) NOT NULL
);

-- 6. Payer Negotiation & Demand Action Log Table
CREATE TABLE IF NOT EXISTS public.psr_negotiation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.psr_payer_scorecards(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('RENEGOTIATION_NOTICE', 'UNDERPAYMENT_DEMAND', 'CARVEOUT_AUDIT', 'CONTRACT_SIGN_OFF')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    target_recovery_usd NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Payer Scorecard H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.psr_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.psr_report_editions(id) ON DELETE CASCADE,
    rpt_execution_code VARCHAR(64) NOT NULL,
    delivery_channel VARCHAR(32) NOT NULL,
    export_format VARCHAR(16) NOT NULL,
    recipient_count INT NOT NULL DEFAULT 0,
    dispatch_status VARCHAR(24) NOT NULL DEFAULT 'DELIVERED',
    dispatched_by VARCHAR(128) NOT NULL,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_psr_editions_facility_period ON public.psr_report_editions (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_psr_cards_edition_rank ON public.psr_payer_scorecards (edition_id, rank_in_facility ASC);
CREATE INDEX IF NOT EXISTS idx_psr_actions_card ON public.psr_negotiation_actions (facility_id, scorecard_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_psr_telemetry AS
SELECT
    c.facility_id,
    c.target_yield_floor_pct,
    c.target_days_to_pay,
    c.critical_renewal_window_days,
    c.sync_status,
    c.health_status,
    (SELECT e.edition_code FROM public.psr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_edition_code,
    (SELECT e.payers_evaluated FROM public.psr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS payers_evaluated,
    (SELECT e.avg_composite_score FROM public.psr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS avg_composite_score,
    (SELECT e.total_net_collections_usd FROM public.psr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_net_collections_usd,
    (SELECT e.total_underpayment_leakage_usd FROM public.psr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_underpayment_leakage_usd,
    (SELECT e.sha256_report_seal FROM public.psr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_sync_seal
FROM public.psr_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.psr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psr_category_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psr_report_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psr_payer_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psr_contract_variance_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psr_negotiation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psr_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS psr_configs_tenant_iso ON public.psr_configs;
CREATE POLICY psr_configs_tenant_iso ON public.psr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS psr_bench_tenant_iso ON public.psr_category_benchmarks;
CREATE POLICY psr_bench_tenant_iso ON public.psr_category_benchmarks USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS psr_editions_tenant_iso ON public.psr_report_editions;
CREATE POLICY psr_editions_tenant_iso ON public.psr_report_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS psr_cards_tenant_iso ON public.psr_payer_scorecards;
CREATE POLICY psr_cards_tenant_iso ON public.psr_payer_scorecards USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS psr_var_tenant_iso ON public.psr_contract_variance_details;
CREATE POLICY psr_var_tenant_iso ON public.psr_contract_variance_details USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS psr_actions_tenant_iso ON public.psr_negotiation_actions;
CREATE POLICY psr_actions_tenant_iso ON public.psr_negotiation_actions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS psr_dispatch_tenant_iso ON public.psr_dispatch_logs;
CREATE POLICY psr_dispatch_tenant_iso ON public.psr_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_q4_id UUID;
    card_uhc_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.psr_configs (
            facility_id, weight_contract_yield_pct, weight_payment_velocity_pct,
            weight_clean_claim_rate_pct, weight_carveout_recovery_pct,
            target_yield_floor_pct, target_days_to_pay, critical_renewal_window_days,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 35.00, 25.00, 25.00, 15.00, 95.00, 30, 90,
            'psr_sec_****_naples_5129', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.psr_category_benchmarks (
            facility_id, payer_category, target_yield_pct, target_days_to_pay,
            max_denial_rate_pct, target_carveout_recovery_pct
        ) VALUES
        (naples_id, 'Commercial', 95.50, 28, 6.00, 92.00),
        (naples_id, 'Medicare', 98.50, 18, 3.00, 95.00),
        (naples_id, 'Medicare_Advantage', 94.00, 26, 7.50, 88.00),
        (naples_id, 'Workers_Comp', 93.00, 38, 8.50, 86.00)
        ON CONFLICT (facility_id, payer_category) DO NOTHING;

        INSERT INTO public.psr_report_editions (
            facility_id, edition_code, period_code, edition_status,
            payers_evaluated, avg_composite_score, total_net_collections_usd,
            total_underpayment_leakage_usd, compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'PSR-2026-Q4-NAP', '2026-Q4', 'PUBLISHED',
            5, 79.40, 1796500.00, 83500.00, 'rcm_lead@naplessurgery.com',
            'sha256_psr_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, period_code) DO NOTHING;

        SELECT id INTO ed_q4_id FROM public.psr_report_editions
        WHERE facility_id = naples_id AND period_code = '2026-Q4' LIMIT 1;

        IF ed_q4_id IS NOT NULL THEN
            INSERT INTO public.psr_payer_scorecards (
                facility_id, edition_id, payer_code, payer_name, payer_category, methodology,
                claim_count, billed_charges_usd, expected_allowed_usd, actual_collected_usd,
                underpayment_leakage_usd, contract_yield_pct, avg_days_to_pay, first_pass_denial_pct,
                carveout_recovery_pct, ar_over_90_pct, days_to_renewal, renewal_alert_status,
                composite_score, performance_grade, rank_in_facility, sha256_card_seal
            ) VALUES
            (naples_id, ed_q4_id, 'PYR-MED', 'Medicare Part B (FCSO MAC)', 'Medicare', 'PERCENT_OF_MEDICARE', 214, 1420000.00, 492000.00, 487500.00, 4500.00, 99.09, 16, 2.40, 96.50, 3.10, 365, 'MONITORING', 94.80, 'A_PREFERRED', 1, 'sha256_psr_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'),
            (naples_id, ed_q4_id, 'PYR-BCBS', 'Florida Blue (BCBS PPO)', 'Commercial', 'FEE_SCHEDULE', 186, 1680000.00, 610000.00, 591700.00, 18300.00, 97.00, 23, 4.80, 91.20, 6.40, 142, 'MONITORING', 88.20, 'A_PREFERRED', 2, 'sha256_psr_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'),
            (naples_id, ed_q4_id, 'PYR-AET', 'Aetna Choice POS II', 'Commercial', 'CASE_RATE', 112, 920000.00, 340000.00, 323000.00, 17000.00, 95.00, 29, 7.20, 84.50, 9.80, 74, 'RENEWAL_NOTICE_URGENT', 78.60, 'B_STANDARD', 3, 'sha256_psr_44d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d'),
            (naples_id, ed_q4_id, 'PYR-CIG', 'Cigna Open Access Plus', 'Commercial', 'PERCENT_OF_MEDICARE', 88, 640000.00, 218000.00, 200500.00, 17500.00, 91.97, 36, 9.40, 78.00, 14.50, 195, 'MONITORING', 69.40, 'C_FRICTIONAL', 4, 'sha256_psr_55e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e'),
            (naples_id, ed_q4_id, 'PYR-UHC', 'UnitedHealthcare Commercial', 'Commercial', 'FEE_SCHEDULE', 129, 890000.00, 220000.00, 193800.00, 26200.00, 88.09, 44, 12.60, 68.40, 19.20, 48, 'RENEWAL_NOTICE_URGENT', 66.00, 'C_FRICTIONAL', 5, 'sha256_psr_66f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f')
            ON CONFLICT (edition_id, payer_code) DO NOTHING;

            SELECT id INTO card_uhc_id FROM public.psr_payer_scorecards
            WHERE edition_id = ed_q4_id AND payer_code = 'PYR-UHC' LIMIT 1;

            IF card_uhc_id IS NOT NULL THEN
                INSERT INTO public.psr_contract_variance_details (
                    facility_id, scorecard_id, cpt_code, procedure_label,
                    claim_count, contract_allowed_usd, actual_paid_usd, shortfall_usd, variance_reason
                )
                SELECT naples_id, card_uhc_id, v.code, v.lbl, v.cnt, v.allowed, v.paid, v.shortfall, v.reason
                FROM (
                    VALUES
                    ('29827', 'Arthroscopic Rotator Cuff Repair (Implant Carve-Out)', 18, 84600.00, 70200.00, 14400.00, 'IMPLANT_CARVEOUT_OMITTED'),
                    ('27447', 'Outpatient Total Knee Arthroplasty', 9, 76500.00, 68700.00, 7800.00, 'MULTIPLE_PROCEDURE_REDUCTION'),
                    ('64483', 'Lumbar Transforaminal Epidural', 24, 31200.00, 27200.00, 4000.00, 'LEGACY_FEE_SCHEDULE_MISMATCH')
                ) AS v(code, lbl, cnt, allowed, paid, shortfall, reason)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.psr_contract_variance_details d
                    WHERE d.scorecard_id = card_uhc_id AND d.cpt_code = v.code
                );

                INSERT INTO public.psr_negotiation_actions (
                    facility_id, scorecard_id, action_type, actor_email, actor_role,
                    target_recovery_usd, notes, sha256_seal
                )
                SELECT naples_id, card_uhc_id, 'UNDERPAYMENT_DEMAND', 'rcm_lead@naplessurgery.com', 'RCM Billing Lead',
                       26200.00, 'Issued bulk ERA 835 variance demand prior to 48-day UHC renewal notice window.',
                       'sha256_psr_77a8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.psr_negotiation_actions a
                    WHERE a.scorecard_id = card_uhc_id AND a.action_type = 'UNDERPAYMENT_DEMAND'
                );
            END IF;

            INSERT INTO public.psr_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_q4_id, 'RPT-H5-RUN-Q4-01', 'PORTAL_INBOX', 'XLSX', 5, 'DELIVERED',
                   'rcm_lead@naplessurgery.com',
                   'sha256_psr_88b92a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.psr_dispatch_logs l WHERE l.edition_id = ed_q4_id AND l.rpt_execution_code = 'RPT-H5-RUN-Q4-01'
            );
        END IF;
    END IF;
END $$;
