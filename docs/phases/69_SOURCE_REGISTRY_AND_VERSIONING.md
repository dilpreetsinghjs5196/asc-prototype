# PHASE 69 — SOURCE REGISTRY AND VERSIONING SPECIFICATION
## Centralized Dataset Catalog, SHA-256 File Checksums, and Multi-Stage Approval Lifecycles

> **Module:** Expected Reimbursement Engine & Rate Adjudication  
> **Status:** DATA MODEL & PROCESS SPECIFICATION  
> **Target Version:** ASCANALYST v2026.1  
> **Author:** Principal Database Architect, Financial Systems Auditor  

---

## 1. CENTRALIZED SOURCE REGISTRY DATA MODEL

To eliminate fragmented, ad-hoc import tables across modules, Phase 69 introduces a **centralized two-tier source registry**:

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ REIMBURSEMENT_SOURCES : "scopes"
    REIMBURSEMENT_SOURCES ||--|{ REIMBURSEMENT_SOURCE_VERSIONS : "versions"
    REIMBURSEMENT_SOURCE_VERSIONS ||--o{ REIMBURSEMENT_SOURCE_APPROVALS : "approved by"
    REIMBURSEMENT_SOURCE_VERSIONS ||--o{ REIMBURSEMENT_CALCULATION_TRACES : "referenced by"

    REIMBURSEMENT_SOURCES {
        uuid id PK
        uuid organization_id FK
        varchar source_code UK "e.g. CMS_ASC_ADDENDA"
        varchar source_name "CMS ASC Payment Addenda"
        varchar source_type "REGULATORY | PAYER_FEE_SCHEDULE | CODE_SET"
        varchar publisher "CMS | AMA | UHC | BCBS"
        varchar external_reference "CMS-1786-FC"
        boolean is_active
        timestamptz created_at
    }

    REIMBURSEMENT_SOURCE_VERSIONS {
        uuid id PK
        uuid source_id FK
        varchar version_code "2026-Q1-V1"
        varchar original_file_name "2026_asc_addenda_aa.csv"
        varchar original_file_checksum "SHA-256 Hex"
        text raw_file_storage_uri "Encrypted S3/Supabase Storage"
        date publication_date "2025-11-15"
        date effective_start_date "2026-01-01"
        date effective_end_date "2026-12-31"
        varchar approval_status "DRAFT | REVIEW_PENDING | APPROVED | ACTIVE | SUPERSEDED"
        uuid superseded_by_version_id FK
        uuid imported_by FK
        timestamptz imported_at
    }

    REIMBURSEMENT_SOURCE_APPROVALS {
        uuid id PK
        uuid source_version_id FK
        uuid approver_id FK
        varchar approval_decision "APPROVED | REJECTED"
        text approval_notes
        timestamptz approved_at
    }
```

---

## 2. PUBLICATION DATE VS. EFFECTIVE DATE SEPARATION

A common flaw in healthcare data engineering is conflating the date an external regulatory file was published with the date it legally takes effect.

### Invariant Rules:
1. **Publication Date (`publication_date`):** The date the originating agency or payer published the document (e.g. CMS publishes the ASC Final Rule in November 2025).
2. **Effective Window (`effective_start_date` to `effective_end_date`):** The exact calendar interval during which the rates legally apply to surgical dates of service (e.g. `2026-01-01` through `2026-12-31`).
3. **Audit Rule:** Rate resolution must **strictly match the encounter's Date of Service (DOS)** against the effective window:
   $$\text{effective\_start\_date} \le \text{Date of Service} \le \text{effective\_end\_date}$$
   Publication date is preserved strictly for legal provenance and regulatory compliance.

---

## 3. FILE INGESTION & CRYPTOGRAPHIC VERIFICATION LIFECYCLE

External datasets must pass through an audited, multi-stage ingestion gate before any rate can be referenced by the calculation engine:

```mermaid
stateDiagram-v2
    [*] --> UPLOAD: Raw File Upload (CSV/Excel/TXT)
    UPLOAD --> CHECKSUM: Generate SHA-256 File Digest
    CHECKSUM --> QUARANTINE: Staging & Syntax Parsing
    QUARANTINE --> PARSE_FAILED: Schema Mismatch / Invalid CPT Format
    QUARANTINE --> DRAFT: Successfully Staged (Status: DRAFT)
    
    DRAFT --> PEER_REVIEW: Submit for Executive Sign-Off
    PEER_REVIEW --> REJECTED: Approver Rejects File
    PEER_REVIEW --> APPROVED: Authorized Approval (CFO / Director)
    
    APPROVED --> ACTIVE: Activated on Effective Start Date
    ACTIVE --> SUPERSEDED: Retroactive Correction or New Version Deployed
    
    PARSE_FAILED --> [*]
    REJECTED --> [*]
    SUPERSEDED --> [*]
```

### Ingestion Security Directives:
1. **Raw File SHA-256 Immutability:** When a file is uploaded, its raw byte stream is hashed using SHA-256. This digest (`original_file_checksum`) is stored permanently and validated against subsequent reads to detect disk corruption or tampering.
2. **Quarantine Staging:** Raw records are loaded into isolated staging tables (`reimbursement_source_import_staging`) with zero client access.
3. **Separation of Duties (SoD):** The user who uploads an external rate dataset **cannot approve or activate it**. Activation requires explicit sign-off from a user possessing `reimbursement.source.approve` permissions (Managed Care Director or Organization CFO).
4. **Unapproved Source Prohibition:** The adjudication engine contains a strict SQL guard:
   ```sql
   WHERE approval_status = 'ACTIVE' AND effective_start_date <= p_dos AND effective_end_date >= p_dos
   ```
   Draft, unapproved, or rejected sources are **strictly invisible** to authoritative calculations.

---

## 4. RETROACTIVE CORRECTIONS & VERSION SUPERSEDING

CMS frequently issues quarterly technical corrections (e.g. April correction to a January wage index) with retroactive effective dates.

### Governance Protocol:
1. **Never Overwrite Historical Versions:** The original source version (e.g. `CMS-ASC-2026-Q1-V1`) remains in the database permanently.
2. **Link Succession:** The corrected version (`CMS-ASC-2026-Q1-V2`) is created with status `ACTIVE`. The original version has its status updated to `SUPERSEDED`, with `superseded_by_version_id` pointing to `V2`.
3. **Preserving Historical Calculations:** Any calculation executed prior to the correction retains its foreign key to `V1`. Running a historical audit re-evaluates against `V1`, reproducing the exact financial accrual that occurred on the original billing date.

