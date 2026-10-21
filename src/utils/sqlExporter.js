import { supabase, db } from '../lib/supabase.js';

// Canonical table catalog with metadata (all 34 tables in relational dependency order)
export const AVAILABLE_TABLES = [
  // Core Tenancy & Hierarchy
  { id: 'organizations', label: 'Organizations', defaultChecked: false, hasFacilityScope: false },
  { id: 'facilities', label: 'Facilities', defaultChecked: true, hasFacilityScope: true },
  { id: 'roles', label: 'Security Roles', defaultChecked: false, hasFacilityScope: false },
  { id: 'permissions', label: 'Security Permissions', defaultChecked: false, hasFacilityScope: false },
  { id: 'role_permissions', label: 'Role Permissions Matrix', defaultChecked: false, hasFacilityScope: false },
  { id: 'users', label: 'Users', defaultChecked: false, hasFacilityScope: true },
  { id: 'facility_memberships', label: 'Facility Memberships', defaultChecked: false, hasFacilityScope: true },
  { id: 'settings', label: 'System Settings & Theme', defaultChecked: true, hasFacilityScope: false },

  // Clinical Infrastructure & Payers
  { id: 'operating_rooms', label: 'Operating Rooms', defaultChecked: false, hasFacilityScope: true },
  { id: 'payers', label: 'Payers', defaultChecked: false, hasFacilityScope: true },
  { id: 'payer_fee_schedules', label: 'Payer Fee Schedules', defaultChecked: false, hasFacilityScope: true },
  { id: 'cpt_codes', label: 'CPT Fee Schedule', defaultChecked: false, hasFacilityScope: true },

  // Personnel & Credentials
  { id: 'surgeons', label: 'Surgeons Directory', defaultChecked: false, hasFacilityScope: true },
  { id: 'staff', label: 'Staff Directory', defaultChecked: false, hasFacilityScope: true },
  { id: 'surgeon_facility_affiliations', label: 'Surgeon Facility Affiliations', defaultChecked: false, hasFacilityScope: true },
  { id: 'surgeon_privileges', label: 'Surgeon Privileges', defaultChecked: false, hasFacilityScope: true },
  { id: 'surgeon_time_off', label: 'Surgeon Time Off / Blackouts', defaultChecked: false, hasFacilityScope: true },

  // Patients
  { id: 'patients', label: 'Patients', defaultChecked: false, hasFacilityScope: true },
  { id: 'patient_external_identifiers', label: 'Patient External Identifiers', defaultChecked: false, hasFacilityScope: true },

  // Cases, Milestones & Attribution
  { id: 'or_block_schedule', label: 'OR Block Schedules', defaultChecked: false, hasFacilityScope: true },
  { id: 'surgeries', label: 'Surgical Cases', defaultChecked: false, hasFacilityScope: true },
  { id: 'case_milestones', label: 'Case Milestones', defaultChecked: false, hasFacilityScope: true },
  { id: 'case_events', label: 'Case Lifecycle Events', defaultChecked: false, hasFacilityScope: true },
  { id: 'case_surgeons', label: 'Case Surgeons Attribution', defaultChecked: false, hasFacilityScope: true },
  { id: 'surgery_procedures', label: 'Surgery Procedures (CPT Codes)', defaultChecked: false, hasFacilityScope: true },
  { id: 'surgery_financial_snapshots', label: 'Surgery Financial Snapshots', defaultChecked: false, hasFacilityScope: true },
  { id: 'ot_extra_cost', label: 'Overtime & Extra Costs', defaultChecked: false, hasFacilityScope: true },

  // Audit Logs & Chatbot
  { id: 'audit_logs', label: 'Audit Telemetry Logs', defaultChecked: false, hasFacilityScope: true },
  { id: 'chatbot_questions', label: 'Instruction Panel Questions', defaultChecked: false, hasFacilityScope: false },

  // Autonomous Agent Framework
  { id: 'agent_tasks', label: 'Agent Tasks', defaultChecked: false, hasFacilityScope: false },
  { id: 'agent_runs', label: 'Agent Runs', defaultChecked: false, hasFacilityScope: false },
  { id: 'agent_context', label: 'Agent Context', defaultChecked: false, hasFacilityScope: false },
  { id: 'agent_approvals', label: 'Agent Approvals', defaultChecked: false, hasFacilityScope: false },
  { id: 'agent_events', label: 'Agent Events', defaultChecked: false, hasFacilityScope: false }
];

export const DEFAULT_FACILITY_TABLES = ['facilities', 'settings'];

export const FACILITY_OPERATIONS_TABLES = [
  'facilities',
  'settings',
  'surgeons',
  'staff',
  'cpt_codes',
  'surgeries',
  'or_block_schedule',
  'ot_extra_cost',
  'patients'
];

export const ALL_EXPORT_TABLES = AVAILABLE_TABLES.map(t => t.id);

// Legacy export alias for backward compatibility
export const EXPORT_TABLES = ALL_EXPORT_TABLES;

/**
 * Escapes a JS value safely for PostgreSQL insertion
 */
export function formatSqlLiteral(val) {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  if (typeof val === 'number') {
    return isNaN(val) ? 'NULL' : String(val);
  }
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  // String or date
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Queries selected tables and compiles a downloadable .sql file
 *
 * @param {Object|Function} options - Configuration object, or legacy progress callback
 * @param {string[]} [options.tables=['facilities', 'settings']] - Table names to export
 * @param {string} [options.facilityId] - Active facility ID to scope queries
 * @param {string} [options.facilityName] - Active facility name for comments and filename
 * @param {string} [options.scope='facility_settings'] - 'facility_settings' | 'facility_operations' | 'custom' | 'full'
 * @param {Function} [options.onProgress] - Progress callback (tableName, current, total)
 */
export async function exportDatabaseSql(options = {}) {
  let onProgress = null;
  let targetTables = DEFAULT_FACILITY_TABLES;
  let facilityId = null;
  let facilityName = null;
  let scope = 'facility_settings';

  if (typeof options === 'function') {
    // Legacy support
    onProgress = options;
    targetTables = ALL_EXPORT_TABLES;
    scope = 'full';
  } else if (typeof options === 'object' && options !== null) {
    onProgress = options.onProgress || null;
    scope = options.scope || (
      Array.isArray(options.tables) && options.tables.length === 2 && options.tables.includes('facilities') && options.tables.includes('settings')
        ? 'facility_settings'
        : 'full'
    );
    targetTables = Array.isArray(options.tables) && options.tables.length > 0
      ? options.tables
      : (scope === 'full' ? ALL_EXPORT_TABLES : DEFAULT_FACILITY_TABLES);
    facilityId = options.facilityId || null;
    facilityName = options.facilityName || null;
  }

  // In full emergency backup mode, dynamically discover all live tables from PostgreSQL
  if (scope === 'full') {
    try {
      const { data: dbTables, error } = await supabase.rpc('fn_get_public_tables');
      if (!error && Array.isArray(dbTables) && dbTables.length > 0) {
        const liveTableNames = dbTables
          .filter(t => t.table_type === 'BASE TABLE' || !t.table_type)
          .map(t => (typeof t === 'string' ? t : t.table_name))
          .filter(Boolean);

        if (liveTableNames.length > 0) {
          targetTables = liveTableNames;
        }
      }
    } catch (dynamicErr) {
      console.warn('[SQL Exporter] Live schema introspection fallback:', dynamicErr.message);
    }
  }

  // Ensure table order respects relational foreign keys for known tables, plus any dynamic tables appended
  const knownTables = ALL_EXPORT_TABLES.filter(t => targetTables.includes(t));
  const dynamicTables = targetTables.filter(t => !ALL_EXPORT_TABLES.includes(t));
  const orderedTables = [...knownTables, ...dynamicTables];

  const timestamp = new Date().toISOString();
  let scopeDescription = 'Custom Table Export';
  if (scope === 'facility_settings') {
    scopeDescription = 'Facility Configuration Only';
  } else if (scope === 'facility_operations') {
    scopeDescription = 'Facility Operational Data (Scoped)';
  } else if (scope === 'full') {
    scopeDescription = 'Full Enterprise Database Backup';
  }

  let sqlContent = `-- =========================================================\n`;
  sqlContent += `-- ASCANALYST.AI — SQL EXPORT\n`;
  sqlContent += `-- Export Scope: ${scopeDescription}\n`;
  if (facilityName) {
    sqlContent += `-- Facility: ${facilityName} (${facilityId || 'All'})\n`;
  }
  sqlContent += `-- Export Generated: ${timestamp}\n`;
  sqlContent += `-- Tables Included: ${orderedTables.join(', ')}\n`;
  sqlContent += `-- Format: PostgreSQL 15+ Compatible DDL & DML Inserts\n`;
  sqlContent += `-- =========================================================\n\n`;
  sqlContent += `BEGIN;\n\n`;

  let totalRecords = 0;
  const tableStats = {};
  const skippedTables = [];

  for (let i = 0; i < orderedTables.length; i++) {
    const tableName = orderedTables[i];
    if (onProgress) {
      onProgress(tableName, i + 1, orderedTables.length);
    }

    try {
      let query = supabase.from(tableName).select('*');

      // Scope to facility when applicable and not doing an enterprise full backup
      if (facilityId && scope !== 'full') {
        if (tableName === 'facilities') {
          query = query.eq('id', facilityId);
        } else if (tableName === 'cpt_codes' || tableName === 'payers') {
          query = query.or(`facility_id.is.null,facility_id.eq.${facilityId}`);
        } else if ([
          'surgeons',
          'patients',
          'staff',
          'surgeries',
          'or_block_schedule',
          'ot_extra_cost',
          'facility_memberships',
          'audit_logs',
          'operating_rooms',
          'payer_fee_schedules',
          'surgery_procedures',
          'surgery_financial_snapshots',
          'case_milestones',
          'case_events',
          'case_surgeons',
          'patient_external_identifiers',
          'surgeon_facility_affiliations',
          'surgeon_privileges',
          'surgeon_time_off'
        ].includes(tableName)) {
          query = query.eq('facility_id', facilityId);
        }
      }

      const { data, error } = await query;

      if (error) {
        console.warn(`[SQL Exporter] Notice: Query on table "${tableName}" returned:`, error.message);
        sqlContent += `-- Table: ${tableName} (Notice: ${error.message})\n\n`;
        skippedTables.push({ table: tableName, error: error.message });
        continue;
      }

      const rows = data || [];
      tableStats[tableName] = rows.length;
      totalRecords += rows.length;

      sqlContent += `-- ---------------------------------------------------------\n`;
      sqlContent += `-- Table: public.${tableName} (Exported Rows: ${rows.length})\n`;
      sqlContent += `-- ---------------------------------------------------------\n`;

      if (rows.length > 0) {
        // Collect column names from the first row, sanitizing sensitive keys like api keys and legacy passwords
        const columns = Object.keys(rows[0]).filter(col => col !== 'gemini_api_key' && col !== 'password');
        const colListStr = columns.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = columns.map(col => formatSqlLiteral(row[col]));
          sqlContent += `INSERT INTO public."${tableName}" (${colListStr}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
        }
        sqlContent += `\n`;
      } else {
        sqlContent += `-- (No rows found matching export scope)\n\n`;
      }
    } catch (err) {
      console.error(`[SQL Exporter] Error exporting table ${tableName}:`, err);
      sqlContent += `-- Error exporting table ${tableName}: ${err.message}\n\n`;
    }
  }

  sqlContent += `COMMIT;\n\n`;
  sqlContent += `-- =========================================================\n`;
  sqlContent += `-- SQL EXPORT COMPLETED: ${totalRecords} Records Across ${orderedTables.length} Tables\n`;
  sqlContent += `-- =========================================================\n`;

  // Log export audit event
  try {
    if (db && db.logExportAuditEvent) {
      await db.logExportAuditEvent('database_sql_dump', totalRecords, {
        scope,
        facility_id: facilityId,
        tables_exported: orderedTables,
        table_stats: tableStats,
        export_format: 'sql'
      });
    }
  } catch (auditErr) {
    console.warn("[SQL Exporter] Audit log notice:", auditErr);
  }

  // Create downloadable file in browser
  const blob = new Blob([sqlContent], { type: 'application/sql;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const cleanName = facilityName ? facilityName.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'facility';

  let filename = `facility_settings_${cleanName}_${dateStr}.sql`;
  if (scope === 'full') {
    filename = `ascanalyst_full_database_export_${dateStr}.sql`;
  } else if (scope === 'facility_operations') {
    filename = `facility_operations_${cleanName}_${dateStr}.sql`;
  } else if (scope === 'custom') {
    filename = `facility_export_${cleanName}_${dateStr}.sql`;
  }

  downloadLink.href = downloadUrl;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(downloadUrl);

  return { 
    totalRecords, 
    tableStats, 
    tables: orderedTables, 
    totalCatalogTables: orderedTables.length, 
    filename, 
    skippedTables 
  };
}
