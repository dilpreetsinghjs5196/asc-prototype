import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadDatabaseBackup,
  escapeSqlValue,
  BACKUP_TABLES,
  TABLE_SCHEMAS
} from '../src/utils/databaseBackup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const settingsFilePath = path.resolve(__dirname, '../src/components/Settings.jsx');
const databaseBackupFilePath = path.resolve(__dirname, '../src/utils/databaseBackup.js');
const appFilePath = path.resolve(__dirname, '../src/App.jsx');

test('Backup Quarantine - downloadDatabaseBackup throws SECURITY_ERROR', async () => {
  await assert.rejects(
    async () => {
      await downloadDatabaseBackup();
    },
    {
      name: 'Error',
      message: /SECURITY_ERROR: Client-side database backups have been quarantined/
    },
    'downloadDatabaseBackup must reject with explicit HIPAA security error'
  );
});

test('Backup Quarantine - escapeSqlValue throws SECURITY_ERROR', () => {
  assert.throws(
    () => {
      escapeSqlValue('test');
    },
    {
      name: 'Error',
      message: /SECURITY_ERROR: escapeSqlValue is disabled/
    },
    'escapeSqlValue must throw explicit security error'
  );
});

test('Backup Quarantine - Schema and Table metadata quarantined', () => {
  assert.deepEqual(BACKUP_TABLES, [], 'BACKUP_TABLES must be an empty array');
  assert.deepEqual(TABLE_SCHEMAS, {}, 'TABLE_SCHEMAS must be an empty object');
  assert.throws(() => {
    BACKUP_TABLES.push('patients');
  }, 'BACKUP_TABLES must be frozen');
});

test('Backup Quarantine - databaseBackup.js has zero network I/O or SQL generators', () => {
  const content = fs.readFileSync(databaseBackupFilePath, 'utf8');

  // Must not import supabase or any client
  assert.doesNotMatch(content, /supabase/i, 'Must not reference supabase');
  assert.doesNotMatch(content, /fetchAllTableRows/, 'Must not contain table fetcher');
  assert.doesNotMatch(content, /generateTableInserts/, 'Must not contain SQL generator');
  assert.doesNotMatch(content, /CREATE TABLE/, 'Must not contain DDL schemas');
  assert.doesNotMatch(content, /INSERT INTO/, 'Must not contain DML generators');
  assert.doesNotMatch(content, /Blob/, 'Must not contain Blob file builders');
  assert.doesNotMatch(content, /createObjectURL/, 'Must not trigger browser downloads');
});

test('Backup Quarantine - Settings.jsx does not import databaseBackup.js or expose export handlers', () => {
  const content = fs.readFileSync(settingsFilePath, 'utf8');

  assert.doesNotMatch(
    content,
    /from\s+['"].*databaseBackup['"]/,
    'Settings.jsx must not import from databaseBackup'
  );
  assert.doesNotMatch(
    content,
    /downloadDatabaseBackup/,
    'Settings.jsx must not reference downloadDatabaseBackup'
  );
  assert.doesNotMatch(
    content,
    /Download Database Backup/,
    'Settings.jsx must not contain user-facing Download Database Backup action'
  );
  assert.doesNotMatch(
    content,
    /Download SQL Backup/,
    'Settings.jsx must not contain user-facing Download SQL Backup action'
  );
  assert.doesNotMatch(
    content,
    /handleDownloadBackup/,
    'Settings.jsx must not contain handleDownloadBackup handler'
  );
  assert.doesNotMatch(
    content,
    /exportingBackup/,
    'Settings.jsx must not maintain exportingBackup state'
  );
});

test('Backup Quarantine - Settings.jsx renders honest, unverified Backup & Recovery Status card', () => {
  const content = fs.readFileSync(settingsFilePath, 'utf8');

  assert.match(
    content,
    /Backup & Recovery Status/,
    'Settings.jsx must contain Backup & Recovery Status card title'
  );
  assert.match(
    content,
    /Server-Managed Infrastructure/,
    'Settings.jsx must indicate server-managed infrastructure tier'
  );
  assert.match(
    content,
    /quarantined and permanently disabled/,
    'Settings.jsx must state browser exports are quarantined for HIPAA'
  );
  assert.match(
    content,
    /Unverified \(Console Check Required\)/,
    'Settings.jsx must explicitly state automated backup status is unverified from client'
  );
  assert.match(
    content,
    /Supabase Console Audit Only/,
    'Settings.jsx must state backup verification is via console audit only'
  );
});

test('Backup Quarantine - Settings.jsx preserves operational settings fields', () => {
  const content = fs.readFileSync(settingsFilePath, 'utf8');

  // Verify core operational fields are intact
  assert.match(content, /facility_name/, 'facility_name state preserved');
  assert.match(content, /facility_address/, 'facility_address state preserved');
  assert.match(content, /apply_medicare_mppr/, 'apply_medicare_mppr state preserved');
  assert.match(content, /light_sidebar_color/, 'theme color state preserved');
  assert.match(content, /dark_sidebar_color/, 'dark theme color state preserved');
  assert.match(content, /db\.getSettings/, 'loadSettings DB call preserved');
  assert.match(content, /db\.updateSettings/, 'updateSettings DB call preserved');
});

test('Backup Quarantine - App.jsx does not expose alternative database backup routes', () => {
  const content = fs.readFileSync(appFilePath, 'utf8');

  assert.doesNotMatch(
    content,
    /databaseBackup/,
    'App.jsx must not import databaseBackup utility'
  );
  assert.doesNotMatch(
    content,
    /downloadDatabaseBackup/,
    'App.jsx must not reference downloadDatabaseBackup'
  );
});
