/**
 * E2E verify: workspace invites, register-with-invite, reactions, presence.
 * Creates a real second user via invite and tests multi-user flows.
 * Usage: npx ts-node src/database/verify-invites.ts
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

async function main() {
  await initPool();
  const pool = getPool();

  const u1 = (await pool.query(`SELECT id, email FROM users ORDER BY is_demo ASC, created_at DESC LIMIT 1`)).rows[0];
  const wsId = (await pool.query(`SELECT workspace_id FROM workspace_members WHERE user_id = $1 LIMIT 1`, [u1.id])).rows[0].workspace_id;
  const token1 = signToken({ userId: u1.id, email: u1.email, workspaceId: wsId });
  const h1 = { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' };
  const j = async (url: string, init?: RequestInit) => (await fetch(url, init)).json() as Promise<any>;
  console.log(`[verify] user1=${u1.email}`);

  // 1. Create invite + public preview
  const inv = await j(`${BASE}/invites`, { method: 'POST', headers: h1 });
  const code = inv.data?.code;
  console.log('[verify] invite code:', code);
  const info = await j(`${BASE}/invites/${code}/info`);
  console.log('[verify] invite preview:', JSON.stringify(info.data ?? info.error));

  // 2. Register a second user with the invite
  const email2 = `testmate-${Date.now()}@example.com`;
  const reg = await j(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email2, name: 'Test Mate', password: 'password123', invite_code: code }),
  });
  if (reg.error) throw new Error(`register failed: ${reg.error}`);
  const token2 = reg.token;
  const joinedSameWs = reg.workspace.id === wsId;
  console.log('[verify] user2 registered into same workspace:', joinedSameWs);
  if (!joinedSameWs) throw new Error('user2 joined a different workspace!');
  const h2 = { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' };

  // 3. user2 sees #general (auto-joined)
  const chans2 = await j(`${BASE}/channels`, { headers: h2 });
  console.log('[verify] user2 channels:', (chans2.data.channels as Array<{ name: string; kind: string }>).map((c) => c.kind === 'dm' ? 'dm' : `#${c.name}`).join(', '));
  const general = chans2.data.channels.find((c: { kind: string; name: string }) => c.kind === 'channel' && c.name === 'general');

  // 4. user1 mentions user2 → user2 gets mention badge
  const u2id = reg.user.id;
  const members = await j(`${BASE}/channels/users`, { headers: h1 });
  const handle2 = (members.data as Array<{ id: string; handle: string }>).find((m) => m.id === u2id)?.handle;
  await j(`${BASE}/channels/${general.id}/messages`, { method: 'POST', headers: h1, body: JSON.stringify({ content: `hey @${handle2} welcome!` }) });
  const chans2b = await j(`${BASE}/channels`, { headers: h2 });
  console.log('[verify] user2 mention badge:', chans2b.data.mention_count);
  const mentions2 = await j(`${BASE}/channels/mentions`, { headers: h2 });
  console.log('[verify] user2 mentions inbox:', (mentions2.data ?? []).map((m: { author_name: string }) => m.author_name).join(', '));

  // 5. user2 creates DM with user1 + sends message
  const dm = await j(`${BASE}/channels/dm`, { method: 'POST', headers: h2, body: JSON.stringify({ user_id: u1.id }) });
  await j(`${BASE}/channels/${dm.data.id}/messages`, { method: 'POST', headers: h2, body: JSON.stringify({ content: 'hi back — DM works' }) });
  const chans1 = await j(`${BASE}/channels`, { headers: h1 });
  const dmFor1 = chans1.data.channels.find((c: { kind: string }) => c.kind === 'dm');
  console.log('[verify] user1 sees DM with unread:', dmFor1?.peer_name, 'unread=' + dmFor1?.unread_count);

  // 6. Reactions: user2 reacts to their own DM message
  const dmMsgs = await j(`${BASE}/channels/${dm.data.id}/messages`, { headers: h2 });
  const lastMsg = dmMsgs.data[dmMsgs.data.length - 1];
  await j(`${BASE}/channels/${dm.data.id}/messages/${lastMsg.id}/reactions`, { method: 'POST', headers: h2, body: JSON.stringify({ emoji: '👍' }) });
  const dmMsgs2 = await j(`${BASE}/channels/${dm.data.id}/messages`, { headers: h2 });
  console.log('[verify] reactions on last msg:', JSON.stringify(dmMsgs2.data[dmMsgs2.data.length - 1].reactions));

  // 7. Presence: user2 heartbeat → user1 sees them online
  await j(`${BASE}/presence/heartbeat`, { method: 'POST', headers: h2 });
  const online = await j(`${BASE}/presence/heartbeat`, { method: 'POST', headers: h1 });
  console.log('[verify] online users:', (online.data as Array<{ name: string }>).map((u) => u.name).join(', '));

  // 8. Typing: user2 types in DM → user1's typing poll shows it
  await j(`${BASE}/presence/typing/${dm.data.id}`, { method: 'POST', headers: h2 });
  const typingFor1 = await j(`${BASE}/presence/typing/${dm.data.id}`, { headers: h1 });
  console.log('[verify] typing in DM (user1 sees):', JSON.stringify(typingFor1.data));

  await pool.end();
  console.log('\n[done]');
}

main().catch((e) => { console.error('[verify-invites] FAILED:', e); process.exit(1); });
