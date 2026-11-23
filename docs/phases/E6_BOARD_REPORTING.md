# E6 BOARD REPORTING & EXECUTIVE KPI PACKAGE

## Purpose
The Board Reporting and Executive KPI Package engine establishes an auditable, deterministic governance framework for Ambulatory Surgery Center (ASC) Boards of Managers, physician investors, and executive leadership. ASC boards require consolidated, high-fidelity financial and clinical summaries that synthesize multi-module operational realities into clear board-level scorecards, auditable variance explanations, operational risk assessments, and strategic initiative tracking.

This module consolidates authoritative figures from Phase E0 Management P&L, Phase E1 Budget vs. Actual, Phase E2 Rolling Forecast, Phase E3 13-Week Cash Forecast, Phase E4 Break-Even Analysis, and Phase E5 Scenario Modeling. It generates deterministic executive commentary, evaluates debt covenant compliance, tracks physician partner utilization, and produces presentation-ready, cryptographically sealed board packages.

---

## Scope
- **Production Requirements:** Multi-version board package lifecycle management (`DRAFT`, `UNDER_CFO_REVIEW`, `PUBLISHED_TO_BOARD`, `SUPERSEDED`, `ARCHIVED`), executive scorecard synthesis (Net Revenue, Case Volume, Clinical Margin, Operating EBITDA, DSO, Cash Runway, OR Utilization), automated narrative commentary generation, section-level management commentary (Financial, Clinical Operations, RCM & Cash, Strategic Initiatives, Risk & Compliance), and one-click PDF/presentation print mode.
- **ASCANALYST Compatibility:** Native synthesis across Phase E0 (`management_pnl_statement_lines`), Phase E1 (`budget_variance_analyses`), Phase E2 (`rolling_forecast_line_items`), Phase E3 (`facility_cash_forecasts`), Phase E4 (`facility_break_even_models`), Phase E5 (`facility_scenarios`), and Phase 60 OR Scheduling (`operating_room_models`).
- **Deterministic Billing & Financial Logic:** Hard mathematical invariants governing Net Patient Revenue ($\text{NPR} = \text{Gross} - \text{Allowances} - \text{Bad Debt}$), Budget Variances ($\Delta = \text{Actual} - \text{Budget}$), Direct Clinical Contribution Margin ($\text{DCM} = \text{NPR} - \text{Direct Costs}$), Operating EBITDA ($\text{EBITDA} = \text{DCM} - \text{Fixed Overhead}$), Days Sales Outstanding ($\text{DSO} = (\text{AR} / \text{NPR}) \times 30$), and OR Utilization ($\text{Util} = \text{OR Minutes} / 40,320$).
- **Tenancy & RBAC:** Enforced facility isolation with Naples Surgery Center (`fac-naples-01` / `00000000-0000-0000-0000-000000000002`) compatibility, CFO-exclusive publishing rights, board member read-only access, and cryptographic SHA-256 digital seals.

---

## Current State
An audit of existing repository assets and database models reveals the following component classifications:

| Component | Status | Classification | Current Behavior & Gap Analysis |
|:---|:---|:---|:---|
| `public.management_pnl_statement_lines` (Migration 114) | Active | **KEEP** | Authoritative closed-period financial statements (October 2026: $1,150,000 NPR, $240,000 EBITDA). Supplies P&L actuals. |
| `public.budget_variance_analyses` (Migration 115) | Active | **KEEP** | Budget targets and 3-way variance decomposition ($-30k NPR variance, $+10k cost savings). |
| `public.facility_cash_forecasts` (Migration 117) | Active | **KEEP** | 13-week liquidity, starting cash ($1.25M), ending cash ($1.38M), and debt covenant floor ($400k). |
| `public.facility_break_even_models` (Migration 118) | Active | **KEEP** | Unit contribution margin ($2,000/case), break-even volume (120 cases), and margin of safety (120 cases / 50%). |
| `public.facility_scenarios` (Migration 119) | Active | **KEEP** | What-if operational scenarios (expansion, commercial rate shifts, supply chain inflation). |
| Disconnected Manual PowerPoint Decks | Legacy | **REPLACE** | Manual copy-pasting of numbers into slide decks, creating reconciliation errors, unsynchronized metrics, and no digital audit trail. |
| Board Package Master Schema | Missing | **MISSING** | No database tables tracking monthly or quarterly board packages, publication timestamps, or board review statuses. |
| Board Package Sections Schema | Missing | **MISSING** | No normalized storage for structured narrative sections (Financial, Operations, RCM, Strategy, Risk). |
| Deterministic Narrative Engine | Missing | **MISSING** | No automated service synthesizing disparate CFO modules into coherent, deterministic executive commentary. |
| Presentation Dossier View & Print CSS | Missing | **MISSING** | No high-fidelity executive board reporting interface with formal typography, KPI scorecard, narrative blocks, and print styling. |

---

## Target State
The target state delivers an enterprise-grade CFO Board Reporting & Executive Package suite:
1. **Authoritative Board Scorecard (October 2026 Close / Q4 2026 Package):**
   - **Net Patient Revenue (NPR):** $\$1,150,000.00$ (Budget: $\$1,180,000.00$; Variance: $-\$30,000.00$ / $-2.54\%$).
   - **Surgical Case Volume:** $240$ cases (Budget: $250$; Variance: $-10$ cases / $-4.0\%$).
   - **Direct Clinical Margin:** $\$480,000.00$ ($41.74\%$ of NPR; $\$2,000.00$ unit CM).
   - **Operating EBITDA:** $\$240,000.00$ ($20.87\%$ margin; Budget: $\$250,000.00$; Variance: $-\$10,000.00$).
   - **Ending Cash Balance:** $\$1,250,000.00$ operating liquidity ($\$850,000$ surplus above $\$400,000$ debt covenant floor).
   - **Days Sales Outstanding (DSO):** $32$ days (Target: $<35$ days; Favorable).
   - **OR Capacity Utilization:** $45.24\%$ across 4 OR suites ($18,240$ minutes used out of $40,320$ available).
   - **Clean Claim First-Pass Rate:** $96.8\%$ (UB-04 / 837 claim submission yield).
2. **Structured Narrative Sections:**
   - **Section 1: Executive Financial Summary:** Synthesizes gross-to-net collections, clinical contribution margin yield, and operating EBITDA vs budget.
   - **Section 2: Surgical Operational Throughput:** Evaluates specialty volume distribution (Orthopedics: 65, Spine: 35, Ophthalmology: 70, Pain: 50, General: 20), OR utilization, and surgeon block efficiency.
   - **Section 3: Revenue Cycle & Liquidity Management:** Details 13-week cash generation, weekly payroll timing, DSO performance, and debt covenant cushions.
   - **Section 4: Strategic Initiatives & Physician Recruitment:** Details recruitment of 2 total joint surgeons projected to add 30 cases and $+111\text{k}$ EBITDA.
   - **Section 5: Enterprise Risk & Compliance:** Assesses supply chain inflation, commercial payer renewal posture, and accreditation compliance.
3. **Deterministic Commentary Generation:**
   - Automatically builds natural-language variance explanations directly from underlying general ledger and scheduling data without hallucination or manual re-keying.
4. **Governance & Digital Audit Seal:**
   - Formal board lifecycle transitions: `DRAFT` $\rightarrow$ `UNDER_CFO_REVIEW` $\rightarrow$ `PUBLISHED_TO_BOARD`.
   - Hard-freeze with SHA-256 cryptographic seal upon publication.

---

## Data Model / Schema

### 1. `public.facility_board_packages`
Stores board report packages, executive KPI scorecard metrics, publication metadata, and cryptographic seals.
```sql
CREATE TABLE IF NOT EXISTS public.facility_board_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    package_code VARCHAR(32) NOT NULL, -- e.g. 'BOD_2026_M10', 'BOD_2026_Q4'
    package_title VARCHAR(128) NOT NULL,
    period_type VARCHAR(16) NOT NULL DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    period_code VARCHAR(16) NOT NULL, -- '2026-M10'
    meeting_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'UNDER_CFO_REVIEW', 'PUBLISHED_TO_BOARD', 'SUPERSEDED', 'ARCHIVED')
    ),
    version_number INT NOT NULL DEFAULT 1,
    
    -- Executive Scorecard KPIs
    actual_cases INT NOT NULL DEFAULT 240,
    budgeted_cases INT NOT NULL DEFAULT 250,
    case_variance INT NOT NULL DEFAULT -10,
    actual_npr NUMERIC(14, 2) NOT NULL DEFAULT 1150000.00,
    budgeted_npr NUMERIC(14, 2) NOT NULL DEFAULT 1180000.00,
    npr_variance NUMERIC(14, 2) NOT NULL DEFAULT -30000.00,
    actual_ebitda NUMERIC(14, 2) NOT NULL DEFAULT 240000.00,
    budgeted_ebitda NUMERIC(14, 2) NOT NULL DEFAULT 250000.00,
    ebitda_variance NUMERIC(14, 2) NOT NULL DEFAULT -10000.00,
    ebitda_margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 20.87,
    ending_cash_balance NUMERIC(14, 2) NOT NULL DEFAULT 1250000.00,
    minimum_cash_covenant NUMERIC(14, 2) NOT NULL DEFAULT 400000.00,
    covenant_headroom NUMERIC(14, 2) NOT NULL DEFAULT 850000.00,
    days_sales_outstanding INT NOT NULL DEFAULT 32,
    clean_claim_rate NUMERIC(6, 2) NOT NULL DEFAULT 96.80,
    or_capacity_utilization_percent NUMERIC(6, 2) NOT NULL DEFAULT 45.24,
    
    executive_summary TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_published BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES auth.users(id),
    frozen_hash VARCHAR(64),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_board_package UNIQUE (facility_id, package_code)
);
```

### 2. `public.board_package_sections`
Stores detailed narrative commentary and operational drill-downs per section.
```sql
CREATE TABLE IF NOT EXISTS public.board_package_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID NOT NULL REFERENCES public.facility_board_packages(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    section_code VARCHAR(32) NOT NULL, -- 'FINANCIAL', 'CLINICAL_OPS', 'RCM_CASH', 'STRATEGY', 'RISK'
    section_title VARCHAR(128) NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    key_highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
    narrative_text TEXT NOT NULL,
    cfo_commentary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_board_package_section UNIQUE (package_id, section_code)
);
```

---

## Business Rules
1. **Tenant Isolation:** Every board package belongs strictly to one `facility_id`. Cross-tenant data leakage is blocked.
2. **Deterministic Synthesis:** All scorecard numbers must tie out strictly to underlying P&L, budget, cash forecast, and scheduling tables. No mock or placeholder numbers presented as production truth.
3. **Publication Lock:** Once a package is transitioned to `PUBLISHED_TO_BOARD`, it is cryptographically locked with a SHA-256 seal and cannot be modified without generating a new version.
4. **Covenant Alerting:** If `ending_cash_balance - minimum_cash_covenant < $100,000`, the package must prominently display a critical covenant risk alert.
5. **Role-Based Access Control:** Board members have read-only access to published packages; only CFO, Administrator, and Super Admin roles can draft, edit narrative, and publish packages.

---

## Acceptance Criteria
- Migration 120 applies cleanly with RLS policies and seed data for Naples Surgery Center.
- Down migration cleanly rolls back tables and views without residual side effects.
- Core service provides deterministic package retrieval, narrative generation, and dual facade parity (`src/services/` and `src/lib/`).
- Interactive UI provides executive scorecard ribbon, printable board package presentation mode, narrative section accordion/tabs, and cryptographic seal audit drawer.
- Zero prohibited accent tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) across all CSS, JSX, and comments.
- 100% automated test coverage in `tests/board-reporting.test.js` (12 tests) and all existing test suites passing.
- `npm run build` compiles with zero errors.
