-- ==============================================================================
-- MIGRATION: 074_implant_carveout_detection.sql
-- DESCRIPTION: Phase 97 Implant Carveout Detection & Missing Reimbursement Recovery
--              Engine: Automated detection of unbilled, zero-paid, underpaid,
--              or invoice-denied surgical implants and medical device carve-outs.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. IMPLANT CARVE-OUT PRICING & CONTRACT RULES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_carveout_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE CASCADE,
    payer_name VARCHAR(150) NOT NULL,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'COMMERCIAL'
        CHECK (plan_type IN ('COMMERCIAL', 'MEDICARE_ADVANTAGE', 'WORKERS_COMP', 'MEDICAID_MANAGED', 'OTHER')),
    contract_version VARCHAR(50) NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    hcpcs_device_code VARCHAR(10) NOT NULL,
    device_category VARCHAR(50) NOT NULL
        CHECK (device_category IN (
            'ORTHOPEDIC_IMPLANT',
            'SPINE_HARDWARE',
            'BIOLOGIC_GRAFT',
            'NEUROSTIMULATOR',
            'OPHTHALMIC_IOL',
            'VASCULAR_DEVICE',
            'GENERAL_IMPLANT'
        )),
    reimbursement_model VARCHAR(50) NOT NULL
        CHECK (reimbursement_model IN (
            'INVOICE_COST_PLUS_PERCENT',
            'PASS_THROUGH_AT_COST',
            'INVOICE_PLUS_FIXED_FEE',
            'THRESHOLD_OVERAGE_PLUS_MARKUP',
            'FEE_SCHEDULE_FIXED'
        )),
    markup_percentage NUMERIC(6, 4) DEFAULT 0.0000 CHECK (markup_percentage >= 0.0000),
    fixed_fee_amount NUMERIC(10, 2) DEFAULT 0.00 CHECK (fixed_fee_amount >= 0.00),
    min_threshold NUMERIC(10, 2) DEFAULT 0.00 CHECK (min_threshold >= 0.00),
    max_reimbursement_cap NUMERIC(10, 2) CHECK (max_reimbursement_cap IS NULL OR max_reimbursement_cap >= 0.00),
    requires_invoice_attachment BOOLEAN NOT NULL DEFAULT TRUE,
    timely_filing_days INTEGER NOT NULL DEFAULT 180 CHECK (timely_filing_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_implant_carveout_rules_fac ON public.implant_carveout_rules(facility_id);
CREATE INDEX IF NOT EXISTS idx_implant_carveout_rules_pyr ON public.implant_carveout_rules(facility_id, payer_id);
CREATE INDEX IF NOT EXISTS idx_implant_carveout_rules_cpt ON public.implant_carveout_rules(facility_id, cpt_code);
CREATE INDEX IF NOT EXISTS idx_implant_carveout_rules_hcpcs ON public.implant_carveout_rules(facility_id, hcpcs_device_code);

-- ==============================================================================
-- 2. IMPLANT CARVE-OUT DISCREPANCIES LEDGER TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.implant_carveout_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_id UUID NOT NULL,
    claim_id UUID NOT NULL,
    claim_number VARCHAR(64) NOT NULL,
    patient_id UUID NOT NULL,
    patient_name VARCHAR(150) NOT NULL,
    patient_mrn VARCHAR(64) NOT NULL,
    payer_id UUID NOT NULL,
    payer_name VARCHAR(150) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    date_of_service DATE NOT NULL,
    remittance_date DATE,
    
    -- Clinical Device Attributes
    device_name VARCHAR(255) NOT NULL,
    device_category VARCHAR(50) NOT NULL
        CHECK (device_category IN (
            'ORTHOPEDIC_IMPLANT',
            'SPINE_HARDWARE',
            'BIOLOGIC_GRAFT',
            'NEUROSTIMULATOR',
            'OPHTHALMIC_IOL',
            'VASCULAR_DEVICE',
            'GENERAL_IMPLANT'
        )),
    hcpcs_device_code VARCHAR(10) NOT NULL,
    vendor_name VARCHAR(150) NOT NULL,
    catalog_number VARCHAR(100),
    udi_di VARCHAR(100),
    quantity_implanted INTEGER NOT NULL DEFAULT 1 CHECK (quantity_implanted > 0),
    
    -- Invoice Documentation
    invoice_number VARCHAR(100),
    invoice_cost NUMERIC(10, 2) NOT NULL CHECK (invoice_cost >= 0.00),
    invoice_attached BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_attachment_url TEXT,
    
    -- Contractual Terms Applied
    carveout_rule_id UUID REFERENCES public.implant_carveout_rules(id) ON DELETE SET NULL,
    reimbursement_model VARCHAR(50) NOT NULL
        CHECK (reimbursement_model IN (
            'INVOICE_COST_PLUS_PERCENT',
            'PASS_THROUGH_AT_COST',
            'INVOICE_PLUS_FIXED_FEE',
            'THRESHOLD_OVERAGE_PLUS_MARKUP',
            'FEE_SCHEDULE_FIXED'
        )),
    markup_percentage NUMERIC(6, 4) DEFAULT 0.0000,
    
    -- Authoritative Financial Figures
    billed_carveout_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (billed_carveout_amount >= 0.00),
    expected_carveout_amount NUMERIC(10, 2) NOT NULL CHECK (expected_carveout_amount >= 0.00),
    payer_paid_carveout NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (payer_paid_carveout >= 0.00),
    carveout_variance NUMERIC(10, 2) NOT NULL CHECK (carveout_variance >= 0.00),
    
    -- Categorization & Priority Scoring
    carveout_leakage_type VARCHAR(50) NOT NULL
        CHECK (carveout_leakage_type IN (
            'UNBILLED_IMPLANT',
            'ZERO_PAID_BUNDLED',
            'MISSING_INVOICE_DENIAL',
            'MARKUP_UNDERPAID',
            'THRESHOLD_CALCULATION_ERROR'
        )),
    variance_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (variance_score BETWEEN 0.00 AND 100.00),
    documentation_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (documentation_score BETWEEN 0.00 AND 100.00),
    overturn_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (overturn_score BETWEEN 0.00 AND 100.00),
    urgency_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (urgency_score BETWEEN 0.00 AND 100.00),
    carveout_priority_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (carveout_priority_score BETWEEN 0.00 AND 100.00),
    
    recovery_action_tier VARCHAR(50) NOT NULL
        CHECK (recovery_action_tier IN (
            'TIER_1_CRITICAL_RECOVERY',
            'TIER_2_HIGH_YIELD_DISPUTE',
            'TIER_3_DOCUMENTATION_CURE',
            'TIER_4_LOW_VARIANCE_MONITOR',
            'TIER_5_EXPIRED_OR_NON_CARVED'
        )),
    documentation_readiness_tier VARCHAR(50) NOT NULL
        CHECK (documentation_readiness_tier IN (
            'INVOICE_AND_LOG_VERIFIED',
            'INVOICE_ON_FILE_NO_UDI',
            'LOG_VERIFIED_INVOICE_PENDING',
            'DOCUMENTATION_MISSING'
        )),
        
    -- CARC/RARC Tracking
    payer_carc_code VARCHAR(20),
    payer_rarc_code VARCHAR(20),
    
    -- Statutory Filing Urgency
    filing_deadline DATE NOT NULL,
    days_until_deadline INTEGER NOT NULL,
    
    -- Lifecycle State Machine
    discrepancy_status VARCHAR(50) NOT NULL DEFAULT 'DETECTED'
        CHECK (discrepancy_status IN (
            'DETECTED',
            'INVOICE_ACQUISITION_HOLD',
            'INVOICE_ATTACHED',
            'CORRECTED_CLAIM_QUEUED',
            'DISPUTE_SUBMITTED',
            'RECOVERED',
            'DISMISSED_NOT_ELIGIBLE',
            'EXPIRED_UNRECOVERABLE'
        )),
    assigned_analyst_id UUID,
    assigned_analyst_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_carveout_discrepancies_fac ON public.implant_carveout_discrepancies(facility_id);
CREATE INDEX IF NOT EXISTS idx_carveout_discrepancies_status ON public.implant_carveout_discrepancies(facility_id, discrepancy_status);
CREATE INDEX IF NOT EXISTS idx_carveout_discrepancies_tier ON public.implant_carveout_discrepancies(facility_id, recovery_action_tier);
CREATE INDEX IF NOT EXISTS idx_carveout_discrepancies_leakage ON public.implant_carveout_discrepancies(facility_id, carveout_leakage_type);
CREATE INDEX IF NOT EXISTS idx_carveout_discrepancies_claim ON public.implant_carveout_discrepancies(claim_id);
CREATE INDEX IF NOT EXISTS idx_carveout_discrepancies_hcpcs ON public.implant_carveout_discrepancies(hcpcs_device_code);

-- ==============================================================================
-- 3. VIEWS FOR ACTIVE WORKBENCH & ANALYTICS
-- ==============================================================================

CREATE OR REPLACE VIEW public.vw_implant_carveout_active AS
SELECT 
    id,
    facility_id,
    claim_id,
    claim_number,
    patient_name,
    patient_mrn,
    payer_name,
    primary_cpt,
    procedure_name,
    device_name,
    device_category,
    hcpcs_device_code,
    vendor_name,
    invoice_number,
    invoice_cost,
    invoice_attached,
    reimbursement_model,
    markup_percentage,
    expected_carveout_amount,
    payer_paid_carveout,
    carveout_variance,
    carveout_leakage_type,
    carveout_priority_score,
    recovery_action_tier,
    documentation_readiness_tier,
    payer_carc_code,
    payer_rarc_code,
    days_until_deadline,
    discrepancy_status,
    created_at
FROM public.implant_carveout_discrepancies
WHERE discrepancy_status NOT IN ('RECOVERED', 'DISMISSED_NOT_ELIGIBLE', 'EXPIRED_UNRECOVERABLE');

CREATE OR REPLACE VIEW public.vw_implant_carveout_summary AS
SELECT 
    facility_id,
    COUNT(*) AS total_discrepancies,
    COUNT(*) FILTER (WHERE discrepancy_status NOT IN ('RECOVERED', 'DISMISSED_NOT_ELIGIBLE', 'EXPIRED_UNRECOVERABLE')) AS active_discrepancies_count,
    COALESCE(SUM(carveout_variance) FILTER (WHERE discrepancy_status NOT IN ('RECOVERED', 'DISMISSED_NOT_ELIGIBLE', 'EXPIRED_UNRECOVERABLE')), 0.00) AS total_active_variance,
    COALESCE(SUM(carveout_variance) FILTER (WHERE carveout_leakage_type = 'UNBILLED_IMPLANT' AND discrepancy_status NOT IN ('RECOVERED', 'DISMISSED_NOT_ELIGIBLE', 'EXPIRED_UNRECOVERABLE')), 0.00) AS unbilled_variance_at_risk,
    COUNT(*) FILTER (WHERE invoice_attached = FALSE AND discrepancy_status NOT IN ('RECOVERED', 'DISMISSED_NOT_ELIGIBLE', 'EXPIRED_UNRECOVERABLE')) AS invoice_deficits_count,
    COALESCE(SUM(payer_paid_carveout) FILTER (WHERE discrepancy_status = 'RECOVERED'), 0.00) AS total_recovered_carveout
FROM public.implant_carveout_discrepancies
GROUP BY facility_id;

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES (1:1 Statement Parity)
-- ==============================================================================

ALTER TABLE public.implant_carveout_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implant_carveout_discrepancies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS implant_carveout_rules_isolation ON public.implant_carveout_rules;
CREATE POLICY implant_carveout_rules_isolation ON public.implant_carveout_rules
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS implant_carveout_discrepancies_isolation ON public.implant_carveout_discrepancies;
CREATE POLICY implant_carveout_discrepancies_isolation ON public.implant_carveout_discrepancies
  FOR ALL
  USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

COMMIT;
