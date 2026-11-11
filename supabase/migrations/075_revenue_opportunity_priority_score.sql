-- ==============================================================================
-- MIGRATION: 075_revenue_opportunity_priority_score.sql
-- DESCRIPTION: Phase 98 Revenue Opportunity Priority Score (ROPS) Engine:
--              Unified cross-module ranking combining value, confidence,
--              recoverability, and statutory deadline urgency.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. FACILITY ROPS SCORING CONFIGURATION TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_opportunity_score_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    facility_benchmark_amount NUMERIC(10, 2) NOT NULL DEFAULT 5000.00 CHECK (facility_benchmark_amount > 0.00),
    weight_value NUMERIC(4, 2) NOT NULL DEFAULT 0.35 CHECK (weight_value >= 0.00),
    weight_confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.25 CHECK (weight_confidence >= 0.00),
    weight_recoverability NUMERIC(4, 2) NOT NULL DEFAULT 0.25 CHECK (weight_recoverability >= 0.00),
    weight_urgency NUMERIC(4, 2) NOT NULL DEFAULT 0.15 CHECK (weight_urgency >= 0.00),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT chk_rops_weights_sum CHECK (
        ABS((weight_value + weight_confidence + weight_recoverability + weight_urgency) - 1.00) < 0.01
    )
);

CREATE INDEX IF NOT EXISTS idx_rops_rules_fac ON public.revenue_opportunity_score_rules(facility_id);

-- ==============================================================================
-- 2. MASTER REVENUE OPPORTUNITY PRIORITY LEDGER TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_opportunity_priority_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    source_module VARCHAR(50) NOT NULL
        CHECK (source_module IN (
            'IMPLANT_CARVEOUT',
            'DENIAL_APPEAL',
            'SECONDARY_COB',
            'PAYER_UNDERPAYMENT',
            'RECURRING_PATTERN',
            'UNBILLED_CASE',
            'MISSING_CHARGE'
        )),
    source_record_id VARCHAR(100) NOT NULL,
    claim_id UUID,
    claim_number VARCHAR(64) NOT NULL,
    patient_id UUID,
    patient_name VARCHAR(150) NOT NULL,
    patient_mrn VARCHAR(64) NOT NULL,
    payer_id UUID,
    payer_name VARCHAR(150) NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    date_of_service DATE NOT NULL,
    
    -- Financial Realizability
    recoverable_amount NUMERIC(10, 2) NOT NULL CHECK (recoverable_amount >= 0.00),
    confidence_score NUMERIC(5, 2) NOT NULL CHECK (confidence_score BETWEEN 0.00 AND 100.00),
    recoverability_score NUMERIC(5, 2) NOT NULL CHECK (recoverability_score BETWEEN 0.00 AND 100.00),
    expected_realizable_yield NUMERIC(10, 2) NOT NULL CHECK (expected_realizable_yield >= 0.00),
    estimated_effort_hours NUMERIC(4, 2) NOT NULL DEFAULT 1.00 CHECK (estimated_effort_hours >= 0.25),
    yield_per_hour NUMERIC(10, 2) NOT NULL CHECK (yield_per_hour >= 0.00),
    
    -- Subscores & Composite ROPS
    value_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (value_score BETWEEN 0.00 AND 100.00),
    urgency_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (urgency_score BETWEEN 0.00 AND 100.00),
    rops_priority_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (rops_priority_score BETWEEN 0.00 AND 100.00),
    
    -- Action Tier & Filing Urgency
    priority_action_tier VARCHAR(50) NOT NULL
        CHECK (priority_action_tier IN (
            'TIER_1_CRITICAL_DISPATCH',
            'TIER_2_HIGH_YIELD_RECOVERY',
            'TIER_3_STANDARD_WORKBENCH',
            'TIER_4_LOW_YIELD_BATCH',
            'TIER_5_EXPIRED_OR_SUPPRESSED'
        )),
    filing_deadline DATE NOT NULL,
    days_until_deadline INTEGER NOT NULL,
    
    -- Lifecycle State
    item_status VARCHAR(50) NOT NULL DEFAULT 'SCORED'
        CHECK (item_status IN (
            'SCORED',
            'DISPATCHED_TO_QUEUE',
            'IN_RECOVERY_WORKFLOW',
            'RECOVERED',
            'DISMISSED_NOT_RECOVERABLE',
            'EXPIRED_UNCOLLECTIBLE'
        )),
    assigned_analyst_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_rops_items_fac ON public.revenue_opportunity_priority_items(facility_id);
CREATE INDEX IF NOT EXISTS idx_rops_items_source ON public.revenue_opportunity_priority_items(facility_id, source_module);
CREATE INDEX IF NOT EXISTS idx_rops_items_tier ON public.revenue_opportunity_priority_items(facility_id, priority_action_tier);
CREATE INDEX IF NOT EXISTS idx_rops_items_status ON public.revenue_opportunity_priority_items(facility_id, item_status);
CREATE INDEX IF NOT EXISTS idx_rops_items_score ON public.revenue_opportunity_priority_items(facility_id, rops_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_rops_items_yield ON public.revenue_opportunity_priority_items(facility_id, yield_per_hour DESC);

-- ==============================================================================
-- 3. VIEWS FOR ACTIVE WORKBENCH & SUMMARY KPIS
-- ==============================================================================

CREATE OR REPLACE VIEW public.vw_revenue_opportunities_active AS
SELECT 
    id,
    facility_id,
    source_module,
    source_record_id,
    claim_id,
    claim_number,
    patient_name,
    patient_mrn,
    payer_name,
    cpt_code,
    procedure_name,
    date_of_service,
    recoverable_amount,
    confidence_score,
    recoverability_score,
    expected_realizable_yield,
    estimated_effort_hours,
    yield_per_hour,
    value_score,
    urgency_score,
    rops_priority_score,
    priority_action_tier,
    filing_deadline,
    days_until_deadline,
    item_status,
    assigned_analyst_name,
    created_at
FROM public.revenue_opportunity_priority_items
WHERE item_status NOT IN ('RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE');

CREATE OR REPLACE VIEW public.vw_revenue_opportunities_summary AS
SELECT 
    facility_id,
    COUNT(*) AS total_opportunities,
    COUNT(*) FILTER (WHERE item_status NOT IN ('RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE')) AS active_opportunities_count,
    COALESCE(SUM(recoverable_amount) FILTER (WHERE item_status NOT IN ('RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE')), 0.00) AS total_active_pipeline_amount,
    COALESCE(SUM(expected_realizable_yield) FILTER (WHERE item_status NOT IN ('RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE')), 0.00) AS total_expected_yield,
    COALESCE(AVG(rops_priority_score) FILTER (WHERE item_status NOT IN ('RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE')), 0.00) AS avg_rops_priority_score,
    COUNT(*) FILTER (WHERE days_until_deadline BETWEEN 0 AND 15 AND item_status NOT IN ('RECOVERED', 'DISMISSED_NOT_RECOVERABLE', 'EXPIRED_UNCOLLECTIBLE')) AS urgent_deadlines_count,
    COALESCE(SUM(recoverable_amount) FILTER (WHERE item_status = 'RECOVERED'), 0.00) AS total_recovered_amount
FROM public.revenue_opportunity_priority_items
GROUP BY facility_id;

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES (1:1 Statement Parity)
-- ==============================================================================

ALTER TABLE public.revenue_opportunity_score_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_opportunity_priority_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rops_rules_isolation ON public.revenue_opportunity_score_rules;
CREATE POLICY rops_rules_isolation ON public.revenue_opportunity_score_rules
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS rops_items_isolation ON public.revenue_opportunity_priority_items;
CREATE POLICY rops_items_isolation ON public.revenue_opportunity_priority_items
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

COMMIT;

