-- ==============================================================================
-- MIGRATION: 049_facility_financial_settings.sql
-- PHASE: 73 — Facility Financial Settings & Cost Assumptions Governance
-- STATUS: STAGED / AUTHORIZATION PENDING (Read-Only Safety Preserved)
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Facility Financial Settings (Effective-Dated Facility Cost Baseline)
CREATE TABLE IF NOT EXISTS public.facility_financial_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    schedule_name VARCHAR(128) NOT NULL DEFAULT 'ASC Baseline Operating Cost Schedule',
    version_number VARCHAR(16) NOT NULL DEFAULT '2026.1',
    or_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 10.00 CHECK (or_minute_rate >= 0.00),
    pacu_phase1_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 3.50 CHECK (pacu_phase1_minute_rate >= 0.00),
    pacu_phase2_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 2.00 CHECK (pacu_phase2_minute_rate >= 0.00),
    preop_minute_rate NUMERIC(10,2) NOT NULL DEFAULT 2.50 CHECK (preop_minute_rate >= 0.00),
    default_labor_burden_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.2500 CHECK (default_labor_burden_multiplier >= 1.0000),
    indirect_cost_per_case NUMERIC(10,2) NOT NULL DEFAULT 125.00 CHECK (indirect_cost_per_case >= 0.00),
    equipment_depreciation_hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 85.00 CHECK (equipment_depreciation_hourly_rate >= 0.00),
    effective_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_end_date DATE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED')
    ),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Ensure only one ACTIVE version per facility at any point in time
CREATE UNIQUE INDEX IF NOT EXISTS idx_fac_settings_active_unq
    ON public.facility_financial_settings(facility_id)
    WHERE is_active = TRUE AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_fac_settings_effective
    ON public.facility_financial_settings(facility_id, effective_start_date, effective_end_date);

-- 2. Clinical Role Hourly Wage & Burden Schedule
CREATE TABLE IF NOT EXISTS public.facility_role_wage_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    settings_id UUID NOT NULL REFERENCES public.facility_financial_settings(id) ON DELETE CASCADE,
    clinical_role VARCHAR(64) NOT NULL CHECK (
        clinical_role IN (
            'CIRCULATOR_RN',
            'SCRUB_TECH',
            'CRNA',
            'STERILE_PROCESSING_TECH',
            'PACU_RN',
            'PREOP_RN',
            'SURGICAL_ASSISTANT'
        )
    ),
    base_hourly_wage NUMERIC(10,2) NOT NULL CHECK (base_hourly_wage >= 0.00),
    role_burden_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.2500 CHECK (role_burden_multiplier >= 1.0000),
    effective_hourly_cost NUMERIC(10,2) GENERATED ALWAYS AS (
        ROUND(base_hourly_wage * role_burden_multiplier, 2)
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(settings_id, clinical_role)
);

CREATE INDEX IF NOT EXISTS idx_role_wages_facility ON public.facility_role_wage_rates(facility_id, clinical_role);

-- 3. Rollup View: Active Facility Cost Settings & Role Rates
CREATE OR REPLACE VIEW public.vw_active_facility_financial_settings AS
SELECT
    s.id AS settings_id,
    s.facility_id,
    f.name AS facility_name,
    s.schedule_name,
    s.version_number,
    s.or_minute_rate,
    s.pacu_phase1_minute_rate,
    s.pacu_phase2_minute_rate,
    s.preop_minute_rate,
    s.default_labor_burden_multiplier,
    s.indirect_cost_per_case,
    s.equipment_depreciation_hourly_rate,
    s.effective_start_date,
    s.effective_end_date,
    s.status,
    s.approved_at,
    COUNT(r.id) AS role_rate_count,
    COALESCE(AVG(r.effective_hourly_cost), 0.00) AS avg_clinical_hourly_cost
FROM public.facility_financial_settings s
JOIN public.facilities f ON f.id = s.facility_id
LEFT JOIN public.facility_role_wage_rates r ON r.settings_id = s.id
WHERE s.is_active = TRUE AND s.status = 'ACTIVE'
GROUP BY s.id, s.facility_id, f.name;

-- 4. Row-Level Security (RLS)
ALTER TABLE public.facility_financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_role_wage_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY fac_settings_policy ON public.facility_financial_settings
    FOR ALL TO authenticated
    USING (public.is_facility_accessible(facility_id))
    WITH CHECK (public.is_facility_accessible(facility_id));

CREATE POLICY fac_roles_policy ON public.facility_role_wage_rates
    FOR ALL TO authenticated
    USING (public.is_facility_accessible(facility_id))
    WITH CHECK (public.is_facility_accessible(facility_id));

