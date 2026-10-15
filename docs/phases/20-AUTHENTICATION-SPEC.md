# 20 AUTHENTICATION & ACCESS CONTROL SPECIFICATION — ASCANALYST PLATFORM

---

## 1. Purpose and Scope

### 1.1 Purpose
The purpose of this specification is to define the definitive, production-grade **Authentication, Session Management, Role-Based Access Control (RBAC), Multi-Tenancy Identity Isolation, Password Recovery, and Multi-Factor Authentication (MFA) Architecture** for the **ASCANALYST** enterprise ambulatory surgical platform.

Operating in a high-consequence healthcare and financial environment governed by HIPAA Technical Safeguards (45 CFR § 164.308 Administrative Safeguards, 45 CFR § 164.312 Technical Safeguards) and CMS billing regulations, the platform requires:
1. **Zero-Trust Identity Verification**: Strict integration with Supabase GoTrue Auth, eliminating all legacy cleartext credentials and insecure local fallbacks.
2. **Deterministic Facility Tenancy**: Cryptographically bound multi-tenant boundary enforcement via PostgreSQL Row Level Security (RLS) driven by verified JWT claims and facility membership mappings.
3. **Resilient Session Lifecycle Management**: Synchronized authentication state responding to GoTrue session state transitions, token refreshes, idle timeouts, and remote revocation.
4. **Self-Service & Governed Account Lifecycles**: Secure, auditable self-service password reset flows, invitation onboarding, role promotions, and deactivated account lockdowns.
5. **Defense-in-Depth MFA Strategy**: Time-based One-Time Password (TOTP) enforcement for administrative, financial, and clinical director roles, with step-up verification for high-risk operations.

### 1.2 Scope
This specification encompasses:
- Primary identity verification via Supabase GoTrue Auth (`supabase.auth.*`) using JSON Web Tokens (JWT) and secure browser persistence.
- Complete retirement and quarantine of legacy cleartext password columns in `public.users` and `public.surgeons`.
- Deprecation of unauthenticated development fallbacks in staging and production environments.
- Relational schema and lifecycle rules for `public.facility_memberships` linking authenticated users (`auth.users`) to tenant facilities (`public.facilities`).
- Granular, 7-tier Role-Based Access Control matrix across the UI, service layers, and database engines.
- Frontend authentication state machine (`src/App.jsx`), session recovery, and `supabase.auth.onAuthStateChange` synchronization.
- HIPAA-compliant 15-minute idle session termination and automated JWT silent renewal.
- Pre-authentication password recovery workflow (`supabase.auth.resetPasswordForEmail`).
- Multi-Factor Authentication (MFA / TOTP) enrollment, challenge, and verification workflows.
- Immutable audit logging (`public.audit_logs`) for all authentication, credential alteration, and authorization events.
- Unit, integration, RLS policy, and end-to-end verification test specifications.

---

## 2. Current State Audit & Component Classification

A thorough security audit of the repository was conducted against live Supabase project `isutllqthmakvwgduaos`. The findings are classified below using the mandatory **KEEP**, **REFACTOR**, **REPLACE**, and **MISSING** taxonomies.

### 2.1 Current State Classification Table

| Subsystem / Component | Current Repository Location | Classification | Observed State & Technical Deficiencies | Target Production Standard |
| :--- | :--- | :---: | :--- | :--- |
| **Primary GoTrue Auth Client** | [`src/lib/supabase.js:643-691`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L643-L691) | **KEEP / EXTEND** | Executes `supabase.auth.signInWithPassword({ email, password })`. Resolves user metadata and basic memberships. **Deficiency:** Lacks automated token renewal hooks, error classification, and multi-tenant claim injection. | Retain as primary entry point; extend with typed error mapping, custom JWT claims, and event emission. |
| **Development Demo Auth Fallback** | [`src/lib/supabase.js:702-813`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L702-L813) | **REFACTOR** | Queries `public.users` and `public.surgeons` tables. Validates cleartext passwords (`admin123`, `surgeon123`). Accepts ANY password for surgeons with NULL password fields. | Restrict strictly to mock unit test harnesses; completely quarantine and strip cleartext credential checks from runtime code. |
| **Environment Auth Gatekeeper** | [`src/lib/env.js:72-83`](file:///e:/medicalAI/asc-prototype/src/lib/env.js#L72-L83) | **KEEP** | Evaluates `isProduction ? false : env.VITE_ENABLE_DEMO_AUTH === 'true'`. Prohibits demo authentication in production builds. | Retain as hard immutable build barrier. Ensure `.env.example` documents `VITE_ENABLE_DEMO_AUTH`. |
| **Legacy `public.users` Table** | Live Database (`public.users`) | **REPLACE** | Table stores `id int8`, `email text`, and cleartext `password text`. Table currently has Row Level Security disabled (`UNRESTRICTED`). | Drop `public.users` table completely. Migrate identity records to Supabase GoTrue `auth.users`. |
| **Surgeon Table Password Column** | Live Database (`public.surgeons.password`) | **REFACTOR** | Legacy column `password text` on `public.surgeons` stores unhashed strings or nulls. | Execute DDL migration dropping `password` column from `public.surgeons`. Link surgeons to `auth.users` via `surgeon.user_id`. |
| **Login View & Credentials Form** | [`src/components/LoginPage.jsx:1-261`](file:///e:/medicalAI/asc-prototype/src/components/LoginPage.jsx#L1-L261) | **REFACTOR** | Form handles Admin vs Surgeon role selection and fast demo buttons. **Deficiency:** No "Forgot Password" link, no MFA verification view, no lockout warnings. | Add self-service password reset modal, TOTP challenge prompt, and conditional hiding of demo chips based on `ENV.enableDemoAuth`. |
| **Session Persistence & State** | [`src/App.jsx:1042`](file:///e:/medicalAI/asc-prototype/src/App.jsx#L1042), [`src/lib/supabase.js:815-830`](file:///e:/medicalAI/asc-prototype/src/lib/supabase.js#L815-L830) | **REFACTOR** | State relies on `localStorage.getItem('asc_auth_user')`. **Critical Deficiency:** Does not subscribe to `supabase.auth.onAuthStateChange`. Ghost session persists after 1-hour JWT expiration. | Subscribe to `supabase.auth.onAuthStateChange`. Store session in memory synchronized with Supabase client-managed secure tokens. |
| **In-App Password Modification** | [`src/components/UserProfile.jsx:77-145`](file:///e:/medicalAI/asc-prototype/src/components/UserProfile.jsx#L77-L145) | **REFACTOR** | Calls `supabase.auth.updateUser({ password })`. **Deficiency:** Also attempts to update cleartext password column in `public.users` or `public.surgeons`. | Remove SQL update statements for passwords; rely exclusively on `supabase.auth.updateUser({ password })`. |
| **Multi-Tenancy Schema Migration** | [`supabase/migrations/001_multi_tenancy_core.sql`](file:///e:/medicalAI/asc-prototype/supabase/migrations/001_multi_tenancy_core.sql) | **KEEP / DEPLOY** | Complete DDL for `organizations`, `facilities`, and `facility_memberships` with helper functions. **Deficiency:** Unapplied on live Supabase instance. | Apply migration to live Supabase project to revoke wide-open anonymous access and enforce RLS. |
| **Self-Service Password Recovery** | Entire Repository | **MISSING** | No forgot password workflow, email dispatch, or password reset landing screen exists. | Implement `supabase.auth.resetPasswordForEmail()` flow with dedicated `PasswordResetModal.jsx`. |
| **Multi-Factor Authentication (MFA)** | Entire Repository | **MISSING** | Zero MFA enrollment, verification, or challenge logic exists. | Implement TOTP authenticator enrollment (`supabase.auth.mfa.enroll`) and verification for privileged roles. |
| **Granular UI Role Governance** | [`src/App.jsx:2713-2725`](file:///e:/medicalAI/asc-prototype/src/App.jsx#L2713-L2725) | **REFACTOR** | Binary view branching: `role === 'surgeon'` renders `SurgeonPortal`; all other roles (`biller`, `clinical_director`, `viewer`) receive full ASC Administrator Command Center. | Implement 7-tier role matrix restricting tabs, financial cards, and settings based on user facility role. |
| **Idle Session Auto-Timeout** | Entire Repository | **MISSING** | Sessions remain active indefinitely until explicit logout or browser cache purge (violates HIPAA § 164.312(a)(2)(iii)). | Implement global inactivity monitor auto-logging out after 15 minutes of idle time. |

---

## 3. Target State Architecture

The target production authentication architecture enforces a Zero-Trust, multi-tenant model. Identity verification is entirely decoupled from business logic and delegated to Supabase GoTrue with cryptographically signed JWTs.

```mermaid
graph TD
    subgraph Client_App [Client Presentation Tier (React 19)]
        LoginView[LoginPage.jsx]
        ResetView[PasswordResetModal.jsx]
        MFAView[MFAChallengeModal.jsx]
        AppRoot[App.jsx Auth State Machine]
        SessionMonitor[IdleTimeoutMonitor (15m)]
        RoleGuard[RoleGate & Permission Router]
        
        LoginView -->|1. Credentials| GoTrueClient[Supabase GoTrue SDK]
        ResetView -->|Send Reset Email| GoTrueClient
        MFAView -->|Verify TOTP Token| GoTrueClient
        GoTrueClient -->|2. Session & JWT| AppRoot
        AppRoot --> SessionMonitor
        AppRoot --> RoleGuard
    end

    subgraph Identity_Engine [Supabase Identity Tier (GoTrue)]
        AuthEngine[Supabase GoTrue Engine]
        AuthUsers[(auth.users Ledger)]
        MFAFactors[(auth.mfa_factors)]
        JWTIssuer[Ed25519 / HS256 JWT Generator]

        GoTrueClient --> AuthEngine
        AuthEngine --> AuthUsers
        AuthEngine --> MFAFactors
        AuthEngine --> JWTIssuer
    end

    subgraph Database_Tenancy [PostgreSQL 15+ Multi-Tenant Tier]
        PostgREST[PostgREST API Gateway]
        Memberships[(public.facility_memberships)]
        RLSEngine[Row Level Security Enforcement]
        AuditTrigger[fn_audit_log_trigger]
        AuditLedger[(public.audit_logs)]

        JWTIssuer -->|Bearer JWT| PostgREST
        PostgREST --> RLSEngine
        RLSEngine -->|auth.uid() Lookup| Memberships
        RLSEngine -->|Enforce Tenant Scoping| Tables[(surgeries, patients, cpt_codes, settings)]
        Tables --> AuditTrigger --> AuditLedger
    end
```

### 3.1 Production Identity Principles
1. **No Application-Level Password Storage**: Passwords never touch application tables or client storage. Passwords are salted and hashed with bcrypt/Argon2 strictly within `auth.users`.
2. **Deterministic Role Resolution**: User roles are not stored in mutable client-side tokens. They are dynamically evaluated via `public.facility_memberships` for the currently selected `active_facility_id`.
3. **Fail-Closed Authorization**: If a user lacks an active membership row in `facility_memberships` for a given facility, all database operations return HTTP 403 / empty result sets.
4. **State Machine Synchronization**: React authentication state subscribes to `supabase.auth.onAuthStateChange` to guarantee that token refresh, sign-out, password recovery, and multi-tab state transitions are instantaneously reflected in the UI.

---

## 4. Data Model & Relational Schema

### 4.1 Tenancy & RBAC Schema (`public.facility_memberships`)

The central junction table connecting authenticated identities (`auth.users`) to tenant surgical facilities (`public.facilities`).

```sql
-- Migration: Ensure facility_memberships exists with strict constraints
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

-- Performance indexes for RLS evaluation
CREATE INDEX IF NOT EXISTS idx_memberships_user_active 
    ON public.facility_memberships(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memberships_facility_role 
    ON public.facility_memberships(facility_id, role) 
    WHERE is_active = true;
```

### 4.2 Legacy Table Deprecation & Quarantine DDL

```sql
-- Step 1: Remove cleartext password column from surgeons table
ALTER TABLE public.surgeons DROP COLUMN IF EXISTS password;

-- Step 2: Establish direct foreign key link between surgeons and auth.users
ALTER TABLE public.surgeons 
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_surgeons_user_id ON public.surgeons(user_id);

-- Step 3: Deprecate legacy public.users table (Quarantine and drop)
DROP TABLE IF EXISTS public.users CASCADE;
```

### 4.3 Database RLS Helper Functions

```sql
-- Return set of facility IDs the authenticated user has active membership in
CREATE OR REPLACE FUNCTION public.get_auth_user_facilities()
RETURNS TABLE (facility_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT fm.facility_id
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.is_active = TRUE;
$$;

-- Return user's specific role for a given facility
CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_facility_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT fm.role
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.facility_id = p_facility_id
      AND fm.is_active = TRUE
    LIMIT 1;
$$;

-- Boolean check if authenticated user possesses any of the specified roles in a facility
CREATE OR REPLACE FUNCTION public.user_has_facility_role(p_facility_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.facility_memberships fm
        WHERE fm.user_id = auth.uid()
          AND fm.facility_id = p_facility_id
          AND fm.role = ANY(p_roles)
          AND fm.is_active = TRUE
    );
$$;
```

---

## 5. Role-Based Access Control (RBAC) Matrix

The platform enforces 7 distinct operational tiers. AI analytical agents and background automated jobs operate under the exact same permission boundaries as human actors.

| Role | Operational Scope | Clinical Records (`patients`, `surgeries`) | Financial & Billing (`cpt_codes`, `snapshots`, `margin`) | Administration & Settings (`staff`, `facilities`, `rules`) | Audit Logs (`audit_logs`) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`super_admin`** | Multi-Organization Global System Authority | Full Read/Write | Full Read/Write / Freeze | Full Read/Write / Tenancy Provisioning | Full Read (Immutable) |
| **`org_admin`** | Organization-wide Network Executive | Full Read/Write (Org) | Full Read/Write / Analytics | Full Read/Write (Org Facilities) | Full Read (Org Scope) |
| **`facility_admin`**| ASC Center Administrator / Executive Director | Full Read/Write (Facility) | Full Read/Write / Freeze | Full Read/Write (Facility Scope) | Full Read (Facility Scope) |
| **`clinical_director`**| Chief of Surgery / OR Nurse Director | Full Read/Write (Scheduling, Blocks, Preference Cards) | Read Margin & Volume / No Fee Schedule Edits | Read-Only Settings / Manage Clinical Staff | Full Read (Facility Scope) |
| **`biller`** | Revenue Cycle Specialist / Billing Lead | Read Clinical Data / Write Billing Modifiers | Full Read/Write CPTs, Insurance, Fee Schedules, Freeze Snapshots | No Settings Access | Read-Only Financial Audits |
| **`surgeon`** | Attending Provider (Surgeon Portal) | Read/Write **OWN** Cases, Preference Cards, Schedule | Read **OWN** Financial Contribution Margin | Read-Only Personal Profile | No Audit Access |
| **`viewer`** | Auditor, Regulatory Inspector, Observer | Read-Only (Facility) | Read-Only Anonymized Financial Summaries | No Settings Access | No Audit Access |

---

## 6. Business Rules & Deterministic Execution

### 6.1 Authentication Rules
- **BR-AUTH-01 (Password Complexity)**: Minimum 10 characters. Must contain at least one uppercase letter, one lowercase letter, one numeric digit, and one special symbol (`!@#$%^&*()_+-=[]{}|;:,.<>?`).
- **BR-AUTH-02 (Rate Limiting & Lockout)**: After 5 consecutive failed login attempts on an email address, GoTrue enforces a 15-minute progressive cooldown window.
- **BR-AUTH-03 (Session Lifetime & Refresh)**: Access tokens expire after 3,600 seconds (1 hour). The client SDK initiates silent refresh 5 minutes prior to expiration. Refresh tokens expire after 30 days of inactivity.
- **BR-AUTH-04 (HIPAA Idle Timeout)**: Inactivity for 15 minutes (no mouse movements, keystrokes, or touch events) triggers an automated local session teardown, redirecting the user to `LoginPage.jsx` with an `idle_timeout` notification.
- **BR-AUTH-05 (Facility Tenancy Verification)**: Every business query issued to Supabase PostgREST must be accompanied by an active facility context. If the user does not belong to the requested facility, the query returns HTTP 403 Forbidden.

### 6.2 MFA Business Rules
- **BR-MFA-01 (Mandatory Roles)**: MFA is mandatory for `super_admin`, `org_admin`, `facility_admin`, and `biller` accounts. Initial login initiates an enforced TOTP setup wizard.
- **BR-MFA-02 (Step-Up Authentication)**: Performing high-consequence operations (e.g., executing database disaster recovery, altering CMS billing rules, exporting unredacted patient case logs, or updating payer fee schedules) requires re-verifying a TOTP token within the last 10 minutes.

### 6.3 Surgeon Data Isolation Rules
- **BR-SURG-01 (Zero Cross-Surgeon Exposure)**: An authenticated user with role `surgeon` is strictly prevented from receiving case records, margin figures, or peer data of other attending surgeons over the network API. Filtering must occur at the PostgreSQL RLS tier, never solely in React memory.

---

## 7. API & Service Contracts

### 7.1 Unified Authentication Interface (`src/lib/authService.js`)

```javascript
/**
 * src/lib/authService.js
 * Production Supabase GoTrue authentication and session management contract.
 */
export const authService = {
  /** Authenticate user via Supabase GoTrue */
  async signIn({ email, password }) { /* ... */ },

  /** Sign out and clear all cached credentials and active tenancy context */
  async signOut() { /* ... */ },

  /** Dispatch self-service password reset email */
  async requestPasswordReset(email) { /* ... */ },

  /** Confirm password reset with token from email */
  async confirmPasswordReset({ token, newPassword }) { /* ... */ },

  /** Update current authenticated user password */
  async updatePassword(newPassword) { /* ... */ },

  /** Retrieve currently authenticated user and active facility memberships */
  async getCurrentSession() { /* ... */ },

  /** Enroll in Time-based One-Time Password (TOTP) MFA */
  async enrollMFA() { /* ... */ },

  /** Verify TOTP token challenge */
  async challengeMFA({ factorId, code }) { /* ... */ },

  /** Subscribe to global GoTrue auth state transitions */
  onAuthStateChange(callback) { /* ... */ }
};
```

---

## 8. UI & Workflow Requirements

### 8.1 Screen States and Transitions

```
               [ Unauthenticated User ]
                          │
                          ▼
                  ┌──────────────┐
                  │ LoginPage.jsx│◀─────────────┐
                  └──────┬───────┘              │
                         │                      │
         ┌───────────────┴──────────────┐       │
         │                              │       │
    Valid Credentials             Forgot Password?
         │                              │       │
         ▼                              ▼       │
   MFA Required?               ┌────────────────┴─┐
     ├── YES ──►[ MFA Modal ]  │ResetPasswordModal│
     │                │        └──────────────────┘
     └── NO ──────────┤
                      ▼
         [ Resolve Active Facility ]
                      │
         ┌────────────┴────────────┐
         │                         │
  Role: 'surgeon'            Role: Other Roles
         │                         │
         ▼                         ▼
┌──────────────────┐     ┌──────────────────┐
│SurgeonPortal.jsx │     │CommandCenter.jsx │
│(Scoped Case Logs)│     │(Role-Gated Tabs) │
└──────────────────┘     └──────────────────┘
         │                         │
         └────────────┬────────────┘
                      │
               15 min Inactivity
                      │
                      ▼
             [ Session Auto-Lock ]
```

### 8.2 UI States Mandate
1. **Loading State**: High-contrast, non-flickering skeleton loaders during GoTrue credential handshake (`Authenticating credentials...`).
2. **Error State**: Explicit, HIPAA-compliant error messaging without revealing account existence (e.g., *"Invalid email or password"* rather than *"User not found"*).
3. **Empty / No-Tenancy State**: If an authenticated GoTrue user has no active memberships in `facility_memberships`, display an unauthorized onboarding card: *"Account authenticated but not assigned to an active surgical facility. Contact your ASC Administrator."*
4. **MFA Challenge State**: Polished 6-digit PIN input with automatic focus advancement, error vibration, and recovery code fallback link.

---

## 9. Audit & Provenance Architecture

In strict compliance with 45 CFR § 164.312(b), all identity and access events are recorded in the append-only `public.audit_logs` ledger.

### 9.1 Audited Authentication Events
The following actions trigger an immediate `INSERT` into `public.audit_logs`:
- `AUTH_LOGIN_SUCCESS`: Captured with actor UUID, IP address, and client user-agent.
- `AUTH_LOGIN_FAILED`: Captured with attempted email, IP address, and failure reason code.
- `AUTH_LOGOUT`: Captured with session duration metadata.
- `AUTH_PASSWORD_RESET_REQUESTED`: Captured with target email and requesting IP.
- `AUTH_PASSWORD_RESET_COMPLETED`: Captured with actor UUID and timestamp.
- `AUTH_MFA_ENROLLED`: Captured with actor UUID and factor type (`totp`).
- `AUTH_ROLE_MODIFIED`: Captured with old role, new role, target user, and executing administrator UUID.

---

## 10. QA & Verification Test Suite

Every pull request or migration touching authentication must pass the following test battery:

### 10.1 Automated Test Battery
1. **Unit Tests (`tests/auth.test.js`)**:
   - Validation of password complexity rules (`BR-AUTH-01`).
   - Token expiration and renewal calculation math.
   - Inactive facility membership rejection logic.
2. **Integration Tests (`tests/auth-gotrue.test.js`)**:
   - GoTrue sign-in with valid credentials returns session with valid JWT.
   - GoTrue sign-in with invalid credentials throws `invalid_credentials`.
   - Production environment gatekeeper test: verifies `ENV.enableDemoAuth === false` when `PROD=true`.
3. **Database RLS Tests (`tests/rls-tenancy.test.js`)**:
   - Anonymous client SELECT on `patients`, `surgeries`, and `audit_logs` returns zero rows or 401 error.
   - Authenticated user in Facility A cannot read records belonging to Facility B.
   - Authenticated surgeon cannot read surgical records belonging to peer surgeons.
4. **End-to-End Tests (`tests/e2e/auth-flow.spec.js`)**:
   - Complete login -> Command Center render -> Logout flow.
   - Surgeon login -> Dedicated Surgeon Portal render.
   - 15-minute inactivity trigger simulation -> session auto-lock.

---

## 11. Acceptance Criteria

- [ ] **Static Analysis**: `npm run lint` executes with `0 errors` and `0 warnings`.
- [ ] **Build Validation**: `npm run build` generates production bundle with zero compilation errors.
- [ ] **Automated Tests**: All unit, integration, and RLS test suites pass with 100% success.
- [ ] **Zero Cleartext Credentials**: No passwords exist in `public.users` or `public.surgeons`.
- [ ] **Zero Open Anonymous Policies**: Migration `001_multi_tenancy_core.sql` deployed and verified on live Supabase; anonymous access to clinical tables is blocked.
- [ ] **GoTrue Synchronization**: `App.jsx` cleanly syncs auth state via `onAuthStateChange`.
- [ ] **Surgeon Isolation**: Database RLS prevents cross-surgeon record leakage.
- [ ] **P0/P1 Security Gate**: No unresolved vulnerabilities, token leakages, or bypass vectors exist.

---

## 12. Upstream Dependencies

1. **`13-ENVIRONMENT-AND-CONFIG.md`**: Centralized environment variable validation (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENABLE_DEMO_AUTH`).
2. **`001_multi_tenancy_core.sql`**: Multi-tenancy DDL (`organizations`, `facilities`, `facility_memberships`, RLS helper functions).
3. **`003_audit_and_snapshots.sql`**: Immutable append-only audit ledger (`public.audit_logs`).

---

## 13. Definition of Done (DoD)

This specification is complete **only** when:
1. Migration `001_multi_tenancy_core.sql` is applied to the live database and verified via automated RLS probe.
2. The legacy `public.users` table is dropped and `public.surgeons.password` column is removed.
3. Administrator (`admin@asc.com`) and surgeon seed accounts are registered in Supabase GoTrue `auth.users` with active rows in `public.facility_memberships`.
4. `src/App.jsx` handles GoTrue session lifecycle and idle timeout.
5. All automated unit and regression tests pass in CI.

---

## 14. Implementation Notes & Audit Trail

| Date | Engineer / Agent | Milestone / Change Description |
| :--- | :--- | :--- |
| **2026-10-15** | `@security-auditor` | Completed comprehensive read-only audit of existing authentication implementation against `20_AUTHENTICATION_SPEC.md`. |
| **2026-10-15** | `@security-auditor` | Discovered unapplied migration 001 on live database, exposed plaintext passwords in `public.users`, and identified lack of `onAuthStateChange` synchronization. |
| **2026-10-15** | `@security-auditor` | Authored complete production specification `docs/phases/20-AUTHENTICATION-SPEC.md` defining target architecture, RBAC matrix, and acceptance criteria. |
