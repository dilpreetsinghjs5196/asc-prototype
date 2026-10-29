/**
 * tests/cms-payment-indicators-migration.test.js
 * Static Schema & Verification Suite for Migration 037 (Phase 61)
 * CMS Payment Indicators & Statutory Interpretation Engine
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.resolve('supabase/migrations/037_cms_payment_indicators_and_interpretation.sql');
const DOWN_MIGRATION_PATH = path.resolve('supabase/migrations/037_cms_payment_indicators_and_interpretation_down.sql');

describe('Phase 61 — Database Migration 037: CMS Payment Indicators', () => {

  test('1. Migration 037 forward and down SQL files exist and are substantive', () => {
    assert.ok(fs.existsSync(MIGRATION_PATH), 'Migration 037 forward file must exist');
    assert.ok(fs.existsSync(DOWN_MIGRATION_PATH), 'Migration 037 down file must exist');

    const forwardSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    const downSql = fs.readFileSync(DOWN_MIGRATION_PATH, 'utf8');

    assert.ok(forwardSql.length > 2000, 'Forward migration must be substantive');
    assert.ok(downSql.length > 200, 'Down migration must be substantive');
    assert.ok(forwardSql.includes('BEGIN;'), 'Forward migration must be wrapped in a transaction');
    assert.ok(forwardSql.includes('COMMIT;'), 'Forward migration must commit transaction');
  });

  test('2. Creates public.cms_payment_indicator_definitions table with constraints', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cms_payment_indicator_definitions'), 'Must create indicator definitions table');
    assert.ok(sql.includes('release_id UUID NOT NULL REFERENCES public.cms_asc_releases(id)'), 'Must reference cms_asc_releases');
    assert.ok(sql.includes('indicator_code VARCHAR(5) NOT NULL'), 'Must define indicator_code column');
    assert.ok(sql.includes('coverage_category VARCHAR(30) NOT NULL'), 'Must define coverage_category');
    assert.ok(sql.includes('payment_methodology VARCHAR(30) NOT NULL'), 'Must define payment_methodology');
    assert.ok(sql.includes('is_mppr_eligible BOOLEAN NOT NULL DEFAULT true'), 'Must track MPPR eligibility');
    assert.ok(sql.includes('is_device_intensive BOOLEAN NOT NULL DEFAULT false'), 'Must track device-intensity');
    assert.ok(sql.includes('is_packaged BOOLEAN NOT NULL DEFAULT false'), 'Must track packaging');
    assert.ok(sql.includes('is_inpatient_only BOOLEAN NOT NULL DEFAULT false'), 'Must track inpatient-only status');
    assert.ok(sql.includes('CONSTRAINT uq_indicator_release UNIQUE (release_id, indicator_code)'), 'Must enforce uniqueness per release and indicator');
  });

  test('3. Creates public.cms_indicator_claim_rules and overrides tables', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cms_indicator_claim_rules'), 'Must create indicator claim rules table');
    assert.ok(sql.includes('rule_identifier VARCHAR(50) NOT NULL UNIQUE'), 'Must define unique rule_identifier');
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cms_payment_indicator_overrides'), 'Must create indicator overrides table');
    assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'), 'Overrides must reference facility');
  });

  test('4. Extends public.claim_lines with indicator and coverage metadata', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('ALTER TABLE public.claim_lines'), 'Must alter claim_lines table');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS payment_indicator VARCHAR(5)'), 'Must add payment_indicator column');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS coverage_status VARCHAR(30)'), 'Must add coverage_status column');
    assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS is_device_intensive BOOLEAN DEFAULT false'), 'Must add is_device_intensive column');
  });

  test('5. Seeds all 12 statutory CMS ASC payment indicators', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    const expectedPIs = ['A2', 'G2', 'P2', 'P3', 'J8', 'R2', 'Z2', 'K2', 'N1', 'C', 'E5', 'M1'];
    for (const pi of expectedPIs) {
      assert.ok(sql.includes(`'${pi}'`), `Seed must include statutory indicator ${pi}`);
    }

    assert.ok(sql.includes("'Inpatient_Only'"), 'Must seed Inpatient_Only coverage category');
    assert.ok(sql.includes("'Packaged'"), 'Must seed Packaged coverage category');
    assert.ok(sql.includes("'Device_Intensive'"), 'Must seed Device_Intensive payment methodology');
  });

  test('6. Seeds claim scrubbing rules SCRUB-20 through SCRUB-24', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes("'SCRUB-20'"), 'Must seed SCRUB-20 (Inpatient-Only Block)');
    assert.ok(sql.includes("'SCRUB-21'"), 'Must seed SCRUB-21 (Device-Intensive missing implant)');
    assert.ok(sql.includes("'SCRUB-22'"), 'Must seed SCRUB-22 (Standalone Packaged N1)');
    assert.ok(sql.includes("'SCRUB-23'"), 'Must seed SCRUB-23 (Contractor-Priced R2 warning)');
    assert.ok(sql.includes("'SCRUB-24'"), 'Must seed SCRUB-24 (Statutorily Excluded E5)');
  });

  test('7. Deploys authoritative fn_interpret_cms_indicator function', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_interpret_cms_indicator'), 'Must create fn_interpret_cms_indicator');
    assert.ok(sql.includes('p_payment_system VARCHAR(10) DEFAULT \'ASC\''), 'Must accept payment system parameter');
    assert.ok(sql.includes('BLOCK_FATAL'), 'Must support fatal block claim scrub action');
    assert.ok(sql.includes('Unresolved / Unlisted Procedure'), 'Must fail-closed on unlisted procedures');
  });

  test('8. Hardens fn_resolve_medicare_base_rate and eliminates A2 default leak', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('public.fn_interpret_cms_indicator'), 'fn_resolve_medicare_base_rate must invoke fn_interpret_cms_indicator');
    // Verify fail closed on IPO or Non-Covered
    assert.ok(sql.includes('v_is_ipo OR v_cov_stat IN (\'Inpatient_Only\', \'Non_Covered\')'), 'Must immediately halt calculation on IPO or Non-Covered');
  });

  test('9. Enables Row-Level Security (RLS) on all new tables', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('ALTER TABLE public.cms_payment_indicator_definitions ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on definitions');
    assert.ok(sql.includes('ALTER TABLE public.cms_indicator_claim_rules ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on claim rules');
    assert.ok(sql.includes('ALTER TABLE public.cms_payment_indicator_overrides ENABLE ROW LEVEL SECURITY;'), 'Must enable RLS on overrides');
  });

  test('10. Down migration safely rolls back all objects in reverse dependency order', () => {
    const sql = fs.readFileSync(DOWN_MIGRATION_PATH, 'utf8');

    assert.ok(sql.includes('DROP FUNCTION IF EXISTS public.fn_interpret_cms_indicator'), 'Down migration must drop function');
    assert.ok(sql.includes('DROP TABLE IF EXISTS public.cms_payment_indicator_overrides CASCADE;'), 'Down migration must drop overrides');
    assert.ok(sql.includes('DROP TABLE IF EXISTS public.cms_indicator_claim_rules CASCADE;'), 'Down migration must drop rules');
    assert.ok(sql.includes('DROP TABLE IF EXISTS public.cms_payment_indicator_definitions CASCADE;'), 'Down migration must drop definitions');
    assert.ok(sql.includes('DROP COLUMN IF EXISTS payment_indicator'), 'Down migration must drop added columns');
  });
});

