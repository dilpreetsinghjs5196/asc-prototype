# PHASE 67 — EXCEPTION AND CARVE-OUT SPECIFICATION
## Comprehensive Business Rules for Stop-Loss, Carve-Outs, and Contract Exceptions

> **Module:** Commercial Rate Rules & Financial Adjudication Engine  
> **Target Migration:** `043_payer_contract_rate_rules.sql` (Planning Reference Only)  
> **Status:** PRODUCTION SPECIFICATION — READ-ONLY AUDIT STAGE  
> **Upstream Dependencies:** Phases 60–66 Verified

---

## 1. Executive Summary & Architectural Scope

In commercial ASC contracting, boilerplate fee schedules cover approximately 70–80% of standard case volume. The remaining 20–30% of surgical encounters involve complex high-cost scenarios, specialized implants, unlisted procedures, or catastrophic clinical emergencies. These cases are governed by **Contractual Exceptions**, **Stop-Loss Provisions**, and **Itemized Carve-Outs**.

If an analytical platform fails to model these contractual mechanisms with mathematical precision, it will severely underestimate or overestimate net revenue, misinform surgeon case costing, and fail post-payment revenue audits.

This document establishes the production specifications for:
1. **Catastrophic Stop-Loss Provisions**
2. **Minimum Allowable Floor Safeguards**
3. **Surgical Implant & Device Carve-Out Rules**
4. **High-Cost Biologics & Specialty Pharmaceuticals**
5. **Surgeon-Specific & Procedure-Specific Carve-Outs**
6. **Unlisted Procedure Adjudication Rules**

---

## 2. Catastrophic Stop-Loss Provisions

### 2.1 Purpose & Industry Context
Stop-loss provisions protect the ASC from catastrophic financial losses resulting from highly complex, prolonged, or supply-intensive surgeries where standard prospective fee schedules would not cover basic operational expenses.

### 2.2 Trigger & Settlement Mechanics
A stop-loss clause contains two distinct parameters:
1. **Stop-Loss Trigger Threshold (`trigger_threshold`):** A dollar threshold of Total Gross Billed Charges (e.g., \$65,000.00).
2. **Stop-Loss Settlement Percentage (`reimbursement_pct_of_billed`):** A percentage of Total Gross Charges paid in lieu of (or in addition to) standard fee schedules (e.g., 65.00%).

#### Mathematical Types of Stop-Loss Clauses:
- **Type A: Comprehensive Charge Conversion (Most Common):**
  When Total Gross Charges $\ge$ Threshold, standard fee schedules are superseded, and the *entire claim* is paid at the negotiated percentage:
  $$\text{Encounter Allowable} = \text{Total Gross Billed Charges} \times \text{Settlement Percentage}$$
- **Type B: Corridor / Incremental Excess Model:**
  Standard fee schedule applies to the base threshold, and the settlement percentage applies *only to the excess charges above the threshold*:
  $$\text{Encounter Allowable} = \text{Standard Base Allowable} + [(\text{Total Charges} - \text{Threshold}) \times \text{Excess Percentage}]$$
- **Type C: Carve-Out Segregated Model:**
  High-cost implants are deducted from gross charges before evaluating the threshold, preventing implant markup inflation from artificially triggering stop-loss:
  $$\text{Adjusted Charges} = \text{Total Charges} - \text{Implant Billed Charges}$$
  $$\text{Trigger Condition} = \text{Adjusted Charges} \ge \text{Threshold}$$

### 2.3 Stop-Loss Validation Guardrails
1. **Chargemaster Authenticity:** Gross charges must originate from the approved facility chargemaster (`facility_chargemaster`). Manual charge inflation by billing staff to breach a stop-loss threshold is strictly flagged by system audit triggers.
2. **Documentation Requirement:** Claims settling under stop-loss require mandatory operative note attachment and itemized supply logs.

---

## 3. Surgical Implant & Device Carve-Out Architecture

### 3.1 Definition of Eligible Carve-Out Items
Commercial contracts explicitly define what qualifies as an implant carve-out. The system enforces strict category validation to prevent billing routine surgical supplies as implants:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       IMPLANT CARVE-OUT ELIGIBILITY MATRIX                      │
├──────────────────────────────────────┬──────────────────────────────────────────┤
│ ELIGIBLE (Carve-Out Payable)         │ INELIGIBLE (Routine Supply - Packaged)   │
├──────────────────────────────────────┼──────────────────────────────────────────┤
│ - Titanium bone plates & screws      │ - Sutures, staples, needles              │
│ - Suture anchors & interference scws │ - Scalpel blades, trocars, cannulas      │
│ - Interbody spine fusion cages       │ - Drapes, gowns, gloves, PPE             │
│ - Artificial joint prostheses (hip)  │ - Viscoelastic substances (standard)     │
│ - Neurostimulator pulse generators   │ - Hemostatic agents (Surgicel, Gelfoam)  │
│ - Vascular stents & embolization     │ - IV fluids, tubing, suction canisters   │
│ - Demineralized bone matrix (DBM)    │ - Irrigation solutions (saline, water)   │
└──────────────────────────────────────┴──────────────────────────────────────────┘
```

### 3.2 Reimbursement Models & Mathematical Formulas

1. **`PASS_THROUGH_AT_COST` (Net Invoice Pass-Through):**
   $$\text{Allowable} = \sum \text{Verified Acquisition Cost}$$
   *Rule:* No markup permitted. Payer reimburses exact invoiced cost.

2. **`INVOICE_PLUS_PERCENT` (Cost Plus Percentage Markup):**
   $$\text{Allowable} = \sum \text{Verified Acquisition Cost} \times (1.0000 + \text{Markup Percentage})$$
   *Standard Industry Range:* 10.00% to 15.00% markup (e.g., `0.1000` $\rightarrow$ 110%).

3. **`INVOICE_PLUS_FIXED_FEE` (Cost Plus Handling Fee):**
   $$\text{Allowable} = \sum \text{Verified Acquisition Cost} + \text{Fixed Handling Fee}$$
   *Use Case:* Contracts providing \$150.00 flat handling fee per case containing implants.

4. **`FEE_SCHEDULE_FIXED` (HCPCS C-Code Schedule):**
   $$\text{Allowable} = \sum \text{Contracted Rate for HCPCS Code (e.g., C1713, C1769)}$$

### 3.3 De Minimis Thresholds (Item vs. Case)
- **Item Level De Minimis (`min_invoice_threshold_per_item`):**
  If an individual screw or washer costs \$45.00 and the contract threshold is \$250.00, the item is **packaged into the surgical facility fee** and receives \$0.00 separate allowable.
- **Encounter Aggregate De Minimis (`min_encounter_threshold`):**
  Certain contracts stipulate that implants are only carved out if total qualifying implant costs exceed a minimum threshold (e.g., \$1,000.00 per surgery). If the total is \$850.00, all implants are packaged into the surgical base rate.

### 3.4 Verification & Document Linking Pipeline
Every carved-out line item in `payer_contract_rate_calculation_lines` must maintain foreign key integrity with:
1. `case_implants.id`: Clinical documentation of serial/lot number and patient implantation.
2. `vendor_invoices.id`: Actual supplier invoice detailing unit purchase price.
3. If no vendor invoice is attached within 48 hours of surgery, the system raises warning `IMPLANT_INVOICE_MISSING` and prevents claim finalization.

---

## 4. Minimum Allowable Floor Safeguards

### 4.1 Purpose
In multi-procedure cases or cases with heavy secondary discounting, cascading percentage reductions can drive line-item reimbursement below the direct variable cost of disposables, drugs, and sterile processing.

### 4.2 Floor Enforcement Rule
When `payer_contract_rate_exceptions.exception_type = 'MINIMUM_ALLOWABLE_PER_CASE'`:
$$\text{Calculated Allowable} = \max(\text{Sum of Adjudicated Lines}, \text{Minimum Floor Amount})$$
*Example:*
- Adjudicated CPT Lines Total = \$840.00
- Contract Minimum Allowable Floor = \$1,200.00
- **Final Committed Allowable** = **\$1,200.00**
- *Audit Trace:* The engine records a + \$360.00 floor adjustment entry in `payer_contract_rate_calculation_lines` with line type `MINIMUM_ALLOWABLE_ADJUSTMENT`.

---

## 5. Specialty, Surgeon, and Procedure Overrides

Commercial agreements occasionally incorporate carve-out exhibits negotiated for specific high-volume surgical specialties or individual renowned surgeons:

### 5.1 Surgeon-Specific Multiplier Overrides
- Contract specifies: Standard orthopedic multiplier = 175% of Medicare.
- Surgeon Exception: Surgeries performed by Dr. Sarah Jenkins (NPI `1841294819`) reimbursed at **215% of Medicare** due to exclusive specialized technique.
- *Resolution:* When resolving contract version terms, `fn_resolve_contract_rate` checks `surgeon_npi` against `payer_contract_rate_exceptions`.

### 5.2 Unlisted Procedure Codes (e.g., CPT 29999, 64999)
- Unlisted surgical codes do not appear in published CMS addenda or contracted fee schedules.
- Contract Rule: Unlisted procedures are reimbursed at **60.00% of Billed Charges** subject to:
  1. Mandatory submission of operative report.
  2. Manual pricing review flag: `NEEDS_MANUAL_ADJUDICATION_REVIEW`.
  3. Pre-authorization verification check.

---

## 6. Conflict Resolution & Precedence Architecture

When multiple exceptions and rules match an encounter, the engine resolves them using a strict priority ranking:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     EXCEPTION EVALUATION PRECEDENCE HIERARCHY                   │
├──────┬───────────────────────────────┬──────────────────────────────────────────┤
│ Rank │ Exception Class               │ Action on Match                          │
├──────┼───────────────────────────────┼──────────────────────────────────────────┤
│ 1    │ Catastrophic Stop-Loss        │ Overrides all fee schedules & cascades   │
│ 2    │ Excluded / Non-Covered CPT    │ Line allowable set to $0.00; non-covered │
│ 3    │ Surgeon-Specific Override     │ Replaces standard contract multiplier    │
│ 4    │ Bundled Case Rate Package     │ Packages secondary defined codes to $0   │
│ 5    │ Specific CPT Exception Line   │ Replaces standard fee schedule rate      │
│ 6    │ Implant / Device Carve-Out    │ Evaluates invoice + markup for devices   │
│ 7    │ Minimum Allowable Floor       │ Clamps encounter total to contract floor │
└──────┴───────────────────────────────┴──────────────────────────────────────────┘
```

