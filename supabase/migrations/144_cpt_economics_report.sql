-- ==============================================================================
-- Migration: 144_cpt_economics_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H6)
-- Description: CPT Economics Report Editions, Specialty Benchmarks,
--              Unit Cost Decomposition & Quadrant Classification,
--              CPT Payer Rate Matrix, Cost Optimization Log, and H0 Dispatches.
-- ==============================================================================

-- 1. CPT Economics Costing & Overhead Config Table
CREATE TABLE IF NOT EXISTS public.cer_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    facility_overhead_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 450.00,
    target_margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
    min_contribution_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 45.00,
    min_cases_for_statistical_validity INT NOT NULL DEFAULT 5 CHECK (min_cases_for_statistical_validity >= 1),
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_cer_config UNIQUE (facility_id),
    CONSTRAINT chk_cer_overhead_nonneg CHECK (facility_overhead_per_or_hour_usd >= 0)
);

-- 2. Specialty CPT Economics Benchmark Table
CREATE TABLE IF NOT EXISTS public.cer_specialty_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty VARCHAR(64) NOT NULL,
    target_margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 2000.00,
    target_duration_minutes INT NOT NULL DEFAULT 55,
    max_implant_cost_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    target_contribution_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 50.00,
    CONSTRAINT unq_facility_cer_spec_bench UNIQUE (facility_id, specialty)
);

-- 3. CPT Economics Report Editions Table
CREATE TABLE IF NOT EXISTS public.cer_report_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_code VARCHAR(48) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    edition_status VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED' CHECK (
        edition_status IN ('DRAFT', 'PUBLISHED', 'SIGNED_OFF')
    ),
    cpts_evaluated INT NOT NULL DEFAULT 0,
    total_case_volume INT NOT NULL DEFAULT 0,
    total_net_reimbursement_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_direct_cost_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_allocated_overhead_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_net_operating_income_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    weighted_margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_cer_edition UNIQUE (facility_id, period_code)
);

-- 4. Ranked CPT Unit Economics Scorecards Table
CREATE TABLE IF NOT EXISTS public.cer_cpt_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.cer_report_editions(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_label VARCHAR(128) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    case_count INT NOT NULL DEFAULT 0,
    avg_or_duration_minutes INT NOT NULL DEFAULT 45,
    total_or_hours NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    avg_net_reimbursement_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    avg_implant_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    avg_supply_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    avg_labor_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    avg_direct_cost_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    contribution_margin_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    contribution_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    allocated_overhead_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_operating_income_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    economic_quadrant VARCHAR(32) NOT NULL CHECK (
        economic_quadrant IN ('PRIME_YIELD_ANCHOR', 'VOLUME_PROFIT_BUILDER', 'MARGIN_SQUEEZE_AT_RISK', 'ECONOMIC_DEFICIT')
    ),
    rank_in_facility INT NOT NULL DEFAULT 1,
    sha256_card_seal VARCHAR(128) NOT NULL,
    CONSTRAINT unq_cer_card_edition_cpt UNIQUE (edition_id, cpt_code)
);

-- 5. CPT Payer Rate Spread Matrix Table
CREATE TABLE IF NOT EXISTS public.cer_payer_rate_matrix (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.cer_cpt_scorecards(id) ON DELETE CASCADE,
    payer_code VARCHAR(32) NOT NULL,
    payer_name VARCHAR(128) NOT NULL,
    case_count INT NOT NULL DEFAULT 0,
    net_reimbursement_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    net_margin_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    medicare_parity_pct NUMERIC(6,2) NOT NULL DEFAULT 100.00
);

-- 6. Cost Optimization & Preference Card Action Log Table
CREATE TABLE IF NOT EXISTS public.cer_cost_optimization_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.cer_cpt_scorecards(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('IMPLANT_NEGOTIATION', 'PREF_CARD_STANDARDIZE', 'SCHEDULING_OPTIMIZE', 'PAYER_CARVEOUT_ESCALATE')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    target_savings_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. CPT Economics H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.cer_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.cer_report_editions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_cer_editions_facility_period ON public.cer_report_editions (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_cer_cards_edition_rank ON public.cer_cpt_scorecards (edition_id, rank_in_facility ASC);
CREATE INDEX IF NOT EXISTS idx_cer_reviews_card ON public.cer_cost_optimization_reviews (facility_id, scorecard_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_cer_telemetry AS
SELECT
    c.facility_id,
    c.facility_overhead_per_or_hour_usd,
    c.target_margin_per_or_hour_usd,
    c.min_contribution_margin_pct,
    c.sync_status,
    c.health_status,
    (SELECT e.edition_code FROM public.cer_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_edition_code,
    (SELECT e.cpts_evaluated FROM public.cer_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS cpts_evaluated,
    (SELECT e.total_case_volume FROM public.cer_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_case_volume,
    (SELECT e.weighted_margin_per_or_hour_usd FROM public.cer_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS weighted_margin_per_or_hour_usd,
    (SELECT e.total_net_operating_income_usd FROM public.cer_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_net_operating_income_usd,
    (SELECT e.sha256_report_seal FROM public.cer_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_sync_seal
FROM public.cer_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.cer_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cer_specialty_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cer_report_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cer_cpt_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cer_payer_rate_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cer_cost_optimization_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cer_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS cer_configs_tenant_iso ON public.cer_configs;
CREATE POLICY cer_configs_tenant_iso ON public.cer_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS cer_bench_tenant_iso ON public.cer_specialty_benchmarks;
CREATE POLICY cer_bench_tenant_iso ON public.cer_specialty_benchmarks USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS cer_editions_tenant_iso ON public.cer_report_editions;
CREATE POLICY cer_editions_tenant_iso ON public.cer_report_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS cer_cards_tenant_iso ON public.cer_cpt_scorecards;
CREATE POLICY cer_cards_tenant_iso ON public.cer_cpt_scorecards USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS cer_rates_tenant_iso ON public.cer_payer_rate_matrix;
CREATE POLICY cer_rates_tenant_iso ON public.cer_payer_rate_matrix USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS cer_reviews_tenant_iso ON public.cer_cost_optimization_reviews;
CREATE POLICY cer_reviews_tenant_iso ON public.cer_cost_optimization_reviews USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS cer_dispatch_tenant_iso ON public.cer_dispatch_logs;
CREATE POLICY cer_dispatch_tenant_iso ON public.cer_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_q4_id UUID;
    card_29827_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.cer_configs (
            facility_id, facility_overhead_per_or_hour_usd, target_margin_per_or_hour_usd,
            min_contribution_margin_pct, min_cases_for_statistical_validity,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 450.00, 2000.00, 45.00, 5,
            'cer_sec_****_naples_6214', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.cer_specialty_benchmarks (
            facility_id, specialty, target_margin_per_or_hour_usd, target_duration_minutes,
            max_implant_cost_pct, target_contribution_margin_pct
        ) VALUES
        (naples_id, 'Orthopedic Surgery', 3200.00, 68, 28.00, 52.00),
        (naples_id, 'Sports Medicine', 2800.00, 58, 24.00, 55.00),
        (naples_id, 'Pain / Spine', 2400.00, 28, 12.00, 62.00),
        (naples_id, 'Ophthalmology', 2100.00, 24, 18.00, 58.00)
        ON CONFLICT (facility_id, specialty) DO NOTHING;

        INSERT INTO public.cer_report_editions (
            facility_id, edition_code, period_code, edition_status,
            cpts_evaluated, total_case_volume, total_net_reimbursement_usd,
            total_direct_cost_usd, total_allocated_overhead_usd, total_net_operating_income_usd,
            weighted_margin_per_or_hour_usd, compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'CER-2026-Q4-NAP', '2026-Q4', 'PUBLISHED',
            6, 152, 875940.00, 355050.00, 63637.50, 457252.50, 3682.10,
            'cfo@naplessurgery.com',
            'sha256_cer_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, period_code) DO NOTHING;

        SELECT id INTO ed_q4_id FROM public.cer_report_editions
        WHERE facility_id = naples_id AND period_code = '2026-Q4' LIMIT 1;

        IF ed_q4_id IS NOT NULL THEN
            INSERT INTO public.cer_cpt_scorecards (
                facility_id, edition_id, cpt_code, procedure_label, specialty, case_count,
                avg_or_duration_minutes, total_or_hours, avg_net_reimbursement_usd,
                avg_implant_cost_usd, avg_supply_cost_usd, avg_labor_cost_usd, avg_direct_cost_usd,
                contribution_margin_per_case_usd, contribution_margin_pct, allocated_overhead_per_case_usd,
                net_operating_income_per_case_usd, margin_per_or_hour_usd, economic_quadrant,
                rank_in_facility, sha256_card_seal
            ) VALUES
            (naples_id, ed_q4_id, '29888', 'Arthroscopic ACL Reconstruction', 'Sports Medicine', 19, 62, 19.63, 8950.00, 1750.00, 420.00, 370.00, 2540.00, 6410.00, 71.62, 465.00, 5945.00, 6203.23, 'PRIME_YIELD_ANCHOR', 1, 'sha256_cer_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'),
            (naples_id, ed_q4_id, '29881', 'Knee Arthroscopy w/ Meniscectomy', 'Orthopedic Surgery', 28, 42, 19.60, 6240.00, 580.00, 490.00, 350.00, 1420.00, 4820.00, 77.24, 315.00, 4505.00, 6885.71, 'PRIME_YIELD_ANCHOR', 2, 'sha256_cer_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'),
            (naples_id, ed_q4_id, '64483', 'Lumbar Transforaminal Epidural', 'Pain / Spine', 36, 26, 15.60, 3890.00, 180.00, 310.00, 280.00, 770.00, 3120.00, 80.21, 195.00, 2925.00, 7200.00, 'PRIME_YIELD_ANCHOR', 3, 'sha256_cer_44d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d'),
            (naples_id, ed_q4_id, '66984', 'Cataract Extraction w/ IOL', 'Ophthalmology', 38, 24, 15.20, 3680.00, 590.00, 360.00, 255.00, 1205.00, 2475.00, 67.26, 180.00, 2295.00, 6187.50, 'PRIME_YIELD_ANCHOR', 4, 'sha256_cer_55e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e'),
            (naples_id, ed_q4_id, '29827', 'Arthroscopic Rotator Cuff Repair', 'Orthopedic Surgery', 18, 78, 23.40, 8120.00, 2950.00, 640.00, 480.00, 4070.00, 4050.00, 49.88, 585.00, 3465.00, 3115.38, 'VOLUME_PROFIT_BUILDER', 5, 'sha256_cer_66f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f'),
            (naples_id, ed_q4_id, '27447', 'Outpatient Total Knee Arthroplasty', 'Orthopedic Surgery', 13, 120, 26.00, 11420.00, 6850.00, 1120.00, 910.00, 8880.00, 2540.00, 22.24, 900.00, 1640.00, 1270.00, 'MARGIN_SQUEEZE_AT_RISK', 6, 'sha256_cer_77a8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80')
            ON CONFLICT (edition_id, cpt_code) DO NOTHING;

            SELECT id INTO card_29827_id FROM public.cer_cpt_scorecards
            WHERE edition_id = ed_q4_id AND cpt_code = '29827' LIMIT 1;

            IF card_29827_id IS NOT NULL THEN
                INSERT INTO public.cer_payer_rate_matrix (
                    facility_id, scorecard_id, payer_code, payer_name,
                    case_count, net_reimbursement_per_case_usd, net_margin_per_case_usd, medicare_parity_pct
                )
                SELECT naples_id, card_29827_id, v.pcode, v.pname, v.cnt, v.reimb, v.margin, v.parity
                FROM (
                    VALUES
                    ('PYR-BCBS', 'Florida Blue (BCBS PPO)', 8, 8850.00, 4780.00, 214.00),
                    ('PYR-MED', 'Medicare Part B (FCSO MAC)', 6, 7140.00, 3070.00, 100.00),
                    ('PYR-UHC', 'UnitedHealthcare Commercial', 4, 6520.00, 2450.00, 158.00)
                ) AS v(pcode, pname, cnt, reimb, margin, parity)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.cer_payer_rate_matrix m
                    WHERE m.scorecard_id = card_29827_id AND m.payer_code = v.pcode
                );

                INSERT INTO public.cer_cost_optimization_reviews (
                    facility_id, scorecard_id, action_type, actor_email, actor_role,
                    target_savings_per_case_usd, notes, sha256_seal
                )
                SELECT naples_id, card_29827_id, 'IMPLANT_NEGOTIATION', 'materials_mgr@naplessurgery.com', 'Materials Director',
                       420.00, 'Negotiate capitated shoulder anchor bundle ($420/case reduction target).',
                       'sha256_cer_88b92a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.cer_cost_optimization_reviews r
                    WHERE r.scorecard_id = card_29827_id AND r.action_type = 'IMPLANT_NEGOTIATION'
                );
            END IF;

            INSERT INTO public.cer_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_q4_id, 'RPT-H6-RUN-Q4-01', 'PORTAL_INBOX', 'XLSX', 4, 'DELIVERED',
                   'cfo@naplessurgery.com',
                   'sha256_cer_99c03b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.cer_dispatch_logs l WHERE l.edition_id = ed_q4_id AND l.rpt_execution_code = 'RPT-H6-RUN-Q4-01'
            );
        END IF;
    END IF;
END $$;
