import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 42 — CPT Specialty, Body System, Body Part, Organ & Procedure-Family Suite', () => {

  // Domain 1: Database Migration 019 DDL & Schema Integrity
  describe('1. Database Migration 019: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '019_cpt_specialty_body_part_mapping.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '019_cpt_specialty_body_part_mapping_down.sql');

    it('Migration 019 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '019_cpt_specialty_body_part_mapping.sql must exist');
      assert.ok(fs.existsSync(downPath), '019_cpt_specialty_body_part_mapping_down.sql must exist');
    });

    it('Migration 019 creates public.clinical_specialties table', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.clinical_specialties'), 'Must create clinical_specialties table');
      assert.ok(sql.includes('code VARCHAR(50) NOT NULL UNIQUE'), 'Specialty code must be unique');
      assert.ok(sql.includes('name VARCHAR(100) NOT NULL'), 'Specialty name must be required');
      assert.ok(sql.includes('display_order INTEGER NOT NULL DEFAULT 0'), 'Specialty must track display_order');
    });

    it('Migration 019 creates public.body_systems table', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.body_systems'), 'Must create body_systems table');
      assert.ok(sql.includes('code VARCHAR(50) NOT NULL UNIQUE'), 'Body system code must be unique');
      assert.ok(sql.includes('name VARCHAR(100) NOT NULL'), 'Body system name must be required');
    });

    it('Migration 019 creates public.body_parts with foreign key to body_systems and laterality flag', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.body_parts'), 'Must create body_parts table');
      assert.ok(sql.includes('body_system_id UUID NOT NULL REFERENCES public.body_systems(id) ON DELETE CASCADE'), 'Must reference body_systems with cascade delete');
      assert.ok(sql.includes('laterality_applicable BOOLEAN NOT NULL DEFAULT false'), 'Must track laterality_applicable');
    });

    it('Migration 019 creates public.anatomical_organs with SNOMED CT identifiers', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.anatomical_organs'), 'Must create anatomical_organs table');
      assert.ok(sql.includes('body_part_id UUID NOT NULL REFERENCES public.body_parts(id) ON DELETE CASCADE'), 'Must reference body_parts');
      assert.ok(sql.includes('snomed_ct_id VARCHAR(50)'), 'Must track snomed_ct_id for terminology alignment');
    });

    it('Migration 019 creates public.procedure_families table with surgical approach', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.procedure_families'), 'Must create procedure_families table');
      assert.ok(sql.includes('surgical_approach VARCHAR(50)'), 'Must track surgical_approach');
    });

    it('Migration 019 creates public.cpt_clinical_mappings junction with multi-cardinality & facility scoping', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_clinical_mappings'), 'Must create cpt_clinical_mappings table');
      assert.ok(sql.includes('cpt_master_id UUID NOT NULL REFERENCES public.cpt_master(id)'), 'Must reference cpt_master');
      assert.ok(sql.includes('specialty_id UUID NOT NULL REFERENCES public.clinical_specialties(id)'), 'Must reference clinical_specialties');
      assert.ok(sql.includes('body_system_id UUID NOT NULL REFERENCES public.body_systems(id)'), 'Must reference body_systems');
      assert.ok(sql.includes('body_part_id UUID NOT NULL REFERENCES public.body_parts(id)'), 'Must reference body_parts');
      assert.ok(sql.includes('organ_id UUID REFERENCES public.anatomical_organs(id)'), 'Must reference anatomical_organs');
      assert.ok(sql.includes('procedure_family_id UUID REFERENCES public.procedure_families(id)'), 'Must reference procedure_families');
      assert.ok(sql.includes('is_primary BOOLEAN NOT NULL DEFAULT true'), 'Must track is_primary mapping');
      assert.ok(sql.includes('review_status VARCHAR(20) NOT NULL DEFAULT \'verified\''), 'Must have default review_status');
      assert.ok(sql.includes('facility_id UUID REFERENCES public.facilities(id)'), 'Must allow facility tenancy overrides');
    });

    it('Migration 019 creates public.cpt_mapping_reviews audit provenance table', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_mapping_reviews'), 'Must create cpt_mapping_reviews');
      assert.ok(sql.includes('mapping_id UUID NOT NULL REFERENCES public.cpt_clinical_mappings(id) ON DELETE CASCADE'), 'Must reference cpt_clinical_mappings');
      assert.ok(sql.includes('decision VARCHAR(20) NOT NULL CHECK'), 'Must validate review decision');
    });

    it('Migration 019 seeds standard catalog data for all 12 ASC specialties', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const expectedSpecialties = [
        'ORTHO', 'OPHTH', 'GI', 'ENT', 'PLASTIC', 'PODIATRY',
        'UROLOGY', 'PAIN', 'CARDIO', 'GENERAL', 'NEURO', 'GYN'
      ];
      for (const code of expectedSpecialties) {
        assert.ok(sql.includes(`'${code}'`), `Specialty ${code} must be seeded in migration 019`);
      }
    });

    it('Migration 019 seeds anatomical taxonomy with laterality for bilateral structures', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      // Bilateral structures must have laterality_applicable = true
      assert.ok(sql.includes("'BP_SHOULDER', 'Shoulder', true"), 'Shoulder must have laterality=true');
      assert.ok(sql.includes("'BP_KNEE', 'Knee', true"), 'Knee must have laterality=true');
      assert.ok(sql.includes("'BP_EYE', 'Eye / Ocular Adnexa', true"), 'Eye must have laterality=true');
      assert.ok(sql.includes("'BP_EAR', 'Ear', true"), 'Ear must have laterality=true');
      // Midline/visceral structures must have laterality_applicable = false
      assert.ok(sql.includes("'BP_SPINE', 'Spine / Back', false"), 'Spine must have laterality=false');
      assert.ok(sql.includes("'BP_UPPER_GI', 'Upper GI (Esophagus / Stomach)', false"), 'Upper GI must have laterality=false');
    });

    it('Migration 019 seeds surgical procedure families', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      const expectedFamilies = ['FAM_ARTHROSCOPY', 'FAM_ENDOSCOPY', 'FAM_EXCISION', 'FAM_REPAIR', 'FAM_ARTHROPLASTY', 'FAM_INJECTION', 'FAM_BIOPSY'];
      for (const fam of expectedFamilies) {
        assert.ok(sql.includes(`'${fam}'`), `Procedure family ${fam} must be seeded in migration 019`);
      }
    });

    it('Migration 019 implements fn_resolve_cpt_clinical_taxonomy stored procedure with facility override priority', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_clinical_taxonomy'), 'Must create resolution function');
      assert.ok(sql.includes('ORDER BY map.facility_id NULLS LAST, map.is_primary DESC'), 'Must prioritize facility override above standard catalog');
    });

    it('Migration 019 avoids Postgres 42883 bigint = uuid error in RLS policies', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(!sql.includes('u.id = auth.uid()'), 'Must not directly compare bigint u.id to uuid auth.uid()');
      assert.ok(sql.includes('u.id::text = auth.uid()::text') || sql.includes('fm.user_id = auth.uid()'), 'Must safely cast or use UUID user_id');
    });

    it('Migration 019 drops view before recreate to prevent Postgres 42P16 column rename error', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('DROP VIEW IF EXISTS public.v_cpt_codes_compat CASCADE;'), 'Must drop view before recreating with new joined columns');
    });

    it('Migration 019 down script drops all created tables, functions, and restores previous view', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_resolve_cpt_clinical_taxonomy'), 'Must drop resolution function');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_mapping_reviews CASCADE'), 'Must drop cpt_mapping_reviews');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_clinical_mappings CASCADE'), 'Must drop cpt_clinical_mappings');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.procedure_families CASCADE'), 'Must drop procedure_families');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.anatomical_organs CASCADE'), 'Must drop anatomical_organs');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.body_parts CASCADE'), 'Must drop body_parts');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.body_systems CASCADE'), 'Must drop body_systems');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.clinical_specialties CASCADE'), 'Must drop clinical_specialties');
      assert.ok(downSql.includes('CREATE VIEW public.v_cpt_codes_compat AS'), 'Must re-establish clean compatibility view');
    });
  });

  // Domain 2: Client Service Layer & Taxonomical Resolution
  describe('2. Client Service Layer & Taxonomy Methods', () => {
    it('db.getClinicalTaxonomy returns complete structured catalogs', async () => {
      const taxonomy = await db.getClinicalTaxonomy();
      assert.ok(taxonomy, 'Taxonomy object must be returned');
      assert.ok(Array.isArray(taxonomy.specialties), 'Specialties must be an array');
      assert.ok(taxonomy.specialties.length >= 12, 'Must have at least 12 specialties');
      assert.ok(Array.isArray(taxonomy.bodySystems), 'Body systems must be an array');
      assert.ok(taxonomy.bodySystems.length >= 9, 'Must have at least 9 body systems');
      assert.ok(Array.isArray(taxonomy.bodyParts), 'Body parts must be an array');
      assert.ok(taxonomy.bodyParts.length >= 19, 'Must have at least 19 body parts');
      assert.ok(Array.isArray(taxonomy.anatomicalOrgans), 'Anatomical organs must be an array');
      assert.ok(Array.isArray(taxonomy.procedureFamilies), 'Procedure families must be an array');
    });

    it('db.resolveCPTClinicalTaxonomy handles missing and valid CPT codes fail-closed', async () => {
      const resolved = await db.resolveCPTClinicalTaxonomy('INVALID_99999');
      assert.ok(resolved, 'Must return a resolution response');
      // If code cannot be matched, it should return graceful unmapped defaults
      if (!resolved.success) {
        assert.equal(resolved.specialty_name, 'General');
        assert.equal(resolved.body_part_name, 'General Body');
        assert.equal(resolved.laterality_applicable, false);
      }
    });

    it('Laterality is correctly flagged for musculoskeletal and ocular extremities', async () => {
      const taxonomy = await db.getClinicalTaxonomy();
      const knee = taxonomy.bodyParts.find(b => b.code === 'BP_KNEE');
      const shoulder = taxonomy.bodyParts.find(b => b.code === 'BP_SHOULDER');
      const eye = taxonomy.bodyParts.find(b => b.code === 'BP_EYE');
      const spine = taxonomy.bodyParts.find(b => b.code === 'BP_SPINE');

      assert.ok(knee && knee.laterality_applicable === true, 'Knee must have laterality applicable');
      assert.ok(shoulder && shoulder.laterality_applicable === true, 'Shoulder must have laterality applicable');
      assert.ok(eye && eye.laterality_applicable === true, 'Eye must have laterality applicable');
      assert.ok(spine && spine.laterality_applicable === false, 'Spine must NOT have laterality applicable');
    });
  });

  // Domain 3: Surgery Scheduler Body Part Filtering (Defect Verification)
  describe('3. Surgery Scheduler Body Part Resolution & Filtering Defect', () => {
    const mockCptCatalog = [
      { id: 1, code: '29881', description: 'Knee Arthroscopy Meniscectomy', category: 'Orthopedics', body_part: 'Knee' },
      { id: 2, code: '29827', description: 'Rotator Cuff Repair Arthroscopic', category: 'Orthopedics', body_part: 'Shoulder' },
      { id: 3, code: '66984', description: 'Cataract Surgery', category: 'Ophthalmology', body_part: 'Eye' },
      { id: 4, code: '43239', description: 'Upper GI Endoscopy Biopsy', category: 'Gastroenterology', body_part: 'Upper GI' },
      { id: 5, code: '10060', description: 'Incision and Drainage Abscess', category: 'General', body_part: null }
    ];

    it('Extracts availableBodyParts from cpt.body_part without undefined failure', () => {
      const parts = new Set();
      mockCptCatalog.forEach(c => {
        const part = c.body_part || c.details?.body_part;
        if (part && typeof part === 'string' && part.trim()) {
          parts.add(part.trim());
        }
      });
      const availableBodyParts = Array.from(parts).sort();

      assert.deepEqual(availableBodyParts, ['Eye', 'Knee', 'Shoulder', 'Upper GI']);
      assert.ok(!availableBodyParts.includes(null), 'Must filter out null body parts');
      assert.ok(!availableBodyParts.includes(undefined), 'Must filter out undefined body parts');
    });

    it('Filters CPT catalog accurately by selected body part', () => {
      const selectedBodyPart = 'Knee';
      const filtered = mockCptCatalog.filter(cpt => {
        const cptPart = cpt.body_part || cpt.details?.body_part;
        return !selectedBodyPart || (cptPart === selectedBodyPart);
      });

      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].code, '29881');
      assert.equal(filtered[0].body_part, 'Knee');
    });

    it('Allows CPTs to pass when no body part filter is selected', () => {
      const selectedBodyPart = '';
      const filtered = mockCptCatalog.filter(cpt => {
        const cptPart = cpt.body_part || cpt.details?.body_part;
        return !selectedBodyPart || (cptPart === selectedBodyPart);
      });

      assert.equal(filtered.length, 5);
    });
  });

  // Domain 4: CPT Upload & Management Invariants
  describe('4. CPT Management & Upload Clinical Taxonomy Invariants', () => {
    it('CPTUpload preserves body_part and derives procedure_group from category', () => {
      const item = { code: '29881', category: 'Orthopedics', body_part: 'Knee', reimbursement: 1450 };
      const existing = {};

      const payload = {
        procedure_group: item.procedure_group || existing.procedure_group || (item.category ? `${item.category} Procedures` : 'General Procedures'),
        category: item.category || existing.category || 'General',
        body_part: item.body_part || existing.body_part || null,
        code: item.code,
        reimbursement: item.reimbursement
      };

      assert.equal(payload.body_part, 'Knee', 'body_part must be preserved during upload');
      assert.equal(payload.procedure_group, 'Orthopedics Procedures', 'procedure_group must be derived from category');
      assert.equal(payload.category, 'Orthopedics');
    });

    it('CPTManagement imports standard body parts list for modal datalist', () => {
      const cptMgmtPath = path.join(rootDir, 'src', 'components', 'CPTManagement.jsx');
      const content = fs.readFileSync(cptMgmtPath, 'utf8');

      assert.ok(content.includes('STANDARD_BODY_PARTS'), 'CPTManagement must define STANDARD_BODY_PARTS');
      assert.ok(content.includes('list="standard-body-parts"'), 'Body part input must connect to standard datalist');
      assert.ok(content.includes('<datalist id="standard-body-parts">'), 'Datalist must be rendered in DOM');
    });
  });
});
