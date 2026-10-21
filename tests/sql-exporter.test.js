import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  AVAILABLE_TABLES, 
  DEFAULT_FACILITY_TABLES, 
  FACILITY_OPERATIONS_TABLES, 
  ALL_EXPORT_TABLES, 
  formatSqlLiteral 
} from '../src/utils/sqlExporter.js';

test('SQL Exporter & Facility Scoping Verification Suite', async (t) => {

  await t.test('1. Default Export Tables: Must default to only facilities and settings', () => {
    assert.deepEqual(
      DEFAULT_FACILITY_TABLES,
      ['facilities', 'settings'],
      'DEFAULT_FACILITY_TABLES must only contain facilities and settings'
    );
    assert.equal(
      DEFAULT_FACILITY_TABLES.includes('patients'),
      false,
      'DEFAULT_FACILITY_TABLES must NEVER include patients'
    );
    assert.equal(
      DEFAULT_FACILITY_TABLES.includes('surgeries'),
      false,
      'DEFAULT_FACILITY_TABLES must NEVER include surgeries'
    );
    assert.equal(
      DEFAULT_FACILITY_TABLES.includes('audit_logs'),
      false,
      'DEFAULT_FACILITY_TABLES must NEVER include audit_logs'
    );
  });

  await t.test('2. Facility Operations Scope: Scopes to operational tables without enterprise administrative tables', () => {
    assert.ok(Array.isArray(FACILITY_OPERATIONS_TABLES), 'FACILITY_OPERATIONS_TABLES must be an array');
    assert.ok(FACILITY_OPERATIONS_TABLES.includes('facilities'), 'Should include facilities');
    assert.ok(FACILITY_OPERATIONS_TABLES.includes('settings'), 'Should include settings');
    assert.ok(FACILITY_OPERATIONS_TABLES.includes('surgeries'), 'Should include surgeries');
    assert.ok(FACILITY_OPERATIONS_TABLES.includes('cpt_codes'), 'Should include cpt_codes');
    assert.equal(
      FACILITY_OPERATIONS_TABLES.includes('organizations'),
      false,
      'Must NOT include cross-tenant organizations'
    );
    assert.equal(
      FACILITY_OPERATIONS_TABLES.includes('roles'),
      false,
      'Must NOT include system security roles'
    );
    assert.equal(
      FACILITY_OPERATIONS_TABLES.includes('permissions'),
      false,
      'Must NOT include system permissions'
    );
  });

  await t.test('3. Table Catalog Metadata: AVAILABLE_TABLES categorizes all platform database tables', () => {
    assert.ok(AVAILABLE_TABLES.length >= 34, 'Must catalog all platform database tables');
    assert.equal(AVAILABLE_TABLES.length, 40, 'Must catalog all 40 system tables across the platform');
    
    const facilitiesEntry = AVAILABLE_TABLES.find(t => t.id === 'facilities');
    assert.ok(facilitiesEntry, 'facilities table must be in catalog');
    assert.equal(facilitiesEntry.defaultChecked, true);
    assert.equal(facilitiesEntry.hasFacilityScope, true);

    const settingsEntry = AVAILABLE_TABLES.find(t => t.id === 'settings');
    assert.ok(settingsEntry, 'settings table must be in catalog');
    assert.equal(settingsEntry.defaultChecked, true);

    const orEntry = AVAILABLE_TABLES.find(t => t.id === 'operating_rooms');
    assert.ok(orEntry, 'operating_rooms table must be in catalog');
    assert.equal(orEntry.hasFacilityScope, true);

    const payersEntry = AVAILABLE_TABLES.find(t => t.id === 'payers');
    assert.ok(payersEntry, 'payers table must be in catalog');

    const agentTasksEntry = AVAILABLE_TABLES.find(t => t.id === 'agent_tasks');
    assert.ok(agentTasksEntry, 'agent_tasks table must be in catalog');

    const patientsEntry = AVAILABLE_TABLES.find(t => t.id === 'patients');
    assert.ok(patientsEntry, 'patients table must be in catalog');
    assert.equal(patientsEntry.defaultChecked, false, 'patients must NOT be checked by default');
    assert.equal(patientsEntry.hasFacilityScope, true);

    const surgeriesEntry = AVAILABLE_TABLES.find(t => t.id === 'surgeries');
    assert.ok(surgeriesEntry, 'surgeries table must be in catalog');
    assert.equal(surgeriesEntry.defaultChecked, false, 'surgeries must NOT be checked by default');
    assert.equal(surgeriesEntry.hasFacilityScope, true);
  });

  await t.test('4. SQL Formatting Utility: Safely formats strings, nulls, booleans, and jsonb', () => {
    assert.equal(formatSqlLiteral(null), 'NULL');
    assert.equal(formatSqlLiteral(undefined), 'NULL');
    assert.equal(formatSqlLiteral(true), 'TRUE');
    assert.equal(formatSqlLiteral(false), 'FALSE');
    assert.equal(formatSqlLiteral(42), '42');
    assert.equal(formatSqlLiteral(NaN), 'NULL');
    assert.equal(formatSqlLiteral("Naples Surgery Center"), "'Naples Surgery Center'");
    assert.equal(formatSqlLiteral("O'Connor & Sons"), "'O''Connor & Sons'");
    assert.equal(
      formatSqlLiteral({ dark: true, color: '#10b981' }),
      '\'{"dark":true,"color":"#10b981"}\'::jsonb'
    );
  });

  await t.test('5. Static Source Audit: Settings.jsx wires 1-click full database SQL export', () => {
    const settingsPath = path.resolve('src/components/Settings.jsx');
    assert.ok(fs.existsSync(settingsPath), 'Settings.jsx must exist');
    const content = fs.readFileSync(settingsPath, 'utf8');

    // Verify imports
    assert.match(content, /exportDatabaseSql/, 'Must import exportDatabaseSql');
    assert.match(content, /ALL_EXPORT_TABLES/, 'Must import ALL_EXPORT_TABLES');

    // Verify export button calls handleExportSql directly without modal
    assert.match(
      content,
      /onClick=\{handleExportSql\}/,
      'Export button must trigger 1-click download directly'
    );

    // Verify exportDatabaseSql receives scope: 'full' and ALL_EXPORT_TABLES
    assert.match(
      content,
      /scope:\s*'full'/,
      'Must pass scope: full to exportDatabaseSql'
    );
    assert.match(
      content,
      /tables:\s*ALL_EXPORT_TABLES/,
      'Must pass tables: ALL_EXPORT_TABLES to exportDatabaseSql'
    );
  });

  await t.test('6. Static Source Audit: sqlExporter.js sanitizes sensitive columns and scopes queries', () => {
    const exporterPath = path.resolve('src/utils/sqlExporter.js');
    assert.ok(fs.existsSync(exporterPath), 'sqlExporter.js must exist');
    const content = fs.readFileSync(exporterPath, 'utf8');

    // Sensitive column sanitization
    assert.match(content, /gemini_api_key/, 'Must sanitize gemini_api_key');
    assert.match(content, /password/, 'Must sanitize password');

    // Facility scoping filters
    assert.match(content, /query\.eq\('id',\s*facilityId\)/, 'facilities must filter by id');
    assert.match(content, /query\.eq\('facility_id',\s*facilityId\)/, 'operational tables must filter by facility_id');
  });

  await t.test('7. Emergency Recovery: Migration 014 exists and sqlExporter supports dynamic introspection', () => {
    const migration014Path = path.resolve('supabase/migrations/014_database_backup_introspection.sql');
    assert.ok(fs.existsSync(migration014Path), 'Migration 014 must exist');
    const migContent = fs.readFileSync(migration014Path, 'utf8');
    assert.match(migContent, /fn_get_public_tables/, 'Must define fn_get_public_tables');

    const exporterPath = path.resolve('src/utils/sqlExporter.js');
    const expContent = fs.readFileSync(exporterPath, 'utf8');
    assert.match(expContent, /fn_get_public_tables/, 'Must call fn_get_public_tables for dynamic discovery');
  });

});
