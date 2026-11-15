/**
 * Reproduce invite-based registration end-to-end.
 * Creates an invite for the real workspace, then registers via the deployed API.
 * Usage: npx ts-node src/database/test-invite.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
import '../utils/dns-fix';
import { initPool, getPool } from './pool';
import { v4 as uuidv4 } from 'uuid';

const API = 'https://api-pied-mu-25.vercel.app/api';
const WS = '4aab8669-02a4-440e-b95c-b349f016c977'; // ansh.rathoer's Workspace

async function main() {
  await initPool();
  const pool = getPool();

  // 1. Check workspace_invites table exists + its columns
  const cols = await pool.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='workspace_invites' ORDER BY ordinal_position`
  );
  console.log('workspace_invites columns:', JSON.stringify(cols.rows));

  // 2. Insert an invite for the real workspace
  const code = 'test' + Math.floor(Math.random() * 1e6);
  await pool.query(
    `INSERT INTO workspace_invites (id, workspace_id, code, created_by) VALUES ($1,$2,$3,$4)`,
    [uuidv4(), WS, code, '576472b0-d4ae-4aab-b11a-53c402517eea'] // eklavya's id as creator (any user works)
  ).catch((e) => console.log('invite insert failed:', e.message));
  console.log('invite code:', code);

  // 3. Public info check
  const info = await fetch(`${API}/invites/${code}/info`).then((r) => r.json().then((b) => ({ s: r.status, b })));
  console.log('GET /invites/:code/info →', JSON.stringify(info));

  // 4. Register with the invite against deployed API
  const email = `invitetest${Math.floor(Math.random() * 1e6)}@agentdesk.local`;
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Invite Test', email, password: 'password123', invite_code: code }),
  }).then((r) => r.json().then((b) => ({ s: r.status, b })));
  console.log('POST /auth/register →', JSON.stringify(reg));

  // 5. Verify which workspace the new user landed in
  if (reg.s === 201) {
    const nu = await pool.query(
      `SELECT u.email, wm.role, w.name AS workspace FROM users u
       LEFT JOIN workspace_members wm ON wm.user_id = u.id
       LEFT JOIN workspaces w ON w.id = wm.workspace_id WHERE u.email = $1`, [email]
    );
    console.log('new user placement:', JSON.stringify(nu.rows));
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
