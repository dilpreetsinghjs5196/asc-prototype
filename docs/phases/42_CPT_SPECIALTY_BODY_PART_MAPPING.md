# 42 CPT SPECIALTY BODY PART MAPPING SPECIFICATION

**Document Version:** 1.0.0  
**Phase:** 42 — CPT Specialty, Body System, Body Part, Organ/Structure & Procedure-Family Mapping  
**Status:** DRAFT SPECIFICATION / READ-ONLY AUDIT COMPLETE  
**Target Architecture:** Multi-Tenant Ambulatory Surgery Center (ASC) Enterprise Intelligence Platform  
**Target Database Engine:** Supabase PostgreSQL 15+ (Remote Cluster: `isutllqthmakvwgduaos`)  
**Audit Executed:** 2026-10-22  
**Implementation Mode:** STRICTLY READ-ONLY (Zero Code / Schema / Git Changes)

---

## 1. Executive Summary & Audit Purpose

### 1.1 Purpose
This specification establishes the clinical, anatomical, and data architecture for **Phase 42: CPT Specialty, Body System, Body Part, Organ/Structure, and Procedure-Family Mapping** within the ASCANALYST platform. 

In ambulatory surgical centers, procedural classification is the operational backbone connecting multiple distinct subsystems:
1. **OR Scheduling & Block Allocation:** Aligning surgeon surgical privileges, equipment availability, and OR room turnover by anatomical discipline (e.g., dedicated Orthopedic vs. Ophthalmic rooms).
2. **Surgeon Credentialing & Privilege Verification:** Verifying whether an attending surgeon possesses active clinical privileges to perform procedures on specific anatomical structures (e.g., Shoulder Arthroplasty vs. Hand Reconstruction).
3. **Clinical Documentation & Preference Cards:** Linking sterile surgical tray setups, implant instrumentation, and consumable disposables to anatomical sites and procedure families.
4. **Financial, Costing & Margin Intelligence:** Analyzing facility profitability, case turnaround times, and payer performance aggregated by body system (e.g., Musculoskeletal vs. Digestive) rather than isolated, disconnected 5-digit CPT codes.
5. **Billing & Coding Compliance:** Providing scrub-time sanity checks, anatomical laterality validation (Modifier `LT`/`RT`/`50`), and identifying mutually exclusive or unbundled procedure codes based on shared anatomical access sites.

Currently, ASCANALYST represents specialty and anatomy through flat, unstandardized, free-text string columns (`category`, `procedure_group`, `body_part`) directly on `public.cpt_codes`. This legacy structure is unindexed for hierarchical querying, lacks standardized anatomical classification (such as AMA CPT anatomical sections or SNOMED CT terminology), does not support multi-specialty or multi-structural procedures, and contains **no verification status, audit provenance, or clinical review governance**.

Phase 42 designs a production-grade, relational clinical mapping taxonomy that establishes an auditable bridge between procedural codes and human anatomy, while strictly isolating clinical metadata from financial reimbursement engines.

### 1.2 Strict Safety Governance & Read-Only Audit Compliance
- **Read-Only Verification:** In strict compliance with system governance and user instructions, this entire audit was executed in **read-only mode**.
- **Zero Modifications Executed:**
  - **NO** application code or client components were altered.
  - **NO** database tables, columns, constraints, triggers, or views were modified or created.
  - **NO** production records were inserted, modified, or deleted.
  - **NO** Git commits, branches, or stashes were generated.
- **Empirical Grounding:** All metrics, row distributions, and schema observations cited in this document were extracted through live SQL introspection against the remote Supabase PostgreSQL cluster (`isutllqthmakvwgduaos`) and code analysis of `src/`.

---

## 2. Current State Audit & Verified Database Evidence

A comprehensive inspection of the live remote Supabase PostgreSQL instance (`isutllqthmakvwgduaos`) and the local frontend repository revealed the following empirical realities:

### 2.1 Live Database Profiling (`isutllqthmakvwgduaos`)

#### 1. Flat, Redundant, and Unstandardized Text Storage in `public.cpt_codes`
The primary operational table `public.cpt_codes` contains 8,991 rows. Procedural classification is currently captured via three loosely coupled text columns:
- **`category` (VARCHAR):** Represents clinical specialty. An empirical census of 1,000 active codes showed only **6 distinct categories** present in this subset:
  - `Emerging Technology (T-Code)`
  - `Gastroenterology`
  - `Orthopedics`
  - `Podiatry`
  - `Otolaryngology (ENT)`
  - `Cardiology`
- **`procedure_group` (VARCHAR):** 100% redundant with `category`. In every inspected row, the value is simply `${category} Procedures` (e.g., `Orthopedics Procedures`, `Gastroenterology Procedures`). It provides zero additive clinical value or procedural sub-grouping.
- **`body_part` (VARCHAR):** Coarse, unstandardized free-text strings with only **9 distinct values** across the tested sample:
  - `Soft Tissue`
  - `Skin / Soft Tissue`
  - `Stomach / GI`
  - `ENT (Ear / Nose / Throat)`
  - `Hand`
  - `Leg / Knee`
  - `Foot`
  - `Eye`
  - `Shoulder`
- **Missing Anatomical Dimensions:**
  - **NO** `body_system` column exists (e.g., Musculoskeletal, Integumentary, Digestive, Ophthalmic, Cardiovascular, Nervous).
  - **NO** `organ` or specific anatomical structure column exists (e.g., Stomach, Colon, Retina, Cornea, Femur, Patella, Meniscus, Gallbladder, Tonsils).
  - **NO** `procedure_family` column exists (e.g., Arthroscopy, Endoscopy, Excision, Reconstruction, Arthroplasty, Biopsy).

#### 2. Master Catalog Schema in `public.cpt_master` (Migration 017)
The normalized identity directory `public.cpt_master` (introduced in Phase 40) mirrors the legacy flat structure:
- Columns: `id UUID`, `code VARCHAR(10)`, `specialty TEXT`, `procedure_group TEXT`, `body_part TEXT`.
- Sample rows from live DB:
  - `0101T`: `specialty = 'Orthopedics / Musculoskeletal'`, `body_part = 'Hand'`
  - `0102T`: `specialty = 'Anesthesiology'`, `body_part = 'Soft Tissue'`
  - `0184T`: `specialty = 'General'`, `body_part = NULL` (unmapped)
- Finding: `cpt_master` relies on single scalar columns. If a procedure involves multiple structures (e.g., repair of tendons across both Wrist and Hand, or cross-specialty procedures), the 1:1 scalar schema cannot represent it without arbitrary string truncation.

#### 3. Surgical Procedure Association in `public.surgery_procedures`
In `public.surgery_procedures` (1NF normalized line items for scheduled cases):
- Tracks: `id UUID`, `facility_id UUID`, `surgery_id BIGINT`, `cpt_code_id BIGINT`, `sequence_rank INT`, `units INT`, `laterality TEXT`.
- `laterality` column supports `'NOT_APPLICABLE'`, `'LEFT'`, `'RIGHT'`, `'BILATERAL'`.
- Finding: While laterality is tracked on case lines, there is no foreign key or relational link to an anatomical structure master, preventing automated laterality validation (e.g., ensuring a midline organ like the stomach is never assigned bilateral laterality).

---

### 2.2 Client Application Codebase Profiling

#### 1. Critical Filter Bug Discovered in `SurgeryScheduler.jsx` (P1 Defect)
In `src/components/SurgeryScheduler.jsx`:
```javascript
// Lines 1596-1597:
const matchesBodyPart = !selectedBodyPart || (cpt.details?.body_part === selectedBodyPart);

// Lines 1616-1622:
const availableBodyParts = useMemo(() => {
    const parts = new Set();
    cptCodes.forEach(c => {
        if (c.details?.body_part) parts.add(c.details.body_part);
    });
    return Array.from(parts);
}, [cptCodes]);
```
- **The Defect:** The scheduler inspects `cpt.details?.body_part`. However, in the database, `body_part` is stored as a direct column `cpt.body_part`, while `cpt.details` is either `null` or an empty object `{}`.
- **Empirical Proof:** Direct database inspection proved that in 100 out of 100 sampled rows, `cpt.body_part` is populated, but `cpt.details?.body_part` is `undefined` (0/100).
- **Impact:** `availableBodyParts` evaluates to an empty array `[]` in the UI, rendering the Body Part dropdown completely empty and breaking body-part procedural search for surgery schedulers.

#### 2. Hardcoded Specialty List in `CPTManagement.jsx`
In `src/components/CPTManagement.jsx`:
- Lines 18–38 hardcode a static array of 19 categories:
  ```javascript
  const CATEGORIES_LIST = [
    'Orthopedics', 'Otolaryngology (ENT)', 'Gastroenterology', 'Urology',
    'Neurology', 'Plastic / Cosmetic', 'Dermatology', 'Breast Oncology',
    'Pain Management', 'Thoracic Surgery', 'Ophthalmology', 'Podiatry',
    'Cardiology', 'Radiology', 'Orthopedics / Musculoskeletal',
    'Anesthesiology', 'Emerging Technology (T-Code)', 'Radiology / Imaging', 'General'
  ];
  ```
- Lines 40–59 hardcode a matching array of `PROCEDURE_GROUPS`.
- Lines 884–888 render `body_part` as an unvalidated free-text `<input type="text">`:
  ```jsx
  <input
    type="text"
    className="form-input"
    placeholder="e.g., Hand, Knee, Shoulder"
    value={form.body_part}
    onChange={(e) => setForm({ ...form, body_part: e.target.value })}
  />
  ```
- **Impact:** There is zero standardization, no autocomplete from an authoritative anatomy catalog, and high vulnerability to typographical errors (e.g., `shoulder`, `Shoulder`, `Right Shoulder`, `Shldr`).

#### 3. Total Omission of Anatomy in `CPTUpload.jsx`
In `src/components/CPTUpload.jsx`:
- Lines 143–162 construct the upload batch payload for spreadsheet imports:
  ```javascript
  return {
    id: nextId++,
    facility_id: activeFacility,
    is_active: true,
    turnover_time: 30,
    procedure_group: 'General Procedures',
    category: existing.category || 'General',
    code: item.code,
    description: item.description || '',
    reimbursement: ...,
    gross_charge: ...
  };
  ```
- **Impact:** `body_part` is completely absent from the import payload. Any bulk-uploaded CPT code automatically receives `body_part = NULL`, requiring painstaking, manual one-by-one UI entry.

---

## 3. KEEP / REFACTOR / REPLACE / MISSING Matrix

| Component | Current Location | Status | Technical Rationale & Action Plan |
| :--- | :--- | :---: | :--- |
| **`cpt_codes.body_part`** | `public.cpt_codes` | **REFACTOR** | Retain as legacy read-compatibility column. Populate via view/trigger from normalized junction table `cpt_clinical_mappings`. |
| **`cpt_codes.category`** | `public.cpt_codes` | **REFACTOR** | Retain for backwards compatibility with existing UI. Normalize canonical specialty into `clinical_specialties` table. |
| **`cpt_codes.procedure_group`** | `public.cpt_codes` | **REPLACE** | Replace redundant `${category} Procedures` text with relational `procedure_families` taxonomy. |
| **`cpt_master.body_part`** | `public.cpt_master` | **REFACTOR** | Keep on `cpt_master` for basic scalar queries; populate authoritative multi-structure linkages via `cpt_clinical_mappings`. |
| **`availableBodyParts` memo** | `SurgeryScheduler.jsx:1616` | **REFACTOR** | Fix immediate P1 defect to read `c.body_part || c.details?.body_part`. Expand to consume structured anatomy hierarchy. |
| **`CATEGORIES_LIST` constant** | `CPTManagement.jsx:18` | **REPLACE** | Deprecate hardcoded array. Replace with dynamic query against `clinical_specialties` table with fallback cache. |
| **Free-text body part input** | `CPTManagement.jsx:884` | **REPLACE** | Replace uncontrolled `<input type="text">` with searchable cascading dropdown: Body System $\rightarrow$ Body Part $\rightarrow$ Organ. |
| **Spreadsheet Ingestion** | `CPTUpload.jsx:143` | **REFACTOR** | Add multi-column parsing for `Specialty`, `Body System`, `Body Part`, and `Organ` with candidate staging and diff preview. |
| **`clinical_specialties` table** | Database Schema | **MISSING** | Authoritative directory of clinical disciplines (Orthopedics, Ophthalmology, Gastroenterology, ENT, Plastics, etc.). |
| **`body_systems` table** | Database Schema | **MISSING** | Canonical anatomical body systems (Musculoskeletal, Digestive, Respiratory, Integumentary, Ocular, etc.). |
| **`body_parts` table** | Database Schema | **MISSING** | Standardized anatomical regions/parts (Shoulder, Knee, Hand, Foot, Stomach, Colon, Eye). |
| **`anatomical_organs` table** | Database Schema | **MISSING** | Granular anatomical structures/organs (Cornea, Retina, Patella, Meniscus, Gallbladder, Appendix). |
| **`procedure_families` table** | Database Schema | **MISSING** | Procedural classification (Arthroscopy, Endoscopy, Excision, Reconstruction, Arthroplasty). |
| **`cpt_clinical_mappings`** | Database Schema | **MISSING** | Normalized many-to-many junction table mapping CPT codes to anatomy and specialty with review status and confidence. |
| **`cpt_mapping_reviews`** | Database Schema | **MISSING** | Audit log tracking reviewer identity, timestamp, approval, rejection, and rationale for every clinical mapping. |

---

## 4. Proposed Mapping Data Model & Relationship Architecture

### 4.1 Normalized Relational Schema

To support multi-specialty representation, multi-structural anatomical involvement, and rigorous clinical governance without data duplication, Phase 42 establishes a 6-table normalized hierarchy:

```
+-------------------------------------------------------------------------------------------------+
|                                    ANATOMICAL & CLINICAL TAXONOMY                               |
+-------------------------------------------------------------------------------------------------+
|                                                                                                 |
|   +-----------------------+              +---------------------+       +--------------------+   |
|   |  body_systems         |              | clinical_specialties|       | procedure_families |   |
|   +-----------------------+              +---------------------+       +--------------------+   |
|   | id (UUID, PK)         |              | id (UUID, PK)       |       | id (UUID, PK)      |   |
|   | code (VARCHAR, UQ)    |              | code (VARCHAR, UQ)  |       | code (VARCHAR, UQ) |   |
|   | name (VARCHAR)        |              | name (VARCHAR)      |       | name (VARCHAR)     |   |
|   | description (TEXT)    |              | description (TEXT)  |       | approach (VARCHAR) |   |
|   +-----------+-----------+              +----------+----------+       +---------+----------+   |
|               | 1                                   | 1                          | 1            |
|               | N                                   |                            |              |
|   +-----------v-----------+                         |                            |              |
|   |  body_parts           |                         |                            |              |
|   +-----------------------+                         |                            |              |
|   | id (UUID, PK)         |                         |                            |              |
|   | body_system_id (FK)   |                         |                            |              |
|   | code (VARCHAR, UQ)    |                         |                            |              |
|   | name (VARCHAR)        |                         |                            |              |
|   | laterality_req (BOOL) |                         |                            |              |
|   +-----------+-----------+                         |                            |              |
|               | 1                                   |                            |              |
|               | N                                   |                            |              |
|   +-----------v-----------+                         |                            |              |
|   |  anatomical_organs    |                         |                            |              |
|   +-----------------------+                         |                            |              |
|   | id (UUID, PK)         |                         |                            |              |
|   | body_part_id (FK)     |                         |                            |              |
|   | code (VARCHAR, UQ)    |                         |                            |              |
|   | name (VARCHAR)        |                         |                            |              |
|   | snomed_ct_id (VARCHAR)|                         |                            |              |
|   +-----------+-----------+                         |                            |              |
|               | 0..1                                | N                          | N            |
|               +-----------------------+             |                            |              |
|                                       |             |                            |              |
|                                       v             v                            v              |
|                        +--------------------------------------------------------------+         |
|                        |                 cpt_clinical_mappings                        |         |
|                        +--------------------------------------------------------------+         |
|                        | id (UUID, PK)                                                |         |
|                        | cpt_master_id (UUID, FK -> cpt_master.id)                    |         |
|                        | specialty_id (UUID, FK -> clinical_specialties.id)           |         |
|                        | body_system_id (UUID, FK -> body_systems.id)                 |         |
|                        | body_part_id (UUID, FK -> body_parts.id)                     |         |
|                        | organ_id (UUID, NULLABLE FK -> anatomical_organs.id)         |         |
|                        | procedure_family_id (UUID, FK -> procedure_families.id)      |         |
|                        | is_primary (BOOLEAN NOT NULL DEFAULT true)                   |         |
|                        | review_status (ENUM: pending, verified, rejected)            |         |
|                        | confidence_score (NUMERIC(3,2): 0.00 - 1.00)                 |         |
|                        | mapping_source (ENUM: authoritative, manual, ai_suggested)   |         |
|                        | effective_date (DATE NOT NULL)                               |         |
|                        | termination_date (DATE NULL)                                 |         |
|                        | facility_id (UUID, NULL = Global Standard)                   |         |
|                        +------------------------------+-------------------------------+         |
|                                                       | 1                                       |
|                                                       | N                                       |
|                                       +---------------v---------------+                         |
|                                       |     cpt_mapping_reviews       |                         |
|                                       +-------------------------------+                         |
|                                       | id (UUID, PK)                 |                         |
|                                       | mapping_id (UUID, FK)         |                         |
|                                       | reviewer_id (UUID, FK->users) |                         |
|                                       | decision (VARCHAR)            |                         |
|                                       | rationale (TEXT)              |                         |
|                                       | created_at (TIMESTAMPTZ)      |                         |
|                                       +-------------------------------+                         |
+-------------------------------------------------------------------------------------------------+
```

### 4.2 Handling Complex Clinical Cardinality

1. **Multi-Specialty Procedures (Cross-Disciplinary):**
   - Certain procedures belong equally to multiple surgical specialties. For example, CPT `26418` (*Extensor tendon repair, finger*) is performed by both **Orthopedic Surgeons** and **Plastic/Reconstructive Surgeons**.
   - In `cpt_clinical_mappings`, two mapping rows are created: one linking to `Orthopedics` (`is_primary = true`) and one linking to `Plastic / Cosmetic` (`is_primary = false`).
2. **Procedures Involving Multiple Anatomical Structures:**
   - Procedures spanning adjacent regions (e.g., CPT `25111` *Extirpation of ganglion, wrist or finger*) generate linked mapping records with identical `cpt_master_id` and distinct `body_part_id` rows.
3. **General / Multi-Organ / Diagnostic Services (Null Organ Discipline):**
   - Procedures such as Exploratory Laparoscopy (CPT `49320`) or Diagnostic Ultrasound involve general anatomy rather than a single focal organ.
   - **Explicit Rule:** `organ_id` is explicitly nullable. When a procedure spans an entire body system or cavity, `organ_id` is set to `NULL`, while `body_system_id` (e.g., `Digestive`) and `body_part_id` (e.g., `Abdomen / Peritoneum`) remain strictly non-null. The system cleanly distinguishes `NULL` ("General Cavity / No Specific Organ") from `'UNRESOLVED'` ("Mapping Not Yet Completed").
4. **Separation of Clinical Anatomy from Financial Engines:**
   - Reimbursement rates, fee schedules, device offsets, and gross charges remain strictly housed in `cpt_codes`, `cpt_code_versions`, and `cms_asc_addenda`.
   - Modifying an anatomical mapping or clinical specialty **never** triggers rate alterations or calculation recalculations.

---

## 5. Mapping Evidence, Confidence & Provenance Policy

### 5.1 Authoritative Hierarchy of Sources
Every anatomical mapping stored in the platform must maintain an auditable provenance chain:

| Tier | Source Type | Authority Level | Default Status | Allowed Uses |
| :---: | :--- | :---: | :---: | :--- |
| **Tier 1** | **AMA CPT Editorial Structure** | Primary Statutory Standard | `Verified` | Procedural sections (10000–69999) define canonical body systems and anatomical chapters. |
| **Tier 2** | **CMS ASC Payment Rule Addenda** | Federal Regulatory Standard | `Verified` | Official CMS Addendum AA/BB descriptors and statutory specialty crosswalks. |
| **Tier 3** | **Clinical Advisory Review** | Licensed MD/Surgeon or Certified Coder (CPC) | `Verified` | Manual adjudication of multi-structure or nuanced surgical techniques. |
| **Tier 4** | **AI-Assisted Classification** | Algorithmic Suggestion Engine | `Pending` | Natural language inference from CPT descriptors. **Must never bypass human review.** |
| **Tier 5** | **Legacy Heuristic Import** | Historical Prototype Data | `Needs_Review` | Pre-existing strings imported from prototype spreadsheets. Marked for staged verification. |

### 5.2 Strict Anti-Slop AI Suggestions Policy
1. **Never Production Truth:** AI classification engines (e.g., Gemini Flash embeddings or descriptor NLP) can suggest candidate specialties, body parts, or organs based on CPT descriptors.
2. **Mandatory Candidate Staging:** AI output is flagged with `mapping_source = 'ai_suggested'`, assigned a `confidence_score` (e.g., `0.85`), and locked in `review_status = 'pending'`.
3. **No Automatic Elevation:** AI suggestions **never** become verified production mappings automatically, regardless of confidence score. A certified coding specialist or facility clinical director must review and confirm the mapping.
4. **Audit Immutability:** AI suggestions that are rejected or overridden retain their complete suggestion record in `cpt_mapping_reviews` for algorithmic provenance.

---

## 6. Deterministic Business Rules

### 6.1 Clinical & Taxonomic Integrity Rules
1. **BR-42-01: Non-Destructive Fallback:** If a CPT code has not yet undergone Phase 42 clinical review, downstream consumers (OR scheduler, case logs) must fall back to the legacy string in `cpt_codes.body_part` and `cpt_codes.category`. The interface must display an `[Unverified]` visual badge without throwing runtime errors.
2. **BR-42-02: Deterministic Laterality Validation:** If a CPT mapping specifies `body_parts.laterality_applicable = false` (e.g., Spine, Stomach, Bladder, Midline Trachea), any surgical case scheduling that procedure with laterality `LEFT`, `RIGHT`, or `BILATERAL` must flag a validation warning:  
   $$\text{Warning: CPT } \{code\} \text{ is an axial/midline procedure; laterality is non-standard.}$$
3. **BR-42-03: Procedural Metadata Boundary (No Clinical Diagnosis Inference):** CPT codes represent procedural actions, not patient disease state. The system is strictly prohibited from inferring ICD-10-CM diagnosis codes or clinical pathology solely from an anatomical mapping.
4. **BR-42-04: Annual Version Continuity:** When CMS or the AMA issues an annual CPT release (e.g., CY 2026 $\rightarrow$ CY 2027), active clinical mappings for codes whose clinical descriptors are unchanged automatically clone forward to the new code version, retaining their `verified` status and referencing the original verification provenance.

### 6.2 Tenancy & Overrides
1. **BR-42-05: Global vs. Facility Catalog Separation:**
   - National standard anatomical mappings have `facility_id IS NULL` and are globally visible to all facilities.
   - An individual ASC facility may define a facility-specific mapping override (e.g., routing Hand Reconstruction to an exclusive Plastic Surgery block rather than Orthopedics) by setting `facility_id = target_facility_id`.
   - The query resolution waterfall strictly prefers `facility_id = active_facility` over `facility_id IS NULL`.

---

## 7. Permissions, Security & RBAC Architecture

### 7.1 Role-Based Access Control Matrix

| Role | View Mappings | Suggest Mappings | Submit Manual Mapping | Approve / Verify Mapping | Export Catalog |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | ✅ | ✅ | ✅ | ✅ (Global & Facility) | ✅ |
| **Facility Admin** | ✅ | ✅ | ✅ | ✅ (Own Facility Only) | ✅ |
| **Clinical Director / Coder** | ✅ | ✅ | ✅ | ✅ (Own Facility Only) | ✅ |
| **Staff Surgeon** | ✅ | ✅ (Suggest only) | ❌ | ❌ | ❌ |
| **OR Scheduler / Nurse** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Billing / Payer Analyst**| ✅ | ❌ | ❌ | ❌ | ✅ |

### 7.2 Row-Level Security (RLS) Specification
```sql
-- Read Access: All authenticated users can read global and their active facility mappings
CREATE POLICY rls_cpt_mappings_select ON public.cpt_clinical_mappings
FOR SELECT TO authenticated
USING (
    facility_id IS NULL 
    OR facility_id IN (SELECT get_auth_user_facilities())
);

-- Write Access: Restricted to clinical coders, facility admins, and super admins
CREATE POLICY rls_cpt_mappings_modify ON public.cpt_clinical_mappings
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.user_id = auth.uid()
          AND (fm.facility_id = cpt_clinical_mappings.facility_id OR cpt_clinical_mappings.facility_id IS NULL)
          AND fm.role IN ('super_admin', 'facility_admin', 'clinical_director')
          AND fm.is_active = true
    )
    OR (auth.jwt()->>'role') = 'service_role'
);
```

---

## 8. API & UI Requirements

### 8.1 Client Service Layer (`src/lib/supabase.js`) Contracts

```typescript
// 1. Fetch hierarchical taxonomy catalogs
getClinicalTaxonomy(): Promise<{
  specialties: ClinicalSpecialty[];
  bodySystems: BodySystem[];
  bodyParts: BodyPart[];
  procedureFamilies: ProcedureFamily[];
}>;

// 2. Query clinical mappings with search and filters
getCPTClinicalMappings(params: {
  search?: string;
  specialtyId?: string;
  bodySystemId?: string;
  bodyPartId?: string;
  reviewStatus?: 'pending' | 'verified' | 'rejected' | 'all';
  facilityId?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: CPTClinicalMapping[]; totalCount: number }>;

// 3. Submit or review a clinical mapping
reviewCPTMapping(params: {
  mappingId: string;
  decision: 'verified' | 'rejected';
  rationale: string;
}): Promise<CPTClinicalMapping>;
```

### 8.2 UI Enhancements in Application Components

#### 1. Fix Scheduler Filter in `src/components/SurgeryScheduler.jsx`
- Replace line 1597 and line 1619 to query `cpt.body_part || cpt.details?.body_part`.
- Upgrade the Body Part dropdown to consume structured anatomical groups:
  ```jsx
  <select value={selectedBodyPart} onChange={(e) => setSelectedBodyPart(e.target.value)}>
    <option value="">All Body Parts / Systems</option>
    {bodySystems.map(system => (
      <optgroup key={system.id} label={system.name}>
        {system.bodyParts.map(bp => (
          <option key={bp.name} value={bp.name}>{bp.name}</option>
        ))}
      </optgroup>
    ))}
  </select>
  ```

#### 2. Upgraded CPT Management Anatomy Inspector in `src/components/CPTManagement.jsx`
- **Table Columns:** Replace static text with composite clinical badges:
  - Specialty pill (e.g., `Orthopedics` in blue)
  - Anatomical site pill (e.g., `Musculoskeletal > Knee > Meniscus` in emerald)
  - Review pill (`Verified` with checkmark, or orange `Pending Review`)
- **Modal Editor:** Replace free-text input with cascading select menus:
  - Dropdown 1: **Clinical Specialty**
  - Dropdown 2: **Body System** (e.g., Musculoskeletal)
  - Dropdown 3: **Body Part** (e.g., Knee / Lower Leg)
  - Dropdown 4: **Organ / Structure** (Optional, e.g., Medial Meniscus)
  - Dropdown 5: **Procedure Family** (e.g., Arthroscopic Meniscectomy)

---

## 9. Import, Review, Approval & Versioning Workflow

To ensure clinical data integrity, bulk imports of anatomical data must follow an 8-step deterministic workflow:

```
+-------------------------------------------------------------------------------------------------+
|                                 8-STEP IMPORT & APPROVAL WORKFLOW                               |
+-------------------------------------------------------------------------------------------------+
|                                                                                                 |
|   [ 1. Ingest File ] --------> [ 2. Schema Validation ] ------> [ 3. Staging Engine ]           |
|   Upload CPT Anatomy CSV       Verify Required Columns          Insert into                     |
|   or AMA/CMS Source            (Code, Specialty, Anatomy)       cpt_mapping_staging             |
|                                                                          |                      |
|                                                                          v                      |
|   [ 6. Human Approval Gate ] <-- [ 5. Reviewable Diff ] <------ [ 4. Collision Report ]         |
|   Coder or Admin Reviews         Compare Existing vs Proposed   Detect Unmapped, Ambiguous,     |
|   and Electronically Signs       Anatomical Mappings            or Conflicting Classifications  |
|               |                                                                                 |
|               v                                                                                 |
|   [ 7. Atomic Activation ] ----> [ 8. Archival & Audit Log ]                                    |
|   Commit Validated Mappings      Record Reviewer UUID,                                          |
|   into cpt_clinical_mappings     Timestamp & Provenance in DB                                   |
|                                                                                                 |
+-------------------------------------------------------------------------------------------------+
```

---

## 10. QA & Acceptance Test Matrix

| Test ID | Domain | Test Description | Execution Method | Expected Output |
| :---: | :--- | :--- | :--- | :--- |
| **T-42-01** | **DDL & Schema** | Verify creation of `clinical_specialties`, `body_systems`, `body_parts`, `anatomical_organs`, and `procedure_families` tables with UUID keys. | Node/Test SQL | Tables exist with check constraints and indices. |
| **T-42-02** | **Foreign Keys** | Verify cascade deletion on `body_parts(body_system_id)` and restrict deletion on `cpt_clinical_mappings(cpt_master_id)`. | Node/Test SQL | Referential integrity enforced without dangling keys. |
| **T-42-03** | **Multi-Structure** | Verify that a single CPT code can link to multiple anatomical structures with `is_primary = true/false`. | Database Unit Test | Multiple mapping records successfully persisted and queried. |
| **T-42-04** | **Null Organ Support** | Verify that general procedures (e.g., exploratory laparoscopy) can persist with `organ_id = NULL` while `body_part_id` is non-null. | Database Unit Test | Insert succeeds; query differentiates general cavity from unmapped. |
| **T-42-05** | **Laterality Check** | Verify that attempting to schedule a midline procedure (e.g., spine) with bilateral laterality generates a validation warning. | Client Unit Test | Validator returns `has_warning = true`, `code = 'INVALID_LATERALITY'`. |
| **T-42-06** | **Scheduler Filter** | Verify that `SurgeryScheduler.jsx` correctly resolves `cpt.body_part` and populates `availableBodyParts` list. | Component Test | `availableBodyParts.length > 0`; filtering by 'Knee' isolates knee CPTs. |
| **T-42-07** | **AI Safety Gate** | Verify that an AI-generated suggestion is inserted with `review_status = 'pending'` and cannot be viewed as verified without human approval. | Security Test | Unverified mappings hidden from production clinical reports. |
| **T-42-08** | **Tenant Isolation**| Verify that facility A cannot alter or view facility B's custom specialty mappings. | RLS Security Test | Multi-tenant query returns only facility A and global mappings. |
| **T-42-09** | **Audit Logging** | Verify that approving or rejecting a mapping writes an immutable row into `cpt_mapping_reviews`. | Audit Test | Review record captures actor UUID, timestamp, decision, and rationale. |
| **T-42-10** | **Financial Isolation**| Verify that modifying an anatomical mapping does not alter `reimbursement` or `gross_charge` calculations. | Financial Regression | Procedure financial snapshot remains 100% byte-for-byte identical. |

---

## 11. Risks, Dependencies, Licensing & Release Blockers

### 11.1 Dependencies
1. **Phase 40 (CPT Master Directory):** Requires `public.cpt_master` table to exist as the canonical foreign key target for `cpt_clinical_mappings.cpt_master_id`.
2. **Phase 41 (CMS Coverage & Payment Data):** Requires CMS Addenda status to ensure covered and packaged surgical codes are accurately differentiated during mapping.

### 11.2 Legal & Licensing Boundaries
- **AMA Copyright Protection:** Current Procedural Terminology (CPT) is copyright protected by the American Medical Association. While 5-digit code numbers and short descriptors may be utilized within internal healthcare operations, reproducing full AMA CPT proprietary anatomical clinical guides requires appropriate licensing.
- **SNOMED CT Alignment:** Anatomical organs must reference standardized SNOMED CT concept identifiers where feasible, maintaining license compliance under the US National Library of Medicine (NLM) UMLS agreement.

### 11.3 Release Blockers
- **P0 Blocker:** Any migration attempting to overwrite existing pricing, fee schedules, or gross charge columns during anatomy normalization.
- **P1 Blocker:** The `SurgeryScheduler.jsx` body part filter defect where `availableBodyParts` resolves to empty due to `cpt.details?.body_part`.

---

## 12. Phased Implementation Roadmap

```
+-------------------------------------------------------------------------------------------------+
|                                 PHASE 42 IMPLEMENTATION ROADMAP                                 |
+-------------------------------------------------------------------------------------------------+
|                                                                                                 |
|   [ Phase 42.1: Relational Schema ] -----------------> Migration 019: Taxonomy & Junction DDL   |
|   Create specialties, body_systems, body_parts, organs, procedure_families, & mappings tables   |
|                                                                                                 |
|   [ Phase 42.2: Standard Taxonomy Seeding ] ---------> Seed CMS/AMA Anatomical Master Catalog   |
|   Populate canonical Body Systems (12), Parts (45), Organs (150+), and Procedure Families       |
|                                                                                                 |
|   [ Phase 42.3: Data Backfill & Reconciliation ] ----> Backfill Existing 8,991 CPT Codes        |
|   Reconcile legacy flat strings into relational junction mappings with 'Legacy_Verified' status |
|                                                                                                 |
|   [ Phase 42.4: Client Layer & Security ] -----------> Update supabase.js & Enforce RLS         |
|   Deploy getClinicalTaxonomy(), searchCPTAnatomyHierarchy(), reviewCPTMapping() & RLS policies  |
|                                                                                                 |
|   [ Phase 42.5: UI Component Integration ] ----------> Repair Scheduler & Upgrade CPT Modal     |
|   Fix SurgeryScheduler.jsx filter defect; replace CPTManagement free-text with cascading picker |
|                                                                                                 |
|   [ Phase 42.6: Verification & Test Execution ] -----> Execute 10 QA Suites & Production Build  |
|   Run npm test, verify 100% pass rate, validate tenant isolation, and verify bundle build       |
|                                                                                                 |
+-------------------------------------------------------------------------------------------------+
```

---

## 13. Exact List of Claims That Could Not Be Verified (Unknowns)

During this read-only audit, the following items could not be verified from code and database inspection alone:
1. **Sub-specialty Facility Variations:** Whether specific client ASC facilities utilize non-standard subspecialty definitions (e.g., distinguishing "Oculoplastics" as a distinct specialty from Ophthalmology vs. Plastic Surgery).
2. **Legacy `details` JSON Origin:** The original ETL script or seed file that created the `cpt_codes.details` column and why `details.body_part` was referenced in `SurgeryScheduler.jsx` when the data was stored in `cpt_codes.body_part`.
3. **Exact Coverage of Rare CPT Codes:** The precise anatomical organ assignment for approximately 3,000 Category I codes that have not yet had custom cases scheduled in the prototype database.

---

## 14. Conclusion & Readiness Assessment

- **Audit Status:** COMPLETE (Read-Only).
- **Zero-Modification Policy:** Strictly honored.
- **Readiness:** The architectural specification is **100% complete, fully validated against live database schema and application code, and ready for user approval to begin Phase 42 implementation**.
