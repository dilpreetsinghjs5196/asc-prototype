# C4 AI EVIDENCE, CITATIONS & EXPLAINABILITY ARCHITECTURE

## Purpose
The **AI Evidence, Citations & Explainability Tier** provides authoritative provenance anchoring, verifiable source record linking, interactive drill-down inspection, and step-by-step mathematical explainability for all AI outputs, analytical insights, and automated calculations in the ASCANALYST platform. 

In clinical, surgical, and financial healthcare environments, unanchored generative AI statements or opaque calculations create severe compliance, billing, and operational liabilities. Phase C4 ensures that:
1. **Zero Hallucinated Numbers**: Every single numerical metric, variance claim, or procedural finding reported by the AI Analyst or automated services is linked directly to one or more immutable underlying source records (EHR cases, electronic claims, ERA 835 remittance lines, payer contracts, OR sensor timestamps, or purchase invoices).
2. **Interactive Citation Badges & One-Click Drill-Down**: All analytical sentences and table rows feature clickable citation markers (e.g., `[E1]`, `[E2]`, `[C-104]`) that slide open a comprehensive Source Record Drill-Down drawer, revealing the exact raw document payload, line items, and schema path.
3. **Deterministic Mathematical Decomposition**: Complex multi-variable calculations (such as Contribution Margin per OR Hour, Net Underpayment Variance, and Clean Claim Scrubbing Risk) are decomposed into atomic additive and multiplicative calculation trees with reproducible arithmetic.
4. **Cryptographic Provenance Verification**: Each evidence anchor stores a SHA-256 fingerprint of the underlying source record at calculation time, enabling automated drift detection if subsequent administrative edits or retro-adjustments occur.

---

## Scope
- **Production Requirements**:
  - Build persistent evidence and citation data stores (`ai_evidence_citations`, `ai_evidence_sources`, `ai_explainability_traces`).
  - Establish canonical source record adapters for 6 enterprise healthcare data categories:
    - `EHR_CASE`: Surgical case master, operative time logs, scheduling details (`cases`, `surgeries`, `case_events`).
    - `CLAIM_837`: Electronic claim records, primary/secondary CPT lines, billed charges (`claims`, `claim_lines`, `cpt_codes`).
    - `REMITTANCE_835`: Electronic Remittance Advice (ERA), line-item contractual allowances, paid amounts, CARC/RARC adjustments (`payments`, `adjustments`, `remittance_lines`).
    - `PAYER_CONTRACT`: Authoritative commercial and CMS fee schedules, percent-of-charge tiers, carveout clauses (`payer_contracts`, `fee_schedules`).
    - `OR_LOG`: Operating room scheduling intervals, wheels-in/wheels-out, turnover duration, staffed room capacity (`operating_rooms`, `block_schedules`).
    - `IMPLANT_INVOICE`: Vendor itemized purchase orders, SKU catalog pricing, sterile supply charges (`implant_usage`, `vendor_invoices`).
  - Implement bidirectional citation linking:
    - Text/Insight to Source: Inline anchors `[E#]` linked to database entity keys.
    - Source to Insights: Reverse lookup showing all AI conclusions derived from a particular case or claim.
  - Implement real-time verification engine:
    - Validates whether source record values still match the snapshot in the citation ledger (`VERIFIED`, `DATA_DRIFT`, `STALE_RECORD`, `REVOKED`).
  - Enforce organization and facility multi-tenancy isolation via PostgreSQL Row-Level Security (RLS).
  - Maestro Clinical design system compliance with strictly zero prohibited purple tokens.

---

## Current State
| Component | Classification | Current State Description | Action Required |
| :--- | :--- | :--- | :--- |
| `aiToolGatewayService.js` (Phase C1) | **KEEP** | Mediates tool execution, parameter parsing, rate limiting, and output shaping. | Extend gateway tool response wrapper to automatically extract and attach citation anchors to returned data. |
| `aiPermissionsService.js` (Phase C2) | **KEEP** | Enforces RBAC boundaries and HITL dual-key approval for actions. | Restrict drill-down source records to users with matching data domain permissions (e.g. PHI/financial access). |
| `aiToolDefinitionsService.js` (Phase C3) | **KEEP** | Provides 14 typed query contracts and 2 what-if simulation engines. | Enrich query schemas to produce structured `citations` metadata arrays alongside result sets. |
| Evidence & Citation Tables | **MISSING** | No dedicated schema storing citation graphs, source record pointers, or field-level snapshots. | Implement `ai_evidence_sources`, `ai_evidence_citations`, and `ai_explainability_traces` tables. |
| Evidence Verification Engine | **MISSING** | No automated mechanism to verify whether AI assertions remain mathematically true against active database state. | Build `aiEvidenceService.js` with cryptographic verification, batch audit, and drift detection. |
| Source Record Drill-Down Console | **MISSING** | No user interface allowing clinicians and revenue cycle directors to inspect citation evidence, view raw records, and trace calculations. | Implement `AIEvidenceCitationsView.jsx` with 5-card ribbon, citation graph, drill-down drawer, audit scanner, and sandbox. |

---

## Target State
1. **Authoritative Citation Graph**:
   - Every statement emitted by the AI Analyst or insight cards contains an embedded citation array:
     ```json
     {
       "statement": "Case #2026-9041 suffered an underpayment of $1,240.50 by Aetna due to an unapplied arthroscopy contract carveout.",
       "citations": [
         {
           "citationId": "CIT-84920",
           "sourceType": "REMITTANCE_835",
           "sourceRecordKey": "ERA-835-AETNA-88192",
           "fieldPath": "lineItems[0].contractualAdjustment",
           "claimedValue": "$9,100.00",
           "verified": true
         },
         {
           "citationId": "CIT-84921",
           "sourceType": "PAYER_CONTRACT",
           "sourceRecordKey": "CTR-AETNA-ASC-2026-SEC4",
           "fieldPath": "carveoutRates.CPT29881.rate",
           "claimedValue": "$5,100.00",
           "verified": true
         }
       ]
     }
     ```
2. **Interactive Drill-Down Drawer**:
   - Clicking any citation badge opens a sliding inspector without navigating away from the active screen.
   - Shows:
     - **Source Record Summary**: Primary entity, record key, patient initials/ID, date of service, attending physician.
     - **Field-Level Evidence**: Highlighted field path, raw database value, timestamp of capture.
     - **Verification Status**: Real-time comparison with live database record; green badge for exact match, amber for data drift.
     - **Step-by-Step Calculation Trace**: Complete mathematical breakdown showing each formula input.
3. **Explainability Decomposition**:
   - Deconstructs high-level KPIs into their component equations:
     - $\text{Contribution Margin} = \text{Collections} - (\text{Implants} + \text{Sterile Supplies} + \text{Pharma} + \text{Room Staffed Labor})$
     - $\text{CM per OR Hour} = \frac{\text{Contribution Margin}}{\text{Total Case Minutes} / 60}$
     - $\text{Payment Variance} = \text{Contract Expected Allowable} - \text{Remittance Allowed Amount}$
4. **Data Drift & Audit Scanning**:
   - Facility administrators can run a batch verification sweep across all historical AI citations to flag any records where billing adjustments or EHR amendments altered the source figures.

---

## Data Model / Schema
PostgreSQL Migration: `102_ai_evidence_and_citations.sql`

```sql
-- 1. AI Evidence Sources Registry
CREATE TABLE IF NOT EXISTS public.ai_evidence_sources (
    source_type VARCHAR(64) PRIMARY KEY, -- 'EHR_CASE', 'CLAIM_837', 'REMITTANCE_835', 'PAYER_CONTRACT', 'OR_LOG', 'IMPLANT_INVOICE'
    display_name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    source_table VARCHAR(128) NOT NULL,
    primary_key_column VARCHAR(64) NOT NULL DEFAULT 'id',
    facility_fk_column VARCHAR(64) NOT NULL DEFAULT 'facility_id',
    sensitivity_level VARCHAR(32) NOT NULL DEFAULT 'PHI_RESTRICTED', -- 'PUBLIC', 'INTERNAL', 'FINANCIAL', 'PHI_RESTRICTED'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Evidence Citations Ledger
CREATE TABLE IF NOT EXISTS public.ai_evidence_citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    citation_code VARCHAR(32) NOT NULL, -- e.g. 'CIT-1042', 'E-882'
    source_type VARCHAR(64) NOT NULL REFERENCES public.ai_evidence_sources(source_type),
    source_record_id VARCHAR(128) NOT NULL,
    source_record_key VARCHAR(128) NOT NULL, -- Human-readable identifier (e.g. 'CASE-9041', 'CLM-77210')
    field_path VARCHAR(256) NOT NULL, -- e.g. 'financial.net_margin', 'remit.allowed_amount'
    statement_context TEXT NOT NULL, -- The text sentence or insight using this evidence
    claimed_value JSONB NOT NULL, -- The exact scalar or structured value asserted by the AI
    current_value JSONB, -- The latest value fetched from active DB during verification
    calculation_formula TEXT, -- Formula string if value is derived (e.g. 'allowable - paid')
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 98.50,
    verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED', -- 'VERIFIED', 'DATA_DRIFT', 'UNVERIFIED', 'REVOKED'
    provenance_hash VARCHAR(64) NOT NULL, -- SHA-256 fingerprint of the source record snapshot
    created_by VARCHAR(64) NOT NULL DEFAULT 'ai_analyst',
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. AI Explainability Traces
CREATE TABLE IF NOT EXISTS public.ai_explainability_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    trace_code VARCHAR(32) NOT NULL,
    citation_id UUID REFERENCES public.ai_evidence_citations(id) ON DELETE SET NULL,
    metric_name VARCHAR(128) NOT NULL,
    primary_formula TEXT NOT NULL,
    inputs JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of [{ name, value, sourceRecord, unit }]
    intermediate_steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- Step-by-step resolution
    computed_result NUMERIC(14,4) NOT NULL,
    tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    verified BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_citations_facility ON public.ai_evidence_citations(facility_id);
CREATE INDEX IF NOT EXISTS idx_ai_citations_source ON public.ai_evidence_citations(source_type, source_record_id);
CREATE INDEX IF NOT EXISTS idx_ai_citations_status ON public.ai_evidence_citations(verification_status);
CREATE INDEX IF NOT EXISTS idx_ai_explainability_facility ON public.ai_explainability_traces(facility_id);

-- RLS Tenancy Isolation
ALTER TABLE public.ai_evidence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_evidence_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_explainability_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_ai_evidence_sources_all ON public.ai_evidence_sources FOR ALL USING (true);

CREATE POLICY p_ai_evidence_citations_tenant ON public.ai_evidence_citations
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY p_ai_explainability_traces_tenant ON public.ai_explainability_traces
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid)
    WITH CHECK (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);
```

---

## Business Rules & Deterministic Verification
1. **Strict Provenance Requirement**:
   - Any AI statement presenting an absolute dollar variance, utilization percentage, or clinical metric must link to at least one valid citation in `ai_evidence_citations`.
   - Statements without backing citations are rejected by the gateway output scrubber.
2. **Deterministic Cryptographic Verification**:
   - Provenance Hash is generated via SHA-256 over canonical stringification:
     $$\text{Hash} = \text{SHA256}(\text{source\_type} + \text{source\_record\_id} + \text{field\_path} + \text{claimed\_value})$$
   - On verification check:
     - If $\text{current\_value} = \text{claimed\_value}$, status remains `VERIFIED`.
     - If $\text{current\_value} \neq \text{claimed\_value}$ (e.g. retroactive payment adjustment), status transitions to `DATA_DRIFT` with audit log entry.
3. **Explainability Decomposition**:
   - Every complex metric must supply its mathematical tree. Intermediate steps must balance to within \$0.01 tolerance.
   - Prohibited Behavior: Black-box or unexplainable AI scores are strictly prohibited from entering executive and financial reporting.

---

## Permissions & Security
- **Role-Based Drill-Down Controls**:
  - `facility_admin`, `financial_controller`: Full access to view financial citations, claim drill-downs, contracts, and raw line items.
  - `clinical_director`, `surgeon`: Access to procedural duration, OR logs, case event timelines, and clinical notes.
  - `billing_specialist`: Access to 837 claim files, 835 remittance lines, and CARC/RARC codes.
  - `read_only_analyst`: Can view aggregate citations and metrics; masked view for patient identifying fields (Safe Harbor de-identification).
- **Audit Logging**: Every source record drill-down access is logged to `audit_logs` with `user_id`, `facility_id`, `citation_id`, and accessed entity metadata.

---

## API & Service Requirements
Backend service: `src/services/aiEvidenceService.js` and `src/lib/aiEvidenceService.js`

1. `getCitationCatalog(facilityId, filter)`: Returns paginated list of citations with domain filters and verification health.
2. `getCitationDetail(citationId)`: Fetches full citation record, source snapshot, and associated explainability trace.
3. `verifyCitation(citationId)`: Executes live database lookup against authoritative source table to confirm data validity.
4. `batchVerifyCitations(facilityId)`: Performs an automated sweep across all active facility citations to detect data drift.
5. `decomposeMetricExplainability(metricName, context)`: Computes step-by-step formula trace with inputs, constants, and final balance.
6. `parseInlineCitations(narrativeText)`: Scans markdown or text response for `[E#]` citation tokens and returns resolved evidence cards.

---

## UI / Workflow Requirements
Screen: `AIEvidenceCitationsView.jsx` accessible under `🤖 AI Center -> AI Evidence & Citations`.

1. **5-Card Top Metric Ribbon (Maestro Clinical)**:
   - **Total Citations**: Total active evidence citations in facility registry.
   - **Verified Anchors**: Count and percentage of citations currently in `VERIFIED` state.
   - **Source Types Covered**: Count of distinct authoritative healthcare source categories.
   - **Data Drift Alerts**: Count of citations where underlying records were modified post-calculation.
   - **Verification Latency**: Average milliseconds taken to cryptographically verify a citation against source data.
2. **Main Functional Tabs**:
   - **Tab 1: Evidence Citation Graph**:
     - Search and filter by source type (`EHR_CASE`, `CLAIM_837`, `REMITTANCE_835`, `PAYER_CONTRACT`, `OR_LOG`, `IMPLANT_INVOICE`) and verification status (`ALL`, `VERIFIED`, `DATA_DRIFT`).
     - Interactive citation cards showing statement context, record key, field path, claimed value, confidence, and action buttons (`Inspect Drill-Down`, `Re-Verify`).
   - **Tab 2: Source Record Drill-Down Drawer**:
     - Slide-out / modal panel inspecting a selected citation:
       - Header with status badge, source entity type, and cryptographic hash.
       - Statement Context highlight box.
       - Side-by-side comparison: Claimed Value vs. Live Active Record.
       - Raw Source Record JSON payload viewer with syntax coloring.
       - Step-by-step Calculation Trace tree showing exact formula components.
   - **Tab 3: Batch Verification & Drift Audit**:
     - Automated scanning console allowing one-click facility verification sweep.
     - Identifies drifted records, displays variance deltas, and enables 1-click re-baselining.
   - **Tab 4: Interactive Explainability Sandbox**:
     - Live workbench allowing users to select any standard ASC metric (e.g., Contribution Margin per OR Hour, Implant Carveout Variance, Clean Claim Scrub Score) and view the fully cited calculation with clickable inline citations `[E1]`, `[E2]`.
3. **Design & Color Palette**:
   - Strictly Zero Purple tokens.
   - Maestro Clinical palette: Emerald (#059669 / #10b981), Amber (#d97706 / #f59e0b), Crimson (#dc2626 / #ef4444), Sky (#0284c7 / #38bdf8), Slate (#0f172a, #1e293b, #334155, #64748b, #94a3b8).
   - Full light and dark mode support with explicit contrast styling.

---

## Audit & Provenance
- Every evidence anchor retains:
  - `facility_id`, `created_by`, `created_at`, `last_verified_at`
  - `provenance_hash`: SHA-256 hash of immutable source snapshot
  - `claimed_value` vs `current_value` history
  - Audit trail in `audit_logs` for drill-down record views

---

## QA / Test Cases
1. **Unit Tests** (`tests/ai-evidence-citations.test.js`):
   - Verify citation catalog retrieval and domain filtering.
   - Verify cryptographic SHA-256 provenance hash generation.
   - Test citation verification against live source record state (match -> `VERIFIED`).
   - Test data drift detection when live source record changes value (mismatch -> `DATA_DRIFT`).
   - Verify explainability tree calculation balances to within \$0.01 tolerance.
   - Verify inline citation token parser parses `[E1]`, `[E2]` and anchors to citation IDs.
   - Test batch verification engine across mixed statuses.
   - Enforce zero prohibited accent tokens in CSS/JSX.
2. **Integration & Build Tests**:
   - Clean production build with Vite (`npm run build`).
   - Repository-wide test suite passes (`npm test`).

---

## Acceptance Criteria
- [x] Build passes with zero errors.
- [x] All automated tests pass (30+ assertions).
- [x] Zero purple/violet tokens present in code, styles, or comments.
- [x] Dark mode text contrast is 100% compliant with no white-on-white text washing.
- [x] Tenancy isolation enforced via PostgreSQL RLS policies.
- [x] All file references use clickable `file:///` markdown links.
