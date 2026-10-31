# 67 PAYER CONTRACT RATE RULES

## Purpose
Deterministic, auditable commercial rate rules engine supporting Percent-of-Medicare, CPT contracted fee schedules, bundled case rates, surgical implant carve-outs, and catastrophic stop-loss exceptions.

## Scope
- Define production requirements for commercial rate resolution and encounter adjudication.
- Preserve backward compatibility with upstream Medicare base rate engines (Phases 60–64), Payer Master (Phase 65), and Payer Contract Model (Phase 66).
- Implement deterministic, server-side financial calculation logic with mathematical precision.
- Enforce strict organization/facility tenancy, multi-tenant RLS, and immutable calculation snapshots.

## Current State
Audited current repository and database schema. Documented in detail in `docs/phases/PHASE_67_CURRENT_STATE_AUDIT.md`:
- `public.cms_asc_addenda` / `medicare_wage_indices`: **KEEP** (Authoritative CMS benchmark sources from Phases 60–62).
- `public.fn_resolve_medicare_base_rate`: **KEEP** (Authoritative baseline provider for `PERCENT_OF_MEDICARE`).
- `public.multiple_procedure_rule_sets`: **KEEP** (Cascading rules from Phase 64).
- `public.payer_contracts` / `payer_contract_versions`: **KEEP** (Phase 66 contract agreements and version locks).
- `src/services/payerContractService.js` (line 425): **REFACTOR** (Eradicate hardcoded `0.65` discount fallback).
- `public.payer_fee_schedules`: **REPLACE** (Legacy flat table from Migration 002 replaced by normalized exhibit structure).
- `public.payer_contract_rate_schedules`: **MISSING** (Exhibit headers for fee schedules and packages).
- `public.payer_contract_cpt_rates`: **MISSING** (Line-item negotiated CPT rates and multipliers).
- `public.payer_contract_case_rates` & `inclusions`: **MISSING** (Bundled procedure packages).
- `public.payer_contract_carve_outs`: **MISSING** (Implant invoice + markup rules).
- `public.payer_contract_rate_exceptions`: **MISSING** (Stop-loss and minimum allowable triggers).
- `public.payer_contract_rate_calculations` & `lines`: **MISSING** (Immutable historical calculation snapshot ledger).

## Target State
Production-ready commercial rate rules engine featuring:
1. **Five Supported Pricing Methodologies:**
   - `PERCENT_OF_MEDICARE`: Dynamic DOS or frozen CMS benchmark with local wage adjustment or national unadjusted mode.
   - `COMMERCIAL_FEE_SCHEDULE`: Exact negotiated CPT rates with specialty defaults and modifier adjustments.
   - `PERCENT_OF_BILLED_CHARGES`: Dynamic discount applied to facility chargemaster gross charges.
   - `CASE_RATE`: Bundled primary procedure packages covering routine supplies and facility fees.
   - `IMPLANT_CARVE_OUT`: Invoice cost pass-through or cost-plus markup for qualifying high-cost hardware.
2. **Deterministic 10-Step Resolution Sequence:**
   - Contract Version Resolution $\rightarrow$ Stop-Loss Check $\rightarrow$ Case Rate Packaging $\rightarrow$ Carve-Out Evaluation $\rightarrow$ CPT Pricing $\rightarrow$ J8 Device Offset Deduction $\rightarrow$ Modifier Adjustments $\rightarrow$ MPPR Cascade $\rightarrow$ Minimum Floor Check $\rightarrow$ Immutable Snapshot Commit.
3. **Double-Dipping Device Protection:**
   - Automatically deducts the embedded J8 device offset from the Medicare baseline before applying contract multipliers when implants are carved out separately.
4. **Permanent Audit Snapshots:**
   - Every encounter calculation writes an immutable snapshot with a cryptographic SHA-256 fingerprint.

## Data Model / Schema
Documented in detail in `docs/phases/PHASE_67_RATE_DATA_DICTIONARY.md`:
- `public.payer_contract_rate_schedules`
- `public.payer_contract_cpt_rates`
- `public.payer_contract_case_rates`
- `public.payer_contract_case_rate_inclusions`
- `public.payer_contract_carve_outs`
- `public.payer_contract_rate_exceptions`
- `public.payer_contract_rate_calculations`
- `public.payer_contract_rate_calculation_lines`
- `public.payer_contract_rate_import_batches`
- `public.payer_contract_rate_import_staging`

## Business Rules
Documented in detail in `docs/phases/PHASE_67_REIMBURSEMENT_METHODOLOGY_MATRIX.md` and `PHASE_67_EXCEPTION_AND_CARVEOUT_SPEC.md`:
- Currency calculations evaluated as `NUMERIC(12, 2)` rounded half-up; percentages as `NUMERIC(6, 4)`. Floating point arithmetic is prohibited.
- Bilateral procedures (Modifier 50) reimbursed at 150.00% standard (or 200.00% if contract exception specifies).
- Discontinued procedures: 50.00% for Modifier 73 (pre-anesthesia); 100.00% for Modifier 74 (post-anesthesia).
- Fail-closed evaluation: Uncontracted encounters emit `UNCONTRACTED_COMMERCIAL_ENCOUNTER`. Silent fallback to Medicare or gross charges is prohibited.
- Stop-loss provisions trigger when total gross charges exceed threshold, superseding line fee schedules with an agreed charge percentage.

## Permissions / Security
Documented in detail in `docs/phases/PHASE_67_SECURITY_AND_RBAC_MATRIX.md`:
- 14 fine-grained permissions: `payer.rate.view`, `payer.rate.history.view`, `payer.rate.create`, `payer.rate.edit`, `payer.rate.delete`, `payer.rate.import`, `payer.rate.export`, `payer.rate.caserate.manage`, `payer.rate.carveout.manage`, `payer.rate.exception.manage`, `payer.rate.calculate`, `payer.rate.override`, `payer.rate.approve`, `payer.rate.audit`.
- Multi-tenant RLS policies using `public.is_facility_accessible(facility_id)`. Zero direct queries to `public.user_roles`.
- Immutable calculation records: `UPDATE` and `DELETE` actions are permanently blocked.

## API / Service Requirements
Documented in detail in `docs/phases/PHASE_67_API_AND_SERVICE_DESIGN.md`:
- Authoritative PostgreSQL RPCs:
  - `fn_resolve_contract_rate()`
  - `fn_calculate_commercial_reimbursement()`
  - `fn_stage_rate_schedule_import()`
  - `fn_commit_rate_schedule_version()`
- TypeScript Client Service: `payerRateService.ts` wrapping RPCs with client-side dry-run capabilities.

## UI / Workflow Requirements
- **Rate Exhibits Manager:** Tabbed view within Contract Details displaying Fee Schedules, Case Rates, Carve-Outs, and Exceptions.
- **Bulk CSV Importer:** Pre-commit validation modal for ingesting 3,000+ line CPT fee schedules.
- **Adjudication Simulator:** Live calculator allowing contracting analysts to model surgical cases against draft contracts.
- **Design System Compliance:** Crisp Slate, Emerald, Amber, Rose; zero `#7c3aed`, `#8b5cf6`, or purple accents.

## Audit / Provenance
- Calculation snapshots record user, timestamp, client IP, source parameters, intermediate mathematical traces, and SHA-256 integrity hash.
- Triggers prevent any modification to rate exhibits attached to `APPROVED` or `ACTIVE` contract versions.

## QA / Test Cases
Documented in detail in `docs/phases/PHASE_67_CALCULATION_EXAMPLES.md`:
- Case Study 1: Rotator cuff repair + J8 tenodesis + implant carve-out (\$13,536.04 verified).
- Case Study 2: Knee arthroscopy with 50% MPPR secondary cascade (\$4,100.00 verified).
- Case Study 3: Cataract case rate with Toric IOL upgrade (\$2,250.00 payer + \$1,000.00 patient verified).
- Case Study 4: Multi-level lumbar fusion catastrophic stop-loss trigger (\$60,320.00 settlement verified).
- Case Study 5: Bilateral carpal tunnel release with 200% exception (\$3,200.00 allowable verified).

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint passes (`npm run lint`).
- Unit and integration tests pass (all 5 mathematical case studies exact to \$0.01).
- No mock or placeholder rates presented as production truth.
- Zero client-side financial calculation formulas.
- Immutable calculation ledger verified.
- Tenant isolation verified across facilities.

## Dependencies
- Phase 60: Medicare ASC Base Rate Engine (Verified).
- Phase 61: CMS Payment Indicators (Verified).
- Phase 62: Geographic Wage Adjustment (Verified).
- Phase 63: Device-Intensive Payment Rules (Verified).
- Phase 64: Multiple Procedure Payment Rules (Verified).
- Phase 65: Payer Master (Verified & Deployed).
- Phase 66: Payer Contract Model (Verified & Deployed).

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

## Implementation Notes
- Proposed migration: `043_payer_contract_rate_rules.sql` (Planning Reference Only).
- Read-only audit and specification complete. No database mutations or deployments performed during audit phase.

