# PHASE 69 — REIMBURSEMENT CALCULATION AUDITABILITY
## Source Traceability, Deterministic Formulas, Rule Versioning & Financial Explainability

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** PRODUCTION SPECIFICATION — READ-ONLY CURRENT-STATE AUDIT + TARGET-STATE SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Authors:** Principal Financial Systems Architect, Healthcare Revenue Cycle Auditor, PostgreSQL Architect, Application Security Engineer  
> **Classification:** Strict Healthcare Financial Ledger Governance (HIPAA 45 CFR § 164.312(b), SOX § 404, CMS ASC Cost Reporting)  
> **Upstream Dependencies:** Phase 60–66 Verified Existing; Phase 67 Rate Rules (Approval Gate); Phase 68 Engine & Ledger (Migration 044 PROPOSED / UNAUTHORIZED)  

---

## 1. MANDATORY EXECUTION RESTRICTIONS & AUDIT SCOPE

In accordance with strict clinical, financial, and database security governance, this phase is executed as a **read-only audit and target architecture specification**:

### Strict Execution Constraints:
1. **Zero Database Mutations:** No SQL migrations are executed; no database tables, columns, indexes, triggers, or RLS policies are created or modified.
2. **Zero Runtime Code Alterations:** No application backend services, RPCs, or calculation engines are altered.
3. **No Claim of Production Readiness:** Documenting a source registry or formula trace does **NOT** constitute runtime deployment.
4. **Upstream Gate Preservation:** Phase 67 (`043_payer_contract_rate_rules.sql`) remains an **unapproved deployment gate**. Phase 68 (`044_expected_reimbursement_engine.sql`) remains **STRICTLY UNAUTHORIZED**.
5. **Component Classification:** Every audited repository component is classified as **`[KEEP]`**, **`[REFACTOR]`**, **`[REPLACE]`**, **`[MISSING]`**, or **`[NOT VERIFIED]`**.

---

## 2. PHASE 69 CORE PURPOSE & OBJECTIVE

In ambulatory surgery center financial management, an expected reimbursement figure cannot merely be presented as a static total. Every single dollar, intermediate factor, wage index, and multiplier must form an **independently explainable, cryptographically bound audit chain**:

```
+----------------------------------------------------------------------------------------------------+
|                               THE 12-STEP AUDIT EXPLAINABILITY CHAIN                               |
+----------------------------------------------------------------------------------------------------+
| 1. Clinical & Billing Encounter (Surgeries, Patients, Date of Service)                            |
|    -> 2. Primary & Secondary Procedural Lines (CPT/HCPCS Codes, Modifiers 50/73/74, Units)          |
|       -> 3. Verified Supply & Implant Acquisition Invoices (PO Numbers, Itemized Acquisition Costs) |
|          -> 4. Authoritative Payer Master & Health Plan Resolution (Phase 65)                      |
|             -> 5. Effective-Dated Payer Contract Version Lock (Phase 66)                            |
|                -> 6. Centralized Source Version Registry (Phase 69: CMS Addenda, Wage Index, CPT)  |
|                   -> 7. Deterministic Pricing Methodology Selection (5-Tier Precedence Cascade)     |
|                      -> 8. Intermediate Mathematical Trace (Wage Adjustments, J8 Offsets, MPPR)    |
|                         -> 9. Total Contract Allowable Amount (Primary, Secondary, Carve-Outs)      |
|                            -> 10. Verified Benefit Partitioning (Copay, Deductible, Coinsurance)    |
|                               -> 11. Estimated Net Realizable Payer Reimbursement                  |
|                                  -> 12. Cryptographic Ledger Digest & Versioned Provenance Snapshot|
+----------------------------------------------------------------------------------------------------+
```

### The Auditor's Questions That Phase 69 Must Answer:
1. **Why was this exact amount calculated?** (Which mathematical formula was applied?)
2. **Which contract clause or schedule exhibit authorized it?** (Exact contractual provenance)
3. **Which external regulatory dataset supplied the baseline?** (CMS ASC Addenda AA/BB, CBSA Wage Index)
4. **Was the source dataset effective on the date of surgery?** (Effective-date window verification)
5. **Which specific adjustments were applied?** (Modifier 50, MPPR Rank, J8 Device Offset)
6. **Which potential adjustments were NOT applied, and WHY?** (Explicit non-applicability explanations)
7. **What changed between two calculation runs?** (Itemized historical recalculation diff)
8. **Can the exact result be reproduced 10 years later?** (Deterministic version-lock reproduction)

---

## 3. AUDIT SUITE DOCUMENTATION MAP

Phase 69 comprises 13 authoritative technical specifications:

1. [`69_REIMBURSEMENT_CALCULATION_AUDITABILITY.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_REIMBURSEMENT_CALCULATION_AUDITABILITY.md): Master specification and executive summary.
2. [`69_CURRENT_STATE_AUDIT.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_CURRENT_STATE_AUDIT.md): Comprehensive inventory of existing repository tables and code with KEEP / REFACTOR / REPLACE / MISSING ratings.
3. [`69_TARGET_ARCHITECTURE.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_TARGET_ARCHITECTURE.md): System topology, source registry architecture, and rule resolution pipeline.
4. [`69_SOURCE_REGISTRY_AND_VERSIONING.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_SOURCE_REGISTRY_AND_VERSIONING.md): Schema design for external sources, file checksums, publication vs effective dates, and approval lifecycles.
5. [`69_EFFECTIVE_DATE_AND_RULE_RESOLUTION.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_EFFECTIVE_DATE_AND_RULE_RESOLUTION.md): Deterministic resolution algorithms, date of service evaluation, precedence hierarchy, and fail-closed rules.
6. [`69_CALCULATION_TRACE_AND_FORMULA_SPECIFICATION.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_CALCULATION_TRACE_AND_FORMULA_SPECIFICATION.md): Line-by-line mathematical trace schema, intermediate factors, and unapplied rule logging.
7. [`69_DATA_MODEL_AND_MIGRATION_PLAN.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_DATA_MODEL_AND_MIGRATION_PLAN.md): Complete data dictionary, foreign keys, indexes, and planned migration sequence (Migration 045).
8. [`69_API_AND_SERVICE_CONTRACTS.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_API_AND_SERVICE_CONTRACTS.md): Server-side stored procedures, service boundaries, and JSON schemas.
9. [`69_UI_WORKFLOW_SPECIFICATION.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_UI_WORKFLOW_SPECIFICATION.md): Calculation audit inspector, formula trace drill-down, historical comparison diff, and source approval UX.
10. [`69_SECURITY_AND_RBAC.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_SECURITY_AND_RBAC.md): Tenancy boundaries, granular permissions (`reimbursement.source.*`), and AI Analyst security restrictions.
11. [`69_AUDIT_AND_PROVENANCE.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_AUDIT_AND_PROVENANCE.md): 10-year CMS/SOX audit compliance, immutable hashes, and audit ledger integration.
12. [`69_QA_AND_ACCEPTANCE_CRITERIA.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_QA_AND_ACCEPTANCE_CRITERIA.md): Comprehensive test matrix covering source integrity, effective dates, traces, security, and regression.
13. [`69_DEPENDENCY_AND_CROSS_PHASE_AUDIT.md`](file:///e:/medicalAI/asc-prototype/docs/phases/69_DEPENDENCY_AND_CROSS_PHASE_AUDIT.md): Cross-phase audit of Phases 60–68, dependency gates, and blocking impacts.

---

## 4. EXECUTIVE SUMMARY OF CURRENT STATE VS. TARGET STATE

| Domain | Current Repository State | Target Phase 69 State | Strategic Action |
| :--- | :--- | :--- | :---: |
| **External Source Tracking** | Disjointed import staging tables (`cpt_import_batches`, `medicare_rate_import_batches`) without unified catalog. | Centralized `reimbursement_sources` and `reimbursement_source_versions` with SHA-256 file checksums and publication dates. | **REPLACE / UNIFY** |
| **Calculation Explainability** | Free-text string description in `reimbursement_calculation_lines.calculation_trace`. | Structured JSON and relational trace recording exact formulas, factors, rule IDs, and source versions. | **REFACTOR** |
| **Unapplied Rule Tracking** | Omitted entirely. System only records rules that triggered. | Explicit unapplied rule ledger recording why MPPR, J8, or stop-loss was bypassed. | **MISSING -> BUILD** |
| **Effective-Date Resolution** | Simple `date_of_service BETWEEN start AND end` query; vulnerable to gaps and overlapping versions. | Strict version resolver enforcing non-overlapping active windows, publication vs effective separation, and fail-closed behavior. | **REFACTOR** |
| **Source File Immutability** | Files parsed into staging; raw original files not cryptographically fingerprinted in database. | Mandatory SHA-256 checksum, raw file provenance, importer actor ID, and executive approval gate before activation. | **MISSING -> BUILD** |
| **Historical Reproducibility** | Historical rerun queries current tables, producing non-reproducible shifts when tables update. | True 10-year version-lock binding calculations to immutable historical source versions. | **MISSING -> BUILD** |
