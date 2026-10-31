# PHASE 66 — PAYER CONTRACT MODEL: SECURITY, GOVERNANCE & RBAC MATRIX

**Author:** ASCANALYST Information Security & Governance  
**Scope:** Permissions Catalog, Role Assignments, Row Level Security (RLS), Two-Person Approval, AI Guardrails  
**Target Engine:** `src/lib/rbacService.js`, Supabase RLS Policies, Database Functions  

---

## 1. Principles of Contract Governance & Separation of Duties

Payer contracts contain highly sensitive trade secrets, proprietary fee arrangements, and binding financial commitments. 

### Core Governance Rules:
1. **Separation of Duties (Two-Person Check)**: An individual who drafts or edits contract terms cannot be the sole approver who activates the contract version into production. Financial sign-off requires independent CFO or Executive review.
2. **Strict Multi-Tenant Isolation**: Contract terms, documents, and fee exhibits belonging to Organization A or Facility X must never be visible to users from Organization B or Facility Y unless explicitly granted by multi-facility scope.
3. **Immutable Approved Terms**: Once a version is approved, database triggers lock the record against all `UPDATE` and `DELETE` operations.
4. **AI Analyst Sandboxing**: Antigravity AI / AI Operations Analyst operates strictly in a read-only capacity. AI can explain terms, simulate claim adjudication, and identify discrepancies, but is strictly prohibited from creating, editing, approving, or activating contract versions.

---

## 2. Granular Permissions Catalog (`PERMISSIONS_CATALOG`)

To achieve enterprise compliance, the coarse `payer.manage_contracts` permission is expanded into 16 fine-grained permissions:

| Permission Code | Category | Name | Risk Level | Description |
| :--- | :--- | :--- | :--- | :--- |
| `payer.contract.view` | `billing` | View Payer Contracts | `standard` | View high-level contract metadata, payer bindings, and status. |
| `payer.contract.terms.view` | `finance` | View Contract Financial Terms | `sensitive` | View proprietary fee schedules, multipliers, and carve-out terms. |
| `payer.contract.document.view`| `finance`| View Contract Documents | `sensitive` | View and generate signed URLs to inspect signed contract PDFs. |
| `payer.contract.history.view` | `audit` | View Contract Audit Trail | `standard` | View chronological amendment and version history. |
| `payer.contract.create` | `finance` | Create Payer Contract Draft | `sensitive` | Initialize a new master contract or draft version. |
| `payer.contract.edit` | `finance` | Edit Draft Contract Terms | `sensitive` | Modify terms, multipliers, and scopes on `DRAFT` versions. |
| `payer.contract.scope.manage` | `finance` | Manage Facility & Plan Scopes | `sensitive` | Add or remove facilities and covered health plans. |
| `payer.contract.terms.manage` | `finance` | Manage Fee Schedules & Terms | `critical` | Enter or upload line-item CPT rates and multipliers. |
| `payer.contract.document.upload`| `finance`| Upload Contract Documents | `sensitive` | Upload executed PDF agreements and fee addenda. |
| `payer.contract.submit` | `finance` | Submit Version for Approval | `sensitive` | Transition contract version from `DRAFT` to `IN_REVIEW`. |
| `payer.contract.approve` | `finance` | Approve Contract Version | `critical` | Grant formal CFO / Executive sign-off on contract terms. |
| `payer.contract.reject` | `finance` | Reject Contract Version | `sensitive` | Reject version back to `DRAFT` with recorded rationale. |
| `payer.contract.activate` | `finance` | Activate Contract Version | `critical` | Make approved version authoritative for production adjudication. |
| `payer.contract.suspend` | `finance` | Suspend Contract | `critical` | Freeze contract due to legal dispute or breach. |
| `payer.contract.terminate` | `finance` | Terminate Contract | `critical` | Cancel agreement early with formal termination date. |
| `payer.contract.export` | `reports` | Export Contract Matrix | `sensitive` | Export fee schedule spreadsheets and comparison matrices. |

---

## 3. Role-Based Access Control (RBAC) Role Mappings

Permissions are mapped across ASCANALYST canonical enterprise roles:

| Permission Code | `viewer` | `scheduler` | `coder` | `biller` | `cfo` | `facility_admin` | `org_admin` | `super_admin` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `payer.contract.view` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.terms.view` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.document.view`| ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.history.view` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.create` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.edit` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.scope.manage` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.terms.manage` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.document.upload`| ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.submit` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `payer.contract.approve` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `payer.contract.reject` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `payer.contract.activate` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `payer.contract.suspend` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `payer.contract.terminate` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `payer.contract.export` | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |

*Note: Coders have access only to basic contract metadata for scrubbing, while Billers can view financial terms and submit drafts. Only CFO, Org Admin, and Super Admin hold approval, activation, suspension, and termination authorities.*

---

## 4. Row Level Security (RLS) Policy Specifications

All 10 contract tables enforce multi-tenant Row Level Security using `public.is_facility_accessible` and `public.user_has_facility_role`. No policy queries `public.user_roles` directly.

### 4.1 `public.payer_contracts` RLS
```sql
ALTER TABLE public.payer_contracts ENABLE ROW LEVEL SECURITY;

-- Select Policy: User can view contract if they have access to the governing organization
-- or access to at least one facility covered by the contract
CREATE POLICY "Payer Contracts Select Policy"
ON public.payer_contracts FOR SELECT TO authenticated
USING (
    organization_id IN (SELECT organization_id FROM public.get_auth_user_organizations())
    OR facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    OR EXISTS (
        SELECT 1 FROM public.payer_contract_facility_scopes fs
        WHERE fs.contract_id = payer_contracts.id
          AND fs.facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    )
);

-- Write Policy: Requires financial management role
CREATE POLICY "Payer Contracts Write Policy"
ON public.payer_contracts FOR ALL TO authenticated
USING (
    (facility_id IS NOT NULL AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo']))
    OR (facility_id IS NULL AND public.user_has_org_role(organization_id, ARRAY['super_admin', 'org_admin', 'cfo']))
)
WITH CHECK (
    (facility_id IS NOT NULL AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo']))
    OR (facility_id IS NULL AND public.user_has_org_role(organization_id, ARRAY['super_admin', 'org_admin', 'cfo']))
);
```

### 4.2 `public.payer_contract_versions` RLS
```sql
ALTER TABLE public.payer_contract_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payer Contract Versions Select Policy"
ON public.payer_contract_versions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contracts c
        WHERE c.id = payer_contract_versions.contract_id
          AND (
              c.organization_id IN (SELECT organization_id FROM public.get_auth_user_organizations())
              OR c.facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
          )
    )
);

CREATE POLICY "Payer Contract Versions Write Policy"
ON public.payer_contract_versions FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.payer_contracts c
        WHERE c.id = payer_contract_versions.contract_id
          AND (
              public.user_has_facility_role(c.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo'])
              OR public.user_has_org_role(c.organization_id, ARRAY['super_admin', 'org_admin', 'cfo'])
          )
    )
);
```

---

## 5. Database Trigger: Immutable Approved Version Lock

To prevent retroactive tampering with approved financial terms:

```sql
CREATE OR REPLACE FUNCTION public.fn_block_approved_contract_version_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- If already approved or active, block updates to sensitive terms
    IF (OLD.status IN ('APPROVED', 'ACTIVE', 'SUPERSEDED', 'TERMINATED')) THEN
        -- Allow only status transition to SUPERSEDED, SUSPENDED, or TERMINATED, or setting effective_end_date
        IF (NEW.status != OLD.status OR NEW.effective_end_date != OLD.effective_end_date)
           AND (NEW.medicare_multiplier = OLD.medicare_multiplier)
           AND (NEW.reimbursement_methodology = OLD.reimbursement_methodology)
           AND (NEW.billed_charge_discount_pct = OLD.billed_charge_discount_pct)
           AND (NEW.mppr_rule_set_code = OLD.mppr_rule_set_code)
           AND (NEW.device_carve_out_mode = OLD.device_carve_out_mode)
           AND (NEW.device_invoice_markup_pct = OLD.device_invoice_markup_pct) THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'COMPLIANCE VIOLATION: Contract version % (ID: %) is locked and cannot be modified. Create an amendment or version N+1.',
            OLD.version_number, OLD.id;
    END IF;

    -- If transitioning to APPROVED or ACTIVE, set is_locked = true
    IF (NEW.status IN ('APPROVED', 'ACTIVE') AND OLD.status NOT IN ('APPROVED', 'ACTIVE')) THEN
        NEW.is_locked := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_approved_contract_version_modification ON public.payer_contract_versions;
CREATE TRIGGER trg_block_approved_contract_version_modification
    BEFORE UPDATE OR DELETE ON public.payer_contract_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_block_approved_contract_version_modification();
```

---

## 6. AI Analyst Security Boundaries & Guardrails

When users interact with Antigravity AI, AI Operations Analyst, or automated chat assistants:
1. **Tool Invocation Restrictions**: AI agent tools can invoke `getPayerContracts`, `getPayerContractDetails`, and `resolveContractRatePreview`.
2. **Prohibited AI Actions**: Under NO circumstances can an AI tool execute:
   - `createPayerContractDraft`
   - `approvePayerContractVersion`
   - `activatePayerContractVersion`
   - `terminatePayerContract`
   - `uploadContractDocument`
3. **Disclosure Watermarking**: All rate previews generated by AI tools must explicitly state: *"Calculated using active contract version [number]. This is a predictive analytical preview, not a legally binding adjudication."*

---

*Proceed to Document Management specifications.*

