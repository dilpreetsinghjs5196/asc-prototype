import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import carcRarcService, {
  CARC_GROUP_CODES,
  ROOT_CAUSE_CATEGORIES,
  ACTION_WORKFLOWS,
  CARC_CATALOG,
  RARC_CATALOG,
  COMBINATORIAL_MAPPING_RULES,
  interpretAdjustment,
  calculateCarcKpis,
  getBaselineDenialQueue
} from '../src/lib/carcRarcService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 84 — CARC / RARC Model & Denial Intelligence Suite', () => {

  describe('1. CARC & RARC Master Registries Verification', () => {
    test('should define all 5 canonical claim adjustment group codes', () => {
      const groups = ['CO', 'PR', 'OA', 'PI', 'CR'];
      groups.forEach(g => {
        assert.ok(CARC_GROUP_CODES[g], `Group ${g} must exist`);
        assert.strictEqual(CARC_GROUP_CODES[g].code, g);
        assert.ok(CARC_GROUP_CODES[g].name, `Group ${g} must have a name`);
        assert.ok(CARC_GROUP_CODES[g].description, `Group ${g} must have description`);
      });
    });

    test('should export official CARC catalog with key ASC claim reason codes', () => {
      const essentialCarcs = ['1', '2', '3', '4', '16', '18', '22', '27', '29', '45', '50', '97', '197'];
      essentialCarcs.forEach(c => {
        const entry = CARC_CATALOG[c];
        assert.ok(entry, `CARC ${c} must exist in catalog`);
        assert.strictEqual(entry.code, c);
        assert.ok(entry.shortDescription, `CARC ${c} must have shortDescription`);
        assert.ok(entry.formalTitle, `CARC ${c} must have formalTitle`);
        assert.ok(typeof entry.isDenial === 'boolean', `CARC ${c} must have isDenial boolean`);
        assert.ok(typeof entry.recoveryLikelihoodPct === 'number', `CARC ${c} must have recovery %`);
      });
    });

    test('should export official RARC catalog with supplemental and informational codes', () => {
      const essentialRarcs = ['N1', 'N56', 'N115', 'N130', 'N211', 'N382', 'N517', 'MA01'];
      essentialRarcs.forEach(r => {
        const entry = RARC_CATALOG[r];
        assert.ok(entry, `RARC ${r} must exist in catalog`);
        assert.strictEqual(entry.code, r);
        assert.ok(entry.codeType === 'SUPPLEMENTAL' || entry.codeType === 'INFORMATIONAL', `RARC ${r} must have valid codeType`);
        assert.ok(entry.shortDescription, `RARC ${r} must have shortDescription`);
        assert.ok(entry.fullText, `RARC ${r} must have fullText`);
      });
    });
  });

  describe('2. Deterministic Combinatorial Interpretation Engine', () => {
    test('should interpret CO-197 + N517 as high-priority authorization appeal', () => {
      const res = interpretAdjustment('CO', '197', 'N517', 1850.00);
      assert.strictEqual(res.groupCode, 'CO');
      assert.strictEqual(res.carcCode, '197');
      assert.strictEqual(res.rarcCode, 'N517');
      assert.strictEqual(res.rootCauseCategory, 'AUTHORIZATION_PRECERT');
      assert.strictEqual(res.actionWorkflow, 'APPEALABLE');
      assert.ok(res.recoveryProbabilityPct >= 70, 'Recovery likelihood should be high with auth proof');
      assert.strictEqual(res.isDenial, true);
      assert.strictEqual(res.isRecoverable, true);
    });

    test('should interpret CO-16 + N56 as critical correct and resubmit rebill', () => {
      const res = interpretAdjustment('CO', '16', 'N56', 600.00);
      assert.strictEqual(res.rootCauseCategory, 'CODING_BILLING');
      assert.strictEqual(res.actionWorkflow, 'CORRECT_AND_RESUBMIT');
      assert.ok(res.recoveryProbabilityPct >= 90, 'Billing/modifier fix should have >=90% recovery odds');
      assert.strictEqual(res.priorityLevel, 'CRITICAL');
    });

    test('should interpret CO-50 + N115 as medical necessity LCD appeal', () => {
      const res = interpretAdjustment('CO', '50', 'N115', 1420.00);
      assert.strictEqual(res.rootCauseCategory, 'MEDICAL_NECESSITY');
      assert.strictEqual(res.actionWorkflow, 'APPEALABLE');
      assert.ok(res.guidanceText.includes('LCD'), 'Guidance should reference LCD policy');
    });

    test('should interpret CO-29 as timely filing write-off with low recovery', () => {
      const res = interpretAdjustment('CO', '29', null, 3100.00);
      assert.strictEqual(res.rootCauseCategory, 'TIMELY_FILING');
      assert.strictEqual(res.actionWorkflow, 'ADMIN_WRITE_OFF');
      assert.ok(res.recoveryProbabilityPct <= 15, 'Timely filing without submission proof has very low recovery');
    });

    test('should interpret CO-45 as normal contractual fee schedule discount', () => {
      const res = interpretAdjustment('CO', '45', null, 2500.00);
      assert.strictEqual(res.rootCauseCategory, 'CONTRACTUAL_FEE_SCHEDULE');
      assert.strictEqual(res.actionWorkflow, 'CONTRACTUAL_WRITE_OFF');
      assert.strictEqual(res.recoveryProbabilityPct, 0, 'Contractual discount is non-recoverable write-off');
      assert.strictEqual(res.isDenial, false, 'CO-45 is an allowable reduction, not a denial');
    });

    test('should interpret PR-1 and PR-2 as patient cost share balances', () => {
      const deductible = interpretAdjustment('PR', '1', null, 240.00);
      assert.strictEqual(deductible.rootCauseCategory, 'PATIENT_COST_SHARE');
      assert.strictEqual(deductible.actionWorkflow, 'TRANSFER_TO_PATIENT');
      assert.strictEqual(deductible.isDenial, false);

      const coinsurance = interpretAdjustment('PR', '2', null, 480.00);
      assert.strictEqual(coinsurance.rootCauseCategory, 'PATIENT_COST_SHARE');
      assert.strictEqual(coinsurance.actionWorkflow, 'TRANSFER_TO_PATIENT');
    });

    test('should gracefully handle unregistered code combinations without throwing', () => {
      const res = interpretAdjustment('CO', '999', 'N999', 500.00);
      assert.ok(res, 'Must return interpretation object');
      assert.strictEqual(res.carcCode, '999');
      assert.strictEqual(res.rarcCode, 'N999');
      assert.ok(res.rootCauseDetails, 'Must provide default root cause details');
      assert.ok(res.actionDetails, 'Must provide default action details');
    });
  });

  describe('3. Executive KPI Computation', () => {
    test('should accurately calculate denial exposure, appealable opportunity, and clean adjustment share', () => {
      const sampleItems = [
        interpretAdjustment('CO', '197', 'N517', 1850.00),
        interpretAdjustment('CO', '16', 'N56', 600.00),
        interpretAdjustment('CO', '45', null, 2450.00), // Clean contractual discount
        interpretAdjustment('PR', '1', null, 240.00)     // Patient deductible
      ];

      const kpis = calculateCarcKpis(sampleItems);
      assert.strictEqual(kpis.totalDenialExposure, 2450.00, 'Denial exposure should sum CO-197 and CO-16');
      assert.strictEqual(kpis.appealableOpportunity, 2450.00, 'Appealable opportunity should sum CO-197 and CO-16');
      assert.ok(kpis.cleanAdjustmentShare > 0, 'Clean adjustment share should be greater than 0');
      assert.ok(kpis.topRootCause !== 'None', 'Top root cause must be identified');
    });
  });

  describe('4. Database Migration SQL Verification (058_carc_rarc_model.sql)', () => {
    test('should exist on disk and define required schema tables and views', () => {
      const upPath = path.join(rootDir, 'supabase', 'migrations', '058_carc_rarc_model.sql');
      assert.ok(fs.existsSync(upPath), '058_carc_rarc_model.sql must exist');

      const content = fs.readFileSync(upPath, 'utf8');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.rcm_carc_master'), 'Must create rcm_carc_master table');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.rcm_rarc_master'), 'Must create rcm_rarc_master table');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.rcm_carc_rarc_mapping_rules'), 'Must create rcm_carc_rarc_mapping_rules table');
      assert.ok(content.includes('CREATE TABLE IF NOT EXISTS public.rcm_claim_denial_interpretations'), 'Must create rcm_claim_denial_interpretations table');
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_rcm_carc_frequency_analysis'), 'Must create frequency view');
      assert.ok(content.includes('CREATE OR REPLACE VIEW public.vw_rcm_actionable_denial_queue'), 'Must create denial queue view');
    });

    test('should enforce idempotent DROP POLICY IF EXISTS before CREATE POLICY to prevent error 42710', () => {
      const upPath = path.join(rootDir, 'supabase', 'migrations', '058_carc_rarc_model.sql');
      const content = fs.readFileSync(upPath, 'utf8');

      const dropPolicyMatches = content.match(/DROP POLICY IF EXISTS/g) || [];
      const createPolicyMatches = content.match(/CREATE POLICY/g) || [];

      assert.ok(dropPolicyMatches.length >= 4, 'Must have at least 4 DROP POLICY IF EXISTS statements');
      assert.strictEqual(dropPolicyMatches.length, createPolicyMatches.length, 'Every CREATE POLICY must have a matching DROP POLICY IF EXISTS');
    });

    test('should include safe rollback down migration', () => {
      const downPath = path.join(rootDir, 'supabase', 'migrations', '058_carc_rarc_model_down.sql');
      assert.ok(fs.existsSync(downPath), '058_carc_rarc_model_down.sql must exist');

      const content = fs.readFileSync(downPath, 'utf8');
      assert.ok(content.includes('DROP VIEW IF EXISTS public.vw_rcm_actionable_denial_queue'), 'Must drop denial queue view');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.rcm_claim_denial_interpretations'), 'Must drop denial interpretations table');
      assert.ok(content.includes('DROP TABLE IF EXISTS public.rcm_carc_master'), 'Must drop CARC master table');
    });
  });

  describe('5. Maestro Clinical Design System Token Governance', () => {
    test('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in CarcRarcModelView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'CarcRarcModelView.css');
      assert.ok(fs.existsSync(cssPath), 'CarcRarcModelView.css must exist');

      const cssContent = fs.readFileSync(cssPath, 'utf8');
      const cleanCss = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
      const purpleRegex = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

      assert.strictEqual(purpleRegex.test(cleanCss), false, 'CarcRarcModelView.css must contain zero banned color tokens');
    });

    test('should enforce responsive table with min-width: 1100px and table-layout: fixed in CarcRarcModelView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'CarcRarcModelView.css');
      const cssContent = fs.readFileSync(cssPath, 'utf8');

      assert.ok(cssContent.includes('.table-responsive'), 'Must define .table-responsive');
      assert.ok(cssContent.includes('overflow-x: auto'), 'Must set overflow-x: auto');
      assert.ok(cssContent.includes('min-width: 1100px'), 'Table must have minimum width 1100px');
      assert.ok(cssContent.includes('table-layout: fixed'), 'Must enforce table-layout: fixed to prevent column drift');
    });

    test('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in CarcRarcModelView.jsx', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'CarcRarcModelView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'CarcRarcModelView.jsx must exist');

      const jsxContent = fs.readFileSync(jsxPath, 'utf8');
      const cleanJsx = jsxContent.replace(/\/\*[\s\S]*?\*\//g, '');
      const purpleRegex = /\b(purple|violet|indigo|magenta|fuchsia)\b/i;

      assert.strictEqual(purpleRegex.test(cleanJsx), false, 'CarcRarcModelView.jsx must contain zero banned color tokens');
    });
  });

  describe('6. Application Wiring & UI Routing Integration', () => {
    test('should register CarcRarcModelView in src/App.jsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');

      assert.ok(content.includes("import CarcRarcModelView from './components/CarcRarcModelView';"), 'Must import CarcRarcModelView');
      assert.ok(content.includes("activeTab === 'carc_rarc_model'"), 'Must bind carc_rarc_model activeTab');
      assert.ok(content.includes('<CarcRarcModelView />'), 'Must render CarcRarcModelView component');
      assert.ok(content.includes('CARC & RARC Denial Intelligence Matrix'), 'Must have header title');
    });
  });

  describe('7. Master Specifications Directory Integrity', () => {
    test('should maintain populated 84_CARC_RARC_MODEL.md specification', () => {
      const specPath = 'E:\\medicalAI\\ASCANALYST_All_Modules\\ASCANALYST_MD_SPECS\\Phase_08_RCM\\84_CARC_RARC_MODEL.md';
      if (fs.existsSync(specPath)) {
        const content = fs.readFileSync(specPath, 'utf8');
        assert.ok(content.includes('# 84 CARC RARC MODEL'), 'Must have title');
        assert.ok(content.includes('## Purpose'), 'Must have Purpose section');
        assert.ok(content.includes('## Scope'), 'Must have Scope section');
        assert.ok(content.includes('## Current State'), 'Must have Current State section');
        assert.ok(content.includes('## Target State'), 'Must have Target State section');
        assert.ok(content.includes('## Data Model / Schema'), 'Must have Data Model section');
        assert.ok(content.includes('## Business Rules'), 'Must have Business Rules section');
        assert.ok(content.includes('## Acceptance Criteria'), 'Must have Acceptance Criteria section');
        assert.ok(content.length > 5000, 'Specification must be fully written and not a stub');
      }
    });
  });

});
