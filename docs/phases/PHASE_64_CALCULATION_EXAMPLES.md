# PHASE 64 — CALCULATION EXAMPLES & ARITHMETIC PROOFS
## Deterministic Mathematical Examples for Multi-Procedure ASC Reimbursement

**Facility Context for Examples**: Naples Surgery Center  
**CBSA**: 34940 (Naples-Immokalee-Marco Island, FL)  
**CY 2026 Wage Index**: `0.9412`  
**ASCQR Status**: Compliant (no 2.0% quality penalty unless specified)  
**Labor Share**: 50% (0.50) | **Non-Labor Share**: 50% (0.50)  
**Statutory Authority**: 42 CFR § 416.171–172, CY 2026 CMS-1823-FC

---

## Example 1: Standard Dual-Surgical Procedure (Covered Surgical A2)

### Clinical Encounter
- **Line 1**: CPT `29881` — Knee Arthroscopy with Meniscectomy (Indicator `A2`, National Rate `$1,650.00`, 1 unit)
- **Line 2**: CPT `29877` — Knee Arthroscopy with Chondroplasty (Indicator `A2`, National Rate `$1,120.00`, 1 unit)

### Step 1: Geographic Wage Adjustment
- CPT 29881 Adjusted Allowable:
  $$\text{Adjusted Rate} = (1650.00 \times 0.50 \times 0.9412) + (1650.00 \times 0.50) = 776.49 + 825.00 = \$1,601.49$$
- CPT 29877 Adjusted Allowable:
  $$\text{Adjusted Rate} = (1120.00 \times 0.50 \times 0.9412) + (1120.00 \times 0.50) = 527.072 + 560.00 = \$1,087.07$$

### Step 2: Payment Ranking
1. **Rank 1**: CPT `29881` (Allowable: `$1,601.49`) -> Primary Surgical Line
2. **Rank 2**: CPT `29877` (Allowable: `$1,087.07`) -> Secondary Surgical Line

### Step 3: MPPR Reduction Application
- **Line 1 (Rank 1)**: Paid at **100%**
  $$\text{Line 1 Reimbursement} = \$1,601.49 \times 1.00 = \$1,601.49$$
- **Line 2 (Rank 2)**: Paid at **50%**
  $$\text{Line 2 Reimbursement} = \text{ROUND}(\$1,087.07 \times 0.50, 2) = \$543.54$$

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$1,601.49 + \$543.54 = \mathbf{\$2,145.03}$$
- **MPPR Reduction Amount**: $\$1,087.07 - \$543.54 = \$543.53$

---

## Example 2: Primary Device-Intensive (J8) + Secondary Standard Surgical (A2)

### Clinical Encounter
- **Line 1**: CPT `27447` — Total Knee Arthroplasty (Indicator `J8`, National Rate `$10,500.00`, Device Offset `33.15%`, 1 unit)
- **Line 2**: CPT `29881` — Knee Arthroscopy (Indicator `A2`, National Rate `$1,650.00`, 1 unit)

### Step 1: Procedure Allowables Calculation
- **CPT 27447 (J8)**:
  - Device Offset: $\text{ROUND}(10500.00 \times 0.3315, 2) = \$3,480.75$ (Exempt from wage adjustment).
  - Unadjusted Service: $10500.00 - 3480.75 = \$7,019.25$.
  - Adjusted Service: $(7019.25 \times 0.50 \times 0.9412) + (7019.25 \times 0.50) = 3303.26 + 3509.63 = \$6,812.88$.
  - Single-Unit Allowable: $\$3,480.75 + \$6,812.88 = \$10,293.63$.
- **CPT 29881 (A2)**:
  - Adjusted Allowable: $\$1,601.49$.

### Step 2: Payment Ranking
1. **Rank 1**: CPT `27447` (Allowable: `$10,293.63`)
2. **Rank 2**: CPT `29881` (Allowable: `$1,601.49`)

### Step 3: MPPR Application
- **Line 1 (Rank 1 - J8 Primary)**:
  - Paid at **100%**: $\$10,293.63$ (Device Offset $\$3,480.75$ + Service Share $\$6,812.88$).
- **Line 2 (Rank 2 - A2 Secondary)**:
  - Paid at **50%**: $\text{ROUND}(\$1,601.49 \times 0.50, 2) = \$800.75$.

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$10,293.63 + \$800.75 = \mathbf{\$11,094.38}$$

---

## Example 3: Secondary Device-Intensive Procedure (42 CFR § 416.171(b)(2) Carve-Out)

### Clinical Encounter
- **Line 1**: CPT `22856` — Cervical Disc Arthroplasty (Indicator `J8`, National Rate `$12,800.00`, Device Offset `42.50%`, 1 unit)
- **Line 2**: CPT `27447` — Total Knee Arthroplasty (Indicator `J8`, National Rate `$10,500.00`, Device Offset `33.15%`, 1 unit)

### Step 1: Procedure Allowables Calculation
- **CPT 22856 (Line 1)**:
  - Device Offset: $\text{ROUND}(12800.00 \times 0.4250, 2) = \$5,440.00$.
  - Unadjusted Service: $12800.00 - 5440.00 = \$7,360.00$.
  - Adjusted Service: $(7360.00 \times 0.50 \times 0.9412) + (7360.00 \times 0.50) = 3463.62 + 3680.00 = \$7,143.62$.
  - Allowable: $\$5,440.00 + \$7,143.62 = \$12,583.62$.
- **CPT 27447 (Line 2)**:
  - Device Offset: $\$3,480.75$.
  - Adjusted Service: $\$6,812.88$.
  - Allowable: $\$10,293.63$.

### Step 2: Payment Ranking
1. **Rank 1**: CPT `22856` (Allowable: `$12,583.62`)
2. **Rank 2**: CPT `27447` (Allowable: `$10,293.63`)

### Step 3: MPPR Application with Device Carve-Out
- **Line 1 (Rank 1)**: Paid at **100%**
  $$\text{Line 1 Payment} = \$12,583.62$$
- **Line 2 (Rank 2 - Secondary J8 Procedure)**:
  - **Device Offset**: Paid at **100%** (Protected by 42 CFR § 416.171(b)(2)):
    $$\text{Device Payment} = \$3,480.75$$
  - **Service Share**: Paid at **50%**:
    $$\text{Service Payment} = \text{ROUND}(\$6,812.88 \times 0.50, 2) = \$3,406.44$$
  - **Total Line 2 Payment**:
    $$\text{Line 2 Payment} = \$3,480.75 + \$3,406.44 = \$6,887.19$$

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$12,583.62 + \$6,887.19 = \mathbf{\$19,470.81}$$
- **Auditable Contrast**: If device offset were illegally reduced by 50%, payment would be $\$10,293.63 \times 0.50 = \$5,146.82$. The statutory carve-out recovers **`$1,740.37`** in legitimate device costs for the ASC!

---

## Example 4: Bilateral Procedure (Modifier 50) + Secondary Unilateral Procedure

### Clinical Encounter
- **Line 1**: CPT `64483` — Transforaminal Epidural Injection (Indicator `A2`, National Rate `$450.00`, Modifier `50`, 1 unit)
- **Line 2**: CPT `64490` — Facet Joint Injection (Indicator `A2`, National Rate `$380.00`, 1 unit)

### Step 1: Base Allowable & Bilateral Adjustment
- CPT 64483 Single Base Allowable:
  $$\text{Adjusted Rate} = (450.00 \times 0.50 \times 0.9412) + (450.00 \times 0.50) = 211.77 + 225.00 = \$436.77$$
- CPT 64483 Bilateral Allowable (150% under single-line billing):
  $$\text{Bilateral Allowable} = \text{ROUND}(\$436.77 \times 1.50, 2) = \$655.16$$
- CPT 64490 Unilateral Allowable:
  $$\text{Adjusted Rate} = (380.00 \times 0.50 \times 0.9412) + (380.00 \times 0.50) = 178.83 + 190.00 = \$368.83$$

### Step 2: Payment Ranking
1. **Rank 1**: CPT `64483-50` (Allowable: `$655.16`) -> Primary Surgical Line
2. **Rank 2**: CPT `64490` (Allowable: `$368.83`) -> Secondary Surgical Line

### Step 3: MPPR Application
- **Line 1 (Rank 1)**: Paid at **100% of Bilateral Allowable**:
  $$\text{Line 1 Payment} = \$655.16$$
- **Line 2 (Rank 2)**: Paid at **50% of Unilateral Allowable**:
  $$\text{Line 2 Payment} = \text{ROUND}(\$368.83 \times 0.50, 2) = \$184.42$$

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$655.16 + \$184.42 = \mathbf{\$839.58}$$

---

## Example 5: Primary Procedure with Multiple Units + Secondary Procedure

### Clinical Encounter
- **Line 1**: CPT `11402` — Excision Benign Lesion (Indicator `A2`, National Rate `$220.00`, **2 units**)
- **Line 2**: CPT `12031` — Intermediate Wound Repair (Indicator `A2`, National Rate `$180.00`, 1 unit)

### Step 1: Base Allowables Calculation
- CPT 11402 Adjusted Allowable per unit:
  $$\text{Adjusted Rate} = (220.00 \times 0.50 \times 0.9412) + (220.00 \times 0.50) = 103.53 + 110.00 = \$213.53$$
- CPT 12031 Adjusted Allowable per unit:
  $$\text{Adjusted Rate} = (180.00 \times 0.50 \times 0.9412) + (180.00 \times 0.50) = 84.71 + 90.00 = \$174.71$$

### Step 2: Payment Ranking
1. **Rank 1**: CPT `11402` (Allowable: `$213.53`)
2. **Rank 2**: CPT `12031` (Allowable: `$174.71`)

### Step 3: MPPR Application Across Multiple Units
- **Line 1 (Rank 1 with 2 units)**:
  - Unit 1 gets **100%**: $\$213.53$
  - Unit 2 gets **50%**: $\text{ROUND}(\$213.53 \times 0.50, 2) = \$106.77$
  - Line 1 Total: $\$213.53 + \$106.77 = \$320.30$
- **Line 2 (Rank 2 with 1 unit)**:
  - Unit 1 gets **50%**: $\text{ROUND}(\$174.71 \times 0.50, 2) = \$87.36$

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$320.30 + \$87.36 = \mathbf{\$407.66}$$

---

## Example 6: Complex Encounter: Surgical + Add-On (+) + Packaged (N1) + Implant C-Code

### Clinical Encounter
- **Line 1**: CPT `22856` — Cervical Disc Arthroplasty (Indicator `J8`, Rate `$12,800.00`, Offset `42.50%`, 1 unit)
- **Line 2**: CPT `+22845` — Anterior Instrumentation, 2–3 Vertebral Segments (Add-on code `+`, Rate `$980.00`, 1 unit)
- **Line 3**: CPT `C1776` — Joint Implantable Device (Packaged C-Code, Indicator `N1`, Gross Charge `$14,500.00`, 1 unit)
- **Line 4**: CPT `20926` — Tissue Graft (Indicator `A2`, Rate `$1,400.00`, 1 unit)

### Step 1: Line Item Classification & Eligibility
- **Line 3 (`C1776`)**: Category A (Packaged N1). **Excluded from MPPR**. Allowable = `$0.00`.
- **Line 2 (`+22845`)**: Category D (Add-on `+`). **Exempt from MPPR**. Paid at 100% of adjusted rate:
  $$\text{Adjusted Rate} = (980.00 \times 0.50 \times 0.9412) + (980.00 \times 0.50) = 461.19 + 490.00 = \$951.19$$
- **Line 1 (`22856`)**: Category F (Surgical J8). Allowable = $\$12,583.62$ (Offset $\$5,440.00$ + Service $\$7,143.62$).
- **Line 4 (`20926`)**: Category F (Surgical A2). Adjusted Rate:
  $$\text{Adjusted Rate} = (1400.00 \times 0.50 \times 0.9412) + (1400.00 \times 0.50) = 658.84 + 700.00 = \$1,358.84$$

### Step 2: Payment Ranking (Category F lines only)
1. **Rank 1**: CPT `22856` (Allowable: `$12,583.62`)
2. **Rank 2**: CPT `20926` (Allowable: `$1,358.84`)

### Step 3: MPPR Calculations
- **Line 1 (Rank 1 - J8 Primary)**: Paid at **100%** = $\$12,583.62$
- **Line 2 (Add-On `+`)**: Paid at **100%** = $\$951.19$
- **Line 3 (Packaged `N1`)**: Paid at **$0.00** = $\$0.00$
- **Line 4 (Rank 2 - A2 Secondary)**: Paid at **50%** = $\text{ROUND}(\$1,358.84 \times 0.50, 2) = \$679.42$

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$12,583.62 + \$951.19 + \$0.00 + \$679.42 = \mathbf{\$14,214.23}$$

---

## Example 7: Endoscopy Family Base-Code Deduction (42 CFR § 416.172(c))

### Clinical Encounter
- **Base Code**: CPT `45378` — Diagnostic Colonoscopy (Base Rate: `$420.00`)
- **Line 1**: CPT `45381` — Colonoscopy with Submucosal Injection (Rate: `$680.00`, Family ID 15)
- **Line 2**: CPT `45380` — Colonoscopy with Biopsy (Rate: `$550.00`, Family ID 15)

### Step 1: Base Allowable Resolution (Naples Wage Index 0.9412)
- CPT 45378 (Base): $(420 \times 0.50 \times 0.9412) + (420 \times 0.50) = 197.65 + 210.00 = \$407.65$
- CPT 45381 (Line 1): $(680 \times 0.50 \times 0.9412) + (680 \times 0.50) = 320.01 + 340.00 = \$660.01$
- CPT 45380 (Line 2): $(550 \times 0.50 \times 0.9412) + (550 \times 0.50) = 258.83 + 275.00 = \$533.83$

### Step 2: Payment Ranking
1. **Rank 1**: CPT `45381` (Highest in Family) -> Full Allowable
2. **Rank 2**: CPT `45380` (Same Family) -> Base Code Difference

### Step 3: Statutory Endoscopy Reimbursement Calculation
- **Line 1 (CPT 45381)**: Paid at **100%**:
  $$\text{Line 1 Payment} = \$660.01$$
- **Line 2 (CPT 45380)**: Paid at **Difference between Line 2 and Base Code**:
  $$\text{Line 2 Payment} = \$533.83 - \$407.65 = \$126.18$$

### Step 4: Final Encounter Total
$$\text{Total Medicare ASC Payment} = \$660.01 + \$126.18 = \mathbf{\$786.19}$$

---

## Example 8: Commercial Payer 4-Tier Cascade (100% / 50% / 25% / 0%)

### Clinical Encounter (Payer: Aetna Healthcare, Rule Set `COM-STD-50`)
- **Line 1**: CPT `29881` — Knee Arthroscopy (Contract Rate: `$3,200.00`, 1 unit)
- **Line 2**: CPT `29877` — Chondroplasty (Contract Rate: `$1,800.00`, 1 unit)
- **Line 3**: CPT `29875` — Synovectomy (Contract Rate: `$1,200.00`, 1 unit)
- **Line 4**: CPT `29874` — Loose Body Removal (Contract Rate: `$950.00`, 1 unit)

### Step 1: Payment Ranking (Contract Rate DESC)
1. **Rank 1**: CPT `29881` (`$3,200.00`)
2. **Rank 2**: CPT `29877` (`$1,800.00`)
3. **Rank 3**: CPT `29875` (`$1,200.00`)
4. **Rank 4**: CPT `29874` (`$950.00`)

### Step 2: Commercial Cascade Application
- **Line 1 (Rank 1 - 100%)**: $\$3,200.00 \times 1.00 = \$3,200.00$
- **Line 2 (Rank 2 - 50%)**: $\$1,800.00 \times 0.50 = \$900.00$ (Requires Modifier `51`)
- **Line 3 (Rank 3 - 25%)**: $\$1,200.00 \times 0.25 = \$300.00$ (Requires Modifier `51`)
- **Line 4 (Rank 4 - 0%)**: $\$950.00 \times 0.00 = \$0.00$ (Requires Modifier `51` / Bundled)

### Step 3: Final Commercial Encounter Total
$$\text{Total Commercial Reimbursement} = \$3,200.00 + \$900.00 + \$300.00 + \$0.00 = \mathbf{\$4,400.00}$$
- **Total Contractual Discount Deducted**: $\$7,150.00 - \$4,400.00 = \$2,750.00$

