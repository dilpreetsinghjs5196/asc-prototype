# PHASE 66 — PAYER CONTRACT MODEL: DATA DICTIONARY & SCHEMA DESIGN

**Author:** ASCANALYST Database Engineering & Compliance  
**Scope:** Relational Tables, Column Definitions, Primary Keys, Foreign Keys, Indexes, Constraints, Triggers  
**Proposed Migration Number:** `042_payer_contract_model.sql` (Planning Reference Only)  

---

## 1. Schema Overview & Normalization Standards

The Payer Contract Model is designed to Third Normal Form (3NF) standards with strict multi-tenant isolation, immutable version locking, and enterprise coordination of benefits (COB).

### Core Schema Invariants:
- All primary keys use `UUID` generated via `gen_random_uuid()`.
- Monetary amounts stored in `NUMERIC(12, 2)` (checked non-negative).
- Multipliers and discount percentages stored in `NUMERIC(6, 4)` (e.g. `1.4500` for 145.00%).
- Date intervals enforce `(effective_end_date IS NULL OR effective_end_date >= effective_start_date)`.
- Approved versions locked via database triggers against modification.
- Zero cascading deletes on financial or historical claim-linked records (`ON DELETE RESTRICT`).

---

## 2. Table-by-Table Data Dictionary

### 2.1 `public.payer_contracts`
Master business contract record establishing the relationship between an organization and a payer.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique contract identifier. |
| `organization_id` | `UUID` | No | — | `REFERENCES public.organizations(id) ON DELETE CASCADE` | Governing corporate organization owning the contract. |
| `facility_id` | `UUID` | Yes | `NULL` | `REFERENCES public.facilities(id) ON DELETE CASCADE` | Optional single-facility binding (NULL if organization-wide). |
| `payer_id` | `UUID` | No | — | `REFERENCES public.payer_master(id) ON DELETE RESTRICT` | Target insurance carrier. |
| `contract_number` | `VARCHAR(100)` | No | — | — | External contract tracking number (e.g. `BCBS-ASC-FL-2026`). |
| `contract_title` | `VARCHAR(255)` | No | — | — | Descriptive title of agreement. |
| `contract_type` | `VARCHAR(40)` | No | `'COMMERCIAL_DIRECT'` | `CHECK (contract_type IN ('COMMERCIAL_DIRECT', 'MEDICARE_ADVANTAGE', 'WORKERS_COMP', 'GOVERNMENT_MEDICAID', 'IPA_CAPITATION', 'LETTER_OF_AGREEMENT'))` | Contractual classification. |
| `scope_mode` | `VARCHAR(30)` | No | `'SPECIFIC_FACILITIES'` | `CHECK (scope_mode IN ('ALL_FACILITIES', 'SPECIFIC_FACILITIES', 'EXCLUDE_FACILITIES'))` | How facility inheritance is evaluated. |
| `execution_date` | `DATE` | Yes | — | — | Date agreement was legally executed/signed. |
| `initial_effective_date` | `DATE` | No | `CURRENT_DATE` | — | Date contract first became effective. |
| `current_expiration_date`| `DATE` | Yes | — | — | Current term expiration date. |
| `auto_renew` | `BOOLEAN` | No | `TRUE` | — | Whether evergreen renewal terms apply. |
| `renewal_notice_days` | `INTEGER` | No | `90` | `CHECK (renewal_notice_days >= 0)` | Days notice required to terminate before auto-renewal. |
| `status` | `VARCHAR(25)` | No | `'DRAFT'` | `CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'TERMINATED'))` | Overall contract lifecycle state. |
| `governing_jurisdiction` | `VARCHAR(100)` | Yes | — | — | State or regulatory jurisdiction (e.g. `Florida`). |
| `created_by` | `UUID` | Yes | — | `REFERENCES auth.users(id) ON DELETE SET NULL` | Author who drafted the contract. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Record creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Record update timestamp. |

**Constraints & Indexes:**
- `CONSTRAINT uq_payer_contract_number UNIQUE (organization_id, contract_number)`
- `INDEX idx_payer_contracts_org (organization_id, status)`
- `INDEX idx_payer_contracts_payer (payer_id)`
- `INDEX idx_payer_contracts_facility (facility_id)`

---

### 2.2 `public.payer_contract_versions`
Immutable, effective-dated terms snapshot.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique version identifier. |
| `contract_id` | `UUID` | No | — | `REFERENCES public.payer_contracts(id) ON DELETE CASCADE` | Parent contract reference. |
| `version_number` | `INTEGER` | No | `1` | `CHECK (version_number >= 1)` | Incremental version number (1, 2, 3...). |
| `effective_start_date` | `DATE` | No | — | — | First date of service this version governs. |
| `effective_end_date` | `DATE` | Yes | `NULL` | — | Last date of service this version governs (NULL = open). |
| `reimbursement_methodology` | `VARCHAR(40)` | No | `'PERCENT_OF_MEDICARE'` | `CHECK (reimbursement_methodology IN ('PERCENT_OF_MEDICARE', 'COMMERCIAL_FEE_SCHEDULE', 'PERCENT_OF_BILLED_CHARGES', 'CASE_RATE', 'HYBRID'))` | Default rate methodology. |
| `medicare_multiplier` | `NUMERIC(6, 4)`| Yes | `1.0000` | `CHECK (medicare_multiplier > 0)` | Multiplier when `% of Medicare` is used (e.g. `1.4500`). |
| `billed_charge_discount_pct` | `NUMERIC(6, 4)` | Yes | `NULL` | `CHECK (billed_charge_discount_pct BETWEEN 0 AND 1)` | Discount off gross charge (e.g. `0.3500` for 35% discount). |
| `mppr_rule_set_code` | `VARCHAR(40)` | No | `'CMS_50_PERCENT'` | — | Link to Phase 64 MPPR rule set code. |
| `device_carve_out_mode` | `VARCHAR(40)` | No | `'PASS_THROUGH_INVOICE_PLUS_PERCENT'` | `CHECK (device_carve_out_mode IN ('PASS_THROUGH_INVOICE_PLUS_PERCENT', 'AT_COST', 'FIXED_ALLOWANCE', 'EXCLUDED_FROM_SEPARATE_PAYMENT'))` | Implant carve-out payment rule. |
| `device_invoice_markup_pct` | `NUMERIC(6, 4)` | No | `0.1000` | `CHECK (device_invoice_markup_pct >= 0)` | Invoice markup allowed (e.g. 10.0%). |
| `is_locked` | `BOOLEAN` | No | `FALSE` | — | Set TRUE upon approval; prevents all further edits. |
| `version_hash` | `VARCHAR(64)` | Yes | — | — | SHA-256 hash of all terms for tamper verification. |
| `change_summary` | `TEXT` | Yes | — | — | Summary of revisions from prior version. |
| `approved_by` | `UUID` | Yes | — | `REFERENCES auth.users(id) ON DELETE SET NULL` | Authorized executive sign-off user. |
| `approved_at` | `TIMESTAMPTZ` | Yes | — | — | Sign-off timestamp. |
| `status` | `VARCHAR(25)` | No | `'DRAFT'` | `CHECK (status IN ('DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'TERMINATED'))` | Version state. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Creation timestamp. |

**Constraints & Indexes:**
- `CONSTRAINT chk_version_date_order CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)`
- `CONSTRAINT uq_contract_version_num UNIQUE (contract_id, version_number)`
- `INDEX idx_contract_versions_dates (contract_id, effective_start_date, effective_end_date)`
- `INDEX idx_contract_versions_status (status)`

---

### 2.3 `public.payer_contract_facility_scopes`
Explicit facility binding table for multi-facility organization contracts.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique scope binding ID. |
| `contract_id` | `UUID` | No | — | `REFERENCES public.payer_contracts(id) ON DELETE CASCADE` | Master contract. |
| `facility_id` | `UUID` | No | — | `REFERENCES public.facilities(id) ON DELETE CASCADE` | Covered surgical center. |
| `is_active` | `BOOLEAN` | No | `TRUE` | — | Whether facility is currently participating. |
| `facility_specific_override`| `BOOLEAN` | No | `FALSE` | — | Whether local contract terms take precedence. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Timestamp. |

**Constraints & Indexes:**
- `CONSTRAINT uq_contract_facility_scope UNIQUE (contract_id, facility_id)`
- `INDEX idx_scope_facility (facility_id, contract_id)`

---

### 2.4 `public.payer_contract_plan_scopes`
Defines which health plans under the payer are included or excluded by the contract version.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique plan scope ID. |
| `contract_version_id` | `UUID` | No | — | `REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE` | Parent contract version. |
| `plan_id` | `UUID` | No | — | `REFERENCES public.payer_plans(id) ON DELETE RESTRICT` | Target benefit plan. |
| `is_covered` | `BOOLEAN` | No | `TRUE` | — | TRUE = included; FALSE = explicitly excluded. |
| `plan_multiplier_override` | `NUMERIC(6, 4)` | Yes | `NULL` | — | Optional plan-specific multiplier (e.g. HMO 130% vs PPO 150%). |
| `notes` | `TEXT` | Yes | — | — | Scope notes. |

**Constraints & Indexes:**
- `CONSTRAINT uq_version_plan_scope UNIQUE (contract_version_id, plan_id)`
- `INDEX idx_scope_plan (plan_id, contract_version_id)`

---

### 2.5 `public.payer_contract_service_scopes`
Defines clinical specialty or service category inclusions, carve-outs, or bundling rules.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Scope identifier. |
| `contract_version_id` | `UUID` | No | — | `REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE` | Parent version. |
| `scope_level` | `VARCHAR(30)` | No | `'SPECIALTY'` | `CHECK (scope_level IN ('SPECIALTY', 'CPT_RANGE', 'CPT_SINGLE', 'REVENUE_CODE'))` | Granularity of scope. |
| `specialty_code` | `VARCHAR(50)` | Yes | — | — | E.g. `'ORTHOPEDICS'`, `'OPHTHALMOLOGY'`. |
| `cpt_code_start` | `VARCHAR(10)` | Yes | — | — | Start of CPT range. |
| `cpt_code_end` | `VARCHAR(10)` | Yes | — | — | End of CPT range. |
| `cpt_code` | `VARCHAR(10)` | Yes | — | — | Specific single CPT code. |
| `is_excluded` | `BOOLEAN` | No | `FALSE` | — | TRUE = procedure not payable under agreement. |
| `pre_authorization_required`| `BOOLEAN`| No | `TRUE` | — | Prior auth required for this service. |

**Constraints & Indexes:**
- `INDEX idx_service_scope_version (contract_version_id, scope_level)`

---

### 2.6 `public.payer_contract_terms`
Granular line-item fee schedule rates and case rates linked to an approved version.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique term ID. |
| `contract_version_id` | `UUID` | No | — | `REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE` | Parent version. |
| `cpt_code` | `VARCHAR(10)` | No | — | — | Procedure CPT/HCPCS code. |
| `rate_methodology` | `VARCHAR(30)` | No | `'FIXED_FEE'` | `CHECK (rate_methodology IN ('FIXED_FEE', 'PERCENT_OF_MEDICARE', 'PERCENT_OF_BILLED', 'CASE_RATE'))` | Term-specific methodology. |
| `contracted_rate` | `NUMERIC(12, 2)`| Yes | `NULL` | `CHECK (contracted_rate >= 0)` | Flat dollar rate when `FIXED_FEE` applies. |
| `multiplier` | `NUMERIC(6, 4)` | Yes | `NULL` | `CHECK (multiplier > 0)` | Specific multiplier if overriding version default. |
| `includes_implants` | `BOOLEAN` | No | `FALSE` | — | Whether implants are bundled into this procedural fee. |
| `includes_anesthesia` | `BOOLEAN` | No | `FALSE` | — | Whether facility anesthesia is bundled. |
| `notes` | `TEXT` | Yes | — | — | Term notes. |

**Constraints & Indexes:**
- `CONSTRAINT uq_version_cpt_term UNIQUE (contract_version_id, cpt_code)`
- `INDEX idx_terms_version_cpt (contract_version_id, cpt_code)`

---

### 2.7 `public.payer_contract_documents`
Confidential contract files stored in private Supabase Storage.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Document ID. |
| `contract_id` | `UUID` | No | — | `REFERENCES public.payer_contracts(id) ON DELETE CASCADE` | Master contract reference. |
| `contract_version_id` | `UUID` | Yes | `NULL` | `REFERENCES public.payer_contract_versions(id) ON DELETE SET NULL` | Specific version attachment. |
| `document_title` | `VARCHAR(255)` | No | — | — | E.g. `'2026 Executed Master Participation Agreement'`. |
| `document_category` | `VARCHAR(50)` | No | `'MASTER_AGREEMENT'` | `CHECK (document_category IN ('MASTER_AGREEMENT', 'FEE_SCHEDULE_EXHIBIT', 'AMENDMENT', 'RENEWAL_NOTICE', 'TERMINATION_NOTICE', 'CORRESPONDENCE', 'OTHER'))` | Document type. |
| `storage_bucket` | `VARCHAR(100)` | No | `'payer-contracts'` | — | Private storage bucket. |
| `storage_path` | `VARCHAR(500)` | No | — | — | Path within bucket. |
| `file_name` | `VARCHAR(255)` | No | — | — | Original file name. |
| `file_size_bytes` | `BIGINT` | No | — | `CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400)` | Size (max 25MB). |
| `mime_type` | `VARCHAR(100)` | No | `'application/pdf'` | — | MIME type (PDF, CSV, XLSX only). |
| `file_sha256` | `VARCHAR(64)` | No | — | — | SHA-256 integrity checksum. |
| `uploaded_by` | `UUID` | Yes | — | `REFERENCES auth.users(id) ON DELETE SET NULL` | Uploader. |
| `uploaded_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Upload timestamp. |

**Constraints & Indexes:**
- `INDEX idx_docs_contract (contract_id, document_category)`

---

### 2.8 `public.payer_contract_amendments`
Formal legal modifications to an existing agreement.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique amendment identifier. |
| `contract_id` | `UUID` | No | — | `REFERENCES public.payer_contracts(id) ON DELETE CASCADE` | Master contract. |
| `prior_version_id` | `UUID` | No | — | `REFERENCES public.payer_contract_versions(id) ON DELETE RESTRICT` | Version being amended. |
| `new_version_id` | `UUID` | Yes | `NULL` | `REFERENCES public.payer_contract_versions(id) ON DELETE SET NULL` | Newly generated version resulting from amendment. |
| `amendment_number` | `INTEGER` | No | `1` | `CHECK (amendment_number >= 1)` | Incremental amendment number. |
| `amendment_title` | `VARCHAR(255)` | No | — | — | E.g. `'First Amendment - Implant Rate Indexation'`. |
| `amendment_type` | `VARCHAR(40)` | No | `'RATE_UPDATE'` | `CHECK (amendment_type IN ('RATE_UPDATE', 'SCOPE_EXPANSION', 'PLAN_ADDITION', 'TERM_EXTENSION', 'LEGAL_TERMS', 'TERMINATION'))` | Amendment scope. |
| `execution_date` | `DATE` | No | — | — | Date signed. |
| `effective_date` | `DATE` | No | — | — | Date terms take effect. |
| `is_retroactive` | `BOOLEAN` | No | `FALSE` | — | Whether terms apply to past dates of service. |
| `rationale` | `TEXT` | No | — | — | Business/legal rationale. |
| `created_by` | `UUID` | Yes | — | `REFERENCES auth.users(id) ON DELETE SET NULL` | Author. |
| `created_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Creation timestamp. |

**Constraints & Indexes:**
- `CONSTRAINT uq_contract_amendment_order UNIQUE (contract_id, amendment_number)`
- `INDEX idx_amendments_contract (contract_id, execution_date)`

---

### 2.9 `public.payer_contract_approvals`
Audit ledger of two-person executive sign-offs required before version activation.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Approval record ID. |
| `contract_version_id` | `UUID` | No | — | `REFERENCES public.payer_contract_versions(id) ON DELETE CASCADE` | Version being approved. |
| `approver_id` | `UUID` | No | — | `REFERENCES auth.users(id) ON DELETE RESTRICT` | User granting approval. |
| `approver_role` | `VARCHAR(50)` | No | — | — | Role at time of approval (`cfo`, `facility_admin`, `org_admin`). |
| `approval_stage` | `VARCHAR(40)` | No | `'FINANCIAL_CFO'` | `CHECK (approval_stage IN ('LEGAL_COMPLIANCE', 'FINANCIAL_CFO', 'EXECUTIVE_COMMITTEE'))` | Governance gate. |
| `approval_decision` | `VARCHAR(20)` | No | `'APPROVED'` | `CHECK (approval_decision IN ('APPROVED', 'REJECTED'))` | Sign-off decision. |
| `decision_notes` | `TEXT` | Yes | — | — | Mandatory if rejected. |
| `version_hash_at_approval`| `VARCHAR(64)` | No | — | — | Snapshot SHA-256 ensuring terms did not alter after sign-off. |
| `approved_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Timestamp. |

**Constraints & Indexes:**
- `CONSTRAINT uq_version_stage_approver UNIQUE (contract_version_id, approval_stage, approver_id)`
- `INDEX idx_approvals_version (contract_version_id, approval_stage)`

---

### 2.10 `public.payer_contract_audit_logs`
Immutable append-only audit trail capturing every lifecycle action.

| Column Name | Data Type | Nullable | Default | Constraints & References | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `gen_random_uuid()` | Primary Key | Unique log identifier. |
| `contract_id` | `UUID` | No | — | `REFERENCES public.payer_contracts(id) ON DELETE CASCADE` | Contract target. |
| `contract_version_id` | `UUID` | Yes | `NULL` | — | Version affected. |
| `organization_id` | `UUID` | No | — | `REFERENCES public.organizations(id) ON DELETE CASCADE` | Tenant owner. |
| `action` | `VARCHAR(50)` | No | — | — | E.g. `'CONTRACT_CREATED'`, `'VERSION_SUBMITTED'`, `'VERSION_APPROVED'`, `'TERMS_LOCKED'`, `'AMENDMENT_ADDED'`. |
| `actor_id` | `UUID` | Yes | — | `REFERENCES auth.users(id) ON DELETE SET NULL` | Performing user. |
| `before_state` | `JSONB` | Yes | — | — | Prior state snapshot. |
| `after_state` | `JSONB` | Yes | — | — | Subsequent state snapshot. |
| `ip_address` | `INET` | Yes | — | — | Client IP. |
| `user_agent` | `TEXT` | Yes | — | — | User agent. |
| `logged_at` | `TIMESTAMPTZ` | No | `NOW()` | — | Event timestamp. |

---

*Proceed to Financial Reimbursement Integration specifications.*
