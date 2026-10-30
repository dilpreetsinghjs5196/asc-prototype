# PHASE 65 — DATA DICTIONARY: PAYER & PAYER PLAN MASTER

> **Document ID:** `PHASE_65_PAYER_PLAN_DATA_DICTIONARY.md`  
> **Status:** Production Data Dictionary & Schema Specification  
> **Target Database Engine:** PostgreSQL 15+ / Supabase  
> **Proposed Planning Migration:** `041_payer_master.sql`  

---

## 1. Schema Overview

The Phase 65 Payer Master architecture introduces 8 normalized tables designed to decouple enterprise master reference data from facility-level operational settings, contract terms, and patient coverage.

```
                    ┌─────────────────────────┐
                    │      ORGANIZATION       │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │      payer_master       │◄─────────────────┐
                    └───┬─────────────────┬───┘                  │
                        │                 │                      │
           ┌────────────┴────────┐   ┌────┴───────────────┐      │
           │                     │   │                    │      │
           ▼                     ▼   ▼                    ▼      │
   ┌──────────────┐     ┌──────────────────┐    ┌─────────────────┤
   │ payer_plans  │     │payer_identifiers │    │ facility_payers │
   └───────┬──────┘     └──────────────────┘    └────────┬────────┘
           │                                             │
           ├─────────────────────┐                       │
           ▼                     ▼                       ▼
┌──────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
│ facility_payer_plans │  │ patient_insurance_  │  │ payer_contracts  │
│                      │  │     coverages       │  └────────┬─────────┘
└──────────────────────┘  └─────────────────────┘           │
                                                            ▼
                                                   ┌──────────────────┐
                                                   │payer_contract_   │
                                                   │    versions      │
                                                   └──────────────────┘
```

---

## 2. Table Specifications

### 2.1 Table: `public.payer_master`
Enterprise directory of legal payer entities, insurance corporations, and government health programs.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | `PRIMARY KEY` | Stable immutable system UUID |
| `organization_id` | `UUID` | YES | `NULL` | `REFERENCES public.organizations(id) ON DELETE SET NULL` | NULL for shared global payers; Org UUID for private payers |
| `payer_code` | `VARCHAR(50)` | NO | None | `UNIQUE`, Uppercase alphanumeric | Canonical identifier (e.g. `PAYER-UHC`, `PAYER-AETNA`) |
| `legal_name` | `VARCHAR(255)` | NO | None | Min length 2 | Official registered legal corporation name |
| `trade_name` | `VARCHAR(255)` | YES | `NULL` | None | Commercial brand name / DBA (e.g. *Aetna*) |
| `payer_category` | `VARCHAR(30)` | NO | `'Commercial'` | `CHECK (payer_category IN ('Medicare', 'Medicaid', 'Commercial', 'Medicare_Advantage', 'Medicaid_Managed', 'Workers_Comp', 'Veterans_Affairs', 'Tricare', 'Self_Pay', 'Other'))` | High-level regulatory classification |
| `status` | `VARCHAR(20)` | NO | `'ACTIVE'` | `CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED'))` | Operational lifecycle status |
| `naic_code` | `VARCHAR(10)` | YES | `NULL` | Numeric 5-digit regex | National Association of Insurance Commissioners company ID |
| `tax_id` | `VARCHAR(20)` | YES | `NULL` | Federal EIN regex | Payer federal tax identification number |
| `website_url` | `VARCHAR(255)` | YES | `NULL` | Valid URL | Provider portal or corporate homepage |
| `claims_phone` | `VARCHAR(30)` | YES | `NULL` | None | Payer claims inquiry telephone number |
| `created_by` | `UUID` | YES | `NULL` | `REFERENCES auth.users(id) ON DELETE SET NULL` | Creator user identity |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Auto-updated via trigger |

- **Indexes**:
  - `CREATE UNIQUE INDEX uq_payer_master_code ON public.payer_master(UPPER(payer_code));`
  - `CREATE INDEX idx_payer_master_category ON public.payer_master(payer_category, status);`
  - `CREATE INDEX idx_payer_master_org ON public.payer_master(organization_id);`

---

### 2.2 Table: `public.payer_plans`
Normalized benefit plans, products, and network options underwritten by a master payer.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | `PRIMARY KEY` | Stable plan UUID |
| `payer_id` | `UUID` | NO | None | `REFERENCES public.payer_master(id) ON DELETE RESTRICT` | Parent payer corporation |
| `plan_code` | `VARCHAR(50)` | NO | None | Alphanumeric | Payer-assigned plan code (e.g. `UHC-CHOICE-PLUS`) |
| `plan_name` | `VARCHAR(255)` | NO | None | Min length 2 | Commercial marketing plan name |
| `plan_type` | `VARCHAR(30)` | NO | `'PPO'` | `CHECK (plan_type IN ('HMO', 'PPO', 'EPO', 'POS', 'MEDICARE_ADVANTAGE_HMO', 'MEDICARE_ADVANTAGE_PPO', 'MEDICAID_MCO', 'INDEMNITY', 'HIGH_DEDUCTIBLE', 'OTHER'))` | Benefit network classification |
| `timely_filing_days` | `INTEGER` | NO | `180` | `CHECK (timely_filing_days >= 30 AND timely_filing_days <= 730)` | Number of days to submit claims from DOS |
| `requires_prior_auth` | `BOOLEAN` | NO | `true` | None | Indicates if ASC surgical procedures require prior auth |
| `is_active` | `BOOLEAN` | NO | `true` | None | Active availability flag |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Auto-updated via trigger |

- **Indexes & Constraints**:
  - `CONSTRAINT uq_payer_plan_code UNIQUE (payer_id, UPPER(plan_code));`
  - `CREATE INDEX idx_payer_plans_payer ON public.payer_plans(payer_id);`
  - `CREATE INDEX idx_payer_plans_type ON public.payer_plans(plan_type, is_active);`

---

### 2.3 Table: `public.payer_identifiers`
Flexible electronic data interchange (EDI) routing codes, clearinghouse IDs, and clearinghouse credentials.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | `PRIMARY KEY` | Identifier UUID |
| `payer_id` | `UUID` | NO | None | `REFERENCES public.payer_master(id) ON DELETE CASCADE` | Associated master payer |
| `identifier_type` | `VARCHAR(40)` | NO | None | `CHECK (identifier_type IN ('EDI_PAYER_ID', 'CLEARINGHOUSE_ROUTING_CODE', 'ELIGIBILITY_PAYER_ID', 'CLAIM_STATUS_PAYER_ID', 'NAIC_CODE', 'STATE_MEDICAID_ID'))` | Standard identifier role |
| `identifier_value` | `VARCHAR(60)` | NO | None | Uppercase alphanumeric | Code value (e.g. `60054`, `87726`, `00590`) |
| `clearinghouse` | `VARCHAR(40)` | NO | `'GLOBAL'` | `CHECK (clearinghouse IN ('GLOBAL', 'AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'TIRAS', 'DIRECT_EDI'))` | Applicable transaction hub |
| `transaction_scope` | `VARCHAR(30)` | NO | `'ALL'` | `CHECK (transaction_scope IN ('ALL', '837P_PROFESSIONAL', '837I_INSTITUTIONAL', '270_ELIGIBILITY', '276_CLAIM_STATUS', '835_ERA'))` | HIPAA EDI transaction type |
| `effective_start_date` | `DATE` | NO | `CURRENT_DATE` | None | Effective beginning date |
| `effective_end_date` | `DATE` | YES | `NULL` | `CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date)` | Effective termination date |
| `is_verified` | `BOOLEAN` | NO | `true` | None | Verified with clearinghouse companion guide |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Timestamp |

- **Indexes & Constraints**:
  - `CONSTRAINT uq_payer_identifier_scope UNIQUE (payer_id, identifier_type, clearinghouse, transaction_scope, effective_start_date);`
  - `CREATE INDEX idx_payer_identifiers_lookup ON public.payer_identifiers(identifier_value, identifier_type);`

---

### 2.4 Table: `public.facility_payers`
Facility-level participation, in-network credentialing status, and localized billing instructions.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | `PRIMARY KEY` | Record UUID |
| `facility_id` | `UUID` | NO | None | `REFERENCES public.facilities(id) ON DELETE CASCADE` | Surgical center facility |
| `payer_id` | `UUID` | NO | None | `REFERENCES public.payer_master(id) ON DELETE RESTRICT` | Enabled master payer |
| `participation_status` | `VARCHAR(25)` | NO | `'IN_NETWORK'` | `CHECK (participation_status IN ('IN_NETWORK', 'OUT_OF_NETWORK', 'PAR_PENDING', 'TERMINATED'))` | Network participation tier |
| `preferred_clearinghouse` | `VARCHAR(40)` | NO | `'AVAILITY'` | `CHECK (preferred_clearinghouse IN ('AVAILITY', 'CHANGE_HEALTHCARE', 'WAYSTAR', 'DIRECT_EDI', 'MANUAL_PORTAL'))` | Facility primary EDI portal |
| `facility_payer_code_override` | `VARCHAR(30)` | YES | `NULL` | None | Local legacy code if required |
| `billing_npi_override` | `VARCHAR(10)` | YES | `NULL` | 10-digit regex | Specific group NPI if different from facility |
| `electronic_claim_enabled` | `BOOLEAN` | NO | `true` | None | Enables 837 EDI generation |
| `billing_instructions` | `TEXT` | YES | `NULL` | None | Custom facility billing notes |
| `effective_start_date` | `DATE` | NO | `CURRENT_DATE` | None | Participation start date |
| `effective_end_date` | `DATE` | YES | `NULL` | None | Contract termination date |
| `is_enabled` | `BOOLEAN` | NO | `true` | None | Facility availability toggle |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Auto-updated via trigger |

- **Indexes & Constraints**:
  - `CONSTRAINT uq_facility_payer_link UNIQUE (facility_id, payer_id);`
  - `CREATE INDEX idx_facility_payers_lookup ON public.facility_payers(facility_id, is_enabled);`

---

### 2.5 Table: `public.facility_payer_plans`
Granular acceptance and authorization rules for specific plans at each facility.

| Column Name | Data Type | Nullable | Default | Constraints & Relationships | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | `PRIMARY KEY` | Mapping UUID |
| `facility_id` | `UUID` | NO | None | `REFERENCES public.facilities(id) ON DELETE CASCADE` | Surgical center facility |
| `plan_id` | `UUID` | NO | None | `REFERENCES public.payer_plans(id) ON DELETE RESTRICT` | Specific benefit plan |
| `is_accepted` | `BOOLEAN` | NO | `true` | None | Is plan accepted for care at this ASC |
| `in_network_override` | `BOOLEAN` | YES | `NULL` | None | Overrides parent payer network status if plan is tiered |
| `copay_override` | `NUMERIC(10, 2)` | YES | `NULL` | Non-negative | Facility-standard expected copay |
| `requires_pre_auth` | `BOOLEAN` | NO | `true` | None | Mandatory prior-auth blocker flag |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Timestamp |

- **Indexes & Constraints**:
  - `CONSTRAINT uq_facility_payer_plan UNIQUE (facility_id, plan_id);`
  - `CREATE INDEX idx_facility_plans ON public.facility_payer_plans(facility_id, is_accepted);`

---

### 2.6 Table: `public.patient_insurance_coverages`
1NF normalized patient insurance coverage records supporting primary, secondary, and tertiary Coordination of Benefits (COB).

| Column Name | Data Type | Nullable | Default | Constraints & Relationships | Description |
|---|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | `PRIMARY KEY` | Policy UUID |
| `facility_id` | `UUID` | NO | None | `REFERENCES public.facilities(id) ON DELETE CASCADE` | Tenancy context |
| `patient_id` | `BIGINT` | NO | None | `REFERENCES public.patients(id) ON DELETE CASCADE` | Patient record |
| `coverage_order` | `VARCHAR(15)` | NO | `'PRIMARY'` | `CHECK (coverage_order IN ('PRIMARY', 'SECONDARY', 'TERTIARY'))` | COB hierarchy position |
| `payer_id` | `UUID` | NO | None | `REFERENCES public.payer_master(id) ON DELETE RESTRICT` | Underwriting payer |
| `plan_id` | `UUID` | YES | `NULL` | `REFERENCES public.payer_plans(id) ON DELETE SET NULL` | Specific plan product |
| `policy_number` | `VARCHAR(80)` | NO | None | Min length 2 | Member subscriber identifier |
| `group_number` | `VARCHAR(60)` | YES | `NULL` | None | Employer/benefit group number |
| `subscriber_name` | `VARCHAR(150)` | NO | None | None | Legal subscriber name |
| `subscriber_dob` | `DATE` | YES | `NULL` | None | Subscriber date of birth |
| `subscriber_relationship` | `VARCHAR(20)` | NO | `'SELF'` | `CHECK (subscriber_relationship IN ('SELF', 'SPOUSE', 'CHILD', 'OTHER'))` | Patient relationship to subscriber |
| `effective_start_date` | `DATE` | YES | `NULL` | None | Policy effective start |
| `effective_end_date` | `DATE` | YES | `NULL` | None | Policy expiration |
| `copay_amount` | `NUMERIC(10, 2)` | YES | `NULL` | Non-negative | Verified copay |
| `deductible_amount` | `NUMERIC(10, 2)` | YES | `NULL` | Non-negative | Annual deductible |
| `coinsurance_pct` | `NUMERIC(5, 4)` | YES | `NULL` | `CHECK (coinsurance_pct >= 0 AND coinsurance_pct <= 1)` | Coinsurance fraction (e.g. 0.2000) |
| `verification_status` | `VARCHAR(25)` | NO | `'UNVERIFIED'` | `CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED_ACTIVE', 'VERIFIED_INACTIVE', 'ERROR'))` | Real-time eligibility state |
| `verified_at` | `TIMESTAMPTZ` | YES | `NULL` | None | Last verification timestamp |
| `verified_by` | `UUID` | YES | `NULL` | `REFERENCES auth.users(id) ON DELETE SET NULL` | Verifying user |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | None | Auto-updated via trigger |

- **Indexes & Constraints**:
  - `CONSTRAINT uq_patient_coverage_order UNIQUE (patient_id, coverage_order);`
  - `CREATE INDEX idx_patient_insurance_patient ON public.patient_insurance_coverages(patient_id);`
  - `CREATE INDEX idx_patient_insurance_payer ON public.patient_insurance_coverages(payer_id);`

---

### 2.7 Table: `public.payer_contracts` & `payer_contract_versions`
Authoritative contractual reimbursement terms, effective dates, and fee schedule linkages.

#### `public.payer_contracts`:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE`
- `payer_id UUID NOT NULL REFERENCES public.payer_master(id) ON DELETE RESTRICT`
- `contract_number VARCHAR(80) NOT NULL`
- `contract_title VARCHAR(255) NOT NULL`
- `reimbursement_methodology VARCHAR(30) NOT NULL CHECK (reimbursement_methodology IN ('PERCENT_OF_MEDICARE', 'COMMERCIAL_FEE_SCHEDULE', 'PERCENT_OF_BILLED_CHARGES', 'CASE_RATE_BUNDLES', 'HYBRID'))`
- `status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'))`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### `public.payer_contract_versions`:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `contract_id UUID NOT NULL REFERENCES public.payer_contracts(id) ON DELETE CASCADE`
- `version_number INTEGER NOT NULL DEFAULT 1`
- `effective_start_date DATE NOT NULL`
- `effective_end_date DATE`
- `medicare_multiplier NUMERIC(6, 4) DEFAULT 1.0000` (e.g. 1.3500 for 135% of Medicare)
- `mppr_rule_set_code VARCHAR(40) NOT NULL DEFAULT 'COM_STD_CASCADE'`
- `device_carve_out_enabled BOOLEAN NOT NULL DEFAULT true`
- `device_invoice_markup_pct NUMERIC(6, 4) DEFAULT 0.1000`
- `notes TEXT`
- `CONSTRAINT uq_contract_version_order UNIQUE (contract_id, version_number)`

---

### 2.8 Table: `public.payer_audit_logs`
Immutable provenance tracking every payer modification, lifecycle status change, and merge event.

- `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `payer_id UUID REFERENCES public.payer_master(id) ON DELETE SET NULL`
- `facility_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL`
- `action VARCHAR(50) NOT NULL` (`CREATE`, `UPDATE_METADATA`, `STATUS_CHANGE`, `ADD_IDENTIFIER`, `MERGE_PAYERS`, `FACILITY_ENABLE`)
- `changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`
- `state_before JSONB`
- `state_after JSONB`
- `change_rationale TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

- **Trigger**: Statement-level immutability trigger `trg_block_payer_audit_modification` blocking `UPDATE` or `DELETE`.
