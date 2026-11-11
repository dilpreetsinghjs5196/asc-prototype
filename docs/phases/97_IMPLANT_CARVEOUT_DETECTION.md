# 97 IMPLANT CARVEOUT DETECTION

## Purpose
Production specification for the automated detection, contractual validation, priority ranking, and dispute generation of surgical implant and medical device carve-outs in Ambulatory Surgery Centers (ASCs).

The primary operational objective is to ensure that every high-cost orthopedic prosthesis, spine hardware construct, biologics kit, arthroscopic fixation anchor, and specialty neuromodulation device consumed in the operating room is fully, accurately, and deterministically reimbursed according to negotiated commercial payer carve-out addenda.

As the operational principle states:

> **Implant acquisition costs must never be absorbed as routine surgical facility overhead when the commercial payer contract guarantees a carve-out.**  
> **An orthopedic total knee prosthesis or spinal fusion cage costing \$5,200 that is erroneously paid at \$0.00 as "bundled" or omitted from the initial 837 claim converts a profitable procedure into an immediate catastrophic financial loss for the ASC.**

---

## Scope
- Ingest clinical implant consumption records (`case_devices`, OR logs, purchase requisitions, UDI barcodes) and reconcile against 837 claim line items and 835 ERA remittances.
- Map surgical procedures and device HCPCS codes (`C1713`, `C1776`, `C1767`, `C1883`, `L8699`, etc.) to negotiated payer contract carve-out terms (`payer_contract_carve_outs`).
- Deterministically calculate expected carve-out reimbursement under 5 distinct contractual methodologies:
  1. `INVOICE_COST_PLUS_PERCENT`: Invoice Acquisition Cost $\times (1 + \text{markup\_pct})$.
  2. `PASS_THROUGH_AT_COST`: 100% of vendor manufacturer invoice cost (dollar-for-dollar).
  3. `INVOICE_PLUS_FIXED_FEE`: Invoice Acquisition Cost $+$ fixed handling fee amount.
  4. `THRESHOLD_OVERAGE_PLUS_MARKUP`: $(\text{Invoice Cost} - \text{Threshold}) \times (1 + \text{markup\_pct})$.
  5. `FEE_SCHEDULE_FIXED`: Fixed contractual fee allowance per device HCPCS code.
- Detect and classify 5 distinct carve-out leakage discrepancy types:
  1. `UNBILLED_IMPLANT`: Implant logged in OR with vendor invoice, contract specifies carve-out, but line was omitted from 837 claim.
  2. `ZERO_PAID_BUNDLED`: Implant line was billed, but payer adjudicated it at \$0.00 (CARC 97 / 45) claiming routine bundling.
  3. `MISSING_INVOICE_DENIAL`: Payer denied or pended payment (CARC 16 with RARC N225 / N432) requiring manufacturer invoice.
  4. `MARKUP_UNDERPAID`: Payer reimbursed acquisition cost but failed to apply contractually guaranteed markup percentage.
  5. `THRESHOLD_CALCULATION_ERROR`: Payer deducted an excessive deductible or per-item threshold from the carve-out allowable.
- Compute a 4-factor composite Carve-Out Priority Score ($0.00 - 100.00$) combining variance dollar size ($40\%$), documentation readiness ($25\%$), overturn likelihood ($20\%$), and filing deadline urgency ($15\%$).
- Enforce strict business invariants:
  - Expired timely filing deadlines ($<0$ days remaining) force status to `EXPIRED_UNRECOVERABLE` and urgency score to `0.00`.
  - Missing vendor invoices block external submission and route cases to `INVOICE_ACQUISITION_HOLD`.
- Generate ready-to-file dispute packets with contract section citations, vendor invoices, UDI data, and CMS-1500 / 837P line item corrections.
- Enforce multi-tenancy, Row Level Security (RLS), and RBAC access governance.

---

## Current State

Existing reusable assets:
- Phase 25 Implant Intelligence Core (`implant_catalog`): **KEEP**
- Phase 35 Case Implant Usage (`case_devices` with UDI, quantities, and waste tracking): **KEEP**
- Phase 42 Payer Contract Model (`payer_contracts`, `payer_contract_versions`): **KEEP**
- Phase 43 Payer Contract Rate Rules (`payer_contract_carve_outs`): **KEEP / EXTEND**
- Phase 44 Expected Reimbursement Engine: **KEEP**
- Phase 80 Claims Model (`claims`, `claim_lines`): **KEEP**
- Phase 82 835 Remittance Advice (`remittance_lines`): **KEEP**
- Phase 90 Revenue Leakage Lifecycle: **KEEP**
- Phase 93 Underpayment Detection Engine: **KEEP**
- Phase 93A Payment Variance Validation Engine: **KEEP**
- Phase 93C Recurring Payer Underpayment Patterns (`IMPLANT_CARVEOUT_OMISSION`): **KEEP / EXTEND**
- Phase 98 Opportunity Priority Score: **FUTURE INTEGRATION**
- Phase 99 Recoverable Revenue Work Queue: **FUTURE INTEGRATION**

Missing components addressed by Phase 97:
- Dedicated Carve-Out Discrepancy Ledger (`implant_carveout_discrepancies`): **IMPLEMENTED**
- Specialized Carve-Out Pricing & Invariant Rules (`implant_carveout_rules`): **IMPLEMENTED**
- 4-Factor Carve-Out Priority Score algorithm: **IMPLEMENTED**
- Automated Vendor Invoice & OR Log matching engine: **IMPLEMENTED**
- Corrected 837 claim / 835 dispute packet generator: **IMPLEMENTED**
- Maestro Clinical UI workbench with documentation audit inspector: **IMPLEMENTED**

---

## Target State

The engine processes only surgically verified implants and matches them against payer contract terms:

### 1. Deterministic Reimbursement Models

#### A. Invoice Cost Plus Percent (`INVOICE_COST_PLUS_PERCENT`)
$$\text{ExpectedCarveout} = \text{invoice\_cost} \times (1 + \text{markup\_percentage})$$
*Example:* Invoice cost of $\$3,800.00$ with contract markup of $12\%$ ($0.1200$) yields an allowable of $\$4,256.00$.

#### B. Pass-Through at Cost (`PASS_THROUGH_AT_COST`)
$$\text{ExpectedCarveout} = \text{invoice\_cost}$$
*Example:* Reimbursed at $100\%$ acquisition cost without markup or deduction.

#### C. Invoice Plus Fixed Fee (`INVOICE_PLUS_FIXED_FEE`)
$$\text{ExpectedCarveout} = \text{invoice\_cost} + \text{fixed\_fee\_amount}$$
*Example:* Invoice cost of $\$2,500.00$ plus $\$200.00$ handling fee yields $\$2,700.00$.

#### D. Threshold Overage Plus Markup (`THRESHOLD_OVERAGE_PLUS_MARKUP`)
$$\text{EligibleOverage} = \max(0, \text{invoice\_cost} - \text{min\_threshold})$$
$$\text{ExpectedCarveout} = \text{EligibleOverage} \times (1 + \text{markup\_percentage})$$
*Example:* Total cost of $\$6,000.00$ over a $\$1,000.00$ threshold with $10\%$ markup yields $(\$6,000 - \$1,000) \times 1.10 = \$5,500.00$.

#### E. Fee Schedule Fixed (`FEE_SCHEDULE_FIXED`)
$$\text{ExpectedCarveout} = \text{fee\_schedule\_rate} \times \text{quantity\_implanted}$$

*Reimbursement Cap Invariant:* If `max_reimbursement_cap` is defined and $>0$, the authoritative allowable is:
$$\text{FinalExpectedCarveout} = \min(\text{ExpectedCarveout}, \text{max\_reimbursement\_cap})$$

---

### 2. Deterministic Variance Invariant
$$\text{CarveoutVariance} = \max(0, \text{FinalExpectedCarveout} - \text{payer\_paid\_carveout})$$

---

### 3. Multi-Factor Carve-Out Priority Score Formula ($0.00 - 100.00$)

$$\text{PriorityScore} = (\text{VarianceScore} \times 0.40) + (\text{DocumentationScore} \times 0.25) + (\text{LikelihoodScore} \times 0.20) + (\text{UrgencyScore} \times 0.15)$$

#### A. Variance Score ($40\%$ Weight)
Evaluates financial magnitude relative to ASC high-cost device benchmark ($\$2,500.00$):
$$\text{VarianceScore} = \min\left(100.00,\, \frac{\text{carveout\_variance}}{\$2,500.00} \times 100.00\right)$$

#### B. Documentation Score ($25\%$ Weight)
Reflects readiness of vendor invoice and clinical proof:
- `INVOICE_AND_LOG_VERIFIED`: **$100.00$ points** (Vendor manufacturer invoice attached + OR consumption log verified + UDI logged).
- `INVOICE_ON_FILE_NO_UDI`: **$80.00$ points** (Invoice on file + operative report match, barcode pending).
- `LOG_VERIFIED_INVOICE_PENDING`: **$45.00$ points** (OR log confirmed, invoice requested from vendor).
- `DOCUMENTATION_MISSING`: **$10.00$ points** (Incomplete records requiring manual procurement audit).

#### C. Overturn Likelihood Score ($20\%$ Weight)
Based on payer CARC/RARC dispute precedent:
- `CONTRACT_CARVEOUT_VIOLATION` (Payer bundled known carve-out; CARC 97/45): **$95.00$ points**
- `MISSING_INVOICE_CURE` (Payer requested invoice; CARC 16 / N225): **$90.00$ points**
- `MARKUP_RECONCILIATION` (Payer paid cost without agreed markup): **$85.00$ points**
- `THRESHOLD_DISPUTE` (Dispute over stop-loss or deductible threshold): **$60.00$ points**
- `UNLISTED_DEVICE_REVIEW` (Unlisted HCPCS L8699 requiring clinical review): **$40.00$ points**

#### D. Filing Urgency Score ($15\%$ Weight)
Measured by statutory days remaining until payer timely filing deadline:
- $1 - 15$ days remaining: **$100.00$ points** (Critical urgency)
- $16 - 30$ days remaining: **$80.00$ points** (High urgency)
- $31 - 60$ days remaining: **$60.00$ points** (Moderate urgency)
- $61 - 90$ days remaining: **$40.00$ points** (Standard follow-up)
- $> 90$ days remaining: **$20.00$ points** (Low urgency)
- $< 0$ days (Expired): **$0.00$ points** (Enforces `EXPIRED_UNRECOVERABLE`)

---

### 4. Recovery Action Tiers
- **`TIER_1_CRITICAL_RECOVERY`** ($\text{Score} \ge 80.00$): High dollar variance ($\ge \$2,500$) with attached invoice; requires immediate corrected 837 claim or formal appeal.
- **`TIER_2_HIGH_YIELD_DISPUTE`** ($\text{Score} \in [65.00, 79.99]$): Solid contractual carve-out case with verified invoice; automated dispute letter.
- **`TIER_3_DOCUMENTATION_CURE`** ($\text{Score} \in [45.00, 64.99]$): Legitimate carve-out opportunity held due to missing vendor invoice; routed to Materials Management.
- **`TIER_4_LOW_VARIANCE_MONITOR`** ($\text{Score} \in [25.00, 44.99]$): Minor variance ($< \$250$) or complex unlisted coding.
- **`TIER_5_EXPIRED_OR_NON_CARVED`** ($\text{Score} < 25.00$ or expired): Ineligible plan or elapsed deadline; written off to contract adjustment.

---

## Data Model / Schema (Migration 074)

```sql
-- 1. Carve-Out Rules Reference Table
CREATE TABLE IF NOT EXISTS public.implant_carveout_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES public.payers(id) ON DELETE CASCADE,
    payer_name VARCHAR(150) NOT NULL,
    plan_type VARCHAR(50) NOT NULL DEFAULT 'COMMERCIAL',
    contract_version VARCHAR(50) NOT NULL,
    cpt_code VARCHAR(10) NOT NULL,
    hcpcs_device_code VARCHAR(10) NOT NULL,
    device_category VARCHAR(50) NOT NULL,
    reimbursement_model VARCHAR(50) NOT NULL,
    markup_percentage NUMERIC(6, 4) DEFAULT 0.0000,
    fixed_fee_amount NUMERIC(10, 2) DEFAULT 0.00,
    min_threshold NUMERIC(10, 2) DEFAULT 0.00,
    max_reimbursement_cap NUMERIC(10, 2),
    requires_invoice_attachment BOOLEAN NOT NULL DEFAULT TRUE,
    timely_filing_days INTEGER NOT NULL DEFAULT 180,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Carve-Out Discrepancies Table
CREATE TABLE IF NOT EXISTS public.implant_carveout_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_id UUID NOT NULL,
    claim_id UUID NOT NULL,
    claim_number VARCHAR(64) NOT NULL,
    patient_id UUID NOT NULL,
    patient_name VARCHAR(150) NOT NULL,
    patient_mrn VARCHAR(64) NOT NULL,
    payer_id UUID NOT NULL,
    payer_name VARCHAR(150) NOT NULL,
    primary_cpt VARCHAR(10) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    date_of_service DATE NOT NULL,
    remittance_date DATE,
    device_name VARCHAR(255) NOT NULL,
    device_category VARCHAR(50) NOT NULL,
    hcpcs_device_code VARCHAR(10) NOT NULL,
    vendor_name VARCHAR(150) NOT NULL,
    catalog_number VARCHAR(100),
    udi_di VARCHAR(100),
    quantity_implanted INTEGER NOT NULL DEFAULT 1,
    invoice_number VARCHAR(100),
    invoice_cost NUMERIC(10, 2) NOT NULL,
    invoice_attached BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_attachment_url TEXT,
    carveout_rule_id UUID REFERENCES public.implant_carveout_rules(id),
    reimbursement_model VARCHAR(50) NOT NULL,
    markup_percentage NUMERIC(6, 4) DEFAULT 0.0000,
    billed_carveout_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expected_carveout_amount NUMERIC(10, 2) NOT NULL,
    payer_paid_carveout NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    carveout_variance NUMERIC(10, 2) NOT NULL,
    carveout_leakage_type VARCHAR(50) NOT NULL,
    carveout_priority_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    recovery_action_tier VARCHAR(50) NOT NULL,
    documentation_readiness_tier VARCHAR(50) NOT NULL,
    payer_carc_code VARCHAR(20),
    payer_rarc_code VARCHAR(20),
    filing_deadline DATE NOT NULL,
    days_until_deadline INTEGER NOT NULL,
    discrepancy_status VARCHAR(50) NOT NULL DEFAULT 'DETECTED',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

---

## Business Rules & Invariants

1. **Rule 1: Documented Consumption Prerequisite**: An implant discrepancy can only be generated if the implant was documented in surgical records (`quantity_implanted > 0`) or billed on the claim.
2. **Rule 2: Deterministic Allowable Math**: Expected carve-out must be calculated strictly according to the active payer contract version terms at the date of service, honoring any markup, fixed fees, thresholds, and caps.
3. **Rule 3: Invoice Attachment Gate**: A corrected claim or formal dispute cannot be marked as `DISPUTE_SUBMITTED` unless `invoice_attached = true`. If missing, the status is restricted to `INVOICE_ACQUISITION_HOLD`.
4. **Rule 4: Automatic Timely Filing Expiration**: If `days_until_deadline < 0`, `urgency_score = 0.00`, tier is forced to `TIER_5_EXPIRED_OR_NON_CARVED`, and status transitions to `EXPIRED_UNRECOVERABLE`.
5. **Rule 5: Queue Sorting Invariant**: Prioritized work queue must be sorted strictly by:
   1. `recovery_action_tier ASC` (Tier 1 first)
   2. `carveout_variance DESC` (Largest short-pay first)
   3. `days_until_deadline ASC` (Most urgent filing deadline first)

---

## UI / Workflow Requirements (Maestro Clinical Design)

- **Color Governance:** Strictly **0 purple/violet/indigo/magenta/fuchsia tokens**.
- **5-Card Top Metric Ribbon:**
  - Active Carve-Out Opportunities
  - Total Unrecovered Carve-Out Variance ($)
  - Unbilled Implants at Risk ($)
  - Invoice Documentation Deficits (count)
  - MTD Cash Recovered ($)
- **Recovery Action Tier Tabs:** All, Tier 1 Critical Recovery, Tier 2 High-Yield Dispute, Tier 3 Documentation Cure, Tier 4 Low Variance Monitor, Tier 5 Expired / Non-Carved.
- **Multi-Factor Scoring Inspector:** Visual breakout of Variance (40%), Documentation (25%), Likelihood (20%), and Urgency (15%) subscores.
- **Clinical Actions:**
  - *Attach Vendor Invoice Modal*: Select vendor invoice PDF, verify invoice number and cost match, and mark `invoice_attached = true`.
  - *Generate Corrected 837 Claim / Appeal Letter*: Generates formal CMS-1500 / 837P loop corrections and contract dispute letter with attached invoice and UDI evidence.
  - *Record Carve-Out Recovery*: Reconciles subsequent remittance payment and marks case `RECOVERED`.

---

## QA & Verification Test Plan

Automated test suite (`tests/implant-carveout-detection.test.js`) verifies:
1. Taxonomy definitions for all 5 reimbursement models, 5 leakage categories, and 5 action tiers.
2. Deterministic financial math:
   - Invoice cost + markup % calculation.
   - Pass-through at cost calculation.
   - Invoice + fixed fee calculation.
   - Threshold overage calculation.
   - Maximum reimbursement cap enforcement.
3. Priority scoring formulas and weight verification (sums to exactly 1.00).
4. Business invariants:
   - Timely filing expiration forces Tier 5 and zero urgency score.
   - Invoice gate prevents dispute submission without invoice.
   - Sorting invariant (Tier Rank ASC, Variance DESC, Days ASC).
5. State transitions:
   - `DETECTED` $\rightarrow$ `INVOICE_ATTACHED` $\rightarrow$ `DISPUTE_SUBMITTED` $\rightarrow$ `RECOVERED`.
6. Database migration 074 integrity (tables, views, indexes, 1:1 RLS policies, clean down rollback).
7. Maestro Clinical Design System governance (strictly ZERO purple tokens in JSX/CSS).
8. Application wiring and specification completeness.
