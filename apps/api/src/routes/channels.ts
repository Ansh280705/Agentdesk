/**
 * Slack-style channels + DMs for a workspace.
 * - Public channels: any workspace member can read/join/post.
 * - Private channels: members only.
 * - DM channels: pairwise, created on demand.
 * - @handle mentions → message_mentions inbox for the tagged user.
 * - @brain → runs the agent; everything else is just stored.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { executeAgent } from '../agents/engine';
import { resolveMentions, insertMentionRows } from '../utils/mentions';
import { aiRateLimiter } from '../middleware/rateLimiter';

const router = Router();
router.use(authenticate);

const CreateChannelSchema = z.object({
  name: z.string().min(1).max(60).transform((s) => s.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')).pipe(z.string().min(1)),
  visibility: z.enum(['public', 'private']).optional().default('public'),
});

const SendSchema = z.object({ content: z.string().min(1).max(20000) });
const DmSchema = z.object({ user_id: z.string().uuid() });
const InviteSchema = z.object({ user_id: z.string().uuid() });

const BRAIN_TAG = /@brain\b/i;

interface MemberRow { id: string; name: string; email: string }
interface ChannelRow {
  id: string; name: string; kind: string; visibility: string; user_id: string;
  is_member: boolean; member_count: number; unread_count: number; peer_name?: string; peer_id?: string;
}

function handleFor(m: MemberRow): string {
  const base = (m.name?.split(/\s+/)[0] || m.email.split('@')[0] || m.id.slice(0, 6)).toLowerCase();
  return base.replace(/[^a-z0-9_]/g, '') || m.id.slice(0, 6);
}

async function getMembers(workspaceId: string): Promise<MemberRow[]> {
  return query<MemberRow>(
    `SELECT u.id, u.name, u.email FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1 ORDER BY u.name`,
    [workspaceId]
  );
}


async function isMember(channelId: string, userId: string): Promise<boolean> {
  const r = await queryOne(`SELECT 1 AS one FROM channel_members WHERE conversation_id = $1 AND user_id = $2`, [channelId, userId]);
  return !!r;
}

async function getChannel(channelId: string, workspaceId: string) {
  return queryOne<{ id: string; name: string; kind: string; visibility: string }>(
    `SELECT id, name, kind, visibility FROM conversations
     WHERE id = $1 AND workspace_id = $2 AND kind IN ('channel', 'dm')`,
    [channelId, workspaceId]
  );
}

/** Can this user read the channel? public → any workspace member; private/dm → members only. */
async function canRead(ch: { kind: string; visibility: string }, channelId: string, userId: string) {
  if (ch.kind === 'channel' && ch.visibility === 'public') return true;
  return isMember(channelId, userId);
}

// ── List channels + DMs + unread/mention badges ──────────────────────
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;

  // Auto-create #general on first access
  const any = await queryOne(`SELECT 1 AS one FROM conversations WHERE workspace_id = $1 AND kind = 'channel'`, [workspaceId]);
  if (!any) {
    const id = uuidv4();
    await query(
      `INSERT INTO conversations (id, workspace_id, user_id, title, is_shared, kind, name, visibility, created_by)
       VALUES ($1,$2,$3,'#general',TRUE,'channel','general','public',$3)`,
      [id, workspaceId, userId]
    );
    await query(
      `INSERT INTO channel_members (id, conversation_id, user_id)
       SELECT gen_random_uuid(), $1, wm.user_id FROM workspace_members wm WHERE wm.workspace_id = $2
       ON CONFLICT DO NOTHING`,
      [id, workspaceId]
    );
  }

  const channels = await query<ChannelRow>(
    `SELECT c.id, c.name, c.kind, c.visibility, c.user_id,
            EXISTS(SELECT 1 FROM channel_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2) AS is_member,
            (SELECT COUNT(*)::int FROM channel_members cm2 WHERE cm2.conversation_id = c.id) AS member_count,
            (SELECT COUNT(*)::int FROM messages m
             WHERE m.conversation_id = c.id AND m.role != 'tool'
               AND m.created_at > COALESCE((SELECT last_read_at FROM channel_members cm3
                 WHERE cm3.conversation_id = c.id AND cm3.user_id = $2), '1970-01-01')) AS unread_count,
            (SELECT pu.name FROM channel_members pcm JOIN users pu ON pu.id = pcm.user_id
             WHERE pcm.conversation_id = c.id AND pcm.user_id != $2 LIMIT 1) AS peer_name,
            (SELECT pcm.user_id FROM channel_members pcm
             WHERE pcm.conversation_id = c.id AND pcm.user_id != $2 LIMIT 1) AS peer_id
     FROM conversations c
     WHERE c.workspace_id = $1 AND (
       (c.kind = 'channel' AND (c.visibility = 'public' OR EXISTS(
         SELECT 1 FROM channel_members cmx WHERE cmx.conversation_id = c.id AND cmx.user_id = $2)))
       OR (c.kind = 'dm' AND EXISTS(
         SELECT 1 FROM channel_members cmd WHERE cmd.conversation_id = c.id AND cmd.user_id = $2))
     )
     ORDER BY c.kind DESC, c.created_at ASC`,
    [workspaceId, userId]
  );

  const mentionBadge = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM message_mentions WHERE mentioned_user_id = $1 AND read_at IS NULL`,
    [userId]
  );

  res.json({ data: { channels, mention_count: mentionBadge?.count ?? 0 } });
});

// ── Mention inbox ────────────────────────────────────────────────────
router.get('/mentions', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const mentions = await query(
    `SELECT mm.id AS mention_id, mm.channel_id, mm.read_at, mm.created_at,
            m.content, m.created_at AS message_at, u.name AS author_name,
            c.name AS channel_name, c.kind AS channel_kind, c.visibility
     FROM message_mentions mm
     JOIN messages m ON m.id = mm.message_id
     LEFT JOIN users u ON u.id = m.user_id
     JOIN conversations c ON c.id = mm.channel_id
     WHERE mm.mentioned_user_id = $1 AND c.workspace_id = $2
     ORDER BY mm.created_at DESC LIMIT 50`,
    [userId, workspaceId]
  );
  res.json({ data: mentions });
});

router.post('/mentions/read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  await query(`UPDATE message_mentions SET read_at = NOW() WHERE mentioned_user_id = $1 AND read_at IS NULL`, [userId]);
  res.json({ message: 'ok' });
});

// ── Users for the @ picker / DM picker (all workspace members + Brain) ──
router.get('/users', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { workspaceId } = req.user!;
  const members = await getMembers(workspaceId);
  res.json({
    data: [
      { id: 'brain', name: 'Brain', handle: 'brain', is_bot: true },
      ...members.map((m) => ({ id: m.id, name: m.name, email: m.email, handle: handleFor(m), is_bot: false })),
    ],
  });
});

// ── Create a channel ─────────────────────────────────────────────────
router.post('/', validateBody(CreateChannelSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { name, visibility } = req.body as z.infer<typeof CreateChannelSchema>;

  const dup = await queryOne(
    `SELECT 1 AS one FROM conversations WHERE workspace_id = $1 AND kind = 'channel' AND name = $2`,
    [workspaceId, name]
  );
  if (dup) { res.status(409).json({ error: `#${name} already exists` }); return; }

  const id = uuidv4();
  await query(
    `INSERT INTO conversations (id, workspace_id, user_id, title, is_shared, kind, name, visibility, created_by)
     VALUES ($1,$2,$3,$4,TRUE,'channel',$5,$6,$3)`,
    [id, workspaceId, userId, `#${name}`, name, visibility]
  );
  await query(
    `INSERT INTO channel_members (id, conversation_id, user_id, role) VALUES ($1,$2,$3,'owner') ON CONFLICT DO NOTHING`,
    [uuidv4(), id, userId]
  );
  // Public channels auto-include all workspace members
  if (visibility === 'public') {
    await query(
      `INSERT INTO channel_members (id, conversation_id, user_id)
       SELECT gen_random_uuid(), $1, wm.user_id FROM workspace_members wm WHERE wm.workspace_id = $2
       ON CONFLICT DO NOTHING`,
      [id, workspaceId]
    );
  }
  res.status(201).json({ data: { id, name, visibility, kind: 'channel' } });
});

// ── Join a public channel ────────────────────────────────────────────
router.post('/:id/join', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const ch = await getChannel(req.params['id'], workspaceId);
  if (!ch || ch.kind !== 'channel' || ch.visibility !== 'public') {
    res.status(403).json({ error: 'Cannot join this channel' });
    return;
  }
  await query(
    `INSERT INTO channel_members (id, conversation_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [uuidv4(), ch.id, userId]
  );
  res.json({ message: 'joined' });
});

// ── Invite to a private channel ──────────────────────────────────────
router.post('/:id/invite', validateBody(InviteSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { user_id } = req.body as z.infer<typeof InviteSchema>;
  const ch = await getChannel(req.params['id'], workspaceId);
  if (!ch || !(await isMember(ch.id, userId))) {
    res.status(403).json({ error: 'Members only' });
    return;
  }
  const inWs = await queryOne(`SELECT 1 AS one FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`, [workspaceId, user_id]);
  if (!inWs) { res.status(404).json({ error: 'User not in workspace' }); return; }
  await query(
    `INSERT INTO channel_members (id, conversation_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [uuidv4(), ch.id, user_id]
  );
  res.json({ message: 'invited' });
});

// ── DM: get-or-create a pairwise channel ─────────────────────────────
router.post('/dm', validateBody(DmSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { user_id } = req.body as z.infer<typeof DmSchema>;
  if (user_id === userId) { res.status(400).json({ error: 'Cannot DM yourself' }); return; }

  const peer = await queryOne<{ id: string; name: string }>(
    `SELECT u.id, u.name FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1 AND u.id = $2`,
    [workspaceId, user_id]
  );
  if (!peer) { res.status(404).json({ error: 'User not in workspace' }); return; }

  const existing = await queryOne<{ id: string }>(
    `SELECT c.id FROM conversations c
     WHERE c.workspace_id = $1 AND c.kind = 'dm'
       AND EXISTS (SELECT 1 FROM channel_members a WHERE a.conversation_id = c.id AND a.user_id = $2)
       AND EXISTS (SELECT 1 FROM channel_members b WHERE b.conversation_id = c.id AND b.user_id = $3)`,
    [workspaceId, userId, user_id]
  );
  if (existing) { res.json({ data: { id: existing.id, kind: 'dm', peer_name: peer.name } }); return; }

  const id = uuidv4();
  await query(
    `INSERT INTO conversations (id, workspace_id, user_id, title, kind, name, visibility, created_by)
     VALUES ($1,$2,$3,$4,'dm',NULL,'private',$3)`,
    [id, workspaceId, userId, `DM ${peer.name}`]
  );
  await query(
    `INSERT INTO channel_members (id, conversation_id, user_id) VALUES ($1,$2,$3),($4,$2,$5) ON CONFLICT DO NOTHING`,
    [uuidv4(), id, userId, uuidv4(), user_id]
  );
  res.status(201).json({ data: { id, kind: 'dm', peer_name: peer.name } });
});

// ── Channel messages ─────────────────────────────────────────────────
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const ch = await getChannel(req.params['id'], workspaceId);
  if (!ch || !(await canRead(ch, ch.id, userId))) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  const after = req.query['after'] as string | undefined;
  const baseSql = `SELECT m.id, m.role, m.content, m.user_id, m.metadata, m.created_at,
          u.name AS author_name, u.email AS author_email,
          (SELECT COALESCE(json_agg(json_build_object('emoji', e.emoji, 'count', e.cnt, 'mine', e.mine)), '[]')
           FROM (SELECT r.emoji, COUNT(*)::int AS cnt, BOOL_OR(r.user_id = $2) AS mine
                 FROM message_reactions r WHERE r.message_id = m.id GROUP BY r.emoji) e) AS reactions
   FROM messages m LEFT JOIN users u ON u.id = m.user_id
   WHERE m.conversation_id = $1`;

  const messages = after
    ? await query(`${baseSql} AND m.created_at > $3 ORDER BY m.created_at ASC LIMIT 200`, [ch.id, userId, after])
    : await query(`${baseSql} ORDER BY m.created_at ASC LIMIT 200`, [ch.id, userId]);

  // Mark channel read for me
  await query(
    `INSERT INTO channel_members (id, conversation_id, user_id, last_read_at) VALUES ($1,$2,$3,NOW())
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
    [uuidv4(), ch.id, userId]
  );

  res.json({ data: messages });
});

router.post('/:id/messages', aiRateLimiter, validateBody(SendSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { content } = req.body as z.infer<typeof SendSchema>;

  const ch = await getChannel(req.params['id'], workspaceId);
  if (!ch || !(await canRead(ch, ch.id, userId))) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  // Posting into a private/dm channel requires membership; public is open
  if (ch.visibility === 'private' && !(await isMember(ch.id, userId))) {
    res.status(403).json({ error: 'Members only' });
    return;
  }

  const mentions = await resolveMentions(content, workspaceId, userId);
  const brainTagged = BRAIN_TAG.test(content);

  const messageId = uuidv4();
  await query(
    `INSERT INTO messages (id, conversation_id, role, content, user_id, metadata)
     VALUES ($1, $2, 'user', $3, $4, $5)`,
    [messageId, ch.id, content, userId, JSON.stringify({ mentions })]
  );
  // Mention inbox rows + grant access so tagged users can open the conversation
  await insertMentionRows(ch.id, messageId, mentions);
  for (const m of mentions) {
    await query(
      `INSERT INTO channel_members (id, conversation_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [uuidv4(), ch.id, m.user_id]
    );
  }
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [ch.id]);
  await query(
    `INSERT INTO channel_members (id, conversation_id, user_id, last_read_at) VALUES ($1,$2,$3,NOW())
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
    [uuidv4(), ch.id, userId]
  );

  if (!brainTagged) {
    res.json({ data: { messageId, content: '', toolCallCount: 0, status: 'stored', no_reply: true } });
    return;
  }

  const result = await executeAgent({
    conversationId: ch.id,
    userId,
    workspaceId,
    userMessage: content,
    skipUserInsert: true,
  });
  res.json({ data: { ...result, userMessageId: messageId } });
});

// ── Reactions (toggle) ───────────────────────────────────────────────
const ReactionSchema = z.object({ emoji: z.string().min(1).max(16) });

router.post('/:id/messages/:msgId/reactions', validateBody(ReactionSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { emoji } = req.body as z.infer<typeof ReactionSchema>;
  const ch = await getChannel(req.params['id'], workspaceId);
  if (!ch || !(await canRead(ch, ch.id, userId))) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  const msg = await queryOne<{ id: string }>(
    `SELECT id FROM messages WHERE id = $1 AND conversation_id = $2 AND role != 'tool'`,
    [req.params['msgId'], ch.id]
  );
  if (!msg) { res.status(404).json({ error: 'Message not found' }); return; }

  const existing = await queryOne(
    `SELECT id FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [msg.id, userId, emoji]
  );
  if (existing) {
    await query(`DELETE FROM message_reactions WHERE id = $1`, [existing.id]);
    res.json({ data: { added: false, emoji } });
  } else {
    await query(
      `INSERT INTO message_reactions (id, message_id, user_id, emoji) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [uuidv4(), msg.id, userId, emoji]
    );
    res.json({ data: { added: true, emoji } });
  }
});

// ── Delete own message ───────────────────────────────────────────────
router.delete('/:id/messages/:msgId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const ch = await getChannel(req.params['id'], workspaceId);
  if (!ch || !(await canRead(ch, ch.id, userId))) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  const msg = await queryOne<{ role: string; user_id: string | null }>(
    `SELECT role, user_id FROM messages WHERE id = $1 AND conversation_id = $2`,
    [req.params['msgId'], ch.id]
  );
  if (!msg) { res.status(404).json({ error: 'Message not found' }); return; }
  if (msg.role !== 'user' || msg.user_id !== userId) {
    res.status(403).json({ error: 'You can only delete your own messages' });
    return;
  }
  await query(`DELETE FROM messages WHERE id = $1`, [req.params['msgId']]);
  res.json({ message: 'Message deleted' });
});

export default router;
