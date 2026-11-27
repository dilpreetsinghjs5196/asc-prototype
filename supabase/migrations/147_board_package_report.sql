-- ==============================================================================
-- Migration: 147_board_package_report.sql
-- Module 17: Enterprise Reporting & Executive Packages (Phase H9)
-- Description: Quarterly Board Package Dossiers, Debt Covenant Compliance,
--              5-Pillar Executive Narratives, Strategic Capital Resolutions,
--              Sequential CFO/Board Sign-Off Audit & H0 Dispatches.
-- ==============================================================================

-- 1. Board Package Trust-Gate & Covenant Config Table
CREATE TABLE IF NOT EXISTS public.bpk_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    min_dq_trust_score_for_board NUMERIC(5,2) NOT NULL DEFAULT 80.00,
    min_dscr_covenant NUMERIC(5,2) NOT NULL DEFAULT 1.25,
    max_leverage_ratio NUMERIC(5,2) NOT NULL DEFAULT 3.50,
    require_cfo_and_chair_signoff BOOLEAN NOT NULL DEFAULT TRUE,
    client_secret_encrypted TEXT,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE' CHECK (
        sync_status IN ('ACTIVE', 'PROCESSING', 'PAUSED', 'ERROR')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_bpk_config UNIQUE (facility_id),
    CONSTRAINT chk_bpk_trust_floor CHECK (
        min_dq_trust_score_for_board >= 50.00 AND min_dq_trust_score_for_board <= 100.00 AND min_dscr_covenant > 0
    )
);

-- 2. Quarterly Board Package Dossiers Table
CREATE TABLE IF NOT EXISTS public.bpk_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_code VARCHAR(48) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    package_status VARCHAR(24) NOT NULL DEFAULT 'CFO_VERIFIED' CHECK (
        package_status IN ('DRAFT', 'CFO_VERIFIED', 'BOARD_APPROVED', 'LOCKED_PUBLISHED')
    ),
    dq_trust_score NUMERIC(5,2) NOT NULL DEFAULT 94.20,
    net_revenue_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ebitda_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    ebitda_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    dso_days NUMERIC(6,1) NOT NULL DEFAULT 32.0,
    or_adjusted_util_pct NUMERIC(5,2) NOT NULL DEFAULT 87.95,
    realized_roi_value_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    is_covenant_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    compiled_by VARCHAR(128) NOT NULL,
    sha256_package_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_bpk_package UNIQUE (facility_id, period_code)
);

-- 3. Bank & Debt Covenant Compliance Monitors Table
CREATE TABLE IF NOT EXISTS public.bpk_covenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.bpk_packages(id) ON DELETE CASCADE,
    covenant_name VARCHAR(96) NOT NULL,
    lender_facility VARCHAR(64) NOT NULL,
    comparator VARCHAR(8) NOT NULL CHECK (comparator IN ('MIN', 'MAX')),
    threshold_value NUMERIC(8,2) NOT NULL,
    actual_value NUMERIC(8,2) NOT NULL,
    unit_label VARCHAR(16) NOT NULL,
    compliance_status VARCHAR(16) NOT NULL CHECK (
        compliance_status IN ('COMPLIANT', 'WATCH', 'BREACH')
    )
);

-- 4. Structured 5-Pillar Board Executive Sections Table
CREATE TABLE IF NOT EXISTS public.bpk_executive_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.bpk_packages(id) ON DELETE CASCADE,
    section_code VARCHAR(32) NOT NULL,
    section_title VARCHAR(96) NOT NULL,
    source_phase_ref VARCHAR(32) NOT NULL,
    headline_metric VARCHAR(64) NOT NULL,
    executive_summary TEXT NOT NULL,
    reviewed_by_cfo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT unq_bpk_section_code UNIQUE (package_id, section_code)
);

-- 5. Board Strategic Resolutions & CapEx Voting Register Table
CREATE TABLE IF NOT EXISTS public.bpk_strategic_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.bpk_packages(id) ON DELETE CASCADE,
    resolution_code VARCHAR(32) NOT NULL,
    title VARCHAR(160) NOT NULL,
    category VARCHAR(48) NOT NULL,
    capital_impact_usd NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    vote_outcome VARCHAR(24) NOT NULL DEFAULT 'PENDING_VOTE' CHECK (
        vote_outcome IN ('APPROVED', 'DEFERRED', 'PENDING_VOTE', 'REJECTED')
    ),
    sponsor_role VARCHAR(64) NOT NULL,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Sequential CFO / Board Governance Sign-Off Audit Table
CREATE TABLE IF NOT EXISTS public.bpk_signoff_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.bpk_packages(id) ON DELETE CASCADE,
    from_status VARCHAR(24) NOT NULL,
    to_status VARCHAR(24) NOT NULL,
    actor_email VARCHAR(128) NOT NULL,
    actor_role VARCHAR(64) NOT NULL,
    notes TEXT NOT NULL,
    sha256_seal VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Board Package H0 Dispatch Logs Table
CREATE TABLE IF NOT EXISTS public.bpk_dispatch_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES public.bpk_packages(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_bpk_packages_facility_period ON public.bpk_packages (facility_id, period_code DESC);
CREATE INDEX IF NOT EXISTS idx_bpk_signoff_pkg ON public.bpk_signoff_audit (facility_id, package_id, created_at DESC);

-- Telemetry View
CREATE OR REPLACE VIEW public.vw_bpk_telemetry AS
SELECT
    c.facility_id,
    c.min_dq_trust_score_for_board,
    c.min_dscr_covenant,
    c.sync_status,
    c.health_status,
    (SELECT p.package_code FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS latest_package_code,
    (SELECT p.package_status FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS latest_package_status,
    (SELECT p.net_revenue_usd FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS net_revenue_usd,
    (SELECT p.ebitda_usd FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS ebitda_usd,
    (SELECT p.ebitda_margin_pct FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS ebitda_margin_pct,
    (SELECT p.dq_trust_score FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS dq_trust_score,
    (SELECT p.realized_roi_value_usd FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS realized_roi_value_usd,
    (SELECT p.sha256_package_seal FROM public.bpk_packages p WHERE p.facility_id = c.facility_id ORDER BY p.period_code DESC LIMIT 1) AS latest_sync_seal
FROM public.bpk_configs c;

-- Enable Row-Level Security (RLS)
ALTER TABLE public.bpk_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpk_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpk_covenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpk_executive_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpk_strategic_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpk_signoff_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpk_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies (idempotent)
DROP POLICY IF EXISTS bpk_configs_tenant_iso ON public.bpk_configs;
CREATE POLICY bpk_configs_tenant_iso ON public.bpk_configs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS bpk_packages_tenant_iso ON public.bpk_packages;
CREATE POLICY bpk_packages_tenant_iso ON public.bpk_packages USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS bpk_covenants_tenant_iso ON public.bpk_covenants;
CREATE POLICY bpk_covenants_tenant_iso ON public.bpk_covenants USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS bpk_sections_tenant_iso ON public.bpk_executive_sections;
CREATE POLICY bpk_sections_tenant_iso ON public.bpk_executive_sections USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS bpk_resolutions_tenant_iso ON public.bpk_strategic_resolutions;
CREATE POLICY bpk_resolutions_tenant_iso ON public.bpk_strategic_resolutions USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS bpk_signoff_tenant_iso ON public.bpk_signoff_audit;
CREATE POLICY bpk_signoff_tenant_iso ON public.bpk_signoff_audit USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS bpk_dispatch_tenant_iso ON public.bpk_dispatch_logs;
CREATE POLICY bpk_dispatch_tenant_iso ON public.bpk_dispatch_logs USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- ==============================================================================
-- Idempotent Seed Data for Naples Surgery Center
-- ==============================================================================
DO $$
DECLARE
    naples_id UUID;
    pkg_q4_id UUID;
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        INSERT INTO public.bpk_configs (
            facility_id, min_dq_trust_score_for_board, min_dscr_covenant, max_leverage_ratio,
            require_cfo_and_chair_signoff, client_secret_encrypted, sync_status, health_status
        ) VALUES (
            naples_id, 80.00, 1.25, 3.50, TRUE,
            'bpk_sec_****_naples_9501', 'ACTIVE', 'HEALTHY'
        ) ON CONFLICT (facility_id) DO NOTHING;

        INSERT INTO public.bpk_packages (
            facility_id, package_code, period_code, package_status, dq_trust_score,
            net_revenue_usd, ebitda_usd, ebitda_margin_pct, dso_days, or_adjusted_util_pct,
            realized_roi_value_usd, is_covenant_compliant, compiled_by, sha256_package_seal
        ) VALUES (
            naples_id, 'BPK-2026-Q4-NAP', '2026-Q4', 'CFO_VERIFIED', 94.20,
            5580000.00, 1339200.00, 24.00, 32.0, 87.95, 284500.00, TRUE,
            'cfo@naplessurgery.com',
            'sha256_bpk_11a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3'
        ) ON CONFLICT (facility_id, period_code) DO NOTHING;

        SELECT id INTO pkg_q4_id FROM public.bpk_packages
        WHERE facility_id = naples_id AND period_code = '2026-Q4' LIMIT 1;

        IF pkg_q4_id IS NOT NULL THEN
            INSERT INTO public.bpk_covenants (
                facility_id, package_id, covenant_name, lender_facility, comparator,
                threshold_value, actual_value, unit_label, compliance_status
            )
            SELECT naples_id, pkg_q4_id, v.cname, v.lender, v.cmp, v.thresh, v.act, v.unit, v.stat
            FROM (
                VALUES
                ('Debt Service Coverage Ratio (DSCR)', 'Truist Healthcare Credit', 'MIN', 1.25, 2.42, 'x', 'COMPLIANT'),
                ('Total Funded Debt / TTM EBITDA', 'Truist Healthcare Credit', 'MAX', 3.50, 1.85, 'x', 'COMPLIANT'),
                ('Unrestricted Days Cash on Hand', 'JPMorgan Treasury Line', 'MIN', 45.00, 68.40, 'days', 'COMPLIANT'),
                ('Quarterly Capital Expenditure Cap', 'Board Fiscal Policy', 'MAX', 350.00, 210.00, '$K', 'COMPLIANT')
            ) AS v(cname, lender, cmp, thresh, act, unit, stat)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.bpk_covenants c WHERE c.package_id = pkg_q4_id AND c.covenant_name = v.cname
            );

            INSERT INTO public.bpk_executive_sections (
                facility_id, package_id, section_code, section_title, source_phase_ref,
                headline_metric, executive_summary, reviewed_by_cfo
            ) VALUES
            (naples_id, pkg_q4_id, 'FINANCIAL_PNL', 'GAAP Financial Performance & Cash Liquidity', 'H3 / H6', '$5.58M Rev · 24.0% EBITDA', 'Quarterly EBITDA reached $1.34M (+180 bps vs prior year) anchored by Orthopedic & Sports Medicine CPT unit economics.', TRUE),
            (naples_id, pkg_q4_id, 'CLINICAL_OR_CAPACITY', 'OR Block Utilization & Suite Throughput', 'H1 / H4 / H7', '87.95% Adj OR Util', 'Suites 1–3 operated above 88% adjusted utilization; reallocation of 6h/mo underutilized Friday PM ophthalmology block recommended.', TRUE),
            (naples_id, pkg_q4_id, 'PAYER_RCM_CYCLE', 'Payer Contract Yield, Denials & AR Velocity', 'H2 / H5 / H8', '32.0d DSO · $69.2K Exp Rec', 'DSO tightened to 32.0 days while UHC carve-out demands ($26.2K) and CARC 197 pre-auth retro-reviews ($24.3K) remain open prior to 48d renewal.', TRUE),
            (naples_id, pkg_q4_id, 'COMPLIANCE_RISK', 'Data Quality Trust Gates & Provenance', 'G2 / H0', '94.2% DQ Trust Score', 'All financial close reports cleared the 80% G2 Trust Gate with unbroken SHA-256 cryptographic seals.', TRUE)
            ON CONFLICT (package_id, section_code) DO NOTHING;

            INSERT INTO public.bpk_strategic_resolutions (
                facility_id, package_id, resolution_code, title, category,
                capital_impact_usd, vote_outcome, sponsor_role, notes, sha256_seal
            )
            SELECT naples_id, pkg_q4_id, v.rcode, v.ttl, v.cat, v.cap, v.vot, v.spn, v.nts, v.seal
            FROM (
                VALUES
                ('RES-2026-Q4-01', 'Approve Capitated Shoulder Anchor Bundle Renewal w/ Stryker', 'SUPPLY_CHAIN', 142000.00, 'APPROVED', 'CFO / Materials Director', 'Saves $420/case across 340 annual arthroscopic shoulder cases.', 'sha256_bpk_22b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'),
                ('RES-2026-Q4-02', 'Authorize C-Arm Fluoroscopy Lease Buyout vs Renewal', 'CAPITAL_EQUIPMENT', 185000.00, 'PENDING_VOTE', 'Facility Administrator', 'Improves Pain/Spine NOI by $68/case over 48-month useful life.', 'sha256_bpk_33c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c')
            ) AS v(rcode, ttl, cat, cap, vot, spn, nts, seal)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.bpk_strategic_resolutions r WHERE r.package_id = pkg_q4_id AND r.resolution_code = v.rcode
            );

            INSERT INTO public.bpk_signoff_audit (
                facility_id, package_id, from_status, to_status, actor_email, actor_role, notes, sha256_seal
            )
            SELECT naples_id, pkg_q4_id, 'DRAFT', 'CFO_VERIFIED', 'cfo@naplessurgery.com', 'CFO / Finance Director',
                   'Verified H3 EBITDA bridge, H8 GAAP 6-bucket AR balance, and bank covenant ratios.',
                   'sha256_bpk_44d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.bpk_signoff_audit s WHERE s.package_id = pkg_q4_id AND s.to_status = 'CFO_VERIFIED'
            );

            INSERT INTO public.bpk_dispatch_logs (
                facility_id, package_id, rpt_execution_code, delivery_channel, export_format,
                recipient_count, dispatch_status, dispatched_by, sha256_sync_seal
            )
            SELECT naples_id, pkg_q4_id, 'RPT-H9-RUN-Q4-01', 'BOARD_PORTAL', 'PDF', 7, 'DELIVERED',
                   'cfo@naplessurgery.com',
                   'sha256_bpk_55e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e'
            WHERE NOT EXISTS (
                SELECT 1 FROM public.bpk_dispatch_logs l WHERE l.package_id = pkg_q4_id AND l.rpt_execution_code = 'RPT-H9-RUN-Q4-01'
            );
        END IF;
    END IF;
END $$;
