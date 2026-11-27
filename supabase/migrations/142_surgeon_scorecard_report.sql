-- ==============================================================================
-- Migration: 142_surgeon_scorecard_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H4)
-- Description: Surgeon Scorecard Editions, Specialty Peer Benchmarks,
--              Conserved 4-Pillar Composite Scoring, CPT Mix Drill-Downs,
--              Confidential Peer Review Coaching Log, and H0 Dispatches.
-- ==============================================================================

-- 1. Surgeon Scorecard Rubric & Benchmark Config Table
CREATE TABLE IF NOT EXISTS public.ssr_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    weight_contribution_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 35.00,
    weight_or_efficiency_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    weight_supply_discipline_pct NUMERIC(5,2) NOT NULL DEFAULT 25.00,
    weight_documentation_quality_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    anonymize_peer_names_for_surgeon_view BOOLEAN NOT NULL DEFAULT TRUE,
    min_cases_for_benchmark INT NOT NULL DEFAULT 10 CHECK (min_cases_for_benchmark >= 1),
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ssr_config UNIQUE (facility_id),
    CONSTRAINT chk_ssr_weights_100 CHECK (
        ROUND(weight_contribution_margin_pct + weight_or_efficiency_pct + weight_supply_discipline_pct + weight_documentation_quality_pct, 2) = 100.00
    )
);

-- 2. Specialty Peer Benchmark Matrix Table
CREATE TABLE IF NOT EXISTS public.ssr_specialty_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    specialty VARCHAR(64) NOT NULL,
    median_margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 2400.00,
    top_quartile_margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 3200.00,
    benchmark_turnover_minutes INT NOT NULL DEFAULT 18,
    benchmark_supply_variance_pct NUMERIC(5,2) NOT NULL DEFAULT 3.00,
    benchmark_doc_completeness_pct NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    CONSTRAINT unq_facility_ssr_spec_bench UNIQUE (facility_id, specialty)
);

-- 3. Surgeon Scorecard Compiled Editions Table
CREATE TABLE IF NOT EXISTS public.ssr_report_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_code VARCHAR(48) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    edition_status VARCHAR(24) NOT NULL DEFAULT 'PUBLISHED' CHECK (
        edition_status IN ('DRAFT', 'PUBLISHED', 'REVIEWED')
    ),
    surgeons_evaluated INT NOT NULL DEFAULT 0,
    avg_composite_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    total_facility_surgeon_margin_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    compiled_by VARCHAR(128) NOT NULL,
    sha256_report_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_ssr_edition UNIQUE (facility_id, period_code)
);

-- 4. Individual Surgeon Scorecards Table
CREATE TABLE IF NOT EXISTS public.ssr_surgeon_scorecards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.ssr_report_editions(id) ON DELETE CASCADE,
    surgeon_code VARCHAR(32) NOT NULL,
    surgeon_name VARCHAR(128) NOT NULL,
    specialty VARCHAR(64) NOT NULL,
    npi VARCHAR(16) NOT NULL,
    completed_cases INT NOT NULL DEFAULT 0,
    total_or_hours NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    net_revenue_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    direct_cost_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    contribution_margin_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    margin_per_or_hour_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    avg_turnover_minutes INT NOT NULL DEFAULT 18,
    preference_card_variance_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    doc_completeness_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    composite_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    performance_tier VARCHAR(32) NOT NULL CHECK (
        performance_tier IN ('TOP_QUARTILE_ELITE', 'ABOVE_BENCHMARK', 'WATCH_COACHING', 'ACTION_REQUIRED')
    ),
    rank_in_facility INT NOT NULL DEFAULT 1,
    sha256_card_seal VARCHAR(128) NOT NULL,
    CONSTRAINT unq_ssr_card_edition_surgeon UNIQUE (edition_id, surgeon_code)
);

-- 5. Surgeon CPT Mix & Implant Discipline Drill-Down Table
CREATE TABLE IF NOT EXISTS public.ssr_cpt_mix_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.ssr_surgeon_scorecards(id) ON DELETE CASCADE,
    cpt_code VARCHAR(16) NOT NULL,
    procedure_label VARCHAR(128) NOT NULL,
    case_count INT NOT NULL DEFAULT 0,
    avg_margin_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    implant_cost_per_case_usd NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    variance_vs_peer_pct NUMERIC(6,2) NOT NULL DEFAULT 0.00
);

-- 6. Confidential Peer Review & Coaching Log Table
CREATE TABLE IF NOT EXISTS public.ssr_peer_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scorecard_id UUID NOT NULL REFERENCES public.ssr_surgeon_scorecards(id) ON DELETE CASCADE,
    action_type VARCHAR(32) NOT NULL CHECK (
        action_type IN ('MEDICAL_DIR_REVIEW', 'SUPPLY_COACHING', 'COMMENDATION', 'SURGEON_ACK')
    ),
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Surgeon Scorecard H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.ssr_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.ssr_report_editions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_ssr_editions_facility_period ON public.ssr_report_editions (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_ssr_cards_edition_rank ON public.ssr_surgeon_scorecards (edition_id, rank_in_facility ASC);
CREATE INDEX IF NOT EXISTS idx_ssr_reviews_card ON public.ssr_peer_reviews (facility_id, scorecard_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_ssr_telemetry AS
SELECT
    c.facility_id,
    c.anonymize_peer_names_for_surgeon_view,
    c.min_cases_for_benchmark,
    c.sync_status,
    c.health_status,
    (SELECT e.edition_code FROM public.ssr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_edition_code,
    (SELECT e.surgeons_evaluated FROM public.ssr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS surgeons_evaluated,
    (SELECT e.avg_composite_score FROM public.ssr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS avg_composite_score,
    (SELECT e.total_facility_surgeon_margin_usd FROM public.ssr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS total_surgeon_margin_usd,
    (SELECT e.sha256_report_seal FROM public.ssr_report_editions e WHERE e.facility_id = c.facility_id ORDER BY e.period_code DESC LIMIT 1) AS latest_sync_seal
FROM public.ssr_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.ssr_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssr_specialty_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssr_report_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssr_surgeon_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssr_cpt_mix_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssr_peer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssr_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS ssr_configs_tenant_iso ON public.ssr_configs;
CREATE POLICY ssr_configs_tenant_iso ON public.ssr_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS ssr_bench_tenant_iso ON public.ssr_specialty_benchmarks;
CREATE POLICY ssr_bench_tenant_iso ON public.ssr_specialty_benchmarks USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS ssr_editions_tenant_iso ON public.ssr_report_editions;
CREATE POLICY ssr_editions_tenant_iso ON public.ssr_report_editions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS ssr_cards_tenant_iso ON public.ssr_surgeon_scorecards;
CREATE POLICY ssr_cards_tenant_iso ON public.ssr_surgeon_scorecards USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS ssr_cpt_tenant_iso ON public.ssr_cpt_mix_details;
CREATE POLICY ssr_cpt_tenant_iso ON public.ssr_cpt_mix_details USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS ssr_reviews_tenant_iso ON public.ssr_peer_reviews;
CREATE POLICY ssr_reviews_tenant_iso ON public.ssr_peer_reviews USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS ssr_dispatch_tenant_iso ON public.ssr_dispatch_logs;
CREATE POLICY ssr_dispatch_tenant_iso ON public.ssr_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    ed_nov_id UUID;
    card_1_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.ssr_configs (
            facility_id, weight_contribution_margin_pct, weight_or_efficiency_pct,
            weight_supply_discipline_pct, weight_documentation_quality_pct,
            anonymize_peer_names_for_surgeon_view, min_cases_for_benchmark,
            client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 35.00, 25.00, 25.00, 15.00, TRUE, 10,
            'ssr_sec_****_naples_4418', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.ssr_specialty_benchmarks (
            facility_id, specialty, median_margin_per_or_hour_usd, top_quartile_margin_per_or_hour_usd,
            benchmark_turnover_minutes, benchmark_supply_variance_pct, benchmark_doc_completeness_pct
        ) VALUES
        (naples_id, 'Orthopedic Surgery', 2950.00, 3850.00, 19, 3.50, 95.00),
        (naples_id, 'Sports Medicine', 2700.00, 3500.00, 18, 3.00, 96.00),
        (naples_id, 'Pain / Spine', 2350.00, 3100.00, 15, 2.50, 97.00),
        (naples_id, 'Ophthalmology', 2100.00, 2750.00, 14, 2.00, 98.00)
        ON CONFLICT (facility_id, specialty) DO NOTHING;

        INSERT INTO public.ssr_report_editions (
            facility_id, edition_code, period_code, edition_status,
            surgeons_evaluated, avg_composite_score, total_facility_surgeon_margin_usd,
            compiled_by, sha256_report_seal
        ) VALUES (
            naples_id, 'SSR-2026-11-NAP', '2026-11', 'PUBLISHED',
            4, 83.40, 706240.00, 'medical_dir@naplessurgery.com',
            'sha256_ssr_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, period_code) DO NOTHING;

        SELECT id INTO ed_nov_id FROM public.ssr_report_editions
        WHERE facility_id = naples_id AND period_code = '2026-11' LIMIT 1;

        IF ed_nov_id IS NOT NULL THEN
            INSERT INTO public.ssr_surgeon_scorecards (
                facility_id, edition_id, surgeon_code, surgeon_name, specialty, npi,
                completed_cases, total_or_hours, net_revenue_usd, direct_cost_usd, contribution_margin_usd,
                margin_per_or_hour_usd, avg_turnover_minutes, preference_card_variance_pct,
                doc_completeness_pct, composite_score, performance_tier, rank_in_facility, sha256_card_seal
            ) VALUES
            (naples_id, ed_nov_id, 'SRG-MAL', 'Dr. Malinoski Kelly', 'Orthopedic Surgery', '1982736450', 48, 62.50, 412000.00, 148550.00, 263450.00, 4215.20, 17, 1.80, 97.50, 92.40, 'TOP_QUARTILE_ELITE', 1, 'sha256_ssr_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'),
            (naples_id, ed_nov_id, 'SRG-GAR', 'Dr. Gardner Paul', 'Sports Medicine', '1456789012', 36, 51.00, 329000.00, 113370.00, 215630.00, 4228.04, 18, 2.40, 95.80, 88.60, 'TOP_QUARTILE_ELITE', 2, 'sha256_ssr_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c'),
            (naples_id, ed_nov_id, 'SRG-BON', 'Dr. Bonett Andrew', 'Pain / Spine', '1345678901', 41, 49.50, 268000.00, 110150.00, 157850.00, 3188.89, 16, 4.90, 92.40, 79.10, 'ABOVE_BENCHMARK', 3, 'sha256_ssr_44d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d'),
            (naples_id, ed_nov_id, 'SRG-WAL', 'Dr. Walsh Mark', 'Ophthalmology', '1234567890', 28, 34.00, 134500.00, 65190.00, 69310.00, 2038.53, 21, 6.20, 89.20, 73.50, 'ABOVE_BENCHMARK', 4, 'sha256_ssr_55e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e')
            ON CONFLICT (edition_id, surgeon_code) DO NOTHING;

            SELECT id INTO card_1_id FROM public.ssr_surgeon_scorecards
            WHERE edition_id = ed_nov_id AND surgeon_code = 'SRG-MAL' LIMIT 1;

            IF card_1_id IS NOT NULL THEN
                INSERT INTO public.ssr_cpt_mix_details (
                    facility_id, scorecard_id, cpt_code, procedure_label,
                    case_count, avg_margin_per_case_usd, implant_cost_per_case_usd, variance_vs_peer_pct
                )
                SELECT naples_id, card_1_id, v.code, v.lbl, v.cnt, v.mrg, v.imp, v.var_pct
                FROM (
                    VALUES
                    ('29881', 'Knee Arthroscopy w/ Meniscectomy', 22, 4820.00, 680.00, -4.20),
                    ('29827', 'Arthroscopic Rotator Cuff Repair', 16, 6140.00, 1840.00, 2.10),
                    ('27447', 'Total Knee Arthroplasty (Outpatient)', 10, 5917.00, 3420.00, -1.50)
                ) AS v(code, lbl, cnt, mrg, imp, var_pct)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.ssr_cpt_mix_details d
                    WHERE d.scorecard_id = card_1_id AND d.cpt_code = v.code
                );

                INSERT INTO public.ssr_peer_reviews (
                    facility_id, scorecard_id, action_type, actor_email, actor_role, notes, sha256_seal
                )
                SELECT naples_id, card_1_id, 'COMMENDATION', 'medical_dir@naplessurgery.com', 'Medical Director',
                       'Top-quartile OR contribution ($4,215/OR hr) with -1.8% preference card savings.',
                       'sha256_ssr_66f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f'
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.ssr_peer_reviews r
                    WHERE r.scorecard_id = card_1_id AND r.action_type = 'COMMENDATION'
                );
            END IF;

            INSERT INTO public.ssr_dispatch_logs (
                facility_id, edition_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, ed_nov_id, 'RPT-H4-RUN-NOV-01', 'PORTAL_INBOX', 'PDF', 4, 'DELIVERED',
                   'medical_dir@naplessurgery.com',
                   'sha256_ssr_77a8192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.ssr_dispatch_logs l WHERE l.edition_id = ed_nov_id AND l.rpt_execution_code = 'RPT-H4-RUN-NOV-01'
            );
        END IF;
    END IF;
END $$;
