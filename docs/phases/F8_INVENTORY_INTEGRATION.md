# F8 INVENTORY INTEGRATION

## Purpose
The Inventory & Materials Management Integration module establishes an enterprise-grade supply chain gateway, canonical item master catalog, point-of-use (POU) surgical case depletion engine, implant tracking registry, and automated replenishment processor connecting the ASC Analyst platform to major healthcare materials management systems (Envi by IOS, symplr Materials Management, Medline OPTICAT / MedPack, McKesson Supply Chain / Lynx, Omnicell / Pyxis POU cabinets).

In ambulatory surgery center economics, surgical supplies and medical implants represent the second largest direct operating cost (20% to 35% of total operating expenses, and over 50% in orthopedic and spine procedures). Phase F8 bridges real-time barcode and RFID scanning at the point of care directly into perioperative surgical encounters, maintains canonical item-master master data, calculates deterministic FIFO/average acquisition costs, tracks implant serial, lot, and expiration data for FDA UDI compliance, flags preference card staging waste, manages par levels across storage depots, and enforces cryptographic SHA-256 audit provenance on all stock reconciliation batches.

---

## Scope
- Define production requirements for the Inventory & Materials Management Gateway:
  1. **Connector Configuration (`inventory_connector_configs`)**: Facility-level materials management vendor setup (Envi, symplr, Medline, Pyxis, McKesson), REST API / EDI 850/856/832 transport endpoints, purchasing account code, inventory costing valuation method (`FIFO`, `AVERAGE_COST`, `STANDARD_COST`), and stock threshold defaults.
  2. **Canonical Item Master Directory (`inventory_item_master`)**: Standardized catalog linking external vendor SKU / UDI to item records, clinical categories (`IMPLANT`, `SURGICAL_SUPPLY`, `PHARMACEUTICAL`, `PPE_DISPOSABLE`, `BIOLOGIC`), manufacturer, unit of measure (EA, BOX, CASE, PK), contracted acquisition cost, billable status, HCPCS/CPT billing cross-reference, and FDA UDI Barcode (GS1-128 / HIBC).
  3. **Stock Levels & Par Depots (`inventory_stock_levels`)**: Stock across locations (`MAIN_SUPPLY_DEPOT`, `OR_CORE_STORAGE`, `STERILE_PROCESSING_CLEAN_ROOM`, `ANESTHESIA_CABINET`), on-hand, minimum par levels, maximum par levels, reorder points, economic order quantity (EOQ), and replenishment status (`OPTIMAL`, `LOW_STOCK`, `CRITICAL_REORDER`, `OVERSTOCKED`).
  4. **Case Item Usage & Depletion (`inventory_case_usage`)**: Point-of-use consumption mapped to cases: quantity used, wasted, unit cost, total cost, implant lot/serial, expiration date, billable status, and pass-through markup.
  5. **Preference Card Variance & Waste Tracking (`inventory_waste_logs`)**: Tracking differences between preference card staged items vs actually consumed items (over-staging waste, unused opened sterile supplies, return-to-stock items).
  6. **Inventory Exceptions Workqueue (`inventory_exception_logs`)**: Quarantines unmapped item barcodes/UDIs, expired lots scanned in OR, negative stock balances, critical stockouts, and acquisition cost spikes (>20% cost surge from supplier).
  7. **Cryptographic Provenance (`inventory_provenance_ledger`)**: SHA-256 immutable audit ledger recording every inventory count reconciliation, purchase order sync, and case usage depletion batch.
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
| `src/services/payrollIntegrationService.js` | **KEEP** | Payroll and clinical labor costing gateway (Phase F7). |
| `public.inventory_connector_configs` | **MISSING** | Facility-level materials management vendor configuration and endpoints. |
| `public.inventory_item_master` | **MISSING** | Canonical item master catalog linking vendor SKUs to HCPCS codes and costs. |
| `public.inventory_stock_levels` | **MISSING** | Multi-depot stock on-hand, par levels, and replenishment status. |
| `public.inventory_case_usage` | **MISSING** | Perioperative case-level supply consumption and implant UDI tracking. |
| `public.inventory_waste_logs` | **MISSING** | Preference card variance tracking and opened/unopened waste logging. |
| `public.inventory_exception_logs` | **MISSING** | Quarantine workqueue for unmapped SKUs, expired lots, and cost spikes. |
| `public.inventory_provenance_ledger` | **MISSING** | Immutable cryptographic audit ledger recording inventory sync checksums. |
| `src/services/inventoryIntegrationService.js` | **MISSING** | Core calculation service handling inventory valuation, par audits, and depletion. |
| `src/components/InventoryIntegrationView.jsx` | **MISSING** | UI dashboard displaying inventory health, telemetry, 5-stage pipeline, and 4 audit subtabs. |

---

## Target State
1. **Automated Materials Management Connector Architecture**:
   - Integration with enterprise materials management systems (Envi by IOS, symplr, Medline, Pyxis, McKesson).
   - Dual-mode synchronization:
     - Real-Time Point-of-Use (POU) Depletion: Live barcode/RFID capture during surgery depleting OR core stock.
     - Nightly Vendor Catalog & EDI 832/850 Sync: Automated updates of vendor contracts, acquisition costs, and purchase orders.
2. **Deterministic Inventory Valuation & Costing**:
   - Valuation method support (`FIFO`, `AVERAGE_COST`, `STANDARD_COST`):
     $$\text{Total Case Supply Cost} = \sum_{i=1}^{M} \left( \text{Quantity Used}_i \times \text{Unit Cost}_i \right) + \sum_{w=1}^{K} \left( \text{Quantity Wasted}_w \times \text{Unit Cost}_w \right)$$
   - Implant pass-through markup calculation for commercial payer carve-outs:
     $$\text{Billed Implant Charge} = \text{Acquisition Cost} \times (1 + \text{Carveout Markup \%})$$
3. **FDA Unique Device Identifier (UDI) Tracking**:
   - Parses Device Identifier (DI) + Production Identifier (PI: Lot, Expiration Date, Serial Number).
   - Validates that scanned implant expiration date $\ge$ surgery date; blocks expired implants at point of care.
4. **Cryptographic Provenance**:
   - Generates an immutable SHA-256 seal for every committed inventory reconciliation and depletion batch:
     $$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{period\_code} \parallel \text{total\_depletion\_cost} \parallel \text{status})$$

---

## Data Model / Schema
Database tables, indexes, RLS policies, and views defined in `supabase/migrations/130_inventory_integration.sql`:

```sql
-- 1. Inventory Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.inventory_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    inventory_vendor VARCHAR(64) NOT NULL DEFAULT 'ENVI_IOS' CHECK (
        inventory_vendor IN ('ENVI_IOS', 'SYMPLR_MM', 'MEDLINE_OPTICAT', 'MCKESSON_SUPPLY', 'PYXIS_OMNICELL')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_API' CHECK (
        gateway_mode IN ('REST_API', 'EDI_X12_832', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    purchasing_account_code VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    costing_method VARCHAR(24) NOT NULL DEFAULT 'FIFO' CHECK (
        costing_method IN ('FIFO', 'AVERAGE_COST', 'STANDARD_COST')
    ),
    default_implant_markup_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00,
    sync_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        sync_status IN ('CONNECTED', 'SYNCING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_inventory_config UNIQUE (facility_id)
);

-- 2. Canonical Item Master Directory Table
CREATE TABLE IF NOT EXISTS public.inventory_item_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    item_sku VARCHAR(64) NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    clinical_category VARCHAR(48) NOT NULL CHECK (
        clinical_category IN ('IMPLANT', 'SURGICAL_SUPPLY', 'PHARMACEUTICAL', 'PPE_DISPOSABLE', 'BIOLOGIC')
    ),
    manufacturer_name VARCHAR(128) NOT NULL,
    unit_of_measure VARCHAR(16) NOT NULL DEFAULT 'EA' CHECK (
        unit_of_measure IN ('EA', 'BOX', 'CASE', 'PK', 'VIAL')
    ),
    contracted_acquisition_cost NUMERIC(10,2) NOT NULL,
    is_billable BOOLEAN NOT NULL DEFAULT TRUE,
    hcpcs_cpt_code VARCHAR(16),
    fda_udi_barcode VARCHAR(128),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_item_sku UNIQUE (facility_id, item_sku)
);

-- 3. Inventory Stock Levels & Par Depots Table
CREATE TABLE IF NOT EXISTS public.inventory_stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.inventory_item_master(id) ON DELETE CASCADE,
    depot_location VARCHAR(48) NOT NULL CHECK (
        depot_location IN ('MAIN_SUPPLY_DEPOT', 'OR_CORE_STORAGE', 'STERILE_PROCESSING_CLEAN_ROOM', 'ANESTHESIA_CABINET')
    ),
    quantity_on_hand INT NOT NULL DEFAULT 0,
    minimum_par_level INT NOT NULL DEFAULT 10,
    maximum_par_level INT NOT NULL DEFAULT 50,
    reorder_point INT NOT NULL DEFAULT 15,
    replenishment_status VARCHAR(24) NOT NULL DEFAULT 'OPTIMAL' CHECK (
        replenishment_status IN ('OPTIMAL', 'LOW_STOCK', 'CRITICAL_REORDER', 'OVERSTOCKED')
    ),
    last_counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_item_depot UNIQUE (facility_id, item_id, depot_location)
);

-- 4. Perioperative Case Item Usage Table
CREATE TABLE IF NOT EXISTS public.inventory_case_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    item_id UUID NOT NULL REFERENCES public.inventory_item_master(id) ON DELETE CASCADE,
    item_sku VARCHAR(64) NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    quantity_used INT NOT NULL DEFAULT 1,
    quantity_wasted INT NOT NULL DEFAULT 0,
    unit_acquisition_cost NUMERIC(10,2) NOT NULL,
    total_case_supply_cost NUMERIC(10,2) NOT NULL,
    implant_lot_number VARCHAR(64),
    implant_serial_number VARCHAR(64),
    implant_expiration_date DATE,
    is_billable BOOLEAN NOT NULL DEFAULT TRUE,
    service_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Preference Card Variance & Waste Logs Table
CREATE TABLE IF NOT EXISTS public.inventory_waste_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_identifier VARCHAR(64) NOT NULL,
    item_sku VARCHAR(64) NOT NULL,
    procedure_name VARCHAR(128) NOT NULL,
    staged_quantity INT NOT NULL DEFAULT 1,
    used_quantity INT NOT NULL DEFAULT 1,
    wasted_quantity INT NOT NULL DEFAULT 0,
    waste_category VARCHAR(32) NOT NULL CHECK (
        waste_category IN ('OPENED_UNUSED', 'CONTAMINATED_DROPPED', 'EXPIRED_ON_SHELF', 'WRONG_ITEM_STAGED')
    ),
    financial_waste_amount NUMERIC(10,2) NOT NULL,
    logged_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Inventory Exception Logs Table
CREATE TABLE IF NOT EXISTS public.inventory_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('UNMAPPED_SKU', 'EXPIRED_LOT_SCANNED', 'STOCKOUT_ALERT', 'COST_SPIKE_ANOMALY')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_identifier VARCHAR(64),
    description TEXT NOT NULL,
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_MATERIALS_MANAGER_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Inventory Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.inventory_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
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

### Rule 1: Deterministic Supply Cost Calculation
For every item consumed or wasted during a surgical encounter:
$$\text{Total Item Cost} = (\text{Quantity Used} \times \text{Unit Acquisition Cost}) + (\text{Quantity Wasted} \times \text{Unit Acquisition Cost})$$

### Rule 2: Implant Expiration and Safety Guard
Any implant scanned with an expiration date strictly prior to the date of surgery ($T_{\text{exp}} < T_{\text{surgery}}$) triggers an immediate blocking exception (`ERR_EXPIRED_IMPLANT_SCANNED`). Scans of unregistered UDI barcodes trigger `ERR_UNMAPPED_UDI_BARCODE`.

### Rule 3: Par Replenishment Thresholds
For each item in a depot:
- If $\text{Quantity On Hand} \le \text{Reorder Point} \times 0.5 \implies \text{CRITICAL\_REORDER}$.
- If $\text{Quantity On Hand} \le \text{Reorder Point} \implies \text{LOW\_STOCK}$.
- If $\text{Quantity On Hand} > \text{Maximum Par Level} \implies \text{OVERSTOCKED}$.
- Otherwise $\implies \text{OPTIMAL}$.

### Rule 4: Cryptographic Batch Sealing
Every committed inventory synchronization and physical count audit records an immutable SHA-256 seal:
$$\text{Seal} = \text{SHA-256}(\text{facility\_id} \parallel \text{batch\_control\_number} \parallel \text{period\_code} \parallel \text{total\_value} \parallel \text{status})$$

---

## Permissions / Security
- Enforces facility-level tenancy isolation through PostgreSQL Row-Level Security (`app.current_facility_id`).
- Secrets and API credentials are encrypted at rest and masked in UI responses (`inv_sec_****_8821`).
- RBAC Matrix:
  - `Materials Manager` / `OR Supply Coordinator`: Full read, write, stock level adjustment, PO reconciliation, and exception resolution.
  - `Clinical Nursing Director` / `Circulating RN`: Point-of-use case depletion logging and preference card waste entry.
  - `Financial Analyst`: Read-only access to item master costs, case supply margins, and inventory valuation telemetry.

---

## API / Service Requirements
Backend service module `src/services/inventoryIntegrationService.js` and facade `src/lib/inventoryIntegrationService.js` provide:
- `getInventoryConnectorConfig(facilityId)`: Retrieves facility materials management configuration with masked secrets.
- `getInventoryTelemetry(facilityId)`: Computes rolling metrics: total inventory valuation ($), stockout alerts count, preference card waste rate (%), and active SKUs count.
- `getInventoryItemMaster(facilityId)`: Returns active canonical item catalog with contracted costs and billable status.
- `getInventoryStockLevels(facilityId)`: Returns stock on-hand, par levels, and replenishment status across depots.
- `getInventoryCaseUsage(facilityId)`: Returns perioperative case item consumption with implant lot numbers.
- `getInventoryWasteLogs(facilityId)`: Returns preference card waste entries and financial waste totals.
- `getInventoryExceptions(facilityId)`: Returns quarantined inventory exceptions.
- `calculateSupplyCost(quantityUsed, quantityWasted, unitCost)`: Deterministic item cost calculation.
- `evaluateReplenishmentStatus(onHand, minPar, maxPar, reorderPoint)`: Evaluates replenishment status.
- `testInventoryConnection(facilityId)`: Tests live connectivity with external materials management vendor.
- `triggerManualInventorySync(facilityId)`: Ingests external vendor catalog changes and recalculates par levels.
- `recordCaseItemUsage(facilityId, usageData)`: Depletes stock and logs case supply consumption.
- `resolveInventoryException(exceptionId, resolution)`: Resolves a quarantined inventory exception.

---

## UI / Workflow Requirements
Component `src/components/InventoryIntegrationView.jsx` and styling `src/components/InventoryIntegrationView.css`:
- **Header Action Bar**: Live materials management connection status pill, vendor badge (Envi by IOS), "Test Connection", "Sync Inventory", "Record Usage".
- **4-Metric Telemetry Ribbon**:
  1. *Total Inventory Valuation*: On-hand stock asset valuation across all facility depots ($184,250.00).
  2. *Stockout Alerts*: Count of items currently at or below critical reorder threshold (2 items).
  3. *Preference Card Waste %*: Percentage of staged supplies discarded or opened-unused (3.2%).
  4. *Active Catalog SKUs*: Count of active standardized products in the item master (142 SKUs).
- **5-Stage Inventory Pipeline Visualizer**:
  1. Vendor Catalog Sync (Contracted SKUs, Acquisition Costs & UDI Mapped)
  2. Par Depot Monitoring (Main Storage & OR Core Stock Reconciled)
  3. Point-of-Care Barcode Scan (Lot, Serial & Expiration Validated)
  4. Intra-Op Case Depletion (Usage Deducted & Billed Supply Calculated)
  5. Stock Reorder Trigger (Automated PO Dispatch & SHA-256 Seal)
- **4 Navigation Subtabs**:
  - *Item Master Catalog*: SKU, description, category badge, manufacturer, UOM, acquisition cost, billable status, HCPCS code, UDI barcode.
  - *Depot Stock & Par Levels*: SKU, description, depot location, on-hand count, min/max par, reorder point, replenishment status badge.
  - *Case Supply Usage*: Case identifier, procedure name, date, SKU, description, qty used, qty wasted, unit cost, total supply cost, implant lot.
  - *Inventory Exceptions*: Exception code, category, severity, offending identifier, description, resolution status, action button.
- **Settings Drawer**: Modal to inspect and update inventory vendor, API endpoint, purchasing account code, costing method, and implant markup %.
- **Zero Prohibited Tokens**: Strict adherence to design tokens—no purple, violet, indigo, magenta, fuchsia.
- **Light/Dark Mode Support**: Flawless contrast, `padding: 0` on root container `.inv-container` preventing layout overflow.

---

## Audit / Provenance
- All inventory counts, purchase orders, and case depletion runs record an immutable SHA-256 seal.
- All modifications and manual par overrides log operator ID, timestamp, and audit trail metadata.

---

## QA / Test Cases
Automated test suite `tests/inventory-integration.test.js`:
1. Telemetry returns accurate metrics for Naples Surgery Center (`fac-naples-01`).
2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects.
3. Connector configuration retrieval and status verification.
4. Deterministic item master catalog retrieval and contracted cost verification.
5. Deterministic supply cost calculation ($\text{Cost} = (\text{Used} + \text{Wasted}) \times \text{Unit Cost}$).
6. Replenishment threshold evaluation (`OPTIMAL`, `LOW_STOCK`, `CRITICAL_REORDER`, `OVERSTOCKED`).
7. Point-of-use implant validation (flags expired lots with `ERR_EXPIRED_IMPLANT_SCANNED`).
8. Case supply usage logging and stock depletion.
9. Manual inventory sync trigger execution creates batch record with SHA-256 seal.
10. Dual facade re-export parity between `src/services/` and `src/lib/`.
11. Migration 130 UP/DOWN SQL structural integrity and RLS policies.
12. Strict Zero-Prohibited Token Compliance in `InventoryIntegrationView` and shell integration.

---

## Acceptance Criteria
- Build passes (`npm run build`).
- Lint and type checks pass.
- All 108 tests across Phases F0 through F8 pass without warnings.
- Tenant isolation is enforced on all inventory tables via `facility_id`.
- Zero prohibited accent colors present.
- Inventory valuation and cost calculation formulas verified mathematically.

---

## Dependencies
- Upstream: Phase F0 (Integration Framework), Phase F3 (SIS Integration), Phase F4 (HST Pathways Integration).
- Database: Migration 130 (`supabase/migrations/130_inventory_integration.sql`).

---

## Definition of Done
Phase F8 is complete when:
1. Migration 130 and rollback script 130 down are authored with complete RLS, telemetry view, and seeded Naples Surgery Center data.
2. `inventoryIntegrationService.js` and facade `src/lib/inventoryIntegrationService.js` are fully implemented with deterministic inventory rules.
3. `InventoryIntegrationView.jsx` and `InventoryIntegrationView.css` are authored with zero prohibited tokens, 5-stage pipeline, 4 subtabs, and settings modal.
4. Shell integration in `src/App.jsx` renders the `'inventory_integration'` tab.
5. 12 automated tests in `tests/inventory-integration.test.js` pass with 100% pass rate.
6. Full test suite (108 tests) and `npm run build` exit code 0.
