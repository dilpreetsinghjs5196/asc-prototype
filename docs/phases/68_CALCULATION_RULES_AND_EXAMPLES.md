# PHASE 68 — CALCULATION RULES AND CLINICAL CASE EXAMPLES
## Deterministic Mathematical Specifications & End-to-End Adjudication Scenarios

> **Phase:** 68 — Expected Reimbursement Engine  
> **Author:** Principal Healthcare Revenue Cycle Architect, Senior Reimbursement Specialist  
> **Status:** PRODUCTION CALCULATION SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  

---

## 1. DETERMINISTIC CALCULATION RULES & CONSTRAINTS

### 1.1 Precision, Types, and Rounding
- All financial monetary amounts must be stored and evaluated as `NUMERIC(12, 2)` (two decimal places).
- Multipliers, percentages, and wage indices must be stored and evaluated as `NUMERIC(6, 4)` (four decimal places).
- Floating point (`FLOAT`, `DOUBLE PRECISION`, or IEEE 754 `Number` in JS) arithmetic is **strictly prohibited** in authoritative financial engines.
- Intermediate multiplication rounding must follow **Round Half-Up** (`ROUND(val, 2)`).

### 1.2 The Ten-Step Authoritative Adjudication Cascade
1. **Context Resolution:** Load encounter DOS, facility, primary payer, patient health plan, line procedures, and implanted devices.
2. **Contract Version Lock:** Resolve single approved, active contract version valid for facility and DOS.
3. **Catastrophic Stop-Loss Assessment:** Evaluate total gross billed charges against contract exception stop-loss threshold. If triggered, bypass line-item fee schedule and apply agreed percentage of billed charges across the entire case.
4. **Case Rate Packaging Identification:** Identify primary CPT. If covered under an active case rate bundle, price the case rate package and mark all bundled secondary procedures as packaged (`$0.00` line allowable).
5. **Implant Carve-Out Evaluation:** Identify billable implants. Verify invoice cost $\ge$ minimum carve-out threshold (e.g. $\$250.00$). Compute carve-out reimbursement (e.g. Invoice Cost $+ 10.0\%$).
6. **CPT Pricing Resolution:** For unbundled procedures, resolve rate via:
   - Line CPT Fee Schedule (negotiated dollar rate), OR
   - Percent of Medicare (Medicare Wage-Adjusted Baseline $\times$ Multiplier), OR
   - Percent of Billed Charges (Gross Charge $\times$ (1.0000 - Discount Pct)).
7. **J8 Device Offset Protection:** If a procedure is CMS Payment Indicator `J8` and implants are carved out separately, deduct the statutory CMS device offset from the Medicare baseline before applying the contract multiplier to prevent paying for the device twice.
8. **Modifier Adjustment:** Apply bilateral (Modifier 50 @ 150% standard, or 200% exception) or discontinued surgery reductions (Modifier 73 @ 50%, Modifier 74 @ 100%).
9. **Multiple Procedure Payment Reduction (MPPR):** Sort eligible surgical lines by base allowable descending. Apply contract `mppr_rule_set_code` multipliers (Rank 1: 100%, Rank 2: 50%, Rank 3: 25%, Rank 4+: 0%). Add-on codes (`+`) are exempt from reduction.
10. **Patient Responsibility & Net Payer Partitioning:** Calculate patient copay, coinsurance, and deductible. Compute:
    $$\text{Estimated Payer Reimbursement} = \text{Total Contract Allowable} - \text{Estimated Patient Responsibility}$$
    $$\text{Expected Contribution Margin} = \text{Total Contract Allowable} - \text{Facility Acquisition Cost}$$

---

## 2. DETAILED MATHEMATICAL FORMULAS

### 2.1 Medicare ASC Baseline Wage Adjustment (Phase 60 & 62)
$$\text{Wage-Adjusted Baseline} = (\text{Unadjusted Rate} \times 0.5000 \times \text{CBSA Wage Index}) + (\text{Unadjusted Rate} \times 0.5000)$$

### 2.2 Percent of Medicare with J8 Device Offset Carve-Out (Phase 63 & 67)
When implants are carved out separately:
$$\text{Adjusted Procedural Baseline} = \text{Wage-Adjusted Baseline} - \text{CMS Device Offset Amount}$$
$$\text{Line CPT Allowable} = \text{Adjusted Procedural Baseline} \times \text{Contract Multiplier}$$
$$\text{Total Case Allowable} = \text{Line CPT Allowable} + \text{Implant Carve-Out Reimbursement}$$

### 2.3 Multiple Procedure Payment Reduction (Phase 64)
For non-exempt surgical procedures ordered by unreduced base allowable:
$$\text{Line Allowable} = \text{Base Allowable} \times \text{Tier Multiplier (Rank)}$$

### 2.4 Implant Carve-Out Reimbursement (Phase 67)
For implants where $\text{Invoice Unit Cost} \ge \text{Threshold}$:
$$\text{Carve-Out Reimbursement} = \sum (\text{Invoice Unit Cost} \times \text{Quantity}) \times (1.0000 + \text{Contract Markup Pct})$$

---

## 3. FIVE COMPREHENSIVE CLINICAL CASE STUDIES

---

### Case Study 1: Complex Shoulder Arthroscopy with J8 Device Carve-Out
- **Patient:** 54-year-old male, Right Shoulder Rotator Cuff Tear & Biceps Tendonitis
- **Facility:** Naples Surgery Center (CBSA 34940, Wage Index `0.9412`)
- **Payer:** Blue Cross Blue Shield Commercial PPO 2026
- **Contract Terms:** 
  - Primary Methodology: `PERCENT_OF_MEDICARE` @ `180.00%` (Multiplier `1.8000`)
  - Implant Carve-Out: `INVOICE_PLUS_PERCENT` @ `10.0%` (Threshold `≥ $250.00`)
  - MPPR Rule Set: `COM_STD_CASCADE` (100% / 50% / 25% / 0%)
- **Procedures Submitted:**
  1. CPT `29827` (Arthroscopic Rotator Cuff Repair) — Gross Charge: $\$14,500.00$
     - CMS Addenda: National Unadjusted $\$3,450.00$, PI `A2`, No Device Offset.
  2. CPT `23430` (Biceps Tenodesis Open) — Gross Charge: $\$8,500.00$
     - CMS Addenda: National Unadjusted $\$4,850.00$, PI `J8`, CMS Device Offset $\$2,100.00$.
- **Implants Logged:**
  - 2 $\times$ PEEK Suture Anchors (SKU `AR-1927PB`), Invoice Cost: $\$950.00$ each ($\text{Total Invoice} = \$1,900.00$).
  - 1 $\times$ Tenodesis Screw (SKU `AR-1580BC`), Invoice Cost: $\$650.00$ ($\text{Total Invoice} = \$650.00$).
  - Combined Verified Implant Invoice: $\$2,550.00$.
- **Direct Operating Costs:** OR Room (75 mins @ \$14/min) = $\$1,050.00$, Labor = $\$1,125.00$, General Supplies = $\$450.00$, Implants = $\$2,550.00$. Total Cost = $\$5,175.00$.

#### Mathematical Execution:
1. **Medicare Baselines:**
   - CPT `29827`: $(3,450.00 \times 0.50 \times 0.9412) + (3,450.00 \times 0.50) = 1,623.57 + 1,725.00 = \$3,348.57$.
   - CPT `23430`: $(4,850.00 \times 0.50 \times 0.9412) + (4,850.00 \times 0.50) = 2,282.41 + 2,425.00 = \$4,707.41$.
2. **J8 Device Offset Protection:**
   - CPT `23430` is `J8`. Implants are carved out separately.
   - Deduct device offset: $\$4,707.41 - \$2,100.00 = \$2,607.41$ adjusted base rate.
3. **Unreduced Commercial Allowable:**
   - Line 1 (CPT 29827): $\$3,348.57 \times 1.8000 = \$6,027.43$.
   - Line 2 (CPT 23430): $\$2,607.41 \times 1.8000 = \$4,693.34$.
4. **MPPR Ranking & Application:**
   - Rank 1: CPT `29827` (\$6,027.43) $\rightarrow$ Paid at 100% = **`$6,027.43`**.
   - Rank 2: CPT `23430` (\$4,693.34) $\rightarrow$ Paid at 50% = **`$2,346.67`**.
   - Total Procedural Allowable = $\$6,027.43 + \$2,346.67 = \$8,374.10$.
5. **Implant Carve-Out Calculation:**
   - Hardware exceeds $\$250.00$ threshold.
   - Carve-Out Reimbursement = $\$2,550.00 \times 1.1000 = \mathbf{\$2,805.00}$.
6. **Case Totals:**
   - **Total Gross Billed Charges:** $\$23,000.00$.
   - **Contractual Expected Reimbursement:** $\$8,374.10 + \$2,805.00 = \mathbf{\$11,179.10}$.
   - **Patient Responsibility:** Deductible $\$1,000.00$ + 20% Coinsurance $(\$11,179.10 - \$1,000.00) \times 0.20 = \$2,035.82 \rightarrow \mathbf{\$3,035.82}$.
   - **Estimated Payer Reimbursement:** $\$11,179.10 - \$3,035.82 = \mathbf{\$8,143.28}$.
   - **Facility Acquisition Cost:** $\mathbf{\$5,175.00}$.
   - **Expected Facility Contribution Margin:** $\$11,179.10 - \$5,175.00 = \mathbf{\$6,004.10}$ (53.7% Net Margin).

---

### Case Study 2: Knee Arthroscopy with Secondary Chondroplasty (Commercial Fee Schedule)
- **Patient:** 42-year-old female, Left Knee Internal Derangement
- **Payer:** Humana Gold Choice PPO
- **Contract Terms:** Exhibit A Orthopedic Fee Schedule (`COMMERCIAL_FEE_SCHEDULE`), MPPR Enabled.
- **Procedures Submitted:**
  1. CPT `29881` (Knee Arthroscopy Meniscectomy) — Negotiated Rate: $\$3,200.00$. Gross: $\$7,500.00$.
  2. CPT `29877` (Knee Arthroscopy Chondroplasty) — Negotiated Rate: $\$1,800.00$. Gross: $\$4,200.00$.
- **Implants:** None. Total Direct Cost: $\$1,850.00$.

#### Mathematical Execution:
1. **Fee Schedule Rates:** CPT 29881 = $\$3,200.00$, CPT 29877 = $\$1,800.00$.
2. **MPPR Ranking:**
   - Rank 1: CPT `29881` (\$3,200.00) $\rightarrow$ Paid at 100% = **`$3,200.00`**.
   - Rank 2: CPT `29877` (\$1,800.00) $\rightarrow$ Paid at 50% = **`$900.00`**.
3. **Totals:**
   - **Total Gross Charges:** $\$11,700.00$.
   - **Contractual Expected Reimbursement:** $\mathbf{\$4,100.00}$.
   - **Contractual Write-Off:** $\$11,700.00 - \$4,100.00 = \$7,600.00$.
   - **Estimated Patient Copay:** $\$250.00$.
   - **Estimated Payer Reimbursement:** $\$4,100.00 - \$250.00 = \mathbf{\$3,850.00}$.
   - **Expected Contribution Margin:** $\$4,100.00 - \$1,850.00 = \mathbf{\$2,250.00}$ (54.9% Net Margin).

---

### Case Study 3: Bilateral Knee Arthroscopy with Modifier 50
- **Patient:** 48-year-old male, Bilateral Meniscal Tears
- **Payer:** Humana Gold Choice PPO
- **Procedures Submitted:**
  - CPT `29881-50` (Bilateral Knee Arthroscopy Meniscectomy) — 1 Unit, Modifier 50. Gross: $\$15,000.00$.
- **Contract Term:** Bilateral reimbursement standard multiplier = `150.00%` (`1.5000`).

#### Mathematical Execution:
1. **Base Negotiated Rate:** $\$3,200.00$.
2. **Modifier 50 Adjustment:** $\$3,200.00 \times 1.5000 = \mathbf{\$4,800.00}$.
3. **Totals:**
   - **Total Gross Charges:** $\$15,000.00$.
   - **Contractual Expected Reimbursement:** $\mathbf{\$4,800.00}$.
   - **Estimated Payer Reimbursement:** $\$4,800.00$ (Deductible met).
   - **Facility Cost:** $\$2,600.00$.
   - **Expected Contribution Margin:** $\$4,800.00 - \$2,600.00 = \mathbf{\$2,200.00}$ (45.8% Net Margin).

---

### Case Study 4: Cataract Case Rate Package with Elective Toric IOL Upgrade
- **Patient:** 68-year-old female, Dense Cataract with Astigmatism
- **Payer:** UnitedHealthcare Commercial PPO
- **Contract Term:** Bundled Case Rate for CPT `66984` = $\$2,250.00$ (covers facility fee and standard monofocal IOL).
- **Patient Selection:** Elective Toric Astigmatism IOL (Non-Covered Upgrade Fee = $\$1,200.00$).
- **Direct Costs:** Standard IOL acquisition = $\$150.00$; Toric IOL acquisition = $\$450.00$; OR Cost = $\$650.00$. Total Cost = $\$1,100.00$.

#### Mathematical Execution:
1. **Payer Case Rate Allowable:** $\mathbf{\$2,250.00}$.
2. **Patient Responsibility:**
   - Standard Copay: $\$100.00$.
   - Elective Non-Covered Toric Upgrade (Patient Responsibility): $\$1,200.00$.
   - Total Patient Responsibility: $\mathbf{\$1,300.00}$.
3. **Estimated Payer Reimbursement:** $\$2,250.00 - \$100.00 = \mathbf{\$2,150.00}$.
4. **Total Facility Collection (Payer + Patient):** $\$2,150.00 + \$1,300.00 = \mathbf{\$3,450.00}$.
5. **Expected Contribution Margin:** $\$3,450.00 - \$1,100.00 = \mathbf{\$2,350.00}$ (68.1% Net Margin).

---

### Case Study 5: Catastrophic Case Triggering Stop-Loss Exception
- **Patient:** 59-year-old male, Multi-level Lumbar Fusion Revision with Dural Tear
- **Payer:** Aetna Commercial Choice POS
- **Contract Terms:**
  - Standard Fee Schedule: Case Rate $\$18,500.00$.
  - Exception Stop-Loss: Trigger threshold $= \mathbf{\$35,000.00}$ Gross Billed Charges. Reimbursement rate $= \mathbf{65.00\%}$ of Billed Charges.
- **Encounter Billing:**
  - Extended OR duration (280 mins), 4 fusion cages, bone morphogenetic protein (Infuse), and dural repair matrix.
  - **Total Gross Billed Charges:** $\mathbf{\$58,400.00}$.
  - Facility Acquisition Cost: $\$21,800.00$.

#### Mathematical Execution:
1. **Stop-Loss Evaluation:**
   - Gross Billed Charges $(\$58,400.00) \ge \text{Trigger Threshold } (\$35,000.00) \rightarrow \mathbf{TRIGGERED}$.
2. **Conversion to Percent of Billed Charges:**
   - Base Case Rate of $\$18,500.00$ is superseded.
   - Settlement Allowable: $\$58,400.00 \times 0.6500 = \mathbf{\$37,960.00}$.
3. **Totals:**
   - **Contractual Expected Reimbursement:** $\mathbf{\$37,960.00}$.
   - **Calculation Status:** `STOP_LOSS_APPLIED`.
   - **Estimated Patient Coinsurance (Max OOP met):** $\$0.00$.
   - **Estimated Payer Reimbursement:** $\mathbf{\$37,960.00}$.
   - **Facility Acquisition Cost:** $\$21,800.00$.
   - **Expected Facility Contribution Margin:** $\$37,960.00 - \$21,800.00 = \mathbf{\$16,160.00}$ (42.6% Net Margin).

