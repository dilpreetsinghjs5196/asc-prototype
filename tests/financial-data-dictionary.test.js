/**
 * Test Suite: Phase 70 — Financial Data Dictionary & Canonical Terminology
 * Validates canonical metrics catalog, zero-substitution ban, completeness states,
 * and Maestro Purple Ban compliance.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
  financialDataDictionaryService, 
  CANONICAL_METRICS, 
  FINANCIAL_CATEGORIES, 
  FINANCIAL_COMPLETENESS_STATUSES 
} from '../src/lib/financialDataDictionaryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 70 — Financial Data Dictionary Verification Suite', () => {

  describe('1. Canonical Metrics Registry & Schema Integrity', () => {
    test('Exports all 30 canonical financial metrics', () => {
      assert.strictEqual(CANONICAL_METRICS.length, 30, 'Must have exactly 30 canonical financial metrics');
    });

    test('Every metric has unique code and required metadata fields', () => {
      const codeSet = new Set();
      CANONICAL_METRICS.forEach(metric => {
        assert.ok(metric.code, 'Metric code must be defined');
        assert.ok(!codeSet.has(metric.code), `Duplicate metric code found: ${metric.code}`);
        codeSet.add(metric.code);

        assert.ok(metric.canonicalName, `Metric ${metric.code} must have canonicalName`);
        assert.ok(metric.category, `Metric ${metric.code} must have category`);
        assert.ok(Object.values(FINANCIAL_CATEGORIES).includes(metric.category), `Invalid category for ${metric.code}`);
        assert.ok(metric.datatype, `Metric ${metric.code} must have datatype`);
        assert.ok(metric.sourceOfTruth, `Metric ${metric.code} must have sourceOfTruth`);
        assert.ok(metric.businessDefinition, `Metric ${metric.code} must have businessDefinition`);
        assert.ok(metric.permittedUsage, `Metric ${metric.code} must specify permittedUsage`);
        assert.ok(metric.prohibitedUsage, `Metric ${metric.code} must specify prohibitedUsage`);
        assert.ok(Array.isArray(metric.consumers) && metric.consumers.length > 0, `Metric ${metric.code} must have consumers`);
      });
    });

    test('Category filtering and search functions operate deterministically', () => {
      const chargeMetrics = financialDataDictionaryService.getMetricsByCategory(FINANCIAL_CATEGORIES.CHARGE);
      assert.ok(chargeMetrics.length >= 3, 'Must find at least 3 charge metrics');
      chargeMetrics.forEach(m => assert.strictEqual(m.category, FINANCIAL_CATEGORIES.CHARGE));

      const marginMetrics = financialDataDictionaryService.getMetricsByCategory(FINANCIAL_CATEGORIES.MARGIN);
      assert.ok(marginMetrics.length >= 4, 'Must find at least 4 margin metrics');

      const searchResults = financialDataDictionaryService.searchMetrics('contribution_margin');
      assert.ok(searchResults.length >= 2, 'Search query must find contribution margin metrics');
    });
  });

  describe('2. Data Completeness & Zero-Substitution Ban', () => {
    test('Encounter with missing implant invoice price evaluates to MISSING_SOURCE_DATA', () => {
      const surgery = { id: 101, status: 'Completed' };
      const calculation = { calculation_status: 'CALCULATED' };
      const devices = [
        { id: 'dev-1', cost: 1890.00 },
        { id: 'dev-2', cost: null } // Missing invoice price
      ];

      const status = financialDataDictionaryService.evaluateEncounterCompleteness(surgery, calculation, devices);
      assert.strictEqual(status.code, 'MISSING_SOURCE_DATA', 'Missing invoice must return MISSING_SOURCE_DATA');
      assert.strictEqual(status.allowsAggregation, false, 'Incomplete data must not be aggregated');
    });

    test('Encounter with unresolved payer contract evaluates to RATE_NOT_FOUND', () => {
      const surgery = { id: 102, status: 'Completed' };
      const calculation = { calculation_status: 'CONTRACT_NOT_FOUND' };

      const status = financialDataDictionaryService.evaluateEncounterCompleteness(surgery, calculation, []);
      assert.strictEqual(status.code, 'RATE_NOT_FOUND', 'Missing contract must return RATE_NOT_FOUND');
    });

    test('Pre-op scheduled encounter evaluates to ESTIMATED', () => {
      const surgery = { id: 103, status: 'Scheduled' };
      const calculation = { calculation_status: 'CALCULATED' };

      const status = financialDataDictionaryService.evaluateEncounterCompleteness(surgery, calculation, []);
      assert.strictEqual(status.code, 'ESTIMATED', 'Scheduled case must be tagged ESTIMATED');
    });

    test('Cancelled case evaluates to INVALID', () => {
      const surgery = { id: 104, status: 'Cancelled' };
      const calculation = { calculation_status: 'CALCULATED' };

      const status = financialDataDictionaryService.evaluateEncounterCompleteness(surgery, calculation, []);
      assert.strictEqual(status.code, 'INVALID', 'Cancelled case must be tagged INVALID');
    });

    test('Encounter with locked contract and valid invoices evaluates to COMPLETE', () => {
      const surgery = { id: 105, status: 'Completed' };
      const calculation = { calculation_status: 'CALCULATED' };
      const devices = [{ id: 'dev-1', cost: 1250.00 }];

      const status = financialDataDictionaryService.evaluateEncounterCompleteness(surgery, calculation, devices);
      assert.strictEqual(status.code, 'COMPLETE', 'Fully verified encounter must return COMPLETE');
      assert.strictEqual(status.allowsAggregation, true, 'COMPLETE status permits aggregation');
    });
  });

  describe('3. Currency & Percentage Formatting Determinism', () => {
    test('formatCurrency handles null, undefined, and valid numbers', () => {
      assert.strictEqual(financialDataDictionaryService.formatCurrency(null), '—');
      assert.strictEqual(financialDataDictionaryService.formatCurrency(undefined), '—');
      assert.strictEqual(financialDataDictionaryService.formatCurrency(11179.10), '$11,179.10');
      assert.strictEqual(financialDataDictionaryService.formatCurrency(0), '$0.00');
    });

    test('formatPercentage handles edge-case values safely', () => {
      assert.strictEqual(financialDataDictionaryService.formatPercentage(null), '—');
      assert.strictEqual(financialDataDictionaryService.formatPercentage(54.878), '54.9%');
      assert.strictEqual(financialDataDictionaryService.formatPercentage(0), '0.0%');
    });
  });

  describe('4. Staged Migration 046 DDL & Schema Consistency', () => {
    test('Migration 046 forward and down files exist and define required tables', () => {
      const forwardSql = fs.readFileSync(path.join(rootDir, 'supabase/migrations/046_financial_data_dictionary.sql'), 'utf8');
      const downSql = fs.readFileSync(path.join(rootDir, 'supabase/migrations/046_financial_data_dictionary_down.sql'), 'utf8');

      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.financial_metric_definitions'), 'Must create metric definitions table');
      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.financial_formula_registry'), 'Must create formula registry table');
      assert.ok(forwardSql.includes('CREATE TABLE IF NOT EXISTS public.case_financial_reconciliations'), 'Must create reconciliations table');
      assert.ok(forwardSql.includes('fn_get_financial_metric_definition'), 'Must define RPC lookup function');

      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.financial_metric_definitions'), 'Down script must drop definitions table');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.case_financial_reconciliations'), 'Down script must drop reconciliations table');
    });
  });

  describe('5. UI Components & Maestro Purple Ban Compliance', () => {
    test('FinancialDictionaryView component and CSS exist and are populated', () => {
      const jsxPath = path.join(rootDir, 'src/components/FinancialDictionaryView.jsx');
      const cssPath = path.join(rootDir, 'src/components/FinancialDictionaryView.css');

      assert.ok(fs.existsSync(jsxPath), 'FinancialDictionaryView.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'FinancialDictionaryView.css must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(jsxContent.length > 500, 'JSX must contain substantial UI code');
      assert.ok(cssContent.length > 500, 'CSS must contain substantial styling');
    });

    test('FinancialDictionaryView JSX and CSS strictly adhere to Maestro Purple Ban', () => {
      const jsxContent = fs.readFileSync(path.join(rootDir, 'src/components/FinancialDictionaryView.jsx'), 'utf8');
      const cssContent = fs.readFileSync(path.join(rootDir, 'src/components/FinancialDictionaryView.css'), 'utf8');

      const bannedRegex = /#(?:7c3aed|8b5cf6|6366f1|4f46e5|a855f7|9333ea)|(?:\b|[^a-zA-Z0-9_-])(?:purple|violet|indigo)(?:-[0-9]{2,3})?/i;

      assert.ok(!bannedRegex.test(cssContent), 'CSS must not contain banned purple/violet/indigo tokens');
      assert.ok(!bannedRegex.test(jsxContent), 'JSX must not contain banned purple/violet/indigo tokens');
    });
  });

});

