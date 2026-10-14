/**
 * @deprecated QUARANTINED FOR SECURITY & HIPAA COMPLIANCE (P0)
 *
 * Client-side browser database export has been permanently disabled to prevent
 * plaintext extraction of Protected Health Information (PHI), credentials, and cross-facility records.
 *
 * In compliance with HIPAA Technical Safeguards (45 CFR § 164.308 / 164.312), all database backups,
 * continuous WAL archiving, and Point-in-Time Recovery (PITR) must be executed strictly server-side
 * at the managed infrastructure tier.
 *
 * Reference: docs/phases/15-OBSERVABILITY-MONITORING-BACKUPS.md
 */

export const BACKUP_TABLES = Object.freeze([]);
export const TABLE_SCHEMAS = Object.freeze({});

export function escapeSqlValue() {
  throw new Error(
    'SECURITY_ERROR: escapeSqlValue is disabled. Client-side SQL generation has been quarantined.'
  );
}

export async function downloadDatabaseBackup() {
  throw new Error(
    'SECURITY_ERROR: Client-side database backups have been quarantined and permanently disabled in compliance with HIPAA (45 CFR § 164.308 / 164.312). Backups must be performed server-side.'
  );
}
