# PHASE 66 — PAYER CONTRACT MODEL: IMPLEMENTATION ROADMAP & TEST PLAN

**Author:** ASCANALYST Engineering Lead  
**Scope:** Stage-by-Stage Implementation Roadmap, Test Plan, Acceptance Criteria, Definition of Done  
**Proposed Migration Number:** `042_payer_contract_model.sql` (Planning Reference Only)  

---

## 1. Stage-by-Stage Implementation Roadmap

```
Stage 1: Database Migration Architecture (042_payer_contract_model.sql & down)
    │   └─ Deploy 8 new tables + refactor 2 tables, triggers, and RLS policies
    ▼
Stage 2: Authoritative Server-Side Stored Procedures & Functions
    │   └─ fn_resolve_payer_contract, fn_block_approved_contract_version_modification
    ▼
Stage 3: Client Service Layer (src/lib/payerContractService.js)
    │   └─ Contract CRUD, version management, resolution engine, signed document URLs
    ▼
Stage 4: RBAC Permissions & Role Registration (src/lib/rbacService.js)
    │   └─ Register 16 payer.contract.* permissions and wire role matrices
    ▼
Stage 5: UI Directory & Workbench Integration (PayerMasterDirectory.jsx & CSS)
    │   └─ Replace Tab 4 mock cards with dynamic contracts manager, version inspector, resolution sandbox
    ▼
Stage 6: Comprehensive Automated Test Suite (tests/payer-contract-model.test.js)
    │   └─ Unit, integration, RLS, concurrency, financial regression, zero purple ban
    ▼
Stage 7: Quality Gates & Verification
        └─ node --test, npm test, npx eslint, npm run build
```

---

## 2. QA & Test Matrix Specifications

### Test Suite 1: Database Migrations & Invariants
- Verify `042_payer_contract_model.sql` and `042_payer_contract_model_down.sql` exist and are substantive (>3KB).
- Verify all 10 normalized tables exist with proper foreign keys (`ON DELETE RESTRICT` for financial entities).
- Verify immutable version trigger blocks `UPDATE`/`DELETE` on `APPROVED` or `ACTIVE` versions.
- Verify down migration cleanly drops tables in reverse dependency order.

### Test Suite 2: Multi-Tenant RLS & Security Isolation
- Verify `payer_contracts`, `payer_contract_versions`, `payer_contract_terms`, and `payer_contract_documents` enforce RLS.
- Negative test: ensure RLS policies strictly use `is_facility_accessible` and `user_has_facility_role` and NEVER query `public.user_roles` directly.
- Verify cross-facility and cross-organization access is blocked for unauthorized callers.

### Test Suite 3: Contract Resolution Engine & Specificity Hierarchy
- Verify procedure-specific term overrides default version multiplier.
- Verify plan-specific scope filters out non-covered health plans (e.g. HMO excluded, PPO covered).
- Verify facility-specific contract overrides organization-wide master contract.
- Verify overlapping conflicting active contracts trigger `CONTRACT_CONFLICT_DETECTED` and fail closed.

### Test Suite 4: Financial Reimbursement Calculations
- Verify `% of Medicare` multiplier (e.g. 145%) scales localized Medicare base rate accurately to 2 decimal places.
- Verify Commercial Fee Schedule flat dollar rate is retrieved and multiplied by units.
- Verify `% of Billed Charges` discount calculates correctly off chargemaster rate.
- Verify MPPR cascade reduces secondary procedures by contract ruleset (100% / 50% / 25%).
- Verify implant carve-out applies invoice plus percentage markup without double-paying device portion.

### Test Suite 5: RBAC & Governance
- Verify all 16 `payer.contract.*` permissions exist in `PERMISSIONS_CATALOG`.
- Verify two-person check: creator cannot approve their own sensitive contract terms.
- Verify AI Analyst permissions are strictly read-only.

### Test Suite 6: Zero Maestro Purple Ban Compliance
- Static scan across all Phase 66 files ensuring zero instances of `#7c3aed`, `#8b5cf6`, `purple`, `violet`, `indigo`.

---

## 3. Acceptance Criteria & Definition of Done

A feature is complete only when:
- [ ] Build passes clean (`npm run build`).
- [ ] Lint passes clean (`npx eslint`).
- [ ] Automated test suite passes 100% (`tests/payer-contract-model.test.js`).
- [ ] Full regression suite passes 100% (`npm test`).
- [ ] Multi-tenant isolation verified; zero queries to `public.user_roles`.
- [ ] No mock, placeholder, or guessed financial values presented as production truth.
- [ ] Approved contract versions are cryptographically hashed and immutable.
- [ ] P0/P1 issues block release.
