# PHASE 69 — SECURITY AND RBAC SPECIFICATION
## Tenancy Isolation, Source Approval Permissions, and AI Governance Boundaries

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** SECURITY & RBAC SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Application Security Architect, PostgreSQL Security Specialist  

---

## 1. FINE-GRAINED PERMISSIONS REGISTRY (`reimbursement.source.*`)

Phase 69 defines 8 granular permissions governing external dataset ingestion, approval, and audit inspection:

| Permission Code | Permission Name | Description | Sensitivity Tier |
| :--- | :--- | :--- | :---: |
| **`reimbursement.source.view`** | View Source Catalog | View catalog of external datasets and fee schedules | Tier 3 (Operational) |
| **`reimbursement.source.import`** | Upload & Stage Datasets | Upload raw regulatory files into quarantine staging | Tier 2 (Privileged) |
| **`reimbursement.source.validate`**| Execute Import Validation | Trigger automated CPT syntax and date checks | Tier 2 (Privileged) |
| **`reimbursement.source.approve`** | Formally Approve Dataset | Executive sign-off on staged fee schedule versions | Tier 1 (Executive SoD) |
| **`reimbursement.source.activate`**| Activate Dataset Version | Lock and enable version for authoritative calculation | Tier 1 (Executive SoD) |
| **`reimbursement.trace.view`** | View Calculation Traces | Inspect line-level mathematical formula steps | Tier 3 (Operational) |
| **`reimbursement.diff.view`** | View Historical Diffs | View side-by-side variance between calculation runs | Tier 3 (Operational) |
| **`reimbursement.audit.export`** | Export Audit Dossiers | Export immutable calculation traces for legal audits | Tier 1 (Compliance) |

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC) MATRIX

The matrix below maps permission grants across all ASC enterprise system roles:

| Role | `source.view` | `source.import` | `source.approve` | `source.activate` | `trace.view` | `diff.view` | `audit.export` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Organization CFO** | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Managed Care Director** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Contracting Analyst** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Facility Administrator** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Billing Specialist** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Coding Specialist** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Attending Surgeon** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **External Compliance Auditor** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Operational Viewer** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. SEPARATION OF DUTIES (SOD) ENFORCEMENT

To prevent fraudulent fee schedule manipulation or accidental activation of unverified rates:
1. **Database Constraint / Stored Procedure Enforcement:**
   ```sql
   IF v_importer_id = auth.uid() AND NOT public.user_has_facility_role(v_facility_id, ARRAY['super_admin']) THEN
       RAISE EXCEPTION 'Separation of Duties Violation: Dataset importer cannot approve their own uploaded version.'
           USING ERRCODE = '42501';
   END IF;
   ```
2. **Dual-Signoff Requirement:** Commercial fee schedule exhibits with values exceeding $100,000 annualized volume require both Contracting Analyst staging and Managed Care Director approval before activation.

---

## 4. AI AGENT GOVERNANCE & EXECUTION BOUNDARIES

The ASC Analyst AI Agent ("AI Ops / Reimbursement Assistant") operates under strict security boundaries:
1. **Zero Privilege Escalation:** The AI agent executes database queries strictly under the authenticated session of the human user (`auth.uid()`). If a biller cannot view executive contract terms, the AI agent is blocked by RLS.
2. **Read-Only Trace Interpretation:** The AI agent is authorized to **read and explain** existing calculation traces. It is **strictly prohibited** from:
   - Inventing missing fee schedule rates.
   - Fabricating unconfigured contract rules.
   - Mutating calculation snapshots.
   - Approving or activating external source datasets.

