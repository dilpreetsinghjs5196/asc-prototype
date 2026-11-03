# PHASE 70 — CANONICAL FINANCIAL TERMINOLOGY
## Master Dictionary Table, Definitions, Categorization, Scopes & Usage Restrictions

> **Phase:** 70 — Financial Data Dictionary  
> **Status:** CANONICAL TERMINOLOGY SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Classification:** Enterprise Financial Lexicon (Universal Across Modules)  

---

## 1. CANONICAL FINANCIAL TERMINOLOGY MATRIX

Every financial term in ASCANALYST is formally defined with strict semantic boundaries, storage precision, and usage rules:

| # | Canonical Financial Term | Category | Datatype / Precision | Source of Truth | Facility / Case Scope | Permitted Usage | Prohibited Usage |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `gross_billed_charges` | Charges | `NUMERIC(12,2)` | Chargemaster / `surgery_procedures` | Case / Facility | Total list prices billed on claims | Prohibited from being labeled as "Revenue" |
| **2** | `gross_scheduled_charges` | Charges | `NUMERIC(12,2)` | Sched CPTs / Chargemaster | Pre-Op Estimate | Sched case volume valuation | Prohibited from billing or accounting use |
| **3** | `posted_charges` | Charges | `NUMERIC(12,2)` | Finalized `claim_lines` | Post-Op Billed | Authoritative UB-04/CMS-1500 charges | Prohibited from modifying after submission |
| **4** | `contract_total_allowable` | Contractual | `NUMERIC(12,2)` | `reimbursement_calculations` | Case Adjudication | Authoritative expected reimbursement | Prohibited from assuming 100% collection |
| **5** | `medicare_benchmark_allowable`| Benchmark | `NUMERIC(12,2)` | `medicare_base_rates` | Regulatory Ref | 100% Medicare baseline comparison | Prohibited from billing commercial payers |
| **6** | `expected_contractual_revenue`| Revenue | `NUMERIC(12,2)` | Net Allowable Calculation | Operational Accrual | Budgeting & operational forecasts | Prohibited from GAAP audited reporting |
| **7** | `net_patient_service_revenue`| Revenue | `NUMERIC(12,2)` | Remittances & Earned Fee | Accounting | GAAP financial statements | Prohibited from using pre-bill estimates |
| **8** | `gross_payer_payment` | Payments | `NUMERIC(12,2)` | 835 Remittance / Check | Cash Receipt | Total remittance from insurance carrier | Prohibited from combining with patient cash |
| **9** | `net_payer_payment` | Payments | `NUMERIC(12,2)` | Gross Payer less Recoupments | Cash Flow | Net cash realized from payer | Prohibited from ignoring recoupments |
| **10** | `patient_payment` | Payments | `NUMERIC(12,2)` | POS Card / Patient Portal | Cash Receipt | Direct patient copay/coinsurance paid | Prohibited from counting secondary insurance |
| **11** | `secondary_payer_payment` | Payments | `NUMERIC(12,2)` | Secondary 835 Remittance | Cash Receipt | Adjudication from secondary insurer | Prohibited from double-counting with primary |
| **12** | `contractual_adjustment` | Deductions | `NUMERIC(12,2)` | Gross Charge less Allowable | Write-Off Ledger | Required contractual discount | Prohibited from treating as bad debt |
| **13** | `administrative_write_off`| Deductions | `NUMERIC(12,2)` | Management Authorization | Non-Contractual | Timely filing / disputed write-offs | Prohibited without supervisor approval |
| **14** | `payer_refund_recoupment` | Deductions | `NUMERIC(12,2)` | Payer Takeback Notice | Cash Reduction | Retroactive audit recoupment | Prohibited from hiding in net revenue |
| **15** | `total_net_collections` | Collections | `NUMERIC(12,2)` | Net Payer + Net Patient | Cash Realization | Actual cash deposited in bank | Prohibited from including expected revenue |
| **16** | `collection_rate` | Metric | `NUMERIC(6,4)` | Net Collections / Allowable | Efficiency KPI | Realized collections vs allowable | Prohibited from using charges as denominator |
| **17** | `days_in_ar` | Metric | `NUMERIC(6,2)` | (Gross AR / Avg Daily Charges) | RCM Performance | Outstanding claim aging indicator | Prohibited from using net revenue in denominator |
| **18** | `estimated_patient_liability`| Responsibility| `NUMERIC(12,2)`| Contract Deductible/Coins | Pre-Bill Estimate | Patient pre-collection estimate | Prohibited from guaranteeing as final balance |
| **19** | `actual_patient_liability` | Responsibility| `NUMERIC(12,2)`| 835 PR (Patient Resp) Group | Post-Adjudication | Authoritative patient balance due | Prohibited from altering without EOB |
| **20** | `implant_acquisition_cost`| Cost | `NUMERIC(12,2)` | `case_devices` / Invoice Lines | Direct Expense | True invoice acquisition cost of device | Prohibited from using list price |
| **21** | `direct_supply_cost` | Cost | `NUMERIC(12,2)` | `surgeries.supplies_cost` | Direct Expense | Non-implant surgical supplies & drapes | Prohibited from duplicating implant costs |
| **22** | `direct_clinical_labor_cost`| Cost | `NUMERIC(12,2)` | `case_staff_assignments` | Direct Expense | Actual hourly wages of assigned staff | Prohibited from using 30% heuristic |
| **23** | `direct_or_time_cost` | Cost | `NUMERIC(12,2)` | `operating_rooms.hourly_rate` | Direct Expense | Operating room overhead per minute | Prohibited from using stepped client math |
| **24** | `total_direct_case_cost` | Cost | `NUMERIC(12,2)` | Sum of Direct Costs (20..23) | Direct Case Total | Full variable clinical case expense | Prohibited from including corporate SG&A |
| **25** | `expected_contribution_margin`| Margin | `NUMERIC(12,2)` | Allowable less Direct Cost | Profitability | Procedural net contribution to fixed OH | Prohibited from labeling as Net Profit |
| **26** | `actual_contribution_margin` | Margin | `NUMERIC(12,2)` | Net Collections less Direct Cost | Post-Op Actual | True cash contribution margin | Prohibited from using billed charges |
| **27** | `contribution_margin_pct` | Margin | `NUMERIC(6,4)` | Margin / Allowable × 100 | Financial Spread | Case margin percentage yield | Prohibited if denominator is zero or neg |
| **28** | `margin_per_or_minute` | Efficiency | `NUMERIC(12,2)` | Contribution Margin / Minutes | Room Efficiency | Yield per minute of surgical OR time | Prohibited from using elapsed turnover |
| **29** | `contractual_underpayment`| Variance | `NUMERIC(12,2)` | Allowable less Actual Payment | Audit Ledger | Underpayment variance $> \$50.00$ | Prohibited if denial was valid clinical |
| **30** | `financial_completeness_code`| Quality | `VARCHAR(32)` | Completeness Engine | Quality Status | `COMPLETE`, `ESTIMATED`, etc. | Prohibited from hiding incomplete data |

---

## 2. SEMANTIC RULES & HIERARCHY

### Rule 1: The Three Tiers of Financial Reality
ASCANALYST enforces strict separation across three distinct financial dimensions:

```mermaid
graph LR
    subgraph Tier1["Tier 1: List Pricing (Chargemaster)"]
        A[Gross Billed Charges]
        B[Gross Scheduled Charges]
    end

    subgraph Tier2["Tier 2: Contractual Expected (Operational)"]
        C[Contract Total Allowable]
        D[Expected Contribution Margin]
        E[Estimated Patient Share]
    end

    subgraph Tier3["Tier 3: Cash & Accounting (Settled)"]
        F[Net Collections]
        G[Actual Contribution Margin]
        H[Bank Deposits & Remittances]
    end

    Tier1 -. Contractual Adjustments .-> Tier2
    Tier2 -. Payment Adjudication & Variances .-> Tier3
```

- **Tier 1 (Charges):** Represents what the facility bills. It has zero direct bearing on actual cash.
- **Tier 2 (Expected):** Represents what the facility is legally owed under contract terms and deterministic math.
- **Tier 3 (Cash):** Represents what was actually deposited in the bank after clearinghouse remittances, patient copays, and takebacks.

### Rule 2: Universal Scoping
Every financial metric must explicitly declare its scope:
- **Line Scope:** Applies to an individual CPT/HCPCS code line (e.g., Line Allowable, Modifier Adjustment).
- **Encounter / Case Scope:** Applies to a single surgical surgery event (e.g., Total Allowable, Direct Cost, Contribution Margin).
- **Facility Scope:** Aggregates encounters across a single physical ASC facility (e.g., Facility Utilization, Monthly Margin).
- **Organization Scope:** Aggregates sibling facilities under a corporate parent entity (e.g., Corporate EBITDA, Enterprise Accounts Receivable).
