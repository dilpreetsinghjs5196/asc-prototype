-- ==============================================================================
-- Migration 121: ASC Analyst ROI & Validated Value Reporting Engine
-- Phase E7: Module 14 CFO Dashboard & Financial Accounting
-- Description: Establishes facility-level software ROI tracking, 4-pillar validated
--              economic value aggregation, transaction line-item attribution,
--              payback period velocity, and cryptographic SHA-256 seals.
-- ==============================================================================

-- 1. Facility ROI Reports Master Table
CREATE TABLE IF NOT EXISTS public.facility_roi_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    report_code VARCHAR(32) NOT NULL,
    report_title VARCHAR(128) NOT NULL,
    period_type VARCHAR(16) NOT NULL DEFAULT 'YTD' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'YTD')),
    period_code VARCHAR(16) NOT NULL DEFAULT '2026-YTD-M10',
    evaluation_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_AUDIT', 'PUBLISHED_AUDITED', 'SUPERSEDED', 'ARCHIVED')
    ),
    version_number INT NOT NULL DEFAULT 1,

    -- Platform Investment (TCO)
    annual_software_fee NUMERIC(14, 2) NOT NULL DEFAULT 36000.00,
    implementation_fee NUMERIC(14, 2) NOT NULL DEFAULT 12000.00,
    total_platform_investment NUMERIC(14, 2) NOT NULL DEFAULT 42000.00,

    -- 4-Pillar Gross Validated Values
    recovered_revenue NUMERIC(14, 2) NOT NULL DEFAULT 148500.00,
    direct_savings NUMERIC(14, 2) NOT NULL DEFAULT 96400.00,
    capacity_value NUMERIC(14, 2) NOT NULL DEFAULT 132325.00,
    avoided_costs NUMERIC(14, 2) NOT NULL DEFAULT 45000.00,
    gross_validated_value NUMERIC(14, 2) NOT NULL DEFAULT 422225.00,

    -- Labor & Net Metrics
    staff_intervention_hours NUMERIC(10, 2) NOT NULL DEFAULT 280.00,
    hourly_labor_rate NUMERIC(10, 2) NOT NULL DEFAULT 65.00,
    staff_labor_cost NUMERIC(14, 2) NOT NULL DEFAULT 18200.00,
    net_validated_value NUMERIC(14, 2) NOT NULL DEFAULT 404025.00,

    -- Executive ROI Metrics
    net_roi_percent NUMERIC(8, 2) NOT NULL DEFAULT 861.96,
    roi_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 9.62,
    payback_period_months NUMERIC(4, 2) NOT NULL DEFAULT 1.04,
    cost_of_inaction NUMERIC(14, 2) NOT NULL DEFAULT 164500.00,

    executive_narrative TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_roi_report UNIQUE (facility_id, report_code)
);

CREATE INDEX IF NOT EXISTS idx_facility_roi_reports ON public.facility_roi_reports(facility_id, evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_roi_reports_status ON public.facility_roi_reports(status);

-- 2. ROI Value Line Items (Transaction Provenance)
CREATE TABLE IF NOT EXISTS public.roi_value_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.facility_roi_reports(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    pillar_code VARCHAR(32) NOT NULL CHECK (
        pillar_code IN ('RECOVERED_REVENUE', 'DIRECT_SAVINGS', 'CAPACITY_VALUE', 'AVOIDED_COST')
    ),
    category_name VARCHAR(64) NOT NULL,
    item_description VARCHAR(256) NOT NULL,
    source_reference_id VARCHAR(64) NOT NULL,
    gross_amount NUMERIC(14, 2) NOT NULL,
    labor_offset NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(14, 2) NOT NULL,
    validation_source VARCHAR(64) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roi_value_line_items ON public.roi_value_line_items(report_id, pillar_code);

-- 3. Telemetry View
CREATE OR REPLACE VIEW public.vw_facility_roi_telemetry AS
SELECT
    r.facility_id,
    r.id AS report_id,
    r.report_code,
    r.report_title,
    r.period_type,
    r.period_code,
    r.evaluation_date,
    r.status,
    r.total_platform_investment,
    r.gross_validated_value,
    r.staff_labor_cost,
    r.net_validated_value,
    r.net_roi_percent,
    r.roi_multiplier,
    r.payback_period_months,
    r.cost_of_inaction,
    r.frozen_hash,
    r.is_published,
    COUNT(l.id) AS line_item_count
FROM public.facility_roi_reports r
LEFT JOIN public.roi_value_line_items l ON l.report_id = r.id
GROUP BY
    r.facility_id, r.id, r.report_code, r.report_title, r.period_type, r.period_code,
    r.evaluation_date, r.status, r.total_platform_investment, r.gross_validated_value,
    r.staff_labor_cost, r.net_validated_value, r.net_roi_percent, r.roi_multiplier,
    r.payback_period_months, r.cost_of_inaction, r.frozen_hash, r.is_published;

-- 4. Row Level Security Policies
ALTER TABLE public.facility_roi_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roi_value_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_roi_reports ON public.facility_roi_reports;
CREATE POLICY tenant_isolation_roi_reports ON public.facility_roi_reports
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

DROP POLICY IF EXISTS tenant_isolation_roi_line_items ON public.roi_value_line_items;
CREATE POLICY tenant_isolation_roi_line_items ON public.roi_value_line_items
    FOR ALL
    USING (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    )
    WITH CHECK (
        facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
        OR current_setting('app.is_super_admin', true) = 'true'
    );

-- 5. Seed Data: Naples Surgery Center 2026 YTD Software ROI Report
DO $$
DECLARE
    v_facility_id UUID := '00000000-0000-0000-0000-000000000002'; -- Naples Surgery Center
    v_report_id UUID := '00000000-0000-0000-0000-000000000080';
BEGIN
    IF EXISTS (SELECT 1 FROM public.facilities WHERE id = v_facility_id) THEN

        INSERT INTO public.facility_roi_reports (
            id, facility_id, report_code, report_title, period_type, period_code,
            evaluation_date, status, version_number,
            annual_software_fee, implementation_fee, total_platform_investment,
            recovered_revenue, direct_savings, capacity_value, avoided_costs, gross_validated_value,
            staff_intervention_hours, hourly_labor_rate, staff_labor_cost, net_validated_value,
            net_roi_percent, roi_multiplier, payback_period_months, cost_of_inaction,
            executive_narrative, is_active, is_published, published_at, frozen_hash, metadata
        ) VALUES (
            v_report_id, v_facility_id, 'VAL_ROI_2026_YTD',
            'ASC Analyst 2026 YTD Software ROI & Validated Value Audit', 'YTD', '2026-YTD-M10',
            '2026-11-20', 'PUBLISHED_AUDITED', 1,
            36000.00, 12000.00, 42000.00,
            148500.00, 96400.00, 132325.00, 45000.00, 422225.00,
            280.00, 65.00, 18200.00, 404025.00,
            861.96, 9.62, 1.04, 164500.00,
            'Through the 10-month evaluation period ending October 31, 2026, the ASC Analyst platform delivered $422,225.00 in gross validated economic value across Naples Surgery Center. Deducting $18,200.00 in documented staff intervention labor (280 hours @ $65/hr), the platform yielded $404,025.00 in net realized value. Against a total software investment of $42,000.00 ($30,000 YTD license + $12,000 onboarding amortization), ASC Analyst generated an 861.96% net ROI (9.62x cash multiplier) with a capital payback period of 1.04 months (31 days).',
            true, true, '2026-11-20T17:30:00Z',
            'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2',
            '{"author": "Chief Financial Officer", "distribution": "Board of Managers", "confidentiality": "Strictly Confidential"}'::jsonb
        ) ON CONFLICT (facility_id, report_code) DO NOTHING;

        -- Pillar 1: Recovered Revenue Line Items
        INSERT INTO public.roi_value_line_items (
            report_id, facility_id, pillar_code, category_name, item_description,
            source_reference_id, gross_amount, labor_offset, net_amount, validation_source
        ) VALUES
        (v_report_id, v_facility_id, 'RECOVERED_REVENUE', 'Payer Underpayment', 'Commercial fee schedule underpayments overturned across BlueCross and Aetna joint cases', 'ACT_2026_0881', 82300.00, 3900.00, 78400.00, '835 ERA Electronic Remittance'),
        (v_report_id, v_facility_id, 'RECOVERED_REVENUE', 'Missing Secondary', 'Unbilled secondary coordination-of-benefits claims automatically detected and recouped', 'ACT_2026_0914', 34200.00, 1950.00, 32250.00, 'Clearinghouse 837 Adjudication'),
        (v_report_id, v_facility_id, 'RECOVERED_REVENUE', 'Implant Carve-Out', 'Unattached surgical invoice carve-outs recouped for spine construct implants', 'ACT_2026_0952', 32000.00, 1300.00, 30700.00, 'UB-04 Claim Audit Trail');

        -- Pillar 2: Direct Savings Line Items
        INSERT INTO public.roi_value_line_items (
            report_id, facility_id, pillar_code, category_name, item_description,
            source_reference_id, gross_amount, labor_offset, net_amount, validation_source
        ) VALUES
        (v_report_id, v_facility_id, 'DIRECT_SAVINGS', 'Implant Tiering', 'Vendor construct renegotiation shifting orthopedic surgeons to standardized Tier 1 pricing', 'ACT_2026_1012', 64800.00, 2600.00, 62200.00, 'Vendor Master Purchase Agreement'),
        (v_report_id, v_facility_id, 'DIRECT_SAVINGS', 'Pack Standardization', 'Consolidation of general surgery & arthroscopy sterile pack configurations eliminating waste', 'ACT_2026_1045', 31600.00, 1950.00, 29650.00, 'Materials Management Ledger');

        -- Pillar 3: Capacity Monetization Line Items
        INSERT INTO public.roi_value_line_items (
            report_id, facility_id, pillar_code, category_name, item_description,
            source_reference_id, gross_amount, labor_offset, net_amount, validation_source
        ) VALUES
        (v_report_id, v_facility_id, 'CAPACITY_VALUE', 'Block Release Recovery', '67.0 unused block hours released >=7 days early and backfilled at $1,975/hr CM', 'ACT_2026_1102', 132325.00, 4550.00, 127775.00, 'OR Block Utilization Model');

        -- Pillar 4: Avoided Costs Line Items
        INSERT INTO public.roi_value_line_items (
            report_id, facility_id, pillar_code, category_name, item_description,
            source_reference_id, gross_amount, labor_offset, net_amount, validation_source
        ) VALUES
        (v_report_id, v_facility_id, 'AVOIDED_COST', 'Timely Filing Safeguard', 'Pre-clearinghouse SNIP 1-4 validation preventing fatal timely filing appeal expirations', 'ACT_2026_1180', 28000.00, 1300.00, 26700.00, 'WEDI SNIP Rules Engine'),
        (v_report_id, v_facility_id, 'AVOIDED_COST', 'Overtime Mitigation', 'Predictive duration smoothing reducing Friday clinical nursing overtime hours', 'ACT_2026_1220', 17000.00, 650.00, 16350.00, 'Payroll Time & Attendance');

    END IF;
END $$;
