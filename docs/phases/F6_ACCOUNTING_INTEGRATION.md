# F6 ACCOUNTING INTEGRATION

## Purpose
The Accounting and General Ledger (GL) Integration module establishes an enterprise-grade financial gateway, Chart of Accounts (COA) mapper, automated double-entry journal entry generator, and bank reconciliation engine connecting the ASC Analyst platform to major general ledger ERPs (NetSuite, QuickBooks Online, Sage Intacct, Workday Financials, Microsoft Dynamics 365).

In ambulatory surgery center governance, operational and clinical revenue cycles must deterministically translate into GAAP-compliant general ledger journal entries. Phase F6 bridges sub-ledger billing, cash collections, contractual adjustments, and implant costs into balanced journal entries, enforces strict double-entry balancing ($\sum \text{Debits} = \sum \text{Credits}$), facilitates daily and monthly sub-ledger to bank reconciliations, eliminates manual spreadsheet uploads, and maintains cryptographic audit provenance across all posted batches.

---

## Scope
- Define production requirements for the Accounting & GL Integration Gateway:
  1. **Connector Configuration (`accounting_connector_configs`)**: Facility-level GL vendor setup (NetSuite, QuickBooks Online, Sage Intacct), REST API / SFTP credentials, subsidiary/entity ID, accounting period lock enforcement, and sync schedules.
  2. **Chart of Accounts (COA) Mapping (`accounting_chart_of_accounts`)**: Canonical cross-reference mapping platform transaction categories (`PROCEDURAL_REVENUE`, `IMPLANT_REVENUE`, `CASH_COLLECTION`, `CONTRACTUAL_ADJUSTMENT`, `BAD_DEBT_WRITEOFF`, `REFUND_LIABILITY`) to external GL account codes, account names, and account types (Asset, Liability, Revenue, Contra-Revenue, Expense).
  3. **Journal Entry Batches (`accounting_journal_batches`)**: High-integrity journal batch tracking covering Daily Cash Receipts, Billing Accruals, and Monthly Close. Enforces strict double-entry balancing:
     $$\sum_{i} \text{Debit}_i - \sum_{i} \text{Credit}_i = 0.00$$
  4. **Journal Entry Lines (`accounting_journal_lines`)**: Itemized debit and credit distribution lines linked to external GL account numbers, departmental cost centers (OR, PACU, Sterile Processing), and source transaction identifiers.
  5. **Bank & Sub-Ledger Reconciliation (`accounting_reconciliation_records`)**: Automated matching between platform sub-ledger collections (835 ERA EFTs, patient card payments) and GL bank account deposits, flagging any variance ($|\Delta| > 0.00$).
  6. **Accounting Exceptions Workqueue (`accounting_exception_logs`)**: Real-time quarantine of journal balancing variances, unmapped COA accounts, closed accounting periods, and transmission failures.
  7. **Cryptographic Provenance (`accounting_provenance_ledger`)**: SHA-256 immutable audit logging linking every posted journal batch and reconciliation close to facility tenancy.
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
| `public.accounting_connector_configs` | **MISSING** | Facility-level GL ERP endpoints, credentials, and configuration. |
| `public.accounting_chart_of_accounts` | **MISSING** | Standardized ASC Chart of Accounts mapping to platform categories. |
| `public.accounting_journal_batches` | **MISSING** | Double-entry journal batches tracking debits, credits, and status. |
| `public.accounting_journal_lines` | **MISSING** | Itemized debit and credit line distributions. |
| `public.accounting_reconciliation_records` | **MISSING** | Sub-ledger to bank reconciliation audit records. |
| `public.accounting_exception_logs` | **MISSING** | Quarantine workqueue for journal imbalances and unmapped accounts. |
| `public.accounting_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger recording journal batch checksums. |
| `src/services/accountingIntegrationService.js` | **MISSING** | Core calculation service handling double-entry balancing and journal generation. |
| `src/components/AccountingIntegrationView.jsx` | **MISSING** | UI dashboard displaying GL health, telemetry, 5-stage pipeline, and 4 audit subtabs. |

---

## Target State
1. **Automated GL ERP Connector Architecture**:
   - Integration with enterprise GL platforms (NetSuite, QuickBooks Online, Sage Intacct).
   - Bi-directional synchronization:
     - Outbound Journal Posting: Automated posting of daily cash receipt journals and month-end revenue recognition batches.
     - Inbound Period & COA Verification: Real-time queries verifying open accounting periods and active GL accounts before journal dispatch.
2. **Deterministic Double-Entry Balancing Engine**:
   - Strictly enforces the fundamental GAAP equation for every journal batch:
     $$\text{Balance Variance} = \left| \sum \text{Debits} - \sum \text{Credits} \right| = 0.00$$
   - Batches with any variance ($> \$0.00$) are strictly prohibited from exporting to external GL systems and routed to `accounting_exception_logs`.
3. **Automated Sub-Ledger to Bank Reconciliation**:
   - Matches sub-ledger deposit sums (EFT traces from 835 remittances and patient card processor settlements) against GL operating bank accounts.
   - Calculates reconciliation variance:
     $$\Delta_{\text{Recon}} = \text{Sub-Ledger Total Cash} - \text{GL Bank Account Deposit}$$
4. **Cryptographic Provenance**:
   - Generates an immutable SHA-256 seal for every posted journal batch:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{period\_code} \parallel \text{total\_debits} \parallel \text{status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/128_accounting_integration.sql`:

```sql
-- 1. Accounting Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.accounting_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    accounting_vendor VARCHAR(64) NOT NULL DEFAULT 'NETSUITE' CHECK (
        accounting_vendor IN ('NETSUITE', 'QUICKBOOKS_ONLINE', 'SAGE_INTACCT', 'WORKDAY', 'DYNAMICS_365')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_API' CHECK (
        gateway_mode IN ('REST_API', 'SFTP_EXPORT', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    subsidiary_company_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    auto_post_schedule VARCHAR(32) NOT NULL DEFAULT 'NIGHTLY_CLOSE',
    current_accounting_period VARCHAR(16) NOT NULL DEFAULT '2026-02',
    lock_closed_periods BOOLEAN NOT NULL DEFAULT TRUE,
    connection_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        connection_status IN ('CONNECTED', 'POSTING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_accounting_config UNIQUE (facility_id)
);

-- 2. Chart of Accounts Mapping Table
CREATE TABLE IF NOT EXISTS public.accounting_chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    account_code VARCHAR(32) NOT NULL,
    account_name VARCHAR(128) NOT NULL,
    account_type VARCHAR(32) NOT NULL CHECK (
        account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_REVENUE', 'EXPENSE')
    ),
    category_mapping VARCHAR(48) NOT NULL CHECK (
        category_mapping IN (
            'OPERATING_CASH', 'ACCOUNTS_RECEIVABLE', 'ALLOWANCE_DOUBTFUL_ACCOUNTS',
            'PROCEDURAL_REVENUE', 'IMPLANT_REVENUE', 'SUPPLY_REVENUE',
            'CONTRACTUAL_ADJUSTMENT', 'BAD_DEBT_WRITEOFF', 'PATIENT_REFUND_LIABILITY'
        )
    ),
    normal_balance VARCHAR(8) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_account_code UNIQUE (facility_id, account_code)
);

-- 3. Accounting Journal Batches Table
CREATE TABLE IF NOT EXISTS public.accounting_journal_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    batch_type VARCHAR(32) NOT NULL CHECK (
        batch_type IN ('DAILY_CASH_POSTING', 'ACCRUED_BILLING', 'MONTH_END_ADJUSTMENT', 'REVENUE_RECOGNITION')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'POSTED' CHECK (
        status IN ('DRAFT', 'VALIDATING', 'POSTED', 'RECONCILED', 'VOIDED', 'EXPORT_FAILED')
    ),
    total_debit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_credit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    variance_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
    line_count INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_journal_batch UNIQUE (facility_id, batch_control_number)
);

-- 4. Accounting Journal Lines Table
CREATE TABLE IF NOT EXISTS public.accounting_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.accounting_journal_batches(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_code VARCHAR(32) NOT NULL,
    account_name VARCHAR(128) NOT NULL,
    department_code VARCHAR(32) NOT NULL DEFAULT 'OR_SURGICAL',
    debit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    description TEXT NOT NULL,
    reference_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Accounting Reconciliation Records Table
CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    reconciliation_code VARCHAR(64) NOT NULL,
    reconciliation_date DATE NOT NULL,
    subledger_cash_amount NUMERIC(14,2) NOT NULL,
    gl_bank_deposit_amount NUMERIC(14,2) NOT NULL,
    variance_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(24) NOT NULL DEFAULT 'RECONCILED' CHECK (
        status IN ('RECONCILED', 'VARIANCE_FLAGGED', 'UNDER_INVESTIGATION')
    ),
    reconciled_by VARCHAR(64) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_recon_code UNIQUE (facility_id, reconciliation_code)
);

-- 6. Accounting Exception Logs Table
CREATE TABLE IF NOT EXISTS public.accounting_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.accounting_journal_batches(id) ON DELETE SET NULL,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('IMBALANCE_VARIANCE', 'UNMAPPED_COA', 'CLOSED_PERIOD', 'EXPORT_TIMEOUT')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_account VARCHAR(64),
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_FINANCE_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Accounting Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.accounting_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.accounting_journal_batches(id) ON DELETE CASCADE,
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

### Rule 1: Deterministic Double-Entry Invariant
Every journal batch generated by the platform must satisfy:
$$\sum \text{Debit Amounts} - \sum \text{Credit Amounts} = 0.00$$
- If $|\sum \text{Debits} - \sum \text{Credits}| > 0.00$: The batch is marked with `is_balanced = false`, `status = 'EXPORT_FAILED'`, and quarantined with exception code `ERR_DOUBLE_ENTRY_IMBALANCE`.

### Rule 2: Chart of Accounts Normal Balance Enforcement
- Asset accounts (e.g. `1010` Operating Cash, `1100` Accounts Receivable) have a normal `DEBIT` balance.
- Liability accounts (e.g. `2010` Patient Overpayments) have a normal `CREDIT` balance.
- Revenue accounts (e.g. `4010` Gross Surgical Revenue) have a normal `CREDIT` balance.
- Contra-Revenue accounts (e.g. `4090` Contractual Allowances) have a normal `DEBIT` balance.

### Rule 3: Accounting Period Lockout
- Posting into a closed period is strictly prohibited when `lock_closed_periods = true`.
- Transactions with service or post dates matching closed periods are rejected with `ERR_CLOSED_PERIOD_POSTING`.

### Rule 4: Sub-Ledger to GL Bank Reconciliation Invariant
Reconciliation variance is computed as:
$$\text{Variance} = |\text{Sub-Ledger Total Cash Collections} - \text{GL Bank Account Deposit}|$$
- If $\text{Variance} == 0.00$: Status is `RECONCILED`.
- If $\text{Variance} > 0.00$: Status is `VARIANCE_FLAGGED` and requires finance review.

### Rule 5: Cryptographic Batch Sealing
Every journal batch export and reconciliation close records an immutable SHA-256 seal:
$$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{period\_code} \parallel \text{total\_debits} \parallel \text{status})$$

---

## Permissions / Security
- Enforces facility-level tenancy isolation through PostgreSQL Row-Level Security (`app.current_facility_id`).
- ERP OAuth2 client secrets and API tokens are encrypted at rest and masked in UI responses (`acc_sec_****_8819`).
- RBAC Matrix:
  - `Facility Administrator` / `Chief Financial Officer`: Full read, write, journal posting, COA configuration, and reconciliation approval.
  - `Finance Specialist` / `Staff Accountant`: Read, draft journal batches, trigger reconciliation runs, resolve exceptions.
  - `Financial Analyst`: Read-only access to journal batches, COA ledger, reconciliation reports, and telemetry.

---

## API / Service Requirements
Backend service module `src/services/accountingIntegrationService.js` and facade `src/lib/accountingIntegrationService.js` provide:
- `getAccountingConnectorConfig(facilityId)`: Retrieves facility GL ERP configuration with masked secrets.
- `getAccountingTelemetry(facilityId)`: Computes 24h metrics: total journal postings, clean double-entry balance %, total reconciled cash ($), ERP latency (ms).
- `getAccountingChartOfAccounts(facilityId)`: Returns active COA mapping entries.
- `getAccountingJournalBatches(facilityId)`: Returns journal batch history with balancing status.
- `getAccountingJournalLines(batchId)`: Returns line items for a specific batch.
- `getAccountingReconciliations(facilityId)`: Returns sub-ledger to bank reconciliation ledger.
- `getAccountingExceptions(facilityId)`: Returns quarantined accounting exceptions.
- `validateJournalDoubleEntry(lines)`: Authoritative calculation validating $\sum \text{Debits} - \sum \text{Credits} = 0.00$.
- `testAccountingConnection(facilityId)`: Verifies live connectivity with external GL ERP.
- `triggerManualJournalPost(facilityId, batchType)`: Generates and posts a balanced journal entry batch.
- `runSubledgerBankReconciliation(facilityId, date)`: Executes automated bank matching.
- `resolveAccountingException(exceptionId, resolution)`: Resolves a quarantined accounting exception.

---

## UI / Workflow Requirements
Component `src/components/AccountingIntegrationView.jsx` and styling `src/components/AccountingIntegrationView.css`:
- **Header Action Bar**: Live ERP connection status pill, GL vendor badge (NetSuite Financials ERP), "Test Connection", "Post Daily Journal", "Run Bank Recon".
- **4-Metric Telemetry Ribbon**:
  1. *Journal Batches Posted (30d)*: Total batches and total debits posted.
  2. *Double-Entry Balance Rate*: Percentage of batches passing $\sum \text{Debits} = \sum \text{Credits}$ (100.0%).
  3. *Reconciled Cash (MTD)*: Dollar amount of matched sub-ledger cash to bank deposits.
  4. *GL ERP Gateway Latency*: Round-trip API post latency in milliseconds.
- **5-Stage Accounting Pipeline Visualizer**:
  1. Sub-Ledger Ingestion (Claims & 835 ERA Payments Captured)
  2. COA Mapping (Account Codes & Cost Centers Assigned)
  3. Double-Entry Validation ($\sum \text{Debits} - \sum \text{Credits} = \$0.00$)
  4. GL ERP Dispatch (NetSuite / QuickBooks REST API Post)
  5. Bank Reconciliation (Sub-Ledger vs Bank Deposit Cleared)
- **4 Navigation Subtabs**:
  - *Journal Entry Batches*: Batch control number, period, type, line count, total debits, total credits, variance, status, SHA-256 seal.
  - *Chart of Accounts (COA)*: Account code, account name, category mapping, account type, normal balance, status.
  - *Bank Reconciliation*: Reconciliation code, date, sub-ledger cash, GL bank deposit, variance, status, notes.
  - *Accounting Exceptions*: Offending account, exception code, category, severity, resolution status, action button.
- **Settings Drawer**: Modal to inspect and update GL ERP credentials, subsidiary company ID, auto-post schedule, and period locks.
- **Zero Prohibited Tokens**: Strict adherence to design tokens—no purple, violet, indigo, magenta, fuchsia.
- **Light/Dark Mode Support**: Flawless contrast, `padding: 0` on root container `.acc-container` preventing layout overflow.

---

## Audit / Provenance
- All journal batches and bank reconciliations record an immutable SHA-256 seal.
- All modifications and manual overrides log operator ID, timestamp, and audit trail metadata.

---

## QA / Test Cases
Automated test suite `tests/accounting-integration.test.js`:
1. Telemetry returns accurate 24-hour / 30-day metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects.
3. Connector configuration retrieval and status verification.
4. Deterministic Chart of Accounts retrieval and normal balance verification.
5. Deterministic double-entry balancing validation on valid journal entry lines ($\sum \text{Debits} - \sum \text{Credits} = 0$).
6. Detection and flagging of double-entry imbalances (`ERR_DOUBLE_ENTRY_IMBALANCE`).
7. Bank reconciliation matching and variance calculation (balanced case).
8. Detection and flagging of bank reconciliation variances (`VARIANCE_FLAGGED`).
9. Manual journal batch post execution creates balanced batch record with SHA-256 seal.
10. Dual facade re-export parity between `src/services/` and `src/lib/`.
11. Migration 128 UP/DOWN SQL structural integrity and RLS policies.
12. Strict Zero-Prohibited Token Compliance in `AccountingIntegrationView` and shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint and type checks pass.
- All 84 tests across Phases F0 through F6 pass without warnings.
- Tenant isolation enforced on all accounting tables via `facility_id`.
- Zero prohibited accent colors present.
- Strict double-entry accounting balancing invariant verified mathematically.

---

## Dependencies
- Upstream: Phase F0 (Integration Framework), Phase F1 (Import Validation Pipeline), Phase F5 (Clearinghouse Integration).
- Database: Migration 128 (`supabase/migrations/128_accounting_integration.sql`).

---

## Definition of Done
Phase F6 is complete when:
1. Migration 128 and rollback script 128 down are authored with complete RLS, telemetry view, and seeded Naples Surgery Center data.
2. `accountingIntegrationService.js` and facade `src/lib/accountingIntegrationService.js` are fully implemented with deterministic double-entry balancing and COA rules.
3. `AccountingIntegrationView.jsx` and `AccountingIntegrationView.css` are authored with zero prohibited tokens, 5-stage pipeline, 4 subtabs, and settings modal.
4. Shell integration in `src/App.jsx` renders the `'accounting_integration'` tab.
5. 12 automated tests in `tests/accounting-integration.test.js` pass with 100% pass rate.
6. Full test suite (84 tests) and `npm run build` exit code 0.

---

## Implementation Notes
- Migration file: `supabase/migrations/128_accounting_integration.sql`
- Rollback file: `supabase/migrations/128_accounting_integration_down.sql`
- Core service: `src/services/accountingIntegrationService.js`
- Facade: `src/lib/accountingIntegrationService.js`
- View: `src/components/AccountingIntegrationView.jsx`
- Styles: `src/components/AccountingIntegrationView.css`
- Tests: `tests/accounting-integration.test.js`
- App Shell: `src/App.jsx`
- Specifications: `docs/phases/F6_ACCOUNTING_INTEGRATION.md` and `e:\medicalAI\ASCANALYST_All_Modules\ASCANALYST_MD_SPECS\Phase_15_Integrations\F6_ACCOUNTING_INTEGRATION.md`
