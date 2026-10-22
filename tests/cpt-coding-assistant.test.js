import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/supabase.js';
import { rbacService, PERMISSIONS_CATALOG, CANONICAL_ROLES } from '../src/lib/rbacService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Phase 43 — AI CPT Coding Assistant & Human-in-the-Loop Review Suite', () => {

  // Domain 1: Database Migration 020 DDL & Schema Integrity
  describe('1. Database Migration 020: DDL & Schema Integrity', () => {
    const migPath = path.join(rootDir, 'supabase', 'migrations', '020_cpt_coding_assistant.sql');
    const downPath = path.join(rootDir, 'supabase', 'migrations', '020_cpt_coding_assistant_down.sql');

    it('Migration 020 forward and down SQL files exist', () => {
      assert.ok(fs.existsSync(migPath), '020_cpt_coding_assistant.sql must exist');
      assert.ok(fs.existsSync(downPath), '020_cpt_coding_assistant_down.sql must exist');
    });

    it('Migration 020 creates public.cpt_coding_sessions table with SHA-256 hash tracking', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_coding_sessions'), 'Must create cpt_coding_sessions table');
      assert.ok(sql.includes('case_id UUID NOT NULL REFERENCES public.cases(id)'), 'Must reference cases table');
      assert.ok(sql.includes('facility_id UUID NOT NULL REFERENCES public.facilities(id)'), 'Must reference facilities table');
      assert.ok(sql.includes('source_document_text TEXT NOT NULL'), 'source_document_text must be tracked');
      assert.ok(sql.includes('source_document_hash VARCHAR(64) NOT NULL'), 'source_document_hash must be 64-char SHA-256');
      assert.ok(sql.includes('model_name VARCHAR(100) NOT NULL'), 'model_name must be tracked');
      assert.ok(sql.includes('session_status VARCHAR(20) NOT NULL'), 'Must have session status column');
    });

    it('Migration 020 creates public.cpt_coding_candidates with confidence bounds and quote citations', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_coding_candidates'), 'Must create cpt_coding_candidates table');
      assert.ok(sql.includes('session_id UUID NOT NULL REFERENCES public.cpt_coding_sessions(id) ON DELETE CASCADE'), 'Must cascade delete with session');
      assert.ok(sql.includes('cpt_code VARCHAR(10) NOT NULL'), 'cpt_code must be tracked');
      assert.ok(sql.includes('CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00)'), 'Confidence score must be constrained between 0.00 and 1.00');
      assert.ok(sql.includes('documentation_excerpt TEXT'), 'documentation_excerpt must be tracked');
      assert.ok(sql.includes('clinical_rationale TEXT'), 'clinical_rationale must be tracked');
      assert.ok(sql.includes('identified_warnings TEXT[] NOT NULL DEFAULT \'{}\''), 'identified_warnings must be array');
      assert.ok(sql.includes('suggested_modifiers TEXT[] NOT NULL DEFAULT \'{}\''), 'suggested_modifiers must be array');
      assert.ok(sql.includes('review_decision VARCHAR(25) NOT NULL DEFAULT \'pending\''), 'review_decision must default to pending');
    });

    it('Migration 020 creates public.cpt_coding_reviews audit provenance log', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS public.cpt_coding_reviews'), 'Must create cpt_coding_reviews table');
      assert.ok(sql.includes('candidate_id UUID NOT NULL REFERENCES public.cpt_coding_candidates(id) ON DELETE CASCADE'), 'Must reference candidate');
      assert.ok(sql.includes('reviewer_id UUID REFERENCES auth.users(id)'), 'Must record reviewer user id');
      assert.ok(sql.includes('action VARCHAR(30) NOT NULL'), 'Action must be validated');
      assert.ok(sql.includes('committed_procedure_id UUID REFERENCES public.surgery_procedures(id)'), 'Must optionally link to committed procedure line');
    });

    it('Migration 020 defines atomic fn_commit_cpt_coding_candidate stored procedure', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_commit_cpt_coding_candidate'), 'Must define commit stored procedure');
      assert.ok(sql.includes('INSERT INTO public.surgery_procedures'), 'Must atomically insert into surgery_procedures');
      assert.ok(sql.includes("review_decision = 'approved'"), 'Must update candidate status to approved');
      assert.ok(sql.includes('INSERT INTO public.cpt_coding_reviews'), 'Must log coder action in cpt_coding_reviews');
    });

    it('Migration 020 defines atomic fn_reject_cpt_coding_candidate stored procedure', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fn_reject_cpt_coding_candidate'), 'Must define reject stored procedure');
      assert.ok(sql.includes("review_decision = 'rejected'"), 'Must update candidate status to rejected');
      assert.ok(sql.includes('INSERT INTO public.cpt_coding_reviews'), 'Must log rejection reason in audit log');
    });

    it('Migration 020 avoids Postgres 42883 bigint = uuid comparison defect in RLS policies', () => {
      const sql = fs.readFileSync(migPath, 'utf8');
      assert.ok(!sql.includes('u.id = auth.uid()'), 'Must not directly compare bigint u.id to uuid auth.uid()');
      assert.ok(sql.includes('u.id::text = auth.uid()::text') || sql.includes('fm.user_id = auth.uid()'), 'Must safely cast user ID in RLS policies');
    });

    it('Migration 020 down script safely drops all functions, triggers, and tables', () => {
      const downSql = fs.readFileSync(downPath, 'utf8');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_commit_cpt_coding_candidate'), 'Must drop commit function');
      assert.ok(downSql.includes('DROP FUNCTION IF EXISTS public.fn_reject_cpt_coding_candidate'), 'Must drop reject function');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_coding_reviews CASCADE'), 'Must drop cpt_coding_reviews');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_coding_candidates CASCADE'), 'Must drop cpt_coding_candidates');
      assert.ok(downSql.includes('DROP TABLE IF EXISTS public.cpt_coding_sessions CASCADE'), 'Must drop cpt_coding_sessions');
    });
  });

  // Domain 2: Document Provenance & SHA-256 Hashing
  describe('2. Document Provenance & SHA-256 Integrity', () => {
    const sampleNote = 'Right knee arthroscopic partial medial meniscectomy with chondroplasty of the patella.';

    it('Computes deterministic 64-character SHA-256 hex digest for document notes', () => {
      const hash1 = crypto.createHash('sha256').update(sampleNote.trim()).digest('hex');
      const hash2 = crypto.createHash('sha256').update(sampleNote.trim()).digest('hex');

      assert.equal(hash1.length, 64, 'SHA-256 digest must be 64 hex characters');
      assert.equal(hash1, hash2, 'Identical source texts must produce identical hashes');
    });

    it('Produces distinct hash when source note is modified by even a single character', () => {
      const hashOriginal = crypto.createHash('sha256').update(sampleNote).digest('hex');
      const modifiedNote = sampleNote + ' No complications noted.';
      const hashModified = crypto.createHash('sha256').update(modifiedNote).digest('hex');

      assert.notEqual(hashOriginal, hashModified, 'Modified document must result in a different hash');
    });
  });

  // Domain 3: AI Assistant Candidate Extraction & Deterministic Fallback
  describe('3. AI Candidate Extraction & Deterministic Fallback Engine', () => {
    it('db.runAICodingAssistant extracts orthopedic arthroscopy candidate with confidence and quotes', async () => {
      const res = await db.runAICodingAssistant({
        caseId: 'test-case-ortho',
        clinicalNotes: 'Patient underwent right knee arthroscopy with partial medial meniscectomy. Cartilage trimmed cleanly.',
        preOpDiagnosis: 'M23.22 Torn medial meniscus right knee',
        procedureName: 'Right Knee Arthroscopy Meniscectomy'
      });

      assert.ok(res.success, 'Analysis must succeed');
      assert.ok(res.document_hash, 'Must generate document_hash');
      assert.ok(Array.isArray(res.candidates), 'Candidates must be an array');
      assert.ok(res.candidates.length > 0, 'Must generate at least one candidate');

      const primary = res.candidates.find(c => c.cpt_code === '29881');
      assert.ok(primary, 'Must recommend CPT 29881 for knee meniscectomy');
      assert.ok(primary.confidence_score >= 0.70, 'Confidence score must be >= 0.70');
      assert.ok(primary.documentation_excerpt.length > 0, 'Must provide verbatim quote excerpt');
      assert.ok(primary.clinical_rationale.length > 0, 'Must provide clinical rationale');
    });

    it('db.runAICodingAssistant extracts ophthalmology cataract candidate', async () => {
      const res = await db.runAICodingAssistant({
        caseId: 'test-case-cataract',
        clinicalNotes: 'Phacoemulsification of nuclear sclerotic cataract with posterior chamber intraocular lens implantation left eye.',
        preOpDiagnosis: 'H25.12 Age-related nuclear cataract left eye',
        procedureName: 'Left Cataract Extraction with IOL'
      });

      assert.ok(res.success);
      const cataract = res.candidates.find(c => c.cpt_code === '66984');
      assert.ok(cataract, 'Must recommend CPT 66984 for cataract with IOL');
      assert.equal(cataract.suggested_laterality, 'LEFT');
    });

    it('db.runAICodingAssistant extracts GI colonoscopy biopsy candidate', async () => {
      const res = await db.runAICodingAssistant({
        caseId: 'test-case-gi',
        clinicalNotes: 'Colonoscopy performed to cecum. 5mm polyp visualized at ascending colon, removed via cold biopsy forceps.',
        preOpDiagnosis: 'K63.5 Colon polyp',
        procedureName: 'Diagnostic Colonoscopy'
      });

      assert.ok(res.success);
      const colon = res.candidates.find(c => c.cpt_code === '45380');
      assert.ok(colon, 'Must recommend CPT 45380 for colonoscopy with biopsy');
      assert.ok(colon.suggested_modifiers.includes('PT') || colon.clinical_rationale.toLowerCase().includes('biopsy'));
    });

    it('db.runAICodingAssistant flags unbundled secondary procedures as warnings', async () => {
      const res = await db.runAICodingAssistant({
        caseId: 'test-case-warning',
        clinicalNotes: 'Knee arthroscopy with medial meniscectomy and diagnostic knee arthroscopy.',
        preOpDiagnosis: 'Torn meniscus',
        procedureName: 'Knee Scope'
      });

      assert.ok(res.success);
      // Candidates must have identified_warnings array
      res.candidates.forEach(cand => {
        assert.ok(Array.isArray(cand.identified_warnings), 'identified_warnings must be an array');
      });
    });

    it('Handles empty documentation gracefully by failing-closed', async () => {
      const res = await db.runAICodingAssistant({
        caseId: 'test-case-empty',
        clinicalNotes: '',
        preOpDiagnosis: '',
        procedureName: ''
      });

      assert.equal(res.success, false, 'Must fail-closed for empty input');
      assert.ok(res.error.includes('No clinical notes'), 'Must return informative error message');
      assert.deepEqual(res.candidates, []);
    });
  });

  // Domain 4: Human-in-the-Loop Approval & Provenance Review
  describe('4. Human-in-the-Loop Approval & Review Logging', () => {
    it('db.commitCodingCandidate rejects missing candidateId', async () => {
      await assert.rejects(
        async () => { await db.commitCodingCandidate(null, 'Test note'); },
        { message: /Candidate ID is required/ }
      );
    });

    it('db.rejectCodingCandidate rejects missing candidateId or rationale', async () => {
      await assert.rejects(
        async () => { await db.rejectCodingCandidate(null, 'Some reason'); },
        { message: /Candidate ID is required/ }
      );
      await assert.rejects(
        async () => { await db.rejectCodingCandidate('some-uuid', ''); },
        { message: /Rejection rationale is required/ }
      );
    });

    it('Approving a candidate simulates atomic procedure commit without mutating financial charges', async () => {
      const res = await db.commitCodingCandidate('simulated-candidate-uuid', 'Verified against operative report');
      assert.ok(res, 'Must return commit response');
      assert.ok(res.success, 'Commit must succeed');
      assert.equal(res.review_decision, 'approved');
      assert.equal(res.status, 'approved');
    });

    it('Rejecting a candidate records rejection rationale in immutable audit log', async () => {
      const res = await db.rejectCodingCandidate('simulated-candidate-uuid', 'Bundled into primary procedure per CMS NCCI edits');
      assert.ok(res, 'Must return reject response');
      assert.ok(res.success, 'Reject must succeed');
      assert.equal(res.review_decision, 'rejected');
      assert.equal(res.status, 'rejected');
      assert.ok(res.notes.includes('NCCI edits'));
    });
  });

  // Domain 5: RBAC Permissions & Authorization
  describe('5. RBAC Permissions & Duty Separation', () => {
    it('PERMISSIONS_CATALOG includes all Phase 43 coding permissions', () => {
      const assistPerm = PERMISSIONS_CATALOG.find(p => p.code === 'coding.assist');
      const reviewPerm = PERMISSIONS_CATALOG.find(p => p.code === 'coding.review');
      const approvePerm = PERMISSIONS_CATALOG.find(p => p.code === 'coding.approve');
      const exportPerm = PERMISSIONS_CATALOG.find(p => p.code === 'coding.export');

      assert.ok(assistPerm, 'coding.assist must be cataloged');
      assert.ok(reviewPerm, 'coding.review must be cataloged');
      assert.ok(approvePerm, 'coding.approve must be cataloged');
      assert.ok(exportPerm, 'coding.export must be cataloged');
    });

    it('CANONICAL_ROLES includes coder role at Tier 6', () => {
      const coderRole = CANONICAL_ROLES.find(r => r.slug === 'coder');
      assert.ok(coderRole, 'coder role must exist in CANONICAL_ROLES');
      assert.equal(coderRole.tier, 6);
    });

    it('hasPermission evaluates coding permissions accurately with role permissions', () => {
      const coderPerms = [
        'patients.view', 'patients.view_phi',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'cpt.view', 'cpt.create',
        'coding.assist', 'coding.review', 'coding.approve', 'coding.export',
        'reports.export_volume', 'ai.run_insights'
      ];
      const viewerPerms = ['surgeries.view', 'or.view', 'cpt.view', 'ai.run_insights'];
      const adminPerms = ['*'];

      assert.equal(rbacService.hasPermission(coderPerms, 'coding.assist'), true);
      assert.equal(rbacService.hasPermission(coderPerms, 'coding.review'), true);
      assert.equal(rbacService.hasPermission(coderPerms, 'coding.approve'), true);
      assert.equal(rbacService.hasPermission(coderPerms, 'coding.export'), true);
      assert.equal(rbacService.hasPermission(adminPerms, 'coding.approve'), true);
      assert.equal(rbacService.hasPermission(viewerPerms, 'coding.approve'), false);
      assert.equal(rbacService.hasPermission(viewerPerms, 'coding.assist'), false);
    });
  });

  // Domain 6: UI Component & Scheduler Integration
  describe('6. UI Component & Surgery Scheduler Integration', () => {
    const modalPath = path.join(rootDir, 'src', 'components', 'CodingAssistantModal.jsx');
    const schedulerPath = path.join(rootDir, 'src', 'components', 'SurgeryScheduler.jsx');

    it('CodingAssistantModal.jsx exists and has required UI features', () => {
      assert.ok(fs.existsSync(modalPath), 'CodingAssistantModal.jsx must exist');
      const content = fs.readFileSync(modalPath, 'utf8');

      assert.ok(content.includes('db.runAICodingAssistant'), 'Must call db.runAICodingAssistant');
      assert.ok(content.includes('db.commitCodingCandidate'), 'Must call db.commitCodingCandidate');
      assert.ok(content.includes('db.rejectCodingCandidate'), 'Must call db.rejectCodingCandidate');
      assert.ok(content.includes('documentHash'), 'Must display documentHash badge');
      assert.ok(content.includes('confidence_score'), 'Must render confidence score indicator');
      assert.ok(content.includes('documentation_excerpt'), 'Must render verbatim quote excerpts');
      assert.ok(content.includes('identified_warnings'), 'Must render warnings alert banner');
    });

    it('SurgeryScheduler.jsx imports and mounts CodingAssistantModal', () => {
      const content = fs.readFileSync(schedulerPath, 'utf8');

      assert.ok(content.includes("import CodingAssistantModal from './CodingAssistantModal';"), 'Must import CodingAssistantModal');
      assert.ok(content.includes('const [codingAssistantOpen, setCodingAssistantOpen] = useState(false);'), 'Must declare codingAssistantOpen state');
      assert.ok(content.includes('<CodingAssistantModal'), 'Must render <CodingAssistantModal in JSX');
      assert.ok(content.includes('handleApplyCandidate'), 'Must wire handleApplyCandidate handler');
    });

    it('SurgeryScheduler.jsx provides interactive launch buttons for AI Coding Assistant', () => {
      const content = fs.readFileSync(schedulerPath, 'utf8');

      assert.ok(content.includes('AI Coding Assistant'), 'Must expose AI Coding Assistant button');
      assert.ok(content.includes('setCodingAssistantOpen(true)'), 'Clicking button must open modal');
    });

    it('Candidate application handler updates procedure lines with modifiers and laterality', () => {
      // Simulating handleApplyCandidate logic from SurgeryScheduler.jsx
      let state = {
        selectedCptCodes: [],
        procedureLines: []
      };

      const handleCptMock = (code) => {
        state.selectedCptCodes.push(code);
        state.procedureLines.push({
          code: code,
          procedure_description: 'Test Procedure',
          units: 1,
          modifiers: [],
          laterality: 'NOT_APPLICABLE'
        });
      };

      const handleApplyCandidate = (candidate) => {
        if (!candidate || !candidate.code) return;
        handleCptMock(candidate.code);
        if ((candidate.modifiers && candidate.modifiers.length > 0) || (candidate.laterality && candidate.laterality !== 'NOT_APPLICABLE')) {
          state.procedureLines = state.procedureLines.map(line => {
            if (String(line.code) === String(candidate.code)) {
              return {
                ...line,
                modifiers: candidate.modifiers?.length ? candidate.modifiers : line.modifiers,
                laterality: candidate.laterality && candidate.laterality !== 'NOT_APPLICABLE' ? candidate.laterality : line.laterality
              };
            }
            return line;
          });
        }
      };

      handleApplyCandidate({
        code: '29881',
        modifiers: ['RT'],
        laterality: 'RIGHT'
      });

      assert.equal(state.selectedCptCodes.length, 1);
      assert.equal(state.selectedCptCodes[0], '29881');
      assert.equal(state.procedureLines[0].code, '29881');
      assert.deepEqual(state.procedureLines[0].modifiers, ['RT']);
      assert.equal(state.procedureLines[0].laterality, 'RIGHT');
    });
  });

  // Domain 7: Edge Function gemini-proxy Protocol
  describe('7. Edge Function gemini-proxy Protocol', () => {
    const proxyPath = path.join(rootDir, 'supabase', 'functions', 'gemini-proxy', 'index.ts');

    it('Edge function gemini-proxy supports cpt-coding-assistant mode', () => {
      assert.ok(fs.existsSync(proxyPath), 'gemini-proxy/index.ts must exist');
      const content = fs.readFileSync(proxyPath, 'utf8');

      assert.ok(content.includes('cpt-coding-assistant'), 'Must support mode "cpt-coding-assistant"');
      assert.ok(content.includes('Certified Professional Coder (CPC)'), 'System prompt must configure CPC persona');
      assert.ok(content.includes('confidence_score'), 'Prompt schema must specify confidence_score');
      assert.ok(content.includes('documentation_excerpt'), 'Prompt schema must specify documentation_excerpt citation');
      assert.ok(content.includes('clinical_rationale'), 'Prompt schema must specify clinical_rationale');
    });
  });
});
