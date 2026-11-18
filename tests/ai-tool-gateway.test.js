/**
 * ==============================================================================
 * Test Suite: Phase C1 — AI Tool Gateway Tier
 * Module: Module 12: AI & Intelligence
 * Description: Exhaustive automated test suite verifying JSON Schema validation,
 *              RBAC tenant authorization, circuit breaker resilience, rate limiting,
 *              result shaping, Safe Harbor PHI redaction, cryptographic SHA-256
 *              provenance, database migration integrity, zero-purple design compliance,
 *              and App.jsx registration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TOOL_DOMAINS,
  EXECUTION_STATUSES,
  CIRCUIT_STATES,
  REGISTERED_TOOL_DEFINITIONS,
  SEED_TOOL_EXECUTIONS,
  validateToolParameters,
  checkToolAuthorization,
  getCircuitBreakerState,
  recordToolFailure,
  recordToolSuccess,
  resetCircuitBreaker,
  checkRateLimit,
  shapeToolResult,
  generateGatewayProvenanceHash,
  dispatchToolCall,
  calculateGatewayTelemetry
} from '../src/services/aiToolGatewayService.js';

import * as libExport from '../src/lib/aiToolGatewayService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

describe('Phase C1 — AI Tool Gateway Tier Suite', () => {

  // 1. JSON Schema Parameter Validation
  describe('1. JSON Schema Parameter Validation Engine', () => {
    test('should validate conforming parameter payloads against JSON schema', () => {
      const valid = validateToolParameters('cpt_economics_activity_based_margins', {
        economicQuadrant: 'PRIME_YIELD_ANCHOR'
      });
      assert.strictEqual(valid.isValid, true);
      assert.strictEqual(valid.errors.length, 0);
      assert.strictEqual(valid.sanitizedParams.economicQuadrant, 'PRIME_YIELD_ANCHOR');
    });

    test('should reject additional unpermitted properties when additionalProperties is false', () => {
      const invalid = validateToolParameters('cpt_economics_activity_based_margins', {
        economicQuadrant: 'PRIME_YIELD_ANCHOR',
        injectedMaliciousField: 'DROP TABLE users'
      });
      assert.strictEqual(invalid.isValid, false);
      assert.ok(invalid.errors.some(e => e.includes('Unrecognized parameter')));
    });

    test('should enforce string pattern constraints (e.g. 5-digit CPT)', () => {
      const validCpt = validateToolParameters('surgeon_implant_variance_audit', { cptCode: '27447' });
      assert.strictEqual(validCpt.isValid, true);

      const invalidCpt = validateToolParameters('surgeon_implant_variance_audit', { cptCode: 'CPT-INVALID' });
      assert.strictEqual(invalidCpt.isValid, false);
      assert.ok(invalidCpt.errors.some(e => e.includes('fails pattern validation')));
    });

    test('should enforce enum membership constraints', () => {
      const invalidEnum = validateToolParameters('payer_intelligence_portfolio_summary', { category: 'NON_EXISTENT_PLAN' });
      assert.strictEqual(invalidEnum.isValid, false);
      assert.ok(invalidEnum.errors.some(e => e.includes('must be one of')));
    });
  });

  // 2. Tenancy & RBAC Authorization Matrix
  describe('2. Tenancy & RBAC Authorization Matrix', () => {
    test('should reject unauthenticated or guest callers', () => {
      const guestCheck = checkToolAuthorization('surgeon_intelligence_get_profile', {
        role: 'guest',
        facilityId: '00000000-0000-0000-0000-000000000001'
      });
      assert.strictEqual(guestCheck.authorized, false);
      assert.ok(guestCheck.reason.includes('prohibited'));
    });

    test('should reject requests lacking mandatory facilityId tenancy binding', () => {
      const noTenant = checkToolAuthorization('surgeon_intelligence_get_profile', {
        role: 'surgeon',
        facilityId: null
      });
      assert.strictEqual(noTenant.authorized, false);
      assert.ok(noTenant.reason.includes('Missing mandatory facility tenancy'));
    });

    test('should deny non-elevated roles from sensitive financial tools', () => {
      const authDenied = checkToolAuthorization('payer_contract_performance_leakage', {
        role: 'viewer',
        facilityId: '00000000-0000-0000-0000-000000000001'
      });
      assert.strictEqual(authDenied.authorized, false);
      assert.ok(authDenied.reason.includes('Security Violation'));
    });

    test('should permit elevated clinical and financial roles according to RBAC matrix', () => {
      const adminAuth = checkToolAuthorization('payer_contract_performance_leakage', {
        role: 'facility_admin',
        facilityId: '00000000-0000-0000-0000-000000000001'
      });
      assert.strictEqual(adminAuth.authorized, true);

      const billerAuth = checkToolAuthorization('cpt_denial_payment_friction_analysis', {
        role: 'biller',
        facilityId: '00000000-0000-0000-0000-000000000001'
      });
      assert.strictEqual(billerAuth.authorized, true);
    });
  });

  // 3. Result Shaping & Safe Harbor Masking
  describe('3. Result Shaping & Safe Harbor Masking', () => {
    test('should clamp record output to maxResultRows and append metadata', () => {
      const mockItems = Array.from({ length: 40 }, (_, i) => ({
        id: `v-${i}`,
        constructCategory: 'TOTAL_KNEE',
        cptCode: '27447',
        unitPrice: 2800 + i
      }));
      const shaped = shapeToolResult('vendor_cost_comparison_price_spread', mockItems);
      assert.strictEqual(shaped.records.length, 20); // maxResultRows is 20
      assert.strictEqual(shaped.metadata.isTruncated, true);
      assert.strictEqual(shaped.metadata.totalRecordsAvailable, 40);
    });

    test('should redact Safe Harbor 18 HIPAA identifiers from string fields', () => {
      const rawData = [
        {
          id: 'item-1',
          surgeonName: 'Dr. John Doe',
          cptCode: '27447',
          contactEmail: 'surgeon@hospital.org',
          patientSsn: '000-12-3456',
          phone: '555-123-4567'
        }
      ];
      const shaped = shapeToolResult('surgeon_implant_variance_audit', rawData);
      const row = shaped.records[0];
      assert.strictEqual(row.contactEmail, undefined); // filtered out by whitelist projection
      // Direct redaction test on projected field
      const customShaped = shapeToolResult('surgeon_intelligence_get_profile', [{
        surgeonName: 'Dr. Jane Contact 000-12-3456',
        specialty: 'Orthopedics test@clinic.com'
      }]);
      assert.ok(customShaped.records[0].surgeonName.includes('[REDACTED-SSN]'));
      assert.ok(customShaped.records[0].specialty.includes('[REDACTED-EMAIL]'));
    });
  });

  // 4. Circuit Breaker Resilience Protocol
  describe('4. Circuit Breaker Resilience Protocol', () => {
    const testTool = 'claim_scrubber_rejection_audit';
    const testFacility = 'fac_circuit_test_01';

    test('should track consecutive failures and trip to OPEN state at threshold 5', () => {
      resetCircuitBreaker(testTool, testFacility);
      let state = getCircuitBreakerState(testTool, testFacility);
      assert.strictEqual(state.state, CIRCUIT_STATES.CLOSED);
      assert.strictEqual(state.consecutiveFailures, 0);

      // Record 4 failures -> stays CLOSED
      for (let i = 0; i < 4; i++) {
        recordToolFailure(testTool, testFacility);
      }
      state = getCircuitBreakerState(testTool, testFacility);
      assert.strictEqual(state.consecutiveFailures, 4);
      assert.strictEqual(state.state, CIRCUIT_STATES.CLOSED);

      // 5th failure -> trips to OPEN
      recordToolFailure(testTool, testFacility);
      state = getCircuitBreakerState(testTool, testFacility);
      assert.strictEqual(state.state, CIRCUIT_STATES.OPEN);
      assert.ok(state.openedAt > 0);
    });

    test('should block dispatchToolCall fast when circuit breaker is OPEN', () => {
      const response = dispatchToolCall(testTool, {}, {
        facilityId: testFacility,
        role: 'coder'
      });
      assert.strictEqual(response.status, EXECUTION_STATUSES.CIRCUIT_OPEN);
      assert.strictEqual(response.circuitState, CIRCUIT_STATES.OPEN);
      assert.ok(response.errorMessage.includes('Circuit breaker is OPEN'));
    });

    test('should reset circuit breaker to CLOSED upon manual reset or success', () => {
      resetCircuitBreaker(testTool, testFacility);
      const resetState = getCircuitBreakerState(testTool, testFacility);
      assert.strictEqual(resetState.state, CIRCUIT_STATES.CLOSED);
      assert.strictEqual(resetState.consecutiveFailures, 0);
    });
  });

  // 5. Sliding-Window Rate Limiter
  describe('5. Sliding-Window Rate Limiter', () => {
    const rateFacility = 'fac_rate_test_02';
    const rateTool = 'test_rate_tool';

    test('should enforce rate limit RPM ceiling and provide reset cooldown', () => {
      // Set ceiling to 3 RPM for instant testing
      const res1 = checkRateLimit(rateFacility, rateTool, 3);
      const res2 = checkRateLimit(rateFacility, rateTool, 3);
      const res3 = checkRateLimit(rateFacility, rateTool, 3);
      assert.strictEqual(res1.isAllowed, true);
      assert.strictEqual(res2.isAllowed, true);
      assert.strictEqual(res3.isAllowed, true);

      // 4th call exceeds limit
      const res4 = checkRateLimit(rateFacility, rateTool, 3);
      assert.strictEqual(res4.isAllowed, false);
      assert.strictEqual(res4.limitRpm, 3);
      assert.ok(res4.resetInSeconds >= 1);
    });
  });

  // 6. Cryptographic Provenance Hash Integrity
  describe('6. Cryptographic Provenance Hash Integrity', () => {
    test('should generate deterministic 64-character SHA-256 signatures', () => {
      const hash1 = generateGatewayProvenanceHash('fac-1', 'usr-1', 'tool-1', '{"cpt":"27447"}', 'SUCCESS', '1000');
      const hash2 = generateGatewayProvenanceHash('fac-1', 'usr-1', 'tool-1', '{"cpt":"27447"}', 'SUCCESS', '1000');
      const hash3 = generateGatewayProvenanceHash('fac-1', 'usr-1', 'tool-1', '{"cpt":"29827"}', 'SUCCESS', '1000');

      assert.strictEqual(hash1.length, 64);
      assert.strictEqual(hash1, hash2);
      assert.notStrictEqual(hash1, hash3);
    });

    test('should attach valid provenance hash to all dispatchToolCall responses', () => {
      const response = dispatchToolCall('cpt_economics_activity_based_margins', { economicQuadrant: 'PRIME_YIELD_ANCHOR' }, {
        facilityId: '00000000-0000-0000-0000-000000000001',
        role: 'clinical_director'
      });
      assert.strictEqual(response.status, EXECUTION_STATUSES.SUCCESS);
      assert.strictEqual(response.provenanceHash.length, 64);
      assert.ok(response.recordsReturned > 0);
    });
  });

  // 7. PostgreSQL Migration 099 Schema & Rollback Integrity
  describe('7. PostgreSQL Migration 099 Schema & Rollback Integrity', () => {
    const upMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '099_ai_tool_gateway.sql');
    const downMigrationPath = path.join(ROOT_DIR, 'supabase', 'migrations', '099_ai_tool_gateway_down.sql');

    test('UP migration 099 should establish tables, views, indexes, and RLS', () => {
      assert.ok(fs.existsSync(upMigrationPath), '099_ai_tool_gateway.sql must exist');
      const content = fs.readFileSync(upMigrationPath, 'utf8');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.ai_tool_definitions'));
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.ai_tool_executions'));
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.ai_tool_circuit_breakers'));
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_ai_tool_gateway_telemetry'));
      assert.ok(content.includes('ENABLE ROW LEVEL SECURITY'));
    });

    test('DOWN migration 099 should cleanly drop all objects with CASCADE', () => {
      assert.ok(fs.existsSync(downMigrationPath), '099_ai_tool_gateway_down.sql must exist');
      const content = fs.readFileSync(downMigrationPath, 'utf8');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.ai_tool_circuit_breakers CASCADE'));
      assert.ok(content.includes('DROP TABLE IF EXISTS public.ai_tool_executions CASCADE'));
      assert.ok(content.includes('DROP TABLE IF EXISTS public.ai_tool_definitions CASCADE'));
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_ai_tool_gateway_telemetry CASCADE'));
    });
  });

  // 8. Zero-Purple Compliance & App Wiring
  describe('8. Zero-Purple Compliance & App Wiring', () => {
    const jsxPath = path.join(ROOT_DIR, 'src', 'components', 'AIToolGatewayView.jsx');
    const cssPath = path.join(ROOT_DIR, 'src', 'components', 'AIToolGatewayView.css');
    const appPath = path.join(ROOT_DIR, 'src', 'App.jsx');

    test('AIToolGatewayView.jsx must strictly avoid prohibited purple tokens', () => {
      const content = fs.readFileSync(jsxPath, 'utf8');
      const prohibited = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;
      assert.strictEqual(prohibited.test(content), false, 'AIToolGatewayView.jsx contains forbidden purple token');
    });

    test('AIToolGatewayView.css must strictly avoid prohibited purple tokens', () => {
      const content = fs.readFileSync(cssPath, 'utf8');
      const prohibited = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;
      assert.strictEqual(prohibited.test(content), false, 'AIToolGatewayView.css contains forbidden purple token');
    });

    test('src/lib/aiToolGatewayService.js re-exports all contracts and functions', () => {
      assert.ok(typeof libExport.dispatchToolCall === 'function');
      assert.ok(typeof libExport.validateToolParameters === 'function');
      assert.ok(typeof libExport.calculateGatewayTelemetry === 'function');
      assert.ok(Object.keys(libExport.REGISTERED_TOOL_DEFINITIONS).length >= 12);
    });

    test('App.jsx registers AIToolGatewayView with sidebar navigation and tab route', () => {
      const content = fs.readFileSync(appPath, 'utf8');
      assert.ok(content.includes('AIToolGatewayView'));
      assert.ok(content.includes("activeTab === 'ai_tool_gateway'"));
      assert.ok(content.includes('AI Tool Gateway'));
    });
  });

});
