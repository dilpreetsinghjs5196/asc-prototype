# PHASE 64 — MULTIPLE PROCEDURE PAYMENT RULES & REDUCTIONS SPECIFICATION
## Target Architecture, Regulatory Principles, and Authoritative Engine Design

**Specification Status**: Complete Production Specification  
**Regulatory Baseline**: 42 CFR § 416.172, CMS Claims Processing Manual Ch. 14 § 40.5, CY 2026 CMS-1823-FC  
**Target Migration**: `040_multiple_procedure_payment_rules.sql` (Planning Reference Only)

---

## 1. Purpose & Business Objective

In Ambulatory Surgery Center (ASC) billing, when multiple surgical procedures are performed during the same operative encounter, third-party payers do not reimburse 100% of the contracted or statutory fee schedule for every procedure. Reimbursement reductions reflect shared overhead, anesthesia preparation, sterile field setup, and room utilization already compensated by the primary surgical payment.

The purpose of Phase 64 is to establish a **deterministic, auditable, server-authoritative Multiple Procedure Payment Reduction (MPPR) engine** for ASCANALYST.

### Core Architectural Mandates:
1. **Server-Side Authoritative Resolution**: Elimination of competing client-side calculation heuristics. All rankings, reductions, and carve-outs must be calculated via database RPC.
2. **Statutory Ranking Invariant**: Procedure ranking must be executed **strictly by authoritative allowable payment amount** (or national unadjusted baseline where mandated), **NEVER by gross chargemaster charges or claim line sequence**.
3. **Implant Carve-Out Invariant (42 CFR § 416.171(b)(2) & § 416.172)**: When a device-intensive procedure (Payment Indicator `J8`) is subject to secondary MPPR, the 50% reduction applies **strictly to the wage-adjusted service portion**. The device offset allowance is **100% protected** and paid in full.
4. **Payer System Segmentation**: Distinguish statutory Medicare ASC rules from Hospital Outpatient (OPPS), Physician Fee Schedule (MPFS), and Commercial Payer contract cascades.
5. **Auditable Provenance**: Generate immutable calculation snapshot records for every multi-procedure encounter, preserving pre-reduction allowables, rank, reduction percentage, device carve-outs, and final payable amounts.

---

## 2. Regulatory & Payment System Segmentation

ASCANALYST must never conflate different payment systems. The engine dynamically segments rules based on encounter payer type:

```
Encounter Payer Classification
├── A. Medicare ASC (42 CFR § 416.172)
│   ├── Rank 1 (Highest Allowable): 100%
│   ├── Rank 2+ (Subsequent Surgical): 50%
│   ├── Device-Intensive (J8): 100% Device Offset + 50% Service Share
│   ├── Endoscopy Family: Base Code 100% + Family Difference
│   ├── Bilateral (Mod 50): 150% Single Line
│   ├── Add-On Codes (+): 100% Exempt
│   └── Packaged (N1): $0.00 (Exempt from Ranking)
│
├── B. Commercial Payer Contract Cascades
│   ├── Multi-Tier Cascade (e.g., 100% / 50% / 25% / 0%)
│   ├── Strict Modifier 51 Requirements
│   ├── Contractual Implant Carve-Outs (Invoice Cost + Margin)
│   └── Distinct Anatomical Site Unbundling (Modifiers 59, XS)
│
└── C. Medicaid & Worker's Compensation
    ├── State-Specific ASC Fee Schedules
    └── Fee-for-Service Secondary Multipliers (e.g., 100% / 50% / 50%)
```

### Detailed Payment System Rules:

| Dimension | Medicare ASC (42 CFR § 416.172) | Hospital OPPS (42 CFR § 419) | Physician Fee Schedule (MPFS) | Commercial Payer Contracts |
| :--- | :--- | :--- | :--- | :--- |
| **Claim Form** | Form CMS-1500 / 837P Professional/Supplier | Form CMS-1450 / UB-04 Institutional | Form CMS-1500 / 837P | Form CMS-1500 or UB-04 (Payer-specific) |
| **Primary Basis** | ASC Covered Surgical List (Addenda AA/BB) | APC Comprehensive Packaging (C-APC) | Resource-Based Relative Value Scale (RBRVS) | Contract Fee Schedule / % of Charges |
| **Ranking Methodology** | Highest Wage-Adjusted Base Rate | Comprehensive APC Status Indicator J1 Bundling | Highest Total Relative Value Units (RVUs) | Highest Contract Rate or Highest Gross Charge |
| **Secondary Reduction** | Flat 50% reduction to surgical allowable | Comprehensive packaging (100% bundled to primary) | 50% reduction to surgical practice expense | Tiered cascade: Line 2 = 50%, Line 3 = 25–50%, Line 4+ = 0–25% |
| **Device Portion Reduction** | **PROHIBITED**. Device offset paid at 100% | Packaged into comprehensive C-APC | Practice expense only; supplies bundled | Payer contract dependent (often no offset protection unless carved out) |
| **Modifier 51 Usage** | **PROHIBITED**. MACs auto-reduce; modifier 51 rejected | Not used under OPPS | Required by certain MACs | **MANDATORY** on secondary surgical lines |
| **Endoscopy Rules** | Base code difference deduction | APC packaging rules | Endoscopy family base code reduction | Payer-specific policy |

---

## 3. Deterministic Procedure Sequencing & Ranking Protocol

### Step 1: Encounter Line Item Normalization
For an encounter containing $N$ procedure lines $\{L_1, L_2, \dots, L_N\}$:
1. Normalize units: $U_i = \max(1, \text{units}_i)$.
2. Extract modifiers: $M_i = \{m \in \text{modifiers}_i\}$.
3. Resolve Payment Indicator: $\text{PI}_i$ from `public.cms_asc_addenda` or `cpt_master`.

### Step 2: Line Item Classification & Eligibility Filtering
Each line is classified into one of six mutually exclusive categories:
- **Category A: Packaged (PI = `N1` or `is_packaged = TRUE`)**:
  - Allowable payment = `$0.00`.
  - **Excluded from MPPR ranking.**
  - Receives zero payment; cost is bundled into primary surgical APC.
- **Category B: Inpatient-Only (PI = `C`)**:
  - Prohibited in ASC under 42 CFR § 416.166.
  - **Fatal Claim Scrubber Rejection (SCRUB-20).** Excluded from calculation.
- **Category C: Covered Ancillary (PI = `Z2`, `K2`)**:
  - Radiology and separately payable drugs.
  - **Statutorily exempt from surgical MPPR.** Paid at 100% of statutory rate. Excluded from surgical ranking.
- **Category D: Add-On Procedures (`is_add_on = TRUE` or CPT starts with `+`)**:
  - E.g., `+22840` (Spinal instrumentation), `+64492` (Facet injection).
  - Intra-operative overlap is already accounted for in baseline AMA/CMS relative weights.
  - **Statutorily exempt from MPPR.** Paid at 100% across all units. Excluded from surgical ranking.
- **Category E: Discontinued Procedures (Modifier `73` or `74`)**:
  - Modifier 73 (Prior to anesthesia): 50% facility fee allowable.
  - Modifier 74 (After anesthesia induction): 100% facility fee allowable.
  - Subject to ranking based on reduced starting allowable.
- **Category F: Standard & Device-Intensive Surgical (`A2`, `G2`, `P2`, `P3`, `J8`)**:
  - **MPPR-Eligible Surgical Lines.** Passed to ranking pipeline.

### Step 3: Bilateral Procedure Rate Adjustment (Prior to Ranking)
If a procedure carries **Modifier 50** or laterality `BILATERAL`:
- Verify code eligibility via `cpt_billing_rules.bilateral_indicator`:
  - `Indicator 1`: Bilateral payment applies. Statutory allowable = $\text{Base Rate} \times 150\%$.
  - `Indicator 2`: Inherently bilateral. Modifier 50 prohibited. Rate = $100\%$.
  - `Indicator 0` or `3`: Bilateral concept does not apply or radiology rules apply.
- **Enforce Single-Line Billing**: Under CMS rules, Modifier 50 must be billed on 1 line with $\text{units} = 1$. The $150\%$ multiplier covers both sides (100% primary side + 50% secondary side).

### Step 4: Strict Payment Ranking Algorithm
All Category F procedures are ranked in descending order based on their **authoritative single-unit allowable rate**:
$$\text{Rank}(L_i) = \text{Order by } \text{AllowableRate}(L_i) \text{ DESC}$$
- If two lines have identical allowable rates, deterministic tie-breaking is enforced:
  1. Primary CPT code ascending.
  2. Line number ascending.
- **Rule of Invariant**: The highest-valued procedure is assigned **Rank 1**. All subsequent lines are assigned **Rank 2, Rank 3, etc.**

### Step 5: Unit Expansion and Multiplier Application
For each ranked line $L_i$ with rank $R$ and units $U_i$:
- **If $R = 1$ (Primary Procedure)**:
  - Unit 1: Reimbursed at **100%**.
  - Subsequent Units $(U_i - 1)$ of the primary line: Reimbursed at **50%** (secondary multiplier under 42 CFR § 416.172).
- **If $R \ge 2$ (Secondary Procedure)**:
  - If **Standard Surgical (`A2`, `G2`, `P2`, `P3`)**:
    - All units reimbursed at **50%** of the wage-adjusted allowable:
      $$\text{Payment} = \text{ROUND}(\text{Allowable} \times 0.50, 2) \times U_i$$
  - If **Device-Intensive (`J8`)**:
    - Carve out protected device offset:
      $$\text{ServiceShare} = \text{Allowable} - \text{DeviceOffset}$$
      $$\text{ReducedService} = \text{ROUND}(\text{ServiceShare} \times 0.50, 2)$$
      $$\text{SecondaryPayment} = (\text{DeviceOffset} + \text{ReducedService}) \times U_i$$
    - The device offset is **never** cut by 50%.

---

## 4. Interaction Matrix with Other Payment Adjustments

The sequencing of financial rules must be strictly deterministic:

$$\text{Addendum AA Base Rate} \longrightarrow \text{Device Offset Isolation} \longrightarrow \text{Wage Index Adjustment} \longrightarrow \text{ASCQR Quality Penalty} \longrightarrow \text{MPPR Ranking \& Reduction}$$

```
┌────────────────────────────────────────────────────────┐
│ Phase 60: Resolve National Unadjusted Baseline Rate    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 63: Carve Out Device Offset Amount (if J8)       │
│ Device Offset = ROUND(National Rate × Offset %, 2)     │
│ Service Share = National Rate - Device Offset          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 62: Apply Facility Geographic Wage Adjustment    │
│ Adj Service = (Service × 0.50 × WI) + (Service × 0.50) │
│ (Device Offset is 100% Exempt from Wage Adjustment)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Quality Penalty: Apply ASCQR 2.0% Carve-Out (if penal) │
│ Penalized Service = ROUND(Adj Service × 0.98, 2)       │
│ (Device Offset is 100% Exempt from ASCQR Penalty)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 64: Apply Multiple Procedure Reduction (MPPR)    │
│ Primary (Rank 1): 100% Service + 100% Device Offset    │
│ Secondary (Rank 2+): 50% Service + 100% Device Offset  │
└────────────────────────────────────────────────────────┘
```

### Rule Interaction Invariant Table:

| Payment Rule Combination | Permitted? | Calculation Component Affected | Precedence Order | Prohibited Behaviors |
| :--- | :--- | :--- | :--- | :--- |
| **MPPR + Geographic Wage Adjustment** | **YES** | Wage adjustment applies to service portion; MPPR 50% cut applies to adjusted service portion. | 1. Wage Index<br>2. MPPR | Never apply wage index after MPPR reduction to avoid compound rounding errors. |
| **MPPR + Device-Intensive (J8)** | **YES** | 50% cut applies strictly to service share. Device offset is 100% protected. | 1. Device Carve-Out<br>2. Service Wage Adj<br>3. Service MPPR Cut | **CRITICAL: NEVER reduce device offset by 50%.** |
| **MPPR + ASCQR 2.0% Penalty** | **YES** | Both ASCQR and MPPR apply strictly to service share. | 1. Wage Adj<br>2. ASCQR (0.98)<br>3. MPPR (0.50) | Never penalize device offset by ASCQR or MPPR. |
| **MPPR + Bilateral Modifier 50** | **YES** | 150% standard allowable represents Side 1 (100%) + Side 2 (50%). | 1. Bilateral 150%<br>2. MPPR Ranking | Never bill 2 units with modifier 50. Never apply secondary 50% cut to the 150% baseline. |
| **MPPR + Packaged Service (N1)** | **NO** | N1 receives $0.00 separate allowable. | N/A (Excluded) | Never rank N1 codes in MPPR or deduct 50% from $0.00. |
| **MPPR + Add-On Code (+)** | **NO** | Add-on codes receive 100% allowable across all units. | 1. 100% Guarantee | Never apply MPPR discount to an add-on procedure. |
| **MPPR + Discontinued (Mod 73)** | **YES** | Modifier 73 reduces base allowable to 50% facility fee; ranked accordingly. | 1. Mod 73 Reduction<br>2. MPPR Ranking | Never apply duplicate cancellation penalty. |

---

## 5. Security, Permissions & Multi-Tenant Isolation

Phase 64 must enforce organization and facility tenancy across all stored procedures, APIs, and client views.

### Granular RBAC Permissions:
- `mppr.view_rules`: View facility and payer MPPR configurations.
- `mppr.view_calculations`: View line-by-line MPPR breakdown on encounters.
- `mppr.manage_payer_rules`: Author or edit commercial payer discount cascades.
- `mppr.toggle_facility_setting`: Toggle facility-level Medicare MPPR activation.
- `mppr.override_discount`: Request or apply manual override on reduced lines.
- `mppr.approve_override`: Executive sign-off for billing exceptions.
- `mppr.audit_export`: Export MPPR financial impact and discount reports.

### Multi-Tenant RLS Requirements:
1. Reference data (`cms_asc_addenda`, `cms_payment_indicators`, `cms_endoscopy_families`) is globally readable (`facility_id IS NULL`) and system-immutable.
2. Facility configuration (`facility_medicare_settings`, `mppr_rule_sets`) is scoped by `facility_id` with RLS enforced via `public.is_facility_accessible(facility_id)`.
3. Financial snapshots (`mppr_calculation_snapshots`, `mppr_calculation_lines`) are immutable financial evidence with statement-level triggers blocking `UPDATE` and `DELETE`.

