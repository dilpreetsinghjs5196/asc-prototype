# 68 EXPECTED REIMBURSEMENT ENGINE

## Purpose
Deterministic expected reimbursement calculation, multi-contract adjudication, line-level trace explanation, patient responsibility partitioning, and immutable financial ledger snapshots for ASC surgical encounters.

## Scope
- Define production requirements for encounter pricing across commercial payer contracts, Medicare baselines, fee schedules, case rates, and implant carve-outs.
- Preserve backward compatibility with upstream Medicare ASC Base Rate engines (Phases 60–64), Payer Master (Phase 65), Payer Contract Model (Phase 66), and Payer Contract Rate Methodologies (Phase 67).
- Enforce strict mathematical separation between:
  1. Gross Billed Charges
  2. Medicare ASC Baseline Reimbursement
  3. Contractual Expected Reimbursement
  4. Estimated Payer Reimbursement
  5. Actual Adjudicated Reimbursement
  6. Actual Remittance / Payment
  7. Patient Responsibility
  8. Facility Acquisition Cost
  9. Expected Facility Contribution / Margin
- Eradicate silent fallback to gross charges or arbitrary percentages.
- Enforce strict organization/facility tenancy, multi-tenant RLS, and immutable calculation snapshots.

---

## Current State
Audited current repository and database schema. Documented in detail in `docs/phases/68_CURRENT_STATE_AUDIT.md`:
- `public.cms_asc_addenda` / `fn_resolve_medicare_base_rate`: **KEEP** (Authoritative statutory CMS benchmark sources from Phases 60–62).
- `public.cms_device_intensive_procedures`: **KEEP** (Authoritative statutory J8 device offset source from Phase 63).
- `public.multiple_procedure_rule_sets`: **KEEP** (Standardized MPPR ranking & multipliers from Phase 64).
- `public.payer_master` / `payer_plans`: **KEEP** (Normalized enterprise payer catalog from Phase 65).
- `public.payer_contracts` / `payer_contract_versions`: **KEEP** (Contract agreements, scopes, and immutable version locks from Phase 66).
- `public.payer_contract_rate_schedules`, `cpt_rates`, `case_rates`, `carve_outs`: **KEEP** (Normalized exhibits from Phase 67).
- `public.calculate_surgery_financials()` (from Migration 022): **REPLACE** (Critical financial defect: falls back to gross chargemaster fees via `COALESCE(contracted, line_expected, baseline_charge)`).
- `public.payer_fee_schedules` (from Migration 002): **REPLACE** (Legacy flat unversioned table).
- `public.fn_resolve_cpt_pricing()` (from Migration 022): **REPLACE** (Outdated 3-tier cascade applying arbitrary 3.5 multiplier).
- `public.claims` & `claim_lines` (from Migration 024): **REFACTOR** (Link claim generation directly to immutable calculation snapshot ID).
- `public.surgery_financial_snapshots` (from Migration 003): **REPLACE** (Mutable single-row summary lacking line items and cryptographic audit trails).
- `Expected Reimbursement Explanation Engine`: **MISSING** (No server-side calculation trace generator).
- `Patient Responsibility Estimator`: **MISSING** (No copay, coinsurance, or deductible deduction).
- `Recalculation Diff & Version Lineage`: **MISSING** (No versioned comparison between sequential calculation runs).

---

## Target State
Production-ready Expected Reimbursement Engine featuring:
1. **Authoritative Server-Side Adjudication:**
   - Single calculation pipeline (`public.fn_calculate_expected_reimbursement()`) handling Fixed Fee Schedules, % of Medicare, % of Billed Charges, Bundled Case Rates, and Implant Carve-Outs.
2. **Ten-Step Adjudication Cascade:**
   - Context Resolution $\rightarrow$ Contract Version Lock $\rightarrow$ Catastrophic Stop-Loss Check $\rightarrow$ Case Rate Packaging $\rightarrow$ Implant Carve-Out Evaluation $\rightarrow$ CPT Pricing Resolution $\rightarrow$ J8 Device Offset Protection $\rightarrow$ Modifier Adjustments (50, 73, 74) $\rightarrow$ MPPR Cascade $\rightarrow$ Patient Responsibility & Contribution Margin Partitioning.
3. **Structured Explanation Graph:**
   - Line-by-line machine- and human-readable trace detailing every intermediate mathematical step and formula applied.
4. **Permanent Cryptographic Ledger:**
   - Immutable snapshot tables (`public.reimbursement_calculations`, `public.reimbursement_calculation_lines`) protected by database triggers blocking `UPDATE` and `DELETE`, stamped with SHA-256 integrity hashes.
5. **Patient Responsibility Separation:**
   - Partitions Contract Total Allowable into Estimated Payer Reimbursement and Estimated Patient Responsibility (copay, deductible, coinsurance, non-covered elective upgrades).

---

## Data Model / Schema
Documented in detail in `docs/phases/68_DATA_MODEL_AND_MIGRATION_PLAN.md` (Proposed Migration 044 scope - design only):
- `public.reimbursement_calculations`: Master header tracking surgery encounter, calculation sequence number, status, gross charges, allowable, patient responsibility, payer reimbursement, facility direct cost, contribution margin, contract version, and SHA-256 hash.
- `public.reimbursement_calculation_lines`: Itemized line detail for each submitted procedure and billable implant, tracking units, gross charge, methodology, base benchmark, modifier factor, MPPR rank & reduction, device offset deduction, line allowable, and calculation trace.
- `public.reimbursement_calculation_adjustments`: Granular log of all applied adjustments (Modifier 50/73/74, MPPR reductions, J8 offsets, packaging, stop-loss).

---

## Business Rules
Documented in detail in `docs/phases/68_CALCULATION_RULES_AND_EXAMPLES.md`:
- Currency amounts evaluated strictly as `NUMERIC(12, 2)` rounded half-up; percentages as `NUMERIC(6, 4)`. Floating point arithmetic is prohibited.
- Bilateral procedures (Modifier 50) reimbursed at 150.00% standard (or 200.00% if contract exception specifies). Subsequent units (>1) paid at 100%.
- Discontinued procedures: 50.00% for Modifier 73 (pre-anesthesia); 100.00% for Modifier 74 (post-anesthesia).
- Fail-closed evaluation: Uncontracted encounters emit `CONTRACT_NOT_FOUND` or `UNCONTRACTED_ERROR`. Silent fallback to Medicare or gross charges is prohibited.
- Stop-loss provisions trigger when total gross billed charges exceed threshold, superseding line fee schedules with an agreed charge percentage across the case.
- J8 Device Offset Protection: When an implant is carved out separately, deduct the statutory CMS device offset from the Medicare baseline before applying contract multiplier to prevent paying for the device twice.

---

## Permissions / Security
Documented in detail in `docs/phases/68_SECURITY_AND_RBAC_MATRIX.md`:
- 8 fine-grained permissions: `reimbursement.calculation.view`, `reimbursement.explanation.view`, `reimbursement.calculation.execute`, `reimbursement.calculation.recalculate`, `reimbursement.calculation.approve`, `reimbursement.snapshot.view`, `reimbursement.report.export`, `reimbursement.config.manage`.
- Multi-facility tenancy enforced via `public.is_facility_accessible(facility_id)`.
- Immutability: DCL revokes `UPDATE` and `DELETE` on calculation tables. Database triggers abort any mutation attempts.
- AI Analyst Sandboxing: AI Assistant can read structured calculation traces, but is strictly prohibited from generating independent rates or hallucinating missing contract percentages.

---

## API / Service Requirements
Documented in detail in `docs/phases/68_API_AND_SERVICE_CONTRACTS.md`:
- Authoritative PostgreSQL RPCs:
  - `public.fn_calculate_expected_reimbursement()`
  - `public.fn_get_reimbursement_explanation()`
  - `public.fn_verify_reimbursement_calculation_integrity()`
- Client Service: `reimbursementService.js` providing calculate, get latest, get history, and recalculate methods.

---

## UI / Workflow Requirements
Documented in detail in `docs/phases/68_UI_WORKFLOW_SPECIFICATION.md`:
- **Reimbursement Inspector Modal:** Detailed modal featuring 6 summary KPI cards, status badge, line-item table, and expandable mathematical trace drawers.
- **Recalculation Modal:** Requires mandatory documented reason (e.g. `POST_OP_CPT_RECODING`) and creates the next version sequence number.
- **Historical Version Diff Viewer:** Side-by-side comparison of input changes and financial variances between calculation runs.
- **Maestro Design System Compliance:** Slate, Emerald, Amber, Rose; strictly **zero** `#7c3aed`, `#8b5cf6`, `violet`, or `indigo` accents (Strict Purple Ban).

---

## Audit / Provenance
Documented in detail in `docs/phases/68_AUDIT_AND_PROVENANCE.md`:
- Canonical serialization of input parameters, dates, line codes, allowables, and contract version.
- Cryptographic SHA-256 hash generation verified via `fn_verify_reimbursement_calculation_integrity()`.
- Append-only recalculation lineage preserving prior calculation records.
- Automated HIPAA audit logging to `public.audit_logs`.

---

## QA / Test Cases
Documented in detail in `docs/phases/68_QA_AND_ACCEPTANCE_CRITERIA.md`:
- **Case Study 1:** Complex Shoulder Arthroscopy + J8 Biceps Tenodesis + Implant Carve-Out ($11,179.10 allowable verified).
- **Case Study 2:** Knee Arthroscopy with Secondary Chondroplasty ($4,100.00 allowable verified).
- **Case Study 3:** Bilateral Knee Arthroscopy with Modifier 50 ($4,800.00 allowable verified).
- **Case Study 4:** Cataract Case Rate with Elective Toric IOL Upgrade ($2,250.00 allowable, $3,450.00 total collection verified).
- **Case Study 5:** Catastrophic Stop-Loss Trigger over $35,000.00 ($37,960.00 allowable verified).
- **Immutability & Trigger Verification:** UPDATE and DELETE aborted by triggers.
- **Tenancy Isolation:** Cross-facility access blocked.
- **Strict Purple Ban:** 0 occurrences of banned purple tokens.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint passes (`npm run lint`).
- Unit and integration tests pass (all 5 mathematical case studies exact to $0.01).
- No mock or placeholder rates presented as production truth.
- Uncontracted encounters fail closed without silent gross charge fallbacks.
- Calculation snapshots are permanently immutable and verifiable.
- P0/P1 issues block release.

---

## Dependencies
- Phase 60 — Medicare ASC Base Rate Engine (Approved).
- Phase 61 — CMS Payment Indicators (Approved).
- Phase 62 — Wage Index Adjustment (Approved).
- Phase 63 — Device-Intensive Rules (Approved).
- Phase 64 — Multiple Procedure Rules (Approved).
- Phase 65 — Payer Master (Approved).
- Phase 66 — Payer Contract Model (Approved).
- Phase 67 — Payer Contract Rate Methodologies (Approved).

---

## Definition of Done
A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

---

## Implementation Notes
- **Specification Status:** Audit and specification complete.
- **Migration 044:** Fully designed in `68_DATA_MODEL_AND_MIGRATION_PLAN.md`; **not executed** in accordance with read-only instructions.
- **Final Verdict:** **GO** — Phase 68 specification is complete, mathematically verified, and ready for implementation review.

