import { Pool } from 'pg';
import { config, hasDatabase } from '../config';
import { resolveHost, extractHostname } from '../utils/dns-fix';

let pool: Pool | null = null;

export async function initPool(): Promise<void> {
  if (pool || !hasDatabase) return;

  let connectionString = config.databaseUrl;
  let hostname = extractHostname(connectionString);

  // Try to resolve the hostname via Google DNS to work around local DNS issues
  if (hostname) {
    const ip = await resolveHost(hostname);
    if (ip) {
      // Replace hostname with IP, strip sslmode from connection string
      // (we handle SSL explicitly via the ssl option below)
      connectionString = connectionString
        .replace(hostname, ip)
        .replace(/[?&]sslmode=[^&]*/g, '')
        .replace(/[?&]channel_binding=[^&]*/g, '')
        .replace(/[?&]$/, '');
      console.log(`[DB] Resolved ${hostname} -> ${ip}`);
    }
  }

  pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
      ...(hostname ? { servername: hostname } : {}),
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
  });
}

export function getPool(): Pool {
  if (!pool) {
    if (!hasDatabase) {
      throw new Error('DATABASE_URL is not configured. Please set it in your .env file.');
    }
    // Fallback: create pool synchronously without DNS workaround
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseUrl.includes('sslmode=require') || config.nodeEnv === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const db = getPool();
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const db = getPool();
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function withTransaction<T>(
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
