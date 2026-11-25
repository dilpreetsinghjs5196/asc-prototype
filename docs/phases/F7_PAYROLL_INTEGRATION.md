# F7 PAYROLL INTEGRATION

## Purpose
The Payroll and Labor Integration module establishes an enterprise-grade workforce management gateway, clinical employee directory mapper, automated timecard ingestion engine, burdened labor cost calculator, and case-level perioperative labor allocation processor connecting the ASC Analyst platform to major payroll and workforce management (WFM) platforms (ADP Workforce Now, UKG Kronos/Pro, Paychex Flex, Workday HCM, Gusto, symplr Staffing).

In ambulatory surgery center governance, perioperative labor represents the single largest variable operating cost (30% to 45% of net surgical revenue). Phase F7 bridges raw electronic timecard punches and payroll wage files into granular clinical cases, calculates accurate employee-specific burdened labor rates, identifies overtime spikes, allocates exact OR nursing and anesthesia labor to surgical procedures, and maintains cryptographic audit provenance across all committed payroll runs.

---

## Scope
- Define production requirements for the Payroll & Labor Integration Gateway:
  1. **Connector Configuration (`payroll_connector_configs`)**: Facility-level WFM/payroll vendor setup (ADP, UKG, Paychex), REST API / SFTP transport endpoints, Company/Payroll Group Code, pay period frequency, and automated sync schedules.
  2. **Employee Staff Directory Mapping (`payroll_employee_mappings`)**: Canonical directory linking external payroll employee IDs to platform clinical staff profiles, capturing clinical roles (`CIRCULATING_RN`, `SCRUB_TECH`, `CRNA`, `PACU_RN`, `PREOP_RN`, `SURGICAL_ASSISTANT`), departments, base hourly wages, overtime factors, and benefits burden multipliers.
  3. **Timecard & Clock Punch Batches (`payroll_timecard_batches`)**: High-integrity pay period batch ledgers tracking total regular, overtime, and double-time hours, total gross pay, and total fully burdened labor costs.
  4. **Timecard Shift Entries (`payroll_shift_entries`)**: Itemized shift punch records detailing clock in, clock out, meal break minutes, department codes, and calculated gross/burdened pay.
  5. **Case Labor Allocation Engine (`payroll_case_labor_allocations`)**: Automated matching and allocation of clinical shift hours to perioperative surgical cases based on OR room schedules and case timestamps:
     $$\text{Case Labor Cost} = \sum_{s \in \text{Assigned Staff}} \left( \text{Hourly Burdened Rate}_s \times \text{Overlap Case Duration Hours} \right)$$
     Where $\text{Hourly Burdened Rate}_s = \text{Base Rate}_s \times (1 + \text{Burden Multiplier}_s)$.
  6. **Payroll Exceptions Workqueue (`payroll_exception_logs`)**: Real-time quarantine of unmapped employee IDs, clock punch overlaps, missed clock-outs (>16h shifts), unapproved overtime spikes, and zero-wage shifts.
  7. **Cryptographic Provenance (`payroll_provenance_ledger`)**: SHA-256 immutable audit logging linking every ingested payroll batch and case labor allocation run to facility tenancy.
- Enforce organization and facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State
Document what exists today in the repository/database before implementation.

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/integrationFrameworkService.js` | **KEEP** | Enterprise connector registry with generic connector schema (Phase F0). |
| `src/services/importValidationService.js` | **KEEP** | 6-stage validation pipeline and exception workqueue (Phase F1). |
| `src/services/excelCsvImportService.js` | **KEEP** | Excel/CSV file upload and schema auto-mapping engine (Phase F2). |
| `src/services/sisIntegrationService.js` | **KEEP** | SIS EHR and PMS integration gateway (Phase F3). |
| `src/services/hstIntegrationService.js` | **KEEP** | HST Pathways EHR/PMS integration gateway (Phase F4). |
| `src/services/clearinghouseIntegrationService.js` | **KEEP** | Clearinghouse claims and 835 remittance gateway (Phase F5). |
| `src/services/accountingIntegrationService.js` | **KEEP** | General Ledger ERP and journal balancing gateway (Phase F6). |
| `public.payroll_connector_configs` | **MISSING** | Facility-level payroll vendor endpoints, credentials, and configuration. |
| `public.payroll_employee_mappings` | **MISSING** | Canonical employee directory linking payroll IDs to clinical roles and rates. |
| `public.payroll_timecard_batches` | **MISSING** | Pay period batches tracking hours, wages, and burden totals. |
| `public.payroll_shift_entries` | **MISSING** | Granular electronic shift punches and department allocations. |
| `public.payroll_case_labor_allocations` | **MISSING** | Perioperative case-level labor allocations with hourly rates and minutes. |
| `public.payroll_exception_logs` | **MISSING** | Quarantine workqueue for unmapped staff, missed punches, and OT spikes. |
| `public.payroll_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger recording payroll batch checksums. |
| `src/services/payrollIntegrationService.js` | **MISSING** | Core calculation service handling wage formulas, burdening, and case allocation. |
| `src/components/PayrollIntegrationView.jsx` | **MISSING** | UI dashboard displaying payroll health, telemetry, 5-stage pipeline, and 4 audit subtabs. |

---

## Target State
1. **Automated Payroll & WFM Connector Architecture**:
   - Integration with enterprise payroll systems (ADP Workforce Now, UKG Kronos/Pro, Paychex Flex).
   - Dual-mode synchronization:
     - Nightly Shift Punch Pull: Ingests daily timeclock punches and department transfers.
     - Bi-weekly Payroll Close Reconciliation: Ingests finalized payroll register files, gross earnings, taxes, and benefit burdens.
2. **Deterministic Labor Costing & Burden Calculation**:
   - Fully burdened hourly rate formula:
     $$\text{Hourly Burdened Rate} = \text{Base Hourly Rate} \times \left(1 + \frac{\text{Burden Percent}}{100}\right)$$
   - Overtime and double-time wage calculations adhering strictly to FLSA:
     $$\text{OT Rate} = \text{Base Rate} \times 1.5, \quad \text{DT Rate} = \text{Base Rate} \times 2.0$$
3. **Perioperative Case Labor Allocation**:
   - Matches clinical staff scheduled in intra-operative charting against timecard shift windows.
   - Calculates exact labor cost per surgical case and per OR minute:
     $$\text{Cost per OR Minute} = \frac{\text{Total Case Labor Cost}}{\text{Case Room-In to Room-Out Minutes}}$$
4. **Cryptographic Provenance**:
   - Generates an immutable SHA-256 seal for every committed payroll batch:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{period\_code} \parallel \text{total\_gross\_pay} \parallel \text{status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/129_payroll_integration.sql`:

```sql
-- 1. Payroll Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.payroll_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    payroll_vendor VARCHAR(64) NOT NULL DEFAULT 'ADP_WORKFORCE_NOW' CHECK (
        payroll_vendor IN ('ADP_WORKFORCE_NOW', 'UKG_KRONOS', 'PAYCHEX_FLEX', 'WORKDAY_HCM', 'GUSTO', 'SYMPLR')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_API' CHECK (
        gateway_mode IN ('REST_API', 'SFTP_BATCH', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    company_payroll_code VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    pay_period_frequency VARCHAR(24) NOT NULL DEFAULT 'BIWEEKLY' CHECK (
        pay_period_frequency IN ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY')
    ),
    default_burden_pct NUMERIC(5,2) NOT NULL DEFAULT 22.50,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        sync_status IN ('CONNECTED', 'SYNCING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_payroll_config UNIQUE (facility_id)
);

-- 2. Employee Staff Directory Mapping Table
CREATE TABLE IF NOT EXISTS public.payroll_employee_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    external_employee_id VARCHAR(64) NOT NULL,
    employee_name VARCHAR(128) NOT NULL,
    clinical_role VARCHAR(48) NOT NULL CHECK (
        clinical_role IN (
            'CIRCULATING_RN', 'SCRUB_TECH', 'CRNA', 'ANESTHESIOLOGIST',
            'PACU_RN', 'PREOP_RN', 'SURGICAL_ASSISTANT', 'STERILE_PROCESSING_TECH', 'MATERIALS_MANAGER'
        )
    ),
    department_code VARCHAR(32) NOT NULL DEFAULT 'OR_SUITE',
    base_hourly_rate NUMERIC(10,2) NOT NULL,
    burden_pct NUMERIC(5,2) NOT NULL DEFAULT 22.50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_employee_code UNIQUE (facility_id, external_employee_id)
);

-- 3. Payroll Timecard Batches Table
CREATE TABLE IF NOT EXISTS public.payroll_timecard_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    pay_period_code VARCHAR(16) NOT NULL,
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'COMMITTED' CHECK (
        status IN ('STAGED', 'VALIDATED', 'ALLOCATED', 'COMMITTED', 'ERROR')
    ),
    employee_count INT NOT NULL DEFAULT 0,
    total_regular_hours NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_overtime_hours NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_gross_pay NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_burdened_cost NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_payroll_batch UNIQUE (facility_id, batch_control_number)
);

-- 4. Payroll Shift Entries Table
CREATE TABLE IF NOT EXISTS public.payroll_shift_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.payroll_timecard_batches(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.payroll_employee_mappings(id) ON DELETE CASCADE,
    external_employee_id VARCHAR(64) NOT NULL,
    shift_date DATE NOT NULL,
    clock_in_time TIMESTAMPTZ NOT NULL,
    clock_out_time TIMESTAMPTZ NOT NULL,
    meal_break_minutes INT NOT NULL DEFAULT 30,
    regular_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0.00,
    hourly_rate NUMERIC(10,2) NOT NULL,
    gross_pay NUMERIC(10,2) NOT NULL,
    burdened_cost NUMERIC(10,2) NOT NULL,
    department_code VARCHAR(32) NOT NULL DEFAULT 'OR_SUITE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Perioperative Case Labor Allocations Table
CREATE TABLE IF NOT EXISTS public.payroll_case_labor_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.payroll_timecard_batches(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    platform_case_id UUID,
    service_date DATE NOT NULL,
    assigned_staff_count INT NOT NULL DEFAULT 0,
    total_case_minutes INT NOT NULL,
    regular_labor_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    overtime_labor_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_burdened_labor_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    labor_cost_per_or_minute NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    staffing_variance_status VARCHAR(24) NOT NULL DEFAULT 'WITHIN_BUDGET' CHECK (
        staffing_variance_status IN ('WITHIN_BUDGET', 'OVERTIME_SPIKE', 'UNDERSTAFFED')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Payroll Exception Logs Table
CREATE TABLE IF NOT EXISTS public.payroll_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.payroll_timecard_batches(id) ON DELETE SET NULL,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('MISSED_PUNCH', 'UNMAPPED_STAFF', 'OVERTIME_SPIKE', 'RATE_ANOMALY', 'CALCULATION_ERROR')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_staff_id VARCHAR(64),
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_NURSING_DIRECTOR_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Payroll Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.payroll_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.payroll_timecard_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Business Rules

### Rule 1: Deterministic Burdened Labor Formula
For every staff hour logged:
$$\text{Gross Pay} = (\text{Regular Hours} \times \text{Base Rate}) + (\text{OT Hours} \times \text{Base Rate} \times 1.5)$$
$$\text{Burdened Cost} = \text{Gross Pay} \times \left(1 + \frac{\text{Burden Multiplier}}{100}\right)$$

### Rule 2: Case Labor Allocation Invariant
Total allocated labor cost for any perioperative surgical case is the sum of overlapping staff minutes:
$$\text{Case Labor Cost} = \sum_{s=1}^{N} \left( \frac{\text{Staff Burdened Hourly Rate}_s}{60} \times \text{Overlap Case Minutes}_s \right)$$
$$\text{Labor Cost per Minute} = \frac{\text{Case Labor Cost}}{\text{Case Minutes}}$$

### Rule 3: Timecard Anomaly Safeguards
- Any single shift exceeding 16 consecutive hours triggers an automatic exception (`ERR_MISSED_CLOCK_OUT`).
- Any timecard logged for an employee not found in the employee mapping directory is quarantined with `ERR_UNMAPPED_EMPLOYEE`.
- Overtime exceeding 8 hours in a single shift triggers `WARN_OVERTIME_SPIKE`.

### Rule 4: Cryptographic Batch Sealing
Every committed payroll batch records an immutable SHA-256 seal:
$$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{pay\_period\_code} \parallel \text{total\_gross\_pay} \parallel \text{status})$$

---

## Permissions / Security
- Enforces facility-level tenancy isolation through PostgreSQL Row-Level Security (`app.current_facility_id`).
- Secrets and API credentials are encrypted at rest and masked in UI responses (`pay_sec_****_7712`).
- RBAC Matrix:
  - `Facility Administrator` / `Clinical Nursing Director`: Full read, write, shift adjustments, labor allocation runs, and exception resolution.
  - `Business Office Manager`: Read, batch review, and labor variance reporting.
  - `Financial Analyst`: Read-only access to timecard summaries, case allocations, and labor cost per minute.

---

## API / Service Requirements
Backend service module `src/services/payrollIntegrationService.js` and facade `src/lib/payrollIntegrationService.js` provide:
- `getPayrollConnectorConfig(facilityId)`: Retrieves facility payroll configuration with masked secrets.
- `getPayrollTelemetry(facilityId)`: Computes rolling metrics: total labor cost (MTD), case labor allocated %, avg cost per OR min ($), and sync speed.
- `getPayrollEmployeeMappings(facilityId)`: Returns active staff directory with wage rates and burden multipliers.
- `getPayrollTimecardBatches(facilityId)`: Returns payroll batches with hour totals and status.
- `getPayrollShiftEntries(batchId)`: Returns shift punch lines for a specific batch.
- `getPayrollCaseLaborAllocations(facilityId)`: Returns surgical case labor allocations and cost per minute.
- `getPayrollExceptions(facilityId)`: Returns quarantined payroll exceptions.
- `calculateStaffLaborCost(hours, rate, burdenPct, isOt)`: Authoritative wage and burden calculation.
- `testPayrollConnection(facilityId)`: Tests live connectivity with external payroll vendor.
- `triggerManualTimecardSync(facilityId)`: Pulls electronic timecard punches and recalculates case labor.
- `allocateCaseLabor(facilityId, caseId)`: Allocates clinical shift hours to a perioperative case.
- `resolvePayrollException(exceptionId, resolution)`: Resolves a quarantined payroll exception.

---

## UI / Workflow Requirements
Component `src/components/PayrollIntegrationView.jsx` and styling `src/components/PayrollIntegrationView.css`:
- **Header Action Bar**: Live WFM connection status pill, payroll vendor badge (ADP Workforce Now), "Test Connection", "Sync Timecards", "Allocate Case Labor".
- **4-Metric Telemetry Ribbon**:
  1. *Total Labor Cost (MTD)*: Dollar amount of fully burdened clinical labor.
  2. *Case Labor Allocation %*: Percentage of perioperative shift hours mapped to surgical encounters (98.4%).
  3. *Avg Labor Cost per OR Min*: Facility-wide average staff cost per operating room minute ($14.85/min).
  4. *Active Staff on Shift*: Count of currently clocked-in perioperative clinical personnel.
- **5-Stage Payroll Pipeline Visualizer**:
  1. Timeclock Ingestion (Electronic Badges & Clock Punches)
  2. Staff Directory Mapping (Role, Base Wage & Burden Assigned)
  3. FLSA & Overtime Audit (Regular, OT & Meal Break Validation)
  4. Perioperative Case Allocation (Case Room Times & Staff Overlap Mapped)
  5. Cost Ledger Commit (Labor Cost per OR Minute Recorded)
- **4 Navigation Subtabs**:
  - *Timecard Batches*: Batch control number, period code, dates, employee count, regular/OT hours, gross pay, burdened cost, status, SHA-256 seal.
  - *Employee Directory & Rates*: Employee ID, name, clinical role, department, base hourly rate, burden %, effective hourly rate, status.
  - *Case Labor Allocation*: Case identifier, date, staff count, case minutes, regular cost, OT cost, burdened labor cost, cost/minute, variance badge.
  - *Payroll Exceptions*: Offending staff ID, exception code, category, severity, resolution status, action button.
- **Settings Drawer**: Modal to inspect and update payroll vendor, API endpoint, payroll group code, default burden %, and pay period frequency.
- **Zero Prohibited Tokens**: Strict adherence to design tokens—no purple, violet, indigo, magenta, fuchsia.
- **Light/Dark Mode Support**: Flawless contrast, `padding: 0` on root container `.pay-container` preventing layout overflow.

---

## Audit / Provenance
- All payroll batches and case labor allocations record an immutable SHA-256 seal.
- All modifications and exception overrides log operator ID, timestamp, and audit trail metadata.

---

## QA / Test Cases
Automated test suite `tests/payroll-integration.test.js`:
1. Telemetry returns accurate MTD metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects.
3. Connector configuration retrieval and status verification.
4. Deterministic employee directory retrieval and burdened rate calculation.
5. Deterministic shift wage and overtime calculation (FLSA 1.5x formula).
6. Detection and flagging of timecard anomalies (missed clock-out > 16h).
7. Deterministic case labor allocation formula ($\text{Labor Cost} = \sum \text{Burdened Rate} \times \text{Hours}$).
8. Calculation of labor cost per OR minute.
9. Manual timecard sync trigger execution creates batch record with SHA-256 seal.
10. Dual facade re-export parity between `src/services/` and `src/lib/`.
11. Migration 129 UP/DOWN SQL structural integrity and RLS policies.
12. Strict Zero-Prohibited Token Compliance in `PayrollIntegrationView` and shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint and type checks pass.
- All 96 tests across Phases F0 through F7 pass without warnings.
- Tenant isolation enforced on all payroll tables via `facility_id`.
- Zero prohibited accent colors present.
- Fully burdened labor rate and case allocation formulas verified mathematically.

---

## Dependencies
- Upstream: Phase F0 (Integration Framework), Phase F3 (SIS Integration), Phase F4 (HST Pathways Integration).
- Database: Migration 129 (`supabase/migrations/129_payroll_integration.sql`).

---

## Definition of Done
Phase F7 is complete when:
1. Migration 129 and rollback script 129 down are authored with complete RLS, telemetry view, and seeded Naples Surgery Center data.
2. `payrollIntegrationService.js` and facade `src/lib/payrollIntegrationService.js` are fully implemented with deterministic wage, burden, and case allocation rules.
3. `PayrollIntegrationView.jsx` and `PayrollIntegrationView.css` are authored with zero prohibited tokens, 5-stage pipeline, 4 subtabs, and settings modal.
4. Shell integration in `src/App.jsx` renders the `'payroll_integration'` tab.
5. 12 automated tests in `tests/payroll-integration.test.js` pass with 100% pass rate.
6. Full test suite (96 tests) and `npm run build` exit code 0.

---

## Implementation Notes
- Migration file: `supabase/migrations/129_payroll_integration.sql`
- Rollback file: `supabase/migrations/129_payroll_integration_down.sql`
- Core service: `src/services/payrollIntegrationService.js`
- Facade: `src/lib/payrollIntegrationService.js`
- View: `src/components/PayrollIntegrationView.jsx`
- Styles: `src/components/PayrollIntegrationView.css`
- Tests: `tests/payroll-integration.test.js`
- App Shell: `src/App.jsx`
- Specifications: `docs/phases/F7_PAYROLL_INTEGRATION.md` and `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_15_Integrations\F7_PAYROLL_INTEGRATION.md`
