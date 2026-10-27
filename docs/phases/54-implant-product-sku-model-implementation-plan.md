# Phase 54 Implementation Plan — Implant Product SKU Model

## Objectives
Implement the complete Phase 54: Implant Product SKU Model in accordance with `docs/phases/54_IMPLANT_PRODUCT_SKU_MODEL.md`.

## Deliverables
1. **Database Migrations:**
   - `supabase/migrations/029_implant_product_sku_model.sql`:
     - `public.implant_product_families`
     - `public.implant_product_skus`
     - `public.implant_sku_distributor_mappings`
     - Foreign key linkage to `case_devices.sku_id`
     - Triggers: touch updated_at, prevent active delete, prevent cross-facility relocation
     - Authoritative RPC functions: `fn_create_or_update_sku`, `fn_flag_sku_recall`, `fn_deactivate_implant_sku`, `fn_reactivate_implant_sku`
     - RLS policies with tenant isolation & global baselines
     - Seed data for major multinational OEMs (Stryker, Zimmer, Medtronic, DePuy, Alcon, Arthrex) and national distributor mappings
   - `supabase/migrations/029_implant_product_sku_model_down.sql`:
     - Safe, clean rollback script in reverse dependency order.

2. **Client Service Layer:**
   - `src/lib/skuService.js`:
     - Query with pagination, search, and multi-faceted filtering
     - UDI-DI Modulo-10 checksum validation (GS1 GTIN-14 and HIBCC)
     - RPC calls for authoritative create/update, recall, and lifecycle transitions
     - Offline / mock baseline fallback for seamless local execution
     - Exported and wired onto the `db` singleton in `src/lib/supabase.js`.

3. **Frontend Component & Styling:**
   - `src/components/ImplantProductSkuMaster.jsx`:
     - Metric cards, search & filter toolbar, paginated table, badge indicators
     - Add / Edit Product SKU Modal
     - Distributor Item Number Mapping Drawer
     - Safety Recall Modal with immediate patient exposure audit
     - Row action lifecycle icons (Edit, Distributor Mappings, Safety Recall, Deactivate, Reactivate)
   - `src/components/ImplantProductSkuMaster.css`:
     - Deep slate dark mode, fully responsive, strictly adhering to the Purple Ban (zero purple/violet/magenta/fuchsia).

4. **Application Integration:**
   - `src/App.jsx`:
     - Sidebar navigation item "Product SKU Master" under `CLINICAL` with `Package` icon
     - Active tab rendering for `activeTab === 'implant_skus'` with permission checks (`implants.manage_catalog`, `implants.view_catalog`).

5. **Automated Testing Suite:**
   - `tests/implant-product-sku-model.test.js`:
     - Suite 1: Database Migration 029 DDL, Schema Integrity, Indexes, and Constraints
     - Suite 2: Client Service Layer, UDI Checksums, and Distributor Cross-Referencing
     - Suite 3: Safety Recall and Deactivation Protocols
     - Suite 4: UI & Maestro Guideline Compliance (Purple Ban audit, App.jsx tab integration).
