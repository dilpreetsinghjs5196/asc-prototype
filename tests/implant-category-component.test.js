import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  implantService,
  DURATION_CLASSIFICATIONS,
  COMPONENT_TYPES,
  DURATION_METADATA
} from '../src/lib/implantService.js';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 51 — Implant Category & Component Model Test Suite', () => {

  // Domain 1: Database Migration 026 DDL & Schema Integrity
  describe('1. Database Migration 026: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '026_implant_category_and_component_model.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '026_implant_category_and_component_model_down.sql');

    it('Migration 026 forward and down SQL files exist and are substantive', () => {
      assert.ok(fs.existsSync(migPath), '026_implant_category_and_component_model.sql must exist');
      assert.ok(fs.existsSync(downPath), '026_implant_category_and_component_model_down.sql must exist');
      const fwd = fs.readFileSync(migPath, 'utf8');
      const dwn = fs.readFileSync(downPath, 'utf8');
      assert.ok(fwd.length > 5000, 'Forward migration must be substantive');
      assert.ok(dwn.length > 300, 'Down migration must be substantive');
    });

    it('Migration 026 creates public.implant_categories with hierarchy & tenant columns', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.implant_categories'), 'Must create implant_categories table');
      assert.ok(sql.includes('facility_id UUID REFERENCES public.facilities(id)'), 'Must support facility_id tenancy');
      assert.ok(sql.includes('parent_category_id UUID REFERENCES public.implant_categories(id)'), 'Must support self-referential parent categories');
      assert.ok(sql.includes('uq_implant_category_code UNIQUE NULLS NOT DISTINCT (facility_id, code)'), 'Must enforce unique code per tenant/global scope');
      assert.ok(sql.includes('CONSTRAINT chk_category_no_self_parent CHECK (id != parent_category_id)'), 'Must prevent direct self-parenting');
    });

    it('Migration 026 creates public.implant_components with clinical & duration constraints', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.implant_components'), 'Must create implant_components table');
      assert.ok(sql.includes('category_id UUID NOT NULL REFERENCES public.implant_categories(id)'), 'Must reference category_id');
      assert.ok(sql.includes('uq_implant_component_code UNIQUE NULLS NOT DISTINCT (category_id, facility_id, code)'), 'Must enforce unique component code');
      assert.ok(sql.includes('CONSTRAINT chk_component_type CHECK'), 'Must validate component_type');
      assert.ok(sql.includes('CONSTRAINT chk_component_duration CHECK'), 'Must validate duration classification');
      assert.ok(sql.includes('CONSTRAINT chk_biologic_consistency CHECK'), 'Must validate biologic consistency constraint');
    });

    it('Migration 026 implements cycle prevention trigger fn_prevent_circular_category_hierarchy', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_prevent_circular_category_hierarchy()'), 'Must define cycle prevention function');
      assert.ok(sql.includes('Category hierarchy exceeds maximum depth limit of 10 levels'), 'Must enforce max depth 10');
      assert.ok(sql.includes('Circular parent-child relationship detected'), 'Must detect circular relationships');
      assert.ok(sql.includes('CREATE TRIGGER trg_prevent_circular_category_hierarchy'), 'Must attach trigger');
    });

    it('Migration 026 implements restrict active category deactivation trigger (A2 decision)', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_restrict_active_category_deactivation()'), 'Must define deactivation restriction function');
      assert.ok(sql.includes('Cannot deactivate category "%" because it contains % active sub-categories'), 'Must restrict active sub-categories');
      assert.ok(sql.includes('Cannot deactivate category "%" because it contains % active components'), 'Must restrict active components');
      assert.ok(sql.includes('CREATE TRIGGER trg_restrict_active_category_deactivation'), 'Must attach deactivation guard trigger');
    });

    it('Migration 026 enables Row-Level Security with hybrid tenant policies', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('ALTER TABLE public.implant_categories ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on categories');
      assert.ok(sql.includes('ALTER TABLE public.implant_components ENABLE ROW LEVEL SECURITY'), 'Must enable RLS on components');
      assert.ok(sql.includes('implant_categories_facility_isolation'), 'Must define category RLS policy');
      assert.ok(sql.includes('implant_components_facility_isolation'), 'Must define component RLS policy');
    });

    it('Migration 026 seeds global baseline taxonomy for Ortho, Spine, Ophth, Pain, Plastics, Podiatry', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes("'ORTHO_HIP'"), 'Must seed ORTHO_HIP');
      assert.ok(sql.includes("'ORTHO_KNEE'"), 'Must seed ORTHO_KNEE');
      assert.ok(sql.includes("'SPINE_ACDF'"), 'Must seed SPINE_ACDF');
      assert.ok(sql.includes("'OPHTH_CATARACT'"), 'Must seed OPHTH_CATARACT');
      assert.ok(sql.includes("'PAIN_SCS'"), 'Must seed PAIN_SCS');
      assert.ok(sql.includes("'PLASTICS_BREAST'"), 'Must seed PLASTICS_BREAST');
      assert.ok(sql.includes("'PODIATRY_FOREFOOT'"), 'Must seed PODIATRY_FOREFOOT');
    });
  });

  // Domain 2: Client Service Layer & Validation Logic
  describe('2. Client Service Layer: implantService.js', () => {
    it('implantService exports valid duration classifications matching FDA/ISO standards', () => {
      assert.equal(DURATION_CLASSIFICATIONS.PERMANENT, 'permanent');
      assert.equal(DURATION_CLASSIFICATIONS.TEMPORARY, 'temporary');
      assert.equal(DURATION_CLASSIFICATIONS.RESORBABLE, 'resorbable');
      assert.equal(DURATION_CLASSIFICATIONS.BIOABSORBABLE, 'bioabsorbable');
      assert.equal(DURATION_CLASSIFICATIONS.EXCHANGEABLE, 'exchangeable');
    });

    it('COMPONENT_TYPES defines standardized clinical roles', () => {
      assert.ok(COMPONENT_TYPES.includes('structural'));
      assert.ok(COMPONENT_TYPES.includes('bearing'));
      assert.ok(COMPONENT_TYPES.includes('fixation'));
      assert.ok(COMPONENT_TYPES.includes('spacer'));
      assert.ok(COMPONENT_TYPES.includes('biologic'));
      assert.ok(COMPONENT_TYPES.includes('device_system'));
      assert.ok(COMPONENT_TYPES.includes('accessory'));
    });

    it('DURATION_METADATA conforms to regulatory references without banned purple styles', () => {
      for (const [durKey, meta] of Object.entries(DURATION_METADATA)) {
        assert.ok(meta.label, `Duration ${durKey} must have label`);
        assert.ok(meta.regulatoryRef, `Duration ${durKey} must have regulatoryRef`);
        assert.ok(meta.badgeClass, `Duration ${durKey} must have badgeClass`);
        // Enforce Purple Ban in badge classes
        assert.ok(!meta.badgeClass.includes('purple'), 'Badge class must not be purple');
        assert.ok(!meta.badgeClass.includes('violet'), 'Badge class must not be violet');
      }
    });

    it('implantService delegates are wired onto db object', () => {
      assert.ok(typeof db.getImplantCategories === 'function', 'db.getImplantCategories must be a function');
      assert.ok(typeof db.getImplantCategoryTree === 'function', 'db.getImplantCategoryTree must be a function');
      assert.ok(typeof db.getImplantComponentsByCategory === 'function', 'db.getImplantComponentsByCategory must be a function');
    });

    it('implantService.getCategories returns baseline categories', async () => {
      const allCategories = await implantService.getCategories();
      assert.ok(Array.isArray(allCategories), 'Must return an array');
      assert.ok(allCategories.length >= 6, 'Must return at least 6 baseline categories');

      const orthoHip = allCategories.find(c => c.code === 'ORTHO_HIP');
      assert.ok(orthoHip, 'Must locate ORTHO_HIP category');
      assert.equal(orthoHip.specialty, 'Orthopedics');
      assert.equal(orthoHip.is_active, true);
    });

    it('implantService.getCategories filters by specialty', async () => {
      const spineCategories = await implantService.getCategories('Spine');
      assert.ok(Array.isArray(spineCategories));
      assert.ok(spineCategories.every(c => c.specialty === 'Spine'), 'All returned categories must be Spine');
    });

    it('implantService.getComponentsByCategory returns components for ORTHO_HIP', async () => {
      const hipComponents = await implantService.getComponentsByCategory('ORTHO_HIP');
      assert.ok(Array.isArray(hipComponents));
      assert.ok(hipComponents.length >= 5, 'ORTHO_HIP must have at least 5 components');

      const cup = hipComponents.find(c => c.code === 'HIP_CUP');
      assert.ok(cup, 'Must contain HIP_CUP');
      assert.equal(cup.component_type, 'structural');
      assert.equal(cup.default_duration, 'permanent');
      assert.equal(cup.requires_serial_tracking, true);
      assert.equal(cup.requires_lot_tracking, true);
    });
  });

  // Domain 3: Clinical Validation & Invariant Enforcement
  describe('3. Clinical Validation & Invariant Enforcement', () => {
    it('saveCategory rejects missing code, name, or specialty', async () => {
      await assert.rejects(
        async () => {
          await implantService.saveCategory({ code: 'TEST' });
        },
        /requires code, name, and specialty/
      );
    });

    it('saveCategory rejects immediate self-parenting', async () => {
      await assert.rejects(
        async () => {
          await implantService.saveCategory({
            id: 'cat-uuid-001',
            parent_category_id: 'cat-uuid-001',
            code: 'LOOP',
            name: 'Loop Cat',
            specialty: 'Orthopedics'
          });
        },
        /Category cannot be its own parent/
      );
    });

    it('saveComponent rejects invalid component_type', async () => {
      await assert.rejects(
        async () => {
          await implantService.saveComponent({
            category_id: 'cat-uuid-001',
            code: 'INVALID_TYPE',
            name: 'Invalid Component',
            component_type: 'nonexistent_type'
          });
        },
        /Invalid component_type/
      );
    });

    it('saveComponent rejects invalid default_duration', async () => {
      await assert.rejects(
        async () => {
          await implantService.saveComponent({
            category_id: 'cat-uuid-001',
            code: 'INVALID_DUR',
            name: 'Invalid Duration Comp',
            component_type: 'structural',
            default_duration: 'indefinite'
          });
        },
        /Invalid default_duration/
      );
    });

    it('saveComponent enforces biologic consistency constraint', async () => {
      // Case 1: Biologic without allows_biological_tissue
      await assert.rejects(
        async () => {
          await implantService.saveComponent({
            category_id: 'cat-uuid-001',
            code: 'BIO_FAIL_1',
            name: 'Failing Biologic 1',
            component_type: 'biologic',
            allows_biological_tissue: false,
            default_duration: 'bioabsorbable'
          });
        },
        /Biologic components must have allows_biological_tissue set to TRUE/
      );

      // Case 2: Biologic with permanent duration (synthetic metal)
      await assert.rejects(
        async () => {
          await implantService.saveComponent({
            category_id: 'cat-uuid-001',
            code: 'BIO_FAIL_2',
            name: 'Failing Biologic 2',
            component_type: 'biologic',
            allows_biological_tissue: true,
            default_duration: 'permanent'
          });
        },
        /Biologic components must have default_duration set to "bioabsorbable"/
      );
    });

    it('deactivateCategory blocks deactivation if active components exist (A2 requirement)', async () => {
      await assert.rejects(
        async () => {
          // ORTHO_HIP has 5 active baseline components
          await implantService.deactivateCategory('ORTHO_HIP');
        },
        /Cannot deactivate category because it contains/
      );
    });
  });

  // Domain 4: UI Explorer & Maestro Guideline Compliance
  describe('4. UI Explorer & Maestro Guideline Compliance', () => {
    const explorerJsxPath = path.join(rootDir, 'src', 'components', 'ImplantTaxonomyExplorer.jsx');
    const explorerCssPath = path.join(rootDir, 'src', 'components', 'ImplantTaxonomyExplorer.css');
    const appJsxPath = path.join(rootDir, 'src', 'App.jsx');

    it('ImplantTaxonomyExplorer.jsx and CSS exist and are populated', () => {
      assert.ok(fs.existsSync(explorerJsxPath), 'ImplantTaxonomyExplorer.jsx must exist');
      assert.ok(fs.existsSync(explorerCssPath), 'ImplantTaxonomyExplorer.css must exist');
    });

    it('CSS and JSX strictly obey Purple Ban (zero banned purple/violet/magenta/fuchsia hexes)', () => {
      const css = fs.readFileSync(explorerCssPath, 'utf8').toLowerCase();
      const jsx = fs.readFileSync(explorerJsxPath, 'utf8').toLowerCase();
      const bannedKeywords = ['purple', 'violet', 'fuchsia', 'magenta', 'lavender', '#8b5cf6', '#a855f7', '#9333ea', '#7c3aed', '#6d28d9'];

      for (const banned of bannedKeywords) {
        assert.ok(!css.includes(banned), `ImplantTaxonomyExplorer.css must not contain banned color: ${banned}`);
        assert.ok(!jsx.includes(banned), `ImplantTaxonomyExplorer.jsx must not contain banned color: ${banned}`);
      }
    });

    it('App.jsx integrates ImplantTaxonomyExplorer in sidebar and tab render', () => {
      const app = fs.readFileSync(appJsxPath, 'utf8');
      assert.ok(app.includes("import ImplantTaxonomyExplorer from './components/ImplantTaxonomyExplorer';"), 'Must import ImplantTaxonomyExplorer');
      assert.ok(app.includes("activeTab === 'implant_taxonomy'"), 'Must render implant_taxonomy tab in sidebar and content');
      assert.ok(app.includes('<ImplantTaxonomyExplorer'), 'Must instantiate ImplantTaxonomyExplorer');
    });
  });
});
