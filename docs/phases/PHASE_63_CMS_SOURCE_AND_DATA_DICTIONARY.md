# PHASE 63 — CMS SOURCE & DATA DICTIONARY
## Device-Intensive Procedures, Device Categories & C-Code Crosswalk

**Product:** ASCANALYST Financial & Clinical Operations Platform  
**Phase:** 63 — Device-Intensive Payment Rules & Packaging Logic  
**Statutory Authority:** 42 CFR § 416.171(b)(2), Social Security Act § 1833(i)(2)(D)  
**Status:** PRODUCTION SPECIFICATION & DATA DICTIONARY  

---

## 1. Official CMS Source Files & Ingestion Provenance

All Phase 63 device-intensive reference tables must be populated directly from official CMS published release files. No synthetic, mocked, or placeholder offsets may be admitted to production.

| CMS Source File | Publication / Rule | Ingestion Frequency | Target Table | Primary Keys & Foreign Keys |
| :--- | :--- | :--- | :--- | :--- |
| **Addendum AA** (`CMS-1823-FC_Addendum_AA.xlsx`) | Final Rule OPPS/ASC CY 2026 | Annual (Nov) + Quarterly Updates | `public.cms_asc_addenda`, `public.cms_device_intensive_procedures` | `(code, release_id)` FK -> `cms_asc_releases(id)` |
| **Addendum BB** (`CMS-1823-FC_Addendum_BB.xlsx`) | Final Rule OPPS/ASC CY 2026 | Annual (Nov) + Quarterly Updates | `public.cms_asc_addenda` | `(code, release_id)` FK -> `cms_asc_releases(id)` |
| **Device-to-Procedure Edits Table** | CMS OPPS/ASC Quarterly Edits | Quarterly (Jan/Apr/Jul/Oct) | `public.cpt_device_category_crosswalk` | `(cpt_code, device_category_code, effective_start_date)` |
| **HCPCS Level II National Alpha-Numeric** | CMS HCPCS Annual File | Annual (Nov) | `public.cms_device_categories` | `(category_code)` PK |

---

## 2. Statutory HCPCS Level II Device Categories (C-Codes)

The following table provides the exhaustive dictionary of statutory CMS Level II C-codes and HCPCS device codes used in Ambulatory Surgery Center surgical claims. All devices listed below are **100% packaged** into the primary procedure APC payment under 42 CFR § 416.171(b)(2) and are separately reportable but receive **$0.00 allowable payment**.

| HCPCS Code | Category Descriptor | Clinical Construct / Implant Type | Typical Primary CPT | Packaging Status |
| :--- | :--- | :--- | :--- | :--- |
| **`C1776`** | Joint device (implantable) | Femoral / tibial knee components, hip stems, cups | `27447`, `27130`, `29888` | Packaged ($0.00 Allowable) |
| **`C1785`** | Pacemaker, dual chamber (implantable) | Cardiac pulse generator, dual chamber | `33208`, `33207` | Packaged ($0.00 Allowable) |
| **`C1786`** | Pacemaker, single chamber (implantable) | Cardiac pulse generator, single chamber | `33206` | Packaged ($0.00 Allowable) |
| **`C1767`** | Generator, neurostimulator (implantable) | Spinal cord / peripheral nerve generator | `63685`, `64568` | Packaged ($0.00 Allowable) |
| **`C1778`** | Lead, neurostimulator (implantable) | Percutaneous / paddle stimulation leads | `63650`, `64555` | Packaged ($0.00 Allowable) |
| **`C1882`** | Cardioverter-defibrillator, other | Subcutaneous / transvenous ICD generator | `33249`, `33270` | Packaged ($0.00 Allowable) |
| **`C2617`** | Stent, non-coronary, temporary w/o delivery | Ureteral / biliary / vascular peripheral stents | `37220`, `37224`, `52332` | Packaged ($0.00 Allowable) |
| **`C1781`** | Mesh (implantable) | Hernia repair synthetic / biological mesh | `49505`, `49650` | Packaged ($0.00 Allowable) |
| **`C1713`** | Anchor/screw for oppos, bone/bone, tiss/bone | Suture anchors, interference screws, tenodesis | `29827`, `29806`, `28465` | Packaged ($0.00 Allowable) |
| **`C1830`** | Powered bone marrow biopsy needle | Bone marrow aspiration / biopsy systems | `38221`, `38222` | Packaged ($0.00 Allowable) |
| **`L8699`** | Prosthetic implant, not otherwise specified | Custom allograft, spacer, non-classified hardware | Unlisted / Custom | Packaged ($0.00 Allowable) |

---

## 3. Data Dictionary: `public.cms_device_intensive_procedures`

Stores the official CMS-published device-intensive procedures with statutory empirical device offset percentages.

| Column Name | Data Type | Nullable | Constraints / Default | Description & Provenance |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Immutable unique identifier |
| `release_id` | `UUID` | `NOT NULL` | `REFERENCES public.cms_asc_releases(id) ON DELETE RESTRICT` | Release provenance (e.g., CY 2026 CMS-1823-FC) |
| `cpt_code` | `VARCHAR(5)` | `NOT NULL` | `CHECK (cpt_code ~ '^[0-9A-Z]{5}$')` | 5-character CPT/HCPCS surgical code |
| `payment_indicator` | `VARCHAR(2)` | `NOT NULL` | `DEFAULT 'J8' CHECK (payment_indicator IN ('J8', 'G2', 'P3'))` | CMS Payment Indicator (`J8` = Device-Intensive) |
| `device_offset_percentage`| `NUMERIC(5, 4)` | `NOT NULL` | `CHECK (device_offset_percentage >= 0.3000 AND device_offset_percentage <= 0.9999)` | Statutory empirical offset (> 30.00%) |
| `national_unadjusted_rate`| `NUMERIC(10, 2)`| `NOT NULL` | `CHECK (national_unadjusted_rate > 0)` | National unadjusted baseline payment rate |
| `device_offset_amount` | `NUMERIC(10, 2)`| `NOT NULL` | `CHECK (device_offset_amount = ROUND(national_unadjusted_rate * device_offset_percentage, 2))` | Calculated protected implant offset dollar portion |
| `service_portion_unadjusted`|`NUMERIC(10, 2)`| `NOT NULL` | `CHECK (service_portion_unadjusted = national_unadjusted_rate - device_offset_amount)` | Service share subject to geographic adjustment |
| `apc_code` | `VARCHAR(5)` | `NULL` | | Ambulatory Payment Classification group |
| `effective_start_date` | `DATE` | `NOT NULL` | | First date procedure is active under this rule |
| `effective_end_date` | `DATE` | `NULL` | | Termination date; NULL indicates currently active |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `DEFAULT clock_timestamp()` | System audit timestamp |

---

## 4. Data Dictionary: `public.cms_device_categories`

Master catalog of statutory HCPCS Level II C-codes and device categories.

| Column Name | Data Type | Nullable | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `category_code` | `VARCHAR(10)` | `NOT NULL` | `PRIMARY KEY` | Unique C-code or HCPCS code (e.g., `C1776`) |
| `category_title` | `TEXT` | `NOT NULL` | | Official CMS short descriptor |
| `clinical_construct` | `VARCHAR(50)` | `NOT NULL` | | Clinical classification (e.g., `ARTHROPLASTY_JOINT`) |
| `implant_category_id` | `UUID` | `NULL` | `REFERENCES public.implant_categories(id) ON DELETE SET NULL` | Link to internal implant category master |
| `is_packaged` | `BOOLEAN` | `NOT NULL` | `DEFAULT true` | Invariant: All C-codes are packaged in ASCs |
| `effective_start_date`| `DATE` | `NOT NULL` | | Effective start date |
| `effective_end_date` | `DATE` | `NULL` | | Termination date |

---

## 5. Data Dictionary: `public.cpt_device_category_crosswalk`

CMS Device-to-Procedure Edits crosswalk enforcing mandatory C-code reporting on pre-bill claims (`SCRUB-21`).

| Column Name | Data Type | Nullable | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique crosswalk record identifier |
| `cpt_code` | `VARCHAR(5)` | `NOT NULL` | | Primary surgical procedure code |
| `device_category_code`| `VARCHAR(10)` | `NOT NULL` | `REFERENCES public.cms_device_categories(category_code)` | Mandatory or permitted device category code |
| `is_mandatory` | `BOOLEAN` | `NOT NULL` | `DEFAULT true` | If `true`, missing this device halts claim scrubbing |
| `minimum_quantity` | `INTEGER` | `NOT NULL` | `DEFAULT 1 CHECK (minimum_quantity >= 1)` | Required minimum units of device |
| `effective_start_date`| `DATE` | `NOT NULL` | | Effective date for CMS edit rule |
| `effective_end_date` | `DATE` | `NULL` | | Sunset date for edit rule |

---

## 6. Data Dictionary: `public.medicare_device_calculation_ledgers`

Authoritative audit ledger preserving the exact breakdown of device offset versus service share for every Medicare case calculation.

| Column Name | Data Type | Nullable | Constraints / Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | `NOT NULL` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Ledger record identifier |
| `surgery_id` | `UUID` | `NOT NULL` | `REFERENCES public.surgeries(id) ON DELETE CASCADE` | Surgery case identifier |
| `calc_line_id` | `UUID` | `NOT NULL` | `REFERENCES public.medicare_base_rate_calc_lines(id) ON DELETE CASCADE` | Line-item calculation reference |
| `cpt_code` | `VARCHAR(5)` | `NOT NULL` | | Surgical procedure code |
| `payment_indicator` | `VARCHAR(2)` | `NOT NULL` | | Payment indicator applied |
| `is_device_intensive` | `BOOLEAN` | `NOT NULL` | | True if offset > 30% |
| `device_offset_percentage`| `NUMERIC(5, 4)` | `NOT NULL` | | Device offset fraction applied |
| `device_offset_allowance`| `NUMERIC(10, 2)`| `NOT NULL` | | CMS device reimbursement portion ($) |
| `wage_adjusted_service_allowance`| `NUMERIC(10, 2)`| `NOT NULL`| | Wage-adjusted service reimbursement portion ($) |
| `actual_device_acquisition_cost`| `NUMERIC(10, 2)`| `NOT NULL`| `DEFAULT 0.00` | Actual invoice cost from `case_device_cost_allocations` |
| `device_net_margin` | `NUMERIC(10, 2)`| `NOT NULL` | | `device_offset_allowance - actual_device_acquisition_cost` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `DEFAULT clock_timestamp()` | Calculation timestamp |

