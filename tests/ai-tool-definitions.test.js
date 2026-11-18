/**
 * ==============================================================================
 * Phase C3 Test Suite: AI Tool Definitions & What-If Simulation Engines
 * Module 12: AI & Intelligence
 * Description: Unit, integration, deterministic mathematics, schema validation,
 *              RLS migration, zero-purple compliance, and App wiring test suite.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  TOOL_DOMAINS,
  RISK_TIERS,
  DEFAULT_FACILITY_ID,
  REGISTERED_TOOL_SCHEMAS,
  SEED_CASES_DATA,
  SEED_SURGEON_SCORES,
  SEED_PAYERS_DATA,
  SEED_CPT_ECONOMICS_DATA,
  SEED_OR_ROOMS_DATA,
  SEED_CARC_DENIALS_DATA,
  SEED_CONSTRUCT_STANDARDIZATION_DATA,
  validateToolCall,
  executeCaseFinancialLedger,
  executeCaseCostComposition,
  executeSurgeonScorecard,
  executeSurgeonBlockSchedule,
  executePayerContractPerformance,
  executePayerRealizationRate,
  executeCptEconomics,
  executeCptDurationVariance,
  executeOrRoomUtilization,
  executeRoomTurnoverVelocity,
  executeDenialsCarcFrequency,
  executeCleanClaimRateScrubber,
  simulateOrBlockReallocation,
  simulateConstructStandardization,
  saveScenarioSimulation,
  getToolDefinitionsTelemetry,
  executeToolByName,
  generateToolExecutionHash
} from '../src/services/aiToolDefinitionsService.js';

describe('Phase C3 — AI Tool Definitions & What-If Simulation Engines Suite', () => {

  // ============================================================================
  // 1. Tool Schemas Registration & Draft-07 Catalog Integrity
  // ============================================================================
  describe('1. Tool Schemas Registration & Draft-07 Catalog Integrity', () => {
    test('should register exactly 14 production tool schemas across 7 operational domains', () => {
      const toolKeys = Object.keys(REGISTERED_TOOL_SCHEMAS);
      assert.equal(toolKeys.length, 14, 'Must register exactly 14 tool contracts');

      const expectedTools = [
        'case_financial_ledger_query',
        'case_cost_composition',
        'surgeon_scorecard_query',
        'surgeon_block_schedule_query',
        'payer_contract_performance_query',
        'payer_realization_rate',
        'cpt_economics_query',
        'cpt_duration_variance',
        'or_room_utilization_query',
        'room_turnover_velocity',
        'denials_carc_frequency',
        'clean_claim_rate_scrubber',
        'or_block_reallocation_simulation',
        'construct_standardization_scenario'
      ];

      for (const toolId of expectedTools) {
        assert.ok(REGISTERED_TOOL_SCHEMAS[toolId], `Tool schema '${toolId}' must be registered`);
      }
    });

    test('should ensure each tool contract possesses all required metadata, schemas, and permissions', () => {
      for (const [toolId, schema] of Object.entries(REGISTERED_TOOL_SCHEMAS)) {
        assert.equal(schema.id, toolId, 'Schema ID must match dictionary key');
        assert.ok(schema.name && schema.name.length > 5, `${toolId} must have a human-readable name`);
        assert.ok(schema.description && schema.description.length > 15, `${toolId} must have descriptive documentation`);
        assert.ok(Object.values(TOOL_DOMAINS).includes(schema.domain), `${toolId} domain must be one of TOOL_DOMAINS`);
        assert.ok(schema.requiredRole, `${toolId} must specify required role`);
        assert.ok(schema.requiredPermission.startsWith('ai:'), `${toolId} must specify valid AI permission`);
        assert.ok(Object.values(RISK_TIERS).includes(schema.riskTier), `${toolId} must specify valid risk tier`);
        assert.ok(schema.rateLimitRpm > 0, `${toolId} rateLimitRpm must be positive`);
        assert.ok(schema.handlerFunction, `${toolId} must have an assigned handler function`);
        assert.equal(schema.inputSchema?.type, 'object', `${toolId} inputSchema must be of type object`);
        assert.equal(schema.outputSchema?.type, 'object', `${toolId} outputSchema must be of type object`);
      }
    });

    test('should classify scenario simulations as Tier 3 PROPOSED_MUTATION', () => {
      assert.equal(REGISTERED_TOOL_SCHEMAS.or_block_reallocation_simulation.riskTier, RISK_TIERS.PROPOSED_MUTATION);
      assert.equal(REGISTERED_TOOL_SCHEMAS.construct_standardization_scenario.riskTier, RISK_TIERS.PROPOSED_MUTATION);
      assert.equal(REGISTERED_TOOL_SCHEMAS.or_block_reallocation_simulation.requiredPermission, 'ai:propose_action');
    });
  });

  // ============================================================================
  // 2. Schema Parameter Validation Engine
  // ============================================================================
  describe('2. Schema Parameter Validation Engine (validateToolCall)', () => {
    test('should reject calls with unknown tool identifiers', () => {
      const res = validateToolCall('unregistered_fake_tool', {});
      assert.equal(res.valid, false);
      assert.ok(res.errors[0].includes('not registered'));
    });

    test('should catch missing mandatory parameters', () => {
      const res = validateToolCall('case_cost_composition', {});
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes("Missing mandatory parameter: 'caseId'")));
    });

    test('should validate parameter types and enums strictly', () => {
      // Invalid enum for status
      const res1 = validateToolCall('case_financial_ledger_query', { status: 'INVALID_STATUS' });
      assert.equal(res1.valid, false);
      assert.ok(res1.errors.some(e => e.includes('is not one of allowable values')));

      // Invalid numeric type
      const res2 = validateToolCall('case_financial_ledger_query', { minMarginPct: 'not-a-number' });
      assert.equal(res2.valid, false);
      assert.ok(res2.errors.some(e => e.includes('must be a number')));
    });

    test('should validate numeric boundaries (minimum & maximum)', () => {
      const res = validateToolCall('or_block_reallocation_simulation', {
        sourceSurgeonId: 'SURG-012',
        targetSurgeonId: 'SURG-003',
        reallocatedHoursWeekly: 50 // exceeds max 40
      });
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('exceeds maximum allowable value of 40')));
    });

    test('should approve valid parameter payloads', () => {
      const res = validateToolCall('or_block_reallocation_simulation', {
        sourceSurgeonId: 'SURG-012',
        targetSurgeonId: 'SURG-003',
        reallocatedHoursWeekly: 8,
        durationWeeks: 26
      });
      assert.equal(res.valid, true);
      assert.equal(res.errors, undefined);
    });
  });

  // ============================================================================
  // 3. Deterministic Domain Handlers
  // ============================================================================
  describe('3. Deterministic Domain Handlers', () => {
    test('executeCaseFinancialLedger should calculate gross, collections, direct costs, and net margin %', () => {
      const res = executeCaseFinancialLedger({ limit: 5 });
      assert.ok(res.cases.length > 0);
      assert.ok(res.totalGrossCharges > 0);
      assert.ok(res.totalCollected > 0);
      assert.ok(res.totalNetMargin > 0);
      assert.ok(res.blendedMarginPct > 0 && res.blendedMarginPct <= 100);
      assert.equal(res.facilityId, DEFAULT_FACILITY_ID);
    });

    test('executeCaseCostComposition should itemize implants, supplies, pharma, and OR minute cost', () => {
      const res = executeCaseCostComposition({ caseId: 'CASE-2026-1049' });
      assert.equal(res.caseId, 'CASE-2026-1049');
      assert.equal(res.orDurationMinutes, 78);
      assert.equal(res.orMinutesCost, 897.00); // 78 * 11.50
      assert.ok(res.implants.length > 0);
      assert.ok(res.supplies.length > 0);
      assert.ok(res.pharmaceuticals.length > 0);
      assert.equal(res.totalDirectCost, 3332.00);
      assert.equal(res.implantCostRatio, 55.52);
    });

    test('executeSurgeonScorecard should return block utilization and FCOTS compliance', () => {
      const res = executeSurgeonScorecard({ specialty: 'Orthopedics' });
      assert.ok(res.scorecards.length >= 2);
      assert.ok(res.avgBlockUtilization >= 50);
      assert.ok(res.avgFcotsCompliance >= 50);
      assert.ok(res.avgMarginPerOrHour > 1000);
    });

    test('executeSurgeonBlockSchedule should flag auto-release risk for underutilized blocks', () => {
      const res = executeSurgeonBlockSchedule();
      assert.ok(res.blocks.length > 0);
      const highRiskBlock = res.blocks.find(b => b.surgeonId === 'SURG-012');
      assert.ok(highRiskBlock);
      assert.equal(highRiskBlock.autoReleaseRisk, 'HIGH');
      assert.equal(highRiskBlock.utilizationPct, 54.0);
    });

    test('executePayerContractPerformance should return blended realization and DSO metrics', () => {
      const res = executePayerContractPerformance();
      assert.ok(res.payers.length >= 4);
      assert.ok(res.blendedRealizationRate >= 80);
      assert.ok(res.avgDsoDays > 0);
      assert.ok(res.blendedDenialRate > 0);
    });

    test('executePayerRealizationRate should compute underpayment variance accurately', () => {
      const res = executePayerRealizationRate({ payerId: 'UNITED_HEALTH' });
      assert.equal(res.payerId, 'UNITED_HEALTH');
      assert.equal(res.underpaymentVariance, 56100.00); // 510000 - 453900
      assert.equal(res.carveoutRecapturePct, 78.5);
    });

    test('executeCptEconomics should sort by contribution margin and compute margin per minute', () => {
      const res = executeCptEconomics({ sortBy: 'MARGIN' });
      assert.ok(res.cptEconomics.length >= 5);
      // Top margin should be first
      assert.equal(res.topContributionCpt, '63047');
      assert.ok(res.avgMarginPerMinute > 0);
    });

    test('executeCptDurationVariance should calculate scheduled vs actual variance and room time', () => {
      const res = executeCptDurationVariance({ cptCode: '29827' });
      assert.equal(res.cptCode, '29827');
      assert.equal(res.scheduledMinutes, 78);
      assert.equal(res.actualMeanMinutes, 81.9);
      assert.equal(res.durationVarianceMinutes, 3.9);
      assert.equal(res.totalRoomTimeMinutes, 103.9);
    });

    test('executeOrRoomUtilization should compute prime-time utilization and idle labor cost', () => {
      const res = executeOrRoomUtilization();
      assert.equal(res.rooms.length, 4);
      assert.ok(res.primeTimeUtilization >= 75);
      assert.ok(res.idleLaborCost > 0);
      assert.ok(res.avgFcotsPct > 70);
    });

    test('executeRoomTurnoverVelocity should compute same-surgeon vs cross-surgeon benchmarks', () => {
      const res = executeRoomTurnoverVelocity();
      assert.ok(res.turnovers.length > 0);
      assert.ok(res.avgTurnoverMinutes > 15);
      assert.ok(res.prolongedTurnoversCount >= 0);
      assert.equal(res.topDelayCause, 'CLEANING_DISINFECTION');
    });

    test('executeDenialsCarcFrequency should calculate at-risk dollar value and preventable cash', () => {
      const res = executeDenialsCarcFrequency({ carcGroup: 'CO' });
      assert.ok(res.carcSummary.length >= 3);
      assert.ok(res.totalAtRiskAmount > 0);
      assert.ok(res.preventableAtRiskAmount > 0);
      assert.ok(res.topDenialReason.startsWith('CO-16'));
    });

    test('executeCleanClaimRateScrubber should report clean claim rate and flagged defects', () => {
      const res = executeCleanClaimRateScrubber();
      assert.equal(res.claimsScrubbed, 248);
      assert.equal(res.cleanClaimsCount, 220); // 248 - 28
      assert.equal(res.cleanClaimRatePct, 88.7);
      assert.equal(res.flaggedDefects.length, 4);
      assert.equal(res.projectedDenialSavings, 73900.00);
    });
  });

  // ============================================================================
  // 4. Predictive Scenario Simulation Engines
  // ============================================================================
  describe('4. Predictive Scenario Simulation Engines', () => {
    test('simulateOrBlockReallocation should compute net margin lift, delta cases, and facility utilization shift', () => {
      const res = simulateOrBlockReallocation({
        sourceSurgeonId: 'SURG-012', // Dr. Miller ($1,120/hr, 54% util)
        targetSurgeonId: 'SURG-003', // Dr. Vance ($2,244/hr, 88% util)
        reallocatedHoursWeekly: 8,
        durationWeeks: 26
      });

      assert.equal(res.scenarioType, 'OR_BLOCK_REALLOCATION');
      assert.equal(res.inputs.totalHoursShifted, 208.0); // 8 * 26
      assert.equal(res.projected.sourceLostContribution, 125798.4); // 208 * 0.54 * 1120
      assert.equal(res.projected.targetGainedContribution, 410741.76); // 208 * 0.88 * 2244
      assert.equal(res.deltaImpact.netMarginLift, 284943.36); // 410741.76 - 125798.4
      assert.equal(res.deltaImpact.deltaCases, 31);
      assert.equal(res.deltaImpact.facilityUtilizationLiftPct, 1.7);
      assert.equal(res.confidenceScore, 94.50);
      assert.ok(res.provenanceHash.length === 64);
    });

    test('simulateConstructStandardization should compute gross savings, rebate capture, and ROI %', () => {
      const res = simulateConstructStandardization({
        constructCategory: 'SPINE_PEDICLE_SCREW_CONSTRUCT',
        standardizedVendorId: 'stryker',
        targetComplianceRatePct: 85,
        annualConstructVolume: 120
      });

      assert.equal(res.scenarioType, 'CONSTRUCT_STANDARDIZATION');
      assert.equal(res.baseline.baselineAnnualSpend, 582000.00); // 120 * 4850
      assert.equal(res.inputs.compliantVolume, 102); // 120 * 0.85
      assert.equal(res.inputs.nonCompliantVolume, 18);
      assert.equal(res.deltaImpact.grossDirectSavings, 102000.00);
      assert.equal(res.deltaImpact.projectedVendorRebate, 23562.00); // 102 * 3850 * 0.06
      assert.equal(res.deltaImpact.netAnnualizedSavings, 125562.00);
      assert.equal(res.deltaImpact.savingsPercentage, 21.57);
      assert.equal(res.confidenceScore, 96.00);
      assert.ok(res.provenanceHash.length === 64);
    });
  });

  // ============================================================================
  // 5. Central Execution Dispatcher & Provenance Integrity
  // ============================================================================
  describe('5. Central Execution Dispatcher & Provenance Integrity', () => {
    test('executeToolByName should return SUCCESS with 64-character SHA-256 hash', () => {
      const res = executeToolByName('case_financial_ledger_query', { minMarginPct: 50 });
      assert.equal(res.status, 'SUCCESS');
      assert.equal(res.toolId, 'case_financial_ledger_query');
      assert.ok(res.data);
      assert.equal(res.executionHash.length, 64);
      assert.ok(res.executedAt);
    });

    test('executeToolByName should intercept validation errors before execution', () => {
      const res = executeToolByName('case_cost_composition', {}); // missing caseId
      assert.equal(res.status, 'VALIDATION_ERROR');
      assert.ok(res.errors.length > 0);
      assert.equal(res.data, undefined);
    });

    test('generateToolExecutionHash should produce deterministic signatures', () => {
      const h1 = generateToolExecutionHash('tool-a', 'fac-1', 'params-1', 'SUCCESS', '2026-11-18T10:00:00Z');
      const h2 = generateToolExecutionHash('tool-a', 'fac-1', 'params-1', 'SUCCESS', '2026-11-18T10:00:00Z');
      const h3 = generateToolExecutionHash('tool-b', 'fac-1', 'params-1', 'SUCCESS', '2026-11-18T10:00:00Z');
      assert.equal(h1, h2, 'Identical inputs must yield identical hashes');
      assert.notEqual(h1, h3, 'Different inputs must yield different hashes');
      assert.equal(h1.length, 64);
    });

    test('saveScenarioSimulation and telemetry calculation', () => {
      const sim = simulateOrBlockReallocation({
        sourceSurgeonId: 'SURG-012',
        targetSurgeonId: 'SURG-003',
        reallocatedHoursWeekly: 8,
        durationWeeks: 26
      });
      const saved = saveScenarioSimulation(sim, DEFAULT_FACILITY_ID, { id: 'usr-tester', role: 'clinical_director' });
      assert.ok(saved.id.startsWith('sim-'));
      assert.equal(saved.createdBy, 'usr-tester');

      const telemetry = getToolDefinitionsTelemetry(DEFAULT_FACILITY_ID);
      assert.equal(telemetry.totalRegisteredTools, 14);
      assert.equal(telemetry.activeQueryDomains, 7);
      assert.equal(telemetry.activeScenarioEngines, 2);
      assert.equal(telemetry.schemaHealthPct, 100.0);
    });
  });

  // ============================================================================
  // 6. PostgreSQL Migration 101 Schema Integrity
  // ============================================================================
  describe('6. PostgreSQL Migration 101 Schema Integrity', () => {
    test('UP migration 101 should create ai_tool_schemas, ai_scenario_simulations, ai_query_catalogs, views, and RLS', () => {
      const upSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/101_ai_tool_definitions_and_scenarios.sql'),
        'utf8'
      );
      assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.ai_tool_schemas'));
      assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.ai_scenario_simulations'));
      assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.ai_query_catalogs'));
      assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_ai_tool_catalog_summary'));
      assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_ai_scenario_simulation_history'));
      assert.ok(upSql.includes('ALTER TABLE public.ai_tool_schemas ENABLE ROW LEVEL SECURITY;'));
      assert.ok(upSql.includes('ALTER TABLE public.ai_scenario_simulations ENABLE ROW LEVEL SECURITY;'));
      assert.ok(upSql.includes('INSERT INTO public.ai_tool_schemas'));
      assert.ok(upSql.includes('case_financial_ledger_query'));
      assert.ok(upSql.includes('or_block_reallocation_simulation'));
      assert.ok(upSql.includes('construct_standardization_scenario'));
    });

    test('DOWN migration 101 should cleanly drop views and tables with CASCADE', () => {
      const downSql = fs.readFileSync(
        path.join(process.cwd(), 'supabase/migrations/101_ai_tool_definitions_and_scenarios_down.sql'),
        'utf8'
      );
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_ai_scenario_simulation_history CASCADE;'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_ai_tool_catalog_summary CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_query_catalogs CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_scenario_simulations CASCADE;'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.ai_tool_schemas CASCADE;'));
    });
  });

  // ============================================================================
  // 7. Maestro Clinical Zero-Purple Design Compliance
  // ============================================================================
  describe('7. Maestro Clinical Zero-Purple Design Compliance', () => {
    test('AIToolDefinitionsView.jsx must strictly avoid prohibited purple tokens', () => {
      const jsx = fs.readFileSync(
        path.join(process.cwd(), 'src/components/AIToolDefinitionsView.jsx'),
        'utf8'
      );
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
      for (const token of forbiddenTokens) {
        assert.ok(
          !jsx.toLowerCase().includes(token),
          `AIToolDefinitionsView.jsx contains forbidden token: ${token}`
        );
      }
    });

    test('AIToolDefinitionsView.css must strictly avoid prohibited purple tokens', () => {
      const css = fs.readFileSync(
        path.join(process.cwd(), 'src/components/AIToolDefinitionsView.css'),
        'utf8'
      );
      const forbiddenTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];
      for (const token of forbiddenTokens) {
        assert.ok(
          !css.toLowerCase().includes(token),
          `AIToolDefinitionsView.css contains forbidden token: ${token}`
        );
      }
    });
  });

  // ============================================================================
  // 8. App Wiring & Lib Facade Integrity
  // ============================================================================
  describe('8. App Wiring & Lib Facade Integrity', () => {
    test('src/lib/aiToolDefinitionsService.js re-exports all constants and functions', async () => {
      const lib = await import('../src/lib/aiToolDefinitionsService.js');
      assert.ok(lib.REGISTERED_TOOL_SCHEMAS);
      assert.ok(lib.validateToolCall);
      assert.ok(lib.simulateOrBlockReallocation);
      assert.ok(lib.simulateConstructStandardization);
      assert.ok(lib.executeToolByName);
    });

    test('App.jsx registers AIToolDefinitionsView with navigation, title, and tab routing', () => {
      const appJsx = fs.readFileSync(
        path.join(process.cwd(), 'src/App.jsx'),
        'utf8'
      );
      assert.ok(appJsx.includes("import AIToolDefinitionsView from './components/AIToolDefinitionsView';"));
      assert.ok(appJsx.includes("activeTab === 'ai_tool_definitions'"));
      assert.ok(appJsx.includes("<AIToolDefinitionsView />"));
      assert.ok(appJsx.includes("AI Tool Definitions, Schemas & Scenario Simulators"));
    });
  });
});
