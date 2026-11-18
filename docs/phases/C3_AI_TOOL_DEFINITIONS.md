# C3 AI TOOL DEFINITIONS & WHAT-IF SIMULATION ENGINES

## Purpose
The **AI Tool Definitions & What-If Simulation Tier** provides formal JSON Schema contracts, typed parameter validation, server-authoritative deterministic analytical calculators, and predictive scenario simulation engines for the ASCANALYST AI platform. It operationalizes high-fidelity tool capabilities across seven core analytical and operational domains:
1. **Case Queries** (`case_financial_ledger_query`, `case_cost_composition`)
2. **Surgeon Queries** (`surgeon_scorecard_query`, `surgeon_block_schedule_query`)
3. **Payer Queries** (`payer_contract_performance_query`, `payer_realization_rate`)
4. **CPT Queries** (`cpt_economics_query`, `cpt_duration_variance`)
5. **OR Operational Queries** (`or_room_utilization_query`, `room_turnover_velocity`)
6. **RCM Queries** (`denials_carc_frequency`, `clean_claim_rate_scrubber`)
7. **Scenario & What-If Simulation Queries** (`or_block_reallocation_simulation`, `construct_standardization_scenario`)

All tool executions are executed server-side with zero AI arithmetic hallucinations, validated against JSON Schema Draft-07 specifications, governed by Phase C2 action boundaries and RBAC permissions, and logged with cryptographic SHA-256 provenance signatures.

---

## Scope
- **Production Requirements**:
  - Author formal, typed schemas for 14 analytical tool contracts across 7 operational domains.
  - Establish a persistent Tool Definition Catalog (`ai_tool_schemas`) defining input parameter schemas, output projection contracts, safety tiers, and required role permissions.
  - Implement deterministic mathematical calculators for financial ledgers, physician scorecards, payer realization, procedural economics, OR telemetry, and claim denial root causes.
  - Implement two interactive, mathematical What-If Simulation Engines:
    - **OR Block Reallocation Simulator**: Computes net contribution margin lift ($), incremental procedure volume, and staffed utilization shift when reallocating block hours from underutilized/low-margin surgical services to high-demand/high-margin specialists.
    - **Construct Standardization Simulator**: Computes gross direct supply savings, vendor volume rebate tier captures, and net annualized savings ($) when standardizing high-cost surgical constructs (e.g. spine hardware, orthopaedic joint implants) across surgical teams.
  - Enforce organization and facility tenancy isolation via PostgreSQL Row-Level Security (RLS).
  - Enforce zero client-side arithmetic drift or LLM hallucination—all calculations run through auditable server routines.

---

## Current State
| Component | Classification | Current State Description | Action Required |
| :--- | :--- | :--- | :--- |
| `aiToolGatewayService.js` (Phase C1) | **KEEP** | Provides mediation gateway, circuit breaking, rate limiting, and Safe Harbor redaction. | Register Phase C3 tool contracts and simulation handlers into gateway dispatch router. |
| `aiPermissionsService.js` (Phase C2) | **KEEP** | Provides action risk boundary classification and Human-in-the-Loop dual-key approval. | Enforce Phase C2 boundary checks (`READ_ONLY_ANALYTICS` vs `PROPOSED_MUTATION`) on all C3 tool queries and simulations. |
| Specialized Module 10 & 11 Services | **KEEP** | Domain calculation engines (`cptEconomicsService.js`, `orUtilizationMetricsService.js`, `turnoverMetricsService.js`, `carcRarcService.js`). | Aggregate and normalize domain outputs into standardized JSON tool response shapes. |
| Central Tool Schemas Registry | **MISSING** | No dedicated table or service providing formal JSON Schema Draft-07 definitions for Case, Surgeon, Payer, CPT, OR, RCM, and Scenarios. | Implement `ai_tool_schemas` and `ai_query_catalogs` tables and service layer. |
| What-If Simulation Engine | **MISSING** | No formal scenario simulation persistence or interactive mathematical modeling for OR block reallocation and supply construct standardization. | Implement `ai_scenario_simulations` table, deterministic math engine, and interactive UI simulator. |
| AI Tool Definitions UI | **MISSING** | No dedicated console allowing facility administrators and clinical leaders to inspect tool contracts, execute parameterized queries, and run what-if simulations. | Implement `AIToolDefinitionsView.jsx` with 5-card ribbon, category explorer, schema inspector, and live simulator. |

---

## Target State
1. **Tool Schema Registry & Parameter Validation**:
   - Each tool defines a strict JSON Schema Draft-07 contract specifying input types, enums, defaults, and constraints.
   - Input payloads are validated before execution; malformed requests are rejected with structured validation errors (`VALIDATION_ERROR`).
2. **Deterministic Domain Tool Handlers**:
   - **Case Queries**: Itemized surgical ledger reconciling gross charges, contractual allowances, collections, direct costs, and net contribution margin. Deep cost breakdown across implants, disposables, drugs, and staffed room time.
   - **Surgeon Queries**: Multi-dimensional scorecards (volume, case duration variance, FCOTS %, block utilization %, contribution margin per OR hour) and block schedule inventory.
   - **Payer Queries**: Realized yield %, contract allowable vs. cash collected, average DSO days, denial rate %, and underpayment leakage radar.
   - **CPT Queries**: Procedure-level economics (margin per minute, implant cost percentage, reimbursement yield) and skin-to-skin duration distribution.
   - **OR Operational Queries**: Staffed hours telemetry, prime-time utilization %, first-case on-time starts, idle minutes, labor cost leakage, and turnover velocity benchmarks.
   - **RCM Queries**: CARC/RARC denial Pareto analysis, at-risk cash, appeal success rates, and pre-bill clean claim scrubber audit findings.
3. **What-If Scenario Simulation Engine**:
   - Deterministic simulations compute projected financial and operational deltas against actual facility baselines.
   - Simulations can be saved to `ai_scenario_simulations` with baseline snapshots, projected metrics, and cryptographic SHA-256 provenance.
   - Block reallocation proposals or construct standardization policies can be promoted to Phase C2 `ai_proposed_actions` for dual-key HITL approval.
4. **Tenancy & Security**:
   - Every execution requires `facility_id` context. Cross-facility data queries are strictly blocked at database RLS and service layers.
5. **Zero Prohibited Accent Tokens**:
   - Built with the Maestro Clinical palette (Emerald, Amber, Crimson, Sky, Slate, Neutral); zero purple/violet tokens.

---

## Data Model / Schema
PostgreSQL Migration: `101_ai_tool_definitions_and_scenarios.sql`

```sql
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
    risk_tier VARCHAR(32) NOT NULL DEFAULT 'READ_ONLY_ANALYTICS',
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

-- 3. AI Query Catalogs (Pre-built prompts mapped to deterministic tools)
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
```

---

## Business Rules & Deterministic Calculations

### 1. Case Financial Ledger & Cost Composition
- **Total Charges**: Gross billed charges $\sum \text{Charge}_i$
- **Contractual Allowance**: Negotiated fee schedule reduction
- **Expected Reimbursement**: $\text{Total Charges} - \text{Contractual Allowance}$
- **Net Contribution Margin**: $\text{Actual Collections} - \text{Direct Clinical Costs}$
- **Direct Costs**: $\text{Implant Cost} + \text{Supply Cost} + \text{Pharmacy Cost} + (\text{OR Duration Minutes} \times \$11.50/\text{min})$
- **Contribution Margin %**: $(\text{Net Contribution Margin} / \text{Actual Collections}) \times 100$

### 2. Surgeon Scorecard & Block Telemetry
- **FCOTS % (First-Case On-Time Starts)**: $(\text{First Cases Starting } \le 5\text{m Delay} / \text{Total First Cases}) \times 100$
- **Block Utilization %**: $(\text{In-Room Utilized Block Hours} / \text{Allocated Block Hours}) \times 100$
- **Net Contribution Margin per OR Hour**: $\text{Total Net Margin} / (\text{Total OR Minutes} / 60)$
- **Auto-Release Risk**:
  - `HIGH`: Block utilization $< 65\%$ AND average release notice $< 3$ days.
  - `MODERATE`: Block utilization between $65.0\%$ and $74.9\%$.
  - `LOW`: Block utilization $\ge 75.0\%$.

### 3. Payer Realization & Underpayment
- **Realization Yield %**: $(\text{Actual Cash Collected} / \text{Contract Allowable Amount}) \times 100$
- **Underpayment Variance**: $\text{Fee Schedule Expectation} - \text{Actual Adjudicated Payment}$
- **Clean Claim Rate %**: $(\text{First-Pass Clean Claims} / \text{Total Submitted Claims}) \times 100$
- **Average DSO**: $\text{Mean Elapsed Days between Claim Submission and Payment Posting}$

### 4. CPT Economics & Skin-to-Skin Variance
- **Procedural Margin per Minute**: $\text{Contribution Margin} / \text{Mean Skin-to-Skin Duration (Minutes)}$
- **Duration Variance**: $\text{Actual Mean Duration} - \text{Template Scheduled Duration}$
- **Implant Cost Ratio %**: $(\text{Implant Expense} / \text{Total Direct Case Costs}) \times 100$

### 5. OR Utilization & Turnover Telemetry
- **Prime-Time Utilization %**: $(\text{In-Room Case Minutes between 07:00 and 15:30} / \text{Staffed Operating Minutes}) \times 100$
- **Staffed Idle Labor Leakage ($)**: $(\text{Staffed Idle Minutes} / 60) \times \$650.00/\text{hr}$
- **Turnover Benchmark Compliance**:
  - Same-Surgeon Benchmark: $20 \text{ minutes}$
  - Cross-Surgeon Benchmark: $35 \text{ minutes}$
  - `PROLONGED_TURNOVER`: Actual turnover $> \text{Benchmark} + 10 \text{ minutes}$

### 6. RCM & Pre-Bill Clean Claim Scrubber
- **Denial Rate %**: $(\text{Denied Claims Count} / \text{Total Claims Count}) \times 100$
- **Scrubber Defects**:
  - `AUTH_MISSING`: Prior authorization missing or invalid.
  - `NCCI_UNBUNDLING`: Mutually exclusive CPT pair without valid modifier.
  - `MODIFIER_MISSING`: Multi-procedure without modifier 51 or 59.
  - `LCD_DIAGNOSIS_MISMATCH`: ICD-10 diagnosis code does not support CPT under CMS LCD.

### 7. What-If Simulation Engine Formulas

#### A. OR Block Reallocation Simulation
$$\Delta \text{Hours} = \text{Reallocated Hours/Week} \times \text{Duration Weeks}$$
$$\text{Source Lost Margin} = \Delta \text{Hours} \times \left(\frac{\text{Source Util \%}}{100}\right) \times \text{Source Margin/Hr}$$
$$\text{Target Gained Margin} = \Delta \text{Hours} \times \left(\frac{\text{Target Util \%}}{100}\right) \times \text{Target Margin/Hr}$$
$$\text{Net Margin Lift (\$) } = \text{Target Gained Margin} - \text{Source Lost Margin}$$
$$\Delta \text{Cases} = \text{Round}\left(\frac{\Delta \text{Hours} \times \frac{\text{Target Util \%}}{100}}{\text{Target Avg Case Hrs}}\right) - \text{Round}\left(\frac{\Delta \text{Hours} \times \frac{\text{Source Util \%}}{100}}{\text{Source Avg Case Hrs}}\right)$$
$$\Delta \text{Facility Utilization \%} = \frac{(\text{Target Util \%} - \text{Source Util \%}) \times \Delta \text{Hours}}{\text{Facility Total Staffed Hours}} \times 100$$

#### B. Construct Standardization Simulation
$$\text{Baseline Annual Spend} = \text{Annual Volume} \times \text{Current Blended Unit Cost}$$
$$\text{Compliant Volume} = \text{Round}\left(\text{Annual Volume} \times \frac{\text{Compliance Rate \%}}{100}\right)$$
$$\text{Non-Compliant Volume} = \text{Annual Volume} - \text{Compliant Volume}$$
$$\text{Projected Spend} = (\text{Compliant Volume} \times \text{Standardized Unit Cost}) + (\text{Non-Compliant Volume} \times \text{Current Blended Unit Cost})$$
$$\text{Gross Direct Savings} = \text{Baseline Annual Spend} - \text{Projected Spend}$$
$$\text{Projected Vendor Rebate} = (\text{Compliant Volume} \times \text{Standardized Unit Cost}) \times \text{Rebate Tier \%}$$
$$\text{Net Annualized Savings (\$) } = \text{Gross Direct Savings} + \text{Projected Vendor Rebate}$$
$$\text{Savings \%} = \left(\frac{\text{Net Annualized Savings}}{\text{Baseline Annual Spend}}\right) \times 100$$

---

## Permissions & Security
All tool schemas and simulation routines enforce canonical role and AI permission gates:

| Tool Category | Tools | Required Permission | Allowed Canonical Roles | Risk Tier |
| :--- | :--- | :--- | :--- | :--- |
| **Case Queries** | `case_financial_ledger_query`, `case_cost_composition` | `ai:view_financial`, `ai:tool_execute` | `billing_manager`, `analyst`, `facility_admin`, `super_admin` | `READ_ONLY_ANALYTICS` |
| **Surgeon Queries** | `surgeon_scorecard_query`, `surgeon_block_schedule_query` | `ai:view_clinical`, `ai:tool_execute` | `surgeon`, `clinical_director`, `clinical_manager`, `facility_admin`, `super_admin` | `READ_ONLY_ANALYTICS` |
| **Payer Queries** | `payer_contract_performance_query`, `payer_realization_rate` | `ai:view_financial`, `ai:tool_execute` | `billing_manager`, `biller`, `analyst`, `facility_admin`, `super_admin` | `READ_ONLY_ANALYTICS` |
| **CPT Queries** | `cpt_economics_query`, `cpt_duration_variance` | `ai:view_clinical`, `ai:tool_execute` | `surgeon`, `clinical_director`, `billing_manager`, `analyst`, `facility_admin` | `READ_ONLY_ANALYTICS` |
| **OR Operational Queries** | `or_room_utilization_query`, `room_turnover_velocity` | `ai:view_clinical`, `ai:tool_execute` | `clinical_director`, `clinical_manager`, `facility_admin`, `super_admin` | `READ_ONLY_ANALYTICS` |
| **RCM Queries** | `denials_carc_frequency`, `clean_claim_rate_scrubber` | `ai:view_financial`, `ai:tool_execute` | `billing_manager`, `biller`, `coder`, `analyst`, `facility_admin` | `READ_ONLY_ANALYTICS` |
| **Scenario Simulations** | `or_block_reallocation_simulation`, `construct_standardization_scenario` | `ai:propose_action`, `ai:tool_execute` | `clinical_director`, `billing_manager`, `facility_admin`, `super_admin` | `READ_ONLY_ANALYTICS` (Simulation) / `PROPOSED_MUTATION` (Save/Promote) |

---

## API & Service Requirements

### Service Layer: `src/services/aiToolDefinitionsService.js`
1. `validateToolCall(toolId, parameters)`:
   - Validates input arguments against registered JSON Schema.
   - Returns `{ valid: boolean, errors?: string[] }`.
2. Domain Execution Handlers:
   - `executeCaseFinancialLedger(params, facilityId)`
   - `executeCaseCostComposition(params, facilityId)`
   - `executeSurgeonScorecard(params, facilityId)`
   - `executeSurgeonBlockSchedule(params, facilityId)`
   - `executePayerContractPerformance(params, facilityId)`
   - `executePayerRealizationRate(params, facilityId)`
   - `executeCptEconomics(params, facilityId)`
   - `executeCptDurationVariance(params, facilityId)`
   - `executeOrRoomUtilization(params, facilityId)`
   - `executeRoomTurnoverVelocity(params, facilityId)`
   - `executeDenialsCarcFrequency(params, facilityId)`
   - `executeCleanClaimRateScrubber(params, facilityId)`
3. Simulation Handlers:
   - `simulateOrBlockReallocation(params, facilityId)`
   - `simulateConstructStandardization(params, facilityId)`
   - `saveScenarioSimulation(scenarioData, facilityId, user)`
4. Telemetry & Summary:
   - `getToolDefinitionsTelemetry(facilityId)`
   - `getToolCatalogByDomain(domain)`

---

## UI / Workflow Requirements
- **Location**: AI Center Sidebar $\rightarrow$ **AI Tool Definitions & Scenarios** (`ai-tool-definitions`).
- **Ribbon KPI Summary (5 Cards)**:
  1. *Total Registered Tool Schemas* (14 contracts)
  2. *Active Query Domains* (7 domains: Case, Surgeon, Payer, CPT, OR, RCM, Scenarios)
  3. *Simulation Engines Active* (2 predictive engines: Block Reallocation, Construct Standardization)
  4. *Schema Contract Health* (100% Validated against Draft-07)
  5. *Avg Deterministic Latency* (14ms server-side compute)
- **Domain Selector Tabs**:
  - Filter tools by domain: `ALL`, `CASE`, `SURGEON`, `PAYER`, `CPT`, `OR`, `RCM`, `SCENARIOS`.
- **Tool Schema Inspector Drawer/Modal**:
  - Interactive JSON schema tree viewer showing parameters, types, required flags, and output contract shape.
- **Interactive Tool Tester & Playground**:
  - Live parameter input controls allowing instantaneous query execution.
  - Tabular and card results viewer with formatted currency, percentages, and Safe Harbor redactions.
- **Interactive What-If Scenario Simulators**:
  - **OR Block Reallocation Simulator**:
    - Sliders and dropdowns for source surgeon, target surgeon, reallocated hours/week, and duration weeks.
    - Real-time calculation of Net Contribution Margin Lift ($), Case Delta, and Staffed Utilization Shift.
  - **Construct Standardization Simulator**:
    - Select construct category, primary vendor, compliance rate %, and annual volume.
    - Real-time calculation of Gross Savings ($), Rebate Capture ($), and Net Annualized ROI.
  - Action button: *Promote to Phase C2 HITL Approval Queue*.

---

## Audit & Provenance
- All scenario simulations and query executions record:
  - `facility_id`, `created_by`, `created_by_role`, `timestamp`.
  - Immutable SHA-256 provenance hash computed from inputs, baseline metrics, and projected impact.
  - Tamper-evident record in `ai_scenario_simulations` and `ai_tool_execution_logs`.

---

## QA / Test Cases
1. **Schema Validation Tests**:
   - Verify every tool schema adheres to JSON Schema Draft-07 syntax.
   - Verify parameter validation catches missing required fields and type mismatches.
2. **Deterministic Calculation Tests**:
   - Case financials: Gross, allowance, net collections, direct costs, margin %.
   - Surgeon scorecard: FCOTS %, block utilization %, auto-release flags.
   - Payer realization: Contract allowable, collected, realization yield %, DSO.
   - CPT economics: Margin per minute, implant ratio, duration variance.
   - OR telemetry: Prime-time utilization, idle labor cost, turnover velocity.
   - RCM: CARC frequency ranking, pre-bill scrubber defect counts.
3. **Simulation Engine Mathematical Rigor**:
   - OR block reallocation: verify marginal revenue calculation, utilization delta, and zero-division guards.
   - Construct standardization: verify rebate tier calculation, supply reduction savings, surgeon compliance model.
4. **Tenancy & RLS Tests**:
   - Enforce facility isolation across simulations and execution logs.
5. **Zero-Purple Design Compliance**:
   - Scan all JSX and CSS files for forbidden purple/violet color tokens.
6. **App Wiring & Lib Facade**:
   - Verify `AIToolDefinitionsView` is accessible via sidebar navigation, registered in `NON_DATE_FILTERED_TABS`, and lib re-exports match.

---

## Dependencies
- Phase C0: [docs/phases/C0_AI_ANALYST_ARCHITECTURE.md](file:///e:/medicalAI/asc-prototype/docs/phases/C0_AI_ANALYST_ARCHITECTURE.md)
- Phase C1: [docs/phases/C1_AI_TOOL_GATEWAY.md](file:///e:/medicalAI/asc-prototype/docs/phases/C1_AI_TOOL_GATEWAY.md)
- Phase C2: [docs/phases/C2_AI_PERMISSIONS.md](file:///e:/medicalAI/asc-prototype/docs/phases/C2_AI_PERMISSIONS.md)
- Modules 10 & 11 Services (`turnoverMetricsService.js`, `cptEconomicsService.js`, `orUtilizationMetricsService.js`, `carcRarcService.js`)

---

## Definition of Done
1. PostgreSQL Migrations `101_ai_tool_definitions_and_scenarios.sql` (UP) and `_down.sql` (DOWN) created and validated.
2. `src/services/aiToolDefinitionsService.js` and `src/lib/aiToolDefinitionsService.js` implemented with 14 tool contracts and 2 simulation engines.
3. `src/components/AIToolDefinitionsView.jsx` and `src/components/AIToolDefinitionsView.css` implemented with zero purple tokens.
4. `src/App.jsx` wired with navigation and route.
5. Automated test suite `tests/ai-tool-definitions.test.js` passing 100%.
6. Production build passes cleanly with zero warnings/errors.
