/**
 * ==============================================================================
 * Test Suite: payroll-integration.test.js
 * Module 15: Enterprise Healthcare Integrations (Phase F7)
 * Tests: Payroll Gateway Configuration, Employee Staff Directory Mapping,
 *        Wage and Burden Calculations, Timecard Anomaly Detection,
 *        Perioperative Case Labor Allocations, Migration Integrity,
 *        Zero-Prohibited Token Compliance, and Shell Integration.
 * ==============================================================================
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Import service and facade
import service, {
  NAPLES_FACILITY_ID,
  normalizeFacilityId,
  computePayrollProvenanceSeal,
  maskPayrollSecret,
  calculateStaffLaborCost,
  calculateCaseLaborCost,
  calculateCostPerOrMinute,
  validateTimecardShift,
  getPayrollConnectorConfig,
  getPayrollTelemetry,
  getPayrollEmployeeMappings,
  getPayrollTimecardBatches,
  getPayrollCaseLaborAllocations,
  getPayrollExceptions,
  testPayrollConnection,
  triggerManualTimecardSync,
  allocateCaseLabor,
  resolvePayrollException
} from '../src/services/payrollIntegrationService.js';

import * as facade from '../src/lib/payrollIntegrationService.js';

describe('Phase F7: Payroll & Clinical Labor Gateway', () => {

  // Test 1: Telemetry
  test('1. Telemetry returns accurate MTD metrics for Naples Surgery Center', async () => {
    const telemetry = await getPayrollTelemetry(NAPLES_FACILITY_ID);
    assert.ok(telemetry, 'Telemetry object should exist');
    assert.equal(telemetry.facility_id, NAPLES_FACILITY_ID);
    assert.equal(telemetry.payroll_vendor, 'ADP_WORKFORCE_NOW');
    assert.equal(telemetry.sync_status, 'CONNECTED');
    assert.equal(telemetry.health_status, 'HEALTHY');
    assert.equal(telemetry.pay_period_frequency, 'BIWEEKLY');
    assert.ok(telemetry.total_labor_cost_mtd > 50000, `Expected total labor cost > 50000, got ${telemetry.total_labor_cost_mtd}`);
    assert.ok(telemetry.case_allocation_pct >= 90.0, `Expected case allocation >= 90%, got ${telemetry.case_allocation_pct}`);
    assert.ok(telemetry.avg_labor_cost_per_or_minute > 0, 'Cost per OR minute should be positive');
    assert.equal(telemetry.active_clocked_in_staff, 24);
    assert.ok(telemetry.latest_sync_seal.startsWith('sha256_pay_'), 'Seal should have sha256_pay_ prefix');
  });

  // Test 2: Facility ID Normalization
  test('2. Facility UUID alias resolution matches Naples Surgery Center correctly across strings and objects', () => {
    assert.equal(normalizeFacilityId('fac-naples-01'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId('naples-surgery-center'), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ id: 'fac-naples-01' }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId({ facility_id: NAPLES_FACILITY_ID }), NAPLES_FACILITY_ID);
    assert.equal(normalizeFacilityId(null), NAPLES_FACILITY_ID);
  });

  // Test 3: Connector Configuration
  test('3. Connector configuration retrieval and status verification', async () => {
    const config = await getPayrollConnectorConfig(NAPLES_FACILITY_ID);
    assert.ok(config, 'Config should exist');
    assert.equal(config.facility_id, NAPLES_FACILITY_ID);
    assert.equal(config.payroll_vendor, 'ADP_WORKFORCE_NOW');
    assert.equal(config.gateway_mode, 'REST_API');
    assert.equal(config.company_payroll_code, 'ADP-NAPLES-ASC');
    assert.equal(config.client_id, 'adp_client_naples_prod');
    assert.equal(config.default_burden_pct, 22.50);
    assert.ok(config.client_secret_masked.startsWith('pay_sec_****_'), 'Secret must be masked');
    assert.ok(!config.client_secret_masked.includes('enc_v2'), 'Raw secret should not be in masked value');
  });

  // Test 4: Deterministic employee directory & burdened rate calculation
  test('4. Deterministic employee directory retrieval and burdened rate calculation', async () => {
    const employees = await getPayrollEmployeeMappings(NAPLES_FACILITY_ID);
    assert.ok(Array.isArray(employees), 'Employees should be an array');
    assert.ok(employees.length >= 5, `Expected >= 5 employees, got ${employees.length}`);

    const rn = employees.find(e => e.external_employee_id === 'EMP-1001');
    assert.ok(rn, 'Sarah Jenkins, RN should exist');
    assert.equal(rn.clinical_role, 'CIRCULATING_RN');
    assert.equal(rn.base_hourly_rate, 52.00);
    assert.equal(rn.burden_pct, 22.50);
    // 52.00 * 1.225 = 63.70
    assert.equal(rn.effective_burdened_rate, 63.70);

    const crna = employees.find(e => e.external_employee_id === 'EMP-1003');
    assert.ok(crna, 'Elena Rodriguez, CRNA should exist');
    assert.equal(crna.base_hourly_rate, 105.00);
    // 105.00 * 1.225 = 128.625 -> 128.63
    assert.equal(crna.effective_burdened_rate, 128.63);
  });

  // Test 5: Deterministic shift wage and overtime calculation (FLSA 1.5x formula)
  test('5. Deterministic shift wage and overtime calculation (FLSA 1.5x formula)', () => {
    // 8 regular hours, 2 overtime hours, $50 base rate, 20% burden
    // Regular = 8 * 50 = $400.00
    // OT = 2 * (50 * 1.5) = $150.00
    // Gross = $550.00
    // Burdened = 550 * 1.20 = $660.00
    // Hourly burdened rate = 50 * 1.20 = $60.00/hr
    const calc = calculateStaffLaborCost(8, 50, 20, 2);
    assert.equal(calc.regularHours, 8);
    assert.equal(calc.overtimeHours, 2);
    assert.equal(calc.regularWages, 400.00);
    assert.equal(calc.otWages, 150.00);
    assert.equal(calc.grossPay, 550.00);
    assert.equal(calc.burdenedCost, 660.00);
    assert.equal(calc.hourlyBurdenedRate, 60.00);
  });

  // Test 6: Detection and flagging of timecard anomalies (missed clock-out > 16h)
  test('6. Detection and flagging of timecard anomalies (missed clock-out > 16h)', () => {
    const validShift = {
      external_employee_id: 'EMP-1001',
      clock_in_time: '2026-02-24T07:00:00Z',
      clock_out_time: '2026-02-24T15:30:00Z',
      hourly_rate: 52.00
    };
    const validResult = validateTimecardShift(validShift);
    assert.equal(validResult.isValid, true);
    assert.equal(validResult.errors.length, 0);

    const missedPunchShift = {
      external_employee_id: 'EMP-1082',
      clock_in_time: '2026-02-21T06:30:00Z',
      clock_out_time: '2026-02-22T01:00:00Z', // 18.5 hours!
      hourly_rate: 45.00
    };
    const missedResult = validateTimecardShift(missedPunchShift);
    assert.equal(missedResult.isValid, false);
    assert.ok(missedResult.errors.some(e => e.includes('ERR_MISSED_CLOCK_OUT')), 'Should flag missed clock-out exception');

    const invertedShift = {
      external_employee_id: 'EMP-1002',
      clock_in_time: '2026-02-24T17:00:00Z',
      clock_out_time: '2026-02-24T08:00:00Z',
      hourly_rate: 38.00
    };
    const invertedResult = validateTimecardShift(invertedShift);
    assert.equal(invertedResult.isValid, false);
    assert.ok(invertedResult.errors.some(e => e.includes('ERR_CHRONOLOGY_INVERSION')), 'Should flag chronological inversion');
  });

  // Test 7: Deterministic case labor allocation formula
  test('7. Deterministic case labor allocation formula (Labor Cost = Sum(Burdened Rate * Hours))', () => {
    const staff = [
      { staffId: 'EMP-1001', baseRate: 52.00, burdenPct: 22.50, caseOverlapMinutes: 60, isOt: false },
      { staffId: 'EMP-1002', baseRate: 38.50, burdenPct: 22.50, caseOverlapMinutes: 60, isOt: false }
    ];
    // EMP-1001: 52 * 1.225 = 63.70/hr -> $63.70 for 60 mins
    // EMP-1002: 38.50 * 1.225 = 47.1625/hr -> $47.16 for 60 mins
    // Total = 63.70 + 47.16 = $110.86
    const res = calculateCaseLaborCost(staff);
    assert.equal(res.assignedStaffCount, 2);
    assert.equal(res.totalLaborCost, 110.86);
    assert.equal(res.breakdown.length, 2);
    assert.equal(res.breakdown[0].allocatedCost, 63.70);
    assert.equal(res.breakdown[1].allocatedCost, 47.16);
  });

  // Test 8: Calculation of labor cost per OR minute
  test('8. Calculation of labor cost per OR minute', () => {
    // Total labor $259.49 over 65 mins = $3.99/min
    const costPerMin1 = calculateCostPerOrMinute(259.49, 65);
    assert.equal(costPerMin1, 3.99);

    // Total labor $59.13 over 32 mins = $1.85/min
    const costPerMin2 = calculateCostPerOrMinute(59.13, 32);
    assert.equal(costPerMin2, 1.85);

    // Zero or negative minutes guard
    assert.equal(calculateCostPerOrMinute(100, 0), 0);
  });

  // Test 9: Manual timecard sync trigger execution creates batch record with SHA-256 seal
  test('9. Manual timecard sync trigger execution creates batch record with SHA-256 seal', async () => {
    const newBatch = await triggerManualTimecardSync(NAPLES_FACILITY_ID);
    assert.ok(newBatch, 'Batch record should be created');
    assert.ok(newBatch.batch_control_number.startsWith('PAY-BAT-'), 'Batch control number format');
    assert.equal(newBatch.status, 'COMMITTED');
    assert.ok(newBatch.total_burdened_cost > 0, 'Burdened cost should be positive');
    assert.ok(newBatch.sha256_sync_seal.startsWith('sha256_pay_'), 'Seal format');
    assert.equal(newBatch.sha256_sync_seal.length, 64, 'Seal length must be exactly 64 characters');
  });

  // Test 10: Dual facade parity
  test('10. Dual facade re-export parity between src/services/ and src/lib/', () => {
    const serviceExports = [
      'NAPLES_FACILITY_ID',
      'normalizeFacilityId',
      'computePayrollProvenanceSeal',
      'maskPayrollSecret',
      'calculateStaffLaborCost',
      'calculateCaseLaborCost',
      'calculateCostPerOrMinute',
      'validateTimecardShift',
      'getPayrollConnectorConfig',
      'getPayrollTelemetry',
      'getPayrollEmployeeMappings',
      'getPayrollTimecardBatches',
      'getPayrollCaseLaborAllocations',
      'getPayrollExceptions',
      'testPayrollConnection',
      'triggerManualTimecardSync',
      'allocateCaseLabor',
      'resolvePayrollException'
    ];

    for (const exp of serviceExports) {
      assert.ok(facade[exp], `Facade must re-export ${exp}`);
      assert.equal(typeof facade[exp], typeof service[exp] || typeof facade[exp], `Type parity for ${exp}`);
    }
  });

  // Test 11: Migration 129 UP/DOWN integrity
  test('11. Migration 129 UP/DOWN SQL structural integrity and RLS policies', () => {
    const upSqlPath = path.resolve('supabase/migrations/129_payroll_integration.sql');
    const downSqlPath = path.resolve('supabase/migrations/129_payroll_integration_down.sql');

    assert.ok(fs.existsSync(upSqlPath), '129_payroll_integration.sql must exist');
    assert.ok(fs.existsSync(downSqlPath), '129_payroll_integration_down.sql must exist');

    const upSql = fs.readFileSync(upSqlPath, 'utf8');
    const downSql = fs.readFileSync(downSqlPath, 'utf8');

    // 7 Tables
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_connector_configs'), 'Configs table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_employee_mappings'), 'Employee mappings table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_timecard_batches'), 'Timecard batches table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_shift_entries'), 'Shift entries table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_case_labor_allocations'), 'Case labor allocations table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_exception_logs'), 'Exception logs table');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS public.payroll_provenance_ledger'), 'Provenance ledger table');

    // Telemetry view
    assert.ok(upSql.includes('CREATE OR REPLACE VIEW public.vw_payroll_integration_telemetry'), 'Telemetry view');

    // RLS
    assert.ok(upSql.includes('ALTER TABLE public.payroll_connector_configs ENABLE ROW LEVEL SECURITY'), 'RLS configs');
    assert.ok(upSql.includes('ALTER TABLE public.payroll_case_labor_allocations ENABLE ROW LEVEL SECURITY'), 'RLS allocations');
    assert.ok(upSql.includes('app.current_facility_id'), 'Tenant context isolation');

    // Rollback script
    assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_payroll_integration_telemetry'), 'Down drops view');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payroll_connector_configs'), 'Down drops configs');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.payroll_provenance_ledger'), 'Down drops provenance');
  });

  // Test 12: Zero Prohibited Tokens & Shell Integration
  test('12. Strict Zero-Prohibited Token Compliance and Shell Integration', () => {
    const prohibitedTokens = ['purple', 'violet', 'indigo', 'magenta', 'fuchsia'];

    const filesToCheck = [
      path.resolve('src/components/PayrollIntegrationView.jsx'),
      path.resolve('src/components/PayrollIntegrationView.css'),
      path.resolve('src/services/payrollIntegrationService.js'),
      path.resolve('src/lib/payrollIntegrationService.js')
    ];

    for (const filePath of filesToCheck) {
      assert.ok(fs.existsSync(filePath), `File must exist: ${filePath}`);
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const token of prohibitedTokens) {
        assert.ok(
          !content.includes(token),
          `Prohibited token '${token}' found in ${path.basename(filePath)}!`
        );
      }
    }

    // App shell integration check
    const appPath = path.resolve('src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(appContent.includes("import PayrollIntegrationView from './components/PayrollIntegrationView'"), 'App.jsx imports PayrollIntegrationView');
    assert.ok(appContent.includes("activeTab === 'payroll_integration'"), 'App.jsx has payroll_integration activeTab routing');
    assert.ok(appContent.includes('<PayrollIntegrationView activeFacility={activeFacility} />'), 'App.jsx renders PayrollIntegrationView');
    assert.ok(appContent.includes('Payroll & Clinical Labor Gateway'), 'App.jsx defines header title');
  });

});
