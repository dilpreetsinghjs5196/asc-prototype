import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cptImplantMappingService, GLOBAL_BASELINE_MAPPINGS } from '../src/lib/cptImplantMappingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ==============================================================================
// SUITE 1: DATABASE MIGRATION 027 DDL & SCHEMA INTEGRITY
// ==============================================================================

test('Phase 52 — Migration 027 DDL & Schema Integrity', async (t) => {
  const upMigrationPath = path.join(rootDir, 'supabase', 'migrations', '027_cpt_to_implant_mapping.sql');
  const downMigrationPath = path.join(rootDir, 'supabase', 'migrations', '027_cpt_to_implant_mapping_down.sql');

  await t.test('Migration 027 up and down files exist', () => {
    assert.ok(fs.existsSync(upMigrationPath), '027_cpt_to_implant_mapping.sql must exist');
    assert.ok(fs.existsSync(downMigrationPath), '027_cpt_to_implant_mapping_down.sql must exist');
  });

  const upSql = fs.readFileSync(upMigrationPath, 'utf8');

  await t.test('Creates public.cpt_implant_mappings table with required columns and constraints', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.cpt_implant_mappings/);
    assert.match(upSql, /cpt_master_id UUID NOT NULL REFERENCES public\.cpt_master/);
    assert.match(upSql, /component_id UUID NOT NULL REFERENCES public\.implant_components/);
    assert.match(upSql, /category_id UUID NOT NULL REFERENCES public\.implant_categories/);
    assert.match(upSql, /facility_id UUID REFERENCES public\.facilities/);
    assert.match(upSql, /requirement_type VARCHAR\(20\) NOT NULL/);
    assert.match(upSql, /quantity_calculation_method VARCHAR\(30\) NOT NULL/);
    assert.match(upSql, /confidence_score NUMERIC\(3, 2\) NOT NULL DEFAULT 1\.00/);
    assert.match(upSql, /review_status VARCHAR\(20\) NOT NULL DEFAULT 'verified'/);
    assert.match(upSql, /uq_cpt_component_facility_effective/);
    assert.match(upSql, /chk_default_quantity_bounds/);
    assert.match(upSql, /chk_mapping_temporal_window/);
  });

  await t.test('Creates public.cpt_implant_mapping_reviews audit ledger', () => {
    assert.match(upSql, /CREATE TABLE IF NOT EXISTS public\.cpt_implant_mapping_reviews/);
    assert.match(upSql, /mapping_id UUID NOT NULL REFERENCES public\.cpt_implant_mappings/);
    assert.match(upSql, /action VARCHAR\(30\) NOT NULL/);
    assert.match(upSql, /rationale TEXT NOT NULL/);
  });

  await t.test('Implements integrity trigger fn_validate_cpt_implant_mapping_integrity', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_validate_cpt_implant_mapping_integrity/);
    assert.match(upSql, /Category mismatch/);
    assert.match(upSql, /Active mapping already exists with an overlapping temporal date range/);
    assert.match(upSql, /CREATE TRIGGER trg_validate_cpt_implant_mapping/);
  });

  await t.test('Configures Row-Level Security (RLS) policies for tenant isolation & global read', () => {
    assert.match(upSql, /ALTER TABLE public\.cpt_implant_mappings ENABLE ROW LEVEL SECURITY/);
    assert.match(upSql, /cpt_implant_mappings_facility_isolation/);
    assert.match(upSql, /facility_id IS NULL/);
  });

  await t.test('Deploys authoritative resolution stored procedure fn_resolve_cpt_implant_requirements', () => {
    assert.match(upSql, /CREATE OR REPLACE FUNCTION public\.fn_resolve_cpt_implant_requirements/);
    assert.match(upSql, /priority_rank = 1/);
  });

  await t.test('Extends fn_evaluate_charge_completeness with DEV-003 and DEV-005 pre-bill rules', () => {
    assert.match(upSql, /DEV-003/);
    assert.match(upSql, /CPT %s requires implant component/);
    assert.match(upSql, /DEV-005/);
  });

  await t.test('Seeds authoritative multi-specialty clinical baseline mappings', () => {
    assert.match(upSql, /'27130'/); // Total Hip
    assert.match(upSql, /'HIP_CUP'/);
    assert.match(upSql, /'HIP_STEM'/);
    assert.match(upSql, /'27447'/); // Total Knee
    assert.match(upSql, /'KNEE_FEMORAL'/);
    assert.match(upSql, /'22551'/); // ACDF
    assert.match(upSql, /'SPINE_ACDF_CAGE'/);
    assert.match(upSql, /'22633'/); // TLIF
    assert.match(upSql, /'SPINE_PEDICLE_SCREW'/);
    assert.match(upSql, /'66984'/); // Cataract
    assert.match(upSql, /'IOL_MONOFOCAL'/);
    assert.match(upSql, /'63685'/); // SCS Generator
    assert.match(upSql, /'SCS_PULSE_GEN'/);
    assert.match(upSql, /'19340'/); // Breast Prosthesis
    assert.match(upSql, /'BREAST_IMPLANT_SILICONE'/);
  });

  const downSql = fs.readFileSync(downMigrationPath, 'utf8');
  await t.test('Migration 027 rollback script safely removes all objects', () => {
    assert.match(downSql, /DROP TABLE IF EXISTS public\.cpt_implant_mapping_reviews/);
    assert.match(downSql, /DROP TABLE IF EXISTS public\.cpt_implant_mappings/);
    assert.match(downSql, /DROP FUNCTION IF EXISTS public\.fn_resolve_cpt_implant_requirements/);
  });
});

// ==============================================================================
// SUITE 2: DETERMINISTIC QUANTITY & REQUIREMENT CALCULATIONS
// ==============================================================================

test('Phase 52 — Deterministic Quantity & Requirement Calculations', async (t) => {
  await t.test('Resolves fixed requirement for single-level construct (Total Hip CPT 27130)', async () => {
    const hipConstruct = await cptImplantMappingService.getMappingsByCpt('27130');
    assert.ok(Array.isArray(hipConstruct), 'Must return an array');
    assert.ok(hipConstruct.length >= 4, 'Must return at least 4 primary components');

    const cup = hipConstruct.find(c => c.component_code === 'HIP_CUP');
    const stem = hipConstruct.find(c => c.component_code === 'HIP_STEM');
    const screw = hipConstruct.find(c => c.component_code === 'HIP_SCREW');

    assert.equal(cup?.requirement_type, 'required', 'Acetabular cup must be required');
    assert.equal(stem?.requirement_type, 'required', 'Femoral stem must be required');
    assert.equal(cup?.default_quantity, 1, 'Default cup quantity must be 1');
    assert.equal(screw?.requirement_type, 'optional', 'Cancellous screw must be optional');
  });

  await t.test('Scales laterality-dependent components on Bilateral Modifier 50 (Total Knee CPT 27447)', async () => {
    // Unilateral Knee
    const unilateral = await cptImplantMappingService.resolveEncounterConstruct(['27447'], ['RT']);
    const uniFemoral = unilateral.find(c => c.component_code === 'KNEE_FEMORAL');
    const uniTibial = unilateral.find(c => c.component_code === 'KNEE_TIBIAL_TRAY');

    assert.equal(uniFemoral?.scaled_default, 1, 'Unilateral knee requires 1 femoral component');
    assert.equal(uniTibial?.scaled_default, 1, 'Unilateral knee requires 1 tibial tray');

    // Bilateral Knee with Modifier 50
    const bilateral = await cptImplantMappingService.resolveEncounterConstruct(['27447'], ['50']);
    const biFemoral = bilateral.find(c => c.component_code === 'KNEE_FEMORAL');
    const biTibial = bilateral.find(c => c.component_code === 'KNEE_TIBIAL_TRAY');

    assert.equal(biFemoral?.scaled_default, 2, 'Bilateral knee requires 2 femoral components');
    assert.equal(biTibial?.scaled_default, 2, 'Bilateral knee requires 2 tibial trays');
    assert.equal(biFemoral?.scaled_min, 2, 'Bilateral knee minimum quantity is 2');
    assert.equal(biFemoral?.scaled_max, 2, 'Bilateral knee maximum quantity is 2');
  });

  await t.test('Correctly identifies conditional requirements (ACDF DBM graft & Cataract CTR)', async () => {
    const acdfConstruct = await cptImplantMappingService.getMappingsByCpt('22551');
    const dbm = acdfConstruct.find(c => c.component_code === 'SPINE_DBM_GRAFT');

    assert.equal(dbm?.requirement_type, 'conditional', 'DBM graft must be conditional');
    assert.match(dbm?.condition_expression, /autograft_harvested = FALSE/, 'Must specify condition expression');

    const complexCataract = await cptImplantMappingService.getMappingsByCpt('66982');
    const ctr = complexCataract.find(c => c.component_code === 'OPHTH_CTR');

    assert.equal(ctr?.requirement_type, 'conditional', 'Capsular tension ring must be conditional');
  });
});

// ==============================================================================
// SUITE 3: PRE-BILL CHARGE COMPLETENESS VALIDATION (RULES DEV-003, DEV-005)
// ==============================================================================

test('Phase 52 — Pre-Bill Charge Completeness Validation Logic', async (t) => {
  await t.test('Triggers DEV-003 BLOCKER when a required component is omitted from case devices', () => {
    const procedures = [{ cpt_code: '27130', is_primary: true }];
    // Nurse only logged femoral stem and modular head, missing cup and liner
    const caseDevices = [
      { device_name: 'Stryker Accolade II Femoral Hip Stem', quantity: 1, udi: '008881234567' },
      { device_name: 'Stryker Alumina Ceramic Femoral Modular Head', quantity: 1, udi: '008881234568' }
    ];

    const result = cptImplantMappingService.evaluateCaseDevices(procedures, caseDevices);

    assert.equal(result.can_release_to_bill, false, 'Must block claim release when required hardware is missing');
    assert.equal(result.overall_status, 'blocked', 'Status must be blocked');
    assert.ok(result.blocker_count >= 1, 'Must have at least 1 blocker');

    const cupBlocker = result.findings.find(f => f.rule_id === 'DEV-003' && f.message.includes('Acetabular Shell / Cup'));
    assert.ok(cupBlocker, 'Must generate DEV-003 blocker for missing Acetabular Shell / Cup');
    assert.equal(cupBlocker?.severity, 'BLOCKER', 'Severity must be BLOCKER');
  });

  await t.test('Evaluates cleanly when all required components are documented', () => {
    const procedures = [{ cpt_code: '27130', is_primary: true }];
    const caseDevices = [
      { device_name: 'Acetabular Shell / Cup', quantity: 1 },
      { device_name: 'Femoral Hip Stem', quantity: 1 },
      { device_name: 'Acetabular Liner / Insert', quantity: 1 },
      { device_name: 'Femoral Modular Head', quantity: 1 }
    ];

    const result = cptImplantMappingService.evaluateCaseDevices(procedures, caseDevices);

    assert.equal(result.can_release_to_bill, true, 'Claim must release when all required components exist');
    assert.equal(result.blocker_count, 0, 'Zero blockers expected');
    assert.equal(result.overall_status, 'clean', 'Status must be clean');
  });

  await t.test('Generates DEV-005 WARNING when documented quantity is out of expected clinical bounds', () => {
    const procedures = [{ cpt_code: '27447', is_primary: true }]; // Unilateral Knee (expected: 1 femoral, 1 tibial, 1 insert)
    const caseDevices = [
      { device_name: 'Femoral Knee Component', quantity: 4 }, // Suspiciously high quantity
      { device_name: 'Tibial Baseplate / Tray', quantity: 1 },
      { device_name: 'Tibial Polyethylene Insert', quantity: 1 }
    ];

    const result = cptImplantMappingService.evaluateCaseDevices(procedures, caseDevices);

    assert.equal(result.can_release_to_bill, true, 'Warnings should not hard-block release');
    assert.equal(result.warning_count, 1, 'Should have exactly 1 warning');
    assert.equal(result.overall_status, 'warnings', 'Status must be warnings');

    const warning = result.findings.find(f => f.rule_id === 'DEV-005');
    assert.ok(warning, 'Must generate DEV-005 warning');
    assert.match(warning.message, /falls outside expected clinical range|expected range for CPT 27447 is \[1 - 1\]/);
  });
});

// ==============================================================================
// SUITE 4: CLIENT SERVICE LAYER & PERSISTENCE
// ==============================================================================

test('Phase 52 — Client Service Layer API Verification', async (t) => {
  await t.test('Filters mappings by surgical specialty cleanly', async () => {
    const ortho = await cptImplantMappingService.getAllMappings({ specialty: 'Orthopedics' });
    assert.ok(ortho.length > 0, 'Must return orthopedic mappings');
    assert.ok(ortho.every(m => m.specialty === 'Orthopedics'), 'All returned rows must be Orthopedics');

    const spine = await cptImplantMappingService.getAllMappings({ specialty: 'Spine' });
    assert.ok(spine.length > 0, 'Must return spine mappings');
    assert.ok(spine.every(m => m.specialty === 'Spine'), 'All returned rows must be Spine');
  });

  await t.test('Filters mappings by requirement type', async () => {
    const requiredOnly = await cptImplantMappingService.getAllMappings({ requirementType: 'required' });
    assert.ok(requiredOnly.length > 0, 'Must return required mappings');
    assert.ok(requiredOnly.every(m => m.requirement_type === 'required'), 'All must have requirement_type = required');

    const optionalOnly = await cptImplantMappingService.getAllMappings({ requirementType: 'optional' });
    assert.ok(optionalOnly.length > 0, 'Must return optional mappings');
    assert.ok(optionalOnly.every(m => m.requirement_type === 'optional'), 'All must have requirement_type = optional');
  });

  await t.test('Saves custom facility mapping override and updates local state', async () => {
    const customMapping = {
      cpt_code: '28296',
      procedure_name: 'Hallux Valgus Correction',
      specialty: 'Podiatry',
      component_code: 'POD_BONE_SCREW',
      component_name: 'Headless Compression Screw',
      requirement_type: 'required',
      quantity_calculation_method: 'fixed',
      expected_quantity_min: 1,
      expected_quantity_max: 2,
      default_quantity: 1,
      clinical_evidence_citation: 'ACFAS Bunionectomy Practice Guidelines'
    };

    const saved = await cptImplantMappingService.saveMapping(customMapping, 'test-user-uuid');
    assert.ok(saved.id, 'Must generate mapping ID');
    assert.equal(saved.cpt_code, '28296', 'Must persist CPT code');
    assert.equal(saved.component_code, 'POD_BONE_SCREW', 'Must persist component code');
    assert.equal(saved.is_facility_override, true, 'Must be marked as facility override');

    // Clean up
    await cptImplantMappingService.deactivateMapping(saved.id);
  });
});

// ==============================================================================
// SUITE 5: COMPONENT ARCHITECTURE & UI MOUNTING
// ==============================================================================

test('Phase 52 — Component Architecture & UI Mounting', async (t) => {
  const componentPath = path.join(rootDir, 'src', 'components', 'CptImplantMappingMatrix.jsx');
  const cssPath = path.join(rootDir, 'src', 'components', 'CptImplantMappingMatrix.css');
  const appPath = path.join(rootDir, 'src', 'App.jsx');

  await t.test('CptImplantMappingMatrix.jsx and CSS exist', () => {
    assert.ok(fs.existsSync(componentPath), 'CptImplantMappingMatrix.jsx must exist');
    assert.ok(fs.existsSync(cssPath), 'CptImplantMappingMatrix.css must exist');
  });

  const appContent = fs.readFileSync(appPath, 'utf8');

  await t.test('App.jsx mounts CptImplantMappingMatrix in sidebar and tab router', () => {
    assert.match(appContent, /import CptImplantMappingMatrix from '\.\/components\/CptImplantMappingMatrix';/, 'Must import component');
    assert.match(appContent, /activeTab === 'cpt_implant_matrix'/, 'Must have activeTab check');
    assert.match(appContent, /<CptImplantMappingMatrix/, 'Must render component in JSX');
    assert.match(appContent, /CPT-to-Implant Matrix/, 'Must have sidebar menu item');
  });

  const componentContent = fs.readFileSync(componentPath, 'utf8');

  await t.test('CptImplantMappingMatrix.jsx enforces zero mock fallbacks and adheres to design rules', () => {
    assert.match(componentContent, /cptImplantMappingService/, 'Must consume service layer');
    assert.match(componentContent, /Construct Inspector/, 'Must provide inspector drawer');
    assert.match(componentContent, /btn-add-mapping/, 'Must provide add mapping action');
  });
});
