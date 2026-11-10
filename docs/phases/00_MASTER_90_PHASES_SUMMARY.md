# MASTER 90 PHASES SPECIFICATION & ARCHITECTURE SUMMARY
## ASCANALYST Production Engineering & Healthcare RCM Platform

> **Status:** All Phases 01 through 90 are fully documented, implemented, verified with automated tests, and integrated into the ASCANALYST production prototype.

---

## Executive Summary

The ASCANALYST platform is an enterprise-grade surgical and financial analytics platform tailored specifically for Ambulatory Surgery Centers (ASCs). It combines clinical case tracking, surgeon operational benchmarks, preference card management, device-intensive implant supply chain tracking, statutory Medicare & Commercial payer fee schedule modeling, double-entry case financial accounting, end-to-end electronic Revenue Cycle Management (EDI 837/835, denials, appeals, patient liability, AR aging, 4-way reconciliation), and master revenue leakage detection.

All 90 foundational phases are organized across 10 functional modules:

```
Phase 00: Project Control & Foundation (Phases 01 - 06)
Phase 01: Target System Architecture & Standards (Phases 10 - 15)
Phase 02: Authentication, Tenancy & Security (RBAC/RLS) (Phases 20 - 26)
Phase 03: Canonical Data Models & Case Master (Phases 30 - 37)
Phase 04: CPT Coding Assistant & Scrubbing Engine (Phases 40 - 47)
Phase 05: Implant Intelligence & Supply Chain (Phases 50 - 59)
Phase 06: Medicare & Commercial Payer Reimbursement Engine (Phases 60 - 69)
Phase 07: Financials, Procedural Economics & Versioning (Phases 70 - 77)
Phase 08: Revenue Cycle Management (RCM) & Clearinghouse EDI (Phases 80 - 89)
Phase 09: Master Revenue Leakage Engine (Phase 90)
```

---

## Detailed Directory of Completed Phases (01 – 90)

### Module 00: Project Control & Foundation (Phases 01 - 06)
- **Phase 01: Product Vision & Scope** (`01-PRODUCT-VISION-AND-SCOPE.md`)
  - Strategic product positioning for ASCs: Case profitability, OR throughput density, surgeon engagement, supply chain margins, and end-to-end RCM solvency.
- **Phase 02: Current Codebase Audit** (`02-CURRENT-CODEBASE-AUDIT.md`)
  - Inventory of existing legacy components, classification into KEEP, REFACTOR, REPLACE, and elimination of technical debt.
- **Phase 03: Current Database Audit** (`03-CURRENT-DATABASE-AUDIT.md`)
  - PostgreSQL schema inspection, mapping legacy `surgeries` records, and establishing data migrations toward canonical models.
- **Phase 04: Technical Debt & Blockers** (`04-TECHNICAL-DEBT-AND-BLOCKERS.md`)
  - Identification and remediation of critical blockers, type mismatches (BIGINT vs UUID), and insecure client-side calculations.
- **Phase 05: Master Build Roadmap** (`05-MASTER-BUILD-ROADMAP.md`)
  - Multi-phase sequential dependency graph, milestones, and release gates from foundation to enterprise RCM.
- **Phase 06: Definition of Done** (`06-DEFINITION-OF-DONE.md`)
  - Authoritative quality criteria: zero client mock assumptions, strict 100% test passing, RLS tenant isolation, zero purple design system enforcement, and reproducible accounting.

---

### Module 01: Target System Architecture & Engineering Standards (Phases 10 - 15)
- **Phase 10: Target System Architecture** (`10-TARGET-SYSTEM-ARCHITECTURE.md`)
  - Cloud-native architecture diagram: Supabase PostgreSQL, edge compute functions, React + Vite frontend, and high-frequency analytical layers.
- **Phase 11: Repository Structure** (`11-REPOSITORY-STRUCTURE.md`)
  - Clean separation of concerns: `/src/components`, `/src/lib`, `/src/services`, `/supabase/migrations`, `/tests`, and `/docs/phases`.
- **Phase 12: Engineering Standards** (`12-ENGINEERING-STANDARDS.md`)
  - Coding conventions, Maestro Clinical Design System governance (strictly ZERO purple/violet/indigo/magenta tokens), and strict clean-code guidelines.
- **Phase 13: Environment & Config** (`13-ENVIRONMENT-AND-CONFIG.md`)
  - Multi-stage environment definitions (`development`, `staging`, `production`), secret management, and deterministic seeds.
- **Phase 14: CI/CD & Release Process** (`14-CICD-AND-RELEASE-PROCESS.md`)
  - Automated deployment pipelines, linting verification, rollback down-migrations, and build artifact hashing.
- **Phase 15: Observability, Monitoring & Backups** (`15-OBSERVABILITY-MONITORING-BACKUPS.md`)
  - Health checks, structured JSON audit logs, database connection pooling metrics, automated backup verification, and quarantine policies.

---

### Module 02: Authentication, Tenancy & Security (Phases 20 - 26)
- **Phase 20: Authentication Spec** (`20-AUTHENTICATION-SPEC.md`)
  - Supabase GoTrue authentication, JWT session verification, MFA support, and token expiration handling.
- **Phase 21: Organization & Facility Tenancy** (`21-ORGANIZATION-AND-FACILITY-TENANCY.md`)
  - Multi-facility data isolation, enterprise corporate parent organizations, and facility-specific configuration scopes.
- **Phase 22: RBAC Roles & Permissions** (`22-RBAC-ROLES-AND-PERMISSIONS.md`)
  - 13-domain canonical permission matrix, role inheritance (`super_admin`, `org_admin`, `facility_admin`, `billing_specialist`, `surgeon`, `read_only`).
- **Phase 23: RLS Security Policies** (`23_RLS_SECURITY_POLICIES.md`)
  - Server-side PostgreSQL Row Level Security (RLS) enforcing `facility_id IN (SELECT public.get_auth_user_facilities())`.
- **Phase 24: Audit Logging Spec** (`24_AUDIT_LOGGING_SPEC.md`)
  - HIPAA § 164.312(b) compliance: Immutable audit logging of user ID, IP address, timestamp, table name, operation, and JSON diffs.
- **Phase 25: Security, Privacy & HIPAA** (`25_SECURITY_PRIVACY_HIPAA.md`)
  - Protected Health Information (PHI) encryption at rest and in transit, Business Associate Agreement (BAA) standards, and data minimization.
- **Phase 26: Security Test Plan** (`26_SECURITY_TEST_PLAN.md`)
  - Automated penetration test harness, SQL injection mitigation tests, tenant escape prevention, and privilege escalation guards.

---

### Module 03: Canonical Data Models & Case Master (Phases 30 - 37)
- **Phase 30: Canonical Data Model** (`30_CANONICAL_DATA_MODEL.md`)
  - Master entity relationship design uniting clinical surgeries, patients, surgeons, OR logs, implants, and billing claims.
- **Phase 31: Case Master Spec** (`31_CASE_MASTER_SPEC.md`)
  - Authoritative surgical case record lifecycle: Scheduled, In-Room, Wheels-In, Incision, Wheels-Out, Coding, Billed, Closed.
- **Phase 32: Case CPT Codes Spec** (`32_CASE_CPT_CODES_SPEC.md`)
  - Primary, secondary, and tertiary surgical procedure lines, laterality modifiers, and sequencing rules.
- **Phase 33: Case Events & Status History** (`33_CASE_EVENTS_AND_STATUS_HISTORY.md`)
  - Micro-timestamp event sourcing capturing OR milestones, turnover duration, and clinical delays.
- **Phase 34: Patient Model** (`34_PATIENT_MODEL.md`)
  - Demographic profiles, medical record numbers (MRN), insurance policy numbers, subscriber relationships, and patient responsibility ledger.
- **Phase 35: Surgeon Model** (`35_SURGEON_MODEL.md`)
  - NPI numbers, specialty credentials, block time assignments, preference card links, and historical procedural benchmarks.
- **Phase 36: Staff & Provider Model** (`36_STAFF_AND_PROVIDER_MODEL.md`)
  - Anesthesiologists, CRNAs, circulating nurses, surgical scrub technicians, and labor hourly wage schedules.
- **Phase 37: Data Migration from Surgeries** (`37_DATA_MIGRATION_FROM_SURGERIES.md`)
  - Deterministic ETL pipeline migrating legacy flat surgical tables into normalized canonical schemas without data loss.

---

### Module 04: CPT Coding Assistant & Scrubbing Engine (Phases 40 - 47)
- **Phase 40: CPT Master Spec** (`40_CPT_MASTER_SPEC.md`)
  - Standardized Current Procedural Terminology (CPT) dictionary, clinical short descriptions, and specialty groupings.
- **Phase 41: CMS ASC Coverage & Payment Data** (`41_CMS_ASC_COVERAGE_AND_PAYMENT_DATA.md`)
  - CMS ASC Covered Procedures List (CPL), statutory exclusion rules, and device-intensive eligibility indicators.
- **Phase 42: CPT Specialty & Body Part Mapping** (`42_CPT_SPECIALTY_BODY_PART_MAPPING.md`)
  - Anatomical site classification (Orthopedics, Ophthalmology, Spine, Pain Management, General Surgery, ENT, Urology).
- **Phase 43: CPT Coding Assistant** (`43_CPT_CODING_ASSISTANT.md`)
  - Interactive smart-search, code suggestion assistant, and clinical keyword matching against operative reports.
- **Phase 44: CPT Modifiers, Units & Laterality Rules** (`44_CPT_MODIFIERS_UNITS_LATERALITY_RULES.md`)
  - Validation rules for bilateral modifier -50, anatomical modifiers (RT, LT, E1-E4, FA-F9), distinct service modifier -59, and XE/XP/XS/XU.
- **Phase 45: CPT Versioning & Licensed Content** (`45_CPT_VERSIONING_AND_LICENSED_CONTENT.md`)
  - Annual AMA CPT updates, effective-dated code ranges, and sunsetted code deprecation governance.
- **Phase 46: Charge Completeness Engine** (`46_CHARGE_COMPLETENESS_ENGINE.md`)
  - Pre-bill charge capture validation ensuring OR consumables, implants, pharmacy, and facility services are accounted for.
- **Phase 47: Claim Scrubbing Rules** (`47_CLAIM_SCRUBBING_RULES.md`)
  - Automated clearinghouse pre-submission edits, NCCI bundling validation, LCD/NCD medical necessity cross-checks.

---

### Module 05: Implant Intelligence & Supply Chain (Phases 50 - 59)
- **Phase 50: Implant Intelligence Overview** (`50_IMPLANT_INTELLIGENCE_OVERVIEW.md`)
  - Executive architecture uniting surgical implants, FDA Unique Device Identification (UDI), vendor contracts, and billing.
- **Phase 51: Implant Category & Component Model** (`51_IMPLANT_CATEGORY_AND_COMPONENT_MODEL.md`)
  - Device taxonomy: Orthopedic plates, screws, anchors, knee/hip prosthetics, spinal cages, intraocular lenses (IOL), biological mesh.
- **Phase 52: CPT to Implant Mapping** (`52_CPT_TO_IMPLANT_MAPPING.md`)
  - Deterministic clinical requirement rules linking specific surgical CPT procedures to required or optional hardware categories.
- **Phase 53: Implant Vendor Master** (`53_IMPLANT_VENDOR_MASTER.md`)
  - Master directory of device manufacturers (Stryker, Arthrex, DePuy Synthes, Medtronic, Zimmer Biomet) and local distributors.
- **Phase 54: Implant Product SKU Model** (`54_IMPLANT_PRODUCT_SKU_MODEL.md`)
  - Global Trade Item Numbers (GTIN), catalog numbers, sterile shelf life dates, and manufacturer specifications.
- **Phase 55: Vendor to Implant Component Mapping** (`55_VENDOR_TO_IMPLANT_COMPONENT_MAPPING.md`)
  - Cross-referencing supplier catalog parts to internal standardized component taxonomy tiers.
- **Phase 56: Facility Vendor Contracts** (`56_FACILITY_VENDOR_CONTRACTS.md`)
  - Commercial terms, effective-dated discount tiers, volume rebates, consignment terms, and bulk commitment minimums.
- **Phase 57: Facility Implant Pricing** (`57_FACILITY_IMPLANT_PRICING.md`)
  - Verified acquisition costs, three-way invoice matching (Purchase Order, Packing Slip, Supplier Invoice), and price variance alerts.
- **Phase 58: Surgeon Preference Cards** (`58_SURGEON_PREFERENCE_CARDS.md`)
  - Procedural preference cards, surgeon-specific instrument trays, open vs. hold item staging, and wastage tracking.
- **Phase 59: Case Implant Usage** (`59_CASE_IMPLANT_USAGE.md`)
  - Authoritative OR implant consumption records, lot/serial number logging, barcode scanning, and unused item restocking.

---

### Module 06: Medicare & Commercial Payer Reimbursement Engine (Phases 60 - 69)
- **Phase 60: Medicare ASC Base Rate Engine** (`60_MEDICARE_ASC_BASE_RATE_ENGINE.md`)
  - Statutory CMS OPPS/ASC fee schedule formula: Base conversion factor $\times$ Relative Payment Weight.
- **Phase 61: CMS Payment Indicators** (`61_CMS_PAYMENT_INDICATORS.md`)
  - Deterministic interpretation of CMS Payment Indicators (`A2`, `G2`, `P2`, `P3`, `R2`, `Z2`) governing packaged vs. separately payable lines.
- **Phase 62: Geographic Wage Adjustment** (`62_GEOGRAPHIC_WAGE_ADJUSTMENT.md`)
  - CBSA wage index calculation: $60\%$ labor portion wage-adjusted $+$ $40\%$ non-labor standard portion.
- **Phase 63: Device-Intensive Payment Rules** (`63_DEVICE_INTENSIVE_PAYMENT_RULES.md`)
  - CMS device offset deduction, device-to-facility cost ratio evaluation, and pass-through threshold calculations.
- **Phase 64: Multiple Procedure Payment Rules** (`64_MULTIPLE_PROCEDURE_PAYMENT_RULES.md`)
  - Multiple Procedure Discounting (MPD): $100\%$ highest allowable procedure, $50\%$ secondary and subsequent eligible surgical lines.
- **Phase 65: Payer Master** (`65_PAYER_MASTER.md`)
  - Enterprise payer registry, NAIC codes, clearinghouse Payer IDs (EDI Loop 2010BB), and commercial payer classification.
- **Phase 66: Payer Contract Model** (`66_PAYER_CONTRACT_MODEL.md`)
  - Contract effective dates, evergreen renewals, timely filing submission limits (90/180/365 days), and appeal filing windows.
- **Phase 67: Payer Contract Rate Rules** (`67_PAYER_CONTRACT_RATE_RULES.md`)
  - Commercial rate methodologies: Medicare % Multiplier, Commercial Fee Schedule, Per Diem, Case Rates, and Implant Carve-Outs.
- **Phase 68: Expected Reimbursement Engine** (`68_EXPECTED_REIMBURSEMENT_ENGINE.md`)
  - Authoritative calculation engine determining exact contractually expected reimbursement for every surgical encounter.
- **Phase 69: Reimbursement Calculation Auditability** (`69_REIMBURSEMENT_CALCULATION_AUDITABILITY.md`)
  - Calculation formula trace, rule provenance hash, simulation dry-runs, and retro-adjudication auditability.

---

### Module 07: Financials, Procedural Economics & Versioning (Phases 70 - 77)
- **Phase 70: Financial Data Dictionary** (`70_FINANCIAL_DATA_DICTIONARY.md`)
  - Standardized definitions of Gross Charges, Net Revenue, Contractual Allowances, Direct Costs, Contribution Margin, and EBITDA.
- **Phase 71: Case Financial Ledger** (`71_CASE_FINANCIAL_LEDGER.md`)
  - Double-entry event-sourced financial journal for every case: debits, credits, posted adjustments, and net balance balancing.
- **Phase 72: Case Cost Model** (`72_CASE_COST_MODEL.md`)
  - 8-category direct cost allocation: Clinical labor, anesthesia time, sterile processing, surgical supplies, implants, drugs, and room time.
- **Phase 73: Facility Financial Settings** (`73_FACILITY_FINANCIAL_SETTINGS.md`)
  - Facility-specific wage rates per clinical role, fixed overhead allocations, and target margin threshold benchmarks.
- **Phase 74: Contribution Margin Engine** (`74_CONTRIBUTION_MARGIN_ENGINE.md`)
  - Deterministic formula: $\text{Contribution Margin} = \text{Net Revenue} - \text{Total Direct Costs}$, and Margin Percentage calculation.
- **Phase 75: Contribution Per OR Hour** (`75_CONTRIBUTION_PER_OR_HOUR.md`)
  - Operating room capacity economics: Realized dollar yield per utilization hour, factoring turnover drag and block time leakage.
- **Phase 76: Financial Completeness Score** (`76_FINANCIAL_COMPLETENESS_SCORE.md`)
  - Multi-dimensional data health score ($0 - 100\%$) auditing cost capture, operative note completion, and claim posting readiness.
- **Phase 77: Financial Calculation Versioning** (`77_FINANCIAL_CALCULATION_VERSIONING.md`)
  - Closed-period accounting locks, immutable historical snapshots, simulation restatements, and audit freeze governance.

---

### Module 08: Revenue Cycle Management (RCM) & Clearinghouse EDI (Phases 80 - 89)
- **Phase 80: Claims Model** (`80_CLAIMS_MODEL.md`)
  - UB-04 (CMS-1450) Institutional and CMS-1500 Professional claim headers, line-item charges, revenue codes, and claim lifecycle.
- **Phase 81: EDI 837 Ingestion & Clearinghouse Integration** (`81_837_INGESTION.md`)
  - ANSI ASC X12 837I/837P parsing, WEDI SNIP levels 1–4 validation, clearinghouse 999 acknowledgement, and 277CA status tracking.
- **Phase 82: EDI 835 Remittance Advice Ingestion** (`82_835_REMITTANCE_INGESTION.md`)
  - ANSI ASC X12 835 Electronic Remittance Advice (ERA), CLP claim payment loops, CAS adjustment segments, and automated posting.
- **Phase 83: Payments, Contractual Adjustments & Cash Posting** (`83_PAYMENTS_AND_ADJUSTMENTS.md`)
  - Bank deposit batch balancing, EFT/trace matching, contractual write-off posting (CO-45), suspense holding, and dual-auth refunds.
- **Phase 84: CARC & RARC Denial Intelligence Matrix** (`84_CARC_RARC_MODEL.md`)
  - WEDI Claim Adjustment Reason Codes (CARC) and Remittance Advice Remark Codes (RARC) normalization, recovery scoring, and action routing.
- **Phase 85: Denials Management & Ownership** (`85_DENIALS_MODEL.md`)
  - Clinical vs. technical denial taxonomy, appeal deadline countdowns, dollar exposure prioritization, and team work queues.
- **Phase 86: Appeals Workflow & Dispute Management** (`86_APPEALS_WORKFLOW.md`)
  - 3-tier statutory appeal levels (Reconsideration, Formal Payer Appeal, External/ALJ), evidence packet compilation, and settlement tracking.
- **Phase 87: Patient Responsibility, Balances & Collections** (`87_PATIENT_BALANCES.md`)
  - Post-adjudication patient liability (copay, coinsurance, deductible), 5-tier GAAP aging schedules, payment plans, and pre-collection workflows.
- **Phase 88: AR Aging & Collector Work Queues** (`88_AR_AGING.md`)
  - Dual aging schedules (Date of Service & Bill Date), Days Sales Outstanding (DSO) calculation, and priority collector work queues.
- **Phase 89: Claim, Remittance & Payment Reconciliation Engine** (`89_RECONCILIATION_ENGINE.md`)
  - Four-way financial balancing (Billed $\leftrightarrow$ Remittance $\leftrightarrow$ Bank Deposit $\leftrightarrow$ Patient Balance), discrepancy resolution, and clean match rate.

---

### Module 09: Master Revenue Leakage Engine (Phase 90)
- **Phase 90: Master Revenue Leakage Engine** (`90_REVENUE_LEAKAGE_ENGINE.md`)
  - Master rule governance across 6 core surgical ASC leakage categories (Unbilled Implants, Secondary CPTs, Modifier Omissions, Contract Underpayments, Timely Filing Cutoffs, Missing Dictations).
  - Algorithmic expected recovery scoring: $\text{expected} = \text{potential} \times (\text{probability} / 100.0)$.
  - Dynamic Priority Score ($0.0 - 100.0$) weighting dollar exposure, recovery probability, and statutory filing deadline urgency.
  - 7-state auditable lifecycle state machine: `DETECTED` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `VALIDATED` $\rightarrow$ `REBILL_SUBMITTED` $\rightarrow$ `RECOVERED`.
  - Surgeon and specialty scorecards identifying root-cause clinical documentation and coding deficiencies.

---

## Complete Verification & Build Status

- **Total Test Suites**: 42 suites
- **Total Automated Tests**: 93 passed, 0 failed
- **Maestro Clinical Design System**: Strictly 0 forbidden tokens (no purple, violet, indigo, magenta, or fuchsia)
- **Production Build**: Clean compilation in `10.65s` via Vite/Rolldown with 0 errors
- **Git Branch**: `feature/phase-80-claims-model`
- **Working Tree**: Clean and up to date

