# G4 DUPLICATE AND MATCHING RULES

## Purpose
Phase G4 establishes the enterprise **Duplicate Detection, Deterministic Record Matching, Field Survivorship, and Confidence Governance** engine across Module 16 (Data Quality Governance) for ASCANALYST. Upstream integrations across SIS/HST EHRs, Clearinghouse EDI (837/835), Vendor Invoices (810/CSV), and Inventory POU can ingest overlapping patients, surgical encounters, claims, vendors, invoices, and implant SKUs under slightly different aliases or keys. Left unresolved, duplicate records distort revenue leakage, double-count case costs, corrupt surgeon scorecards, and risk compliance or overbilling errors. Phase G4 provides deterministic weighted matching, threshold-gated classification, field-level survivorship into Golden Master records, and reversible merge/unmerge audit provenance.

---

## Scope
- Define production requirements for **Duplicate and Matching Rules (Phase G4)**:
  1. **Tenant Threshold Configuration (`dmr_configs`)**: Facility auto-merge (`>=95.00%`), manual review (`75.00%–94.99%`), distinct (`<75.00%`), exact-collision blocking toggles, cross-source blocking toggle, and masked secret metadata (`dmr_sec_****_...`).
  2. **Deterministic Matching Rules & Weight Conservation (`dmr_matching_rules`)**: Entity-specific blocking keys and field similarity weights summing strictly to `100.00%` across `PATIENT`, `SURGICAL_CASE`, `CLAIM`, `VENDOR`, `VENDOR_INVOICE`, and `IMPLANT_SKU`.
  3. **Survivorship Precedence Policies (`dmr_survivorship_policies`)**: Per-entity source precedence ranking (`SIS_EHR > HST_EHR > CLEARINGHOUSE_EDI > VENDOR_INVOICE > INVENTORY_POU > EXCEL_CSV`), field survivorship rules (`SOURCE_SYSTEM_RANK`, `MOST_RECENT_VERIFIED`, `MOST_COMPLETE_NON_NULL`, `MAX_FINANCIAL_PRECISION`), and deterministic tie-breakers.
  4. **Candidate Pair Queue (`dmr_candidate_pairs`)**: Side-by-side candidate pair comparison with deterministic confidence scores, field-level match breakdowns, financial exposure tracking, and explicit workflow transitions (`PENDING_REVIEW`, `AUTO_MERGED`, `MANUALLY_MERGED`, `CONFIRMED_DISTINCT`, `DEFERRED_HOLD`, `REVERSED`).
  5. **Golden Master Records (`dmr_golden_records`)**: Survived canonical master payloads with field-level provenance (`winning_source`, `strategy_applied`) and source lineage tracking.
  6. **Immutable Merge/Unmerge History (`dmr_merge_history`) & Batch Scan Runs (`dmr_match_runs`)**: Full before/after JSON snapshots supporting reversible unmerge actions and 64-character SHA-256 cryptographic seals (`sha256_dmr_`).
- Preserve full compatibility with existing `src/lib/vendorService.js#checkDuplicateCandidates` for synchronous inline Vendor Master form checks.
- Enforce organization/facility tenancy via RLS (`app.current_facility_id`), RBAC governance, and Maestro clinical design tokens (strictly Slate, Emerald, Sky, Amber, Rose; zero prohibited accent tokens).

---

## Current State

| Component | Status | Classification | Description |
| :--- | :--- | :--- | :--- |
| `src/lib/vendorService.js` (`checkDuplicateCandidates`) | Exists | **REFACTOR / KEEP** | Provides synchronous inline vendor duplicate warning (>85% Jaro/token overlap) inside `ImplantVendorMaster.jsx`. Kept for inline modal UX; superseded for cross-module matching and survivorship by G4. |
| `src/services/vendorInvoiceService.js` (`ERR_DUPLICATE_INVOICE`) | Exists | **KEEP** | Flags duplicate vendor invoices during Phase F9 import validation; feeds candidate alerts into G4/G3. |
| `src/agents/patient/PatientIntakeAgent.js` | Partial Stub | **REPLACE** | Contains placeholder `duplicateCheck` flag without deterministic EMPI scoring or survivorship. Replaced by G4 deterministic `PATIENT` matching rules. |
| `src/services/importExceptionQueueService.js` | Exists | **KEEP** | Phase G3 exception queue handling import holds and payload repair replay; coordinates with G4 when duplicate blocks quarantine a row. |
| `public.dmr_*` tables (7 tables + telemetry view) | Non-existent | **MISSING** | Configs, matching rules, survivorship policies, candidate pairs, golden records, merge history, and match scan runs. |
| `src/services/duplicateMatchingService.js` & facade | Non-existent | **MISSING** | Deterministic matching engine, Jaro-Winkler + Token Jaccard scorer, survivorship builder, and merge/unmerge transaction handlers. |
| `src/components/DuplicateMatchingRulesView.jsx` | Non-existent | **MISSING** | Side-by-side diff comparator, survivorship resolver, golden master directory, and scan audit UI. |

---

## Target State
1. **Deterministic Weighted Scoring & Threshold Classification**:
   - Every candidate pair is evaluated deterministically using normalized field comparators (`EXACT_KEY`, normalized Jaro-Winkler, token Jaccard overlap, numeric/date proximity) weighted by the entity's active rule (weights conserved to `100.00%`).
   - Exact primary key collisions (e.g., identical Tax ID + Vendor Code, identical Patient MRN + DOB, identical Vendor + Normalized Invoice Number, identical Payer Claim Control Number) immediately classify as `EXACT_DUPLICATE` with `100.00%` confidence.
   - Scores classify deterministically into:
     - `EXACT_DUPLICATE` (`>= 95.00%` or hard key collision) → Eligible for `AUTO_MERGE` (or hard import block if `block_exact_collisions = TRUE`).
     - `HIGH_CONFIDENCE_CANDIDATE` (`85.00% – 94.99%`) → Queued for steward confirmation (`PENDING_REVIEW`).
     - `AMBIGUOUS_REVIEW` (`75.00% – 84.99%`) → Manual stewardship review (`PENDING_REVIEW`).
     - `DISTINCT_NON_MATCH` (`< 75.00%`) → Left distinct (`NO_OP`).
2. **Deterministic Field Survivorship**:
   - Merging Record A and Record B produces a `dmr_golden_records` payload where every attribute records exact provenance (`winning_source`, `strategy_applied`) and honors explicit human steward overrides before saving.
3. **Full Reversibility (Unmerge)**:
   - Every merge stores `before_state_json` and `after_state_json` inside `dmr_merge_history`. Authorized stewards can execute an audited `UNMERGE_REVERT` with a mandatory reason, restoring source lineage and transitioning the pair to `REVERSED`.

---

## Data Model / Schema
Defined in `supabase/migrations/136_duplicate_and_matching_rules.sql` (and rollback `136_duplicate_and_matching_rules_down.sql`):
1. `public.dmr_configs`: Facility thresholds (`auto_merge_threshold NUMERIC(5,2) DEFAULT 95.00`, `manual_review_threshold NUMERIC(5,2) DEFAULT 75.00`), blocking toggles, masked engine secret, sync/health statuses.
2. `public.dmr_matching_rules`: `rule_code`, `entity_type`, `blocking_keys_json`, `field_weights_json`, `match_algorithm`, `exact_override_threshold`, `version_tag`, `is_active`.
3. `public.dmr_survivorship_policies`: `entity_type`, `source_precedence_json`, `field_strategies_json`, `tie_breaker_strategy`, `allow_manual_override`, `version_tag`.
4. `public.dmr_candidate_pairs`: `pair_code`, `entity_type`, `source_record_a_id`, `source_module_a`, `record_a_snapshot_json`, `source_record_b_id`, `source_module_b`, `record_b_snapshot_json`, `confidence_score`, `match_classification`, `matched_fields_json`, `score_breakdown_json`, `resolution_status`, `golden_record_id`, `financial_exposure_usd`, `reviewed_by`, `reviewed_at`, `review_reason`, `sha256_sync_seal VARCHAR(128)`.
5. `public.dmr_golden_records`: `golden_code`, `entity_type`, `canonical_key`, `survived_payload_json`, `field_provenance_json`, `merged_source_count`, `lineage_source_ids_json`, `confidence_score`, `is_active`, `sha256_sync_seal VARCHAR(128)`.
6. `public.dmr_merge_history`: `pair_id`, `golden_record_id`, `action_type` (`AUTO_MERGE`, `MANUAL_MERGE`, `CONFIRM_DISTINCT`, `UNMERGE_REVERT`, `SURVIVORSHIP_OVERRIDE`), `actor_email`, `actor_role`, `before_state_json`, `after_state_json`, `reason`, `rule_version`, `sha256_seal VARCHAR(128)`.
7. `public.dmr_match_runs`: `batch_control_number`, `entity_scope`, `records_scanned`, `pairs_evaluated`, `exact_duplicates_found`, `candidates_queued`, `auto_merged_count`, `duration_ms`, `executed_by`, `sha256_sync_seal VARCHAR(128)`.
- Telemetry view: `public.vw_dmr_telemetry`.
- Tenant isolation enforced across all 7 tables via `ENABLE ROW LEVEL SECURITY` and `app.current_facility_id` policies.

---

## Business Rules

### Rule 1: Rule Weight Conservation
All active `field_weights_json` maps for a matching rule must sum strictly to **100.00%** ($\pm 0.01\%$ floating tolerance). Non-conserving weight configs raise `ERR_DMR_INVALID_WEIGHT_SUM`.

### Rule 2: Threshold Ordering Guard
`auto_merge_threshold` must always be strictly greater than `manual_review_threshold` (`auto_merge_threshold > manual_review_threshold`), bounded cleanly within `[50.00, 100.00]`.

### Rule 3: Mandatory Audit Reason for Distinct Dismissal or Unmerge
Confirming a candidate pair as distinct (`CONFIRMED_DISTINCT`) or reverting an existing merge (`UNMERGE_REVERT` → `REVERSED`) requires a reason of at least 5 characters (`ERR_DMR_REASON_REQUIRED`).

### Rule 4: Deterministic Transition Guardrails
- Only `PENDING_REVIEW` and `DEFERRED_HOLD` pairs can transition to `MANUALLY_MERGED`, `AUTO_MERGED`, or `CONFIRMED_DISTINCT`.
- Only `MANUALLY_MERGED` or `AUTO_MERGED` pairs can transition to `REVERSED` via `revertGoldenMerge`.
- Illegal state transitions raise `ERR_DMR_INVALID_TRANSITION`.

### Rule 5: Cryptographic SHA-256 Provenance
Every candidate evaluation, golden master write, merge/unmerge log, and scan run receives an exact **64-character** SHA-256 seal formatted as `sha256_dmr_` + 53 hexadecimal characters.

---

## Permissions / Security
- Facility-level RLS (`app.current_facility_id`) prevents cross-facility candidate pairing or cross-tenant golden record merging.
- Engine/webhook secrets masked strictly as `dmr_sec_****_...`.
- RBAC Matrix:
  - `Data Operations Steward` / `Facility Administrator`: Configure matching thresholds, update rule weights, approve manual merges, execute batch match scans, and perform audited unmerge reversals.
  - `Domain Owners` (`RCM Billing Lead`, `Materials Manager`, `Controller`, `Clinical Nursing Director`): Inspect side-by-side diffs, confirm distinct non-matches, or propose survivorship overrides within their entity domain.
  - `Auditor` / `Financial Analyst` / `AI Analyst`: Read-only access to candidate queues, golden masters, confidence formulas, and `dmr_merge_history` provenance. AI tools share identical read-only RBAC constraints and cannot auto-merge below threshold or mutate without steward approval.

---

## API / Service Requirements
Implemented in `src/services/duplicateMatchingService.js` and re-exported via `src/lib/duplicateMatchingService.js`:
- `normalizeFacilityId(facilityInput)`
- `computeDmrProvenanceSeal(payload)`
- `maskDmrSecret(rawSecret)`
- `validateRuleFieldWeights(fieldWeights)`
- `normalizeMatchString(value)`
- `computeJaroWinklerSimilarity(a, b)`
- `computeTokenJaccardSimilarity(a, b)`
- `evaluateRecordPairMatch(entityType, recordA, recordB, configOverride)`
- `resolveFieldSurvivorship(recordA, recordB, survivorshipPolicy, fieldOverrides)`
- `getDmrConfig(facilityInput)` / `updateDmrConfig(facilityInput, updates)`
- `getDmrTelemetry(facilityInput)`
- `getDmrMatchingRules(facilityInput)`
- `getDmrSurvivorshipPolicies(facilityInput)`
- `getDmrCandidatePairs(facilityInput, filters)`
- `getDmrGoldenRecords(facilityInput)`
- `getDmrMergeHistory(facilityInput)`
- `getDmrMatchRuns(facilityInput)`
- `runDuplicateMatchScan(facilityInput, options)`
- `mergeCandidatePair(facilityInput, pairId, options)`
- `markCandidatePairDistinct(facilityInput, pairId, options)`
- `revertGoldenMerge(facilityInput, pairId, options)`

---

## UI / Workflow Requirements
Implemented in `src/components/DuplicateMatchingRulesView.jsx` & `DuplicateMatchingRulesView.css`:
- **4-Card Telemetry Ribbon**: Pending Review Pairs, Auto-Merged / Protected Exposure ($), Active Golden Masters, and Latest Scan Confidence & Seal.
- **Filter Controls**: Entity type selector (`ALL`, `PATIENT`, `SURGICAL_CASE`, `CLAIM`, `VENDOR`, `VENDOR_INVOICE`, `IMPLANT_SKU`), resolution status filter, and instant search bar.
- **4 Interactive Subtabs**:
  1. *Candidate Queue & Diff Comparator*: Left candidate list + right side-by-side Record A vs. Record B attribute comparator, weighted confidence badge, manual field survivor toggles, **Merge to Golden Master**, **Confirm Distinct**, and **Revert Merge (Unmerge)** actions.
  2. *Matching Rules & Weight Matrix*: Blocking keys, algorithm classification, and 100%-conserved attribute weights per entity.
  3. *Golden Master & Survivorship*: Canonical survived records with source provenance badges and lineage counts.
  4. *Scan Runs & Audit History*: Batch deduplication run history and immutable before/after `dmr_merge_history` ledger.
- **Threshold Configuration Modal**: Interactive configuration for auto-merge threshold, manual review floor, exact-collision blocking, and cross-source blocking.

---

## Audit / Provenance
Every state mutation (`AUTO_MERGE`, `MANUAL_MERGE`, `CONFIRM_DISTINCT`, `UNMERGE_REVERT`) appends an immutable `dmr_merge_history` record containing actor email, role, rule version tag (`dmr-v1.0.0`), complete `before_state_json` & `after_state_json`, mandatory justification reason (for dismissals/unmerges), timestamp, and a 64-character `sha256_dmr_` cryptographic seal.

---

## QA / Test Cases
Defined in `tests/duplicate-and-matching-rules.test.js` (12 automated test suites covering):
1. Facility telemetry accuracy & SHA-256 prefix compliance (`sha256_dmr_`).
2. Facility UUID alias resolution across strings and objects.
3. Configuration retrieval, threshold bounds, and masked secret checks.
4. Matching rule weight conservation validator (`=== 100.00%`, rejects imbalanced sums).
5. Deterministic `evaluateRecordPairMatch` exact collision (`100.00` `EXACT_DUPLICATE`), fuzzy candidate (`HIGH_CONFIDENCE_CANDIDATE` / `AMBIGUOUS_REVIEW`), and distinct rejection (`DISTINCT_NON_MATCH`).
6. Deterministic `resolveFieldSurvivorship` source precedence ranking and field-level override provenance.
7. Manual merge execution creates active Golden Master, updates pair to `MANUALLY_MERGED`, and appends SHA-256 sealed `MANUAL_MERGE` audit log.
8. Confirming distinct enforces >=5 char reason (`ERR_DMR_REASON_REQUIRED`) and records `CONFIRMED_DISTINCT`.
9. Unmerge / revert workflow restores pre-merge state cleanly to `REVERSED` and logs `UNMERGE_REVERT`.
10. Batch scan execution creates `dmr_match_runs` record with 64-char SHA-256 seal & dual-facade parity (`src/services/` vs `src/lib/`).
11. Migration 136 UP/DOWN SQL structural integrity (all 7 tables, view, RLS policies, clean DOWN teardown).
12. Zero prohibited color tokens (`purple`, `violet`, `indigo`, `magenta`, `fuchsia`) across all G4 code/styles + `src/App.jsx` shell wiring.

---

## Acceptance Criteria
- Production Vite build (`npm run build`) passes cleanly with zero errors.
- Full test suite across all Data Integration & Data Quality modules (F0–F9, G0–G4, Phase 76) passes with zero failures.
- No hardcoded mock claims presented as live production facts; deterministic scoring is reproducible from rule configs and field comparators.
- Facility isolation enforced via `facility_id` scoping and RLS policies.
- Strict zero prohibited accent tokens across components and CSS.

---

## Dependencies
- Upstream Integration Modules: F1 (`importValidationService`), F3–F9 (`sis`, `hst`, `clearinghouse`, `accounting`, `payroll`, `inventory`, `vendorInvoiceService`).
- Upstream Data Quality Modules: G0 (`dataQualityFrameworkService`), G3 (`importExceptionQueueService`).
- Legacy Compatibility: `src/lib/vendorService.js` (`checkDuplicateCandidates`).

---

## Definition of Done
Complete when Migration 136 UP/DOWN SQL, `duplicateMatchingService.js` + `src/lib` facade, `DuplicateMatchingRulesView.jsx`/`.css`, `src/App.jsx` tab wiring, 12/12 G4 unit/integration tests, full regression suite, `npm run build`, and specification updates are verified and committed cleanly to `data-quality-works`.

---

## Implementation Notes
- **Commit Target Branch:** `data-quality-works`
- **Database Migration:** `supabase/migrations/136_duplicate_and_matching_rules.sql` & `136_duplicate_and_matching_rules_down.sql`
- **Service & Facade:** `src/services/duplicateMatchingService.js` & `src/lib/duplicateMatchingService.js`
- **UI & Shell:** `src/components/DuplicateMatchingRulesView.jsx`, `src/components/DuplicateMatchingRulesView.css`, `src/App.jsx` (`duplicate_matching_rules` tab with `GitFork` icon)
- **Verification Test Suite:** `tests/duplicate-and-matching-rules.test.js`
- **Decision Note:** Preserved `src/lib/vendorService.js#checkDuplicateCandidates` for synchronous inline warnings in `ImplantVendorMaster.jsx` while establishing unified cross-entity scoring, survivorship, and reversible golden-master merging in `duplicateMatchingService.js`.
