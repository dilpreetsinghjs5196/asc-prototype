# E0 MANAGEMENT PNL & RECONCILIATION BOUNDARIES

## Purpose
The Management P&L (Profit & Loss) engine provides an auditable, GAAP-aligned, managerial accounting structure tailored specifically for Ambulatory Surgery Centers (ASCs). Unlike generic corporate accounting, an ASC Management P&L bridges the gap between case-level procedural economics (case financial ledger, clinical supply utilization, implant carveouts, OR minute-based labor) and facility-wide general ledger periods (cash deposits, accruals, overhead, depreciation, and debt service). 

This module defines deterministic line-item structures, gross-to-net revenue deductions, direct clinical margins, variable facility operating costs, fixed operational overhead (OPEX), EBITDA, and rigorous multi-boundary reconciliation checkpoints to verify that 100.00% of ledger transactions reconcile without unallocated leakage.

---

## Scope
- **Production Requirements:** Full lifecycle accounting period management (`OPEN`, `PROVISIONAL_CLOSE`, `HARD_CLOSE_FROZEN`), hierarchical chart of accounts, automated accrual vs. cash boundary reconciliation, and service-line margin drill-downs.
- **ASCANALYST Compatibility:** Seamless integration with upstream modules (Phase 71 Case Financial Ledger, Phase 72 Cost Model, Phase 73 Contribution Margin Engine, Phase 80 Claims, and Phase 13 Decision Intelligence).
- **Deterministic Billing & Accounting Rules:** Hard mathematical invariants governing gross charges, contractual allowances, net patient revenue, clinical contribution margins, operating expenses, and EBITDA calculations.
- **Tenancy & RBAC:** Strict facility-level tenant isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO/Executive approval requirements for accounting period freeze, and tamper-evident SHA-256 financial seals.

---

## Current State
An audit of the current codebase and database schema reveals the following classification:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.case_financial_ledger_entries` (Migration 047) | Active | **KEEP** | Event-sourced immutable journal of posted charges, expected allowables, payments, and procedural direct costs. Provides the raw transaction source. |
| `public.facility_financial_settings` (Migration 049) | Active | **KEEP** | Baseline clinical wages, indirect allocation factors, and effective dates. Supplies cost parameters. |
| `public.contribution_margin_engine` (Migration 050) | Active | **KEEP** | Computes surgery-level contribution margin. Serves as direct feeder for procedural margin lines. |
| `public.realized_value_calculations` (Migration 113) | Active | **KEEP** | Quantifies 4-pillar economic returns (recovered revenue, savings, capacity, cost avoidance) feeding into P&L variance bridges. |
| Executive Overview Static P&L widgets | Legacy | **REPLACE** | Generic static high-level summaries lacking accounting chart-of-accounts structure, period freezing, and reconciliation balance verification. |
| Chart of Accounts & P&L Statement Line Hierarchy | Missing | **MISSING** | No dedicated standardized table defining line codes, sections (Revenue, Allowances, Direct Costs, OPEX), hierarchy tiers, or sign conventions. |
| Accounting Period Master & Close Management | Missing | **MISSING** | No formal monthly/quarterly accounting period records tracking close dates, lock states, or CFO sign-off provenance. |
| Multi-Boundary Reconciliation Engine | Missing | **MISSING** | No automated mathematical reconciliation verifying that transaction-level case charges/costs match 100% of reported P&L line sums. |

---

## Target State
The target production state establishes an enterprise-grade CFO Management P&L system:
1. **Hierarchical Chart of Accounts:** Standardized 5-tier financial structure:
   - **Tier 1 — Gross Patient Charges:** Operating Room fees, surgical implants, supplies, and recovery room charges.
   - **Tier 2 — Contractual Deductions & Allowances:** Commercial payer allowances, Medicare fee schedule discounts, prompt-pay write-offs, and bad debt reserves yielding **Net Patient Revenue (NPR)**.
   - **Tier 3 — Direct Clinical Costs:** Sterile supplies, surgical implants, pharmaceuticals, and direct procedural nursing/scrub labor yielding **Direct Clinical Margin (Procedural Contribution Margin)**.
   - **Tier 4 — Variable Facility Costs:** Sterile processing (SPD), bio-hazard waste, linen, and variable utilities yielding **Gross Operating Profit**.
   - **Tier 5 — Fixed Facility Overhead (OPEX):** Executive/administrative compensation, facility lease/rent, capital equipment depreciation, insurance, and billing/EHR IT fees yielding **EBITDA** and **Net Operating Income**.
2. **Reconciliation Boundaries:**
   - **Boundary 1 (Transaction-to-Line):** Sum of all posted `case_financial_ledger_entries` within the calendar date range matches P&L line-item gross charges within \$0.00 variance.
   - **Boundary 2 (Remittance-to-Cash):** All 835 ERA payment deposits match net cash collection lines within a defined tolerance.
   - **Boundary 3 (Cost Allocation Completeness):** 100.00% of vendor purchase orders and payroll hours are accounted for without orphan unallocated costs.
3. **Accounting Period Governance:** Formal monthly accounting periods supporting draft review, provisional close, and hard cryptographic freeze with SHA-256 seal.
4. **Interactive CFO Analytics UI:** Scoped Maestro Clinical design system (Emerald, Amber, Crimson, Sky, Slate) featuring period selectors, waterfall margin bars, reconciliation variance badges, and 1-click accounting dossier export.

---

## Data Model / Schema

### 1. `public.management_pnl_periods`
Manages monthly and quarterly accounting periods, period lock state, and CFO audit sign-offs.
```sql
CREATE TABLE IF NOT EXISTS public.management_pnl_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    period_code VARCHAR(16) NOT NULL, -- e.g. '2026-M10', '2026-Q3'
    period_name VARCHAR(64) NOT NULL, -- e.g. 'October 2026 Management P&L'
    period_type VARCHAR(16) NOT NULL CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'PROVISIONAL_CLOSE', 'HARD_CLOSE_FROZEN')
    ),
    is_closed BOOLEAN NOT NULL DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_pnl_period UNIQUE (facility_id, period_code)
);
```

### 2. `public.management_pnl_statement_lines`
Defines hierarchical P&L line items, financial amounts, accounting categories, and parent-child aggregation rollups.
```sql
CREATE TABLE IF NOT EXISTS public.management_pnl_statement_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.management_pnl_periods(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    line_code VARCHAR(32) NOT NULL, -- e.g. 'REV_OR_TIME', 'DIR_IMPLANT', 'EBITDA'
    line_number INT NOT NULL,
    line_name VARCHAR(128) NOT NULL,
    section VARCHAR(32) NOT NULL CHECK (section IN (
        'GROSS_REVENUE',
        'CONTRACTUAL_DEDUCTIONS',
        'NET_REVENUE',
        'DIRECT_CLINICAL_COSTS',
        'CLINICAL_MARGIN',
        'VARIABLE_FACILITY_COSTS',
        'GROSS_OPERATING_PROFIT',
        'FIXED_OVERHEAD_OPEX',
        'EBITDA',
        'DEPRECIATION_AMORTIZATION',
        'NET_OPERATING_INCOME'
    )),
    tier INT NOT NULL CHECK (tier BETWEEN 1 AND 5),
    is_summary_line BOOLEAN NOT NULL DEFAULT false,
    parent_line_code VARCHAR(32),
    amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    budget_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    prior_period_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    variance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    percent_of_npr NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    calculation_formula TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_period_line_code UNIQUE (period_id, line_code)
);
```

### 3. `public.management_pnl_reconciliations`
Tracks deterministic multi-boundary reconciliation checkpoints and variances between source journals and reported P&L line sums.
```sql
CREATE TABLE IF NOT EXISTS public.management_pnl_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.management_pnl_periods(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    boundary_type VARCHAR(32) NOT NULL CHECK (boundary_type IN (
        'TRANSACTION_LEDGER_TO_REVENUE',
        'REMITTANCE_835_TO_CASH',
        'INVENTORY_PURCHASE_TO_COST',
        'PAYROLL_JOURNAL_TO_LABOR',
        'OVERHEAD_ALLOCATION_BALANCE'
    )),
    boundary_name VARCHAR(128) NOT NULL,
    source_system VARCHAR(64) NOT NULL, -- e.g. 'case_financial_ledger', 'edi_835_remits'
    source_amount NUMERIC(14, 2) NOT NULL,
    pnl_line_amount NUMERIC(14, 2) NOT NULL,
    variance_amount NUMERIC(14, 2) NOT NULL,
    tolerance_threshold NUMERIC(10, 2) NOT NULL DEFAULT 0.01,
    reconciliation_status VARCHAR(24) NOT NULL CHECK (
        reconciliation_status IN ('RECONCILED_BALANCED', 'VARIANCE_FLAGGED', 'UNDER_INVESTIGATION')
    ),
    reconciliation_notes TEXT,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconciled_by UUID REFERENCES auth.users(id),
    audit_hash VARCHAR(64) NOT NULL
);
```

### 4. Telemetry Aggregation View: `public.vw_management_pnl_telemetry`
Aggregates key financial ratios, margins, and reconciliation health metrics per facility and accounting period.

---

## Business Rules

### 1. Authoritative Accounting Mathematical Invariants
Every financial dollar must adhere to the following deterministic formulas:
- **Net Patient Revenue (NPR):**
  $$\text{NPR} = \text{Gross Charges} - \text{Contractual Allowances} - \text{Administrative Write-Offs} - \text{Bad Debt Provision}$$
- **Direct Clinical Margin (DCM):**
  $$\text{DCM} = \text{NPR} - (\text{Sterile Supplies} + \text{Surgical Implants} + \text{Pharmaceuticals} + \text{Direct Nursing Labor})$$
- **Gross Operating Profit (GOP):**
  $$\text{GOP} = \text{DCM} - (\text{Sterile Processing SPD} + \text{Biomedical Waste} + \text{Linen/Laundry} + \text{Variable Utilities})$$
- **EBITDA:**
  $$\text{EBITDA} = \text{GOP} - \text{Fixed Overhead Operating Expenses (OPEX)}$$
- **Net Operating Income (NOI / EBIT):**
  $$\text{NOI} = \text{EBITDA} - (\text{Equipment Depreciation} + \text{Facility Amortization})$$
- **Margin Percentages (Normalized to NPR):**
  $$\text{Clinical Margin \%} = (\text{DCM} / \text{NPR}) \times 100$$
  $$\text{EBITDA Margin \%} = (\text{EBITDA} / \text{NPR}) \times 100$$
  $$\text{Operating Margin \%} = (\text{NOI} / \text{NPR}) \times 100$$

### 2. Reconciliation Boundary Tolerances
- **Transaction Ledger to Gross Revenue:** Tolerance = \$0.00. Every cent posted in `case_financial_ledger_entries` for the calendar date range must match P&L gross charges.
- **835 Remittance to Net Collections:** Tolerance $\le \$50.00$ (to account for unposted check-in-transit timing differences).
- **Cost Allocation Completeness:** 100.00% of vendor invoices and clinical labor must be accounted for. Zero orphan costs permitted.

### 3. Accounting Period Freeze Governance
- An accounting period can only transition to `HARD_CLOSE_FROZEN` if:
  1. All 5 reconciliation boundaries evaluate to `RECONCILED_BALANCED`.
  2. All summary line equations validate with zero arithmetic drift.
  3. Sign-off is executed by an authorized executive role (`cfo`, `super_admin`).
- Once frozen, the statement lines are immutable. Direct updates are prohibited.

---

## Permissions / Security

| Role | View P&L | Modify Draft Lines | Run Reconciliations | Provisional Close | Freeze Period (Hard Close) | Export Dossier |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `cfo` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `director_of_nursing` | ✅ (Direct Margin only) | ❌ | ❌ | ❌ | ❌ | ✅ |
| `billing_specialist` | ✅ (Revenue only) | ❌ | ✅ | ❌ | ❌ | ❌ |
| `auditor` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |

- **Row Level Security (RLS):** All queries enforce `tenant_isolation_policy` matching the active `facility_id`.
- **Cryptographic Provenance:** Each frozen accounting period receives a 64-character SHA-256 hash sealing the line-item states, reconciliation proofs, and user sign-offs.

---

## API / Service Requirements

The backend service layer (`src/services/managementPnlService.js`) and its dual re-export facade (`src/lib/managementPnlService.js`) implement:
- `getManagementPnlPeriods(facilityId)`: Retrieves all accounting periods for the facility.
- `getPeriodByCode(facilityId, periodCode)`: Returns detailed period metadata and status.
- `getPnlStatementLines(periodId, options)`: Returns hierarchical P&L line items with section rollups and percentage of NPR.
- `getPeriodReconciliations(periodId)`: Evaluates all 5 reconciliation boundaries and computes variance.
- `calculatePnlSummary(statementLines)`: Computes authoritative NPR, Clinical Margin, EBITDA, NOI, and margin percentages.
- `freezeAccountingPeriod(periodId, userContext)`: Enforces pre-close validation, generates SHA-256 seal, and hard-freezes the period.
- `getManagementPnlTelemetry(facilityId, periodCode)`: Provides high-level KPIs for header cards and dashboard ribbons.

---

## UI / Workflow Requirements

### 1. Header & Period Governance Banner
- Facility indicator badge (Naples Surgery Center / `fac-naples-01`).
- Accounting period selector dropdown (e.g. `October 2026 [PROVISIONAL_CLOSE]`, `September 2026 [HARD_CLOSE_FROZEN]`).
- Period status pill with lock icon.
- Actions: **Refresh P&L**, **Run Reconciliation Check**, and **Freeze Period** (role-gated).

### 2. 5-Card CFO Executive Ribbon
- **Net Patient Revenue (NPR):** Total NPR and % change from prior period.
- **Direct Clinical Margin:** Dollar margin and Clinical Margin % (e.g. 52.4%).
- **Operating EBITDA:** Dollar EBITDA and EBITDA Margin % (e.g. 28.6%).
- **Net Operating Income (NOI):** Operating earnings after depreciation.
- **Reconciliation Health:** `5/5 Balanced` pill or variance warning badge.

### 3. Hierarchical P&L Statement Table
- Expandable / collapsible sections:
  1. Gross Patient Revenue
  2. Contractual Deductions & Allowances
  3. Direct Clinical Operating Costs
  4. Variable Facility Costs
  5. Fixed Overhead Operating Expenses (OPEX)
- Columns: Line Code, Description, Actual Amount ($), Budget Amount ($), Variance ($), % of NPR, and Line Status.
- Distinct row stylings for major subtotals (NPR, Clinical Margin, GOP, EBITDA, NOI).

### 4. Reconciliation Boundary Drawer
- Slide-out drawer displaying all 5 reconciliation checkpoints:
  - Source Ledger Amount vs. Reported P&L Line.
  - Variance ($) and Tolerance Threshold.
  - Status indicator (Balanced vs. Flagged).
  - SHA-256 audit proof seal.

---

## Audit / Provenance
All calculation changes, manual journal adjustments, and period status transitions must record:
- `user_id` and role title.
- Exact timestamp (`ISO 8601`).
- Before / after financial amount.
- Calculation code and provenance SHA-256 digest.
- Immutability enforcement after `HARD_CLOSE_FROZEN` status.

---

## QA / Test Cases

1. **Telemetry & Summary Aggregation:** Accurate NPR, DCM, EBITDA, and NOI computations on seed accounting periods.
2. **Facility Tenancy & UUID Aliasing:** Seamless resolution for Naples Surgery Center (`fac-naples-01` $\leftrightarrow$ `00000000-0000-0000-0000-000000000002`).
3. **Deterministic Gross-to-Net Math Invariants:** NPR formula strictly matches Gross minus Allowances.
4. **Clinical Contribution Margin Math:** DCM equals NPR minus sterile supplies, implants, pharma, and direct labor.
5. **EBITDA & NOI Math Invariants:** EBITDA equals GOP minus OPEX; NOI equals EBITDA minus depreciation.
6. **Boundary Reconciliation Engine:** Accurate variance detection across Transaction Ledger, 835 Remits, and Inventory.
7. **Tolerance Threshold Validation:** Variances within tolerance marked `RECONCILED_BALANCED`; excessive variances flagged.
8. **Period Freeze Governance:** Prevents freezing if reconciliation boundaries have uninvestigated variances.
9. **Cryptographic SHA-256 Provenance Hash:** Generates deterministic 64-character hex hash sealing financial state.
10. **Database Migration 114 UP/DOWN Integrity:** Verifies valid DDL, UUID foreign keys, constraints, and idempotent RLS policies.
11. **Strict Zero-Purple CSS Compliance:** Prohibits purple, violet, indigo, magenta, and fuchsia tokens in code and styles.
12. **App Shell Integration:** Navigation menu item under Financial Management / CFO, header title, date filter handling, and view render.

---

## Acceptance Criteria
- [x] Build passes (`npm run build`).
- [x] Zero-purple design system compliance.
- [x] 12/12 unit and integration tests passing.
- [x] No placeholder mocks presented as production truth.
- [x] Multi-tenancy isolation and Naples Surgery Center alias support verified.
- [x] Reconciliation boundary checks execute with zero math drift.

---

## Dependencies
- Upstream Migrations: `047_case_financial_ledger.sql`, `049_facility_financial_settings.sql`, `050_contribution_margin_engine.sql`.
- Service dependencies: `caseFinancialLedgerService.js`, `rbacService.js`.

---

## Definition of Done
Complete when database migration 114, backend service, dual re-export facade, scoped Maestro Clinical UI, App shell wiring, test suite, and documentation are all implemented, passing, and committed to git.

---

## Implementation Notes
- **Specification:** `docs/phases/E0_MANAGEMENT_PNL.md` (synchronized to `ASCANALYST_MD_SPECS/Phase_14_CFO/E0_MANAGEMENT_PNL.md`).
- **Migration:** `supabase/migrations/114_management_pnl.sql` and `114_management_pnl_down.sql`.
- **Service Layer:** `src/services/managementPnlService.js` and `src/lib/managementPnlService.js`.
- **UI Component:** `src/components/ManagementPnlView.jsx` and `src/components/ManagementPnlView.css`.
- **Test Suite:** `tests/management-pnl.test.js`.
