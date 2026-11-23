-- ==============================================================================
-- Migration 120: Board Reporting & Executive KPI Package Engine
-- Phase E6: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes board-level reporting packages, executive scorecards,
--              structured narrative sections (Financial, Operations, RCM, Strategy, Risk),
--              covenant monitoring, RLS policies, and seed data for Naples Surgery Center.
-- ==============================================================================

-- 1. Facility Board Packages Master Table
CREATE TABLE IF NOT EXISTS public.facility_board_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_code VARCHAR(32) NOT NULL,
    package_title VARCHAR(128) NOT NULL,
    period_type VARCHAR(16) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    period_code VARCHAR(16) NOT NULL DEFAULT '2026-M10',
    meeting_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_CFO_REVIEW', 'PUBLISHED_TO_BOARD', 'SUPERSEDED', 'ARCHIVED')
    ),
    version_number INT NOT NULL DEFAULT 1,

    -- Executive Scorecard KPIs
    actual_cases INT NOT NULL DEFAULT 240,
    budgeted_cases INT NOT NULL DEFAULT 250,
    case_variance INT NOT NULL DEFAULT -10,
    actual_npr NUMERIC(14, 2) NOT NULL DEFAULT 1150000.00,
    budgeted_npr NUMERIC(14, 2) NOT NULL DEFAULT 1180000.00,
    npr_variance NUMERIC(14, 2) NOT NULL DEFAULT -30000.00,
    actual_ebitda NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    budgeted_ebitda NUMERIC(14, 2) NOT NULL DEFAULT 250000.00,
    ebitda_variance NUMERIC(14, 2) NOT NULL DEFAULT -10000.00,
    ebitda_margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 20.87,
    ending_cash_balance NUMERIC(14, 2) NOT NULL DEFAULT 1250000.00,
    minimum_cash_covenant NUMERIC(14, 2) NOT NULL DEFAULT 400000.00,
    covenant_headroom NUMERIC(14, 2) NOT NULL DEFAULT 850000.00,
    days_sales_outstanding INT NOT NULL DEFAULT 32,
    clean_claim_rate NUMERIC(6, 2) NOT NULL DEFAULT 96.80,
    or_capacity_utilization_percent NUMERIC(6, 2) NOT NULL DEFAULT 45.24,

    executive_summary TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_board_package UNIQUE (facility_id, package_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_board_packages ON public.facility_board_packages(facility_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_board_packages_status ON public.facility_board_packages(status);

-- 2. Board Package Sections Table
CREATE TABLE IF NOT EXISTS public.board_package_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.facility_board_packages(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    section_code VARCHAR(32) NOT NULL,
    section_title VARCHAR(128) NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    key_highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
    narrative_text TEXT NOT NULL,
    cfo_commentary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_board_package_section UNIQUE (package_id, section_code)
);

CREATE INDEX IF NOT EXISTS idx_board_package_sections ON public.board_package_sections(package_id, display_order);

-- 3. Executive Telemetry View
CREATE OR REPLACE VIEW public.vw_board_package_telemetry AS
SELECT
    p.facility_id,
    p.id AS package_id,
    p.package_code,
    p.package_title,
    p.period_type,
    p.period_code,
    p.meeting_date,
    p.status,
    p.is_active,
    p.is_published,
    p.actual_cases,
    p.budgeted_cases,
    p.case_variance,
    p.actual_npr,
    p.budgeted_npr,
    p.npr_variance,
    p.actual_ebitda,
    p.budgeted_ebitda,
    p.ebitda_variance,
    p.ebitda_margin_percent,
    p.ending_cash_balance,
    p.minimum_cash_covenant,
    p.covenant_headroom,
    p.days_sales_outstanding,
    p.clean_claim_rate,
    p.or_capacity_utilization_percent,
    p.frozen_hash,
    p.published_at,
    COUNT(s.id) AS section_count
FROM public.facility_board_packages p
LEFT JOIN public.board_package_sections s ON s.package_id = p.id
GROUP BY
    p.facility_id, p.id, p.package_code, p.package_title, p.period_type, p.period_code,
    p.meeting_date, p.status, p.is_active, p.is_published, p.actual_cases, p.budgeted_cases,
    p.case_variance, p.actual_npr, p.budgeted_npr, p.npr_variance, p.actual_ebitda,
    p.budgeted_ebitda, p.ebitda_variance, p.ebitda_margin_percent, p.ending_cash_balance,
    p.minimum_cash_covenant, p.covenant_headroom, p.days_sales_outstanding, p.clean_claim_rate,
    p.or_capacity_utilization_percent, p.frozen_hash, p.published_at;

-- 4. Row Level Security Policies
ALTER TABLE public.facility_board_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_package_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_board_packages ON public.facility_board_packages;
CREATE POLICY tenant_isolation_board_packages ON public.facility_board_packages
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_board_sections ON public.board_package_sections;
CREATE POLICY tenant_isolation_board_sections ON public.board_package_sections
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 5. Seed Data: Naples Surgery Center October 2026 Board Package
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_package_id UUID := '00000000-0000-0000-0000-000000000070';
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        INSERT INTO public.facility_board_packages (
            id, facility_id, package_code, package_title, period_type, period_code,
            meeting_date, status, version_number,
            actual_cases, budgeted_cases, case_variance,
            actual_npr, budgeted_npr, npr_variance,
            actual_ebitda, budgeted_ebitda, ebitda_variance, ebitda_margin_percent,
            ending_cash_balance, minimum_cash_covenant, covenant_headroom,
            days_sales_outstanding, clean_claim_rate, or_capacity_utilization_percent,
            executive_summary, is_active, is_published, published_at, frozen_hash, metadata
        ) VALUES (
            v_package_id, v_facility_id, 'BOD_2026_M10',
            'October 2026 Board of Managers Executive Report', 'MONTHLY', '2026-M10',
            '2026-11-25', 'PUBLISHED_TO_BOARD', 1,
            240, 250, -10,
            1150000.00, 1180000.00, -30000.00,
            240000.00, 250000.00, -10000.00, 20.87,
            1250000.00, 400000.00, 850000.00,
            32, 96.80, 45.24,
            'Naples Surgery Center generated $1,150,000 in Net Patient Revenue for October 2026, delivering $240,000 in Operating EBITDA (20.87% margin). Surgical case volume was 240 cases (-10 vs budget) driven by scheduled block vacation in Week 2. Operating cash position remains robust at $1,250,000, representing an $850,000 surplus above the senior credit facility debt covenant floor. Recruitment of 2 Total Joint orthopedic surgeons is on track for Q1 2027 boarding.',
            true, true, '2026-11-20T17:00:00Z',
            'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2',
            '{"author": "Chief Financial Officer", "distribution": "Board of Managers", "confidentiality": "Strictly Confidential"}'::jsonb
        ) ON CONFLICT (facility_id, package_code) DO NOTHING;

        -- Section 1: Financial Performance
        INSERT INTO public.board_package_sections (
            package_id, facility_id, section_code, section_title, display_order,
            key_highlights, narrative_text, cfo_commentary
        ) VALUES (
            v_package_id, v_facility_id, 'FINANCIAL',
            'Executive Financial Performance & Budget Variance', 1,
            '[
                {"label": "Net Patient Revenue", "value": "$1,150,000", "delta": "-$30,000 (-2.5%) vs Budget"},
                {"label": "Operating EBITDA", "value": "$240,000", "delta": "-$10,000 (-4.0%) vs Budget"},
                {"label": "Direct Clinical Margin", "value": "$480,000", "delta": "41.74% Margin Yield"},
                {"label": "Fixed Operating Overhead", "value": "$240,000", "delta": "On Budget ($0 variance)"}
            ]'::jsonb,
            'October 2026 Net Patient Revenue finished at $1,150,000 against a budgeted target of $1,180,000. The -$30,000 top-line variance was primarily volume-driven (-10 cases across Spine and General Surgery). Direct clinical contribution margin reached $480,000 (41.7% of NPR), supported by favorable implant procurement contracts in Joint Reconstruction. Operating EBITDA was $240,000 (20.87% margin) against a budget of $250,000.',
            'CFO Note: Unfavorable volume variance was partially offset by a +$10,000 favorable cost savings in surgical custom packs and sterile supplies.'
        ) ON CONFLICT (package_id, section_code) DO NOTHING;

        -- Section 2: Clinical Operations
        INSERT INTO public.board_package_sections (
            package_id, facility_id, section_code, section_title, display_order,
            key_highlights, narrative_text, cfo_commentary
        ) VALUES (
            v_package_id, v_facility_id, 'CLINICAL_OPS',
            'Surgical Operational Throughput & Capacity Economics', 2,
            '[
                {"label": "Completed Cases", "value": "240 Cases", "delta": "21 Operating Days"},
                {"label": "OR Capacity Utilization", "value": "45.24%", "delta": "18,240 / 40,320 Minutes"},
                {"label": "Average Case Duration", "value": "76 Mins", "delta": "On par with historical baseline"},
                {"label": "Turnover Efficiency", "value": "18.4 Mins", "delta": "1.6 mins faster than benchmark"}
            ]'::jsonb,
            'The center completed 240 surgical procedures across 4 operating rooms during 21 operating days, averaging 11.4 cases per day. Specialty distribution was led by Ophthalmology (70 cases), Orthopedics (65 cases), Pain Management (50 cases), Spine (35 cases), and General Surgery (20 cases). OR utilization remained optimal at 45.24%, leaving ample capacity for scheduled surgeon additions.',
            'CFO Note: Room turnover efficiency improved to 18.4 minutes, preserving clinical staffing hours and minimizing staff overtime.'
        ) ON CONFLICT (package_id, section_code) DO NOTHING;

        -- Section 3: Revenue Cycle & Cash
        INSERT INTO public.board_package_sections (
            package_id, facility_id, section_code, section_title, display_order,
            key_highlights, narrative_text, cfo_commentary
        ) VALUES (
            v_package_id, v_facility_id, 'RCM_CASH',
            'Revenue Cycle Management & Liquidity Runway', 3,
            '[
                {"label": "Ending Operating Cash", "value": "$1,250,000", "delta": "Verified Bank Balance"},
                {"label": "Covenant Safety Cushion", "value": "+$850,000", "delta": "Above $400k debt floor"},
                {"label": "Days Sales Outstanding", "value": "32 Days", "delta": "Target: <35 Days"},
                {"label": "Clean Claim Submission", "value": "96.8%", "delta": "WEDI SNIP Level 1-4 Verified"}
            ]'::jsonb,
            'The revenue cycle generated consistent weekly collections, closing October with $1,250,000 in liquid operating cash. 13-week cash projections project liquidity expanding to $1,385,000 by January 2027. Days Sales Outstanding (DSO) stood at 32 days, reflecting disciplined billing turnaround and zero secondary claim leakage. Senior credit facility covenant compliance remains fully satisfied.',
            'CFO Note: Commercial prompt-pay discounts accelerated $85,000 in collections during week 3, maintaining strong liquidity.'
        ) ON CONFLICT (package_id, section_code) DO NOTHING;

        -- Section 4: Strategic Initiatives
        INSERT INTO public.board_package_sections (
            package_id, facility_id, section_code, section_title, display_order,
            key_highlights, narrative_text, cfo_commentary
        ) VALUES (
            v_package_id, v_facility_id, 'STRATEGY',
            'Physician Recruitment & Specialty Expansion', 4,
            '[
                {"label": "Total Joint Recruitment", "value": "2 Surgeons", "delta": "Credentiating in progress"},
                {"label": "Projected Volume Add", "value": "+30 Cases / Mo", "delta": "+12.5% Top-Line Growth"},
                {"label": "Projected Annual EBITDA", "value": "+$1,332,000", "delta": "Based on Phase E5 Simulation"}
            ]'::jsonb,
            'Active recruitment of 2 fellowship-trained adult reconstruction orthopedic surgeons has reached final partnership contract review. Onboarding is projected for January 2027, introducing 20 outpatient total knees and 10 anterior total hips per month. Scenario modeling confirms existing OR block capacity accommodates this expansion without weekend shifts or capital expansion.',
            'CFO Note: Incremental contribution margin is modeled at $3,700 per case, creating significant operating leverage.'
        ) ON CONFLICT (package_id, section_code) DO NOTHING;

        -- Section 5: Risk & Governance
        INSERT INTO public.board_package_sections (
            package_id, facility_id, section_code, section_title, display_order,
            key_highlights, narrative_text, cfo_commentary
        ) VALUES (
            v_package_id, v_facility_id, 'RISK',
            'Enterprise Risk Assessment & Regulatory Compliance', 5,
            '[
                {"label": "Debt Covenant Standing", "value": "Fully Compliant", "delta": "3.12x Minimum Coverage"},
                {"label": "Medicare Fee Schedule", "value": "+2.8% Conversion", "delta": "CMS Final Rule 2027"},
                {"label": "AAAHC Accreditation", "value": "Current & Good", "delta": "Next Survey: Q3 2028"}
            ]'::jsonb,
            'Enterprise risk factors remain thoroughly controlled. Commercial payer contracts are locked through December 2027 with favorable implant carve-out terms. Medical staff credentials and AAAHC quality metrics meet all regulatory benchmarks. Supply chain pricing on high-acuity implants is protected under multi-year vendor master agreements.',
            'CFO Note: Management recommends maintaining the current cash reserve policy to fund scheduled Q2 2027 autoclave upgrades.'
        ) ON CONFLICT (package_id, section_code) DO NOTHING;

    END IF;
END $$;
