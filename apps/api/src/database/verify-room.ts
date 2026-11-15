/**
 * Verifies the shared room end-to-end over HTTP:
 *   GET /api/room, GET /api/room/members, POST message (no @brain → stored),
 *   POST message with @brain (agent replies), GET messages.
 * Usage: npx ts-node src/database/verify-room.ts [email]
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

import '../utils/dns-fix';
import { initPool, getPool } from './pool';
import '../tools/builtin';
import { signToken } from '../utils/auth';

const BASE = 'http://localhost:3001/api';
const EMAIL = process.argv[2];

async function main() {
  await initPool();
  const pool = getPool();

  const r = EMAIL
    ? await pool.query(`SELECT id, email FROM users WHERE email = $1`, [EMAIL])
    : await pool.query(`SELECT id, email FROM users ORDER BY is_demo ASC, created_at DESC LIMIT 1`);
  const user = r.rows[0];
  if (!user) throw new Error('No user found');

  const ws = await pool.query(`SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`, [user.id]);
  const workspaceId = ws.rows[0]?.workspace_id;
  if (!workspaceId) throw new Error('No workspace for user');

  const token = signToken({ userId: user.id, email: user.email, workspaceId });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`[verify] user=${user.email}`);

  const j = async (url: string, init?: RequestInit) => (await fetch(url, init)).json() as Promise<{ data?: any; error?: string }>;

  const room = await j(`${BASE}/room`, { headers });
  console.log('[verify] room:', JSON.stringify(room.data));
  const roomId = room.data.id as string;

  const members = await j(`${BASE}/room/members`, { headers });
  console.log('[verify] members:', (members.data as Array<{ handle: string }>).map((m) => m.handle).join(', '));

  // 1. Plain message — no @brain → must NOT call the AI
  const p1 = await j(`${BASE}/room/${roomId}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: 'hey team, testing the room — no brain tag here' }),
  });
  console.log('[verify] no-brain post:', JSON.stringify(p1.data));

  // 2. @brain message → agent replies into the room
  const p2 = await j(`${BASE}/room/${roomId}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: '@brain what time is it right now?' }),
  });
  console.log('[verify] brain post status:', p2.data?.status, '| reply:', (p2.data?.content ?? '').slice(0, 120));

  // 3. Read back messages
  const msgs = await j(`${BASE}/room/${roomId}/messages`, { headers });
  const list = (msgs.data ?? []) as Array<{ role: string; author_name: string | null; content: string }>;
  console.log(`[verify] room now has ${list.length} message(s)`);
  for (const m of list.slice(-3)) {
    console.log(`  - [${m.role}] ${m.author_name ?? 'Brain'}: ${(m.content ?? '').slice(0, 80)}`);
  }

  await pool.end();
  console.log('\n[done]');
}

main().catch((e) => { console.error('[verify-room] FAILED:', e); process.exit(1); });
