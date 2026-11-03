# PHASE 70 — CURRENT STATE AUDIT
## Repository Financial Architecture, Database Schema, Calculation Services & Terminology Inventory

> **Phase:** 70 — Financial Data Dictionary  
> **Status:** READ-ONLY CURRENT-STATE AUDIT  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Classification:** Comprehensive Architectural & Codebase Financial Inventory  

---

## 1. EXECUTIVE AUDIT OVERVIEW

This document records the current-state technical audit of all financial columns, stored procedures, client calculation utilities, dashboard metrics, and report queries across the ASCANALYST repository.

The audit revealed three primary categories of technical and semantic debt:
1. **Semantic Conflation:** Gross chargemaster list prices are frequently labeled as "Revenue" or "Gross Revenue," creating the false impression of real cash flow or accrual.
2. **Duplicated & Heuristic Calculations:** Client utilities in `hospitalUtils.js` and `CommandCenter.jsx` implement disparate, hardcoded cost heuristics (e.g. 30% of OR cost for labor, stepped OR hourly rates) that diverge from authoritative database schemas (`operating_rooms`, `staff_members`).
3. **Silent Zero Defaulting:** Missing vendor implant invoices or missing contract rate rules frequently evaluate to `$0.00` in client math loops, producing artificially inflated contribution margins.

---

## 2. DATABASE SCHEMA AUDIT & CLASSIFICATION

Every database table holding financial numbers was evaluated against enterprise healthcare accounting standards:

| Physical Table | Column Name | Database Data Type | Current Usage & Meaning | Classification | Identified Defect / Semantic Risk | Target Canonical Mapping |
| :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| `public.surgeries` | `gross_charge` | `NUMERIC(12,2)` | Chargemaster total for case | **REFACTOR** | Often displayed as revenue on legacy dashboards | `gross_billed_charges` |
| `public.surgeries` | `revenue` | `NUMERIC(12,2)` | Manual or calculated revenue | **REPLACE** | Ambiguous whether gross, net, or collected | `expected_contractual_revenue` |
| `public.surgeries` | `expected_reimbursement`| `NUMERIC(12,2)` | Payer estimate | **REFACTOR** | Lacks contract version lock; vulnerable to drift | `expected_contractual_allowable` |
| `public.surgeries` | `supplies_cost` | `NUMERIC(12,2)` | Non-implant surgical supplies | **KEEP** | Direct variable case expense | `direct_supply_acquisition_cost` |
| `public.surgeries` | `implants_cost` | `NUMERIC(12,2)` | Sum of consumed implants | **REFACTOR** | Updated via trigger; requires invoice binding | `implant_acquisition_cost` |
| `public.surgeries` | `actual_room_cost` | `NUMERIC(12,2)` | Calculated room cost | **REFACTOR** | Calculated in client; must be server-derived | `direct_or_time_cost` |
| `public.surgeries` | `actual_labor_cost` | `NUMERIC(12,2)` | Calculated labor cost | **REFACTOR** | Frequently computed via 30% heuristic | `direct_clinical_labor_cost` |
| `public.surgeries` | `write_off` | `NUMERIC(12,2)` | Deductions from charges | **REFACTOR** | Combines contractual & charity write-offs | `contractual_adjustment_amount` |
| `public.surgery_procedures` | `gross_charge` | `NUMERIC(12,2)` | Line-item CPT chargemaster fee | **KEEP** | Baseline procedural charge | `line_gross_charge` |
| `public.surgery_financial_snapshots`| `gross_revenue` | `NUMERIC(12,2)` | Frozen case charge | **REFACTOR** | Named gross_revenue but represents gross charges | `snapshot_gross_charges` |
| `public.surgery_financial_snapshots`| `net_margin` | `NUMERIC(12,2)` | Frozen margin dollar | **REFACTOR** | Named net_margin but represents contribution margin | `snapshot_contribution_margin` |
| `public.reimbursement_calculations` | `total_gross_billed`| `NUMERIC(12,2)` | Sum of procedure charges | **KEEP** | Authoritative chargemaster total | `gross_billed_charges` |
| `public.reimbursement_calculations` | `total_contract_allowable`| `NUMERIC(12,2)` | Deterministic allowable | **KEEP** | Authoritative contractual allowable | `contract_total_allowable` |
| `public.reimbursement_calculations` | `expected_contribution_margin`| `NUMERIC(12,2)` | Allowable minus direct costs | **KEEP** | Authoritative case contribution margin | `expected_contribution_margin` |
| `public.case_devices` | `cost` | `NUMERIC(12,2)` | Unit price from SKU schedule | **KEEP** | Direct implant acquisition cost | `implant_acquisition_cost` |
| `public.facility_implant_sku_prices`| `contract_price` | `NUMERIC(12,2)` | Negotiated SKU tier price | **KEEP** | Baseline contract purchase cost | `contracted_sku_purchase_cost` |

---

## 3. CLIENT CALCULATION ROUTINES AUDIT

### 3.1 `src/utils/hospitalUtils.js` Audit
- **`calculateORCost(durationMinutes)` [REPLACE]:**
  - *Current Code:* Computes `$1,500` for first 60 mins, `$300` per 30 mins for hour 2, `$400` per 30 mins thereafter.
  - *Defect:* Hardcodes facility rates in frontend JavaScript. Bypasses `operating_rooms.hourly_rate` configured in database migration `002`.
- **`calculateLaborCost(durationMinutes)` [REPLACE]:**
  - *Current Code:* Returns `calculateORCost(durationMinutes) * 0.30` (30% of OR cost).
  - *Defect:* A synthetic heuristic that ignores actual staff assignments (`case_staff_assignments`) and hourly wages in `015_staff_and_provider_model.sql`.
- **`calculateMedicareRevenue(...)` [REFACTOR]:**
  - *Current Code:* Fallback hierarchy: `contracted_reimbursement` $\rightarrow$ `reimbursement` $\rightarrow$ `gross_charge`.
  - *Defect:* If rate is missing, falls back to `gross_charge`, massively overstating expected Medicare revenue.
- **`getSurgeryMetrics(surgery)` [REFACTOR]:**
  - *Current Code:* Returns object with keys `cptRevenue`, `facilityRevenue`, `netProfit`, `supplyCosts`.
  - *Defect:* Labels contribution margin as `netProfit`. Fails to distinguish expected reimbursement from cash collections.

### 3.2 `src/components/CommandCenter.jsx` Audit
- **`getCaseCost(s, includeOverhead)` [REFACTOR]:**
  - Sums supplies, implants, medications, tray cost, actual room cost, and actual labor cost.
  - Correctly aggregates direct costs, but lacks validation if an implant cost is missing.
- **`ebitda` & `ebitdaPercent` [REPLACE]:**
  - *Current Code:* `const ebitda = totalRevenue - totalCosts;`
  - *Defect:* Labels case contribution margin as EBITDA. In corporate healthcare finance, EBITDA requires facility-wide corporate expenses (building lease, equipment depreciation, executive payroll, insurance). Case-level margins cannot be labeled EBITDA.

---

## 4. MISSING FINANCIAL DOMAINS (GAPS TO BUILD)

1. **Structured 835 Remittance Ledger:** While the claim scrubber generates 837P claims, there is currently no structured table capturing ANSI 835 Remittance Advice Claim Adjustment Reason Codes (CARC) and Remittance Advice Remark Codes (RARC).
2. **Standardized Completeness Badging:** There is no database or service-level completeness score indicating whether a case has all necessary invoices, wage logs, and contract rates before displaying financial KPIs.
3. **Accounts Receivable Aging:** No native calculation exists tracking days in AR (0–30, 31–60, 61–90, 91–120+ days) from claim submission to final settlement.

---

## 5. AUDIT VERDICT

The current codebase contains high-quality modern schemas (especially in Migrations 040–044) and rich UI representations, but suffers from legacy prototype terminology drift in older files. 

**Recommendation:** Execute Phase 70 to establish immutable canonical definitions, deprecate heuristic calculations in `hospitalUtils.js`, and standardize terminology across all dashboards and reports.

