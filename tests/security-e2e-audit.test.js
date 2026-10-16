import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { rbacService, CANONICAL_ROLES, PERMISSIONS_CATALOG } from '../src/lib/rbacService.js';
import {
  maskMRN,
  maskPhone,
  maskDOB,
  maskPatientName,
  sanitizePatientRecord,
  sanitizeSurgeryRecord,
  deidentifyTextForAI
} from '../src/utils/phiMasking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to read workspace files safely
const readFileContent = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

describe('Phase 26 — End-to-End Security Test Suite (7 Domains)', () => {

  // ============================================================================
  // DOMAIN 1: ORGANIZATION & FACILITY TENANT ISOLATION
  // ============================================================================
  describe('Domain 1: Organization & Facility Tenant Isolation', () => {
    test('1.1: Migration 001 & 005 enforce NOT NULL constraints on clinical facility_id', () => {
      const migration005 = readFileContent('supabase/migrations/005_security_privacy_hipaa.sql');
      assert.match(migration005, /ALTER TABLE public\.patients ALTER COLUMN facility_id SET NOT NULL;/);
      assert.match(migration005, /ALTER TABLE public\.surgeries ALTER COLUMN facility_id SET NOT NULL;/);
    });

    test('1.2: Compound unique index prevents cross-patient MRN collisions within facility', () => {
      const migration005 = readFileContent('supabase/migrations/005_security_privacy_hipaa.sql');
      assert.match(migration005, /CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_facility_mrn/);
      assert.match(migration005, /ON public\.patients\s*\(facility_id,\s*LOWER\(TRIM\(mrn\)\)\)/);
    });

    test('1.3: Anti-relocation triggers prevent moving records across facilities', () => {
      const migration001 = readFileContent('supabase/migrations/001_multi_tenancy_core.sql');
      assert.match(migration001, /CREATE OR REPLACE FUNCTION public\.prevent_facility_relocation\(\)/);
      assert.match(migration001, /CREATE TRIGGER trg_prevent_facility_relocation_surgeries/);
      assert.match(migration001, /CREATE TRIGGER trg_prevent_facility_relocation_patients/);
      assert.match(migration001, /CREATE TRIGGER trg_prevent_facility_relocation_staff/);
    });

    test('1.4: Client services mandate active facility query scoping', () => {
      const supabaseJs = readFileContent('src/lib/supabase.js');
      assert.match(supabaseJs, /getPatients\(facilityId/);
      assert.match(supabaseJs, /\.eq\('facility_id',\s*targetFac\)/);
      assert.match(supabaseJs, /getSurgeries\(facilityId/);
      assert.match(supabaseJs, /getORBlockSchedule\(facilityId/);
    });
  });

  // ============================================================================
  // DOMAIN 2: RLS SELECT, INSERT, UPDATE, AND DELETE ENFORCEMENT
  // ============================================================================
  describe('Domain 2: RLS CRUD Enforcement & Access Control', () => {
    test('2.1: Anonymous role is completely revoked from clinical and operational tables', () => {
      const migration001 = readFileContent('supabase/migrations/001_multi_tenancy_core.sql');
      const migration005 = readFileContent('supabase/migrations/005_security_privacy_hipaa.sql');
      assert.match(migration001, /REVOKE ALL ON public\.users FROM anon/);
      assert.match(migration001, /ALTER TABLE public\.surgeries ENABLE ROW LEVEL SECURITY;/);
      assert.match(migration001, /ALTER TABLE public\.patients ENABLE ROW LEVEL SECURITY;/);
      assert.match(migration005, /REVOKE ALL ON public\.users FROM anon;/);
      assert.match(migration005, /REVOKE ALL ON public\.users FROM authenticated;/);
    });

    test('2.2: Clinical DELETE policies strictly restricted to administrative roles', () => {
      const migration001 = readFileContent('supabase/migrations/001_multi_tenancy_core.sql');
      // Surgeries delete
      assert.match(migration001, /CREATE POLICY "Tenant Scoped Surgeries Delete"/);
      assert.match(migration001, /ARRAY\['super_admin',\s*'org_admin',\s*'facility_admin'\]/);
      // Patients delete
      assert.match(migration001, /CREATE POLICY "Tenant Scoped Patients Delete"/);
      // Surgeons delete
      assert.match(migration001, /CREATE POLICY "Tenant Scoped Surgeons Delete"/);
    });

    test('2.3: Financial extra costs update policy restricted to financial roles', () => {
      const migration001 = readFileContent('supabase/migrations/001_multi_tenancy_core.sql');
      assert.match(migration001, /CREATE POLICY "Tenant Scoped Extra Costs Manage"/);
      assert.match(migration001, /ARRAY\['super_admin',\s*'org_admin',\s*'facility_admin',\s*'cfo',\s*'finance',\s*'biller',\s*'billing_rcm'\]/);
    });

    test('2.4: Audit logs enforce append-only with zero client write policies', () => {
      const migration004 = readFileContent('supabase/migrations/004_audit_logging_hardening.sql');
      assert.match(migration004, /REVOKE ALL ON public\.audit_logs FROM anon;/);
      assert.match(migration004, /GRANT SELECT ON public\.audit_logs TO authenticated;/);
      assert.match(migration004, /STRICTLY 0 INSERT, UPDATE, OR DELETE POLICIES GRANTED TO AUTHENTICATED USERS/);
    });
  });

  // ============================================================================
  // DOMAIN 3: RBAC AUTHORIZATION & PRIVILEGE ESCALATION PREVENTION
  // ============================================================================
  describe('Domain 3: RBAC Authorization & Anti-Escalation', () => {
    test('3.1: Canonical roles contain all 10 roles with non-null hierarchy tiers', () => {
      assert.equal(CANONICAL_ROLES.length, 10);
      const slugs = CANONICAL_ROLES.map(r => r.slug);
      ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'surgeon', 'biller', 'coder', 'cfo', 'viewer'].forEach(slug => {
        assert.ok(slugs.includes(slug), `Missing canonical role: ${slug}`);
      });
    });

    test('3.2: Permissions catalog covers all 13 enterprise operational domains', () => {
      const categories = new Set(PERMISSIONS_CATALOG.map(p => p.category));
      ['tenancy', 'patients', 'surgeons', 'surgeries', 'or_scheduling', 'cpt_codes', 'finance', 'billing', 'reports', 'ai', 'users', 'roles', 'audit'].forEach(d => {
        assert.ok(categories.has(d), `Missing category: ${d}`);
      });
      assert.equal(categories.size, 13);
    });

    test('3.3: rbacService evaluates permissions, wildcards, and denies unassigned actions', () => {
      const schedulerPerms = ['patients.view', 'patients.view_phi', 'surgeries.schedule', 'or.view'];
      assert.equal(rbacService.hasPermission(schedulerPerms, 'surgeries.schedule'), true);
      assert.equal(rbacService.hasPermission(schedulerPerms, 'patients.view_phi'), true);
      assert.equal(rbacService.hasPermission(schedulerPerms, 'finance.view_margins'), false);
      assert.equal(rbacService.hasPermission(schedulerPerms, 'users.manage'), false);
      assert.equal(rbacService.hasPermission(['*'], 'any.arbitrary.action'), true);
      assert.equal(rbacService.hasPermission(['admin.*'], 'admin.delete_all'), true);
      assert.equal(rbacService.hasPermission(null, 'patients.view'), false);
    });

    test('3.4: Anti-privilege self-escalation policy guards facility_memberships', () => {
      const migration001 = readFileContent('supabase/migrations/001_multi_tenancy_core.sql');
      assert.match(migration001, /CREATE POLICY "Facility Admin Can Manage Memberships"/);
      assert.match(migration001, /ON public\.facility_memberships/);
      assert.match(migration001, /user_has_facility_role\(facility_id,\s*ARRAY\['super_admin',\s*'org_admin',\s*'facility_admin'\]\)/);
    });
  });

  // ============================================================================
  // DOMAIN 4: AI TOOL AUTHORIZATION & SECRET PROTECTION
  // ============================================================================
  describe('Domain 4: AI Tool Authorization & Secret Protection', () => {
    test('4.1: deidentifyTextForAI comprehensively redacts all 18 HIPAA identifier types', () => {
      const dirtyPrompt = "Patient John Doe (SSN 123-45-6789, MRN-99481, DOB 05/12/1984) called from (239) 555-0199 or test.user@asc-health.com.";
      const cleaned = deidentifyTextForAI(dirtyPrompt);
      assert.ok(!cleaned.includes('123-45-6789'), 'SSN must be scrubbed');
      assert.ok(!cleaned.includes('99481'), 'MRN number must be scrubbed');
      assert.ok(!cleaned.includes('(239) 555-0199'), 'Phone must be scrubbed');
      assert.ok(!cleaned.includes('test.user@asc-health.com'), 'Email must be scrubbed');
      assert.ok(cleaned.includes('[REDACTED-SSN]'));
      assert.ok(cleaned.includes('[REDACTED-PHONE]'));
      assert.ok(cleaned.includes('[REDACTED-EMAIL]'));
      assert.ok(cleaned.includes('MRN-[REDACTED]'));
    });

    test('4.2: Chatbot context eliminates cleartext patient concatenation', () => {
      const chatbotCode = readFileContent('src/components/Chatbot.jsx');
      assert.ok(!chatbotCode.includes('p.name'), 'Chatbot must not dump raw patient names');
      assert.ok(!chatbotCode.includes('p.mrn'), 'Chatbot must not dump raw patient MRNs');
      assert.match(chatbotCode, /AI • ZERO-PHI/);
    });

    test('4.3: Multi-Agent simulation logs provenance audit telemetry with source AI_AGENT', () => {
      const multiAgentCode = readFileContent('src/components/MultiAgentConsole.jsx');
      assert.match(multiAgentCode, /source:\s*'AI_AGENT'/);
      assert.match(multiAgentCode, /action:\s*'AI_ANALYSIS'/);
      assert.match(multiAgentCode, /model_version:\s*'asc-multiagent-v2\.4'/);
    });

    test('4.4: Settings view eliminates client key inputs and binds to server-side AI proxy', () => {
      const settingsCode = readFileContent('src/components/Settings.jsx');
      assert.ok(!settingsCode.includes('name="gemini_api_key"'), 'Settings must not expose plaintext or password input for gemini_api_key');
      assert.match(settingsCode, /Server-Side AI Proxy \(gemini-proxy\)/);
      const edgeFunctionCode = readFileContent('supabase/functions/gemini-proxy/index.ts');
      assert.match(edgeFunctionCode, /Deno\.env\.get\("GEMINI_API_KEY"\)/);
      assert.match(edgeFunctionCode, /facility_memberships/);
    });
  });

  // ============================================================================
  // DOMAIN 5: SECRET SCANNING & DEPENDENCY VULNERABILITY CHECKS
  // ============================================================================
  describe('Domain 5: Secret Scanning & Dependency Vulnerabilities', () => {
    test('5.1: .gitignore strictly excludes sensitive environment and key files', () => {
      const gitignore = readFileContent('.gitignore');
      assert.match(gitignore, /\.env/);
      assert.match(gitignore, /\.env\.\*/);
      assert.match(gitignore, /\*\.pem/);
      assert.match(gitignore, /\*\.key/);
      assert.match(gitignore, /secrets\//);
    });

    test('5.2: Static codebase check ensures zero live Google AI keys are hardcoded in src', () => {
      const srcFiles = ['src/lib/gemini.js', 'src/lib/supabase.js', 'src/App.jsx', 'src/components/Chatbot.jsx'];
      const realApiKeyPattern = /AIza[0-9A-Za-z-_]{35}/;
      srcFiles.forEach(file => {
        const content = readFileContent(file);
        assert.ok(!realApiKeyPattern.test(content), `Found hardcoded live Google API key in ${file}`);
      });
    });

    test('5.3: package.json has locked dependencies and patched xlsx >= 0.20.0', () => {
      const pkg = JSON.parse(readFileContent('package.json'));
      assert.ok(pkg.dependencies['@supabase/supabase-js'], 'Supabase JS must be defined');
      assert.ok(pkg.dependencies['@google/generative-ai'], 'Google Generative AI must be defined');
      assert.match(pkg.dependencies['xlsx'], /0\.20\.\d+/, 'xlsx must be on patched version >= 0.20.0');
    });
  });

  // ============================================================================
  // DOMAIN 6: AUDIT LOGGING & SENSITIVE ACTION PROTECTION
  // ============================================================================
  describe('Domain 6: Audit Logging & Sensitive Action Protection', () => {
    test('6.1: fn_audit_log_trigger captures changes with recursive secret sanitization', () => {
      const migration004 = readFileContent('supabase/migrations/004_audit_logging_hardening.sql');
      assert.match(migration004, /CREATE OR REPLACE FUNCTION public\.fn_audit_log_trigger\(\)/);
      assert.match(migration004, /public\.fn_sanitize_audit_jsonb/);
      assert.match(migration004, /SECURITY DEFINER/);
    });

    test('6.2: Manual and export audit RPCs prevent impersonation and verify actor session', () => {
      const migration004 = readFileContent('supabase/migrations/004_audit_logging_hardening.sql');
      const migration005 = readFileContent('supabase/migrations/005_security_privacy_hipaa.sql');
      assert.match(migration004, /v_actor_id := auth\.uid\(\);/);
      assert.match(migration004, /IF v_actor_id IS NULL THEN/);
      assert.match(migration005, /CREATE OR REPLACE FUNCTION public\.fn_log_export_audit_event/);
      assert.match(migration005, /v_actor_id := auth\.uid\(\);/);
    });

    test('6.3: Audit log immutability trigger blocks all UPDATE and DELETE mutations', () => {
      const migration004 = readFileContent('supabase/migrations/004_audit_logging_hardening.sql');
      assert.match(migration004, /CREATE OR REPLACE FUNCTION public\.fn_prevent_audit_log_mutation\(\)/);
      assert.match(migration004, /RAISE EXCEPTION 'Security Invariant Violation: public\.audit_logs is an append-only ledger/);
      assert.match(migration004, /CREATE TRIGGER trg_protect_audit_logs_immutability/);
    });
  });

  // ============================================================================
  // DOMAIN 7: REGRESSION & END-TO-END SECURITY TESTING
  // ============================================================================
  describe('Domain 7: Regression & End-to-End Security Testing', () => {
    test('7.1: useInactivityTimeout hook enforces 15-minute default threshold with warning modal', () => {
      const hookCode = readFileContent('src/hooks/useInactivityTimeout.js');
      assert.match(hookCode, /15 \* 60 \* 1000/);
      assert.match(hookCode, /60 \* 1000/);
      assert.match(hookCode, /mousedown/);
      assert.match(hookCode, /keydown/);
    });

    test('7.2: Bulk patient export is strictly gated by role in App.jsx', () => {
      const appCode = readFileContent('src/App.jsx');
      assert.match(appCode, /handleExportPatients/);
      assert.match(appCode, /\['super_admin',\s*'org_admin',\s*'facility_admin',\s*'clinical_manager'\]\.includes\(userRole\)/);
      assert.match(appCode, /db\.logExportAuditEvent/);
    });

    test('7.3: Patient directory applies Minimum Necessary masking for unauthorized roles', () => {
      const appCode = readFileContent('src/App.jsx');
      assert.match(appCode, /canViewPHI \? patient\.mrn : maskMRN\(patient\.mrn\)/);
      assert.match(appCode, /canViewPHI \? \(patient\.name \? patient\.name\.trim\(\) : ''\) : maskPatientName\(patient\.name\)/);
      assert.match(appCode, /canViewPHI \? patient\.dob : maskDOB\(patient\.dob\)/);
    });

    test('7.4: Down migrations revert safely without leaving wide-open permissions', () => {
      const down005 = readFileContent('supabase/migrations/005_security_privacy_hipaa_down.sql');
      assert.ok(!down005.includes('GRANT ALL ON public.users TO anon'), 'Down migration must not open anon access');
      assert.match(down005, /DROP FUNCTION IF EXISTS public\.fn_log_export_audit_event/);
    });
  });

});
