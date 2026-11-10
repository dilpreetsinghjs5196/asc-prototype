# 93A PAYMENT VARIANCE VALIDATION

## Purpose
Production specification for validating whether an expected-vs-actual payment difference represents a true recoverable underpayment, a legitimate contractual adjustment, a secondary-payer issue, a patient-responsibility allocation, or an unresolved discrepancy requiring human review.

This phase extends Phase 93 Underpayment Detection. Phase 93 identifies variance candidates; Phase 93A determines whether the candidate is financially valid enough to enter recovery workflow.

The core design principle is:

> **Detection is not proof. Validation must establish the governing contract, adjudication context, calculation lineage, and confidence before recovery action is recommended.**

## Scope
- Validate claim-level and claim-line expected-vs-actual payment variances.
- Recalculate expected reimbursement using the exact payer, plan, contract version, date of service, CPT/HCPCS, modifiers, units, multiple-procedure logic, case-rate logic, implant/device carve-outs, and effective dates.
- Reconcile actual adjudication from 835/ERA and payment records.
- Classify the variance into a deterministic root-cause taxonomy.
- Prevent false underpayment alerts caused by legitimate:
  - MPPR / multiple procedure reductions
  - Contractual allowances
  - Bundling/packaging
  - Patient responsibility
  - Secondary payer sequencing
  - Case-rate inclusion
  - Modifier/unit issues
  - Non-covered lines
  - Coordination-of-benefits effects
  - Recoupments/refunds
  - Duplicate/replacement claim activity
- Assign a validation confidence state based on data completeness and rule support.
- Require human review when authoritative source data are incomplete or conflicting.
- Enforce organization/facility tenancy, RBAC, immutable auditability, and deterministic financial calculations.

## Current State
The following existing assets are reused:
- Phase 66 Payer Contract Model: **KEEP**
- Phase 67 Payer Contract Rate Rules: **KEEP**
- Phase 68 Expected Reimbursement Engine: **KEEP**
- Phase 69 Reimbursement Calculation Auditability: **KEEP**
- Phase 80 Claims Model: **KEEP**
- Phase 82 835 Remittance Ingestion: **KEEP**
- Phase 83 Payments & Adjustments: **KEEP**
- Phase 84 CARC/RARC Intelligence: **KEEP**
- Phase 89 Reconciliation Engine: **KEEP**
- Phase 90 Revenue Leakage Engine: **KEEP**
- Phase 93 Underpayment Detection: **KEEP / EXTEND**

Components introduced in Phase 93A:
- Formal payment-variance validation record (`payment_variances` table): **IMPLEMENTED**
- Deterministic 12-state root-cause classification for payment variance: **IMPLEMENTED**
- Validation confidence (`HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`) and completeness scoring: **IMPLEMENTED**
- Claim-line evidence trace linking expected calculation to actual adjudication: **IMPLEMENTED**

## Target State
For every Phase 93 variance candidate, the engine produces one of 12 validated outcomes:

1. `VALID_UNDERPAYMENT`: Confirmed short-pay against active contract; ready for recovery.
2. `VALID_CONTRACTUAL_ADJUSTMENT`: Verified legitimate contractual write-off per agreement.
3. `PATIENT_RESPONSIBILITY`: Variance caused by deductible, co-insurance, or co-pay (PR-1, PR-2, PR-3).
4. `SECONDARY_PAYER_PENDING`: Unpaid balance forwarded to secondary insurer.
5. `CASE_RATE_OR_BUNDLED`: Code packaged into primary procedure case rate.
6. `MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION`: Standard statutory multiple-procedure payment reduction applied.
7. `CODING_OR_MODIFIER_REVIEW`: Documentation or modifier discrepancy requiring coding specialist review.
8. `IMPLANT_CARVEOUT_REVIEW`: Missing manufacturer implant invoice or invoice pending vendor verification.
9. `COB_OR_OTHER_PAYER_REVIEW`: Coordination of benefits ambiguity across multiple payers.
10. `PAYMENT_POSTING_OR_RECONCILIATION_ISSUE`: Electronic remittance posting mismatch or unapplied cash batch.
11. `INSUFFICIENT_DATA`: Missing contract schedule, plan ID, or remittance data.
12. `NEEDS_MANUAL_REVIEW`: Conflicting rules requiring supervisor or BOM determination.

Only `VALID_UNDERPAYMENT` and validated carve-out/payment exceptions automatically advance to recovery work queues.

## Data Model / Schema

### 1. `public.payment_variances`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id UUID NOT NULL`
- `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
- `case_id BIGINT REFERENCES public.surgeries(id) ON DELETE CASCADE`
- `claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE`
- `payer_id UUID`
- `plan_id UUID`
- `contract_id UUID`
- `contract_version_id UUID`
- `date_of_service DATE NOT NULL`
- `expected_allowed NUMERIC(14,2) NOT NULL CHECK (expected_allowed >= 0)`
- `actual_allowed NUMERIC(14,2) CHECK (actual_allowed >= 0)`
- `actual_paid NUMERIC(14,2) CHECK (actual_paid >= 0)`
- `patient_responsibility NUMERIC(14,2) DEFAULT 0.00 CHECK (patient_responsibility >= 0)`
- `contractual_adjustment NUMERIC(14,2) DEFAULT 0.00 CHECK (contractual_adjustment >= 0)`
- `variance_amount NUMERIC(14,2) NOT NULL`
- `variance_percent NUMERIC(9,4)`
- `variance_type VARCHAR(64) NOT NULL`
- `validation_status VARCHAR(40) NOT NULL CHECK (validation_status IN (
    'VALID_UNDERPAYMENT',
    'VALID_CONTRACTUAL_ADJUSTMENT',
    'PATIENT_RESPONSIBILITY',
    'SECONDARY_PAYER_PENDING',
    'CASE_RATE_OR_BUNDLED',
    'MPPR_OR_MULTIPLE_PROCEDURE_REDUCTION',
    'CODING_OR_MODIFIER_REVIEW',
    'IMPLANT_CARVEOUT_REVIEW',
    'COB_OR_OTHER_PAYER_REVIEW',
    'PAYMENT_POSTING_OR_RECONCILIATION_ISSUE',
    'INSUFFICIENT_DATA',
    'NEEDS_MANUAL_REVIEW'
  ))`
- `root_cause_code VARCHAR(64)`
- `confidence_level VARCHAR(16) NOT NULL CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'))`
- `data_completeness_score NUMERIC(5,2) CHECK (data_completeness_score BETWEEN 0.00 AND 100.00)`
- `filing_deadline DATE`
- `owner_user_id UUID REFERENCES auth.users(id)`
- `calculation_version_id UUID`
- `source_835_id UUID`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `validated_at TIMESTAMPTZ`
- `validated_by UUID REFERENCES auth.users(id)`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 2. `public.payment_variance_lines`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE`
- `claim_line_id UUID NOT NULL`
- `cpt_hcpCS_code VARCHAR(16) NOT NULL`
- `modifiers TEXT[]`
- `units NUMERIC(10,2) NOT NULL DEFAULT 1`
- `expected_allowed NUMERIC(14,2) NOT NULL CHECK (expected_allowed >= 0)`
- `actual_allowed NUMERIC(14,2) CHECK (actual_allowed >= 0)`
- `actual_paid NUMERIC(14,2) CHECK (actual_paid >= 0)`
- `line_variance NUMERIC(14,2) NOT NULL`
- `rule_path JSONB NOT NULL DEFAULT '{}'::jsonb`
- `carc_codes TEXT[]`
- `rarc_codes TEXT[]`
- `validation_result VARCHAR(40) NOT NULL`

### 3. `public.payment_variance_rule_evaluations`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `payment_variance_id UUID NOT NULL REFERENCES public.payment_variances(id) ON DELETE CASCADE`
- `rule_code VARCHAR(64) NOT NULL`
- `rule_version VARCHAR(64) NOT NULL`
- `result VARCHAR(24) NOT NULL`
- `input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb`
- `output_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb`
- `source_reference TEXT`
- `evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 4. Analytical Views & RLS Policies
- `public.vw_payment_variances_active`: Computes days elapsed and days remaining until timely filing deadline.
- `public.vw_payment_variance_validation_summary`: Aggregated rollups by facility and validation status.
- RLS with 1:1 `DROP POLICY IF EXISTS` and `CREATE POLICY` statements.

## Business Rules

### 1. Variance Formula
At claim and line level:
$$\text{variance\_amount} = \text{expected\_allowed} - \text{actual\_allowed}$$

Billed charges must never be used as the expected reimbursement basis.

### 2. 10-Step Validation Order
The validator evaluates in this strict sequence:
1. Confirm facility / payer / plan / DOS.
2. Resolve governing contract and version effective on DOS.
3. Resolve CPT/HCPCS, modifiers, units, and laterality.
4. Re-run expected reimbursement calculation.
5. Apply case-rate, package, MPPR, carve-out, and multiple-procedure rules.
6. Read actual 835 allowed, payment, and adjustment values.
7. Separate contractual adjustments, patient responsibility, payer payment, secondary balance, and non-covered amounts.
8. Classify the remaining difference into one of the 12 outcomes.
9. Assign confidence level and data completeness score.
10. Route to recovery or review queue.

### 3. Confidence Level Requirements
- `HIGH`: Requires exact payer/plan match, effective contract version, complete lines, matched 835/ERA, and no secondary/COB ambiguity.
- `MEDIUM`: Contract baseline matches but secondary coordination or modifier review is pending.
- `LOW`: Heuristic estimate applied; contract schedule missing specific amendment.
- `UNKNOWN`: Missing contract, plan, or remittance data.

### 4. Incomplete Data Handling
Missing contract, plan ID, unindexed modifiers, or unmatched ERA yields `INSUFFICIENT_DATA` or `NEEDS_MANUAL_REVIEW`. The system never invents or approximates underpayment claims.

### 5. Prohibited Behaviors
This validation phase must **never**:
- Mutate CPTs, modifiers, or units autonomously.
- Rebill claims or submit appeals automatically.
- Post financial payments or write off balances.

## Permissions & RBAC
- Finance / CFO: View and approve validated variances.
- Billing / RCM: Review, validate, assign, and route.
- Coder: Review coding-related causes (`CODING_OR_MODIFIER_REVIEW`).
- Facility Admin: View and administer all facility variance records.
- Read-Only: View records without editing.
- AI Agents: Read-only access through permission checks; financial mutations strictly blocked.

## API & Service Requirements
- `calculate_expected_reimbursement(claim_id)`
- `detect_payment_variance(claim_id)`
- `validate_payment_variance(payment_variance_id)`
- `classify_payment_variance(payment_variance_id)`
- `recalculate_payment_variance(payment_variance_id)`

## UI & Workflow Requirements
- **Executive Topbar:** Phase pill `Phase 93A • VARIANCE VALIDATION`, facility selector, "Run Validation Engine", and "Export Validated Log".
- **5-Card KPI Ribbon:** Total Variances, Valid Underpayments ($), Legitimate Contractual ($), Patient Liability ($), Pending Review/Ambiguous ($).
- **4 Workbenches:**
  1. **Validation Worklist:** Data grid with confidence badge, claim #, patient, payer, expected vs actual allowed, variance $, outcome status pill, and actions.
  2. **Claim-Line Adjudication Trace:** Line-by-line inspection of CPT, modifiers, expected allowed, actual allowed, CARC/RARC codes, and rule trace.
  3. **Root-Cause Outcome Distribution:** The 12 validation categories broken down with count, dollar exposure, and recovery eligibility.
  4. **Rule Lineage & Contract Version Inspector:** Shows exact contract version, calculation version, source 835 ERA ID, and rule evaluation snapshots.
- **Strict Maestro Compliance:** Canvas `#0b1120`, topbar card `#0f172a`, text `#ffffff`, strictly **ZERO** purple/violet/indigo tokens.

## Audit & Provenance
Every validation execution preserves:
- `calculation_version_id`
- `contract_version_id`
- `claim_id`
- `source_835_id`
- Line-level rule evaluation snapshots
- User ID, before/after status, and timestamp
- Mandatory human override justification notes

## Acceptance Criteria
- No Phase 93 candidate advances to recovery without an auditable validation result.
- All authoritative amounts are calculated server-side.
- All `HIGH` confidence underpayments have complete rule lineage.
- Missing data produces `INSUFFICIENT_DATA` or `NEEDS_MANUAL_REVIEW`, not invented answers.
- 100% test pass rate across unit, financial, RLS, and UI tests.
- Production build passes without error.

## Definition of Done
Complete only when data model, migrations, deterministic validation engine, UI workbenches, RLS policies, automated tests, and documentation are committed to git with a clean working tree.

