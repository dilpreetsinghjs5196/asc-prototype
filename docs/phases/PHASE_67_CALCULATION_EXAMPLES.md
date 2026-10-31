# PHASE 67 — CALCULATION EXAMPLES & TEST SCENARIOS
## Exhaustive Mathematical Case Studies for Commercial Financial Adjudication

> **Module:** Commercial Rate Rules & Financial Adjudication Engine  
> **Target Migration:** `043_payer_contract_rate_rules.sql` (Planning Reference Only)  
> **Status:** PRODUCTION SPECIFICATION — READ-ONLY AUDIT STAGE  
> **Upstream Dependencies:** Phases 60–66 Verified

---

## 1. Overview & Verification Purpose

This document provides five concrete, mathematically verified end-to-end surgical case studies illustrating how the Phase 67 calculation engine resolves and adjudicates commercial claims across diverse contracting structures.

Every calculation demonstrates:
- Exact input parameters (Facility CBSA, Wage Index, DOS, CPTs, Modifiers, Billed Charges, Invoices).
- Step-by-step arithmetic operations with intermediate values.
- Precision and rounding rules (all currency rounded half-up to exactly 2 decimal places: `ROUND(val, 2)`).
- Comparison with naive or flawed calculation models to highlight automated compliance protections.

---

## 2. Case Study 1: Shoulder Arthroscopy with Device-Intensive Tenodesis & Implant Carve-Out

### 2.1 Clinical & Contract Context
- **Patient / Case:** 54-year-old male undergoing right shoulder arthroscopic rotator cuff repair and open biceps tenodesis.
- **Facility:** Pacific Coast Surgical Institute (Los Angeles, CA).
- **CBSA Code:** 31084 (Los Angeles-Long Beach-Anaheim, CA).
- **CBSA Wage Index (2024):** `1.2841`.
- **Payer:** Anthem Blue Cross Commercial PPO.
- **Contract Version Terms:**
  - Methodology: `PERCENT_OF_MEDICARE` @ **180.00%** (`1.8000`).
  - Wage Adjustment Mode: `LOCALLY_WAGE_ADJUSTED`.
  - Benchmark: Dynamic DOS (CY 2024 CMS ASC Addenda).
  - Multiple Procedure Cascade: `CMS_STANDARD_50` (100% Primary, 50% Secondary).
  - Implant Carve-Out: `INVOICE_PLUS_PERCENT` @ **10.00%** markup (`0.1000`), threshold = \$250.00.

### 2.2 Surgical Line Items & Pricing Inputs

| Line | CPT Code | Description | Modifier | CMS PI | National Base Rate | Device Offset | Gross Billed Charge |
|:---:|:---:|:---|:---:|:---:|---:|---:|---:|
| 1 | **23430** | Biceps tenodesis, open | RT | **J8** | \$6,200.00 | \$2,100.00 | \$18,500.00 |
| 2 | **29827** | Arthroscopic rotator cuff repair | RT, 59 | **A2** | \$3,150.00 | \$0.00 | \$12,400.00 |
| 3 | **C1713** | Anchor, Arthrex Corkscrew FT (Qty: 2) | -- | -- | -- | -- | \$3,400.00 |

*Implant Verification:* 2 Arthrex suture anchors @ invoice acquisition cost of \$850.00 each = **\$1,700.00 total verified invoice cost**.

---

### 2.3 Mathematical Step-by-Step Adjudication

#### Step 1: Resolve Line 1 (CPT 23430 - Device-Intensive J8)
1. Deduct device offset from National Base Rate to isolate service component:
   $$\text{National Service Base} = \$6,200.00 - \$2,100.00 = \$4,100.00$$
2. Apply Los Angeles CBSA wage adjustment (50% labor share per 42 CFR § 416.171):
   $$\text{Labor Portion} = \$4,100.00 \times 0.50 \times 1.2841 = \$2,050.00 \times 1.2841 = \$2,632.405$$
   $$\text{Non-Labor Portion} = \$4,100.00 \times 0.50 = \$2,050.000$$
   $$\text{Wage-Adjusted Service Baseline} = \$2,632.405 + \$2,050.000 = \$4,682.405 \rightarrow \$4,682.41$$
3. Apply Contract Multiplier (180%):
   $$\text{Line 1 Service Allowable} = \$4,682.405 \times 1.8000 = \$8,428.329 \rightarrow \mathbf{\$8,428.33}$$

#### Step 2: Resolve Line 2 (CPT 29827 - Standard Surgical A2)
1. No device offset ($0.00). National Base Rate = \$3,150.00.
2. Apply Los Angeles CBSA wage adjustment:
   $$\text{Labor Portion} = \$3,150.00 \times 0.50 \times 1.2841 = \$1,575.00 \times 1.2841 = \$2,022.4575$$
   $$\text{Non-Labor Portion} = \$3,150.00 \times 0.50 = \$1,575.000$$
   $$\text{Wage-Adjusted Baseline} = \$2,022.4575 + \$1,575.000 = \$3,597.4575 \rightarrow \$3,597.46$$
3. Apply Contract Multiplier (180%):
   $$\text{Line 2 Base Allowable} = \$3,597.4575 \times 1.8000 = \$6,475.4235 \rightarrow \mathbf{\$6,475.42}$$

#### Step 3: Apply Phase 64 MPPR Cascade
- Rank lines by base allowable descending:
  - Rank 1: Line 1 (23430) allowable = \$8,428.33
  - Rank 2: Line 2 (29827) allowable = \$6,475.42
- Calculate Cascaded Allowable:
  $$\text{Line 1 Allowable (100\%)} = \$8,428.33 \times 1.0000 = \mathbf{\$8,428.33}$$
  $$\text{Line 2 Allowable (50\%)} = \$6,475.42 \times 0.5000 = \mathbf{\$3,237.71}$$

#### Step 4: Adjudicate Implant Carve-Out (C1713)
1. Verify invoice cost exceeds \$250 threshold: \$850.00 $\ge$ \$250.00 (Qualifies).
2. Apply Contract Markup (Invoice + 10%):
   $$\text{Implant Allowable} = \$1,700.00 \times (1.0000 + 0.1000) = \$1,700.00 \times 1.1000 = \mathbf{\$1,870.00}$$

#### Step 5: Final Encounter Total Allowable
$$\text{Total Allowable} = \$8,428.33 + \$3,237.71 + \$1,870.00 = \mathbf{\$13,536.04}$$

---

### 2.4 Protection Against the "Double-Dipping" Audit Clawback
If an engine fails to deduct the J8 device offset, the resulting calculation is:
- Naive Line 1: $((\$6,200 \times 0.50 \times 1.2841) + (\$6,200 \times 0.50)) \times 1.80 = \$7,080.71 \times 1.80 = \$12,745.28$.
- Total Naive Allowable: $\$12,745.28 + \$3,237.71 + \$1,870.00 = \mathbf{\$17,852.99}$.
- **Flawed Surplus:** The payer would pay **\$4,316.95 in excess reimbursement**. During retroactive audit, the payer would recoup \$4,316.95 plus interest and administrative penalties. The Phase 67 engine prevents this clawback deterministically.

---

## 3. Case Study 2: Multi-Procedure Knee Arthroscopy with Fee Schedule

### 3.1 Clinical & Contract Context
- **Patient / Case:** 42-year-old female with torn medial meniscus and articular cartilage defect.
- **Facility:** Lone Star Surgery Center (Dallas, TX).
- **Payer:** UnitedHealthcare Commercial Choice Plus.
- **Contract Version Terms:**
  - Methodology: `COMMERCIAL_FEE_SCHEDULE` (Exhibit A - Ortho 2024).
  - Multiple Procedure Cascade: `COMMERCIAL_CASCADE_25` (100% Primary, 50% Secondary, 25% Tertiary).
  - Modifier 59 / Distinct Service Policy: Paid per cascade rules.

### 3.2 Surgical Line Items & Contract Rates

| Line | CPT Code | Description | Modifier | Schedule Rate | Chargemaster Gross |
|:---:|:---:|:---|:---:|---:|---:|
| 1 | **29881** | Knee arthroscopy with medial meniscectomy | RT | \$3,200.00 | \$9,500.00 |
| 2 | **29877** | Arthroscopic debridement/chondroplasty | RT, 59 | \$1,800.00 | \$5,200.00 |
| 3 | **29870** | Diagnostic knee arthroscopy | RT | \$1,200.00 | \$3,800.00 |

### 3.3 Adjudication Steps
1. **CCI / Packaging Check:**
   - CPT 29870 (Diagnostic Scope) is an inherent component of surgical arthroscopy 29881.
   - Engine identifies CPT 29870 as `PACKAGED_PROCEDURE` per CCI edits $\rightarrow$ Line 3 Allowable = **\$0.00**.
2. **Rank Remaining Billable Surgical Procedures:**
   - Rank 1: CPT 29881 (Rate = \$3,200.00).
   - Rank 2: CPT 29877-59 (Rate = \$1,800.00).
3. **Apply Multiple Procedure Cascade:**
   - Line 1 (29881) @ 100%:
     $$\text{Allowable} = \$3,200.00 \times 1.0000 = \mathbf{\$3,200.00}$$
   - Line 2 (29877-59) @ 50%:
     $$\text{Allowable} = \$1,800.00 \times 0.5000 = \mathbf{\$900.00}$$
4. **Total Encounter Allowable:**
   $$\text{Total} = \$3,200.00 + \$900.00 + \$0.00 = \mathbf{\$4,100.00}$$
   *Contractual Write-Off:* Total Billed (\$18,500.00) - Total Allowable (\$4,100.00) = **\$14,400.00**.

---

## 4. Case Study 3: Cataract Surgery Case Rate with Non-Covered Premium IOL

### 4.1 Clinical & Contract Context
- **Patient / Case:** 68-year-old female electing cataract extraction with a toric intraocular lens for astigmatism correction.
- **Facility:** ClearView Eye Surgery Center.
- **Payer:** Cigna Commercial PPO.
- **Contract Version Terms:**
  - Methodology: `CASE_RATE` for CPT 66984.
  - Bundled Case Rate: **\$2,250.00 flat**.
  - Inclusions: Facility fee, routine supplies, viscoelastic, standard monofocal IOL (V2632 / C1713).
  - Premium Lens Policy: Patient pays out-of-pocket upgrade delta between standard monofocal and toric lens.

### 4.2 Financial Resolution Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CATARACT CASE RATE ADJUDICATION                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ PAYER CLAIM (UB-04 Facility Claim):                                             │
│  - CPT 66984 (Cataract Extraction with IOL):                                    │
│      Billed: $5,800.00  -->  Contract Allowable: $2,250.00                     │
│  - HCPCS C1713 (Standard Lens Component):                                       │
│      Billed: $800.00    -->  Allowable: $0.00 (Packaged in Case Rate)           │
│  TOTAL PAYER ALLOWABLE: $2,250.00                                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ PATIENT FINANCIAL RESPONSIBILITY (Premium Upgrade ABN / Private Pay Agreement): │
│  - Alcon AcrySof IQ Toric IOL Actual Cost:              $750.00                 │
│  - Standard Monofocal Lens Acquisition Credit:         -$150.00                 │
│  - ASC Handling & Astigmatism Analysis Premium Fee:     $400.00                 │
│  TOTAL PATIENT OUT-OF-POCKET DELTA:                     $1,000.00               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ TOTAL ASC COLLECTABLE REVENUE: $2,250.00 (Payer) + $1,000.00 (Patient) = $3,250 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The Phase 67 calculation engine records the Payer Contract Allowable as \$2,250.00 and routes the non-covered \$1,000.00 upgrade balance to `patient_responsibility_ledger` with provenance tag `PREMIUM_IOL_UPGRADE_DELTA`.

---

## 5. Case Study 4: Multi-Level Lumbar Spine Fusion with Stop-Loss Trigger

### 5.1 Clinical & Contract Context
- **Patient / Case:** 58-year-old female with spondylolisthesis undergoing 2-level lumbar fusion with interbody cages and pedicle screw instrumentation.
- **Facility:** Premier Spine & Orthopedic Institute.
- **Payer:** Humana Commercial Choice PPO.
- **Contract Terms:**
  - Standard Methodology: Commercial Fee Schedule.
  - **Catastrophic Stop-Loss Provision:** If total gross billed charges for the encounter exceed **\$75,000.00**, standard fee schedules are superseded, and the entire encounter is reimbursed at **65.00% of Total Billed Charges** (`0.6500`).

### 5.2 Surgical Coding & Chargemaster Totals

| Line | CPT / Code | Description | Standard Fee Schedule Rate | Gross Billed Charge |
|:---:|:---:|:---|---:|---:|
| 1 | **22612** | Lumbar arthrodesis, posterior | \$6,500.00 | \$24,500.00 |
| 2 | **22614** | Lumbar arthrodesis, additional level | \$3,200.00 | \$12,800.00 |
| 3 | **22842** | Posterior instrumentation (3-6 segments) | \$4,800.00 | \$18,500.00 |
| 4 | **22853** | Interbody cage insertion (2 devices) | \$3,800.00 | \$14,600.00 |
| 5 | **Hardware**| PEEK Interbody Cages & Titanium Pedicle Screws | Carve-Out (Invoice \$9,800) | \$22,400.00 |
| **TOTALS** | -- | -- | **\$28,100.00 (Standard)** | **\$92,800.00** |

### 5.3 Stop-Loss Adjudication
1. Evaluate Stop-Loss Trigger:
   $$\text{Total Gross Billed Charges} = \$92,800.00 > \$75,000.00 \text{ (Trigger Condition MET)}$$
2. Execute Stop-Loss Calculation:
   $$\text{Stop-Loss Allowable} = \$92,800.00 \times 0.6500 = \mathbf{\$60,320.00}$$
3. Financial Comparison & Impact:
   - Standard Schedule Allowable: \$28,100.00
   - Stop-Loss Settlement Allowable: \$60,320.00
   - **Net Differential Realized for ASC:** $+ \mathbf{\$32,220.00}$ (+114.6% increase).
4. Snapshot Metadata: The engine flags `calculation_status = 'STOP_LOSS_APPLIED'` and preserves the underlying line-by-line schedule rates in `calculation_metadata` for comparative reporting.

---

## 6. Case Study 5: Bilateral Carpal Tunnel Release with Modifier 50 Exception

### 6.1 Clinical & Contract Context
- **Patient / Case:** 48-year-old keyboard operator undergoing bilateral open carpal tunnel release under IV sedation.
- **Facility:** Precision Surgery Center.
- **Payer:** Blue Cross Blue Shield.
- **Billed Procedure:** CPT 64721-50 (1 unit, bilateral).
- **Contract Fee Schedule Rate:** \$1,600.00 (single wrist).
- **Gross Charge:** \$5,400.00.

### 6.2 Comparison of Standard vs. Exception Contract Language

#### Scenario A: Standard Industry Default (150% Bilateral)
- Contract specifies: "Bilateral procedures billed with Modifier 50 shall be reimbursed at 150% of the single contracted rate."
$$\text{Allowable} = \$1,600.00 \times 1.5000 = \mathbf{\$2,400.00}$$

#### Scenario B: Negotiated ASC Carve-Out Exception (200% Bilateral)
- Contract specifies in `payer_contract_rate_exceptions`: "Hand surgery CPTs 64721 and 29848 billed bilaterally shall be reimbursed at 200% of the single fee schedule rate (100% per side)."
$$\text{Allowable} = \$1,600.00 \times 2.0000 = \mathbf{\$3,200.00}$$
- **Differential:** $+ \mathbf{\$800.00}$ captured through deterministic modifier exception evaluation.

