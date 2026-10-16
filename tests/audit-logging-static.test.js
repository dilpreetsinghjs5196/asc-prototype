import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 24 — Audit Logging & Provenance Static Verification', async (t) => {
  const migration004Path = path.join(rootDir, 'supabase/migrations/004_audit_logging_hardening.sql');
  const migration004DownPath = path.join(rootDir, 'supabase/migrations/004_audit_logging_hardening_down.sql');
  const supabaseJsPath = path.join(rootDir, 'src/lib/supabase.js');
  const auditViewerPath = path.join(rootDir, 'src/components/AuditLogViewer.jsx');
  const appPath = path.join(rootDir, 'src/App.jsx');
  const multiAgentPath = path.join(rootDir, 'src/components/MultiAgentConsole.jsx');
  const managementCssPath = path.join(rootDir, 'src/components/Management.css');

  const migration004Src = fs.readFileSync(migration004Path, 'utf8');
  const migration004DownSrc = fs.readFileSync(migration004DownPath, 'utf8');
  const supabaseJsSrc = fs.readFileSync(supabaseJsPath, 'utf8');
  const auditViewerSrc = fs.readFileSync(auditViewerPath, 'utf8');
  const appSrc = fs.readFileSync(appPath, 'utf8');
  const multiAgentSrc = fs.readFileSync(multiAgentPath, 'utf8');
  const managementCssSrc = fs.readFileSync(managementCssPath, 'utf8');

  await t.test('1. Migration 004 defines forward-only schema extensions and indexes', () => {
    assert.ok(migration004Src.includes('ADD COLUMN IF NOT EXISTS source TEXT'), 'Must add source column with default');
    assert.ok(migration004Src.includes('ADD COLUMN IF NOT EXISTS correlation_id TEXT'), 'Must add correlation_id column');
    assert.ok(migration004Src.includes('ADD COLUMN IF NOT EXISTS changed_fields JSONB'), 'Must add changed_fields column');
    assert.ok(migration004Src.includes('ADD COLUMN IF NOT EXISTS metadata JSONB'), 'Must add metadata column');
    assert.ok(migration004Src.includes('idx_audit_logs_source'), 'Must create index on source');
    assert.ok(migration004Src.includes('idx_audit_logs_correlation'), 'Must create index on correlation_id');
    assert.ok(migration004Src.includes('idx_audit_logs_facility_action'), 'Must create composite index on facility, action, time');
  });

  await t.test('2. Dynamic constraint dropping protects existing database schemas', () => {
    assert.ok(migration004Src.includes('FROM pg_constraint'), 'Must inspect pg_constraint system catalog');
    assert.ok(migration004Src.includes("pg_get_constraintdef(oid) LIKE '%action%'"), 'Must dynamically match existing action check');
    assert.ok(migration004Src.includes("pg_get_constraintdef(oid) LIKE '%source%'"), 'Must dynamically match existing source check');
    assert.ok(
      migration004Src.includes("'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'EXPORT', 'FREEZE', 'LOGIN', 'LOGOUT', 'OVERRIDE', 'VIEW_PHI', 'AI_ANALYSIS'"),
      'Action CHECK constraint must support safe superset including LOGIN, EXPORT, VIEW_PHI, and AI_ANALYSIS'
    );
    assert.ok(
      migration004Src.includes("'UI', 'API', 'AI_AGENT', 'BACKGROUND_JOB', 'SYSTEM', 'IMPORT'"),
      'Source CHECK constraint must support all canonical origins'
    );
  });

  await t.test('3. Recursive JSONB sanitizer function (fn_sanitize_audit_jsonb) implementation', () => {
    assert.ok(migration004Src.includes('CREATE OR REPLACE FUNCTION public.fn_sanitize_audit_jsonb'), 'Must define fn_sanitize_audit_jsonb');
    assert.ok(migration004Src.includes('c_sensitive_pattern CONSTANT TEXT'), 'Must define regex pattern for sensitive keys');
    assert.ok(migration004Src.includes('password|passwd|token|secret|api_key|access_token|refresh_token|ssn'), 'Must scrub passwords and credentials');
    assert.ok(migration004Src.includes('bank_account|routing_number|credit_card|cvv'), 'Must scrub financial identifiers');
    assert.ok(migration004Src.includes('jsonb_typeof(p_data) = \'object\''), 'Must handle JSONB objects');
    assert.ok(migration004Src.includes('jsonb_typeof(p_data) = \'array\''), 'Must handle JSONB arrays recursively');
    assert.ok(migration004Src.includes('"[REDACTED]"'), 'Must replace sensitive matches with [REDACTED]');
    assert.ok(migration004Src.includes('REVOKE ALL ON FUNCTION public.fn_sanitize_audit_jsonb(JSONB) FROM PUBLIC, anon'), 'Must revoke execute from anon');
  });

  await t.test('4. Hardened fn_audit_log_trigger enforces sanitization and state diffs', () => {
    assert.ok(migration004Src.includes('SET search_path = pg_catalog, public, auth'), 'Must configure secure trusted search_path');
    assert.ok(migration004Src.includes('public.fn_sanitize_audit_jsonb(to_jsonb(OLD))'), 'Must sanitize OLD state');
    assert.ok(migration004Src.includes('public.fn_sanitize_audit_jsonb(to_jsonb(NEW))'), 'Must sanitize NEW state');
    assert.ok(migration004Src.includes('v_old_json IS DISTINCT FROM v_new_json'), 'Must suppress no-op updates');
    assert.ok(migration004Src.includes('v_diff || jsonb_build_object'), 'Must compute changed_fields JSONB diff');
    assert.ok(migration004Src.includes('RAISE WARNING \'fn_audit_log_trigger exception on %: %\''), 'Must maintain non-blocking clinical fail-safe');
  });

  await t.test('5. Hardened fn_log_manual_audit_event requires auth, checks tenancy & restricts actions', () => {
    assert.ok(migration004Src.includes('CREATE OR REPLACE FUNCTION public.fn_log_manual_audit_event'), 'Must define fn_log_manual_audit_event');
    assert.ok(migration004Src.includes('IF v_actor_id IS NULL THEN'), 'Must check auth.uid() is not null');
    assert.ok(migration004Src.includes('public.facility_memberships'), 'Must verify user belongs to requested facility');
    assert.ok(migration004Src.includes("p_action NOT IN ('LOGIN', 'LOGOUT', 'EXPORT', 'VIEW_PHI', 'OVERRIDE', 'AI_ANALYSIS')"), 'Must reject unauthorized manual action types');
    assert.ok(migration004Src.includes("p_source NOT IN ('UI', 'AI_AGENT')"), 'Must restrict manual sources to UI or AI_AGENT');
    assert.ok(migration004Src.includes("p_source = 'AI_AGENT'"), 'Must verify AI execution permissions when source is AI_AGENT');
    assert.ok(migration004Src.includes('REVOKE ALL ON FUNCTION public.fn_log_manual_audit_event FROM PUBLIC, anon'), 'Must revoke execute from anon and PUBLIC');
    assert.ok(migration004Src.includes('GRANT EXECUTE ON FUNCTION public.fn_log_manual_audit_event TO authenticated'), 'Must grant execute to authenticated');
  });

  await t.test('6. Dual-resolution RLS policy guarantees tenant isolation & includes CFO/Biller', () => {
    assert.ok(migration004Src.includes('CREATE POLICY "Authorized Roles Can View Audit Logs"'), 'Must define Authorized Roles Can View Audit Logs policy');
    assert.ok(migration004Src.includes('facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())'), 'Must enforce facility tenancy');
    assert.ok(migration004Src.includes("public.has_permission(facility_id, 'audit.view_clinical')"), 'Must evaluate audit.view_clinical permission');
    assert.ok(migration004Src.includes("public.has_permission(facility_id, 'audit.view_financial')"), 'Must evaluate audit.view_financial permission');
    assert.ok(migration004Src.includes("ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'cfo', 'biller']"), 'Must support canonical role fallback');
    assert.ok(migration004Src.includes('facility_id IS NULL') && migration004Src.includes("public.user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin'])"), 'Must restrict null-facility org events to enterprise admins');
    assert.ok(migration004Src.includes('REVOKE ALL ON public.audit_logs FROM anon'), 'Must revoke all on audit_logs from anon');
    assert.ok(migration004Src.includes('GRANT SELECT ON public.audit_logs TO authenticated'), 'Must grant only SELECT to authenticated');
  });

  await t.test('7. Immutability statement-level trigger blocks deletion and cascading purges', () => {
    assert.ok(migration004Src.includes('CREATE OR REPLACE FUNCTION public.fn_prevent_audit_log_mutation()'), 'Must define immutability trigger function');
    assert.ok(migration004Src.includes('Security Invariant Violation: public.audit_logs is an append-only ledger'), 'Must raise exception on any mutation attempt');
    assert.ok(migration004Src.includes('BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_logs'), 'Must bind trigger BEFORE UPDATE OR DELETE OR TRUNCATE');
    assert.ok(migration004Src.includes('trg_protect_audit_logs_immutability'), 'Must name immutability trigger');
  });

  await t.test('8. Reversible down migration safely reverts without data loss', () => {
    assert.ok(migration004DownSrc.includes('DROP TRIGGER IF EXISTS trg_protect_audit_logs_immutability'), 'Down migration must drop immutability trigger');
    assert.ok(migration004DownSrc.includes('DROP FUNCTION IF EXISTS public.fn_log_manual_audit_event'), 'Down migration must drop manual event RPC');
    assert.ok(migration004DownSrc.includes('DROP FUNCTION IF EXISTS public.fn_sanitize_audit_jsonb'), 'Down migration must drop sanitizer');
  });

  await t.test('9. Client services (src/lib/supabase.js) support filtered pagination and secure RPC dispatch', () => {
    assert.ok(supabaseJsSrc.includes('getAuditLogs(facilityId, options = {})'), 'getAuditLogs must accept options object');
    assert.ok(supabaseJsSrc.includes("options.tableName"), 'getAuditLogs must filter by tableName');
    assert.ok(supabaseJsSrc.includes("options.action"), 'getAuditLogs must filter by action');
    assert.ok(supabaseJsSrc.includes("options.source"), 'getAuditLogs must filter by source');
    assert.ok(supabaseJsSrc.includes("options.startDate"), 'getAuditLogs must filter by startDate');
    assert.ok(supabaseJsSrc.includes("options.search"), 'getAuditLogs must filter by search term');
    assert.ok(supabaseJsSrc.includes("supabase.rpc('fn_log_manual_audit_event'"), 'logAuditEvent must dispatch via fn_log_manual_audit_event RPC');
  });

  await t.test('10. AuditLogViewer.jsx component provides filters, state diff inspector and CSV export', () => {
    assert.ok(auditViewerSrc.includes('export default function AuditLogViewer'), 'Must export default AuditLogViewer component');
    assert.ok(auditViewerSrc.includes('db.getAuditLogs'), 'AuditLogViewer must query db.getAuditLogs');
    assert.ok(auditViewerSrc.includes('handleExportCSV'), 'AuditLogViewer must implement handleExportCSV');
    assert.ok(auditViewerSrc.includes('selectedLog.changed_fields'), 'AuditLogViewer must render changed_fields diff');
    assert.ok(auditViewerSrc.includes('audit-modal-backdrop'), 'AuditLogViewer must render modal for diff inspection');
  });

  await t.test('11. App.jsx wires AuditLogViewer under RoleGate in Administration section', () => {
    assert.ok(appSrc.includes('import AuditLogViewer from \'./components/AuditLogViewer\''), 'App.jsx must import AuditLogViewer');
    assert.ok(appSrc.includes('activeTab === \'audit_logs\''), 'App.jsx must handle audit_logs activeTab');
    assert.ok(appSrc.includes('<AuditLogViewer'), 'App.jsx must render AuditLogViewer component');
    assert.ok(appSrc.includes('requiredPermission="audit.view_clinical"'), 'App.jsx must gate audit_logs with audit.view_clinical');
    assert.ok(appSrc.includes('Compliance Audit Trail & Provenance'), 'App.jsx must display header title for audit_logs');
  });

  await t.test('12. MultiAgentConsole.jsx stamps AI provenance attribution on case schedule', () => {
    assert.ok(multiAgentSrc.includes("source: 'AI_AGENT'"), 'MultiAgentConsole must stamp source: AI_AGENT');
    assert.ok(multiAgentSrc.includes("correlation_id: 'REQ-SIM-990'"), 'MultiAgentConsole must stamp correlation ID');
    assert.ok(multiAgentSrc.includes("action: 'AI_ANALYSIS'"), 'MultiAgentConsole must log AI_ANALYSIS audit event');
  });

  await t.test('13. Management.css includes responsive styling for AuditLogViewer and Diff Modal', () => {
    assert.ok(managementCssSrc.includes('.audit-viewer-container'), 'CSS must style audit-viewer-container');
    assert.ok(managementCssSrc.includes('.audit-diff-table'), 'CSS must style audit-diff-table');
    assert.ok(managementCssSrc.includes('.badge-ai'), 'CSS must style badge-ai');
    assert.ok(managementCssSrc.includes('.badge-insert'), 'CSS must style badge-insert');
  });
});
