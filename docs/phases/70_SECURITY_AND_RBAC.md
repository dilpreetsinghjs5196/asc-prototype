# PHASE 70 — SECURITY AND RBAC
## Financial Permissions Matrix, Tenancy Scoping, Separation of Duties & AI Boundaries

> **Phase:** 70 — Financial Data Dictionary  
> **Status:** SECURITY & RBAC SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1 Enterprise  
> **Classification:** Security Architecture & Access Governance  

---

## 1. ACCESS CONTROL PHILOSOPHY

Financial data in an Ambulatory Surgery Center constitutes confidential business intellectual property (proprietary fee schedules, negotiated implant purchase costs, physician productivity metrics) and Protected Health Information (PHI).

Access control is enforced via a defense-in-depth model:
1. **Database Row Level Security (RLS):** Physical data access bounded by facility tenancy and user identity.
2. **Granular RBAC Privileges:** Discrete financial permissions assigned by administrative role.
3. **Separation of Duties (SoD):** Multi-person approval gates preventing unilateral modification of financial formulas.
4. **AI Agent Access Scoping:** AI agents inherit the calling user's strict permissions and cannot bypass financial clearance boundaries.

---

## 2. GRANULAR PERMISSIONS CATALOG

Phase 70 registers 8 discrete financial permissions:

| Permission Code | Description | Risk Tier | Business Justification |
| :--- | :--- | :---: | :--- |
| `financial.metric.view` | View dictionary definitions and active formulas | Low | Transparency into financial calculation definitions |
| `financial.metric.manage` | Propose new metrics or edit draft formulas | Medium | Financial analyst metadata maintenance |
| `financial.metric.approve`| Formally approve & activate financial formula versions | **High (P0)**| Enforces SoD; prevents unverified formula deployment |
| `financial.data.view` | View baseline charges, allowables, and payments | Low | Core clinical and billing operations |
| `financial.rates.view` | View sensitive contracted fee schedules & payer rates | High | Protects proprietary managed care contract rates |
| `financial.costs.view` | View internal implant purchase costs & staff wages | High | Protects confidential supplier pricing tiers |
| `financial.margins.view` | View case-level contribution margins & profitability | High | Prevents unauthorized margin comparisons |
| `financial.reconciliation.manage`| Authorize contractual write-offs & settle variances | High | Controls accounting adjustments and bad debt reserves |

---

## 3. ROLE-BASED ACCESS MATRIX (RBAC)

The table below defines permission assignments across the 7 canonical platform roles:

| Permission Code | `super_admin` | `org_admin` | `facility_admin` | `clinical_director` | `biller` | `surgeon` | `viewer` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `financial.metric.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `financial.metric.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `financial.metric.approve` | ✅ | ✅ (SoD) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `financial.data.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (Own Only)| ✅ (Summary) |
| `financial.rates.view` | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `financial.costs.view` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `financial.margins.view` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ (Own Only)| ❌ |
| `financial.reconciliation.manage`| ✅ | ✅ | ✅ | ❌ | ✅ (Approve Req)| ❌ | ❌ |

*(Own Only: Surgeons can view case charges and financial summaries only for surgical cases where they are the credentialed attending surgeon).*

---

## 4. SEPARATION OF DUTIES (SOD) GOVERNANCE

To prevent fraudulent manipulation of financial formulas or unauthorized write-offs:
- **Formula Activation SoD:** The user who drafts or modifies a formula in `financial_formula_registry` **cannot approve or activate it**. The database trigger validates:
  ```sql
  IF NEW.is_approved = TRUE AND NEW.approved_by = NEW.created_by THEN
      RAISE EXCEPTION 'SoD VIOLATION: Formula author cannot self-approve financial calculation formulas.';
  END IF;
  ```
- **Dual-Control Write-Offs:** Administrative write-offs exceeding $\$500.00$ require two signatures: Biller submission + Facility Administrator authorization.

---

## 5. AI AGENT SECURITY BOUNDARIES

The Multi-Agent AI Subsystem (`AgentOrchestrator`, `CostAgent`, `BillingAgent`) is bound by identical security constraints:
1. **Context Stripping:** When generating prompts for external LLMs (Gemini), sensitive contractual fee schedules, vendor invoice details, and unmasked patient PHI are stripped or hashed.
2. **Permission Inheritance:** If a logged-in user lacks `financial.margins.view`, any AI query regarding surgeon profitability returns:
   $$\text{"Clearance Denied: Your account role does not have authorization to view contribution margin analytics."}$$
3. **No Autonomous Approvals:** AI agents can propose variance explanations, but cannot autonomously post financial adjustments or approve formula versions.

