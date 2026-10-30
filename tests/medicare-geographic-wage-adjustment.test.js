/**
 * tests/medicare-geographic-wage-adjustment.test.js
 * Comprehensive Verification Suite for Phase 62: Geographic Wage Adjustment & Effective-Dated CBSA Resolution
 * 
 * Statutory Authority:
 *   - 42 CFR § 416.171(b) (ASC Geographic Wage Adjustment Methodology)
 *   - 42 CFR § 416.171(b)(2) (Device Offset Carve-Out Exemption)
 *   - 42 CFR § 416.171(a)(2) (ASCQR 2% Reduction Factor)
 *   - OMB Bulletin No. 23-01 (Revised CBSA Delineations)
 * 
 * Specification: docs/phases/62_GEOGRAPHIC_WAGE_ADJUSTMENT.md
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  geographicWageService,
  CBSA_VERIFICATION_SOURCES,
  NATIONAL_BASELINE_CBSA,
  DEFAULT_FACILITY_CBSA
} from '../src/lib/geographicWageService.js';
import { rbacService, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 62 — Geographic Wage Adjustment & Effective-Dated CBSA Resolution', async (t) => {

  await t.test('1. Statutory 50/50 Wage Adjustment Formula (Standard Surgical Procedure)', () => {
    // Knee Arthroscopy (29881): National Unadjusted Rate = $1,650.00, Naples Wage Index = 0.9412
    // Math: ($1,650.00 * 0.50 * 0.9412) + ($1,650.00 * 0.50) = $776.49 + $825.00 = $1,601.49
    const result = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 1650.00,
      wageIndex: 0.9412,
      laborShare: 0.5000,
      nonLaborShare: 0.5000,
      isDeviceIntensive: false,
      ascqrCompliant: true
    });

    assert.strictEqual(result.nationalUnadjustedRate, 1650.00);
    assert.strictEqual(result.wageIndex, 0.9412);
    assert.strictEqual(result.deviceOffsetAmount, 0.00);
    assert.strictEqual(result.servicePortionUnadjusted, 1650.00);
    assert.strictEqual(result.servicePortionAdjusted, 1601.49);
    assert.strictEqual(result.allowableRate, 1601.49);
    assert.strictEqual(result.dollarVariance, -48.51);
    assert.strictEqual(result.percentageVariance, -2.94);
  });

  await t.test('2. Device-Intensive Carve-Out (42 CFR § 416.171(b)(2)) Protects Implant Hardware', () => {
    // Tarsal Fracture Repair (28465): National Rate = $4,671.46, Device Offset = 35% ($1,635.01)
    // Math:
    // Device Amount = round($4,671.46 * 0.35) = $1,635.01 (100% exempt from wage adjustment)
    // Service Portion = $4,671.46 - $1,635.01 = $3,036.45
    // Adjusted Service = ($3,036.45 * 0.50 * 0.9412) + ($3,036.45 * 0.50) = $1,428.95 + $1,518.23 = $2,947.18
    // Total Allowable = $1,635.01 + $2,947.18 = $4,582.19
    const result = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 4671.46,
      wageIndex: 0.9412,
      laborShare: 0.5000,
      nonLaborShare: 0.5000,
      isDeviceIntensive: true,
      deviceOffsetPercentage: 0.35,
      ascqrCompliant: true,
      paymentIndicator: 'J8'
    });

    assert.strictEqual(result.isDeviceIntensive, true);
    assert.strictEqual(result.deviceOffsetAmount, 1635.01);
    assert.strictEqual(result.servicePortionUnadjusted, 3036.45);
    assert.ok(Math.abs(result.allowableRate - 4582.19) <= 0.20, `Allowable rate was ${result.allowableRate}`);
    assert.strictEqual(result.allowableRate > 4500, true);
  });

  await t.test('3. ASCQR 2.0% Statutory Reduction Factor (42 CFR § 416.171(a)(2))', () => {
    // When facility is non-compliant, service portion incurs 2% penalty (* 0.9800)
    const compliant = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 1650.00,
      wageIndex: 0.9412,
      ascqrCompliant: true
    });

    const nonCompliant = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 1650.00,
      wageIndex: 0.9412,
      ascqrCompliant: false,
      ascqrReductionFactor: 0.9800
    });

    const expectedPenalized = Math.round(compliant.allowableRate * 0.9800 * 100) / 100;
    assert.strictEqual(nonCompliant.ascqrCompliant, false);
    assert.strictEqual(nonCompliant.allowableRate, expectedPenalized);
    assert.ok(nonCompliant.allowableRate < compliant.allowableRate);
  });

  await t.test('4. Packaged Procedures (N1) Return $0.00 Allowable Without Wage Mutation', () => {
    const result = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 350.00,
      wageIndex: 0.9412,
      paymentIndicator: 'N1'
    });

    assert.strictEqual(result.allowableRate, 0.00);
    assert.strictEqual(result.servicePortionAdjusted, 0.00);
  });

  await t.test('5. Inpatient-Only (C) and Non-Covered (E5) Procedures Fail-Closed', () => {
    const ipo = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 5000.00,
      wageIndex: 1.2850,
      paymentIndicator: 'C'
    });

    assert.strictEqual(ipo.allowableRate, 0.00);

    const nonCovered = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 2000.00,
      wageIndex: 1.2850,
      paymentIndicator: 'E5'
    });

    assert.strictEqual(nonCovered.allowableRate, 0.00);
  });

  await t.test('6. Pass-Through Drugs & Biologicals (K2) are 100% Exempt from Wage Adjustment', () => {
    const drug = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: 500.00,
      wageIndex: 0.9412,
      paymentIndicator: 'K2'
    });

    assert.strictEqual(drug.allowableRate, 500.00);
    assert.strictEqual(drug.dollarVariance, 0.00);
  });

  await t.test('7. Fail-Closed Geographic Resolution on Missing Facility or Unknown CBSA', async () => {
    // Null facility throws UNRESOLVED_FACILITY_GEOGRAPHY
    await assert.rejects(
      async () => {
        await geographicWageService.resolveFacilityWageIndex(null, '2026-01-01');
      },
      /UNRESOLVED_FACILITY_GEOGRAPHY/
    );

    // Unmapped random UUID throws UNRESOLVED_FACILITY_GEOGRAPHY
    await assert.rejects(
      async () => {
        await geographicWageService.resolveFacilityWageIndex('ffffffff-ffff-ffff-ffff-ffffffffffff', '2026-01-01');
      },
      /UNRESOLVED_FACILITY_GEOGRAPHY/
    );
  });

  await t.test('8. Effective-Dated Assignment Validation & Chronology Checks', async () => {
    // Invalid 4-digit CBSA throws
    await assert.rejects(
      async () => {
        await geographicWageService.saveFacilityGeographicAssignment('00000000-0000-0000-0000-000000000002', {
          cbsa_code: '1234', // Must be 5 digits
          medicare_provider_number: '10-ASC02',
          effective_start_date: '2026-01-01'
        });
      },
      /5 numeric digits/
    );

    // End date before start date throws
    await assert.rejects(
      async () => {
        await geographicWageService.saveFacilityGeographicAssignment('00000000-0000-0000-0000-000000000002', {
          cbsa_code: '34940',
          medicare_provider_number: '10-ASC02',
          effective_start_date: '2026-06-01',
          effective_end_date: '2026-01-01'
        });
      },
      /cannot be before Effective Start Date/
    );
  });

  await t.test('9. Database Migration 038 & Down Migration DDL Verification', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '038_medicare_geographic_wage_adjustment.sql');
    const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '038_medicare_geographic_wage_adjustment_down.sql');

    assert.ok(fs.existsSync(migrationPath), 'Migration 038 file must exist');
    assert.ok(fs.existsSync(downMigrationPath), 'Migration 038 down file must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    const downSql = fs.readFileSync(downMigrationPath, 'utf8');

    // 1. Forward Migration Checks
    assert.ok(sql.includes('public.facility_medicare_geographic_assignments'), 'Creates facility_medicare_geographic_assignments table');
    assert.ok(sql.includes('uq_fac_effective_start UNIQUE (facility_id, effective_start_date)'), 'Enforces unique effective date constraint');
    assert.ok(sql.includes('public.cms_cbsa_delineations'), 'Creates cms_cbsa_delineations table');
    assert.ok(sql.includes('pre_floor_wage_index NUMERIC(6, 4)'), 'Expands medicare_wage_indices with pre_floor_wage_index');
    assert.ok(sql.includes('transition_capped_wage_index NUMERIC(6, 4)'), 'Expands medicare_wage_indices with transition_capped_wage_index');
    assert.ok(sql.includes('is_reclassified BOOLEAN'), 'Expands medicare_wage_indices with is_reclassified');
    assert.ok(sql.includes('FUNCTION public.fn_resolve_facility_wage_index'), 'Deploys fn_resolve_facility_wage_index RPC');
    assert.ok(sql.includes('UNRESOLVED_FACILITY_GEOGRAPHY'), 'Contains fail-closed error handling');

    // CRITICAL: NEVER query public.user_roles in RLS policies
    assert.strictEqual(
      sql.includes('public.user_roles'),
      false,
      'Migration 038 RLS policies must NEVER query public.user_roles (must use user_has_facility_role / is_facility_accessible)'
    );

    // 2. Down Migration Checks
    assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_resolve_facility_wage_index'), 'Down drops fn_resolve_facility_wage_index');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.facility_medicare_geographic_assignments'), 'Down drops facility assignments table');
    assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cms_cbsa_delineations'), 'Down drops delineations table');
  });

  await t.test('10. Multi-Tenant RBAC Catalog Contains All 8 Geographic Permissions', () => {
    const requiredPermissions = [
      'geographic.view_rates',
      'geographic.view_facility_settings',
      'geographic.edit_facility_assignment',
      'geographic.verify_assignment',
      'geographic.import_wage_index_table',
      'geographic.publish_wage_release',
      'geographic.override_calculation',
      'geographic.audit_export'
    ];

    for (const permCode of requiredPermissions) {
      const match = PERMISSIONS_CATALOG.find(p => p.code === permCode);
      assert.ok(match, `Permission ${permCode} must be registered in PERMISSIONS_CATALOG`);
    }

    // Role checks
    const cfoPerms = rbacService.hasPermission(
      ['geographic.view_rates', 'geographic.verify_assignment'],
      'geographic.verify_assignment'
    );
    assert.strictEqual(cfoPerms, true);

    const viewerPerms = rbacService.hasPermission(
      ['geographic.view_rates'],
      'geographic.edit_facility_assignment'
    );
    assert.strictEqual(viewerPerms, false);
  });

  await t.test('11. Purple Ban Static Audit (Zero Banned Tokens)', () => {
    const filesToAudit = [
      path.join(rootDir, 'src', 'lib', 'geographicWageService.js'),
      path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.jsx'),
      path.join(rootDir, 'src', 'components', 'MedicareRateExplorer.css')
    ];

    const bannedPatterns = [
      /#7c3aed/i, /#8b5cf6/i, /#6366f1/i, /#a855f7/i, /#c084fc/i,
      /\bpurple\b/i, /\bviolet\b/i, /\bfuchsia\b/i, /\bindigo\b/i
    ];

    for (const filePath of filesToAudit) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of bannedPatterns) {
        const match = content.match(pattern);
        assert.strictEqual(
          match,
          null,
          `File ${path.basename(filePath)} violates Purple Ban with token: ${match ? match[0] : ''}`
        );
      }
    }
  });

  await t.test('12. OMB Bulletin 23-01 County Crosswalk Lookup Verification', async () => {
    // Collier County (Naples CBSA 34940)
    const collier = await geographicWageService.getCBSACountyDelineations('34940');
    assert.ok(collier.length > 0);
    assert.strictEqual(collier[0].fips_county_code, '12021');
    assert.strictEqual(collier[0].county_name, 'Collier County');

    // Search by FIPS "12021"
    const lookup = await geographicWageService.lookupCBSAByCountyOrFIPS('12021');
    assert.ok(lookup.length > 0);
    assert.strictEqual(lookup[0].cbsa_code, '34940');
  });

  await t.test('13. Geographic Wage Service Canonical Constants Validation', () => {
    assert.ok(Array.isArray(CBSA_VERIFICATION_SOURCES));
    assert.strictEqual(CBSA_VERIFICATION_SOURCES.length >= 4, true);
    assert.strictEqual(NATIONAL_BASELINE_CBSA.code, '00000');
    assert.strictEqual(NATIONAL_BASELINE_CBSA.wageIndex, 1.0000);
    assert.strictEqual(DEFAULT_FACILITY_CBSA.code, '34940');
    assert.strictEqual(DEFAULT_FACILITY_CBSA.wageIndex, 0.9412);
  });

});

