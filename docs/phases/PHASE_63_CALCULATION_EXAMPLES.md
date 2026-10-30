# PHASE 63 — CALCULATION EXAMPLES & MATHEMATICAL TRACES
## Statutory Mathematical Proofs for Device-Intensive Payment Rules

**Product:** ASCANALYST Financial & Clinical Operations Platform  
**Phase:** 63 — Device-Intensive Payment Rules & Packaging Logic  
**Statutory Authority:** 42 CFR § 416.171(b)(2), 42 CFR § 416.172  
**Status:** PRODUCTION VERIFICATION REFERENCE  

---

## Example 1: Standard Total Knee Arthroplasty (J8 Device-Intensive)

### Parameters
- **CPT Code:** `27447` (Total Knee Arthroplasty)
- **Payment Indicator:** `J8`
- **National Unadjusted Rate ($R_N$):** \$10,500.00
- **CMS Empirical Device Offset Percentage ($D_{\%}$):** $33.15\%$ (`0.3315`)
- **Facility CBSA:** Naples-Immokalee-Marco Island, FL (`34940`)
- **Wage Index ($W$):** `0.9412`
- **ASCQR Quality Compliance:** Compliant (`Factor = 1.0000`)
- **Labor Share ($L$):** $50.00\%$ (`0.5000`)
- **Non-Labor Share ($NL$):** $50.00\%$ (`0.5000`)

### Step-by-Step Mathematical Trace
1. **Device Offset Dollar Amount ($D_{\$}$):**
   $$D_{\$} = \text{ROUND}(R_N \times D_{\%}, 2) = \text{ROUND}(\$10,500.00 \times 0.3315, 2) = \$3,480.75$$
   *(This \$3,480.75 is 100% exempt from geographic wage index adjustment).*

2. **Non-Device Service Portion Unadjusted ($S_{\text{unadj}}$):**
   $$S_{\text{unadj}} = R_N - D_{\$} = \$10,500.00 - \$3,480.75 = \$7,019.25$$

3. **Geographic Wage Adjustment on Service Share ($S_{\text{adj}}$):**
   $$S_{\text{adj}} = \text{ROUND}\big((S_{\text{unadj}} \times 0.50 \times 0.9412) + (S_{\text{unadj}} \times 0.50), 2\big)$$
   $$S_{\text{adj}} = \text{ROUND}(\$3,303.28 + \$3,509.63, 2) = \$6,812.91$$

4. **Authoritative Total Facility Base Rate ($R_{\text{fac}}$):**
   $$R_{\text{fac}} = D_{\$} + S_{\text{adj}} = \$3,480.75 + \$6,812.91 = \mathbf{\$10,293.66}$$

5. **Variance vs Standard (Non-Device-Intensive) Adjustment:**
   - If calculated without device protection:
     $$R_{\text{unprotected}} = \text{ROUND}((\$10,500 \times 0.50 \times 0.9412) + (\$10,500 \times 0.50), 2) = \$10,191.30$$
   - **Financial Gain from Statutory Protection:** $+\$102.36$ preserved for facility.

---

## Example 2: Neurostimulator Generator Insertion (High Device Offset)

### Parameters
- **CPT Code:** `63685` (Insertion of Spinal Neurostimulator Pulse Generator)
- **Payment Indicator:** `J8`
- **National Unadjusted Rate ($R_N$):** \$28,000.00
- **CMS Empirical Device Offset Percentage ($D_{\%}$):** $82.45\%$ (`0.8245`)
- **Facility CBSA:** Miami-Fort Lauderdale-Pompano Beach, FL (`33100`)
- **Wage Index ($W$):** `1.0125`
- **ASCQR Compliance:** Compliant (`1.0000`)

### Step-by-Step Mathematical Trace
1. **Device Offset Dollar Amount ($D_{\$}$):**
   $$D_{\$} = \text{ROUND}(\$28,000.00 \times 0.8245, 2) = \$23,086.00$$

2. **Non-Device Service Portion Unadjusted ($S_{\text{unadj}}$):**
   $$S_{\text{unadj}} = \$28,000.00 - \$23,086.00 = \$4,914.00$$

3. **Wage Adjustment on Service Portion ($S_{\text{adj}}$):**
   $$S_{\text{adj}} = \text{ROUND}\big((\$4,914.00 \times 0.50 \times 1.0125) + (\$4,914.00 \times 0.50), 2\big)$$
   $$S_{\text{adj}} = \text{ROUND}(\$2,487.71 + \$2,457.00, 2) = \$4,944.71$$

4. **Authoritative Total Facility Base Rate ($R_{\text{fac}}$):**
   $$R_{\text{fac}} = \$23,086.00 + \$4,944.71 = \mathbf{\$28,030.71}$$

---

## Example 3: ASCQR Quality Non-Compliance (-2.0% Reduction)

### Statutory Invariant (42 CFR § 416.171(a)(2))
The 2.0% penalty factor (`0.9800`) applies **strictly to the wage-adjusted service portion**. The device offset amount must **never be penalized**.

### Parameters
- **CPT Code:** `27447` (from Example 1)
- **National Rate ($R_N$):** \$10,500.00
- **Device Offset ($D_{\%}$):** $33.15\%$ ($\$3,480.75$)
- **Wage-Adjusted Service Portion ($S_{\text{adj}}$):** \$6,812.91
- **ASCQR Status:** Non-Compliant (`Factor = 0.9800`)

### Step-by-Step Mathematical Trace
1. **Device Offset Amount ($D_{\$}$):**
   $$D_{\$} = \mathbf{\$3,480.75} \quad (\text{Protected from penalty})$$

2. **Penalized Service Portion ($S_{\text{penalized}}$):**
   $$S_{\text{penalized}} = \text{ROUND}(S_{\text{adj}} \times 0.9800, 2) = \text{ROUND}(\$6,812.91 \times 0.9800, 2) = \$6,676.65$$

3. **Authoritative Total Facility Payment:**
   $$R_{\text{fac, penalized}} = \$3,480.75 + \$6,676.65 = \mathbf{\$10,157.40}$$

4. **Audit Check against Illegal Global Penalty:**
   - If entire rate were penalized illegally:
     $$\text{ROUND}(\$10,293.66 \times 0.98, 2) = \$10,087.79 \quad \mathbf{(\text{Illegal under-reimbursement by } \$69.61)}$$
   - ASCANALYST prevents this illegal underpayment.

---

## Example 4: Secondary Procedure Under MPPR (42 CFR § 416.172)

### Statutory Invariant
When a device-intensive procedure is billed as a secondary procedure subject to Multiple Procedure Payment Reduction (50% cut), the 50% reduction applies **strictly to the service portion**. The device offset amount remains **100% fully paid**.

### Scenario: Dual Surgical Case
- **Primary Procedure:** CPT `29888` (ACL Reconstruction - Indicator `A2`, Standard MPPR Primary at 100%)
- **Secondary Procedure:** CPT `28465` (Repair Tarsal Bone Fracture - Indicator `J8`, Secondary MPPR)
  - National Rate ($R_N$): \$4,671.46
  - Device Offset ($D_{\%}$): $35.00\%$
  - Facility Wage Index: `0.9412`

### Step-by-Step Mathematical Trace for Secondary Procedure `28465`
1. **Device Offset Dollar Amount ($D_{\$}$):**
   $$D_{\$} = \text{ROUND}(\$4,671.46 \times 0.3500, 2) = \mathbf{\$1,635.01} \quad \mathbf{(100\% \text{ Paid - Zero MPPR Cut})}$$

2. **Unadjusted Service Portion ($S_{\text{unadj}}$):**
   $$S_{\text{unadj}} = \$4,671.46 - \$1,635.01 = \$3,036.45$$

3. **Wage-Adjusted Service Portion at 100%:**
   $$S_{\text{adj, 100\%}} = \text{ROUND}\big((\$3,036.45 \times 0.50 \times 0.9412) + (\$3,036.45 \times 0.50), 2\big) = \$2,947.19$$

4. **Application of 50% MPPR Cut to Service Portion Only:**
   $$S_{\text{adj, secondary}} = \text{ROUND}(S_{\text{adj, 100\%}} \times 0.5000, 2) = \text{ROUND}(\$2,947.19 \times 0.50, 2) = \mathbf{\$1,473.60}$$

5. **Authoritative Secondary Procedure Total Payment:**
   $$R_{\text{secondary}} = D_{\$} + S_{\text{adj, secondary}} = \$1,635.01 + \$1,473.60 = \mathbf{\$3,108.61}$$

6. **Audit Check against Illegal MPPR Halving:**
   - If entire rate were halved illegally:
     $$\text{ROUND}(\$4,582.20 \times 0.50, 2) = \$2,291.10 \quad \mathbf{(\text{Illegal underpayment by } \$817.51)}$$
   - ASCANALYST ensures the facility receives the statutory \$3,108.61.

---

## Example 5: Margin Reconciliation — CMS Allowance vs Vendor Invoice

### Reconciliation Matrix
Compares the CMS device offset allowance against actual acquisition costs recorded in `case_device_cost_allocations`.

| Case Metric | Case A: Total Knee (`27447`) | Case B: Neurostimulator (`63685`) |
| :--- | :--- | :--- |
| **Primary CPT** | `27447` | `63685` |
| **Payment Indicator** | `J8` | `J8` |
| **CMS Device Offset Allowance ($D_{\$}$)** | **\$3,480.75** | **\$23,086.00** |
| **Implant SKU Used** | Stryker Triathlon Knee Construct | Medtronic Intellis Generator |
| **Vendor Invoice Extended Acquisition Cost** | **\$2,850.00** | **\$24,200.00** |
| **Device Reimbursement Variance (Margin)** | **+\$630.75 (Surplus)** | **-\$1,114.00 (Deficit)** |
| **Device Margin %** | **+18.12%** | **-4.83%** |
| **Actionable Decision Rule** | Construct cost covered by CMS offset | Renegotiate vendor carve-out / tier contract |

---

## Example 6: C-Code Packaging and Packaged Ancillaries ($0.00 Allowable)

### Multi-Line Claim Structure
- **Line 1 (Primary Procedure):** CPT `27447` -> Allowable: **\$10,293.66** (Indicator `J8`)
- **Line 2 (Mandatory Implant C-Code):** HCPCS `C1776` (Joint Device Implantable)
  - Gross Chargemaster Charge: \$14,500.00
  - CMS Payment Indicator: Packaged (`N1`)
  - **Authoritative Medicare Allowable: \$0.00**
  - **Contractual Write-Off:** \$14,500.00
- **Line 3 (Wound Debridement Sub-procedure):** CPT `11042`
  - Gross Chargemaster Charge: \$850.00
  - CMS Payment Indicator: Packaged into APC (`N1`)
  - **Authoritative Medicare Allowable: \$0.00**

### Invariant Audit
Gross chargemaster amounts on lines 2 and 3 (\$15,350.00 total) are **completely excluded** from Medicare reimbursement revenue. Net facility Medicare revenue is strictly **\$10,293.66**.

