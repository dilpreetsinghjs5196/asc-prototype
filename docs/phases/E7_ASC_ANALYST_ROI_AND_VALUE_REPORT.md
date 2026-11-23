# E7 ASC ANALYST ROI AND VALUE REPORT

## Purpose
The ASC Analyst Return on Investment (ROI) and Validated Value Report serves as the authoritative, executive-grade capstone of Module 14 (CFO Dashboard & Financial Accounting). It quantitatively measures, reconciles, and proves the economic return delivered by the ASC Analyst platform to surgery center owners, management boards, and CFOs. By synthesizing software investment costs (Total Cost of Ownership - TCO) against multi-pillar validated economic recoveries across billing, supply chain, operating room scheduling, and compliance, this specification establishes an unassailable audit trial that answers the definitive board question: *"What is the exact financial return delivered by our software investment?"*

## Scope
- Define production requirements for software ROI quantification, validated economic value attribution, cost-of-inaction modeling, and payback velocity.
- Preserve deterministic compatibility with the upstream Decision Intelligence engine (Module 13 / Phase D6 Realized Value), Decision Ledger (Phase D5), and CFO Accounting P&L boundaries (Phase E0-E6).
- Use deterministic, auditable rules for calculating Gross Value, Net Realized Value, Net ROI %, ROI Multipliers, Payback Periods, and Cost of Inaction (COI).
- Enforce strict organization/facility multi-tenancy and Role-Based Access Control (RBAC).
- Provide boardroom dossier presentation modes, cryptographic SHA-256 immutability seals, and line-item transaction provenance.

## Current State
Document what exists today in the repository/database before implementation.

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/realizedValueService.js` | **KEEP** | Authoritative 4-pillar realized economic value service from Phase D6; calculates action-level gross and net values. |
| `src/services/decisionLedgerService.js` | **KEEP** | Double-entry decision audit ledger tracking recommendation approvals, executions, and realized outcomes. |
| `src/services/boardReportingService.js` | **KEEP** | Phase E6 board reporting package engine delivering executive scorecards and narrative packaging. |
| `public.facility_board_packages` | **KEEP** | Migration 120 board package master table. |
| `public.facility_roi_reports` | **MISSING** | Master table storing facility-level software investment, 4-pillar validated value sums, ROI multipliers, payback periods, and SHA-256 seals. |
| `public.roi_value_line_items` | **MISSING** | Granular line-item attribution table connecting individual validated value claims to source remittances, claims, or purchase contracts. |
| `src/services/roiValueReportService.js` | **MISSING** | Dedicated service calculating TCO, 4-pillar value synthesis, ROI ratios, COI pipeline, and cryptographic report seals. |
| `src/components/RoiValueReportView.jsx` | **MISSING** | Interactive executive UI displaying ROI metrics, pillar decomposition, payback timeline, attribution drill-down, and dossier export. |

## Target State
1. **Executive ROI Scorecard**:
   - Total Platform Investment (TCO): Annual subscription fees + implementation/integration amortization ($42,000 YTD).
   - Gross Validated Economic Value: Combined total across all 4 value pillars ($422,225.00 YTD).
   - Staff Intervention Labor: Quantified clinical and billing staff effort deducted from gross value ($18,200.00 YTD).
   - Net Realized Economic Value: Net cash and margin delivered ($404,025.00 YTD).
   - Net Platform ROI %: `861.96%` net return over software investment.
   - ROI Multiple: `9.62x` cash-on-cash multiple.
   - Payback Horizon: `1.04 months` (31 days) to full software capital recoupment.
   - Cost of Inaction (COI): Quantified addressable revenue leakage remaining unworked in queue ($164,500.00).

2. **4-Pillar Validated Value Framework**:
   - **Pillar 1: Recovered Revenue**: Payer underpayments, missing secondary claims, and carve-out recoupments ($148,500.00).
   - **Pillar 2: Direct Non-Labor Savings**: Implant vendor contract tiering and surgical custom pack standardization ($96,400.00).
   - **Pillar 3: Capacity Monetization**: Released block hours re-allocated and staffed at peak contribution margin ($132,325.00).
   - **Pillar 4: Avoided Costs**: Timely filing deadline denials prevented and nurse overtime mitigated ($45,000.00).

3. **Value Attribution & Audit Provenance**:
   - Every claimed dollar is traceable to a specific transaction, remittance, claim ID, or vendor contract invoice.
   - Cryptographic SHA-256 report hash seals the data against retro-active alteration.
   - Presentation dossier mode supports clean one-click executive print and boardroom export.

## Data Model / Schema
Database tables and views to be created in `supabase/migrations/121_roi_and_value_report.sql`:

```sql
-- 1. Facility ROI Reports Master Table
CREATE TABLE IF NOT EXISTS public.facility_roi_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    report_code VARCHAR(32) NOT NULL,
    report_title VARCHAR(128) NOT NULL,
    period_type VARCHAR(16) NOT NULL DEFAULT 'YTD' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL', 'YTD')),
    period_code VARCHAR(16) NOT NULL DEFAULT '2026-YTD-M10',
    evaluation_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_AUDIT', 'PUBLISHED_AUDITED', 'SUPERSEDED', 'ARCHIVED')
    ),
    version_number INT NOT NULL DEFAULT 1,

    -- Platform Investment (TCO)
    annual_software_fee NUMERIC(14, 2) NOT NULL DEFAULT 36000.00,
    implementation_fee NUMERIC(14, 2) NOT NULL DEFAULT 12000.00,
    total_platform_investment NUMERIC(14, 2) NOT NULL DEFAULT 42000.00,

    -- 4-Pillar Gross Validated Values
    recovered_revenue NUMERIC(14, 2) NOT NULL DEFAULT 148500.00,
    direct_savings NUMERIC(14, 2) NOT NULL DEFAULT 96400.00,
    capacity_value NUMERIC(14, 2) NOT NULL DEFAULT 132325.00,
    avoided_costs NUMERIC(14, 2) NOT NULL DEFAULT 45000.00,
    gross_validated_value NUMERIC(14, 2) NOT NULL DEFAULT 422225.00,

    -- Labor & Net Metrics
    staff_intervention_hours NUMERIC(10, 2) NOT NULL DEFAULT 280.00,
    hourly_labor_rate NUMERIC(10, 2) NOT NULL DEFAULT 65.00,
    staff_labor_cost NUMERIC(14, 2) NOT NULL DEFAULT 18200.00,
    net_validated_value NUMERIC(14, 2) NOT NULL DEFAULT 404025.00,

    -- Executive ROI Metrics
    net_roi_percent NUMERIC(8, 2) NOT NULL DEFAULT 861.96,
    roi_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 9.62,
    payback_period_months NUMERIC(4, 2) NOT NULL DEFAULT 1.04,
    cost_of_inaction NUMERIC(14, 2) NOT NULL DEFAULT 164500.00,

    executive_narrative TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_roi_report UNIQUE (facility_id, report_code)
);

-- 2. ROI Value Line Items (Transaction Provenance)
CREATE TABLE IF NOT EXISTS public.roi_value_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES public.facility_roi_reports(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    pillar_code VARCHAR(32) NOT NULL CHECK (
        pillar_code IN ('RECOVERED_REVENUE', 'DIRECT_SAVINGS', 'CAPACITY_VALUE', 'AVOIDED_COST')
    ),
    category_name VARCHAR(64) NOT NULL,
    item_description VARCHAR(256) NOT NULL,
    source_reference_id VARCHAR(64) NOT NULL,
    gross_amount NUMERIC(14, 2) NOT NULL,
    labor_offset NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    net_amount NUMERIC(14, 2) NOT NULL,
    validation_source VARCHAR(64) NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Telemetry View
CREATE OR REPLACE VIEW public.vw_facility_roi_telemetry AS
SELECT
    r.facility_id,
    r.id AS report_id,
    r.report_code,
    r.report_title,
    r.period_type,
    r.period_code,
    r.evaluation_date,
    r.status,
    r.total_platform_investment,
    r.gross_validated_value,
    r.staff_labor_cost,
    r.net_validated_value,
    r.net_roi_percent,
    r.roi_multiplier,
    r.payback_period_months,
    r.cost_of_inaction,
    r.frozen_hash,
    r.is_published,
    COUNT(l.id) AS line_item_count
FROM public.facility_roi_reports r
LEFT JOIN public.roi_value_line_items l ON l.report_id = r.id
GROUP BY
    r.facility_id, r.id, r.report_code, r.report_title, r.period_type, r.period_code,
    r.evaluation_date, r.status, r.total_platform_investment, r.gross_validated_value,
    r.staff_labor_cost, r.net_validated_value, r.net_roi_percent, r.roi_multiplier,
    r.payback_period_months, r.cost_of_inaction, r.frozen_hash, r.is_published;
```

## Business Rules
1. **Total Platform Investment (TCO)**:
   $$TCO = \text{Annual Software Subscription Fee} + \text{Implementation / Integration Fee}$$
   For partial YTD periods, the software subscription fee is pro-rated across active months.
2. **Gross Validated Economic Value**:
   $$\text{Gross Value} = \text{Recovered Revenue} + \text{Direct Savings} + \text{Capacity Value} + \text{Avoided Costs}$$
3. **Net Validated Value**:
   $$\text{Net Value} = \text{Gross Value} - (\text{Staff Intervention Hours} \times \text{Hourly Labor Rate})$$
4. **Net Platform ROI %**:
   $$\text{ROI } \% = \frac{\text{Net Validated Value} - TCO}{TCO} \times 100$$
5. **ROI Multiplier**:
   $$\text{ROI Multiplier} = \frac{\text{Net Validated Value}}{TCO}$$
6. **Payback Period (Months)**:
   $$\text{Payback Months} = \frac{TCO}{\frac{\text{Net Validated Value}}{\text{Active Months}}}$$
7. **Cost of Inaction (COI)**:
   $$\text{COI} = \sum \text{Addressable Revenue Leakage and Underpayment Opportunities with Status 'PENDING' or 'IGNORED'}$$
8. **Cryptographic Seal Rule**:
   Once status is updated to `PUBLISHED_AUDITED`, `frozen_hash` is computed as a SHA-256 digest over the entire scorecard payload, preventing further changes.

## Permissions / Security
- `cfo`, `facility_administrator`, `org_admin`, `super_admin`: Full permission to view, audit, compute, and publish the ROI report.
- `board_member`, `physician_owner`: Read-only access to published reports and presentation dossiers.
- `biller`, `materials_manager`: Read-only access to respective pillar line-item attribution.
- AI Tools: Bound by facility tenancy and RLS policies; prohibited from bypassing publication seals.

## API / Service Requirements
- `getFacilityRoiReports(facilityId)`: Retrieves all ROI report summaries for the active facility.
- `getRoiReportByIdOrCode(identifier, facilityId)`: Retrieves full report model by code or UUID.
- `getRoiReportTelemetry(facilityId, reportCode)`: Aggregates executive ribbon telemetry and KPIs.
- `getRoiValueLineItems(reportIdOrCode)`: Retrieves granular transaction provenance line items.
- `calculateRoiMetrics(inputs)`: Authoritative calculation helper evaluating TCO, gross/net value, ROI %, multiplier, and payback.
- `publishAndFreezeRoiReport(reportCode, publishedBy)`: Issues SHA-256 cryptographic seal and updates status to `PUBLISHED_AUDITED`.
- `generateRoiDossier(reportCode, facilityId)`: Compiles boardroom presentation dossier.

## UI / Workflow Requirements
- **Executive KPI Ribbon (6 Cards)**:
  1. Net ROI % (`861.96%`)
  2. ROI Multiplier (`9.62x`)
  3. Net Validated Value (`$404,025`)
  4. Platform Investment TCO (`$42,000`)
  5. Payback Horizon (`1.04 mos / 31 days`)
  6. Cost of Inaction (`$164,500`)
- **4-Pillar Value Decomposition Chart & Progress Cards**:
  - Breakdown by Revenue Recovery, Direct Savings, Capacity Monetization, and Avoided Costs.
- **Payback Velocity & Investment Amortization Matrix**:
  - Cumulative monthly trajectory illustrating month-by-month investment recovery.
- **Granular Line-Item Attribution Table**:
  - Filterable by pillar, searchable by reference ID or description, detailing gross amount, labor offset, and net amount.
- **Governance Drawer & Cryptographic Seal**:
  - Slide-out drawer with SHA-256 audit digest verification and provenance metadata.
- **Presentation Dossier Mode**:
  - Clean view optimized for boardroom screen presentation and `@media print` paper output.
- **Strict Theme & Color Ban**:
  - Full support for dark theme and light theme.
  - Strict ZERO prohibited tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`).

## Audit / Provenance
- Every report maintains `created_at`, `updated_at`, `published_at`, and `published_by`.
- Line items include `source_reference_id`, `validation_source`, and `verified_at`.
- Immutable SHA-256 hash seals ensure data integrity for board reviews.

## QA / Test Cases
1. Telemetry returns accurate October 2026 / YTD scorecard metrics ($42k TCO, $422k gross, $404k net, 861.96% ROI, 9.62x).
2. Facility UUID alias resolution matches Naples Surgery Center across strings and object configurations.
3. 4-Pillar gross value math correctly sums revenue, savings, capacity, and avoided costs.
4. Net value math deducts staff intervention labor ($280 hrs @ $65/hr = $18,200).
5. Net ROI % formula accurately yields `((404025 - 42000) / 42000) * 100 = 861.96%`.
6. ROI multiplier formula accurately yields `404025 / 42000 = 9.62x`.
7. Payback period formula accurately yields `42000 / (404025 / 10) = 1.04 months`.
8. Line-item attribution retrieval returns verified provenance rows across all 4 pillars.
9. Dual facade re-export parity between `src/services/` and `src/lib/`.
10. Publication hard-freezes report and writes 64-character SHA-256 cryptographic seal.
11. Migration 121 UP/DOWN SQL structural integrity and RLS policy verification.
12. Strict Zero-Prohibited Token Compliance (no purple/violet/indigo/magenta/fuchsia) and App shell integration.

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint passes with zero errors.
- All 12 test cases pass in `tests/roi-value-report.test.js`.
- All 8 CFO test suites pass concurrently.
- No mock/placeholder values presented as truth; verified against closed Naples Surgery Center operating data.
- Tenant isolation enforced for `fac-naples-01`.
- Clean light and dark mode design.

## Dependencies
- Phase D6: `realizedValueService.js` (4-pillar value principles)
- Phase D5: `decisionLedgerService.js` (provenance ledger)
- Phase E0: `managementPnlService.js` (P&L boundaries)
- Phase E6: `boardReportingService.js` (board dossier architecture)

## Definition of Done
The feature is complete when the database schema, calculations, service layer, UI components, App shell integration, test suites, and documentation are all merged, verified with 0 errors, and committed.

## Implementation Notes
- Migration: `supabase/migrations/121_roi_and_value_report.sql` and `121_roi_and_value_report_down.sql`
- Service: `src/services/roiValueReportService.js` and `src/lib/roiValueReportService.js`
- Component: `src/components/RoiValueReportView.jsx` and `src/components/RoiValueReportView.css`
- App Shell: `src/App.jsx`
- Test Suite: `tests/roi-value-report.test.js`
