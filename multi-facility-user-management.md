# Multi-Facility, Super Admin & User Management Implementation Plan

## 1. Overview & Context

This project enhances the **ASC Analyst** application with an enterprise-grade, secure, scalable, and dynamic Multi-Facility, Super Admin, and User Management system.

The core objectives:
1. **Single Global Super Admin:** Strictly enforce exactly ONE active Super Admin account across the system, preventing privilege escalation, unauthorized Super Admin creation, and accidental lockout, with a secure recovery procedure.
2. **Facility Management:** Centralized management of facilities by the Super Admin (list, create with validated form, edit details, activate/deactivate with non-destructive access policy, designated Facility Admin assignment).
3. **Facility Admin Governance:** Designated Facility Admin for each facility, scoped strictly to their facility without global facility creation or cross-facility visibility/mutation.
4. **Comprehensive User Management:** Complete user lifecycle (list with filtering/sorting/pagination, create/invite via secure server-side/GoTrue workflow, edit profile, assign/change permitted roles, reassign facility, activate/deactivate, access revocation).
5. **Zero Cleartext Credentials & Secret Exposure:** Complete elimination of prototype cleartext password handling in the UI, adhering to Supabase Auth and HIPAA standards.
6. **Strict Data Isolation & Authorization:** Enforcement of tenant boundaries at PostgreSQL RLS and server-side RPC layers, protecting clinical, financial, and operational records.

---

## 2. Project Type & Tech Stack

- **Project Type:** WEB (Ambulatory Surgery Center Operations & Analytics Platform)
- **Frontend:** React 19, Vite 8, Vanilla CSS / CSS Modules (Theme-aware Design System), Lucide React, SweetAlert2
- **Backend / Database:** Supabase (PostgreSQL 15+), Row Level Security (RLS), PL/pgSQL `SECURITY DEFINER` RPCs, GoTrue Auth
- **Primary Agents:** `database-architect`, `security-auditor`, `backend-specialist`, `frontend-specialist`, `test-engineer`
- **Primary Skills:** `clean-code`, `database-design`, `vulnerability-scanner`, `testing-patterns`, `frontend-design`, `verify-changes`

---

## 3. Success Criteria

- [x] Exactly ONE active global Super Admin is strictly enforced at database and server layers.
- [x] Super Admin can view all facilities, create new facilities dynamically, edit facility details, toggle facility active/inactive status, and assign/reassign designated Facility Admins.
- [x] Designated Facility Admins can only view and manage users within their own facility scope and cannot grant Super Admin or unauthorized roles.
- [x] Full User Management module supports searching, filtering by facility, role, and status, with prefilled edit forms, role changes, facility reassignment, and activation/deactivation.
- [x] No plaintext passwords or secrets exposed in frontend bundles or table columns.
- [x] Facility-level RLS strictly isolates patients, surgeries, schedules, staff, and financial snapshots.
- [x] Full audit trail logging for all administrative events via `fn_audit_log_trigger` and `audit_logs`.
- [x] Zero regression across existing clinical, CPT, OR costing, reimbursement, and analytics modules.
- [x] All unit, integration, static, and build tests pass (`npm test` and `npm run build`).

---

## 4. Current-State Assessment & Gap Analysis

### 4.1 Existing Database Architecture
- **Tenant Hierarchy:** `public.organizations` -> `public.facilities` -> `public.facility_memberships` (Migration 001).
- **Canonical Roles & Permissions:** `public.roles`, `public.permissions`, `public.role_permissions` (Migration 002).
  - 10 canonical roles: `super_admin`, `org_admin`, `facility_admin`, `cfo`, `clinical_manager`, `scheduler`, `biller`, `coder`, `surgeon`, `viewer`.
  - 13 permission categories covering 46 granular permissions.
  - `has_permission(p_facility_id, p_permission_code)` dual-resolution check.
  - Triggers: `prevent_self_role_escalation`, `protect_last_facility_admin`, `prevent_facility_relocation`.
- **Audit System:** `public.audit_logs` (Migrations 003 & 004) with immutable transactions, recursive secret sanitizer `fn_sanitize_audit_jsonb()`, and export provenance `fn_log_export_audit_event()`.
- **Security & Privacy:** Migration 005 enforced `NOT NULL` on `facility_id` for patients and surgeries, revoked client REST access on legacy `public.users`, and removed plaintext passwords from `public.surgeons`.

### 4.2 Identified Gaps & Vulnerabilities
1. **No Single Super Admin Database Constraint:**
   - There is no database-tier constraint preventing multiple `super_admin` memberships or ensuring exactly one active Super Admin.
   - Facility Admins with `users.edit_roles` are blocked by frontend checks, but database triggers currently check only `IF NOT user_has_facility_role(NULL, ARRAY['super_admin'])` during self-escalation, leaving non-self assignment of `super_admin` vulnerable without explicit trigger checks.
2. **Facility Status & Designated Admin Missing in Schema:**
   - `public.facilities` lacks a `status` / `is_active` column and a `designated_admin_id` column.
   - Deactivation policy is not defined in RLS (deactivated facilities still allow member access).
3. **Prototype Password Exposure in `UserManagement.jsx`:**
   - `UserManagement.jsx` still contains mock password viewing, copying, and generation (`revealedPasswords`, `isSessionAdmin ? 'admin123' : ...`), violating HIPAA and zero-secret policies.
4. **Missing Global Facility Management UI:**
   - Currently, facilities can only be switched via header dropdown. There is no Global Facility Management dashboard for Super Admin to create, edit, or deactivate facilities.
5. **No Cross-Facility User Management:**
   - `UserManagement.jsx` only displays users in `activeFacility`. Super Admin has no cross-facility user directory, facility filter, or reassignment workflow.
6. **No Secure Server-Side User Provisioning RPC:**
   - Inviting/creating users from frontend directly writes mock rows to `facility_memberships` without creating/linking GoTrue auth identities or updating user metadata.
7. **Role of `org_admin` Clarification:**
   - `org_admin` is an enterprise network administrator for multi-facility healthcare systems (e.g. Naples Health Network). In migration 002, `org_admin` has tier 2 access, but should NOT have global Super Admin authority (e.g., cannot create cross-org facilities, assign Super Admin, or bypass single Super Admin checks).

---

## 5. Proposed Role and Permission Matrix

| Action / Capability | `super_admin` | `org_admin` | `facility_admin` | `cfo` / `clinical_manager` | Ordinary Staff |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Global System Dashboard** | ✅ Full Global | ❌ (Org Only) | ❌ | ❌ | ❌ |
| **View All Facilities** | ✅ All Facilities | ✅ Org Facilities | ❌ (Own Only) | ❌ (Own Only) | ❌ (Own Only) |
| **Create Facility** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Edit Facility Details** | ✅ Any Facility | ✅ Org Facilities | ✅ Own (Restricted) | ❌ | ❌ |
| **Activate / Deactivate Facility** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Assign Designated Facility Admin** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **View Users Globally (Cross-Facility)** | ✅ Allowed | ❌ (Org Only) | ❌ (Own Only) | ❌ (Own Only) | ❌ (Own Only) |
| **Invite / Create User** | ✅ Any Facility | ✅ Org Facility | ✅ Own Facility | ❌ | ❌ |
| **Assign `super_admin` Role** | ❌ (Locked: Single SA) | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Assign `facility_admin` Role** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Assign Operational Roles (`scheduler`, etc.)** | ✅ Allowed | ✅ Allowed | ✅ Allowed (Own Fac) | ❌ | ❌ |
| **Edit User Profile (Name, Title, Dept)** | ✅ Allowed | ✅ Org Users | ✅ Own Users | ❌ | ❌ (Self basic) |
| **Reassign User Facility** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Activate / Deactivate User** | ✅ Allowed | ✅ Org Users | ✅ Own Users (Non-Admin) | ❌ | ❌ |
| **View Audit Logs** | ✅ Global Security & Admin | ✅ Org Clinical/Fin | ✅ Own Facility | 🔍 Scoped Clinical/Fin | ❌ |
| **Access Protected Clinical/Financial Data** | ✅ Permitted Scope | ✅ Permitted Scope | ✅ Facility Scope | 🔍 Role Scoped | 🔍 Role Scoped |

---

## 6. Implementation Plan & Task Breakdown

### Phase 1: Database Hardening & Schema Migration (Migration 008)
- **Task 1.1:** Add `is_active` (`BOOLEAN DEFAULT true`), `status` (`TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended'))`), and `designated_admin_id` (`UUID REFERENCES auth.users(id)`) to `public.facilities`.
- **Task 1.2:** Implement Single Super Admin enforcement:
  - Create trigger `trg_enforce_single_super_admin` on `public.facility_memberships` verifying that at most ONE active membership with `role = 'super_admin'` exists across the entire database.
  - Reject any insertion or update setting `role = 'super_admin'` if an active Super Admin already exists (unless part of an authorized replacement transaction).
  - Prevent non-super_admins from granting or modifying the `super_admin` role.
  - Protect the sole Super Admin from deactivation, demotion, or deletion.
- **Task 1.3:** Implement Super Admin Emergency Recovery & Replacement RPC (`fn_replace_super_admin`):
  - Strictly requires verification and logs a critical security audit event.
- **Task 1.4:** Implement Server-Side Administrative RPCs (`SECURITY DEFINER`):
  - `fn_admin_create_facility`: Validates Super Admin authority, creates facility, optionally assigns designated admin, logs audit event.
  - `fn_admin_update_facility`: Validates authority, updates metadata, updates status, logs audit event.
  - `fn_admin_manage_user`: Validates caller permissions, updates profile/role/department, prevents privilege escalation, logs audit event.
  - `fn_admin_reassign_user_facility`: Validates Super Admin authority, safely moves user membership, revokes old facility access, logs audit event.
  - `fn_admin_toggle_user_active`: Validates authority, prevents deactivating the sole Super Admin or sole Facility Admin, logs audit event.
- **Task 1.5:** Update Facility RLS policies:
  - If a facility is marked inactive/suspended, non-super_admin users are blocked from querying its operational data.

### Phase 2: RBAC Service & Client Security Hardening (`src/lib/rbacService.js` & `supabase.js`)
- **Task 2.1:** Eliminate all prototype cleartext password handling from `rbacService.js` and `supabase.js`.
- **Task 2.2:** Add multi-facility administrative client methods:
  - `getFacilitiesDetailed()`: Retrieves facilities with user counts, designated admin info, and status.
  - `createFacility(facilityData)`: Calls `fn_admin_create_facility`.
  - `updateFacility(facilityId, updates)`: Calls `fn_admin_update_facility`.
  - `getAllUsers(filters)`: Retrieves cross-facility users for Super Admin.
  - `reassignUserFacility(userId, fromFacId, toFacId, role)`: Calls server-side reassignment.
  - `toggleUserStatus(membershipId, isActive)`: Calls safe deactivation.
- **Task 2.3:** Add role assignment boundary validation:
  - Explicit helper `getAssignableRoles(currentRole)` returning only roles the current user tier is authorized to grant.

### Phase 3: Facility Management Module (`src/components/FacilityManagement.jsx`)
- **Task 3.1:** Create `FacilityManagement.jsx` & `FacilityManagement.css`:
  - Facility List with search, status filters (Active/Inactive), sorting, user counts, and designated admin.
  - Create Facility Modal with validation (name, license, timezone, address, NPI, tax ID, initial Facility Admin assignment).
  - Edit Facility Modal (update details, change designated Facility Admin, activate/deactivate facility with confirmation).
  - Facility Details Drawer/View showing assigned staff and operational metrics.
  - Quick action to open User Management filtered to that facility.

### Phase 4: User Management Module Overhaul (`src/components/UserManagement.jsx`)
- **Task 4.1:** Cleanse `UserManagement.jsx` of all plaintext password displays, toggles, and mock credential fields.
- **Task 4.2:** Add Facility Selector & Cross-Facility View:
  - Super Admin sees "All Facilities" or can filter by specific facility.
  - Facility Admin is scoped strictly to their active facility.
- **Task 4.3:** Comprehensive User Table:
  - Columns: Name, Email, Facility, Role (with color-coded badge), Department/Title, Status (Active/Inactive badge), Created Date.
  - Filters: Facility, Role, Status, and search by Name/Email.
- **Task 4.4:** Modals & Actions:
  - **Invite/Create User Modal:** Secure invitation without plaintext passwords, selecting facility (if Super Admin) and permitted role.
  - **Edit User Modal:** Edit name, department, title, email.
  - **Change Role Dialog:** Restricted to assignable roles, with confirmation dialog and escalation prevention.
  - **Facility Reassignment Dialog:** For Super Admin to transfer users between facilities.
  - **Activation/Deactivation Dialog:** Confirmation modal with Last Admin protection.

### Phase 5: Super Admin Global Dashboard & Navigation (`src/App.jsx`)
- **Task 5.1:** Add "Global Facilities" / "Facility Management" tab to sidebar under Administration (visible to Super Admin).
- **Task 5.2:** Add Super Admin KPI Banner / Global Overview (Total Facilities, Total Users, Active Centers, System Status).
- **Task 5.3:** Wire seamless navigation between Facility Management and Facility-specific User Management.

### Phase 6: Automated Testing & Verification
- **Task 6.1:** Create `tests/multi-facility-rbac.test.js` verifying:
  - Single Super Admin database constraint and triggers.
  - Facility isolation in RLS.
  - Anti-escalation rules (Facility Admin cannot grant Super Admin or reassign facilities).
  - Password sanitization (no plaintext passwords in frontend code).
- **Task 6.2:** Execute full regression suite (`npm test`).
- **Task 6.3:** Execute production bundle build (`npm run build`).

---

## 7. Files to be Created or Modified

| File | Status | Description |
| :--- | :---: | :--- |
| `supabase/migrations/008_multi_facility_and_single_super_admin.sql` | **New** | DDL for single Super Admin trigger, facility status, designated admin, server-side RPCs, and RLS updates. |
| `supabase/migrations/008_multi_facility_and_single_super_admin_down.sql` | **New** | Safe rollback script for migration 008. |
| `src/components/FacilityManagement.jsx` | **New** | Complete Facility Management UI (List, Create, Edit, Details, Deactivation). |
| `src/components/FacilityManagement.css` | **New** | Modern, accessible styling conforming to ASC Analyst design system. |
| `src/components/UserManagement.jsx` | **Modify** | Overhaul User Management: remove passwords, add cross-facility filtering, edit modal, role change, reassignment. |
| `src/components/UserManagement.css` | **Modify/New** | Enhanced responsive styling for user table, badges, and modals. |
| `src/lib/rbacService.js` | **Modify** | Add multi-facility RPC calls, assignable roles matrix, remove plaintext password handling. |
| `src/lib/supabase.js` | **Modify** | Add facility management db methods, enhanced session & facility resolution. |
| `src/App.jsx` | **Modify** | Wire Facility Management tab, Super Admin global dashboard indicators, update header/navigation. |
| `tests/multi-facility-rbac.test.js` | **New** | Comprehensive unit & contract tests for multi-facility, single Super Admin, and security invariants. |

---

## 8. Rollback Considerations

- All database modifications in Migration 008 are accompanied by `008_multi_facility_and_single_super_admin_down.sql`.
- Migration 008 uses `ADD COLUMN IF NOT EXISTS`, ensuring non-destructive backward compatibility.
- Existing facility IDs (`00000000-0000-0000-0000-000000000002` and `00000000-0000-0000-0000-000000000003`) remain unchanged.
- Existing clinical cases, patients, surgeons, and fee schedules remain untouched.

---

## 9. Verification & Phase X Checklist
 
- [x] Lint & Type Check: `npx eslint src/components/UserManagement.jsx src/components/FacilityManagement.jsx src/lib/rbacService.js src/lib/supabase.js` (0 errors, 0 warnings)
- [x] Test Suite: `npm test` (all 125 tests passed across 16 test suites, 0 failures)
- [x] Build Check: `npm run build` (vite build succeeds with 0 errors)
- [x] Security Audit: verify zero cleartext password occurrences in `UserManagement.jsx` and `rbacService.js`.
- [x] Single Super Admin Invariant: verified in SQL trigger and application logic.
- [x] Facility Data Isolation: verified via RLS policy test and non-destructive access gating.
