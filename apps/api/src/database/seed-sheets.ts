/**
 * Registers a google_sheets data source and verifies it via the tool registry.
 *
 * Usage (from apps/api):
 *   npx ts-node src/database/seed-sheets.ts [user-email] [csv-url] [source-name]
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

import '../utils/dns-fix';
import { v4 as uuidv4 } from 'uuid';
import { initPool, getPool } from './pool';
import '../tools/builtin';
import { registry } from '../tools/registry';

const TARGET_EMAIL = process.argv[2];
const CSV_URL = process.argv[3] || 'http://localhost:5173/demo-sheet.csv';
const SOURCE_NAME = process.argv[4] || 'Monthly Sales Sheet';

async function main() {
  await initPool();
  const pool = getPool();

  let userRow;
  if (TARGET_EMAIL) {
    const r = await pool.query(`SELECT id, email FROM users WHERE email = $1`, [TARGET_EMAIL]);
    userRow = r.rows[0];
    if (!userRow) throw new Error(`No user found with email ${TARGET_EMAIL}`);
  } else {
    const r = await pool.query(`SELECT id, email FROM users ORDER BY is_demo ASC, created_at DESC LIMIT 1`);
    userRow = r.rows[0];
  }
  if (!userRow) throw new Error('No users in the app database — register an account first.');

  const ws = await pool.query(
    `SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userRow.id]
  );
  const workspaceId = ws.rows[0]?.workspace_id;
  if (!workspaceId) throw new Error(`No workspace found for ${userRow.email}`);

  const publicConfig = JSON.stringify({
    csv_url: CSV_URL,
    description: 'Monthly sales data by region and product (CSV export)',
  });

  const existing = await pool.query(
    `SELECT id FROM data_sources WHERE workspace_id = $1 AND user_id = $2 AND name = $3`,
    [workspaceId, userRow.id, SOURCE_NAME]
  );

  let sourceId: string;
  if (existing.rows.length) {
    sourceId = existing.rows[0].id;
    await pool.query(
      `UPDATE data_sources SET type = 'google_sheets', status = 'connected', config_public = $1, last_synced_at = NOW() WHERE id = $2`,
      [publicConfig, sourceId]
    );
  } else {
    sourceId = uuidv4();
    await pool.query(
      `INSERT INTO data_sources (id, workspace_id, user_id, name, type, status, config_public, config_encrypted, last_synced_at)
       VALUES ($1,$2,$3,$4,'google_sheets','connected',$5,'{}',NOW())`,
      [sourceId, workspaceId, userRow.id, SOURCE_NAME, publicConfig]
    );
  }

  console.log(`[seed] Data source "${SOURCE_NAME}" (${sourceId}) registered for ${userRow.email}`);

  // Verify through the tool
  const ctx = { userId: userRow.id, workspaceId };
  console.log('\n[verify] Querying sheet via query_connected_data...');
  const res = await registry.execute(
    'query_connected_data',
    { source_id: sourceId, description: 'Monthly sales by region', limit: 5 },
    ctx,
    ['query_connected_data']
  );
  console.log('[verify] result:', JSON.stringify(res.result ?? res, null, 2));

  await pool.end();
  console.log('\n[done]');
}

main().catch((err) => {
  console.error('[seed-sheets] FAILED:', err);
  process.exit(1);
});
