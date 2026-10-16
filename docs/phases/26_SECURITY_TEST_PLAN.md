# 26 SECURITY TEST PLAN — ASCANALYST.AI PLATFORM

---

## Document Control & Metadata

- **Document Identifier**: `DOC-SPEC-PHASE-26-SECURITY-TEST-PLAN`
- **Specification Title**: Enterprise Security Testing, Tenant Isolation, RLS Enforcement, Secret Scanning, Vulnerability Assessment, and Penetration Testing Plan
- **Target Platform**: Supabase PostgreSQL 15+ (Remote Instance: `isutllqthmakvwgduaos` / Node.js 20+ Test Harness / React 19 Frontend)
- **Upstream Dependencies**:
  - `docs/phases/03-CURRENT-DATABASE-AUDIT.md`
  - `docs/phases/20-AUTHENTICATION-SPEC.md`
  - `docs/phases/21-ORGANIZATION-AND-FACILITY-TENANCY.md`
  - `docs/phases/22-RBAC-ROLES-AND-PERMISSIONS.md`
  - `docs/phases/23_RLS_SECURITY_POLICIES.md`
  - `docs/phases/24_AUDIT_LOGGING_SPEC.md`
  - `docs/phases/25_SECURITY_PRIVACY_HIPAA.md`
  - `supabase/migrations/001_multi_tenancy_core.sql`
  - `supabase/migrations/002_rbac_roles_and_permissions.sql`
  - `supabase/migrations/003_audit_and_snapshots.sql`
  - `supabase/migrations/004_audit_logging_hardening.sql`
  - `supabase/migrations/005_security_privacy_hipaa.sql`
- **Classification**: Enterprise Healthcare Security Standard (HIPAA Security Rule / OWASP Top 10 2025 / NIST SP 800-53 / CIS Benchmark)
- **Status**: Production Engineering Specification & Comprehensive Audit Report
- **Author**: ASCANALYST Security & Quality Engineering Team
- **Date**: 2026-10-16

---

## 1. Purpose

The purpose of this specification is to establish the definitive **Security Testing Architecture and Verification Plan** for the **ASCANALYST.AI** enterprise clinical and surgical intelligence platform.

Under federal healthcare regulations—including the **HIPAA Security Rule (45 CFR Part 164, Subpart C)**, **HITECH Act**, and **OWASP Top 10 (2025)**—ambulatory surgery centers must validate and verify that technical safeguards prevent unauthorized access, cross-tenant data leakage, privilege escalation, secret exfiltration, and tampered audit records.

This test plan formalizes seven mandatory security domains:
1. **Organization and Facility Tenant Isolation**: Proving absolute isolation across tenant boundaries under all circumstances.
2. **Row Level Security (RLS) CRUD Enforcement**: Verifying that `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations on all tables are strictly bound by active facility tenancy and role authorization.
3. **Role-Based Access Control (RBAC) & Anti-Escalation**: Validating all 10 canonical roles and ensuring unprivileged actors cannot elevate their memberships or bypass permissions.
4. **AI Tool Authorization & Secret Protection**: Verifying that external LLMs receive zero cleartext PHI and that AI API keys cannot be harvested by unprivileged client sessions.
5. **Secret Scanning & Dependency Vulnerabilities**: Automated static and dynamic scanning for leaked credentials, private keys, and vulnerable third-party dependencies (`npm audit`).
6. **Audit Logging & Tamper Resistance**: Proving that sensitive events (clinical updates, financial sign-offs, bulk data exports, authentication changes) create immutable records that cannot be forged or deleted.
7. **Regression & End-to-End Security Testing**: Continuous automated verification that prevents security regressions in production CI/CD pipelines.

---

## 2. Scope

- **Database Entities (18 Tables)**:
  - Multi-tenancy: `organizations`, `facilities`, `facility_memberships`
  - Clinical Operations: `patients`, `surgeries`, `surgeons`, `staff`, `or_block_schedule`
  - Financial & Catalog: `cpt_codes`, `ot_extra_cost`, `financial_snapshots`, `settings`
  - Security & Audit: `audit_logs`, `roles`, `permissions`, `role_permissions`
  - Legacy Quarantine: `users`
- **Application Services & Hooks**:
  - `src/lib/supabase.js`: Query scoping, session handling, audit dispatching, credential protection.
  - `src/lib/rbacService.js`: Role normalization, permission catalog, client-side authorization.
  - `src/utils/phiMasking.js`: Minimum necessary masking, regex de-identification for AI.
  - `src/hooks/useInactivityTimeout.js`: Workstation session lifecycle management.
  - `src/lib/gemini.js`: Prompt sanitizer and model fallback engine.
- **Client Components**:
  - `App.jsx`, `Chatbot.jsx`, `AuditLogViewer.jsx`, `MultiAgentConsole.jsx`, `StaffManagement.jsx`, `SurgeryScheduler.jsx`, `Settings.jsx`, `UserProfile.jsx`, `RoleGate.jsx`.
- **Environment & Secrets**:
  - `.env`, `.env.example`, `.gitignore`, client-side bundle exposure vectors.

---

## 3. Current State: Forensic Audit & Component Classification

Every security component in the repository and database has been audited and classified:

| Security Component | File / Database Location | Current Implementation & Behavior | Classification | Target Action for Phase 26 |
| :--- | :--- | :--- | :---: | :--- |
| **Facility Tenancy Enforcement** | `supabase/migrations/001_multi_tenancy_core.sql` & `005_security_privacy_hipaa.sql` | `facility_id` enforced `NOT NULL` on `patients` and `surgeries`. RLS policies filter rows by `get_auth_user_facilities()`. Unique compound index `uq_patients_facility_mrn` prevents cross-patient collisions. | **KEEP** | Author automated multi-tenant isolation unit tests proving cross-tenant queries return 0 rows. |
| **Facility Relocation Triggers** | `trg_prevent_facility_relocation_*` on clinical tables | Blocks changing `facility_id` on existing records to prevent illicit data transfer across facilities. | **KEEP** | Add test asserting that attempting to update `facility_id` throws a PostgreSQL trigger exception. |
| **Client Query Scoping** | `src/lib/supabase.js` (`getPatients`, `getSurgeries`, `getORBlockSchedule`) | Scopes queries by `.eq('facility_id', activeFacility.id)` as defense-in-depth before RLS. | **KEEP** | Verify in automated test harness that client queries remain strictly tenant-scoped. |
| **RLS Anonymous Access Revocation** | Migrations 001, 004, 005 | `REVOKE ALL ON ALL TABLES FROM anon;` executed. Anonymous users have 0 table access. | **KEEP** | Add explicit test asserting anon client role receives `401/403` or empty sets on all endpoints. |
| **RLS DELETE Protection** | Clinical & operational tables | `DELETE` policy restricted to `['super_admin', 'org_admin', 'facility_admin']`. Schedulers, billers, surgeons, and viewers cannot delete patients, surgeries, or staff. | **KEEP** | Build automated tests verifying unauthorized roles are blocked from deleting records. |
| **Audit Log Immutability** | `public.audit_logs` & `fn_prevent_audit_log_mutation()` | Zero `INSERT`, `UPDATE`, or `DELETE` policies for clients. Trigger raises exception on any `UPDATE` or `DELETE` attempt. | **KEEP** | Implement automated test attempting direct mutation of `audit_logs` to prove immutability. |
| **Export Audit Telemetry** | `public.fn_log_export_audit_event()` | Server-side RPC requires authenticated user and active facility membership. Automatically logged on CSV/PDF downloads. | **KEEP** | Add automated test verifying export audit events are recorded with proper metadata. |
| **Legacy Plaintext User Quarantine** | `public.users` table | `REVOKE ALL ON public.users FROM anon, authenticated;` applied in Migration 005. | **KEEP** | Add static and runtime test verifying `public.users` is inaccessible via PostgREST. |
| **Surgeon Plaintext Password** | `public.surgeons.password` | Dropped in Migration 005. `addSurgeon` and `updateSurgeon` strip `password` from payload. | **KEEP** | Add test asserting surgeon operations succeed without requiring or persisting plaintext passwords. |
| **AI Prompt De-Identification** | `src/utils/phiMasking.js` & `src/lib/gemini.js` | `deidentifyTextForAI()` strips SSNs, phone numbers, email addresses, MRNs, and DOBs before AI calls. | **KEEP** | Add automated test asserting regex coverage on obfuscated and varied PHI patterns. |
| **AI Context Patient Stripping** | `src/components/Chatbot.jsx` | Cleartext patient rosters removed; replaced by aggregate counts. | **KEEP** | Maintain static contract test verifying no patient names or MRNs are concatenated into AI context. |
| **Inactivity Auto-Logoff** | `src/hooks/useInactivityTimeout.js` & `App.jsx` | 15-minute idle threshold with 60-second warning modal. Clears storage and logs `SYSTEM` logout event. | **KEEP** | Verify timeout lifecycle and storage purging in test suite. |
| **Settings Table API Key Exposure** | `public.settings` table & `Settings.jsx` | `gemini_api_key` is stored in `public.settings`. Policy `"Tenant Scoped Settings Read"` allows all authenticated facility users to read `settings.*`. | **REFACTOR** | Identify as an architectural vulnerability. Author security test verifying need for server-side proxy or column-level protection so non-admins cannot read raw API keys. |
| **Third-Party Dependency Vulnerabilities** | `package.json` (`xlsx@0.18.5`, `dompurify@3.0.6`) | `npm audit` reveals 8 vulnerabilities (6 high severity, including SheetJS prototype pollution & ReDoS). | **REFACTOR** | Document CVE details, risk assessment, and mitigation plan (isolate file parsing or migrate to secure alternatives). |
| **Client-Side Secret Exposure Risk** | `VITE_GEMINI_API_KEY` in build bundle | Environment variables prefixed with `VITE_` are embedded in client JS chunks (`dist/assets/`). | **REFACTOR** | Verify in secret scan tests; mandate Edge Function backend proxy for production deployments. |
| **Automated Security Test Suite** | `tests/` directory | 8 test suites (87 tests) exist for RBAC, tenancy basics, and Phase 25 HIPAA rules, but lacks dedicated end-to-end security test suite covering all 7 OWASP/RLS domains. | **MISSING → IMPLEMENTED** | Author `tests/security-e2e-audit.test.js` covering all 7 domains deterministically. |

---

## 4. Target State Architecture

1. **Multi-Tenant Fortress**:
   - Zero cross-tenant leakage. Any attempt by an authenticated user in Facility A to read or manipulate records in Facility B returns an empty set or a permission error.
   - Insertion of orphaned clinical records (`facility_id IS NULL`) is blocked at both the database constraint tier and the client validation tier.
2. **Defensive RLS Grid**:
   - All 18 database tables maintain active RLS.
   - Write actions (`INSERT`, `UPDATE`, `DELETE`) are verified against role permission matrices.
   - Table-level and column-level privileges ensure that sensitive tables (like `audit_logs` and `surgery_financial_snapshots`) cannot be mutated or truncated by any application role.
3. **Privilege Escalation Defenses**:
   - Memberships in `facility_memberships` can only be granted, modified, or revoked by users with `super_admin`, `org_admin`, or `facility_admin` roles.
   - Non-admin users cannot alter their own `role` field.
4. **Server-Side Secret Isolation**:
   - External LLM API keys must never be exposed to browser clients or unprivileged roles.
   - Production deployments use Supabase Edge Functions / Vault to mediate AI completions.
5. **Vulnerability & Secret Hygiene**:
   - Clean `.gitignore` and CI/CD secret scanning preventing credentials from entering git history.
   - Vulnerability governance tracking known third-party risks (`xlsx`, `dompurify`).
6. **Continuous Security Regression Harness**:
   - Automated test suite executed on every commit (`npm test`), testing multi-tenancy, RLS policies, RBAC matrices, and data sanitization.

---

## 5. Prioritized Security Test Plan (The 7 Domains)

### Domain 1: Organization and Facility Tenant Isolation
- **Test 1.1**: Cross-Tenant Read Isolation — Verify that User in Facility 1 cannot read patients or surgeries from Facility 2.
- **Test 1.2**: Cross-Tenant Write Isolation — Verify that an actor cannot insert a clinical record into a facility where they lack active membership.
- **Test 1.3**: Orphaned Record Rejection — Verify that attempting to insert a patient or surgery with `facility_id = NULL` violates database `NOT NULL` constraints.
- **Test 1.4**: Anti-Relocation Trigger Verification — Verify that attempting to update `facility_id` on an existing patient, surgery, or staff record is blocked by `trg_prevent_facility_relocation_*`.

### Domain 2: RLS SELECT, INSERT, UPDATE, and DELETE Enforcement
- **Test 2.1**: Complete Anonymous Lockdown — Verify that all tables reject unauthenticated (`anon`) queries.
- **Test 2.2**: Clinical Record Delete Protection — Verify that roles without deletion rights (`scheduler`, `surgeon`, `biller`, `coder`, `viewer`) cannot execute `DELETE` queries on `patients`, `surgeries`, or `staff`.
- **Test 2.3**: Financial Data Manipulation Gate — Verify that `ot_extra_cost` can only be updated by authorized financial roles (`super_admin`, `org_admin`, `facility_admin`, `cfo`, `biller`).
- **Test 2.4**: Audit Log Append-Only Guarantee — Verify that `audit_logs` rejects all client `INSERT`, `UPDATE`, and `DELETE` queries.

### Domain 3: RBAC Authorization & Privilege Escalation Prevention
- **Test 3.1**: Canonical Role Normalization — Verify that legacy role strings deterministically map to the 10 canonical roles.
- **Test 3.2**: Privilege Self-Escalation Attack — Verify that an authenticated user with `viewer` role cannot insert or update a record in `facility_memberships` to grant themselves `facility_admin` or `super_admin`.
- **Test 3.3**: Granular Permission Enforcement — Verify that `rbacService.hasPermission()` correctly evaluates specific permission codes, domain wildcards (`admin.*`, `*`), and denies unauthorized actions.

### Domain 4: AI Tool Authorization & Secret Protection
- **Test 4.1**: Multi-Pattern PHI De-Identification — Verify that `deidentifyTextForAI()` scrubs SSNs (standard and dashed), phone numbers, email addresses, MRNs, and DOB patterns.
- **Test 4.2**: Chatbot Context Sanitization — Verify statically and dynamically that `Chatbot.jsx` eliminates cleartext patient roster injection.
- **Test 4.3**: MultiAgent AI Provenance — Verify that AI multi-agent simulation bookings emit an `AI_ANALYSIS` audit event with `source: 'AI_AGENT'` and sanitized parameters.
- **Test 4.4**: Settings Key Exposure Analysis — Document and test that sensitive keys stored in `settings` are protected against unprivileged inspection.

### Domain 5: Secret Scanning & Dependency Vulnerability Checks
- **Test 5.1**: Git Secret Protection — Verify that `.gitignore` strictly excludes `.env`, `.env.local`, `.pem`, `.key`, and credential files.
- **Test 5.2**: Static Codebase Secret Scan — Verify that zero live API keys (Google `AIza*`, Supabase service role keys, private RSA keys) are hardcoded in `src/`.
- **Test 5.3**: Dependency Audit Baseline — Execute `npm audit` and catalogue all known CVEs, severity levels, and mitigation roadmaps.

### Domain 6: Audit Logging & Sensitive Action Protection
- **Test 6.1**: Database Audit Trigger Integrity — Verify that clinical and financial mutations generate trigger logs containing before/after diffs and actor identifiers.
- **Test 6.2**: Anti-Impersonation RPC Gate — Verify that `fn_log_manual_audit_event` and `fn_log_export_audit_event` enforce `auth.uid()` and reject spoofed `actor_id` values.
- **Test 6.3**: Tamper-Proof Audit Immutability — Verify that `fn_prevent_audit_log_mutation()` raises an uncatchable exception if any process attempts to alter or delete audit rows.

### Domain 7: Regression & End-to-End Security Testing
- **Test 7.1**: Test Suite Execution — Verify that all test suites pass with 0 failures under `npm test`.
- **Test 7.2**: Production Build Verification — Verify that `npm run build` compiles without syntax errors or bundle export failures.
- **Test 7.3**: Non-Destructive Fixture Safety — Verify that test scripts use isolated mock structures or non-production IDs, never touching live patient data.

---

## 6. Acceptance Criteria

- [x] Complete forensic audit of existing repository and database.
- [x] KEEP, REFACTOR, REPLACE, MISSING matrix fully documented.
- [x] Comprehensive test specification authored in `docs/phases/26_SECURITY_TEST_PLAN.md`.
- [x] Automated test suite `tests/security-e2e-audit.test.js` authored and verified.
- [x] 100% test pass rate across all suites (`npm test`).
- [x] Zero regressions against Phase 21, 22, 23, 24, and 25 functionality.
- [x] Production build passes (`npm run build`).

---

## 7. Dependencies & Upstream Migrations

1. `supabase/migrations/001_multi_tenancy_core.sql` (Tenancy schema, base RLS, triggers)
2. `supabase/migrations/002_rbac_roles_and_permissions.sql` (Canonical roles, permissions catalog, RPCs)
3. `supabase/migrations/004_audit_logging_hardening.sql` (Trigger diffing, sanitization, anti-impersonation)
4. `supabase/migrations/005_security_privacy_hipaa.sql` (NOT NULL tenancy, unique MRN, password drop, export RPC)

---

## 8. Definition of Done

Phase 26 is complete when:
1. The forensic security audit is fully completed and reported.
2. The prioritized test plan covering all 7 domains is defined and implemented.
3. Automated test assertions validate each domain deterministically.
4. All tests pass with zero failures and production build succeeds.
5. All identified blockers, dependency CVEs, and architectural risks are documented with clear mitigation strategies.

---

## 9. Implementation Notes & Execution Evidence

### 9.1 Exact Test Files Authored & Verified

1. **`tests/security-e2e-audit.test.js`**:
   - Primary Phase 26 test suite containing 26 assertions across all 7 security domains.
   - Verifies DDL constraints, compound indices, RLS policies, RBAC wildcards and hierarchies, AI de-identification, secret handling, audit triggers, and down migration safety.
2. **`tests/security-hipaa-audit.test.js`**:
   - Phase 25 HIPAA and security test suite containing 22 assertions.
3. **`tests/rbac-service.test.js`**, **`tests/financial-snapshots.test.js`**, **`tests/audit-logging.test.js`**, **`tests/tenancy-audit.test.js`**:
   - Regression suites for Phases 21 through 24.

### 9.2 Actual Test Commands Executed

```bash
# 1. Run the Phase 26 End-to-End Security Audit Test Suite
node --test tests/security-e2e-audit.test.js

# Output Evidence:
# TAP version 13
# 1..1
# # tests 26
# # suites 8
# # pass 26
# # fail 0
# # cancelled 0
# # duration_ms 524.1055

# 2. Run Complete Platform Test Suite
npm test

# Output Evidence:
# 1..24
# # tests 113
# # suites 16
# # pass 113
# # fail 0
# # duration_ms 1389.0724

# 3. Production Build Compilation Check
npm run build

# Output Evidence:
# ✓ built in 5.25s
# dist/assets/index-BoQl7onZ.js  2,402.86 kB │ gzip: 674.18 kB
# Exit Code: 0
```

### 9.3 Forensic Audit Findings & Implemented Remediations

1. **Settings Table API Key Exposure (REMEDIATED)**:
   - **Original Finding**: In `001_multi_tenancy_core.sql`, the RLS policy `"Tenant Scoped Settings Read"` permitted any authenticated user assigned to a facility to execute `SELECT * FROM public.settings`.
   - **Implemented Remediation**:
     - Authored Supabase Edge Function `supabase/functions/gemini-proxy/index.ts` with GoTrue JWT authentication, active `facility_memberships` verification, payload size validation, and server-side invocation via `GEMINI_API_KEY`.
     - Authored Migration `006_deprecate_settings_api_key.sql` and rollback script `006_deprecate_settings_api_key_down.sql` dropping `public.settings.gemini_api_key` and tightening RLS policies.
     - Updated `src/lib/gemini.js` to route requests through `supabase.functions.invoke('gemini-proxy')`.
     - Updated `src/lib/supabase.js` `getSettings()` to explicitly select non-sensitive configuration columns only.
     - Updated `src/components/Settings.jsx` to replace client key inputs with a server-managed proxy status panel.
2. **Third-Party Spreadsheet Dependency Vulnerabilities (REMEDIATED)**:
   - **Original Finding**: `xlsx@0.18.5` contained Prototype Pollution (CVE-2023-30533, GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9) with no upstream patch on public npm registry.
   - **Implemented Remediation**:
     - Upgraded `xlsx` in `package.json` to the official vendor release `"https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.
     - Reinstalled and audited: both CVE-2023-30533 and GHSA-5pgg-2g8v-p4x9 completely eliminated from `npm audit`.
     - Verified spreadsheet parsing compatibility in `excelParser.js`, `CPTUpload.jsx`, and `OTCostManagement.jsx`.
3. **Client-Side Secret Bundling**:
   - **Remediation**: Decoupled browser runtime from direct API secrets. Production instances use the server-side Edge Function proxy rather than client-held API keys.
