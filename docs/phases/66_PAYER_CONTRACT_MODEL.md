# 66 PAYER CONTRACT MODEL

## Purpose
Enterprise commercial payer contracts, versioning, effective dates, facility scope, plan scopes, amendments, approval workflows, fee schedules, and reimbursement integration.

## Scope
- Define production requirements for payer contracts and health plan agreements.
- Preserve compatibility with the current ASCANALYST product and upstream Medicare engines (Phases 60–65).
- Use deterministic, auditable rules for financial and commercial billing logic.
- Enforce organization/facility tenancy, immutable version locking, and RBAC governance.

## Current State
Audited current repository and database schema. Documented in detail in `docs/phases/PHASE_66_CURRENT_STATE_AUDIT.md`:
- `public.payer_master`: **KEEP** (Normalized master directory of carriers).
- `public.payer_plans`: **KEEP** (Benefit plans for plan-level scoping).
- `public.payer_contracts`: **REFACTOR** (Expand from single-facility to organization-level multi-facility scope, add lifecycle statuses).
- `public.payer_contract_versions`: **REFACTOR** (Add approval gates, immutable trigger locks, version hashes).
- `public.payer_contract_facility_scopes`: **MISSING** (Bridge entity for multi-facility enterprise contracts).
- `public.payer_contract_plan_scopes`: **MISSING** (Bridge entity for plan-specific eligibility).
- `public.payer_contract_service_scopes`: **MISSING** (Specialty and procedure carve-outs).
- `public.payer_contract_terms`: **MISSING** (Line-item fee schedule rates and case rates).
- `public.payer_contract_documents`: **MISSING** (Private storage, SHA-256 hash provenance, signed URLs).
- `public.payer_contract_amendments`: **MISSING** (Formal revision history and rationale).
- `public.payer_contract_approvals`: **MISSING** (Two-person sign-off audit trail).
- `public.payer_fee_schedules`: **REPLACE** (Legacy flat table replaced by `payer_contract_terms`).
- `public.facility_vendor_contracts`: **KEEP** (Strictly segregated for implant supply procurement).

## Target State
Production-ready commercial contract model featuring:
1. **Decoupled Tenancy**: Organization ownership with multi-facility scope inheritance.
2. **Immutable Versioning**: Effective-dated snapshots locked by database triggers upon approval.
3. **Four Reimbursement Methodologies**: `% of Medicare`, `Commercial Fee Schedule`, `% of Billed Charges`, and `Case Rate`.
4. **Deterministic Precedence**: Specificity hierarchy (Procedure > Plan > Facility > Org Default) with conflict escalation.
5. **Two-Person Governance**: Mandatory CFO sign-off; creator cannot self-approve critical financial terms.
6. **Private Document Storage**: Secure storage bucket `payer-contracts` with 15-minute signed URLs and SHA-256 integrity verification.

## Data Model / Schema
Documented in detail in `docs/phases/PHASE_66_DATA_DICTIONARY.md`:
- `public.payer_contracts`
- `public.payer_contract_versions`
- `public.payer_contract_facility_scopes`
- `public.payer_contract_plan_scopes`
- `public.payer_contract_service_scopes`
- `public.payer_contract_terms`
- `public.payer_contract_documents`
- `public.payer_contract_amendments`
- `public.payer_contract_approvals`
- `public.payer_contract_audit_logs`

## Business Rules
Documented in detail in `docs/phases/PHASE_66_FINANCIAL_REIMBURSEMENT_INTEGRATION.md`:
- Multipliers evaluated as `NUMERIC(6, 4)` and rounded half-up to exactly 2 decimal places.
- MPPR cascading: primary at 100%, secondary at 50%, tertiary per contract ruleset (`COM_STD_CASCADE`, `CMS_50_PERCENT`).
- Surgical implant carve-outs: Invoice cost + markup % (`PASS_THROUGH_INVOICE_PLUS_PERCENT`) or exact invoice (`AT_COST`).
- Fail-closed evaluation: Uncontracted encounters emit `UNCONTRACTED_COMMERCIAL_ENCOUNTER`; missing rates emit `CONTRACT_RATE_MISSING`. Zero-dollar substitution is prohibited.

## Permissions / Security
Documented in detail in `docs/phases/PHASE_66_SECURITY_AND_RBAC_MATRIX.md`:
- 16 fine-grained permissions: `payer.contract.view`, `payer.contract.terms.view`, `payer.contract.document.view`, `payer.contract.history.view`, `payer.contract.create`, `payer.contract.edit`, `payer.contract.scope.manage`, `payer.contract.terms.manage`, `payer.contract.document.upload`, `payer.contract.submit`, `payer.contract.approve`, `payer.contract.reject`, `payer.contract.activate`, `payer.contract.suspend`, `payer.contract.terminate`, `payer.contract.export`.
- Multi-tenant RLS policies using `is_facility_accessible` and `user_has_facility_role`. Zero queries to `public.user_roles`.
- Antigravity AI sandboxed to read-only analytical explanations and previews.

## API / Service Requirements
Documented in detail in `docs/phases/PHASE_66_PAYER_CONTRACT_SPEC.md`:
- Authoritative RPCs: `fn_resolve_payer_contract`, `fn_submit_payer_contract_version`, `fn_approve_payer_contract_version`, `fn_activate_payer_contract_version`.
- Client service: `src/lib/payerContractService.js` wired to `db` singleton.

## UI / Workflow Requirements
Documented in detail in `docs/phases/PHASE_66_PAYER_CONTRACT_SPEC.md`:
- Commercial Contracts Directory with status and payer filters.
- Contract Details & Versions Inspector with interactive timeline.
- Two-Person Approval Modal with diff review.
- Pre-bill Contract Resolution Sandbox for billing verification.
- Zero Maestro Purple Ban compliance.

## Audit / Provenance
Documented in detail in `docs/phases/PHASE_66_DOCUMENT_MANAGEMENT_SPEC.md`:
- Append-only audit logs in `payer_contract_audit_logs` capturing before/after JSONB state, actor, facility, contract version, timestamp, and action code.
- Cryptographic SHA-256 hashing for all executed documents.

## QA / Test Cases
Documented in detail in `docs/phases/PHASE_66_IMPLEMENTATION_PLAN.md`:
- Unit, Integration, RLS Isolation, Concurrency, and Financial Regression test suites in `tests/payer-contract-model.test.js`.

## Acceptance Criteria
- Build passes clean (`npm run build`).
- Lint passes clean (`npx eslint`).
- Automated test suite passes 100%.
- No mock or guessed financial values presented as production truth.
- Tenant isolation verified; zero queries to `public.user_roles`.
- P0/P1 issues block release.

## Dependencies
- Phase 60: Medicare ASC Base Rate Engine
- Phase 61: CMS Payment Indicators
- Phase 62: Geographic Wage Adjustment
- Phase 63: Device-Intensive Payment Rules
- Phase 64: Multiple Procedure Payment Rules
- Phase 65: Payer Master & Benefit Plans

## Definition of Done
A feature is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

## Implementation Notes
- Audit and specification completed without modifying production code or executing migrations.
- Reference migration `042_payer_contract_model.sql` and down migration `042_payer_contract_model_down.sql` specified for upcoming execution phase.

