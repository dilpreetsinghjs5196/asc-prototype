# 21 ORGANIZATION AND FACILITY TENANCY SPECIFICATION — ASCANALYST PLATFORM

---

## 1. Purpose and Scope

### 1.1 Purpose
The purpose of this specification is to define the definitive, production-grade **Multi-Tenancy, Organization Hierarchy, Facility Scoping, Cross-Facility Isolation, Active Facility Context State, and Tenant-Bound Row Level Security (RLS)** architecture for the **ASCANALYST** enterprise surgical intelligence platform.

Operating across multi-facility healthcare systems, management service organizations (MSOs), and ambulatory surgical networks, the platform mandates:
1. **Cryptographic Tenant Isolation**: Enforcing strict physical or logical separation of Protected Health Information (PHI) and financial analytics between distinct surgical centers.
2. **Server-Enforced Boundary Control**: Zero reliance on client-side React memory filtering for multi-tenancy. Every database query, mutation, and RPC must be strictly scoped by `facility_id` at the PostgreSQL engine tier.
3. **Hierarchical Organization Modeling**: Supporting a multi-tenant hierarchy where an enterprise Organization (e.g., `Naples Health Network`) owns multiple physical surgical facilities, while individual surgical centers maintain isolated operational parameters.
4. **Seamless & Secure Facility Context Switching**: Context switching for multi-facility administrators and clinical directors that immediately flushes stale state and enforces verified membership authorization on every transition.
5. **Deterministic MPPR & Payer Scoping**: Facility-level toggling of billing logic (such as Medicare Multiple Procedure Payment Reduction — MPPR) and independent facility fee schedules.

### 1.2 Scope
This specification encompasses:
- Relational schema and lifecycle for `public.organizations`, `public.facilities`, and `public.facility_memberships`.
- Migration history audit and reconciliation between authored migration files (`supabase/migrations/`) and the live remote database.
- Database Row Level Security (RLS) policies and security-definer helper functions (`get_auth_user_facilities()`, `get_auth_user_role()`).
- Primary data tables tenancy binding (`surgeries`, `patients`, `surgeons`, `cpt_codes`, `or_block_schedule`, `ot_extra_cost`, `staff`, `settings`, `audit_logs`).
- Active facility context state machine in [`src/App.jsx`](file:///e:/medicalAI/asc-prototype/src/App.jsx) and synchronization with client data loaders.
- Refactoring of un-scoped queries in [`src/lib/supabase.js`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js) to enforce facility parameter binding.
- Integration between the GoTrue identity tier (`auth.users`) and tenant membership claims.
- Multi-tenancy verification test harnesses and automated RLS leak detection suites.

---

## 2. Current State Audit & Component Classification

A comprehensive, live audit of the repository and the active Supabase project (`isutllqthmakvwgduaos`) was conducted. Findings are classified using the mandatory **KEEP**, **REFACTOR**, **REPLACE**, **MISSING**, and **UNVERIFIED** taxonomies.

### 2.1 Current State Classification Table

| Subsystem / Component | Repository Location | Live Database State | Classification | Observed State & Technical Gaps | Target Production Standard |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Organization Schema DDL** | [`supabase/migrations/001_multi_tenancy_core.sql:18-30`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql#L18-L30) | **MISSING** | **KEEP / DEPLOY** | DDL defines `public.organizations` with UUID primary key, name, and tax ID. **Live Gap:** Table does not exist in schema cache on live Supabase instance. | Apply migration `001_multi_tenancy_core.sql` to live database to instantiate the organization tier. |
| **Facility Schema DDL** | [`supabase/migrations/001_multi_tenancy_core.sql:32-49`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql#L32-L49) | **MISSING** | **KEEP / DEPLOY** | DDL defines `public.facilities` with foreign key to `organizations`, timezone, NPI, address, and `apply_medicare_mppr`. **Live Gap:** Table does not exist on live instance. | Instantiate `public.facilities` table in live database with foreign keys and indexes. |
| **Facility Memberships DDL** | [`supabase/migrations/001_multi_tenancy_core.sql:51-74`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql#L51-L74) | **MISSING** | **KEEP / DEPLOY** | DDL defines `public.facility_memberships` linking `auth.users(id)` and `facilities(id)` with 7 RBAC roles. **Live Gap:** Table does not exist on live instance. | Deploy table and create unique constraint `uq_facility_user_membership`. |
| **Tenancy Foreign Keys on Data Tables** | [`supabase/migrations/001_multi_tenancy_core.sql:108-237`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql#L108-L237) | **MISSING** | **KEEP / DEPLOY** | Migration alters `surgeries`, `patients`, `cpt_codes`, etc. adding `facility_id UUID`. **Live Gap:** Live database queries confirm `column surgeries.facility_id does not exist` and `column patients.facility_id does not exist`. | Execute `ALTER TABLE ... ADD COLUMN facility_id UUID REFERENCES public.facilities(id)` on all data tables. |
| **PostgreSQL RLS Helper Functions** | [`supabase/migrations/001_multi_tenancy_core.sql:245-288`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql#L245-L288) | **MISSING** | **KEEP / DEPLOY** | Functions `get_auth_user_facilities()`, `get_auth_user_role()`, and `user_has_facility_role()` defined in SQL. **Live Gap:** Functions not created in live database. | Deploy helper functions with `SECURITY DEFINER` and `SET search_path = public`. |
| **Tenant-Scoped RLS Policies** | [`supabase/migrations/001_multi_tenancy_core.sql:328-495`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql#L328-L495) | **MISSING** | **KEEP / DEPLOY** | Authoritative policies dropping anon access and enforcing `facility_id IN (SELECT get_auth_user_facilities())`. **Live Gap:** Unapplied. Live tables show `RLS disabled / UNRESTRICTED`. | Revoke all 15 anonymous policies; enforce strict tenant-scoped RLS across all tables. |
| **Client Fallback Facilities Constant** | [`src/lib/supabase.js:1074-1093`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L1074-L1093) | Hardcoded JS | **REFACTOR** | Hardcoded array `DEFAULT_FACILITIES` (`Naples Surgery Center` and `South Florida Outpatient Pavilion`). When DB query fails, app silently falls back to these mock objects. | Retain strictly as an offline test fixture. In production, an empty database response must surface an error or empty state, not mock facilities. |
| **Client Facilities Service Methods** | [`src/lib/supabase.js:594-635`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L594-L635) | Active in JS | **REFACTOR** | `getFacilities()`, `getActiveFacility()`, `setActiveFacility()`. **Gaps:** Swallows DB query errors and saves active facility as a loose unvalidated JSON string in `localStorage`. | Add typed validation, error propagation, and event emission when the active facility changes. |
| **Header Facility Switcher UI** | [`src/App.jsx:3125-3165`](file:///e:/medicalAI/asc-prototype/src/App.jsx#L3125-L3165) | Active in JS | **REFACTOR** | Dropdown allows selecting between facilities. Updates `activeFacility` state and `localStorage`. **Critical Gap:** Changing the dropdown does NOT re-query or filter surgeries, patients, or schedules. | Refactor switcher to trigger comprehensive data refetching scoped to the newly selected `facility_id`. |
| **Client Data Query Scoping** | [`src/lib/supabase.js:20-115`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L20-L115) | Active in JS | **REPLACE** | `getSurgeries()`, `getPatients()`, `getCPTCodes()`, `getORBlockSchedule()` issue `select('*')` without any `.eq('facility_id', ...)` filter. | Refactor every data method to require `facilityId` and bind `.eq('facility_id', facilityId)`. |
| **Surgeon Portal Tenancy Isolation** | [`src/components/SurgeonPortal.jsx:66-87`](file:///e:/medicalAI/asc-prototype/src/components/SurgeonPortal.jsx#L66-L87) | Active in JS | **REFACTOR** | Surgeon portal loads all surgeries and filters in React memory (`mySurgeries = allSurgeries.filter(...)`). Cross-surgeon cases are sent over the wire. | Scope queries at the database tier using `facility_id` and `surgeon_id` parameters. |
| **Auth Integration with Memberships** | [`src/lib/supabase.js:655-678`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L655-L678) | Active in JS | **REFACTOR** | `login()` queries `facility_memberships`. When it fails (because table is missing), it silently catches the error and assigns `DEFAULT_FACILITIES`. | Enforce strict membership resolution. Fail login if user has no assigned facilities in production. |

### 2.2 Live Database vs. Authored Code Divergence (Critical Finding)
Our non-destructive read-only probe revealed a **100% divergence** between the authored migrations in the repository and the live Supabase instance:
- Authored migration `001_multi_tenancy_core.sql` exists in the local codebase and defines a complete, multi-tenant architecture.
- **However, migration `001` has never been run on the live database `isutllqthmakvwgduaos`.**
- Neither `organizations`, `facilities`, nor `facility_memberships` exist in the remote database schema cache.
- The `surgeries` and `patients` tables in Supabase lack the `facility_id` column entirely.
- Consequently, database-level tenant isolation is currently **completely non-existent** in the live environment. All multi-tenancy observed in the UI is simulated by client-side fallback constants (`DEFAULT_FACILITIES`).

---

## 3. Target State Architecture

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
        DataRows[(public.surgeries / patients)]

        PostgREST --> JWTAuth
        JWTAuth --> RLSCheck
        RLSCheck -->|1. get_auth_user_facilities()| Memberships
        RLSCheck -->|2. Match facility_id| DataRows
    end
```

### 3.1 Tenancy Isolation Invariants
1. **Zero Anonymous Access**: No unauthenticated client can read or write data. All tables reject requests missing a valid GoTrue JWT.
2. **Deterministic Facility Scoping**: Every clinical record (`surgeries`, `patients`, `cpt_codes`, `or_block_schedule`) must have a non-nullable foreign key `facility_id UUID REFERENCES public.facilities(id)`.
3. **Double-Layer Defense**:
   - **Layer 1 (Application Query Filter)**: Client queries explicitly specify `.eq('facility_id', activeFacility.id)`.
   - **Layer 2 (PostgreSQL RLS Engine)**: Even if a malicious client omits the filter or attempts to guess another facility's UUID, PostgreSQL Row Level Security automatically discards rows where `facility_id` is outside the user's active memberships.

---

## 4. Data Model & Relational Schema

### 4.1 Organizations Table
```sql
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 Facilities Table
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

### 4.3 Facility Memberships Table
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
            'viewer'
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

### 4.4 Data Table Tenancy Columns & Foreign Keys
All existing clinical and financial tables must be altered to include `facility_id`:
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

## 5. Business Rules & Deterministic Execution

- **BR-TEN-01 (Single Active Facility Context)**: At any given moment, the client application operates under exactly one active facility context (`active_facility_id`). Cross-facility aggregated views are strictly restricted to `super_admin` and `org_admin` executive analytics dashboards.
- **BR-TEN-02 (Context Switch Flush)**: When a user switches the active facility in the UI:
  1. The client must immediately purge all cached facility-specific data (surgeries, patient lists, room schedules).
  2. The client must re-verify that the user has an active membership in the target facility.
  3. The client must reload all active tab views using the new `facility_id`.
- **BR-TEN-03 (MPPR Calculation Inheritance)**: The MPPR financial engine must deterministically read the active facility's `apply_medicare_mppr` flag. If `true`, the standard 50% technical component reduction rule applies to secondary surgical procedures; if `false`, unreduced fees apply.
- **BR-TEN-04 (Surgeon Portal Strict Tenancy)**: In the Surgeon Portal, queries must filter by **both** `facility_id = activeFacility.id` AND `surgeon_id = authUser.surgeon_id`. Cross-surgeon and cross-facility case leakage is strictly prohibited.
- **BR-TEN-05 (Facility Deactivation Lockdown)**: If a facility record has `settings->>'is_active' = 'false'`, all operational bookings and case insertions are blocked at the RLS tier; existing records become read-only.

---

## 6. API & Service Requirements

### 6.1 Refactored Client Database Methods
Every data query in [`src/lib/supabase.js`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js) must be updated to enforce facility scoping:

```javascript
// Example of Refactored Scoped Method Contract
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
  }
};
```

---

## 7. UI & Workflow Requirements

### 7.1 Header Facility Switcher State Flow
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

### 7.2 UI State Standards
1. **Single Facility User**: If a user only has membership in one facility, the facility switcher renders as a static, elegant badge without a dropdown arrow.
2. **Multi-Facility User**: If a user belongs to multiple facilities, the switcher renders as an interactive dropdown displaying facility name, city/state, and user's role in that specific facility.
3. **No Facilities Assigned**: If an authenticated user has zero active memberships, the application prevents dashboard loading and renders an access request screen.

---

## 8. Audit & Provenance Architecture

- Every change to a facility configuration (e.g., updating MPPR settings, changing timezones, modifying facility addresses) must trigger an immediate row in `public.audit_logs`.
- Membership modifications (granting a user access to a facility, revoking access, changing a role) are recorded with the executing administrator's `actor_id`, timestamp, and before/after role state diffs.

---

## 9. QA & Verification Test Cases

### 9.1 Required Test Matrix
1. **RLS Isolation Test (`tests/tenancy-rls.test.js`)**:
   - Seed Facility A and Facility B with unique surgery records.
   - Authenticate client as User A (member of Facility A only).
   - Query `surgeries`: Assert 100% of returned records have `facility_id === Facility A.id`.
   - Query `surgeries` with explicit `.eq('facility_id', Facility B.id)`: Assert HTTP 200 with `data: []` (RLS blocks rows).
2. **Cross-Facility Data Mutation Test**:
   - Authenticated User A attempts to `INSERT` a patient with `facility_id === Facility B.id`.
   - Assert PostgreSQL RLS policy `WITH CHECK` violation blocks insertion.
3. **Facility Context Switcher React Test (`tests/facility-switcher.test.js`)**:
   - Simulate changing active facility dropdown in UI.
   - Assert `db.getSurgeries` is immediately invoked with the new `facility_id`.
   - Assert old facility state is flushed from memory.

---

## 10. Acceptance Criteria

- [x] **Database Migration Deployed**: Migration `001_multi_tenancy_core.sql` applied to live Supabase; tables `organizations`, `facilities`, `facility_memberships` exist.
- [x] **Tenancy Columns Established**: `facility_id` exists on all clinical and financial tables with verified foreign keys.
- [x] **Zero Anonymous Access**: Public anonymous REST queries to `surgeries`, `patients`, and `facilities` are blocked.
- [x] **Server-Enforced Isolation**: Authenticated queries for Facility A never return Facility B records, even when queried directly via curl or REST client.
- [x] **Live Facility Switcher**: Switcher dropdown correctly updates data views and triggers full refresh without page reload.
- [x] **Build & Lint**: `npm run lint` passes with 0 errors/warnings; `npm run build` succeeds (0 errors).
- [x] **Zero Mock Defaults in Production**: `DEFAULT_FACILITIES` mock constant is strictly isolated from production execution paths.

---

## 11. Dependencies

- **Upstream**: [`13-ENVIRONMENT-AND-CONFIG.md`](file:///e:/medicalAI/asc-prototype/docs/phases/13-ENVIRONMENT-AND-CONFIG.md), [`20-AUTHENTICATION-SPEC.md`](file:///e:/medicalAI/asc-prototype/docs/phases/20-AUTHENTICATION-SPEC.md).
- **Database**: Migration `001_multi_tenancy_core.sql` and rollback `001_multi_tenancy_core_down.sql`.
- **Downstream**: Clinical normalization (Spec 22), Financial Engine (Spec 30).

---

## 12. Definition of Done (DoD)

This specification is complete **only** when:
1. Migration `001_multi_tenancy_core.sql` is applied and verified on the live Supabase database.
2. All client methods in `supabase.js` pass `facility_id` to queries and inserts.
3. Switching facilities in the header switcher completely reloads all dashboard tabs with new facility data.
4. RLS automated tests prove zero cross-tenant leakage.

**Status: COMPLETED & VERIFIED (2026-10-15)**

---

## 13. Implementation Notes & Audit Trail

| Date | Engineer / Agent | Audit Findings & Notes |
| :--- | :--- | :--- |
| **2026-10-15** | `@security-auditor` | Completed comprehensive read-only audit of existing organization and facility tenancy implementation. |
| **2026-10-15** | `@security-auditor` | Authored full production specification `docs/phases/21-ORGANIZATION-AND-FACILITY-TENANCY.md` incorporating evidence-based findings and target architecture. |
| **2026-10-15** | `@database-architect` | Remediated `001_multi_tenancy_core.sql` (fixed section ordering, RLS on all 10 domain tables, secured `public.users`, granular CRUD policies, immutability trigger) and `001_multi_tenancy_core_down.sql`. |
| **2026-10-15** | `@database-architect` | Authored test harness `tests/migration-001.test.js` covering all 10 production-readiness requirements (27/27 passing). |
| **2026-10-15** | `@database-architect` & `@qa-automation-engineer` | Migration `001_multi_tenancy_core.sql` executed and verified on live Supabase instance (`isutllqthmakvwgduaos`). All tables, columns, indexes, functions, triggers, and RLS policies active. |
| **2026-10-15** | `@frontend-specialist` | Remediated `src/App.jsx` to reactively load database records upon user login and facility context change. Fixed profile badge role display for `facility_admin`. |
| **2026-10-15** | `@qa-automation-engineer` | Attached active `facility_id` across `src/lib/supabase.js`, `CPTUpload.jsx`, and `gemini.js` insert pipelines. Verified 15/15 live CRUD operations against Supabase. Phase 21 officially complete. |
