# PHASE 70 — QA AND ACCEPTANCE CRITERIA
## Comprehensive Test Matrix, Automated Test Plans, Edge-Case Validations & Acceptance Checklist

> **Phase:** 70 — Financial Data Dictionary  
> **Status:** QA & TEST SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Classification:** Quality Assurance, Test Architecture & Financial Verification  

---

## 1. QA METHODOLOGY & EXECUTION STANDARDS

All tests for Phase 70 are structured under the AAA (Arrange, Act, Assert) pattern and executed using synthetic test fixtures. 

Tests are organized into 8 distinct functional suites:
1. **Financial Definition Integrity Tests (SEC-DEF)**
2. **Revenue & Charge Boundary Tests (REV-CHK)**
3. **Payment & Cash Realization Tests (PAY-CHK)**
4. **Cost Accounting & Invoice Tests (CST-CHK)**
5. **Margin & Profitability Math Tests (MAR-CHK)**
6. **Data Completeness & Zero-Ban Tests (QAL-CHK)**
7. **Security, Tenancy & RBAC Tests (SEC-CHK)**
8. **Regression & Backward Compatibility Tests (REG-CHK)**

---

## 2. COMPREHENSIVE TEST MATRIX

| Test ID | Suite | Scenario Description | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :---: |
| `SEC-DEF-01` | Definitions | Query dictionary for `expected_contribution_margin` | Returns canonical definition, NUMERIC(12,2), active formula | **SPECIFIED** |
| `SEC-DEF-02` | Definitions | Verify no duplicate conflicting metric codes | Unique constraint enforced on `metric_code` | **SPECIFIED** |
| `SEC-DEF-03` | Definitions | Verify SoD on formula approval | Trigger rejects if `approved_by == created_by` | **SPECIFIED** |
| `REV-CHK-01` | Revenue | Case with \$23,000 gross charges and \$11,179 allowable | Dashboard displays \$23,000 as Billed Charges, NOT Revenue | **SPECIFIED** |
| `REV-CHK-02` | Revenue | Voided / cancelled claim lines present in table | Voided charges excluded from total gross billed charges | **SPECIFIED** |
| `REV-CHK-03` | Revenue | Contractual adjustment `CO-45` logged | Verified adjustment is marked as non-cash List Price Discount | **SPECIFIED** |
| `PAY-CHK-01` | Payments | Payer pays \$8,143.28; Patient pays \$3,035.82 | Net collections equals \$11,179.10; zero double-counting | **SPECIFIED** |
| `PAY-CHK-02` | Payments | Payer takes back \$1,200 via 835 recoupment | Net payer collections reduces from \$8,143.28 to \$6,943.28 | **SPECIFIED** |
| `PAY-CHK-03` | Payments | Unapplied patient deposit logged | Flagged as unapplied liability; excluded from settled AR | **SPECIFIED** |
| `CST-CHK-01` | Cost | Implant consumed with verified invoice line \$1,890.00 | Acquisition cost evaluates to exact \$1,890.00 | **SPECIFIED** |
| `CST-CHK-02` | Cost | Implant consumed but invoice missing | Cost evaluates to `NULL`; status marked `MISSING_SOURCE_DATA` | **SPECIFIED** |
| `CST-CHK-03` | Cost | Verify zero-substitution ban | Missing invoice does NOT evaluate to `$0.00` | **SPECIFIED** |
| `CST-CHK-04` | Cost | Staff hours logged: 2 hrs RN (\$50/hr), 2 hrs Tech (\$35/hr)| Labor cost evaluates to \$170.00; 30% heuristic bypassed | **SPECIFIED** |
| `MAR-CHK-01` | Margin | Case allowable \$4,100.00, Direct cost \$1,850.00 | Contribution margin evaluates to exact \$2,250.00 | **SPECIFIED** |
| `MAR-CHK-02` | Margin | Compute margin percentage on \$2,250 / \$4,100 | Yields exact 54.8780% (`NUMERIC(6,4)`) | **SPECIFIED** |
| `MAR-CHK-03` | Margin | Allowable is \$0.00 (Pro bono / Denied case) | Handled safely; division by zero trapped; returns 0.00% | **SPECIFIED** |
| `MAR-CHK-04` | Margin | Direct costs (\$5,000) exceed allowable (\$4,000) | Yields -\$1,000.00; rendered in Rose badge | **SPECIFIED** |
| `QAL-CHK-01` | Quality | Encounter missing contract rate rule | Status marked `RATE_NOT_FOUND`; gross charge fallback blocked | **SPECIFIED** |
| `QAL-CHK-02` | Quality | Facility average margin computation with 10 cases (2 incomplete)| Incomplete cases excluded; average based on 8 complete cases | **SPECIFIED** |
| `QAL-CHK-03` | Quality | UI aggregates disclose data quality status | Banner discloses: *"2 cases excluded due to pending invoices"* | **SPECIFIED** |
| `SEC-CHK-01` | Security | User in Facility A queries Facility B metrics | Cross-facility access rejected with 0 rows returned | **SPECIFIED** |
| `SEC-CHK-02` | Security | Standard biller attempts to view surgeon profit margin | Permission gate `financial.margins.view` rejects query | **SPECIFIED** |
| `SEC-CHK-03` | Security | AI Analyst prompted: "What is Dr. Smith's profit margin?" | Stripped / clearance denied if user lacks permission | **SPECIFIED** |
| `REG-CHK-01` | Regression | Run Phase 68 verification suite (`expected-reimbursement-engine`)| All 29 automated tests pass with 0 failures | **PASSED (29/29)** |
| `REG-CHK-02` | Regression | Inspect UI components for Purple Ban compliance | Zero purple/violet tokens found in JSX/CSS | **PASSED** |

---

## 3. ACCEPTANCE CRITERIA

Phase 70 is officially accepted when:
1. **Complete Specification Delivery:** All 15 modular Phase 70 specification files are authored, formatted, and verified in `docs/phases/`.
2. **Cryptographic Parity:** All 15 files achieve 100% bit-for-bit SHA-256 hash equality between workspace `docs/phases/` and master `ASCANALYST_MD_SPECS`.
3. **Zero Migration Invocations:** Read-only governance is preserved; zero database migrations are executed.
4. **No Semantic Conflation:** Gross charges, expected allowables, cash collections, and contribution margins have distinct, non-overlapping canonical definitions.
5. **No Silent Zero Defaults:** Missing data rules explicitly require `NULL` and `MISSING_SOURCE_DATA` flags.
6. **Existing Regression Stability:** Test suites in `tests/` execute with 100% pass rates.
