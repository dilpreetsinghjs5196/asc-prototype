import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  preferenceCardService,
  CARD_STATUSES,
  ITEM_CATEGORIES,
  STAGING_BEHAVIORS,
  READINESS_STATUSES,
  DISPOSITION_CODES,
  SUBSTITUTION_TIERS
} from '../src/lib/preferenceCardService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 034 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 58 — Database Migration 034: DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '034_surgeon_preference_cards.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '034_surgeon_preference_cards_down.sql');

  await t.test('Migration 034 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(upMigrationPath), '034_surgeon_preference_cards.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '034_surgeon_preference_cards_down.sql must exist');
    const upSql = fs.readFileSync(upMigrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');
    assert.ok(upSql.length > 5000, 'Up migration must be substantive (>5000 bytes)');
    assert.ok(downSql.length > 400, 'Down migration must be substantive (>400 bytes)');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');
  const downSql = fs.readFileSync(downMigrationPath, 'utf8');

  await t.test('Creates public.surgeon_preference_cards table with procedural keying', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.surgeon_preference_cards/);
    assert.match(upSql, /facility_id UUID REFERENCES public\.facilities/);
    assert.match(upSql, /surgeon_id BIGINT NOT NULL REFERENCES public\.surgeons/);
    assert.match(upSql, /card_code VARCHAR\(50\)/);
    assert.match(upSql, /card_name VARCHAR\(150\)/);
    assert.match(upSql, /primary_cpt VARCHAR\(10\)/);
    assert.match(upSql, /estimated_duration_minutes INTEGER/);
    assert.match(upSql, /turnover_time_minutes INTEGER/);
    assert.match(upSql, /is_active BOOLEAN/);
    assert.match(upSql, /is_house_card BOOLEAN/);
    assert.match(upSql, /CONSTRAINT chk_card_code_format/);
  });

  await t.test('Creates public.surgeon_preference_card_revisions table with audit & separation of duties', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.surgeon_preference_card_revisions/);
    assert.match(upSql, /card_id UUID NOT NULL REFERENCES public\.surgeon_preference_cards/);
    assert.match(upSql, /revision_number INTEGER NOT NULL/);
    assert.match(upSql, /status VARCHAR\(30\)/);
    assert.match(upSql, /effective_from DATE NOT NULL/);
    assert.match(upSql, /approved_by UUID REFERENCES auth\.users/);
    assert.match(upSql, /approved_at TIMESTAMPTZ/);
    assert.match(upSql, /created_by UUID REFERENCES auth\.users/);
    assert.match(upSql, /CONSTRAINT chk_revision_approval/);
  });

  await t.test('Creates public.preference_card_items table with OPEN vs HOLD staging governance', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.preference_card_items/);
    assert.match(upSql, /revision_id UUID NOT NULL REFERENCES public\.surgeon_preference_card_revisions/);
    assert.match(upSql, /item_category VARCHAR\(30\)/);
    assert.match(upSql, /sku_id UUID REFERENCES public\.implant_product_skus/);
    assert.match(upSql, /component_id UUID REFERENCES public\.implant_components/);
    assert.match(upSql, /staging_behavior VARCHAR\(20\)/);
    assert.match(upSql, /CHECK\s*\(staging_behavior IN \('OPEN',\s*'HOLD'\)\)/);
    assert.match(upSql, /CHECK\s*\(planned_quantity >= 1\)/);
  });

  await t.test('Creates public.preference_card_substitutions table with clinical tiers', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.preference_card_substitutions/);
    assert.match(upSql, /preference_card_item_id UUID NOT NULL REFERENCES public\.preference_card_items/);
    assert.match(upSql, /substitute_sku_id UUID REFERENCES public\.implant_product_skus/);
    assert.match(upSql, /substitution_tier VARCHAR\(30\)/);
    assert.match(upSql, /is_auto_substitute_allowed BOOLEAN/);
    assert.match(upSql, /clinical_justification TEXT/);
  });

  await t.test('Creates public.case_preference_snapshots and case_preference_reconciliations', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.case_preference_snapshots/);
    assert.match(upSql, /readiness_status VARCHAR\(30\)/);
    assert.match(upSql, /snapshot_payload JSONB NOT NULL/);

    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.case_preference_reconciliations/);
    assert.match(upSql, /planned_staging VARCHAR\(20\)/);
    assert.match(upSql, /disposition_code VARCHAR\(40\)/);
    assert.match(upSql, /waste_estimated_cost NUMERIC\(10,\s*2\)/);
  });

  await t.test('Alters public.surgeries and public.case_devices for preference tracking', () => {
    assert.match(upSql, /ALTER TABLE public\.surgeries/);
    assert.match(upSql, /preference_card_revision_id/);
    assert.match(upSql, /preference_readiness_status/);

    assert.match(upSql, /ALTER TABLE public\.case_devices/);
    assert.match(upSql, /preference_card_item_id/);
    assert.match(upSql, /preference_snapshot_id/);
  });

  await t.test('Creates public.fn_resolve_case_preference_card stored procedure', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_resolve_case_preference_card/);
    assert.match(upSql, /p_facility_id UUID/);
    assert.match(upSql, /p_surgeon_id BIGINT/);
    assert.match(upSql, /p_cpt_code VARCHAR/);
  });

  await t.test('Enforces Row-Level Security (RLS) on all 7 tables with get_auth_user_facilities', () => {
    assert.match(upSql, /ALTER TABLE public\.surgeon_preference_cards ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.surgeon_preference_card_revisions ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.preference_card_items ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.case_preference_snapshots ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /ALTER TABLE public\.case_preference_reconciliations ENABLE ROW LEVEL SECURITY;/);
    assert.match(upSql, /get_auth_user_facilities\(\)/);
  });

  await t.test('Down migration drops all created procedures, columns, and 7 tables in reverse order', () => {
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_resolve_case_preference_card/);
    assert.match(downSql, /ALTER TABLE IF EXISTS public\.case_devices/);
    assert.match(downSql, /ALTER TABLE IF EXISTS public\.surgeries/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.case_preference_reconciliations CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.case_preference_snapshots CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.preference_card_substitutions CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.preference_card_items CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.preference_card_procedures CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.surgeon_preference_card_revisions CASCADE;/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.surgeon_preference_cards CASCADE;/);
  });
});

// ==============================================================================
// SUITE 2: CLIENT SERVICE LAYER (preferenceCardService.js)
// ==============================================================================

test('Phase 58 — Client Service Layer (preferenceCardService.js)', async (t) => {
  await t.test('Exports frozen domain constants', () => {
    assert.ok(CARD_STATUSES.includes('active'));
    assert.ok(CARD_STATUSES.includes('draft'));
    assert.ok(CARD_STATUSES.includes('pending_approval'));

    assert.ok(ITEM_CATEGORIES.includes('IMPLANT'));
    assert.ok(ITEM_CATEGORIES.includes('STERILE_DISPOSABLE'));
    assert.ok(ITEM_CATEGORIES.includes('INSTRUMENT_TRAY'));
    assert.ok(ITEM_CATEGORIES.includes('CAPITAL_EQUIPMENT'));

    assert.deepEqual(STAGING_BEHAVIORS, ['OPEN', 'HOLD']);

    assert.ok(READINESS_STATUSES.includes('CASE_READY'));
    assert.ok(READINESS_STATUSES.includes('ITEMS_PULLED'));
    assert.ok(READINESS_STATUSES.includes('SUPPLY_BREACH'));

    assert.ok(DISPOSITION_CODES.includes('EXACT_MATCH'));
    assert.ok(DISPOSITION_CODES.includes('OPENED_CONTAMINATED_WASTE'));
    assert.ok(DISPOSITION_CODES.includes('UNPLANNED_ADDITION'));

    assert.ok(SUBSTITUTION_TIERS.includes('TIER_1_OEM_EQUIVALENT'));
    assert.ok(SUBSTITUTION_TIERS.includes('TIER_2_CONTRACT_FORMULARY'));
  });

  await t.test('getPreferenceCards retrieves baseline cards with filters', async () => {
    const res = await preferenceCardService.getPreferenceCards({
      facilityId: '00000000-0000-0000-0000-000000000002',
      primaryCpt: '27447'
    });
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.cards));
    assert.ok(res.cards.length >= 1);
    assert.equal(res.cards[0].cardCode, 'PREF-ORTHO-TKA-01');
    assert.equal(res.cards[0].primaryCpt, '27447');
  });

  await t.test('getPreferenceCardById retrieves single card with revisions', async () => {
    const res = await preferenceCardService.getPreferenceCardById('00000000-0000-0000-0058-000000000001');
    assert.equal(res.success, true);
    assert.ok(res.card);
    assert.equal(res.card.cardCode, 'PREF-ORTHO-TKA-01');
    assert.ok(res.card.revisions.length >= 1);
  });

  await t.test('getCardRevisionDetails returns revision items and substitutions', async () => {
    const res = await preferenceCardService.getCardRevisionDetails('00000000-0000-0000-0058-000000000101');
    assert.equal(res.success, true);
    assert.ok(res.revision);
    assert.equal(res.revision.revisionNumber, 1);
    assert.ok(res.revision.items.length >= 4);

    const femoralItem = res.revision.items.find(i => i.catalogNumber === '5520-F-401');
    assert.ok(femoralItem);
    assert.equal(femoralItem.stagingBehavior, 'HOLD');
    assert.equal(femoralItem.substitutions.length, 1);
    assert.equal(femoralItem.substitutions[0].substitutionTier, 'TIER_2_CONTRACT_FORMULARY');
  });

  await t.test('saveCardDraft validates mandatory fields and creates draft revision', async () => {
    await assert.rejects(
      async () => {
        await preferenceCardService.saveCardDraft({ cardCode: '' });
      },
      /Card code, card name, and primary CPT are required/
    );

    const created = await preferenceCardService.saveCardDraft({
      cardCode: 'PREF-TEST-CPT-99',
      cardName: 'Test Procedure Preference Card',
      primaryCpt: '29881',
      specialty: 'Orthopedics',
      surgeonId: 1
    });

    assert.equal(created.success, true);
    assert.equal(created.card.cardCode, 'PREF-TEST-CPT-99');
    assert.equal(created.card.revisions[0].status, 'draft');
  });

  await t.test('submitForApproval transitions draft to pending_approval', async () => {
    // Create draft
    const card = await preferenceCardService.saveCardDraft({
      cardCode: 'PREF-SUBMIT-TEST',
      cardName: 'Approval Test Card',
      primaryCpt: '27447',
      specialty: 'Orthopedics',
      surgeonId: 1
    });
    const revId = card.card.revisions[0].id;

    const submitted = await preferenceCardService.submitForApproval(revId, 'Ready for clinical signoff');
    assert.equal(submitted.success, true);
    assert.equal(submitted.revision.status, 'pending_approval');
  });

  await t.test('approveCardRevision activates revision and enforces separation of duties', async () => {
    const card = await preferenceCardService.saveCardDraft({
      cardCode: 'PREF-SOD-TEST',
      cardName: 'Separation of Duties Test',
      primaryCpt: '27447',
      specialty: 'Orthopedics',
      surgeonId: 1
    });
    const rev = card.card.revisions[0];
    rev.createdBy = 'user-author-123';
    await preferenceCardService.submitForApproval(rev.id);

    // Same user cannot approve
    await assert.rejects(
      async () => {
        await preferenceCardService.approveCardRevision(rev.id, 'Self-approval attempt', 'user-author-123');
      },
      /SEPARATION_OF_DUTIES_VIOLATION/
    );

    // Independent clinical director can approve
    const approved = await preferenceCardService.approveCardRevision(rev.id, 'Clinical Director Signoff', 'user-cfo-999');
    assert.equal(approved.success, true);
    assert.equal(approved.revision.status, 'active');
  });

  await t.test('addCardItem and removeCardItem enforce staging and quantity', async () => {
    const revId = '00000000-0000-0000-0058-000000000101';

    await assert.rejects(
      async () => {
        await preferenceCardService.addCardItem(revId, {
          itemCategory: 'IMPLANT',
          customItemName: 'Zero Qty Item',
          plannedQuantity: 0
        });
      },
      /Planned quantity must be greater than zero/
    );

    const added = await preferenceCardService.addCardItem(revId, {
      itemCategory: 'SUTURE',
      customItemName: 'Vicryl 2-0 CT-1 Suture Box',
      stagingBehavior: 'OPEN',
      plannedQuantity: 2,
      unitOfMeasure: 'BOX'
    });
    assert.equal(added.success, true);
    assert.equal(added.item.stagingBehavior, 'OPEN');

    const removed = await preferenceCardService.removeCardItem(added.item.id);
    assert.equal(removed.success, true);
  });

  await t.test('configureSubstitution attaches pre-approved alternative to BOM item', async () => {
    const itemId = '00000000-0000-0000-0058-000000001002'; // Drape pack
    const sub = await preferenceCardService.configureSubstitution(itemId, {
      substituteItemName: 'Halyard Health Orthopedic Drape Set',
      substituteCatalogNumber: 'HH-88421',
      substitutionTier: 'TIER_1_OEM_EQUIVALENT',
      clinicalJustification: 'Exact barrier fabric match'
    });
    assert.equal(sub.success, true);
    assert.equal(sub.substitution.substitutionTier, 'TIER_1_OEM_EQUIVALENT');
  });

  await t.test('resolveCasePreferenceCard resolves hierarchically', async () => {
    // 1. Surgeon + CPT match at Naples Facility
    const match = await preferenceCardService.resolveCasePreferenceCard({
      facilityId: '00000000-0000-0000-0000-000000000002',
      surgeonId: 1,
      primaryCpt: '27447'
    });
    assert.equal(match.success, true);
    assert.equal(match.matched, true);
    assert.equal(match.matchTier, 'SURGEON_FACILITY_CARD');
    assert.equal(match.cardCode, 'PREF-ORTHO-TKA-01');

    // 2. House Card fallback for CPT 66984
    const houseMatch = await preferenceCardService.resolveCasePreferenceCard({
      facilityId: '00000000-0000-0000-0000-000000000002',
      surgeonId: 999, // Unmatched surgeon
      primaryCpt: '66984'
    });
    assert.equal(houseMatch.success, true);
    assert.equal(houseMatch.matchTier, 'FACILITY_HOUSE_CARD');
  });

  await t.test('Pre-Op Readiness list and freeze snapshot', async () => {
    const readiness = await preferenceCardService.getCaseReadinessList();
    assert.equal(readiness.success, true);
    assert.ok(readiness.cases.length >= 3);

    const frozen = await preferenceCardService.freezeCasePreferenceSnapshot(101);
    assert.equal(frozen.success, true);
    assert.equal(frozen.readinessStatus, 'CASE_READY');
  });

  await t.test('Post-Op consumption reconciliation ledger and variance analytics', async () => {
    const ledger = await preferenceCardService.getCaseReconciliationLedger();
    assert.equal(ledger.success, true);
    assert.ok(ledger.entries.length >= 4);
    assert.ok(ledger.totalWasteCost > 0);

    const analytics = await preferenceCardService.getSurgeonVarianceAnalytics({ surgeonId: 1 });
    assert.ok(analytics.readinessOnTimeRate >= 90);
    assert.ok(analytics.openVsHoldComplianceRate >= 95);
  });

  await t.test('All preferenceCardService methods are wired onto db singleton', () => {
    assert.equal(typeof db.getPreferenceCards, 'function');
    assert.equal(typeof db.getPreferenceCardById, 'function');
    assert.equal(typeof db.getCardRevisionDetails, 'function');
    assert.equal(typeof db.saveCardDraft, 'function');
    assert.equal(typeof db.submitForApproval, 'function');
    assert.equal(typeof db.approveCardRevision, 'function');
    assert.equal(typeof db.cloneCardToNewDraft, 'function');
    assert.equal(typeof db.addCardItem, 'function');
    assert.equal(typeof db.removeCardItem, 'function');
    assert.equal(typeof db.configureSubstitution, 'function');
    assert.equal(typeof db.resolveCasePreferenceCard, 'function');
    assert.equal(typeof db.getCaseReadinessList, 'function');
    assert.equal(typeof db.freezeCasePreferenceSnapshot, 'function');
    assert.equal(typeof db.getCaseReconciliationLedger, 'function');
    assert.equal(typeof db.getSurgeonVarianceAnalytics, 'function');
  });
});

// ==============================================================================
// SUITE 3: UI COMPONENT & MAESTRO GUIDELINE COMPLIANCE
// ==============================================================================

test('Phase 58 — UI Component & Maestro Guideline Compliance', async (t) => {
  const jsxPath = path.join(rootDir, 'src', 'components', 'SurgeonPreferenceCards.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'SurgeonPreferenceCards.css');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  await t.test('SurgeonPreferenceCards.jsx and CSS exist and are populated', () => {
    assert.ok(fs.existsSync(jsxPath), 'SurgeonPreferenceCards.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'SurgeonPreferenceCards.css must exist');
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(jsx.length > 5000, 'JSX must be substantive');
    assert.ok(css.length > 3000, 'CSS must be substantive');
  });

  await t.test('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/magenta/fuchsia tokens)', () => {
    const jsx = fs.readFileSync(jsxPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const combined = `${jsx}\n${css}`.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

    const purpleKeywords = /\b(purple|violet|fuchsia|magenta|indigo)\b/i;
    const purpleHexes = /#(7c3aed|8b5cf6|a855f7|9333ea|c084fc|d8b4fe|e9d5ff|6366f1|4f46e5|818cf8|a5b4fc|c7d2fe)/i;

    assert.ok(!purpleKeywords.test(combined), 'Found banned purple/violet keyword in Phase 58 UI files');
    assert.ok(!purpleHexes.test(combined), 'Found banned purple/violet hex code in Phase 58 UI files');
  });

  await t.test('App.jsx integrates SurgeonPreferenceCards in sidebar navigation, subtitle, and tab render', () => {
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.match(appContent, /import SurgeonPreferenceCards from '\.\/components\/SurgeonPreferenceCards';/);
    assert.match(appContent, /activeTab === 'surgeon_preference_cards'/);
    assert.match(appContent, /<SurgeonPreferenceCards/);
    assert.match(appContent, /Preference Cards/);
  });
});
