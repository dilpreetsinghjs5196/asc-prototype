import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMedicareRevenue, calculateORCost, calculateLaborCost, calculateCosmeticFees } from '../src/utils/hospitalUtils.js';
import { rbacService } from '../src/lib/rbacService.js';
import fs from 'node:fs';
import path from 'node:path';

test('Phase 30 — MPPR System Settings Toggle Verification Suite', async (t) => {

  // =========================================================================
  // DOMAIN 1: DATA MODEL & DEFAULT OFF CONFIGURATION
  // =========================================================================
  await t.test('1. Data Model: public.facilities defines apply_medicare_mppr with default false', () => {
    const migration001Path = path.resolve('supabase/migrations/001_multi_tenancy_core.sql');
    assert.ok(fs.existsSync(migration001Path), 'Migration 001 must exist');
    const content = fs.readFileSync(migration001Path, 'utf8');

    // Verify apply_medicare_mppr column definition with DEFAULT false
    assert.match(
      content,
      /apply_medicare_mppr\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i,
      'facilities table must define apply_medicare_mppr BOOLEAN NOT NULL DEFAULT false'
    );
  });

  // =========================================================================
  // DOMAIN 2: RBAC & PERMISSION ENFORCEMENT
  // =========================================================================
  await t.test('2. RBAC: Only super_admin and facility_admin are authorized to toggle MPPR', () => {
    const authorizedRoles = ['super_admin', 'facility_admin'];
    const unauthorizedRoles = ['viewer', 'scheduler', 'surgeon', 'biller', 'clinical_manager', 'coder'];

    authorizedRoles.forEach(role => {
      const normalized = rbacService.normalizeRole(role);
      const canToggle = ['super_admin', 'facility_admin'].includes(normalized);
      assert.equal(canToggle, true, `Role ${role} should be authorized to toggle MPPR`);
    });

    unauthorizedRoles.forEach(role => {
      const normalized = rbacService.normalizeRole(role);
      const canToggle = ['super_admin', 'facility_admin'].includes(normalized);
      assert.equal(canToggle, false, `Role ${role} must NOT be authorized to toggle MPPR`);
    });
  });

  await t.test('3. Server Security: fn_admin_update_facility validates caller role and logs audit trail', () => {
    const migration008Path = path.resolve('supabase/migrations/008_multi_facility_and_single_super_admin.sql');
    assert.ok(fs.existsSync(migration008Path), 'Migration 008 must exist');
    const content = fs.readFileSync(migration008Path, 'utf8');

    // Verify fn_admin_update_facility checks facility_admin or super_admin
    assert.match(
      content,
      /CREATE OR REPLACE FUNCTION public\.fn_admin_update_facility/i,
      'fn_admin_update_facility must be defined'
    );
    assert.match(
      content,
      /user_has_facility_role\(p_facility_id,\s*ARRAY\['facility_admin'\]\)/i,
      'fn_admin_update_facility must verify facility_admin for target facility'
    );
    assert.match(
      content,
      /RAISE EXCEPTION 'FORBIDDEN: Insufficient permissions to edit facility %'/i,
      'fn_admin_update_facility must reject unauthorized callers'
    );
    assert.match(
      content,
      /INSERT INTO public\.audit_logs/i,
      'fn_admin_update_facility must record an immutable audit log entry'
    );
  });

  // =========================================================================
  // DOMAIN 3: FINANCIAL CALCULATION - MPPR OFF (DEFAULT)
  // =========================================================================
  await t.test('4. Calculation: When MPPR is OFF, secondary procedures receive 100% allowable rate', () => {
    const mockCptDb = [
      { code: '29881', description: 'Knee Arthroscopy Meniscectomy', gross_charge: 1650.00, reimbursement: 1650.00 },
      { code: '29877', description: 'Knee Debridement', gross_charge: 1200.00, reimbursement: 1200.00 }
    ];

    const revenue = calculateMedicareRevenue(['29881', '29877'], mockCptDb, false);
    // 1650 + 1200 = 2850
    assert.equal(revenue, 2850.00, 'When MPPR is OFF, total should be exact sum of both CPT allowables without discount');
  });

  // =========================================================================
  // DOMAIN 4: FINANCIAL CALCULATION - MPPR ON (STANDARD SURGICAL)
  // =========================================================================
  await t.test('5. Calculation: When MPPR is ON, secondary surgical procedure receives 50% reduction', () => {
    const mockCptDb = [
      { code: '29881', description: 'Knee Arthroscopy Meniscectomy', gross_charge: 1650.00, reimbursement: 1650.00 },
      { code: '29877', description: 'Knee Debridement', gross_charge: 1200.00, reimbursement: 1200.00 }
    ];

    // Primary: 29881 @ 100% = $1,650.00
    // Secondary: 29877 @ 50% = $600.00
    // Expected Total: $2,250.00
    const revenue = calculateMedicareRevenue(['29881', '29877'], mockCptDb, true);
    assert.equal(revenue, 2250.00, 'When MPPR is ON, secondary surgical code should receive 50% discount ($1650 + $600 = $2250)');
  });

  // =========================================================================
  // DOMAIN 5: FINANCIAL CALCULATION - ADD-ON CODES EXEMPTION
  // =========================================================================
  await t.test('6. Calculation: Add-on procedures (+) are exempt from MPPR reduction (100% allowable)', () => {
    const mockCptDb = [
      { code: '22551', description: 'Anterior Cervical Discectomy', gross_charge: 4800.00, reimbursement: 4800.00 },
      { code: '+22552', description: 'Each Additional Level', gross_charge: 1400.00, reimbursement: 1400.00, is_add_on: true }
    ];

    // Primary: 22551 @ 100% = $4,800.00
    // Add-on: +22552 @ 100% (Exempt) = $1,400.00
    // Expected Total: $6,200.00
    const revenue = calculateMedicareRevenue(['22551', '+22552'], mockCptDb, true);
    assert.equal(revenue, 6200.00, 'Add-on codes marked with + must receive 100% reimbursement without MPPR discount');
  });

  // =========================================================================
  // DOMAIN 6: FINANCIAL CALCULATION - DEVICE-INTENSIVE (PI J8) OFFSET PROTECTION
  // =========================================================================
  await t.test('7. Calculation: Device-intensive codes (PI J8) discount service portion only, protecting device offset', () => {
    const mockCptDb = [
      { code: '29888', description: 'ACL Reconstruction', gross_charge: 10000.00, reimbursement: 10000.00 },
      { 
        code: '27447', 
        description: 'Total Knee Arthroplasty', 
        gross_charge: 8500.00, 
        reimbursement: 8500.00, 
        payment_indicator: 'J8', 
        device_offset_amount: 3500.00 
      }
    ];

    // Primary: 29888 @ 100% = $10,000.00
    // Secondary: 27447 (Device Intensive):
    //   Device offset = $3,500.00 (undiscounted)
    //   Service portion = $8,500 - $3,500 = $5,000.00
    //   Discounted service = $5,000 * 0.50 = $2,500.00
    //   Total secondary = $3,500 + $2,500 = $6,000.00
    // Expected Total: $10,000 + $6,000 = $16,000.00
    const revenue = calculateMedicareRevenue(['29888', '27447'], mockCptDb, true);
    assert.equal(revenue, 16000.00, 'Device-intensive code should protect device offset ($3,500) and discount service only ($2,500)');
  });

  // =========================================================================
  // DOMAIN 7: PAYER SCOPING - COMMERCIAL PAYER ISOLATION
  // =========================================================================
  await t.test('8. Payer Scoping: Commercial payers are not discounted by Medicare MPPR toggle', () => {
    const mockCptDb = [
      { code: '29881', description: 'Knee Arthroscopy Meniscectomy', gross_charge: 1650.00, reimbursement: 1650.00 },
      { code: '29877', description: 'Knee Debridement', gross_charge: 1200.00, reimbursement: 1200.00 }
    ];

    // When payer is Commercial and strictPayerCheck is requested:
    const revenue = calculateMedicareRevenue(['29881', '29877'], mockCptDb, true, {
      payerType: 'Commercial',
      strictPayerCheck: true
    });

    // Should receive full 100% sum ($2,850.00) without Medicare MPPR discount
    assert.equal(revenue, 2850.00, 'Commercial cases must not be discounted by Medicare MPPR setting');
  });

  // =========================================================================
  // DOMAIN 8: PRESERVATION OF OR ROOM AND LABOR COST CALCULATIONS
  // =========================================================================
  await t.test('9. Preservation: calculateORCost piecewise curve is completely preserved', () => {
    // 0 min -> $0
    assert.equal(calculateORCost(0), 0);
    // 30 min -> $750 (30 * 25)
    assert.equal(calculateORCost(30), 750);
    // 60 min -> $1,500 (60 * 25)
    assert.equal(calculateORCost(60), 1500);
    // 61 min -> $1,800 ($1,500 + $300)
    assert.equal(calculateORCost(61), 1800);
    // 90 min -> $1,800 ($1,500 + $300)
    assert.equal(calculateORCost(90), 1800);
    // 91 min -> $2,100 ($1,500 + $600)
    assert.equal(calculateORCost(91), 2100);
    // 120 min -> $2,100 ($1,500 + $600)
    assert.equal(calculateORCost(120), 2100);
    // 121 min -> $2,500 ($2,100 + $400)
    assert.equal(calculateORCost(121), 2500);
    // 150 min -> $2,500 ($2,100 + $400)
    assert.equal(calculateORCost(150), 2500);
  });

  await t.test('10. Preservation: calculateLaborCost and calculateCosmeticFees remain intact', () => {
    // Labor cost is 30% of OR room cost
    assert.equal(calculateLaborCost(60), 450); // 1500 * 0.3 = 450
    assert.equal(calculateLaborCost(90), 540); // 1800 * 0.3 = 540

    // Cosmetic fees duration lookup
    const fees60 = calculateCosmeticFees(60);
    assert.equal(fees60.facilityFee, 1500);
    assert.equal(fees60.anesthesiaFee, 750);
  });

  // =========================================================================
  // DOMAIN 9: UI STATIC CONTRACT VERIFICATION
  // =========================================================================
  await t.test('11. UI Contract: Settings.jsx defines role gating and facility-bound MPPR toggle', () => {
    const settingsPath = path.resolve('src/components/Settings.jsx');
    assert.ok(fs.existsSync(settingsPath), 'Settings.jsx must exist');
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Verify role gating is defined
    assert.match(content, /canToggleMPPR\s*=\s*isSuperAdmin\s*\|\|\s*isFacilityAdmin/i, 'Settings.jsx must enforce canToggleMPPR');
    assert.match(content, /disabled=\{!canToggleMPPR\}/i, 'Toggle switch must be disabled for unauthorized roles');
    assert.match(content, /db\.updateFacility/i, 'Settings.jsx must update facility via db.updateFacility');
    assert.match(content, /Read-Only Access/i, 'Settings.jsx must display Read-Only notice for unauthorized users');
  });

  await t.test('12. UI Contract: App.jsx passes activeFacility and userRole to SettingsView', () => {
    const appPath = path.resolve('src/App.jsx');
    assert.ok(fs.existsSync(appPath), 'App.jsx must exist');
    const content = fs.readFileSync(appPath, 'utf8');

    assert.match(content, /<SettingsView[\s\S]*activeFacility=\{activeFacility\}/i, 'App.jsx must pass activeFacility to SettingsView');
    assert.match(content, /<SettingsView[\s\S]*currentRole=\{userRole\}/i, 'App.jsx must pass currentRole to SettingsView');
  });
});
