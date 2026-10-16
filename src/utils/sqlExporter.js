import { supabase, db } from '../lib/supabase';

// Table order configured for relational integrity on restore
export const EXPORT_TABLES = [
  'organizations',
  'facilities',
  'roles',
  'permissions',
  'role_permissions',
  'settings',
  'surgeons',
  'patients',
  'staff',
  'cpt_codes',
  'surgeries',
  'or_block_schedule',
  'ot_extra_cost',
  'facility_memberships',
  'audit_logs'
];

/**
 * Escapes a JS value safely for PostgreSQL insertion
 */
function formatSqlLiteral(val) {
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
 * Queries all tables and compiles a complete, downloadable .sql file
 */
export async function exportDatabaseSql(onProgress = null) {
  const timestamp = new Date().toISOString();
  let sqlContent = `-- =========================================================\n`;
  sqlContent += `-- ASCANALYST.AI — COMPLETE DATABASE & DATA SQL DUMP\n`;
  sqlContent += `-- Export Generated: ${timestamp}\n`;
  sqlContent += `-- Format: PostgreSQL 15+ Compatible DDL & DML Inserts\n`;
  sqlContent += `-- =========================================================\n\n`;
  sqlContent += `BEGIN;\n\n`;

  let totalRecords = 0;
  const tableStats = {};

  for (let i = 0; i < EXPORT_TABLES.length; i++) {
    const tableName = EXPORT_TABLES[i];
    if (onProgress) {
      onProgress(tableName, i + 1, EXPORT_TABLES.length);
    }

    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (error) {
        console.warn(`[SQL Exporter] Notice: Query on table "${tableName}" returned:`, error.message);
        sqlContent += `-- Table: ${tableName} (Notice: ${error.message})\n\n`;
        continue;
      }

      const rows = data || [];
      tableStats[tableName] = rows.length;
      totalRecords += rows.length;

      sqlContent += `-- ---------------------------------------------------------\n`;
      sqlContent += `-- Table: public.${tableName} (Rows: ${rows.length})\n`;
      sqlContent += `-- ---------------------------------------------------------\n`;

      if (rows.length > 0) {
        // Collect column names from the first row, sanitizing sensitive keys
        const columns = Object.keys(rows[0]).filter(col => col !== 'gemini_api_key');
        const colListStr = columns.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = columns.map(col => formatSqlLiteral(row[col]));
          sqlContent += `INSERT INTO public."${tableName}" (${colListStr}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
        }
        sqlContent += `\n`;
      } else {
        sqlContent += `-- (No rows found in table)\n\n`;
      }
    } catch (err) {
      console.error(`[SQL Exporter] Error exporting table ${tableName}:`, err);
      sqlContent += `-- Error exporting table ${tableName}: ${err.message}\n\n`;
    }
  }

  sqlContent += `COMMIT;\n\n`;
  sqlContent += `-- =========================================================\n`;
  sqlContent += `-- DATABASE EXPORT COMPLETED: ${totalRecords} Total Records Across ${EXPORT_TABLES.length} Tables\n`;
  sqlContent += `-- =========================================================\n`;

  // Log export audit event
  try {
    if (db && db.logExportAuditEvent) {
      await db.logExportAuditEvent('database_sql_dump', totalRecords, {
        tables_exported: EXPORT_TABLES,
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
  downloadLink.href = downloadUrl;
  downloadLink.download = `ascanalyst_full_database_export_${dateStr}.sql`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(downloadUrl);

  return { totalRecords, tableStats };
}
