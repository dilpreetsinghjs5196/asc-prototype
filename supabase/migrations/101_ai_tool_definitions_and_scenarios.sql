-- ==============================================================================
-- Migration: 101_ai_tool_definitions_and_scenarios.sql
-- Phase C3: AI Tool Definitions & What-If Simulation Engines
-- Module: Module 12: AI & Intelligence
-- Description: Establishes JSON Schema tool definitions, what-if scenario simulations
--              ledger, query prompt catalog, analytical views, indexes, and RLS policies.
-- ==============================================================================

-- 1. AI Tool Schemas Registry
CREATE TABLE IF NOT EXISTS public.ai_tool_schemas (
    tool_id VARCHAR(64) PRIMARY KEY,
    domain VARCHAR(32) NOT NULL, -- 'CASE', 'SURGEON', 'PAYER', 'CPT', 'OR', 'RCM', 'SCENARIO'
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    required_role VARCHAR(32) NOT NULL DEFAULT 'analyst',
    required_permission VARCHAR(64) NOT NULL DEFAULT 'ai:tool_execute',
    risk_tier VARCHAR(32) NOT NULL DEFAULT 'READ_ONLY_ANALYTICS', -- 'READ_ONLY_ANALYTICS', 'EXPORT_SYNTHESIS', 'PROPOSED_MUTATION', 'RESTRICTED_SYSTEM_ACTION'
    rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
    handler_function VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Scenario Simulations Ledger
CREATE TABLE IF NOT EXISTS public.ai_scenario_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    scenario_type VARCHAR(64) NOT NULL, -- 'OR_BLOCK_REALLOCATION', 'CONSTRUCT_STANDARDIZATION'
    title VARCHAR(256) NOT NULL,
    description TEXT,
    input_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    baseline_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    projected_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    delta_impact JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 95.00,
    created_by VARCHAR(64) NOT NULL,
    created_by_role VARCHAR(32) NOT NULL,
    provenance_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Query Catalogs
CREATE TABLE IF NOT EXISTS public.ai_query_catalogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain VARCHAR(32) NOT NULL,
    tool_id VARCHAR(64) NOT NULL REFERENCES public.ai_tool_schemas(tool_id) ON DELETE CASCADE,
    query_label VARCHAR(128) NOT NULL,
    natural_language_prompts TEXT[] NOT NULL,
    default_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 10,
    is_system BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Analytical Views
CREATE OR REPLACE VIEW public.vw_ai_tool_catalog_summary AS
SELECT 
    domain,
    COUNT(*) AS total_tools,
    COUNT(*) FILTER (WHERE is_active = true) AS active_tools,
    ARRAY_AGG(DISTINCT required_permission) AS permissions_required,
    ROUND(AVG(rate_limit_rpm), 1) AS avg_rate_limit_rpm
FROM public.ai_tool_schemas
GROUP BY domain
ORDER BY domain;

CREATE OR REPLACE VIEW public.vw_ai_scenario_simulation_history AS
SELECT 
    s.id,
    s.facility_id,
    f.name AS facility_name,
    s.scenario_type,
    s.title,
    s.input_parameters,
    s.delta_impact,
    s.confidence_score,
    s.created_by,
    s.created_by_role,
    s.provenance_hash,
    s.created_at
FROM public.ai_scenario_simulations s
JOIN public.facilities f ON s.facility_id = f.id
ORDER BY s.created_at DESC;

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_ai_tool_schemas_domain ON public.ai_tool_schemas(domain);
CREATE INDEX IF NOT EXISTS idx_ai_tool_schemas_active ON public.ai_tool_schemas(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_scenario_simulations_facility ON public.ai_scenario_simulations(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_scenario_simulations_type ON public.ai_scenario_simulations(scenario_type);
CREATE INDEX IF NOT EXISTS idx_ai_query_catalogs_domain ON public.ai_query_catalogs(domain);
CREATE INDEX IF NOT EXISTS idx_ai_query_catalogs_tool ON public.ai_query_catalogs(tool_id);

-- 6. Row Level Security (RLS)
ALTER TABLE public.ai_tool_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_scenario_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_query_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_ai_tool_schemas_select ON public.ai_tool_schemas
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_ai_query_catalogs_select ON public.ai_query_catalogs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY rls_ai_scenario_simulations_tenant ON public.ai_scenario_simulations
    FOR ALL TO authenticated
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- 7. Seed Registry Data for 14 Production Tool Schemas
INSERT INTO public.ai_tool_schemas (tool_id, domain, name, description, required_role, required_permission, risk_tier, rate_limit_rpm, handler_function, input_schema, output_schema)
VALUES
-- Domain 1: Case Queries
('case_financial_ledger_query', 'CASE', 'Case Financial Ledger Query', 'Itemized case financial reconciliation including gross charges, contractual adjustments, payments, direct costs, and net contribution margin.', 'analyst', 'ai:view_financial', 'READ_ONLY_ANALYTICS', 60, 'executeCaseFinancialLedger', 
 '{"type": "object", "properties": {"caseId": {"type": "string"}, "status": {"type": "string", "enum": ["BILLED", "PAID", "APPEALED", "PENDING_ADJUDICATION"]}, "minMarginPct": {"type": "number"}, "limit": {"type": "integer", "default": 20}}}'::jsonb,
 '{"type": "object", "properties": {"cases": {"type": "array"}, "totalGrossCharges": {"type": "number"}, "totalNetMargin": {"type": "number"}}}'::jsonb),

('case_cost_composition', 'CASE', 'Case Cost Composition Breakdown', 'Deep itemized breakdown of clinical direct expenses per surgical case across implants, sterile supplies, pharmaceuticals, and OR staffed room time.', 'analyst', 'ai:view_financial', 'READ_ONLY_ANALYTICS', 60, 'executeCaseCostComposition',
 '{"type": "object", "properties": {"caseId": {"type": "string"}}, "required": ["caseId"]}'::jsonb,
 '{"type": "object", "properties": {"caseId": {"type": "string"}, "implants": {"type": "array"}, "supplies": {"type": "array"}, "pharmaceuticals": {"type": "array"}, "orMinutesCost": {"type": "number"}, "totalDirectCost": {"type": "number"}}}'::jsonb),

-- Domain 2: Surgeon Queries
('surgeon_scorecard_query', 'SURGEON', 'Surgeon Performance Scorecard', 'Surgeon operational and financial performance across case volumes, FCOTS %, block utilization %, and contribution margin per OR hour.', 'surgeon', 'ai:view_clinical', 'READ_ONLY_ANALYTICS', 60, 'executeSurgeonScorecard',
 '{"type": "object", "properties": {"surgeonId": {"type": "string"}, "specialty": {"type": "string"}, "timeframe": {"type": "string", "enum": ["YTD", "Q1", "Q2", "LAST_90_DAYS"]}}}'::jsonb,
 '{"type": "object", "properties": {"scorecards": {"type": "array"}, "avgBlockUtilization": {"type": "number"}, "avgFcotsCompliance": {"type": "number"}}}'::jsonb),

('surgeon_block_schedule_query', 'SURGEON', 'Surgeon Block Schedule Inventory', 'Weekly and monthly block schedule allocation inventory, utilized vs unutilized hours, release lag days, and auto-release risk level.', 'clinical_manager', 'ai:view_clinical', 'READ_ONLY_ANALYTICS', 60, 'executeSurgeonBlockSchedule',
 '{"type": "object", "properties": {"surgeonId": {"type": "string"}, "operatingRoom": {"type": "string"}, "dayOfWeek": {"type": "string"}}}'::jsonb,
 '{"type": "object", "properties": {"blocks": {"type": "array"}, "totalAllocatedHours": {"type": "number"}, "overallUtilizationPct": {"type": "number"}}}'::jsonb),

-- Domain 3: Payer Queries
('payer_contract_performance_query', 'PAYER', 'Payer Contract Yield & DSO', 'Contractual performance across commercial and government payers, clean claim rates, average DSO days, denial rates, and cash yield.', 'billing_manager', 'ai:view_financial', 'READ_ONLY_ANALYTICS', 60, 'executePayerContractPerformance',
 '{"type": "object", "properties": {"payerId": {"type": "string"}, "lookbackDays": {"type": "integer", "default": 90}}}'::jsonb,
 '{"type": "object", "properties": {"payers": {"type": "array"}, "blendedRealizationRate": {"type": "number"}, "avgDsoDays": {"type": "number"}}}'::jsonb),

('payer_realization_rate', 'PAYER', 'Payer Realization & Underpayment Radar', 'In-depth underpayment variance analysis, contractual allowable expectation vs actual payment, carve-out recapture, and appeal recovery yield.', 'billing_manager', 'ai:view_financial', 'READ_ONLY_ANALYTICS', 60, 'executePayerRealizationRate',
 '{"type": "object", "properties": {"payerId": {"type": "string"}}, "required": ["payerId"]}'::jsonb,
 '{"type": "object", "properties": {"payerId": {"type": "string"}, "expectedAmount": {"type": "number"}, "actualAmount": {"type": "number"}, "varianceAmount": {"type": "number"}, "carveoutRecapturePct": {"type": "number"}}}'::jsonb),

-- Domain 4: CPT Queries
('cpt_economics_query', 'CPT', 'CPT Procedural Economics', 'Procedural economics per primary/secondary CPT code, reimbursement yield, direct cost breakdown, margin per minute, and implant cost percentage.', 'analyst', 'ai:view_clinical', 'READ_ONLY_ANALYTICS', 60, 'executeCptEconomics',
 '{"type": "object", "properties": {"cptCode": {"type": "string"}, "sortBy": {"type": "string", "enum": ["MARGIN", "VOLUME", "REIMBURSEMENT"]}}}'::jsonb,
 '{"type": "object", "properties": {"cptEconomics": {"type": "array"}, "topContributionCpt": {"type": "string"}}}'::jsonb),

('cpt_duration_variance', 'CPT', 'CPT Duration & Turnover Variance', 'Procedure skin-to-skin surgical duration variance, scheduled vs actual minutes, standard deviation, and post-case turnover velocity.', 'clinical_director', 'ai:view_clinical', 'READ_ONLY_ANALYTICS', 60, 'executeCptDurationVariance',
 '{"type": "object", "properties": {"cptCode": {"type": "string"}}, "required": ["cptCode"]}'::jsonb,
 '{"type": "object", "properties": {"cptCode": {"type": "string"}, "scheduledMinutes": {"type": "number"}, "actualMeanMinutes": {"type": "number"}, "durationVarianceMinutes": {"type": "number"}}}'::jsonb),

-- Domain 5: OR Operational Queries
('or_room_utilization_query', 'OR', 'OR Suite Telemetry & Utilization', 'Operating room telemetry by suite, staffed hours, prime-time utilization %, first-case on-time starts, idle minutes, and labor idle cost.', 'clinical_director', 'ai:view_clinical', 'READ_ONLY_ANALYTICS', 60, 'executeOrRoomUtilization',
 '{"type": "object", "properties": {"operatingRoom": {"type": "string"}, "timeframe": {"type": "string", "enum": ["TODAY", "THIS_WEEK", "LAST_30_DAYS"]}}}'::jsonb,
 '{"type": "object", "properties": {"rooms": {"type": "array"}, "primeTimeUtilization": {"type": "number"}, "idleLaborCost": {"type": "number"}}}'::jsonb),

('room_turnover_velocity', 'OR', 'Room Turnover Velocity & Delay Attribution', 'Wheels-out to wheels-in metrics, same-surgeon vs different-surgeon benchmarks, prolonged turnover incidents, and delay attribution causes.', 'clinical_manager', 'ai:view_clinical', 'READ_ONLY_ANALYTICS', 60, 'executeRoomTurnoverVelocity',
 '{"type": "object", "properties": {"operatingRoom": {"type": "string"}, "specialty": {"type": "string"}}}'::jsonb,
 '{"type": "object", "properties": {"turnovers": {"type": "array"}, "avgTurnoverMinutes": {"type": "number"}, "prolongedTurnoversCount": {"type": "number"}}}'::jsonb),

-- Domain 6: RCM Queries
('denials_carc_frequency', 'RCM', 'CARC/RARC Denial Root Cause Analysis', 'Post-adjudication denial analysis categorized by CARC and RARC codes, frequency counts, at-risk cash, and appeal success probability.', 'billing_manager', 'ai:view_financial', 'READ_ONLY_ANALYTICS', 60, 'executeDenialsCarcFrequency',
 '{"type": "object", "properties": {"carcGroup": {"type": "string", "enum": ["CO", "PR", "OA", "PI", "CR"]}, "payerId": {"type": "string"}, "limit": {"type": "integer", "default": 10}}}'::jsonb,
 '{"type": "object", "properties": {"carcSummary": {"type": "array"}, "totalAtRiskAmount": {"type": "number"}, "topDenialReason": {"type": "string"}}}'::jsonb),

('clean_claim_rate_scrubber', 'RCM', 'Pre-Bill Clean Claim Scrubber Audit', 'Pre-bill scrub findings, missing pre-auth, medical necessity LCD mismatches, unbundled CPT coding alerts, and modifier 59/51 checks.', 'billing_manager', 'ai:view_financial', 'READ_ONLY_ANALYTICS', 60, 'executeCleanClaimRateScrubber',
 '{"type": "object", "properties": {"batchId": {"type": "string"}, "scrubLevel": {"type": "string", "enum": ["ALL", "CRITICAL_ONLY", "WARNINGS"]}}}'::jsonb,
 '{"type": "object", "properties": {"claimsScrubbed": {"type": "integer"}, "cleanClaimRatePct": {"type": "number"}, "flaggedDefects": {"type": "array"}, "projectedDenialSavings": {"type": "number"}}}'::jsonb),

-- Domain 7: Scenario & What-If Simulation Queries
('or_block_reallocation_simulation', 'SCENARIO', 'OR Block Reallocation What-If Simulator', 'Models mathematical reallocation of underutilized OR block hours to high-margin specialties, projecting net margin lift ($) and case volume deltas.', 'clinical_director', 'ai:propose_action', 'PROPOSED_MUTATION', 30, 'simulateOrBlockReallocation',
 '{"type": "object", "properties": {"sourceSurgeonId": {"type": "string"}, "targetSurgeonId": {"type": "string"}, "reallocatedHoursWeekly": {"type": "number", "minimum": 1, "maximum": 40}, "durationWeeks": {"type": "integer", "minimum": 1, "maximum": 52}}, "required": ["sourceSurgeonId", "targetSurgeonId", "reallocatedHoursWeekly"]}'::jsonb,
 '{"type": "object", "properties": {"netMarginLift": {"type": "number"}, "deltaCases": {"type": "integer"}, "facilityUtilizationLiftPct": {"type": "number"}, "confidenceScore": {"type": "number"}}}'::jsonb),

('construct_standardization_scenario', 'SCENARIO', 'Construct Standardization What-If Simulator', 'Models clinical supply and implant construct standardization across surgical teams, estimating direct purchase savings and vendor rebate capture.', 'clinical_director', 'ai:propose_action', 'PROPOSED_MUTATION', 30, 'simulateConstructStandardization',
 '{"type": "object", "properties": {"constructCategory": {"type": "string"}, "standardizedVendorId": {"type": "string"}, "targetComplianceRatePct": {"type": "number", "minimum": 50, "maximum": 100}, "annualConstructVolume": {"type": "integer", "minimum": 10}}, "required": ["constructCategory", "standardizedVendorId"]}'::jsonb,
 '{"type": "object", "properties": {"grossDirectSavings": {"type": "number"}, "projectedVendorRebate": {"type": "number"}, "netAnnualizedSavings": {"type": "number"}, "savingsPct": {"type": "number"}}}'::jsonb)
ON CONFLICT (tool_id) DO UPDATE SET
    domain = EXCLUDED.domain,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    required_role = EXCLUDED.required_role,
    required_permission = EXCLUDED.required_permission,
    risk_tier = EXCLUDED.risk_tier,
    rate_limit_rpm = EXCLUDED.rate_limit_rpm,
    handler_function = EXCLUDED.handler_function,
    input_schema = EXCLUDED.input_schema,
    output_schema = EXCLUDED.output_schema,
    updated_at = NOW();

-- 8. Seed Pre-built Query Catalogs
INSERT INTO public.ai_query_catalogs (domain, tool_id, query_label, natural_language_prompts, default_parameters, sort_order)
VALUES
('CASE', 'case_financial_ledger_query', 'High-Risk Margin Cases', 
 ARRAY['Show cases with contribution margin under 15%', 'List underpaid surgical cases this quarter', 'Which cases had direct costs exceeding collections?'],
 '{"minMarginPct": 15, "limit": 10}'::jsonb, 10),

('SURGEON', 'surgeon_scorecard_query', 'Surgeon Efficiency Scorecard',
 ARRAY['Compare surgeon block utilization and on-time starts', 'Who are our highest contribution margin surgeons per OR hour?', 'Surgeons at risk for block release'],
 '{"timeframe": "LAST_90_DAYS"}'::jsonb, 20),

('PAYER', 'payer_contract_performance_query', 'Payer Realization & DSO Audit',
 ARRAY['Which commercial payers have the highest denial rates?', 'Show average days to pay by payer', 'Compare BCBS vs UnitedHealthcare allowable realization'],
 '{"lookbackDays": 90}'::jsonb, 30),

('CPT', 'cpt_economics_query', 'CPT Procedural Profitability',
 ARRAY['What is our margin per minute on total knees vs shoulders?', 'Top 10 highest contribution CPT codes', 'Which CPT codes have implant cost above 40%?'],
 '{"sortBy": "MARGIN"}'::jsonb, 40),

('OR', 'or_room_utilization_query', 'Prime-Time OR Room Telemetry',
 ARRAY['What was our prime-time utilization across OR suites yesterday?', 'Show staffed idle hours and labor cost impact', 'Which operating room had the most first-case delays?'],
 '{"timeframe": "THIS_WEEK"}'::jsonb, 50),

('RCM', 'denials_carc_frequency', 'Top Denial CARC Reasons',
 ARRAY['What are our top CARC denial reason codes?', 'Show preventable denials by frequency and dollar value', 'What is our appeal success rate on CO-16 denials?'],
 '{"carcGroup": "CO", "limit": 5}'::jsonb, 60),

('SCENARIO', 'or_block_reallocation_simulation', 'Simulate OR Block Reallocation',
 ARRAY['What happens if we reallocate 8 hours from Dr. Miller to Dr. Chen?', 'Model margin lift from shifting low utilization block time', 'Projected case volume increase from orthopedic block expansion'],
 '{"reallocatedHoursWeekly": 8, "durationWeeks": 26}'::jsonb, 70),

('SCENARIO', 'construct_standardization_scenario', 'Simulate Construct Standardization',
 ARRAY['How much would we save by standardizing spine pedicle screws?', 'Simulate switching orthopaedic anchors to Stryker with 85% compliance', 'Model annual rebate from implant vendor consolidation'],
 '{"targetComplianceRatePct": 85, "annualConstructVolume": 140}'::jsonb, 80)
ON CONFLICT DO NOTHING;
