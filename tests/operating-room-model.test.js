/**
 * ==============================================================================
 * PHASE A0: OPERATING ROOM MODEL AUTOMATED TEST SUITE
 * Physical Asset Engine, Specialty Compatibility, HVAC Cleanroom & Bariatric Bounds
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ROOM_TYPES,
  OPERATING_STATUSES,
  HVAC_CLASSES,
  SPECIALTIES,
  EQUIPMENT_CATALOG,
  BARIATRIC_SAFETY_MARGIN_LBS,
  SEED_OPERATING_ROOMS,
  evaluateCaseCompatibility,
  transitionRoomStatus,
  calculateFacilityOrKpis,
  filterOperatingRooms
} from '../src/services/operatingRoomModelService.js';

describe('Phase A0 — Operating Room Model Test Suite', () => {

  // ============================================================================
  // 1. Taxonomy & Domain Definitions
  // ============================================================================
  describe('1. Taxonomy & Definitions', () => {
    it('should define all 6 architectural room types with default square footages', () => {
      const expectedTypes = [
        'STANDARD_OR',
        'HYBRID_OR',
        'PROCEDURE_ROOM',
        'ENDOSCOPY_SUITE',
        'MINIMAL_INVASIVE_SUITE',
        'ROBOTIC_SUITE'
      ];

      for (const type of expectedTypes) {
        assert.ok(ROOM_TYPES[type], `Missing room type: ${type}`);
        assert.ok(typeof ROOM_TYPES[type].defaultSqft === 'number', `${type} must have numeric square footage`);
        assert.ok(ROOM_TYPES[type].defaultSqft > 0, `${type} square footage must be positive`);
      }
    });

    it('should define all 4 operational statuses and schedulability flags', () => {
      const expectedStatuses = ['OPERATIONAL', 'MAINTENANCE', 'RENOVATION', 'DECOMMISSIONED'];

      for (const st of expectedStatuses) {
        assert.ok(OPERATING_STATUSES[st], `Missing status: ${st}`);
        assert.ok(typeof OPERATING_STATUSES[st].isSchedulable === 'boolean', `${st} must define isSchedulable`);
      }

      assert.strictEqual(OPERATING_STATUSES.OPERATIONAL.isSchedulable, true);
      assert.strictEqual(OPERATING_STATUSES.MAINTENANCE.isSchedulable, false);
      assert.strictEqual(OPERATING_STATUSES.RENOVATION.isSchedulable, false);
      assert.strictEqual(OPERATING_STATUSES.DECOMMISSIONED.isSchedulable, false);
    });

    it('should define HVAC cleanroom classes and infection prevention thresholds', () => {
      assert.ok(HVAC_CLASSES.ISO_CLASS_7.meetsJointStandard);
      assert.ok(HVAC_CLASSES.ISO_CLASS_5.meetsJointStandard);
      assert.strictEqual(HVAC_CLASSES.ISO_CLASS_8.meetsJointStandard, false);
      assert.strictEqual(HVAC_CLASSES.STANDARD_VENTILATED.meetsJointStandard, false);
      assert.ok(HVAC_CLASSES.ISO_CLASS_7.minAch >= 20, 'ISO Class 7 must require at least 20 ACH');
    });

    it('should define clinical surgical specialties and equipment items', () => {
      assert.ok(SPECIALTIES.length >= 8, 'Must configure at least 8 surgical specialties');
      assert.ok(EQUIPMENT_CATALOG.length >= 8, 'Must configure comprehensive equipment catalog');
      assert.strictEqual(BARIATRIC_SAFETY_MARGIN_LBS, 50, 'Bariatric buffer must be 50 lbs');
    });
  });

  // ============================================================================
  // 2. Deterministic Case-to-Room Compatibility Engine
  // ============================================================================
  describe('2. Deterministic Case Compatibility Engine', () => {
    const mockRoom = {
      id: 'test-or-1',
      room_number: 'OR-1',
      room_name: 'Test Joint Suite',
      operating_status: 'OPERATIONAL',
      is_active: true,
      table_weight_capacity_lbs: 600,
      hvac_cleanroom_class: 'ISO_CLASS_7',
      air_changes_per_hour: 24,
      laminar_flow_enabled: true,
      hourly_cost_rate: 1550,
      standard_turnover_minutes: 25,
      specialties: [
        { specialty_code: 'ORTHOPEDIC', compatibility_tier: 'PRIMARY' },
        { specialty_code: 'GENERAL_SURGERY', compatibility_tier: 'SECONDARY' }
      ],
      equipment: [
        { equipment_code: 'LAMINAR_CANOPY', maintenance_status: 'CERTIFIED' },
        { equipment_code: 'ARTHROSCOPY_4K_TOWER', maintenance_status: 'CERTIFIED' },
        { equipment_code: 'C_ARM_FLUORO', maintenance_status: 'OUT_OF_SERVICE' }
      ]
    };

    it('should approve compatible case for primary specialty and certified equipment', () => {
      const caseProfile = {
        specialty_code: 'ORTHOPEDIC',
        required_equipment: ['ARTHROSCOPY_4K_TOWER'],
        patient_weight_lbs: 220,
        is_joint_or_spine_implant: true
      };

      const result = evaluateCaseCompatibility(mockRoom, caseProfile);
      assert.strictEqual(result.is_compatible, true);
      assert.strictEqual(result.compatibility_tier, 'PRIMARY');
      assert.strictEqual(result.errors.length, 0);
      assert.ok(result.weight_margin_lbs > 0);
    });

    it('should flag secondary specialty as compatible with warning', () => {
      const caseProfile = {
        specialty_code: 'GENERAL_SURGERY',
        required_equipment: ['ARTHROSCOPY_4K_TOWER'],
        patient_weight_lbs: 180,
        is_joint_or_spine_implant: false
      };

      const result = evaluateCaseCompatibility(mockRoom, caseProfile);
      assert.strictEqual(result.is_compatible, true);
      assert.strictEqual(result.compatibility_tier, 'SECONDARY');
      assert.ok(result.warnings.some(w => w.includes('SECONDARY')));
    });

    it('should block case if candidate room is offline or in maintenance', () => {
      const offlineRoom = { ...mockRoom, operating_status: 'MAINTENANCE' };
      const caseProfile = { specialty_code: 'ORTHOPEDIC', patient_weight_lbs: 200 };

      const result = evaluateCaseCompatibility(offlineRoom, caseProfile);
      assert.strictEqual(result.is_compatible, false);
      assert.strictEqual(result.compatibility_tier, 'INCOMPATIBLE');
      assert.ok(result.errors.some(e => e.includes('offline')));
    });

    it('should block case if unconfigured or restricted specialty is requested', () => {
      const caseProfile = { specialty_code: 'OPHTHALMOLOGY', patient_weight_lbs: 150 };

      const result = evaluateCaseCompatibility(mockRoom, caseProfile);
      assert.strictEqual(result.is_compatible, false);
      assert.strictEqual(result.compatibility_tier, 'INCOMPATIBLE');
      assert.ok(result.errors.some(e => e.includes('not configured or permitted')));
    });

    it('should reject case if required equipment is OUT_OF_SERVICE', () => {
      const caseProfile = {
        specialty_code: 'ORTHOPEDIC',
        required_equipment: ['C_ARM_FLUORO'], // OUT_OF_SERVICE in mockRoom
        patient_weight_lbs: 200
      };

      const result = evaluateCaseCompatibility(mockRoom, caseProfile);
      assert.strictEqual(result.is_compatible, false);
      assert.ok(result.errors.some(e => e.includes('OUT_OF_SERVICE')));
    });

    it('should enforce bariatric patient weight safety bound with 50 lb buffer', () => {
      // Room limit is 600 lbs.
      // Patient weight 560 lbs + 50 lbs buffer = 610 lbs -> exceeds 600!
      const caseProfile = {
        specialty_code: 'ORTHOPEDIC',
        patient_weight_lbs: 560
      };

      const result = evaluateCaseCompatibility(mockRoom, caseProfile);
      assert.strictEqual(result.is_compatible, false);
      assert.ok(result.errors.some(e => e.includes('exceeds table certified capacity')));
      assert.strictEqual(result.weight_margin_lbs, -10);
    });

    it('should reject joint implant in room lacking ISO Class 7 or Laminar Flow', () => {
      const nonLaminarRoom = {
        ...mockRoom,
        hvac_cleanroom_class: 'ISO_CLASS_8',
        laminar_flow_enabled: false
      };
      const caseProfile = {
        specialty_code: 'ORTHOPEDIC',
        is_joint_or_spine_implant: true,
        patient_weight_lbs: 200
      };

      const result = evaluateCaseCompatibility(nonLaminarRoom, caseProfile);
      assert.strictEqual(result.is_compatible, false);
      assert.ok(result.errors.some(e => e.includes('Infection Prevention Violation')));
    });
  });

  // ============================================================================
  // 3. Status Transitions & State Machine
  // ============================================================================
  describe('3. Operating Status State Machine', () => {
    it('should permit transition from OPERATIONAL to MAINTENANCE with reason', () => {
      const res = transitionRoomStatus('OPERATIONAL', 'MAINTENANCE', 'Bi-annual C-arm calibration');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.new_status, 'MAINTENANCE');
    });

    it('should reject transition from OPERATIONAL to MAINTENANCE without reason', () => {
      const res = transitionRoomStatus('OPERATIONAL', 'MAINTENANCE', '   ');
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('operational reason is required'));
    });

    it('should permit transition from MAINTENANCE back to OPERATIONAL', () => {
      const res = transitionRoomStatus('MAINTENANCE', 'OPERATIONAL', 'Calibration complete and verified');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.new_status, 'OPERATIONAL');
    });

    it('should block invalid transition state names', () => {
      const res = transitionRoomStatus('OPERATIONAL', 'INVALID_STATE');
      assert.strictEqual(res.success, false);
    });
  });

  // ============================================================================
  // 4. Facility Level KPI Calculations & Filtering
  // ============================================================================
  describe('4. Facility Level KPIs & Filtering', () => {
    it('should accurately aggregate operational rate, turnover, and cost metrics', () => {
      const kpis = calculateFacilityOrKpis(SEED_OPERATING_ROOMS);
      assert.strictEqual(kpis.total_rooms, 6);
      assert.strictEqual(kpis.operational_count, 5);
      assert.strictEqual(kpis.operational_rate_pct, 83.3);
      assert.ok(kpis.avg_standard_turnover_min > 0);
      assert.ok(kpis.avg_hourly_cost_rate > 0);
      assert.strictEqual(kpis.unique_suites_count, 3);
      assert.ok(kpis.high_tech_rooms_count >= 4);
    });

    it('should handle empty room list gracefully', () => {
      const kpis = calculateFacilityOrKpis([]);
      assert.strictEqual(kpis.total_rooms, 0);
      assert.strictEqual(kpis.operational_rate_pct, 0);
      assert.strictEqual(kpis.avg_standard_turnover_min, 0);
    });

    it('should correctly filter rooms by suite, specialty, and text query', () => {
      const filteredBySuite = filterOperatingRooms(SEED_OPERATING_ROOMS, { suite: 'West Pavilion' });
      assert.strictEqual(filteredBySuite.length, 2);

      const filteredBySpec = filterOperatingRooms(SEED_OPERATING_ROOMS, { specialty: 'ORTHOPEDIC' });
      assert.ok(filteredBySpec.length >= 2);

      const filteredBySearch = filterOperatingRooms(SEED_OPERATING_ROOMS, { searchQuery: 'Spine' });
      assert.ok(filteredBySearch.some(r => r.room_number === 'OR-2'));
    });
  });

  // ============================================================================
  // 5. Database Migration 077 & SQL Schema Validation
  // ============================================================================
  describe('5. Database Migration 077 Schema Integrity', () => {
    const upPath = path.resolve(process.cwd(), 'supabase/migrations/077_operating_room_model.sql');
    const downPath = path.resolve(process.cwd(), 'supabase/migrations/077_operating_room_model_down.sql');

    it('should verify migration 077 UP file exists and defines all 4 required tables', () => {
      assert.ok(fs.existsSync(upPath), '077_operating_room_model.sql must exist');
      const sql = fs.readFileSync(upPath, 'utf8');

      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.operating_rooms'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.operating_room_specialties'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.operating_room_equipment'));
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.operating_room_status_events'));
    });

    it('should enforce multi-tenant RLS policies using app.current_facility_id', () => {
      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'));
      assert.ok(sql.includes("current_setting('app.current_facility_id', true)"));
      assert.ok(sql.includes('rls_operating_rooms_facility'));
      assert.ok(sql.includes('rls_or_specialties_facility'));
      assert.ok(sql.includes('rls_or_equipment_facility'));
      assert.ok(sql.includes('rls_or_status_events_facility'));
    });

    it('should define analytical views for active rooms and facility summaries', () => {
      const sql = fs.readFileSync(upPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_operating_rooms_active'));
      assert.ok(sql.includes('CREATE OR REPLACE VIEW public.vw_operating_room_facility_summary'));
    });

    it('should verify rollback migration 077 DOWN drops all views and tables cleanly', () => {
      assert.ok(fs.existsSync(downPath), '077_operating_room_model_down.sql must exist');
      const downSql = fs.readFileSync(downPath, 'utf8');

      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_operating_room_facility_summary CASCADE'));
      assert.ok(downSql.includes('DROP VIEW IF EXISTS public.vw_operating_rooms_active CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.operating_rooms CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.operating_room_specialties CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.operating_room_equipment CASCADE'));
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.operating_room_status_events CASCADE'));
    });
  });

  // ============================================================================
  // 6. Maestro Clinical UI & Zero Purple Compliance
  // ============================================================================
  describe('6. Maestro Clinical UI & Zero Purple Compliance', () => {
    const jsxPath = path.resolve(process.cwd(), 'src/components/OperatingRoomModelView.jsx');
    const cssPath = path.resolve(process.cwd(), 'src/components/OperatingRoomModelView.css');

    it('should verify component JSX exists and contains zero prohibited purple tokens', () => {
      assert.ok(fs.existsSync(jsxPath), 'OperatingRoomModelView.jsx must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      for (const token of prohibitedTokens) {
        assert.strictEqual(
          jsx.toLowerCase().includes(token),
          false,
          `OperatingRoomModelView.jsx contains prohibited design token: ${token}`
        );
      }
    });

    it('should verify scoped CSS exists and contains zero prohibited purple tokens', () => {
      assert.ok(fs.existsSync(cssPath), 'OperatingRoomModelView.css must exist');
      const css = fs.readFileSync(cssPath, 'utf8');

      const prohibitedTokens = ['purple', 'violet', 'indigo', 'fuchsia', 'magenta'];
      for (const token of prohibitedTokens) {
        assert.strictEqual(
          css.toLowerCase().includes(token),
          false,
          `OperatingRoomModelView.css contains prohibited design token: ${token}`
        );
      }
    });

    it('should verify modal styling is strictly isolated and namespaced', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      assert.ok(css.includes('.or-model-modal-header'));
      assert.ok(css.includes('background-color: #ffffff !important;'));
      assert.ok(css.includes('color: #0f172a !important;'));
      assert.ok(css.includes('.or-form-control'));
    });
  });

  // ============================================================================
  // 7. App.jsx Navigation & Route Integration
  // ============================================================================
  describe('7. App.jsx Integration Verification', () => {
    const appPath = path.resolve(process.cwd(), 'src/App.jsx');

    it('should verify OperatingRoomModelView is wired into App.jsx', () => {
      assert.ok(fs.existsSync(appPath), 'src/App.jsx must exist');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.ok(
        appContent.includes("import OperatingRoomModelView from './components/OperatingRoomModelView';"),
        'Must import OperatingRoomModelView in App.jsx'
      );
      assert.ok(
        appContent.includes("activeTab === 'or_model'"),
        'Must render OperatingRoomModelView on activeTab === "or_model"'
      );
      assert.ok(
        appContent.includes("Operating Room Master"),
        'Must register Operating Room Master in sidebar menu'
      );
    });
  });
});
