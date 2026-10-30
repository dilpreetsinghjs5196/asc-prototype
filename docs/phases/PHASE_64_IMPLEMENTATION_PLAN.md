# PHASE 64 — IMPLEMENTATION PLAN
## Staged Implementation Roadmap, Verification Gates, and Definition of Done

**Scope**: Multiple Procedure Payment Reduction (MPPR) Engine, Payer Rule Sets, Audit Ledgers, and Workbench Integration  
**Proposed Migration**: `040_multiple_procedure_payment_rules.sql` (Planning Reference Only)  
**Document Status**: Production Implementation Roadmap

---

## 1. Phased Implementation Roadmap

```
Stage 1: DDL Schema & Tables
  ├── multiple_procedure_rule_sets
  ├── multiple_procedure_rules
  ├── cms_endoscopy_families
  ├── mppr_calculation_snapshots
  └── mppr_calculation_lines
        │
        ▼
Stage 2: Server-Side Authoritative RPCs
  ├── fn_calculate_mppr_reimbursement
  ├── fn_resolve_mppr_rules
  └── Immutability Triggers on Financial Ledgers
        │
        ▼
Stage 3: Deprecation & Client Service Layer
  ├── Create src/lib/mpprService.js
  ├── Deprecate calculateAuthoritativeAscRevenue
  └── Refactor calculateMedicareRevenue to call server RPC
        │
        ▼
Stage 4: Multi-Tenant RBAC & Scrubber Integration
  ├── Add mppr.* permissions to rbacService.js
  └── Deploy SCRUB-COMM-51 in fn_scrub_claim
        │
        ▼
Stage 5: UI Workbench Integration (MedicareRateExplorer Tab 7)
  ├── Interactive Multi-Line Procedure Simulator
  ├── Rule Sets & Tier Multipliers Catalog
  ├── CMS Endoscopy Family Browser
  └── Historical Encounter MPPR Audit Explorer
        │
        ▼
Stage 6: Automated Verification & Test Suite
  ├── tests/medicare-mppr-payment-rules.test.js (Unit, Invariant, Rounding)
  ├── Static Code Audit (Purple Ban & Zero Mock Fallbacks)
  └── Full Project Regression Run (819+ tests)
```

---

## 2. Detailed Execution Stages

### Stage 1: Database Migration (DDL & Schema)
1. Author `supabase/migrations/040_multiple_procedure_payment_rules.sql`:
   - Tables: `multiple_procedure_rule_sets`, `multiple_procedure_rules`, `cms_endoscopy_families`, `mppr_calculation_snapshots`, `mppr_calculation_lines`.
   - Constraints: Primary keys, foreign keys with `ON DELETE CASCADE/RESTRICT`, check constraints ensuring multiplier percentages between 0.0000 and 2.0000.
   - Indexes on `(rule_set_id, tier_rank)`, `(snapshot_id, line_number)`, and `(surgery_id)`.
   - Seed data:
     - Rule Set `MEDICARE_ASC_416_172`: Tier 1 = 100%, Tier 2+ = 50%, Device Offset Protected = TRUE.
     - Rule Set `COM_STD_CASCADE`: Tier 1 = 100%, Tier 2 = 50%, Tier 3 = 25%, Tier 4+ = 0%.
     - Rule Set `COM_SYM_50`: Tier 1 = 100%, Tier 2+ = 50%.
     - Endoscopy families: Colonoscopy (Family 15, Base `45378`), EGD (Family 14, Base `43235`), Bronchoscopy (Family 01, Base `31622`).
2. Author reversible `supabase/migrations/040_multiple_procedure_payment_rules_down.sql`.

### Stage 2: Server-Side Stored Procedures
1. Deploy `public.fn_calculate_mppr_reimbursement`:
   - Evaluates encounter lines, resolves baseline rates, applies wage adjustment, sorts by allowable rate DESC, applies statutory MPPR or commercial cascade, isolates device offsets, and generates audit snapshots.
2. Deploy statement-level immutability triggers on `mppr_calculation_snapshots` and `mppr_calculation_lines` preventing unauthorized `UPDATE` or `DELETE`.

### Stage 3: Client Service Layer & Competing Code Remediations
1. Create `src/lib/mpprService.js`:
   - Implement `calculateEncounterMppr`, `getRuleSets`, `getEndoscopyFamilies`, `getEncounterSnapshots`.
   - Wire onto `db` singleton in `src/lib/supabase.js`.
2. Remediate Blocker BLK-64-01:
   - Deprecate `calculateAuthoritativeAscRevenue` in `src/utils/hospitalUtils.js`.
   - Re-route callers to `mpprService.calculateEncounterMppr`.
   - Eliminate chargemaster gross charge fallbacks in ranking logic.

### Stage 4: RBAC & Scrubber Integration
1. Add 7 granular permissions to `src/lib/rbacService.js`:
   - `mppr.view_rules`, `mppr.view_calculations`, `mppr.manage_payer_rules`, `mppr.toggle_facility_setting`, `mppr.override_discount`, `mppr.approve_override`, `mppr.audit_export`.
   - Map to roles: `super_admin`, `org_admin`, `facility_admin`, `cfo`, `biller`, `coder`.
2. Update claim scrubbing rules:
   - Add rule `SCRUB-COMM-51`: Enforces Modifier 51 on secondary surgical lines for commercial claims, and blocks Modifier 51 on Medicare ASC claims.

### Stage 5: UI Integration (MedicareRateExplorer.jsx)
1. Add Tab 7 ("Multiple Procedure Rules (MPPR)") to `MedicareRateExplorer.jsx`:
   - Multi-Line Interactive Claim Simulator (add lines, select CPT, calculate rank, view device offset carve-out and 50% discount).
   - Rule Set Matrix Viewer (Medicare ASC vs Commercial Cascades).
   - Endoscopy Family Browser (Base-code difference deductions).
   - Case Encounter Audit Drill-down.
2. Comply strictly with design rules: zero banned purple/violet tokens.

### Stage 6: Automated Test Suite & Regression
1. Author `tests/medicare-mppr-payment-rules.test.js`:
   - Test 1: Migration DDL forward/down existence and constraints.
   - Test 2: Multi-tenant RLS isolation.
   - Test 3: Standard dual-procedure 100%/50% reduction arithmetic.
   - Test 4: Device-intensive (J8) 100% device offset protection under secondary MPPR.
   - Test 5: Endoscopy family base-code difference calculation.
   - Test 6: Bilateral modifier 50 single-line 150% allowable handling.
   - Test 7: Add-on code (+) 100% exemption across all units.
   - Test 8: Packaged (N1) $0.00 exclusion from ranking.
   - Test 9: Commercial payer 4-tier cascade (100/50/25/0) with Modifier 51 validation.
   - Test 10: Gross charge exclusion from ranking.
   - Test 11: RBAC permissions verification.
   - Test 12: Maestro Purple Ban static audit.
2. Execute full regression run (`npm test`, `eslint`, `npm run build`).

---

## 3. Definition of Done (DoD)

Phase 64 is complete ONLY when:
- [ ] Database migration `040_multiple_procedure_payment_rules.sql` and down migration exist and pass syntax validation.
- [ ] Stored procedure `fn_calculate_mppr_reimbursement` executes authoritative calculations server-side.
- [ ] Competing client-side calculation function `calculateAuthoritativeAscRevenue` is deprecated.
- [ ] Client service `src/lib/mpprService.js` is fully wired to `db` singleton.
- [ ] 7 RBAC permissions are defined in `rbacService.js` and enforced.
- [ ] UI Tab 7 is integrated into `MedicareRateExplorer.jsx` with zero purple tokens.
- [ ] Automated test suite `medicare-mppr-payment-rules.test.js` passes 100%.
- [ ] Full project test suite passes (all 819+ tests).
- [ ] Vite production build passes without errors.
- [ ] Zero mock or gross charge values are presented as production reimbursement.
