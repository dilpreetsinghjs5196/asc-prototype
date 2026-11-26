# F9 VENDOR INVOICE IMPORT

## Purpose
The Vendor Invoice Import & Price Audit module establishes an automated Accounts Payable (AP) supply-chain intake gateway, vendor SKU cross-reference matcher, GPO/contract price variance engine, and 3-way Purchase Order (PO) reconciliation processor connecting ASCANALYST to medical/implant vendor billing streams (EDI X12 810, CSV/Excel exports, and PDF-OCR invoice feeds from Stryker, Arthrex, Medtronic, Cardinal Health, Medline, and McKesson).

In ambulatory surgery center operations, unmonitored vendor invoices routinely introduce 3%–8% direct cost leakage through unapproved price increases above contracted GPO rates, duplicate invoice submissions, unbilled freight/handling surcharges, and SKU mismatches against the canonical Item Master (Phase F8). Phase F9 deterministically matches vendor SKUs to internal catalog items, validates invoice quantities against POs and receiving logs, quarantines overbilled lines, and writes immutable SHA-256 provenance seals prior to General Ledger AP handoff (Phase F6).

---

## Scope
- Define production requirements for the Vendor Invoice Import Gateway:
  1. **Vendor Invoice Parser Configuration (`vendor_invoice_configs`)**: Facility-level parser mode (`EDI_810`, `CSV_BATCH`, `PDF_OCR`, `HYBRID`), matching policy (`THREE_WAY_MATCH`, `TWO_WAY_MATCH`), configurable price variance tolerance percentage (default `2.00%`), duplicate invoice lock, and masked credentials.
  2. **Vendor Price Contracts (`vendor_price_contracts`)**: Effective-dated contracted unit prices and GPO contract references linking external `vendor_sku` values to internal `inventory_item_master` SKUs.
  3. **Purchase Orders (`vendor_purchase_orders`)**: Facility PO tracking with ordered amounts, received quantities, invoiced quantities, and lifecycle status (`OPEN`, `PARTIALLY_RECEIVED`, `RECEIVED`, `MATCHED`, `CLOSED`).
  4. **Imported Invoice Batches (`vendor_invoice_batches`)**: Invoice headers tracking subtotal, freight/tax, invoiced total, contracted expected total, calculated variance amount, match status, and SHA-256 sync seal.
  5. **Invoice Line Items & SKU Matching (`vendor_invoice_lines`)**: Line-level breakdown recording vendor SKU, matched internal SKU, match confidence %, match method (`EXACT_SKU`, `CROSS_REF_ALIAS`, `FUZZY_DESCRIPTION`, `UNMAPPED`), invoiced vs. contracted unit pricing, and line variance.
  6. **Invoice Exceptions Workqueue (`vendor_invoice_exceptions`)**: Quarantines contract price overbilling, unmapped vendor SKUs, PO quantity discrepancies, math imbalances, and duplicate invoices.
  7. **Cryptographic Provenance (`vendor_invoice_provenance_ledger`)**: SHA-256 immutable audit ledger recording every imported invoice batch, exception resolution, and AP approval.
- Preserve compatibility with Phases F0–F8 (especially F6 Accounting GL and F8 Inventory Item Master).
- Enforce organization and facility tenancy (`facility_id`), RBAC, and zero prohibited color tokens.

---

## Current State

| Component | Status | Description |
| :--- | :--- | :--- |
| `src/services/integrationFrameworkService.js` | **KEEP** | Enterprise connector registry and DLQ framework (Phase F0). |
| `src/services/importValidationService.js` | **KEEP** | Universal validation pipeline and quarantine engine (Phase F1). |
| `src/services/excelCsvImportService.js` | **KEEP** | Excel/CSV spreadsheet parser and fuzzy mapper (Phase F2). |
| `src/services/accountingIntegrationService.js` | **KEEP** | General Ledger ERP & AP journal posting target (Phase F6). |
| `src/services/inventoryIntegrationService.js` | **KEEP** | Canonical Item Master & par stock source of truth (Phase F8). |
| `public.vendor_invoice_configs` | **MISSING** | Facility-level invoice parser, variance tolerance, and matching policy config. |
| `public.vendor_price_contracts` | **MISSING** | Effective-dated vendor/GPO price contracts and SKU cross-references. |
| `public.vendor_purchase_orders` | **MISSING** | Facility purchase orders supporting 3-way match verification. |
| `public.vendor_invoice_batches` | **MISSING** | Imported vendor invoice headers with variance and match status. |
| `public.vendor_invoice_lines` | **MISSING** | Granular invoice line items with SKU match scores and unit variances. |
| `public.vendor_invoice_exceptions` | **MISSING** | Quarantine workqueue for price drift, duplicate invoices, and unmapped SKUs. |
| `public.vendor_invoice_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger for invoice imports and AP approvals. |
| `src/services/vendorInvoiceService.js` | **MISSING** | Authoritative SKU matcher, price variance calculator, and 3-way PO validator. |
| `src/components/VendorInvoiceImportView.jsx` | **MISSING** | UI dashboard for invoice auditing, SKU matching, PO matching, and exceptions. |

---

## Target State
1. **Multi-Format Vendor Invoice Ingestion**:
   - Supports EDI X12 810 invoices, vendor CSV/Excel billing statements, and normalized OCR invoice payloads.
   - Prevents duplicate submissions via `(facility_id, vendor_name, invoice_number)` uniqueness enforcement.
2. **Deterministic SKU Cross-Reference Matching**:
   - Tier 1: Exact `vendor_sku` match in active facility `vendor_price_contracts` (`100%` confidence, `EXACT_SKU`).
   - Tier 2: Normalized alphanumeric / prefix-stripped cross-reference match (`95%` confidence, `CROSS_REF_ALIAS`).
   - Tier 3: Tokenized item description similarity match (`75%–90%` confidence, `FUZZY_DESCRIPTION`).
   - Unmapped items (`0%`, `UNMAPPED`) automatically quarantine the invoice for Materials Manager mapping.
3. **Deterministic 3-Way Match & Price Variance Formulas**:
   - Line extension:
     $$\text{Line Extended} = \text{Qty Invoiced} \times \text{Invoiced Unit Price}$$
   - Expected contracted extension:
     $$\text{Expected Extended} = \text{Qty Invoiced} \times \text{Contracted Unit Price}$$
   - Line price variance:
     $$\text{Line Variance} = \text{Line Extended} - \text{Expected Extended}$$
   - Invoice arithmetic invariant:
     $$\left| \left(\sum \text{Line Extended} + \text{Freight/Tax}\right) - \text{Total Invoice Amount} \right| \le \$0.01$$
   - Tolerance check: Any line where $\left|\frac{\text{Invoiced Unit Price} - \text{Contracted Unit Price}}{\text{Contracted Unit Price}}\right| \times 100 > \text{Tolerance \%}$ is flagged for dispute hold.
4. **Cryptographic Provenance**:
   - Every imported invoice batch writes a 64-character SHA-256 seal:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{invoice\_number} \parallel \text{vendor\_name} \parallel \text{total\_invoice\_amount} \parallel \text{match\_status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/131_vendor_invoice_import.sql`:
1. `public.vendor_invoice_configs`
2. `public.vendor_price_contracts`
3. `public.vendor_purchase_orders`
4. `public.vendor_invoice_batches` (`sha256_sync_seal VARCHAR(128) NOT NULL`)
5. `public.vendor_invoice_lines`
6. `public.vendor_invoice_exceptions`
7. `public.vendor_invoice_provenance_ledger` (`sha256_seal VARCHAR(128) NOT NULL`)
- Real-time telemetry view: `public.vw_vendor_invoice_telemetry`.
- Tenant isolation enforced via `app.current_facility_id` RLS policies on all 7 tables.

---

## Business Rules

### Rule 1: Duplicate Invoice Lockout
Submitting an invoice with an existing `(facility_id, vendor_name, invoice_number)` tuple is immediately rejected/quarantined with `ERR_DUPLICATE_INVOICE` to prevent double AP disbursement.

### Rule 2: Invoice Header-to-Line Math Invariant
The sum of all `line_extended_amount` rows plus `freight_tax_amount` must equal `total_invoice_amount` within `±$0.01`. Discrepancies trigger `ERR_INVOICE_MATH_IMBALANCE`.

### Rule 3: Contract Price Variance & Tolerance Guard
When `invoiced_unit_price` deviates from active contracted pricing by more than `price_tolerance_pct` (default `2.00%`), the line is flagged `OVERBILLED`, and the invoice enters `PRICE_VARIANCE` hold pending dispute or executive override.

### Rule 4: 3-Way PO Quantity Constraint
Under `THREE_WAY_MATCH` policy, `qty_invoiced` cannot exceed `qty_received_po`. Exceeding received quantities triggers `ERR_PO_QUANTITY_EXCEEDED`.

---

## Permissions / Security
- Facility tenancy enforced via PostgreSQL RLS (`app.current_facility_id`).
- API/EDI secrets encrypted at rest and masked in UI responses (`vinv_sec_****_9104`).
- RBAC Matrix:
  - `Materials Manager` / `Supply Chain Lead`: Import invoices, map unmapped vendor SKUs, verify receiving quantities, and dispute variances.
  - `Finance Director` / `AP Controller`: Approve matched or variance-overridden invoices for General Ledger AP posting (`APPROVED_FOR_AP`).
  - `Financial Analyst` / `AI Analyst`: Read-only access to price variances, SKU match telemetry, and contract audit logs.

---

## API / Service Requirements
Backend service `src/services/vendorInvoiceService.js` and facade `src/lib/vendorInvoiceService.js` provide:
- `getVendorInvoiceConfig(facilityId)`: Retrieves parser configuration with masked secrets.
- `updateVendorInvoiceConfig(facilityId, updates)`: Updates matching policy or tolerance thresholds.
- `getVendorInvoiceTelemetry(facilityId)`: Returns rolling MTD invoice total, SKU auto-match %, flagged price variance $, and pending review count.
- `getVendorPriceContracts(facilityId)`: Returns active contracted vendor/GPO SKU pricing.
- `getVendorPurchaseOrders(facilityId)`: Returns facility purchase orders and receipt states.
- `getVendorInvoiceBatches(facilityId)`: Returns imported vendor invoices and match statuses.
- `getVendorInvoiceLines(batchId)`: Returns granular line-level matching and variance details.
- `getVendorInvoiceExceptions(facilityId)`: Returns quarantined invoice exceptions.
- `matchVendorSku(vendorSku, itemDescription, priceContracts)`: Deterministic multi-tier SKU matching engine.
- `calculateLineVariance(qtyInvoiced, invoicedUnitPrice, contractedUnitPrice, tolerancePct)`: Authoritative unit/extended price variance calculator.
- `validateThreeWayInvoiceMatch(payload)`: Full 3-way PO + contract price + duplicate + math validation engine.
- `testVendorInvoiceConnection(facilityId)`: Tests live EDI 810 / OCR parser connectivity.
- `importVendorInvoiceBatch(facilityId, invoicePayload)`: Executes full validation, writes batch & exceptions, and generates SHA-256 seal.
- `approveVendorInvoiceForAp(batchId, approverId)`: Promotes matched/resolved invoice to `APPROVED_FOR_AP`.
- `resolveVendorInvoiceException(exceptionId, resolutionNote)`: Resolves a quarantined exception.

---

## UI / Workflow Requirements
Component `src/components/VendorInvoiceImportView.jsx` and styling `src/components/VendorInvoiceImportView.css`:
- **Header Action Bar**: Live parser status pill, matching policy badge (`THREE_WAY_MATCH`), "Test Connection", "Import Sample Invoice", and configuration drawer trigger.
- **4-Metric Telemetry Ribbon**:
  1. *Total Invoiced (MTD)*: Cumulative vendor invoice volume processed.
  2. *SKU Auto-Match Rate %*: Percentage of invoice lines matched automatically to Item Master.
  3. *Price Variance Flagged*: Dollar savings identified from vendor overbilling alerts.
  4. *Invoices Pending Review*: Invoices awaiting variance resolution or AP approval.
- **5-Stage Vendor Invoice Pipeline Visualizer**:
  1. Invoice Capture (EDI 810, CSV & OCR)
  2. SKU Cross-Reference (Vendor SKU $\rightarrow$ ASC Item Master)
  3. Contract Price Audit (GPO Rate Variance Check)
  4. 3-Way PO Match (PO vs. Receipt vs. Invoice)
  5. AP Ledger Handoff (Approved Payable & SHA-256 Seal)
- **4 Navigation Subtabs**:
  - *Imported Invoices*: Master-detail table with line-item variance drill-down and AP approval button.
  - *SKU & Contract Price Catalog*: Active vendor SKUs, internal item SKUs, GPO contracts, and effective contracted prices.
  - *Purchase Orders (3-Way Match)*: PO numbers, ordered/received/invoiced quantities, totals, and status.
  - *Price & SKU Exceptions*: Exception codes, severity, dollar variance, and one-click resolution.
- **Settings Drawer**: Configure parser mode, matching policy, variance tolerance %, and inspect masked secret.
- **Zero Prohibited Tokens**: Strict design token compliance—no purple, violet, indigo, magenta, or fuchsia.

---

## Audit / Provenance
- Every imported invoice retains batch SHA-256 seal, operator/source metadata, contract variance deltas, and immutable ledger history in `vendor_invoice_provenance_ledger`.

---

## QA / Test Cases
Automated test suite `tests/vendor-invoice-import.test.js`:
1. Telemetry returns accurate MTD metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution across strings and objects.
3. Connector configuration retrieval and masked secret verification.
4. Vendor price contract catalog retrieval and active contract verification.
5. Deterministic multi-tier SKU matching (`EXACT_SKU`, `CROSS_REF_ALIAS`, `FUZZY_DESCRIPTION`, `UNMAPPED`).
6. Deterministic line price variance calculation and tolerance evaluation.
7. 3-way PO match validation (clean match vs. overbilling/quantity discrepancy).
8. Duplicate invoice detection (`ERR_DUPLICATE_INVOICE`) and arithmetic imbalance detection (`ERR_INVOICE_MATH_IMBALANCE`).
9. Importing new vendor invoice batch generates valid 64-char SHA-256 seal (`sha256_vinv_`).
10. Dual facade re-export parity between `src/services/` and `src/lib/`.
11. Migration 131 UP/DOWN SQL structural integrity and RLS policies.
12. Strict zero-prohibited token compliance in `VendorInvoiceImportView` and `src/App.jsx` shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Required tests pass (`120 / 120` tests across Phases F0–F9).
- Tenant isolation enforced on all 7 tables via `facility_id` and RLS.
- Zero prohibited accent colors present anywhere in the phase implementation.

---

## Dependencies
- Upstream: Phase F0 (Integration Framework), Phase F6 (Accounting GL), Phase F8 (Inventory Item Master).
- Database: Migration 131 (`supabase/migrations/131_vendor_invoice_import.sql`).

---

## Definition of Done
Phase F9 is complete when Migration 131, `vendorInvoiceService.js`, `src/lib/vendorInvoiceService.js`, `VendorInvoiceImportView.jsx/.css`, `src/App.jsx` shell routing, 12 passing unit/integration tests, full regression suite, and clean production build are verified.

---

## Implementation Notes
- **Files Created:**
  - `docs/phases/F9_VENDOR_INVOICE_IMPORT.md`
  - `ASCANALYST_MD_SPECS/Phase_15_Integrations/F9_VENDOR_INVOICE_IMPORT.md`
  - `supabase/migrations/131_vendor_invoice_import.sql` & `131_vendor_invoice_import_down.sql`
  - `src/services/vendorInvoiceService.js` & `src/lib/vendorInvoiceService.js`
  - `src/components/VendorInvoiceImportView.jsx` & `VendorInvoiceImportView.css`
  - `tests/vendor-invoice-import.test.js`
- **Files Modified:**
  - `src/App.jsx` (integrated `vendor_invoice_import` tab with `Receipt` icon).
