# 25 SECURITY, PRIVACY & HIPAA COMPLIANCE SPECIFICATION

---

## Document Control & Metadata

- **Document Identifier**: `DOC-SPEC-PHASE-25-SECURITY-HIPAA`
- **Specification Title**: Security Safeguards, Privacy Controls, Minimum Necessary PHI Governance, and Inactivity Life Cycle
- **Target Platform**: Supabase PostgreSQL 15+ (Remote Instance: `isutllqthmakvwgduaos`) & React 19 Frontend
- **Upstream Dependencies**:
  - `docs/phases/03-CURRENT-DATABASE-AUDIT.md`
  - `docs/phases/21-ORGANIZATION-AND-FACILITY-TENANCY.md`
  - `docs/phases/22-RBAC-ROLES-AND-PERMISSIONS.md`
  - `docs/phases/23_RLS_SECURITY_POLICIES.md`
  - `docs/phases/24_AUDIT_LOGGING_SPEC.md`
  - `supabase/migrations/001_multi_tenancy_core.sql`
  - `supabase/migrations/002_rbac_roles_and_permissions.sql`
  - `supabase/migrations/004_audit_logging_hardening.sql`
- **Classification**: Enterprise Healthcare Security Standard (HIPAA Security Rule / Privacy Rule / HITECH / OWASP 2025)
- **Status**: Production Engineering Specification & Implementation Standard
- **Author**: ASCANALYST Architecture & Security Engineering Team
- **Date**: 2026-10-16

---

## 1. Purpose

The purpose of this specification is to establish the definitive security, privacy, and compliance architecture for the ASCANALYST platform, enforcing:
1. **Protected Health Information (PHI) Governance**: Strict adherence to the HIPAA Privacy Rule (45 CFR § 164.502) and the **Minimum Necessary Rule** (§ 164.514(d)) across all database queries, screens, exports, and background workflows.
2. **AI Privacy & Zero-PHI Guardrails**: Eliminating transmission of unredacted patient identifiers to third-party generative AI models. Providing mathematical and programmatic de-identification prior to external token processing.
3. **Session Lifecycle & Inactivity Termination**: Enforcing HIPAA Technical Safeguards (45 CFR § 164.312(a)(2)(iii) Automatic Logoff) to automatically invalidate dormant sessions after 15 minutes of inactivity on clinical workstations.
4. **Data Exfiltration Defenses & Accounting of Disclosures**: Guarding all bulk CSV, PDF, and database export features with explicit role authorizations and recording append-only audit trail records (§ 164.312(b) / § 164.528).
5. **Multi-Tenancy & Referential Integrity**: Enforcing non-null tenant boundaries on clinical records and eliminating legacy plaintext credential columns from the database.

---

## 2. Scope

- **All 18 Platform Tables** across multi-tenancy, clinical operations, billing, and audit ledgers.
- **Client Storage Governance**: Eradication of sensitive cached clinical states from unencrypted `localStorage` upon session termination.
- **External AI Integrations**: Google Gemini AI model interaction pipeline, prompt sanitizer, and system context generator.
- **Export Channels**: Bulk patient demographic CSV, surgeon directory CSV, staff payroll CSV, and operative notes PDF reports.
- **Database Migrations**: Deployment of Migration 005 (`005_security_privacy_hipaa.sql`) and its reversible rollback script.

---

## 3. Current State vs. Target State

### 3.1 Forensic Component Matrix

| Component | Current State (Pre-Phase 25) | Classification | Target State (Post-Phase 25) |
| :--- | :--- | :---: | :--- |
| **Chatbot Context Generator** | Dumped patient names, DOBs, MRNs, phones, and surgeries into Google Gemini API prompts. | **REPLACE / HARDEN** | Strictly aggregate statistics only. Patient names, MRNs, DOBs, and phone numbers are completely stripped. Zero-PHI disclosure policy enforced. |
| **Chatbot Privacy Badge** | Claimed `"PHI PROTECTED"` while actively streaming cleartext patient records to Gemini API. | **REPLACE** | Accurate compliance badge: `<Lock size={12} /> AI • ZERO-PHI` with explicit disclosure tooltip. |
| **Patient Directory CSV Export** | `handleExportPatients()` dumped 20 unmasked demographic fields without permission check or audit log. | **REFACTOR** | Gated behind `canExport` check (`super_admin`, `org_admin`, `facility_admin`, `clinical_manager`); automatically records audit event via `db.logExportAuditEvent()`. |
| **Staff Directory CSV Export** | Exported employee payroll and contact info to CSV without audit trail. | **REFACTOR** | Automatically emits `EXPORT` event to `public.audit_logs` capturing record count and department metadata. |
| **Surgery Notes PDF Export** | Downloaded clinical pre/post-op findings to PDF without audit trail. | **REFACTOR** | Automatically emits `EXPORT` event to `public.audit_logs` capturing surgery and patient reference IDs. |
| **Session Inactivity Monitor** | Non-existent. Sessions stayed active indefinitely in browser storage. | **MISSING → IMPLEMENTED** | `useInactivityTimeout` hook enforces 15-minute idle cutoff with 60-second warning countdown modal. |
| **PHI Masking Utility** | Non-existent. All roles viewed unmasked MRNs and phones in UI. | **MISSING → IMPLEMENTED** | `src/utils/phiMasking.js` provides deterministic masking for MRN, DOB, phone, and name. |
| **Nullable `facility_id`** | `patients` and `surgeries` allowed NULL `facility_id`. | **REFACTOR** | Migration 005 enforces `ALTER TABLE ... ALTER COLUMN facility_id SET NOT NULL`. |
| **Unique MRN Enforcement** | Duplicate MRNs were permitted within the same facility. | **MISSING → IMPLEMENTED** | Migration 005 deploys `CREATE UNIQUE INDEX uq_patients_facility_mrn ON public.patients (facility_id, LOWER(TRIM(mrn)))`. |
| **Surgeon Plaintext Passwords** | Legacy `password` column remained on `public.surgeons`. | **REPLACE** | Dropped via Migration 005. Surgeons authenticate exclusively via GoTrue `auth.users`. |
| **Legacy `public.users`** | Plaintext table accessible via PostgREST. | **REPLACE** | Decommissioned and completely revoked from `anon` and `authenticated` roles. |

---

## 4. Data Model & Schema Changes (Migration 005)

### 4.1 Schema DDL Summary

```sql
-- 1. Enforce Non-Null Facility Tenancy
ALTER TABLE public.patients ALTER COLUMN facility_id SET NOT NULL;
ALTER TABLE public.surgeries ALTER COLUMN facility_id SET NOT NULL;

-- 2. Prevent Cross-Patient Record Collisions
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_facility_mrn 
ON public.patients (facility_id, LOWER(TRIM(mrn))) 
WHERE mrn IS NOT NULL AND TRIM(mrn) <> '';

-- 3. Eliminate Plaintext Credentials
ALTER TABLE public.surgeons DROP COLUMN IF EXISTS password;
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.users FROM authenticated;

-- 4. Deploy Dedicated Export Audit RPC
CREATE OR REPLACE FUNCTION public.fn_log_export_audit_event(
    p_export_type TEXT,
    p_table_name TEXT,
    p_record_count INT,
    p_facility_id UUID DEFAULT NULL,
    p_filter_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;
```

---

## 5. Business Rules & Enforcement Mechanics

1. **AI Zero-PHI Rule**:
   - Under no circumstances may an external LLM receive unredacted patient names, MRNs, contact telephone numbers, home addresses, or dates of birth.
   - Clinical context provided to AI assistants must be aggregated (e.g. "Total Patients Registered: 42") or pseudonymized.
   - Individual patient inquiries must redirect the clinician to the authenticated Patient Registry.

2. **Session Inactivity Lifespan (45 CFR § 164.312(a)(2)(iii))**:
   - Workstation inactivity timer is capped at 15 minutes (900,000 ms).
   - At 14 minutes (60 seconds remaining), a modal countdown appears with an amber warning.
   - If user confirms presence, the timer resets to 15 minutes.
   - If user does not interact, the session is invalidated, `localStorage` cached data is purged, an audit `LOGOUT` record is logged with `source: 'SYSTEM'`, and the user is redirected to `LoginPage`.

3. **Export Authorization & Audit Rule**:
   - Bulk export of patient records is restricted to executive and clinical leadership roles: `super_admin`, `org_admin`, `facility_admin`, and `clinical_manager`.
   - Every export action (CSV or PDF) must emit an immutable `EXPORT` record into `public.audit_logs`.

---

## 6. Permissions / Security Mapping

| Permission Code | Category | Roles Authorized | UI Guard | DB Enforcement |
| :--- | :--- | :--- | :--- | :--- |
| `patients.view` | Clinical | All facility members | Route / Page | `Tenant Scoped Patients Read` RLS |
| `patients.view_phi` | Privacy | Admins, Clinical Manager, Surgeon | Masking toggle | `phiMasking.js` + View projection |
| `reports.export_volume` | Reporting | Admin, CFO, Clinical Manager | Export button | `fn_log_export_audit_event` RPC |
| `reports.export_phi_unredacted` | Compliance | Super Admin, Org Admin, Facility Admin | Export button | `handleExportPatients` role gate + audit |
| `ai.run_insights` | Operations | All facility members | Chatbot window | Zero-PHI context stripping |

---

## 7. QA / Test Cases & Verification Results

All 87 tests passing across the 8 test suites:

```bash
# tests 87
# suites 8
# pass 87
# fail 0
```

1. **`tests/security-hipaa-audit.test.js`**:
   - `maskMRN`, `maskPhone`, `maskDOB`, `maskPatientName` assertions verified.
   - `sanitizePatientRecord` confirms 18 standard HIPAA identifiers are masked for unauthorized roles.
   - `deidentifyTextForAI` verifies regex stripping of SSNs, phones, emails, and MRNs.
   - Static analysis verifies `Chatbot.jsx` eliminates patient PHI concatenation.
   - Static analysis verifies `useInactivityTimeout` hook parameters.
   - Static analysis verifies `Migration 005` constraints and RPC grants.
2. **Full Regression Suite**:
   - `audit-logging-static.test.js`: 13 passing.
   - `backup-quarantine.test.js`: 2 passing.
   - `env.test.js`: 18 passing.
   - `migration-001.test.js`: 10 passing.
   - `rbac-components-static.test.js`: 6 passing.
   - `rbac-migration-002-static.test.js`: 11 passing.
   - `rbac-service.test.js`: 4 passing.
   - `security-hipaa-audit.test.js`: 23 passing.

---

## 8. Statutory Disclaimer

> [!CAUTION]
> Implementation of application code and database-level security controls does not, by itself, confer HIPAA compliance. Full legal compliance requires covered entities to execute Business Associate Agreements (BAAs) with hosting and AI infrastructure providers, maintain physical facility security, document administrative policies, conduct workforce training, and establish disaster recovery protocols.
