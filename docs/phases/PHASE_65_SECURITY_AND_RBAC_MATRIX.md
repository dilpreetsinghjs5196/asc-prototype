# PHASE 65 — SECURITY, MULTI-TENANCY & RBAC PERMISSIONS MATRIX

> **Document ID:** `PHASE_65_SECURITY_AND_RBAC_MATRIX.md`  
> **Status:** Production Security Specification  
> **System:** ASCANALYST Medical Operations & Financial Intelligence  
> **Domain:** Tenancy Isolation, Row Level Security (RLS), RBAC Permissions, HIPAA Compliance  

---

## 1. Tenancy Model: Global Master vs. Facility Isolation

The Payer Master subsystem operates under a **hybrid multi-tenant governance model**:

```
[Level 1: Global / Federal Master] ──► Available to all authenticated facilities (Medicare, National Commercials)
          │
[Level 2: Enterprise Organization]  ──► Shared across surgery centers under the same healthcare organization
          │
[Level 3: Facility-Specific Tenant] ──► Strictly isolated per surgery center (Contracts, Clearinghouses, Patient Coverages)
```

1. **Global Master Directory (`public.payer_master`, `payer_plans`, `payer_identifiers`)**:
   - `organization_id IS NULL`: Shared national reference records (e.g. Traditional Medicare, national carriers). Read access is granted to all authenticated facility members.
   - `organization_id IS NOT NULL`: Private enterprise payers created by an ASC management company. Visible only to facilities belonging to that organization.
   - **Write Access**: Restricted strictly to `super_admin` and `org_admin`.
2. **Facility Participation & Enablement (`public.facility_payers`, `facility_payer_plans`)**:
   - Strictly isolated by `facility_id`.
   - Surgery Center A cannot view or modify the clearinghouse credentials, in-network status, or localized billing instructions of Surgery Center B.
3. **Contract Terms & Fee Schedules (`public.payer_contracts`, `payer_fee_schedules`)**:
   - Strictly tenant-isolated. Commercial contract terms, negotiated percentages of Medicare, and reimbursement schedules are protected proprietary financial data.
4. **Patient Insurance Coverage (`public.patient_insurance_coverages`)**:
   - Classified as **Protected Health Information (PHI)** under HIPAA § 164.312.
   - Strictly tenant-isolated by `facility_id` and bounded by minimum-necessary access controls.

---

## 2. Row Level Security (RLS) Policy Specifications

> [!CRITICAL]
> **Zero `user_roles` Query Invariant**:  
> All RLS policies must enforce tenant boundaries using `public.is_facility_accessible(facility_id)` and role-based checks via `public.user_has_facility_role(facility_id, role_slugs)`.  
> Direct queries or subselects against `public.user_roles` are **strictly prohibited** to prevent recursive security context bypasses.

### 2.1 RLS Policies for `public.payer_master`
```sql
ALTER TABLE public.payer_master ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Global payers OR organization-shared payers
CREATE POLICY "Payer Master Read Policy"
ON public.payer_master
FOR SELECT
TO authenticated
USING (
    organization_id IS NULL 
    OR EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        JOIN public.facilities f ON f.id = fm.facility_id
        WHERE fm.user_id = auth.uid()
          AND fm.is_active = true
          AND f.organization_id = payer_master.organization_id
    )
);

-- 2. INSERT / UPDATE: Super Admin or Authorized Org Admin
CREATE POLICY "Payer Master Write Policy"
ON public.payer_master
FOR ALL
TO authenticated
USING (
    public.user_has_facility_role(NULL, ARRAY['super_admin'])
    OR (
        organization_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            JOIN public.facilities f ON f.id = fm.facility_id
            WHERE fm.user_id = auth.uid()
              AND fm.is_active = true
              AND f.organization_id = payer_master.organization_id
              AND fm.role IN ('org_admin')
        )
    )
);
```

### 2.2 RLS Policies for `public.facility_payers`
```sql
ALTER TABLE public.facility_payers ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Facility Access
CREATE POLICY "Facility Payers Select Policy"
ON public.facility_payers
FOR SELECT
TO authenticated
USING (public.is_facility_accessible(facility_id));

-- 2. INSERT / UPDATE / DELETE: Facility Admin, Org Admin, Super Admin
CREATE POLICY "Facility Payers Write Policy"
ON public.facility_payers
FOR ALL
TO authenticated
USING (
    public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller'])
)
WITH CHECK (
    public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller'])
);
```

### 2.3 RLS Policies for `public.patient_insurance_coverages` (PHI)
```sql
ALTER TABLE public.patient_insurance_coverages ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Authorized clinical & billing facility staff
CREATE POLICY "Patient Insurance Read Policy"
ON public.patient_insurance_coverages
FOR SELECT
TO authenticated
USING (
    public.is_facility_accessible(facility_id)
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'biller', 'billing_rcm', 'coder', 'scheduler', 'surgeon'])
);

-- 2. WRITE: Billing and scheduling staff
CREATE POLICY "Patient Insurance Write Policy"
ON public.patient_insurance_coverages
FOR ALL
TO authenticated
USING (
    public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'billing_rcm', 'scheduler'])
)
WITH CHECK (
    public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'billing_rcm', 'scheduler'])
);
```

---

## 3. RBAC Permissions Catalog (12 Canonical Permissions)

The following 12 granular permissions will be registered in `src/lib/rbacService.js` under the `finance` and `billing` categories:

| Permission Code | Category | Name | Risk Level | Description |
|---|---|---|---|---|
| `payer.view` | `billing` | View Payer Master & Plans | `standard` | View global and facility-enabled payers, benefit plans, and routing IDs |
| `payer.create` | `finance` | Create Payer Master Record | `sensitive` | Draft new payer entities and national benefit plans |
| `payer.edit` | `finance` | Edit Payer Details & Metadata | `sensitive` | Update payer legal names, trade names, addresses, and contacts |
| `payer.activate` | `finance` | Activate / Suspend Payer | `critical` | Transition payer lifecycle status between Active, Suspended, and Inactive |
| `payer.archive` | `finance` | Archive Payer Master Record | `critical` | Permanently archive retired payer entities (prohibiting hard deletion) |
| `payer.manage_plans` | `finance` | Manage Payer Benefit Plans | `sensitive` | Create, edit, and configure payer benefit plan products |
| `payer.manage_identifiers` | `billing` | Manage Electronic EDI Payer IDs | `sensitive` | Configure and verify clearinghouse routing codes and 5-digit EDI IDs |
| `payer.configure_facility` | `finance` | Configure Facility Payer Settings | `sensitive` | Toggle facility enablement, in-network status, and local billing notes |
| `payer.manage_contracts` | `finance` | Manage Payer Commercial Contracts | `critical` | Create, version, and approve commercial payer reimbursement contracts |
| `payer.manage_coverages` | `billing` | Manage Patient Insurance Coverages | `sensitive` | Create, update, and sequence patient primary/secondary/tertiary insurance |
| `payer.import` | `finance` | Import External Payer Directories | `sensitive` | Upload and stage bulk clearinghouse or CMS payer master directories |
| `payer.export` | `reports` | Export Payer Master & Directory | `sensitive` | Export payer catalogs, contract matrices, and participation summaries |

---

## 4. Role Assignment Matrix

| Role | `view` | `create` | `edit` | `activate` | `archive` | `plans` | `identifiers` | `facility_cfg` | `contracts` | `coverages` | `import` | `export` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `org_admin` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `facility_admin` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `cfo` / `finance` | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `biller` / `billing_rcm` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `coder` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `scheduler` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `clinical_manager` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `surgeon` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `analyst` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 5. AI Analyst Security Parity

When the **AI Operations Analyst** or conversational agents execute tools related to payer intelligence or reimbursement forecasting:

1. **Identity & Tenancy Bound**:
   - AI tools receive the authenticated caller's session token and active `facility_id`.
   - Tool executions cannot query across facilities without explicit `super_admin` or `org_admin` session role.
2. **Read-Only by Default**:
   - AI Analyst tools are strictly restricted to `payer.view` and financial calculation simulations.
3. **Prohibition of Automated Mutations**:
   - AI agents are **strictly prohibited** from automatically creating, activating, merging, suspending, or archiving payer records.
   - Any proposed payer deduplication or identifier update generated by AI insights must be surfaced as a pending recommendation requiring human administrative sign-off.

