# 92 MISSING CHARGE DETECTION

## Purpose
Production specification for the Ambulatory Surgery Center (ASC) Missing Charge Detection Engine: algorithmic cross-system charge audits comparing clinical documentation, operating room supply/implant logs, medication administration records (MAR), and anesthesia sheets against billed claim lines. This subsystem detects omitted secondary surgical CPTs, unbilled high-cost implants, uncaptured specialized supplies, missing anesthesia time units, unbilled pathology handling, and uncharged specialty pharmaceuticals, directly recovering lost gross charges and net revenue prior to or following initial billing.

## Scope
- Define authoritative missing charge detection across 6 core surgical charge categories:
  1. `SECONDARY_CPT`: Secondary or add-on surgical procedures documented in the operative note but absent from superbills/claims (e.g., extensive debridement CPT 29877 alongside meniscectomy 29881; or lateral release CPT 29873).
  2. `IMPLANT_HARDWARE`: Consumed implants, screws, anchors, knee/hip prosthetics, mesh, or biologics documented in OR implant logs but missing from Revenue Code 0278 or HCPCS C-code claim lines (e.g., C1713, C1776, L8699).
  3. `HIGH_COST_DRUG`: Specialized drugs documented on the Medication Administration Record (MAR) or anesthesia sheet (e.g., Exparel [bupivacaine liposome, HCPCS J0665], sugammadex [Bridion], IV anti-emetics) omitted from pharmacy charges.
  4. `SURGICAL_SUPPLY`: High-cost specialized single-use consumables (e.g., radiofrequency arthroscopy wands, ultrasonic blades, surgical sealants, specialized hemostatic matrices) consumed per nursing notes but omitted from facility supply charges.
  5. `ANESTHESIA_UNITS`: Anesthesia duration (wheels-in to wheels-out/PACU transfer) logged in OR milestones where base units + time units were undercalculated or completely unbilled.
  6. `PATHOLOGY_SPECIMEN`: Biopsy or anatomical tissue specimens logged on surgical specimen requisitions where technical gross examination or handling fees (CPT 88305/88300) were omitted.
- Implement deterministic recovery calculations:
  - Estimated Net Recovery:
    $$\text{estimated\_net\_recovery} = \text{ROUND}(\text{estimated\_lost\_charge} \times (\text{expected\_reimbursement\_rate} / 100.0), 2)$$
  - Missing Charge Priority Score ($0.0 - 100.0$) weighting dollar size ($45\%$), detection confidence ($35\%$), and encounter age ($20\%$).
- Establish an auditable 5-state lifecycle state machine:
  - `DETECTED` $\rightarrow$ `UNDER_AUDIT` $\rightarrow$ `CHARGE_CONFIRMED` $\rightarrow$ `CLAIM_AMENDED` (or `DISMISSED_NOT_BILLABLE`).
- Support clinical evidence provenance linking: Operative notes, OR nursing supply logs, implant vendor stickers, MAR timestamps, and anesthesia flows.
- Enforce organization/facility tenancy, audit trails, and strict Maestro Clinical Design System governance (strictly ZERO purple/violet/indigo/magenta/fuchsia tokens).

## Current State
- **Phase 31 (Case Master)**: Core surgical encounters and room milestones (`002_case_master.sql`): **KEEP**.
- **Phase 46 (Charge Completeness Engine)**: Baseline pre-bill charge completeness check (`017_charge_completeness_engine.sql`): **KEEP**.
- **Phase 59 (Case Implant Usage)**: Authoritative OR implant consumption records (`036_case_implant_usage.sql`): **KEEP**.
- **Phase 80 (Claims Model)**: Billed claims headers, line charges, and initial AR ledger (`054_claims_model.sql`): **KEEP**.
- **Phase 90 (Revenue Leakage Engine)**: Master leakage rule governance (`064_revenue_leakage_engine.sql`): **KEEP**.
- **Phase 91 (Unbilled Case Detection)**: Entire unbilled cases detection (`065_unbilled_case_detection.sql`): **KEEP**.
- **Phase 92 (Missing Charge Detection)**:
  - Master missing charge rules table (`rcm_missing_charge_rules`): **IMPLEMENTED** (`066_missing_charge_detection.sql`).
  - Missing charge detection ledger table (`rcm_missing_charges`): **IMPLEMENTED** (`066_missing_charge_detection.sql`).
  - Missing charge audit & workflow action log table (`rcm_missing_charge_actions`): **IMPLEMENTED** (`066_missing_charge_detection.sql`).
  - Analytical views (`vw_rcm_missing_charges_active`, `vw_rcm_missing_charges_summary`): **IMPLEMENTED**.
  - Interactive Missing Charge Detection Workbench UI (`MissingChargeDetectionView.jsx`, `MissingChargeDetectionView.css`): **IMPLEMENTED**.

## Target State
1. **Automated Cross-System Charge Detection**:
   - Compares OR nursing records, implant usage, and operative reports against billed claim lines.
   - Detects omitted line items and calculates exact lost gross charges and estimated net collectible revenue.
2. **Deterministic Priority Scoring**:
   - Composite Priority Score ($0.0 - 100.0$) prioritizing high-dollar, high-confidence charge omissions.
3. **Clinical Evidence Provenance**:
   - Records the exact clinical source (EHR operative dictation excerpt, nursing item consumption row, MAR administration stamp) justifying the missing charge.
4. **Interactive Charge Amendment Workbench**:
   - High-contrast clinical UI allowing billing specialists and coding auditors to confirm charges, generate amended claims (837I frequency code 7), or document valid non-billable dismissals.

## Data Model / Schema

### 1. `rcm_missing_charge_rules` (Master Detection Rules)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `rule_code` (VARCHAR(32) NOT NULL UNIQUE)
- `charge_category` (VARCHAR(40) NOT NULL CHECK (charge_category IN (
    'SECONDARY_CPT',
    'IMPLANT_HARDWARE',
    'HIGH_COST_DRUG',
    'SURGICAL_SUPPLY',
    'ANESTHESIA_UNITS',
    'PATHOLOGY_SPECIMEN'
  )))
- `title` (VARCHAR(128) NOT NULL)
- `description` (TEXT NOT NULL)
- `detection_trigger` (TEXT NOT NULL)
- `threshold_amount` (NUMERIC(14,2) NOT NULL DEFAULT 150.00 CHECK (threshold_amount >= 0))
- `confidence_score` (NUMERIC(5,2) NOT NULL DEFAULT 85.00 CHECK (confidence_score BETWEEN 0.00 AND 100.00))
- `is_active` (BOOLEAN NOT NULL DEFAULT true)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 2. `rcm_missing_charges` (Missing Charge Alert Ledger)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `charge_alert_number` (VARCHAR(64) NOT NULL UNIQUE)
- `surgery_id` (BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE CASCADE)
- `patient_id` (BIGINT NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT)
- `claim_id` (UUID REFERENCES public.claims(id) ON DELETE SET NULL)
- `charge_category` (VARCHAR(40) NOT NULL CHECK (charge_category IN (
    'SECONDARY_CPT',
    'IMPLANT_HARDWARE',
    'HIGH_COST_DRUG',
    'SURGICAL_SUPPLY',
    'ANESTHESIA_UNITS',
    'PATHOLOGY_SPECIMEN'
  )))
- `item_code` (VARCHAR(32) NOT NULL)
- `item_description` (VARCHAR(256) NOT NULL)
- `surgeon_name` (VARCHAR(128) NOT NULL)
- `specialty` (VARCHAR(64) NOT NULL)
- `procedure_name` (VARCHAR(256) NOT NULL)
- `payer_name` (VARCHAR(128) NOT NULL)
- `date_of_service` (DATE NOT NULL)
- `estimated_lost_charge` (NUMERIC(14,2) NOT NULL CHECK (estimated_lost_charge >= 0))
- `expected_reimbursement_rate` (NUMERIC(5,2) NOT NULL DEFAULT 40.00 CHECK (expected_reimbursement_rate BETWEEN 0.00 AND 100.00))
- `estimated_net_recovery` (NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(estimated_lost_charge * expected_reimbursement_rate / 100.0, 2)
  ) STORED)
- `clinical_evidence_source` (VARCHAR(64) NOT NULL CHECK (clinical_evidence_source IN (
    'OPERATIVE_DICTATION',
    'OR_NURSING_LOG',
    'IMPLANT_USAGE_LOG',
    'MAR_PHARMACY',
    'ANESTHESIA_RECORD',
    'PATHOLOGY_REQUISITION'
  )))
- `evidence_text` (TEXT NOT NULL)
- `detection_confidence` (NUMERIC(5,2) NOT NULL DEFAULT 85.00 CHECK (detection_confidence BETWEEN 0.00 AND 100.00))
- `priority_score` (NUMERIC(5,2) NOT NULL DEFAULT 50.00 CHECK (priority_score BETWEEN 0.00 AND 100.00))
- `status` (VARCHAR(32) NOT NULL DEFAULT 'DETECTED' CHECK (status IN (
    'DETECTED',
    'UNDER_AUDIT',
    'CHARGE_CONFIRMED',
    'CLAIM_AMENDED',
    'DISMISSED_NOT_BILLABLE'
  )))
- `reviewed_by` (UUID REFERENCES auth.users(id))
- `reviewed_at` (TIMESTAMPTZ)
- `resolution_notes` (TEXT)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

### 3. `rcm_missing_charge_actions` (Audit & Workflow Action Log)
- `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid())
- `facility_id` (UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE)
- `missing_charge_id` (UUID NOT NULL REFERENCES public.rcm_missing_charges(id) ON DELETE CASCADE)
- `action_type` (VARCHAR(40) NOT NULL CHECK (action_type IN (
    'CHARGE_DETECTED',
    'AUDIT_ASSIGNED',
    'EVIDENCE_VERIFIED',
    'CHARGE_CONFIRMED',
    'CLAIM_AMENDED',
    'CHARGE_DISMISSED'
  )))
- `performed_by` (UUID REFERENCES auth.users(id))
- `performed_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `previous_status` (VARCHAR(32))
- `new_status` (VARCHAR(32))
- `notes` (TEXT NOT NULL)

## Business Rules

### 1. Deterministic Financial Invariants
- **Estimated Net Recovery Amount**:
  $$\text{estimated\_net\_recovery} = \text{ROUND}(\text{estimated\_lost\_charge} \times (\text{expected\_reimbursement\_rate} / 100.0), 2)$$
  *Enforced via PostgreSQL `GENERATED ALWAYS AS (...) STORED`.*

### 2. Composite Priority Score ($0.0 - 100.0$)
The priority score ranks missing charge alerts by value and confidence:
$$\text{Priority} = \min\left(45.0, \frac{\text{estimated\_net\_recovery}}{5,000.00} \times 45.0\right) + \left(\frac{\text{detection\_confidence}}{100.0} \times 35.0\right) + \text{Aging Weight (up to 20.0)}$$
- Where Aging Weight:
  - $\le 30$ days from DOS: $20.0$ points (Immediate rebill window)
  - $31 - 60$ days from DOS: $12.0$ points
  - $> 60$ days from DOS: $5.0$ points

### 3. Lifecycle State Transition Guardrails
- `DETECTED` $\rightarrow$ `UNDER_AUDIT`: Assigned to coding specialist or billing auditor.
- `UNDER_AUDIT` $\rightarrow$ `CHARGE_CONFIRMED`: Verified against operative report, implant serial sticker, or MAR timestamp.
- `CHARGE_CONFIRMED` $\rightarrow$ `CLAIM_AMENDED`: Added to claim line charges; replacement claim (837I frequency code 7) generated.
- Any State $\rightarrow$ `DISMISSED_NOT_BILLABLE`: Dismissed with mandatory justification (e.g. bundled under CMS OPPS composite payment, packaged surgical tray supply).

## Permissions / Security
- **View Missing Charge Alerts & Audits**: `facility_user`, `billing_specialist`, `coding_auditor`, `financial_analyst`, `administrator`.
- **Review & Confirm Missing Charges**: `billing_specialist`, `coding_auditor`, `administrator`.
- **Amend Claims & Re-Bill**: `billing_specialist`, `administrator`.
- **Dismiss Charge Alert**: `rcm_supervisor`, `billing_specialist`, `administrator`.
- **RLS Policy**: Multi-facility isolation enforced via `facility_id IN (SELECT public.get_auth_user_facilities())`.

## API / Service Requirements
The service layer (`src/lib/missingChargeService.js` and `src/services/missingChargeService.js`) provides:
1. `getMissingCharges(filters)`: Retrieves filtered missing charge alerts with calculated priorities.
2. `getMissingChargeSummary(charges)`: Aggregates total lost charges, estimated net recovery, confirmed pipeline, and amended revenue.
3. `getCategoryBreakdown(charges)`: Aggregates missing charge dollars across CPT, implants, drugs, supplies, anesthesia, and pathology.
4. `confirmCharge(id, { adjustedAmount, notes })`: Validates charge and transitions to `CHARGE_CONFIRMED`.
5. `amendClaim(id, { replacementClaimControlNumber, notes })`: Transitions to `CLAIM_AMENDED`.
6. `dismissCharge(id, { reason, notes })`: Transitions to `DISMISSED_NOT_BILLABLE`.
7. `calculatePriorityScore(netRecovery, confidence, daysElapsed)`: Deterministic scoring formula.

## UI / Workflow Requirements
- **Executive KPI Ribbon**:
  - Total Missing Charge Alerts (count)
  - Total Potential Lost Gross Charges ($)
  - Estimated Net Recoverable Cash ($)
  - Confirmed Revenue Pipeline ($)
  - Realized Amended Claims Revenue ($)
- **Four Dedicated Workbenches**:
  1. **Missing Charge Worklist**: Full alert grid with search, category filtering, evidence preview, confidence score, and one-click actions.
  2. **Charge Category Matrix**: Distribution breakdown showing lost dollars across CPTs, implants, drugs, supplies, anesthesia, and pathology.
  3. **Clinical Evidence Inspector**: Direct view of operative note excerpts, implant barcodes, and MAR administration timestamps.
  4. **Surgeon Charge Accuracy Scorecard**: Identifies surgeons with the highest incidence of undocumented or omitted secondary procedures.
- **Action Modal**: Detailed review interface to confirm charge addition, adjust recovery amounts, attach replacement claim control numbers, or dismiss non-billable items.
- **Maestro Clinical Design System (Rule P0)**: Strictly zero purple/violet/indigo/magenta/fuchsia tokens. High-contrast `#0b1120` canvas, `#0f172a` executive container, `#ffffff` headers.

## Audit / Provenance
All charge confirmations, claim amendments, and dismissals are logged with user identity, timestamp, before/after status, and clinical justification notes.

## QA / Test Cases
Automated test suite (`tests/missing-charge-detection.test.js`) verifies:
1. Charge categories and lifecycle state machine definitions.
2. Deterministic calculations: estimated net recovery stored invariant and composite priority scoring.
3. Summary metrics and category breakdown aggregations.
4. Baseline dataset health across surgical specialties (Orthopedics, Spine, Ophthalmology, General Surgery).
5. Database migration parity in `066_missing_charge_detection.sql` (tables, stored generated column, views, 1:1 RLS policies).
6. Maestro Clinical Design System governance (0 forbidden purple tokens).
7. Application routing and specification completeness.

## Acceptance Criteria
- Build passes cleanly (`npm run build`).
- Automated tests pass with 100% success rate (`node --test tests/missing-charge-detection.test.js`).
- Multi-tenancy RLS isolation enforced on all tables and views.
- No purple tokens present in styles or JSX components.
- Zero mock/placeholder values presented as authoritative production truth.

## Dependencies
- Phase 31: Case Master (`public.surgeries`)
- Phase 46: Charge Completeness Engine (`rcm_charge_completeness_audits`)
- Phase 59: Case Implant Usage (`public.case_implant_usage`)
- Phase 80: Claims Model (`public.claims`)
- Phase 90: Revenue Leakage Engine (`rcm_leakage_opportunities`)

## Definition of Done
A feature is complete only when:
- Master specification document is complete with all 16 canonical sections.
- Database migrations (`066_missing_charge_detection.sql` and `_down.sql`) are implemented.
- Service layer (`src/lib/` and `src/services/`) provides deterministic formulas, status transitions, and queries.
- UI workbench component and CSS comply with Maestro Clinical Design System standards.
- Component is wired into `src/App.jsx`.
- Comprehensive test suite passes with zero failures.
- Production build succeeds without errors.

## Implementation Notes
- Migration `066_missing_charge_detection.sql` defines `rcm_missing_charge_rules`, `rcm_missing_charges`, `rcm_missing_charge_actions`, and analytical views `vw_rcm_missing_charges_active` and `vw_rcm_missing_charges_summary`.
- Stored generated column `estimated_net_recovery GENERATED ALWAYS AS (ROUND(estimated_lost_charge * expected_reimbursement_rate / 100.0, 2)) STORED` ensures database arithmetic integrity.
- Foreign keys correctly match existing schema types: `surgery_id BIGINT`, `patient_id BIGINT`, `claim_id UUID`, `facility_id UUID`.
- Zero purple tokens enforced in `MissingChargeDetectionView.css` and `MissingChargeDetectionView.jsx`.

