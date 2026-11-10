# 84 CARC RARC MODEL

## Purpose
Production specification for Claim Adjustment Reason Codes (CARC) and Remittance Advice Remark Codes (RARC) storage, normalization, combinatorial mapping, denial categorization, and automated adjudication interpretation for Ambulatory Surgery Centers (ASCs).

## Scope
- Define production requirements for storing, standardizing, and querying official WEDI/X12 CARC and RARC code registries.
- Establish deterministic combinatorial mapping logic between CARCs, RARCs, and Claim Adjustment Group Codes (`CO`, `PR`, `OA`, `PI`, `CR`).
- Provide automated root-cause denial classification (`AUTHORIZATION_PRECERT`, `MEDICAL_NECESSITY`, `CODING_BILLING`, `TIMELY_FILING`, `ELIGIBILITY`, `DUPLICATE`, `COB`, `CONTRACTUAL_FEE_SCHEDULE`, `PATIENT_COST_SHARE`).
- Provide recovery likelihood probability scoring (0%–100%) and actionable next-step routing (`APPEALABLE`, `CORRECT_AND_RESUBMIT`, `TRANSFER_TO_PATIENT`, `CONTRACTUAL_WRITE_OFF`, `ADMIN_WRITE_OFF`).
- Preserve compatibility with upstream RCM modules: Phase 80 (`claims`, `claim_lines`), Phase 81 (`edi_837_staged_claims`), Phase 82 (`edi_835_claim_payments`), and Phase 83 (`rcm_payment_transactions`).
- Enforce organization/facility tenancy and Role-Based Access Control (RBAC).
- Strictly adhere to Maestro Clinical Design System token governance (zero purple/violet/magenta/indigo/fuchsia tokens).

## Current State
- **Phase 80 (Claims Model & Lifecycle)**: Established canonical claim structure, claim lines, and high-level claim statuses (`054_claims_model.sql`).
- **Phase 81 (837 Claim Ingestion)**: Inbound ANSI X12 837 claim parser and case matcher (`055_edi_837_ingestion.sql`).
- **Phase 82 (835 Remittance Ingestion)**: ERA remittance advice parser capturing CAS claim adjustment segments and basic CARC strings (`056_edi_835_remittance.sql`).
- **Phase 83 (Payments & Adjustments)**: Double-entry cash ledger and payment transactions recording raw `carc_code` text on adjustments (`057_rcm_payments_adjustments.sql`).
- **Phase 84 (CARC RARC Model)**:
  - Repository currently lacks structured CARC and RARC master tables: **MISSING**.
  - Deterministic combinatorial interpretation engine mapping CARC + RARC to root causes and recovery probability: **MISSING**.
  - Interactive CARC/RARC Intelligence Explorer, Code Combination Simulator, and Denial Action Workbench: **MISSING**.

| Component | Classification | Description |
|-----------|----------------|-------------|
| Database Schema (058_carc_rarc_model.sql) | **MISSING** | Master registries, mapping rules, denial interpretation ledger, rollup views, RLS |
| Down Migration (058_carc_rarc_model_down.sql) | **MISSING** | Reversible migration teardown in reverse dependency order |
| Service Layer (carcRarcService.js) | **MISSING** | Master code registries, combinatorial interpretation engine, recovery probability scoring |
| Dual Re-export (src/services/carcRarcService.js) | **MISSING** | Standardized backward-compatible re-export module |
| UI Component (CarcRarcModelView.jsx & CSS) | **MISSING** | Maestro Clinical 4-KPI ribbon, 4-tab workbench, combination simulator, modals |
| App Wiring (src/App.jsx & Sidebar) | **MISSING** | Sidebar navigation, header title/subtitle, tab render block |
| Test Suite (tests/carc-rarc-model.test.js) | **MISSING** | Multi-level automated unit, combinatorial, and integration tests |

## Target State
1. **Official Code Master Registries**:
   - `rcm_carc_master`: Comprehensive registry of Claim Adjustment Reason Codes with group codes, standardized descriptions, recoverable flags, denial flags, and baseline recovery expectations.
   - `rcm_rarc_master`: Comprehensive registry of Remittance Advice Remark Codes with code types (`SUPPLEMENTAL` vs `INFORMATIONAL`), standardized explanations, and billing guidelines.
2. **Deterministic Combinatorial Mapping Rules**:
   - Rules linking `(carc_code, rarc_code)` combinations to standardized root-cause categories:
     - `AUTHORIZATION_PRECERT`: Missing or invalid pre-authorization (e.g. `CO-197` + `N517`).
     - `MEDICAL_NECESSITY`: Service deemed experimental or unproven (e.g. `CO-50` + `N115`).
     - `CODING_BILLING`: Modifier, CPT, or revenue code mismatch (e.g. `CO-16` + `N56`).
     - `TIMELY_FILING`: Exceeded payer claim submission window (e.g. `CO-29` + `N211`).
     - `ELIGIBILITY`: Patient coverage terminated or policy inactive (e.g. `CO-27` + `N30`).
     - `DUPLICATE`: Exact claim or procedure already processed (e.g. `CO-18` + `N522`).
     - `COB`: Coordination of benefits; secondary payer billed before primary (e.g. `CO-22` + `N103`).
     - `CONTRACTUAL_FEE_SCHEDULE`: Allowable contracted discount (e.g. `CO-45` + `N1`).
     - `PATIENT_COST_SHARE`: Deductible, copay, or coinsurance (e.g. `PR-1`, `PR-2`, `PR-3`).
3. **Automated Denial Interpretation & Action Routing**:
   - Every remittance adjustment segment is parsed and assigned:
     - Root-cause category.
     - Recovery probability score (0% to 100%).
     - Recommended action workflow: `APPEALABLE`, `CORRECT_AND_RESUBMIT`, `TRANSFER_TO_PATIENT`, `CONTRACTUAL_WRITE_OFF`, `ADMIN_WRITE_OFF`.
     - Plain-language remediation guidance text for billers.
4. **Interactive CARC/RARC Intelligence Workbench**:
   - Actionable denial queue with one-click workflow triggers.
   - Master CARC and RARC code directories with search and filtering.
   - Interactive Code Combination Simulator for testing any CARC + RARC scenario in real time.

## Data Model / Schema
Required tables in `supabase/migrations/058_carc_rarc_model.sql`:

1. `public.rcm_carc_master`:
   - `id` (UUID, PK)
   - `code` (VARCHAR(16) NOT NULL UNIQUE) -- e.g. '16', '45', '97', '197'
   - `group_code` (VARCHAR(4) NOT NULL CHECK IN ('CO', 'PR', 'OA', 'PI', 'CR'))
   - `short_description` (VARCHAR(200) NOT NULL)
   - `formal_title` (TEXT NOT NULL)
   - `category` (VARCHAR(32) NOT NULL CHECK IN ('CONTRACTUAL', 'PATIENT_SHARE', 'DENIAL', 'COORDINATION_OF_BENEFITS', 'ADMINISTRATIVE'))
   - `is_denial` (BOOLEAN NOT NULL DEFAULT FALSE)
   - `is_recoverable` (BOOLEAN NOT NULL DEFAULT FALSE)
   - `default_action` (VARCHAR(32) NOT NULL CHECK IN ('CONTRACTUAL_WRITE_OFF', 'TRANSFER_TO_PATIENT', 'APPEALABLE', 'CORRECT_AND_RESUBMIT', 'ADMIN_WRITE_OFF'))
   - `recovery_likelihood_pct` (NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (recovery_likelihood_pct BETWEEN 0 AND 100))
   - `effective_from` (DATE NOT NULL DEFAULT '2020-01-01')
   - `effective_to` (DATE)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())

2. `public.rcm_rarc_master`:
   - `id` (UUID, PK)
   - `code` (VARCHAR(16) NOT NULL UNIQUE) -- e.g. 'N1', 'N56', 'N517', 'MA01'
   - `code_type` (VARCHAR(20) NOT NULL CHECK IN ('SUPPLEMENTAL', 'INFORMATIONAL'))
   - `short_description` (VARCHAR(200) NOT NULL)
   - `full_text` (TEXT NOT NULL)
   - `effective_from` (DATE NOT NULL DEFAULT '2020-01-01')
   - `effective_to` (DATE)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())

3. `public.rcm_carc_rarc_mapping_rules`:
   - `id` (UUID, PK)
   - `carc_code` (VARCHAR(16) NOT NULL)
   - `rarc_code` (VARCHAR(16)) -- NULL matches any RARC with this CARC
   - `root_cause_category` (VARCHAR(32) NOT NULL CHECK IN ('AUTHORIZATION_PRECERT', 'MEDICAL_NECESSITY', 'CODING_BILLING', 'TIMELY_FILING', 'ELIGIBILITY', 'DUPLICATE', 'COB', 'CONTRACTUAL_FEE_SCHEDULE', 'PATIENT_COST_SHARE', 'ADMINISTRATIVE'))
   - `action_workflow` (VARCHAR(32) NOT NULL CHECK IN ('APPEALABLE', 'CORRECT_AND_RESUBMIT', 'TRANSFER_TO_PATIENT', 'CONTRACTUAL_WRITE_OFF', 'ADMIN_WRITE_OFF'))
   - `recovery_probability_pct` (NUMERIC(5,2) NOT NULL CHECK (recovery_probability_pct BETWEEN 0 AND 100))
   - `priority_level` (VARCHAR(16) NOT NULL DEFAULT 'MEDIUM' CHECK IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW'))
   - `guidance_text` (TEXT NOT NULL)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())
   - CONSTRAINT `uq_carc_rarc_rule` UNIQUE (carc_code, rarc_code)

4. `public.rcm_claim_denial_interpretations`:
   - `id` (UUID, PK)
   - `facility_id` (UUID REFERENCES public.facilities NOT NULL)
   - `claim_id` (UUID REFERENCES public.claims ON DELETE CASCADE NOT NULL)
   - `claim_line_id` (UUID REFERENCES public.claim_lines ON DELETE SET NULL)
   - `remittance_id` (UUID REFERENCES public.rcm_payment_transactions ON DELETE SET NULL)
   - `group_code` (VARCHAR(4) NOT NULL CHECK IN ('CO', 'PR', 'OA', 'PI', 'CR'))
   - `carc_code` (VARCHAR(16) NOT NULL)
   - `rarc_code` (VARCHAR(16))
   - `adjustment_amount` (NUMERIC(12,2) NOT NULL CHECK (adjustment_amount >= 0))
   - `root_cause_category` (VARCHAR(32) NOT NULL)
   - `action_workflow` (VARCHAR(32) NOT NULL)
   - `recovery_score` (NUMERIC(5,2) NOT NULL)
   - `status` (VARCHAR(32) NOT NULL DEFAULT 'PENDING_ACTION' CHECK IN ('PENDING_ACTION', 'APPEAL_INITIATED', 'REBILLED', 'WRITTEN_OFF', 'PATIENT_BILLED', 'RESOLVED'))
   - `notes` (TEXT)
   - `assigned_to` (UUID REFERENCES auth.users)
   - `created_at` (TIMESTAMPTZ DEFAULT NOW())
   - `updated_at` (TIMESTAMPTZ DEFAULT NOW())

5. Rollup Views:
   - `public.vw_rcm_carc_frequency_analysis`: Aggregated occurrences, total dollars, and recovery yield per CARC code.
   - `public.vw_rcm_actionable_denial_queue`: Real-time queue of appealable and rebillable denials with claim and patient context.

## Business Rules
1. **Deterministic Group Code Meaning**:
   - `CO` (Contractual Obligation): Mandatory contractual write-off. Cannot bill patient under federal or state balance billing laws unless signed ABN/financial disclosure exists.
   - `PR` (Patient Responsibility): Allowable patient portion (deductible, coinsurance, copay). Permitted to transfer to patient statement.
   - `OA` (Other Adjustment): Secondary coordination of benefits or third-party liability offsets.
   - `PI` (Payer Initiated Reduction): Quality withholdings or capitation withholdings.
2. **Combinatorial Resolution Precedence**:
   - When interpreting a claim adjustment, an exact `(carc_code, rarc_code)` rule match takes absolute precedence over a generic `(carc_code, NULL)` rule.
3. **Recovery Likelihood Scoring**:
   - Timely filing (`CO-29`) without proof of original electronic submission has a recovery score of 0.00%.
   - Simple demographic or billing error (`CO-16` + `N56`) has a recovery score of 95.00%.
   - Missing pre-authorization (`CO-197`) with documented retro-authorization protocol has a recovery score of 65.00%.
   - Medical necessity denial (`CO-50`) with operative note evidence has a recovery score of 50.00%.
4. **Prohibited Behaviors**:
   - Prohibit auto-writing off appealable denials above $1,000.00 without biller review.
   - Prohibit transferring `CO` adjustments to patient responsibility without explicit statutory justification.

## Permissions / Security
- `rcm.view_carc_rarc`: Viewer, Analyst, Biller, CFO, Super Admin.
- `rcm.execute_denial_action`: Biller, Revenue Cycle Specialist, CFO, Super Admin.
- `rcm.manage_mapping_rules`: Revenue Cycle Specialist, CFO, Super Admin.
- `rcm.export_denial_scorecard`: Analyst, Biller, CFO, Super Admin.

## API / Service Requirements
- `carcRarcService.interpretAdjustment(groupCode, carcCode, rarcCode, amount)`: Deterministic interpretation engine returning root cause, recovery score, action workflow, and billing guidance.
- `carcRarcService.getCarcCatalog(filters)`: Retrieves filtered master Claim Adjustment Reason Codes.
- `carcRarcService.getRarcCatalog(filters)`: Retrieves filtered master Remittance Advice Remark Codes.
- `carcRarcService.getDenialActionQueue(facilityId)`: Retrieves actionable denial items with claim and patient details.
- `carcRarcService.calculateCarcKpis(interpretations)`: Computes 4-KPI metrics for executive dashboard.
- `carcRarcService.simulateCombination(carcCode, rarcCode)`: Evaluates hypothetical code pairings for real-time validation.

## UI / Workflow Requirements
- **Executive KPI Banner (4 Cards)**:
  1. Total Denial Exposure ($) (At-risk uncollected claim dollars)
  2. Appealable Opportunity ($) (High-likelihood recoverable denials)
  3. Clean Adjustment Share (%) (CO-45 contractual fee reductions)
  4. Top Root Cause Category (Most prevalent denial reason)
- **Top Actions**:
  - Code Combination Simulator (Interactive modal/panel to test any CARC + RARC)
  - Export Denial Analysis CSV
- **4 Tabbed Workbenches**:
  1. **Actionable Denial Queue**: Priority-ordered claims requiring clinical appeal, rebilling, or patient transfer.
  2. **CARC Master Registry**: Searchable reference of all official reason codes with group tags and default actions.
  3. **RARC Master Registry**: Searchable reference of supplemental and informational remark codes.
  4. **Code Combination Simulator**: Live interactive tool providing real-time interpretation for any selected code pair.

## Audit / Provenance
- All denial actions (`APPEAL_INITIATED`, `REBILLED`, `WRITTEN_OFF`, `PATIENT_BILLED`) log the acting user, timestamp, prior state, new state, and associated claim ID.

## QA / Test Cases
- Unit tests: CARC and RARC registries contain required official codes and metadata.
- Combinatorial tests: `interpretAdjustment` produces exact deterministic root causes and recovery probability percentages.
- Database tests: Migration 058 SQL syntax, table constraints, views, and rollback drops.
- Design System audit: Strictly zero purple/violet/indigo/magenta/fuchsia tokens in JSX and CSS.
- Responsive table audit: Enforce horizontal scrolling with `min-width: 1100px;` and `table-layout: fixed;`.

## Acceptance Criteria
- Build passes (`npm run build`).
- All 16+ Phase 84 automated tests pass (`node --test tests/carc-rarc-model.test.js`).
- No mock/placeholder values are presented as production truth.
- Zero banned purple tokens in UI components and stylesheets.
- P0/P1 issues block release.

## Dependencies
- Phase 80: `claims`, `claim_lines`
- Phase 81: `edi_837_staged_claims`
- Phase 82: `edi_835_claim_payments`
- Phase 83: `rcm_payment_transactions`

## Definition of Done
A feature is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

## Implementation Notes
- Migration `058_carc_rarc_model.sql` creates tables `rcm_carc_master`, `rcm_rarc_master`, `rcm_carc_rarc_mapping_rules`, `rcm_claim_denial_interpretations`, and views `vw_rcm_carc_frequency_analysis`, `vw_rcm_actionable_denial_queue`.
- Reversible rollback created in `058_carc_rarc_model_down.sql`.
- Core services implemented in `src/lib/carcRarcService.js` and re-exported in `src/services/carcRarcService.js`.
- UI view implemented in `src/components/CarcRarcModelView.jsx` and styled in `src/components/CarcRarcModelView.css`.
- Navigation and routing integrated into `src/App.jsx`.
- Comprehensive test suite created in `tests/carc-rarc-model.test.js`.
