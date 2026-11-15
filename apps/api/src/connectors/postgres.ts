/**
 * PostgreSQL read-only connector.
 * Connects to a user-supplied Postgres database, enforces read-only access
 * via a READ ONLY transaction + statement_timeout, and guards the SQL so
 * agents cannot mutate the external database.
 */
import { Pool } from 'pg';
import { resolveHost, extractHostname } from '../utils/dns-fix';

const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|execute|do\b|set\b|listen|notify|lock|vacuum|analyze|comment|prepare|deallocate|discard|checkpoint|cluster|reindex|refresh|into\b)/i;

export interface TableInfo {
  table_name: string;
  columns: Array<{ column_name: string; data_type: string }>;
}

/**
 * Guards a SQL string so only single read-only statements pass.
 * WRITE protection is additionally enforced by BEGIN READ ONLY,
 * so this is a fast pre-check for obviously dangerous input.
 */
export function isReadOnlyQuery(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!/^(select|with|show|explain)\b/i.test(trimmed)) return false;
  // No stacked queries
  if (trimmed.includes(';')) return false;
  // Ignore string literals when scanning for write keywords
  const noLiterals = trimmed.replace(/'([^']|'')*'/g, "''");
  if (FORBIDDEN_SQL.test(noLiterals)) return false;
  return true;
}

/**
 * Builds a pg Pool for an external connection string, applying the same
 * DNS workaround the main pool uses (local DNS can't resolve Neon hosts).
 */
async function buildExternalPool(connectionString: string): Promise<{ pool: Pool; servername?: string }> {
  let connStr = connectionString;
  const hostname = extractHostname(connectionString);
  let servername: string | undefined;

  if (hostname) {
    const ip = await resolveHost(hostname);
    if (ip) {
      connStr = connStr
        .replace(hostname, ip)
        .replace(/[?&]sslmode=[^&]*/g, '')
        .replace(/[?&]channel_binding=[^&]*/g, '')
        .replace(/[?&]$/, '');
      servername = hostname;
    }
  }

  const needsSsl = /sslmode=require|sslmode=verify|neon\.tech|ssl=true/i.test(connectionString);

  const pool = new Pool({
    connectionString: connStr,
    ssl: needsSsl
      ? { rejectUnauthorized: false, ...(servername ? { servername } : {}) }
      : false,
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 12000,
  });
  return { pool, servername };
}

/**
 * Executes a read-only SELECT against the external DB.
 * Wraps in BEGIN READ ONLY so any slipped-through writes are rejected by Postgres itself.
 */
export async function runReadOnlyQuery(
  connectionString: string,
  sql: string,
  maxRows = 100
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  if (!isReadOnlyQuery(sql)) {
    throw new Error('Only read-only SELECT queries are allowed on connected data sources.');
  }

  const { pool } = await buildExternalPool(connectionString);
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '8s'`);
    const result = await client.query(sql);
    await client.query('ROLLBACK');
    return { rows: result.rows.slice(0, maxRows), rowCount: result.rowCount ?? result.rows.length };
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

/**
 * Lists public-schema tables and columns so agents can discover the schema.
 */
export async function listTables(connectionString: string): Promise<TableInfo[]> {
  const { pool } = await buildExternalPool(connectionString);
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '8s'`);
    const result = await client.query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    );
    const map = new Map<string, TableInfo>();
    for (const row of result.rows as Array<{ table_name: string; column_name: string; data_type: string }>) {
      let t = map.get(row.table_name);
      if (!t) {
        t = { table_name: row.table_name, columns: [] };
        map.set(row.table_name, t);
      }
      t.columns.push({ column_name: row.column_name, data_type: row.data_type });
    }
    return Array.from(map.values());
  } finally {
    client.release();
    await pool.end().catch(() => undefined);
  }
}

/**
 * Lightweight connectivity test for the /test endpoint.
 */
export async function testConnection(connectionString: string): Promise<{ success: boolean; message: string }> {
  try {
    const { pool } = await buildExternalPool(connectionString);
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT current_database() AS db, current_user AS usr');
      return { success: true, message: `Connected to ${res.rows[0].db} as ${res.rows[0].usr}` };
    } finally {
      client.release();
      await pool.end().catch(() => undefined);
    }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
  }
}
