/**
 * E2E verify for Slack-style channels:
 *   GET /channels, POST /channels (public+private), messages w/ and w/o @brain,
 *   DM creation, mention inbox.
 * Usage: npx ts-node src/database/verify-channels.ts [email]
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
  const token = signToken({ userId: user.id, email: user.email, workspaceId });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log(`[verify] user=${user.email}`);

  const j = async (url: string, init?: RequestInit) => (await fetch(url, init)).json() as Promise<{ data?: any; error?: string }>;

  // 1. Channel list — migrated room should show as #general
  const list = await j(`${BASE}/channels`, { headers });
  console.log('[verify] channels:', (list.data.channels as Array<{ name: string; kind: string; member_count: number }>)
    .map((c) => `${c.kind === 'dm' ? 'dm' : '#' + c.name}(${c.member_count})`).join(', '), '| mentions:', list.data.mention_count);
  const general = list.data.channels.find((c: { kind: string; name: string }) => c.kind === 'channel' && c.name === 'general');
  if (!general) throw new Error('No #general channel');

  // 2. Create a private channel
  const created = await j(`${BASE}/channels`, { method: 'POST', headers, body: JSON.stringify({ name: 'engineering-secret', visibility: 'private' }) });
  console.log('[verify] created private channel:', JSON.stringify(created.data ?? created.error));

  // 3. Post without @brain → stored only
  const p1 = await j(`${BASE}/channels/${general.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: 'hello #general from verify script' }),
  });
  console.log('[verify] plain post:', p1.data?.status, '| no_reply:', p1.data?.no_reply);

  // 4. @brain → agent replies
  const p2 = await j(`${BASE}/channels/${general.id}/messages`, {
    method: 'POST', headers, body: JSON.stringify({ content: '@brain what is 12 * 12?' }),
  });
  console.log('[verify] brain post:', p2.data?.status, '| reply:', (p2.data?.content ?? '').slice(0, 100));

  // 5. Users list + DM (only if another member exists)
  const users = await j(`${BASE}/channels/users`, { headers });
  const others = (users.data as Array<{ id: string; handle: string; is_bot: boolean }>).filter((u) => !u.is_bot && u.id !== user.id);
  console.log('[verify] picker handles:', (users.data as Array<{ handle: string }>).map((u) => u.handle).join(', '));
  if (others.length > 0) {
    const dm = await j(`${BASE}/channels/dm`, { method: 'POST', headers, body: JSON.stringify({ user_id: others[0].id }) });
    console.log('[verify] dm channel:', JSON.stringify(dm.data ?? dm.error));
  } else {
    console.log('[verify] only one workspace member — DM skipped');
  }

  // 6. Mentions inbox
  const mentions = await j(`${BASE}/channels/mentions`, { headers });
  console.log('[verify] my mentions:', (mentions.data ?? []).length);

  // 7. Read back general messages
  const msgs = await j(`${BASE}/channels/${general.id}/messages`, { headers });
  console.log(`[verify] #general has ${(msgs.data ?? []).length} message(s)`);

  await pool.end();
  console.log('\n[done]');
}

main().catch((e) => { console.error('[verify-channels] FAILED:', e); process.exit(1); });
