import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const RenameSchema = z.object({ name: z.string().min(1).max(200) });

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10));
  const perPage = Math.min(50, parseInt(req.query['per_page'] as string || '20', 10));
  const offset = (page - 1) * perPage;

  const [artifacts, countRow] = await Promise.all([
    query(
      `SELECT id, name, type, mime_type, size_bytes, conversation_id, created_at
       FROM artifacts
       WHERE workspace_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [workspaceId, userId, perPage, offset]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM artifacts WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    ),
  ]);

  res.json({ data: artifacts, total: countRow?.count ?? 0, page, per_page: perPage });
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const artifact = await queryOne(
    `SELECT * FROM artifacts WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  res.json({ data: artifact });
});

router.get('/:id/download', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const artifact = await queryOne<{ name: string; mime_type: string; content: string }>(
    `SELECT name, mime_type, content FROM artifacts WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  res.setHeader('Content-Type', artifact.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${artifact.name}"`);
  res.send(artifact.content);
});

router.patch('/:id', validateBody(RenameSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { name } = req.body as z.infer<typeof RenameSchema>;

  const updated = await queryOne(
    `UPDATE artifacts SET name = $1 WHERE id = $2 AND workspace_id = $3 AND user_id = $4 RETURNING id, name`,
    [name, req.params['id'], workspaceId, userId]
  );
  if (!updated) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  res.json({ data: updated });
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const deleted = await queryOne(
    `DELETE FROM artifacts WHERE id = $1 AND workspace_id = $2 AND user_id = $3 RETURNING id`,
    [req.params['id'], workspaceId, userId]
  );
  if (!deleted) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  res.json({ message: 'Artifact deleted' });
});

export default router;
