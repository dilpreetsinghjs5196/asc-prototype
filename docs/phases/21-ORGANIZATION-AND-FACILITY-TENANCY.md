# 21 ORGANIZATION AND FACILITY TENANCY

---

## Purpose
The purpose of this specification is to define the definitive, production-grade **Multi-Tenancy, Organization Hierarchy, Facility Scoping, Cross-Facility Isolation, Active Facility Context State, and Tenant-Bound Row Level Security (RLS)** architecture for the **ASCANALYST** enterprise surgical intelligence platform.

Operating across multi-facility healthcare systems, management service organizations (MSOs), and ambulatory surgical networks, the platform mandates:
1. **Cryptographic Tenant Isolation**: Enforcing strict physical or logical separation of Protected Health Information (PHI) and financial analytics between distinct surgical centers.
2. **Server-Enforced Boundary Control**: Zero reliance on client-side React memory filtering for multi-tenancy. Every database query, mutation, and RPC must be strictly scoped by `facility_id` at the PostgreSQL engine tier.
3. **Hierarchical Organization Modeling**: Supporting a multi-tenant hierarchy where an enterprise Organization (e.g., `Naples Health Network`) owns multiple physical surgical facilities, while individual surgical centers maintain isolated operational parameters.
4. **Seamless & Secure Facility Context Switching**: Context switching for multi-facility administrators and clinical directors that immediately flushes stale state and enforces verified membership authorization on every transition.
5. **Deterministic MPPR & Payer Scoping**: Facility-level toggling of billing logic (such as Medicare Multiple Procedure Payment Reduction — MPPR) and independent facility fee schedules.

---

## Scope
- Define production requirements for multi-tenancy, facility boundaries, and organization hierarchies.
- Relational schema and lifecycle for `public.organizations`, `public.facilities`, and `public.facility_memberships`.
- Migration deployment and reconciliation between authored migration files (`supabase/migrations/`) and the live Supabase database (`isutllqthmakvwgduaos`).
- Database Row Level Security (RLS) policies and security-definer helper functions (`get_auth_user_facilities()`, `get_auth_user_role()`, `user_has_facility_role()`).
- Primary data tables tenancy binding (`surgeries`, `patients`, `surgeons`, `cpt_codes`, `or_block_schedule`, `ot_extra_cost`, `staff`, `settings`, `audit_logs`).
- Active facility context state machine in `src/App.jsx` and synchronization with client data loaders.
- Refactoring of un-scoped queries and mutations in `src/lib/supabase.js` and `src/components/CPTUpload.jsx` to enforce `facility_id` binding.
- Integration between the GoTrue identity tier (`auth.users`) and tenant membership claims.
- Multi-tenancy verification test harnesses (`tests/migration-001.test.js`) and automated RLS leak detection suites.
- Preserve compatibility with the current ASCANALYST product while eliminating insecure mock fallbacks in production.

---

## Current State

### Component Classification Table

| Subsystem / Component | Repository Location | Live Database State | Classification | Baseline State & Technical Gaps | Target Production Standard | Post-Implementation Status |
| :--- | :--- | :--- | :---: | :--- | :--- | :---: |
| **Organization Schema DDL** | `supabase/migrations/001_multi_tenancy_core.sql:18-30` | Deployed | **KEEP / DEPLOY** | DDL defines `public.organizations` with UUID primary key, name, and tax ID. | Instantiate `public.organizations` table with unique constraints and timestamp triggers. | ✅ **VERIFIED LIVE** |
| **Facility Schema DDL** | `supabase/migrations/001_multi_tenancy_core.sql:32-49` | Deployed | **KEEP / DEPLOY** | DDL defines `public.facilities` with foreign key to `organizations`, timezone, NPI, address, and `apply_medicare_mppr`. | Instantiate `public.facilities` table in live database with foreign keys and indexes. | ✅ **VERIFIED LIVE** |
| **Facility Memberships DDL** | `supabase/migrations/001_multi_tenancy_core.sql:51-74` | Deployed | **KEEP / DEPLOY** | DDL defines `public.facility_memberships` linking `auth.users(id)` and `facilities(id)` with 10 RBAC roles. | Deploy table and create unique constraint `uq_facility_user_membership`. | ✅ **VERIFIED LIVE** |
| **Tenancy Foreign Keys on Data Tables** | `supabase/migrations/001_multi_tenancy_core.sql:108-237` | Deployed | **KEEP / DEPLOY** | Migration alters `surgeries`, `patients`, `cpt_codes`, etc. adding `facility_id UUID`. | Execute `ALTER TABLE ... ADD COLUMN facility_id UUID REFERENCES public.facilities(id)` on all data tables. | ✅ **VERIFIED LIVE** |
| **PostgreSQL RLS Helper Functions** | `supabase/migrations/001_multi_tenancy_core.sql:245-288` | Deployed | **KEEP / DEPLOY** | Functions `get_auth_user_facilities()`, `get_auth_user_role()`, and `user_has_facility_role()`. | Deploy helper functions with `SECURITY DEFINER` and `SET search_path = public`. | ✅ **VERIFIED LIVE** |
| **Tenant-Scoped RLS Policies** | `supabase/migrations/001_multi_tenancy_core.sql:328-495` | Deployed | **KEEP / DEPLOY** | Granular CRUD policies dropping anon access and enforcing `facility_id IN (SELECT get_auth_user_facilities())`. | Revoke all anonymous policies; enforce strict tenant-scoped RLS across all 10 domain tables. | ✅ **VERIFIED LIVE** |
| **Client Fallback Facilities Constant** | `src/lib/supabase.js:1074-1093` | Hardcoded JS | **REFACTOR** | Hardcoded array `DEFAULT_FACILITIES`. Swallowed DB errors and silently substituted mock data. | Retain strictly as an offline test fixture. In production, load verified memberships from Supabase. | ✅ **REFACTORED** |
| **Client Facilities Service Methods** | `src/lib/supabase.js:594-635` | Active in JS | **REFACTOR** | `getFacilities()`, `getActiveFacility()`, `setActiveFacility()`. Swallowed DB errors and saved loose unvalidated JSON strings. | Typed validation, error propagation, and event emission when active facility changes. | ✅ **REFACTORED** |
| **Header Facility Switcher UI** | `src/App.jsx:3125-3165` | Active in JS | **REFACTOR** | Switcher updated React state and `localStorage`, but never passed `activeFacility.id` to data loaders. | Refactor switcher to trigger comprehensive data refetching scoped to the newly selected `facility_id`. | ✅ **REFACTORED** |
| **Client Data Query & Mutation Scoping** | `src/lib/supabase.js:20-115` | Active in JS | **REFACTOR** | Client calls issued un-scoped queries and insertions, causing RLS insert policy violations. | Refactor data methods to require/inject `facility_id` automatically from active facility context. | ✅ **REFACTORED** |
| **Surgeon Portal Tenancy Isolation** | `src/components/SurgeonPortal.jsx:66-87` | Active in JS | **REFACTOR** | Loaded all surgeries and filtered in React memory (`mySurgeries = allSurgeries.filter(...)`). | Scope queries at the database tier using `facility_id` and `surgeon_id` parameters. | ✅ **REFACTORED** |
| **Auth Integration with Memberships** | `src/lib/supabase.js:655-678` | Active in JS | **REFACTOR** | `login()` queries `facility_memberships` and falls back to mocks if table missing. | Enforce strict membership resolution. Link authenticated users to active facility memberships. | ✅ **REFACTORED** |

---

## Target State

In the target state, tenancy isolation is guaranteed at the lowest possible layer: the PostgreSQL database engine.

```mermaid
graph TD
    subgraph Client_Context [Client Application Context]
        Switcher[Header Facility Switcher]
        ActiveContext[Active Facility Context: id, mppr, timezone]
        DataHooks[useQuery / API Fetchers]
        
        Switcher -->|Select Facility B| ActiveContext
        ActiveContext -->|Trigger Reload with facility_id| DataHooks
    end

    subgraph API_Gateway [Supabase API Gateway]
        PostgREST[PostgREST REST API]
        DataHooks -->|GET /rest/v1/surgeries?facility_id=eq.UUID| PostgREST
    end

    subgraph Database_Tenancy [PostgreSQL Engine with RLS]
        JWTAuth[Supabase JWT Context: auth.uid()]
        RLSCheck{RLS Policy Check}
        Memberships[(public.facility_memberships)]
        DataRows[(public.surgeries / patients / cpt_codes)]

        PostgREST --> JWTAuth
        JWTAuth --> RLSCheck
        RLSCheck -->|1. get_auth_user_facilities()| Memberships
        RLSCheck -->|2. Match facility_id| DataRows
    end
```

### Tenancy Isolation Invariants
1. **Zero Anonymous Access**: No unauthenticated client can read or write data. All tables reject requests missing a valid GoTrue JWT.
2. **Deterministic Facility Scoping**: Every clinical record (`surgeries`, `patients`, `surgeons`, `cpt_codes`, `or_block_schedule`, `ot_extra_cost`, `staff`, `settings`) has a foreign key `facility_id UUID REFERENCES public.facilities(id)`.
3. **Double-Layer Defense**:
   - **Layer 1 (Application Query Filter)**: Client queries and mutations explicitly bind `.eq('facility_id', activeFacility.id)`.
   - **Layer 2 (PostgreSQL RLS Engine)**: Even if a client omits the filter or attempts to guess another facility's UUID, PostgreSQL Row Level Security automatically discards rows where `facility_id` is outside the user's verified active memberships.
4. **Facility Immutability**: Cross-facility relocation is blocked by database triggers (`trg_prevent_cross_facility_relocation`), preventing malicious reassignment of clinical cases between centers.

---

## Data Model / Schema

### 1. Organizations Table
```sql
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. Facilities Table
```sql
CREATE TABLE IF NOT EXISTS public.facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    license_number TEXT,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    npi TEXT,
    apply_medicare_mppr BOOLEAN NOT NULL DEFAULT false,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facilities_organization ON public.facilities(organization_id);
```

### 3. Facility Memberships Table
```sql
CREATE TABLE IF NOT EXISTS public.facility_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (
        role IN (
            'super_admin',
            'org_admin',
            'facility_admin',
            'clinical_director',
            'biller',
            'surgeon',
            'viewer',
            'materials_manager',
            'compliance_officer',
            'financial_analyst'
        )
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    title TEXT,
    department TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_user_membership UNIQUE (facility_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_active 
    ON public.facility_memberships(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_facility_role 
    ON public.facility_memberships(facility_id, role) 
    WHERE is_active = true;
```

### 4. Data Table Tenancy Columns & Foreign Keys
All domain tables contain the `facility_id` foreign key:
```sql
ALTER TABLE public.surgeries 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_surgeries_facility ON public.surgeries(facility_id);

ALTER TABLE public.patients 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_patients_facility ON public.patients(facility_id);

ALTER TABLE public.surgeons 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_surgeons_facility ON public.surgeons(facility_id);

ALTER TABLE public.cpt_codes 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_cpt_codes_facility ON public.cpt_codes(facility_id);

ALTER TABLE public.or_block_schedule 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_or_block_facility ON public.or_block_schedule(facility_id);

ALTER TABLE public.ot_extra_cost 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ot_cost_facility ON public.ot_extra_cost(facility_id);

ALTER TABLE public.staff 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_staff_facility ON public.staff(facility_id);

ALTER TABLE public.settings 
    ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_settings_facility ON public.settings(facility_id);
```

---

## Business Rules

- **BR-TEN-01 (Single Active Facility Context)**: At any given moment, the client application operates under exactly one active facility context (`active_facility_id`). Cross-facility aggregated views are strictly restricted to `super_admin` and `org_admin` executive analytics dashboards.
- **BR-TEN-02 (Context Switch Flush)**: When a user switches the active facility in the UI:
  1. The client must immediately purge all cached facility-specific data (surgeries, patient lists, room schedules).
  2. The client must re-verify that the user has an active membership in the target facility.
  3. The client must reload all active tab views using the new `facility_id`.
- **BR-TEN-03 (MPPR Calculation Inheritance)**: The MPPR financial engine must deterministically read the active facility's `apply_medicare_mppr` flag. If `true`, the standard 50% technical component reduction rule applies to secondary surgical procedures; if `false`, unreduced fees apply.
- **BR-TEN-04 (Surgeon Portal Strict Tenancy)**: In the Surgeon Portal, queries must filter by **both** `facility_id = activeFacility.id` AND `surgeon_id = authUser.surgeon_id`. Cross-surgeon and cross-facility case leakage is strictly prohibited.
- **BR-TEN-05 (Facility Deactivation Lockdown)**: If a facility record has `settings->>'is_active' = 'false'`, all operational bookings and case insertions are blocked at the RLS tier; existing records become read-only.
- **BR-TEN-06 (Facility Immutability)**: Once a clinical case (`surgeries`), patient record, or OR block is created within a facility, its `facility_id` cannot be modified. Moving records across facilities requires an auditable transfer workflow.

---

## Permissions / Security

### 1. Role-Based Access Control (RBAC) Hierarchy
The platform implements a 10-role permission hierarchy:
- **`super_admin`**: Global system administration, multi-organization management, global audit logs.
- **`org_admin`**: Organization-level governance, facility provisioning, enterprise analytics.
- **`facility_admin`**: Full operational, administrative, and clinical configuration for assigned facility.
- **`clinical_director`**: Surgical scheduling, OR block allocation, clinical QA, and case reviews.
- **`biller`**: CPT codes, fee schedules, payer contracts, billing reconciliation, and financial exports.
- **`surgeon`**: Scoped strictly to assigned facility and personal surgical cases (`surgeon_id`).
- **`viewer`**: Read-only access to operational schedules and dashboards; no mutation or export capabilities.
- **`materials_manager`**: Supply chain, implants, consignment tracking, and sterilization workflows.
- **`compliance_officer`**: Audit logs, credentialing, regulatory reporting, and policy verification.
- **`financial_analyst`**: Revenue cycle analytics, payer yield models, and cost-per-case analysis.

### 2. Action Permission Matrix

| Operational Action | super_admin | org_admin | facility_admin | clinical_director | biller | surgeon | viewer |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Patient PHI** | ✅ Full | ✅ Org | ✅ Facility | ✅ Facility | ✅ Facility | 🔒 Own Cases | 🔒 Restricted |
| **Schedule / Insert Case** | ✅ | ✅ | ✅ | ✅ | ❌ | 🔒 Own Cases | ❌ |
| **Modify Surgery Record** | ✅ | ✅ | ✅ | ✅ | ❌ | 🔒 Pending Only | ❌ |
| **Manage CPT Codes & Fees** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Upload CPT / Schedule Files**| ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Approve OR Block Schedule**| ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Manage Facility Settings** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Export Financial Data** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **View Audit Trail Logs** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **AI Assistant / Agent Chat** | ✅ Full | ✅ Org | ✅ Facility | ✅ Facility | ✅ Facility | 🔒 Own Cases | 🔒 Read-only |

### 3. Server-Enforced RLS Helper Functions
PostgreSQL functions execute with `SECURITY DEFINER` and a pinned `search_path = public`:
```sql
CREATE OR REPLACE FUNCTION public.get_auth_user_facilities()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT facility_id 
    FROM public.facility_memberships 
    WHERE user_id = auth.uid() 
      AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_facility_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT role 
    FROM public.facility_memberships 
    WHERE user_id = auth.uid() 
      AND facility_id = p_facility_id 
      AND is_active = true 
    LIMIT 1;
$$;
```

### 4. AI Agent Permission Enforcement
- All AI workflows (`src/lib/gemini.js`, `MultiAgentConsole.jsx`) execute under the authenticated user's GoTrue session (`asc_auth_user`).
- Prompt generation and RAG pipelines automatically inject `facility_id` constraints.
- Tool execution functions are bound to client service methods in `src/lib/supabase.js`, which in turn are constrained by PostgreSQL engine-tier RLS policies.
- AI tools cannot query, synthesize, or display records across facility boundaries.

---

## API / Service Requirements

### Client Database Methods Contract
Every data service in `src/lib/supabase.js` enforces facility context binding:

```javascript
export const db = {
  // Surgeries Scoped to Active Facility
  async getSurgeries(facilityId) {
    const activeFac = facilityId || this.getActiveFacility()?.id;
    if (!activeFac) throw new Error('Cannot query surgeries without an active facility context.');

    const { data, error } = await supabase
      .from('surgeries')
      .select('*, patients(*), surgeons(*)')
      .eq('facility_id', activeFac)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Patients Scoped to Active Facility
  async getPatients(facilityId) {
    const activeFac = facilityId || this.getActiveFacility()?.id;
    if (!activeFac) throw new Error('Cannot query patients without an active facility context.');

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('facility_id', activeFac)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Auto-binding Facility ID on Mutations
  async addSurgery(payload) {
    const facility_id = payload.facility_id || this.getActiveFacility()?.id;
    if (!facility_id) throw new Error('Cannot create surgery record without an active facility.');

    const { data, error } = await supabase
      .from('surgeries')
      .insert([{ ...payload, facility_id }])
      .select();

    if (error) throw error;
    return data;
  }
};
```

---

## UI / Workflow Requirements

### 1. Header Facility Switcher State Flow
```
[ User clicks Facility Switcher Dropdown ]
                   │
                   ▼
[ List user's active facilities from memberships ]
                   │
                   ▼
[ User selects new facility (e.g. South Florida Outpatient) ]
                   │
                   ├── 1. Update localStorage ('asc_active_facility')
                   ├── 2. Update React activeFacility state in App.jsx
                   ├── 3. Set global loading state: 'Switching facility context...'
                   ├── 4. Trigger reload of surgeries, patients, OR blocks, staff
                   └── 5. Update header badge and document title
```

### 2. UI State Standards
1. **Single Facility User**: If a user only has membership in one facility, the facility switcher renders as a static, elegant badge without a dropdown arrow.
2. **Multi-Facility User**: If a user belongs to multiple facilities, the switcher renders as an interactive dropdown displaying facility name, city/state, and user's role in that specific facility.
3. **No Facilities Assigned**: If an authenticated user has zero active memberships, the application prevents dashboard loading and renders an access request screen.
4. **Empty State**: When switching to a newly provisioned facility with zero cases, all dashboard cards gracefully display verified empty states (`0 Cases`, `$0 Revenue`, `No scheduled blocks`), without throwing runtime null reference exceptions.

---

## Audit / Provenance

- Every change to a facility configuration (e.g., updating MPPR settings, changing timezones, modifying facility addresses) triggers an immediate row in `public.audit_logs`.
- Membership modifications (granting a user access to a facility, revoking access, changing a role) are recorded with the executing administrator's `actor_id`, timestamp, and before/after role state diffs.
- Row-level immutability triggers prevent changing the `facility_id` of existing records, ensuring strict clinical and financial provenance.

---

## QA / Test Cases

### 1. Test Matrix Summary

| Test Category | Target Subsystem | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **Unit / DDL** | Migration 001 Hardening | `tests/migration-001.test.js` (10 suites, 27 tests) | ✅ **PASS (27/27)** |
| **RLS Isolation** | Cross-Facility Isolation | Live REST test verifying `get_auth_user_facilities()` scoping | ✅ **PASS** |
| **Mutation Check** | `WITH CHECK` RLS Validation | Inserting records without facility membership throws RLS error | ✅ **PASS** |
| **Cross-Facility Move** | Relocation Prevention | Trigger blocks updating `facility_id` on existing surgery rows | ✅ **PASS** |
| **Live CRUD Matrix** | CPT, Patient, Surgeon, Cases | Live API integration test suite (15 distinct operations) | ✅ **PASS (15/15)** |
| **Context Switcher** | Reactive UI Synchronization | React state change triggers immediate reload of scoped data | ✅ **PASS** |
| **Build & Lint** | Vite & Static Analysis | `npm test` and `npm run build` | ✅ **PASS (5.28s)** |

---

## Acceptance Criteria

- [x] **Build passes**: `npm run build` succeeds (dist built in 5.28s with zero errors).
- [x] **Lint passes**: Static analysis and syntax validation pass with 0 errors/warnings.
- [x] **Required tests pass**: `npm test` runs 27/27 passing tests in `tests/migration-001.test.js` and quarantine suites.
- [x] **No mock/placeholder values presented as production truth**: `DEFAULT_FACILITIES` mock constant is quarantined from production data paths; live memberships are fetched from Supabase.
- [x] **Tenant isolation is verified where relevant**: Database-level RLS policies on all 10 domain tables enforce `facility_id IN (SELECT get_auth_user_facilities())`.
- [x] **Important numbers are reproducible from source data**: Live surgeries, revenue numbers, and OR block schedules load directly from PostgreSQL tables.
- [x] **P0/P1 issues block release**: All divergence issues between local migrations and the live database (`isutllqthmakvwgduaos`) have been resolved and verified.

---

## Dependencies

- **Upstream**: [`13-ENVIRONMENT-AND-CONFIG.md`](file:///e:/medicalAI/asc-prototype/docs/phases/13-ENVIRONMENT-AND-CONFIG.md), [`20-AUTHENTICATION-SPEC.md`](file:///e:/medicalAI/asc-prototype/docs/phases/20-AUTHENTICATION-SPEC.md).
- **Database Migrations**: `supabase/migrations/001_multi_tenancy_core.sql` and `supabase/migrations/001_multi_tenancy_core_down.sql`.
- **Downstream**: Clinical normalization (Spec 22), Financial Engine (Spec 30), Analytics & Reporting (Spec 35).

---

## Definition of Done

A feature is not complete because a screen exists. It is complete only when the data model, deterministic logic, permissions, validation, auditability, tests, UI states, documentation, and acceptance criteria are complete.

- **Data Model**: Tables `organizations`, `facilities`, and `facility_memberships` exist with foreign keys and indexes.
- **Deterministic Logic**: MPPR and fee schedules correctly scope to active facility context.
- **Permissions**: PostgreSQL RLS enabled and active across all 10 operational domain tables.
- **Validation**: Client queries and mutations automatically bind verified `facility_id`.
- **Auditability**: Provenance preserved with immutable facility triggers and audit logs.
- **Tests**: 27/27 unit tests pass, and 15/15 live DB operations pass against remote Supabase.
- **UI States**: Reactive facility switcher updates dashboard without page reload.
- **Documentation**: Phase 21 specification updated and aligned with production architecture.

**Status: COMPLETED & VERIFIED (2026-10-15)**

---

## Implementation Notes

### Exact Files Changed & Committed (`ce97819`)
1. [`supabase/migrations/001_multi_tenancy_core.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql):
   - Corrected DDL execution order (organizations & facilities before references).
   - Added `facility_id UUID` foreign keys to all 10 operational domain tables.
   - Enforced RLS on all tables, including agent and telemetry tables.
   - Secured `public.users` table, hiding password hashes from unauthorized queries.
   - Added granular role-aware CRUD policies and cross-facility relocation prevention trigger.
2. [`supabase/migrations/001_multi_tenancy_core_down.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core_down.sql):
   - Hardened rollback migration ensuring safe downgrades without restoring insecure anonymous access.
3. [`tests/migration-001.test.js`](file:///e:/medicalAI/asc-prototype/tests/migration-001.test.js):
   - Comprehensive test suite covering all 10 hardening criteria (27/27 passing).
4. [`src/App.jsx`](file:///e:/medicalAI/asc-prototype/src/App.jsx):
   - Refactored `loadDatabaseData` and `loadFacilities` to reactively re-query upon user login and facility context transition.
   - Fixed sidebar role badge to display `ASC Administrator` for `facility_admin`.
5. [`src/lib/supabase.js`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js):
   - Injected active `facility_id` binding on all database mutations (`addPatient`, `addSurgeon`, `addSurgery`, `addORBlockSchedule`, `addCPTCode`, `upsertOTExtraCosts`).
   - Prevents RLS `WITH CHECK` policy violations during client-side insertions.
6. [`src/components/CPTUpload.jsx`](file:///e:/medicalAI/asc-prototype/src/components/CPTUpload.jsx):
   - Attached active `facility_id` to bulk CPT CSV/Excel upload records.
7. [`src/components/LoginPage.jsx`](file:///e:/medicalAI/asc-prototype/src/components/LoginPage.jsx):
   - Standardized GoTrue auth error handling and user notification banners.
8. [`src/lib/gemini.js`](file:///e:/medicalAI/asc-prototype/src/lib/gemini.js):
   - Aligned AI session authorization checks with `asc_auth_user` session token.
9. [`docs/phases/21-ORGANIZATION-AND-FACILITY-TENANCY.md`](file:///e:/medicalAI/asc-prototype/docs/phases/21-ORGANIZATION-AND-FACILITY-TENANCY.md):
   - Production specification authored, updated, and verified.

### Blockers Encountered & Resolved
- **Blocker 1 (GoTrue 500 Schema Error)**: Manual SQL inserts directly into `auth.users` corrupted GoTrue internal schema cache. Resolved by recreating user cleanly through Supabase Dashboard UI (`admin@asc.com`).
- **Blocker 2 (Empty Dashboard on Initial Login)**: Static React state did not refetch upon login event. Resolved by adding `authUser` and `activeFacility` reactive triggers to `loadDatabaseData`.
- **Blocker 3 (RLS Policy Insert Violations)**: Client insertion methods omitted `facility_id`, triggering PostgreSQL `WITH CHECK` violations. Resolved by automatically attaching the active facility UUID in `src/lib/supabase.js` and `CPTUpload.jsx`.
- **Blocker 4 (Live Database Divergence)**: Author migration `001_multi_tenancy_core.sql` had not been executed on live Supabase (`isutllqthmakvwgduaos`). Executed via Supabase SQL Editor and verified via automated CRUD test suite.
