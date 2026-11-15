/**
 * Shared workspace room — a single conversation every workspace member can
 * read and post to. Users mention each other with @name; @brain triggers the AI.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { executeAgent } from '../agents/engine';
import { aiRateLimiter } from '../middleware/rateLimiter';

const router = Router();
router.use(authenticate);

const SendSchema = z.object({
  content: z.string().min(1).max(20000),
});

const BRAIN_TAG = /@brain\b/i;

interface MemberRow {
  id: string;
  name: string;
  email: string;
}

async function getRoom(workspaceId: string) {
  return queryOne<{ id: string; title: string; is_shared: boolean }>(
    `SELECT id, title, is_shared FROM conversations
     WHERE workspace_id = $1 AND is_shared = TRUE
     ORDER BY created_at ASC LIMIT 1`,
    [workspaceId]
  );
}

async function getMembers(workspaceId: string): Promise<MemberRow[]> {
  return query<MemberRow>(
    `SELECT u.id, u.name, u.email
     FROM workspace_members wm JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY u.name`,
    [workspaceId]
  );
}

// Mention handle for a user: first-name-slug (e.g. "Ansh Rathore" -> ansh), fallback to email prefix
function handleFor(m: MemberRow): string {
  const base = (m.name?.split(/\s+/)[0] || m.email.split('@')[0] || m.id.slice(0, 6)).toLowerCase();
  return base.replace(/[^a-z0-9_]/g, '') || m.id.slice(0, 6);
}

/** Parse @mentions from message text, matching workspace member handles. */
function parseMentions(content: string, members: MemberRow[]): Array<{ user_id: string; handle: string; name: string }> {
  const found = new Map<string, { user_id: string; handle: string; name: string }>();
  for (const m of members) {
    const handle = handleFor(m);
    if (new RegExp(`@${handle}\\b`, 'i').test(content)) {
      found.set(m.id, { user_id: m.id, handle, name: m.name });
    }
  }
  return Array.from(found.values());
}

// Get (or lazily create) the shared room for this workspace
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;

  let room = await getRoom(workspaceId);
  if (!room) {
    const id = uuidv4();
    await query(
      `INSERT INTO conversations (id, workspace_id, user_id, title, is_shared)
       VALUES ($1, $2, $3, 'Workspace Room', TRUE)`,
      [id, workspaceId, userId]
    );
    room = await getRoom(workspaceId);
  }

  res.json({ data: room });
});

// Members for the @ mention picker (plus the @brain bot pseudo-member)
router.get('/members', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { workspaceId } = req.user!;
  const members = await getMembers(workspaceId);
  res.json({
    data: [
      { id: 'brain', name: 'Brain', handle: 'brain', is_bot: true },
      ...members.map((m) => ({ id: m.id, name: m.name, email: m.email, handle: handleFor(m), is_bot: false })),
    ],
  });
});

// Room messages (paginated, newest last)
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { workspaceId } = req.user!;
  const after = req.query['after'] as string | undefined;

  const room = await getRoom(workspaceId);
  if (!room || room.id !== req.params['id']) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const baseSql = `SELECT m.id, m.role, m.content, m.user_id, m.metadata, m.created_at,
            u.name AS author_name, u.email AS author_email
     FROM messages m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = $1`;

  const messages = after
    ? await query(`${baseSql} AND m.created_at > $2 ORDER BY m.created_at ASC LIMIT 200`, [room.id, after])
    : await query(`${baseSql} ORDER BY m.created_at ASC LIMIT 200`, [room.id]);

  res.json({ data: messages });
});

// Post a message to the room. @brain triggers the agent; otherwise stored only.
router.post('/:id/messages', aiRateLimiter, validateBody(SendSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { content } = req.body as z.infer<typeof SendSchema>;

  const room = await getRoom(workspaceId);
  if (!room || room.id !== req.params['id']) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  const members = await getMembers(workspaceId);
  const mentions = parseMentions(content, members);
  const brainTagged = BRAIN_TAG.test(content);

  // Always store the user's message with author + mention metadata
  const messageId = uuidv4();
  await query(
    `INSERT INTO messages (id, conversation_id, role, content, user_id, metadata)
     VALUES ($1, $2, 'user', $3, $4, $5)`,
    [messageId, room.id, content, userId, JSON.stringify({ mentions })]
  );
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [room.id]);

  // @brain not tagged → store only, zero AI calls
  if (!brainTagged) {
    res.json({ data: { messageId, content: '', toolCallCount: 0, status: 'stored', no_reply: true } });
    return;
  }

  // @brain tagged → run the agent; its reply lands in the shared room
  const result = await executeAgent({
    conversationId: room.id,
    userId,
    workspaceId,
    userMessage: content,
    skipUserInsert: true,
  });

  res.json({ data: { ...result, userMessageId: messageId } });
});

export default router;
