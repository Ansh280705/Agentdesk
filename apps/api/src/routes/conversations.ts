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

const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  agent_id: z.string().uuid().optional(),
});

const RenameSchema = z.object({ title: z.string().min(1).max(200) });

const SendMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  agent_id: z.string().uuid().optional(),
});

// List conversations (paginated)
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10));
  const perPage = Math.min(50, parseInt(req.query['per_page'] as string || '20', 10));
  const offset = (page - 1) * perPage;

  const [conversations, countRow] = await Promise.all([
    query<{ id: string; title: string; agent_id: string; created_at: string; updated_at: string; message_count: number }>(
      `SELECT c.id, c.title, c.agent_id, c.created_at, c.updated_at,
              COUNT(m.id)::int AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.workspace_id = $1 AND c.user_id = $2
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT $3 OFFSET $4`,
      [workspaceId, userId, perPage, offset]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM conversations WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    ),
  ]);

  const total = countRow?.count ?? 0;
  res.json({
    data: conversations,
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  });
});

// Create conversation
router.post('/', validateBody(CreateConversationSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { title, agent_id } = req.body as z.infer<typeof CreateConversationSchema>;

  const id = uuidv4();
  await query(
    `INSERT INTO conversations (id, workspace_id, user_id, agent_id, title)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, workspaceId, userId, agent_id ?? null, title ?? 'New Conversation']
  );

  const conv = await queryOne(
    `SELECT id, title, agent_id, created_at, updated_at FROM conversations WHERE id = $1`,
    [id]
  );
  res.status(201).json({ data: conv });
});

// Get single conversation
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;

  const conv = await queryOne(
    `SELECT id, title, agent_id, created_at, updated_at
     FROM conversations WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );

  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json({ data: conv });
});

// Rename conversation
router.patch('/:id', validateBody(RenameSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { title } = req.body as z.infer<typeof RenameSchema>;

  const updated = await queryOne(
    `UPDATE conversations SET title = $1, updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3 AND user_id = $4
     RETURNING id, title, updated_at`,
    [title, req.params['id'], workspaceId, userId]
  );

  if (!updated) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json({ data: updated });
});

// Delete conversation
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;

  const deleted = await queryOne(
    `DELETE FROM conversations WHERE id = $1 AND workspace_id = $2 AND user_id = $3 RETURNING id`,
    [req.params['id'], workspaceId, userId]
  );

  if (!deleted) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  res.json({ message: 'Conversation deleted' });
});

// Get messages
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10));
  const perPage = Math.min(100, parseInt(req.query['per_page'] as string || '50', 10));
  const offset = (page - 1) * perPage;

  const conv = await queryOne(
    `SELECT id FROM conversations WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );

  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const [messages, countRow] = await Promise.all([
    query(
      `SELECT id, role, content, tool_calls, tool_call_id, tool_name, metadata, feedback, created_at
       FROM messages WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [req.params['id'], perPage, offset]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1`,
      [req.params['id']]
    ),
  ]);

  res.json({
    data: messages,
    total: countRow?.count ?? 0,
    page,
    per_page: perPage,
  });
});

// Send message (triggers agent)
router.post('/:id/messages', aiRateLimiter, validateBody(SendMessageSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { content, agent_id } = req.body as z.infer<typeof SendMessageSchema>;

  const conv = await queryOne<{ id: string; agent_id: string }>(
    `SELECT id, agent_id FROM conversations WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );

  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const effectiveAgentId = agent_id ?? conv.agent_id ?? undefined;

  const result = await executeAgent({
    conversationId: conv.id,
    userId,
    workspaceId,
    agentId: effectiveAgentId,
    userMessage: content,
  });

  res.json({ data: result });
});

// Message feedback
router.post('/:id/messages/:msgId/feedback', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { feedback } = req.body as { feedback: 'up' | 'down' };

  if (!['up', 'down'].includes(feedback)) {
    res.status(400).json({ error: 'feedback must be "up" or "down"' });
    return;
  }

  // Verify ownership
  const conv = await queryOne(
    `SELECT id FROM conversations WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  await query(
    `UPDATE messages SET feedback = $1 WHERE id = $2 AND conversation_id = $3`,
    [feedback, req.params['msgId'], req.params['id']]
  );

  res.json({ message: 'Feedback recorded' });
});

export default router;
