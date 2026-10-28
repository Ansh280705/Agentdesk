import { Router, Response } from 'express';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10));
  const perPage = Math.min(50, parseInt(req.query['per_page'] as string || '20', 10));
  const offset = (page - 1) * perPage;
  const status = req.query['status'] as string;

  const conditions = ['workspace_id = $1', 'user_id = $2'];
  const params: unknown[] = [workspaceId, userId];

  if (status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(status);
  }

  const where = conditions.join(' AND ');
  params.push(perPage, offset);

  const [tasks, countRow] = await Promise.all([
    query(
      `SELECT id, type, status, error, created_at, started_at, completed_at,
              EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - COALESCE(started_at, created_at)))::int AS duration_seconds
       FROM tasks WHERE ${where}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM tasks WHERE ${conditions.slice(0, conditions.length - (status ? 0 : 0)).join(' AND ')}`,
      [workspaceId, userId, ...(status ? [status] : [])]
    ),
  ]);

  res.json({ data: tasks, total: countRow?.count ?? 0, page, per_page: perPage });
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const task = await queryOne(
    `SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const events = await query(
    `SELECT id, event_type, data, created_at FROM task_events WHERE task_id = $1 ORDER BY created_at ASC`,
    [req.params['id']]
  );

  res.json({ data: { ...task, events } });
});

router.post('/:id/cancel', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const updated = await queryOne(
    `UPDATE tasks SET status = 'cancelled', completed_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND user_id = $3
       AND status IN ('queued', 'running')
     RETURNING id, status`,
    [req.params['id'], workspaceId, userId]
  );
  if (!updated) {
    res.status(404).json({ error: 'Task not found or cannot be cancelled' });
    return;
  }
  res.json({ data: updated });
});

router.post('/:id/retry', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const task = await queryOne<{ type: string; input: Record<string, unknown> }>(
    `SELECT type, input FROM tasks WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND status = 'failed'`,
    [req.params['id'], workspaceId, userId]
  );
  if (!task) {
    res.status(404).json({ error: 'Task not found or not in failed state' });
    return;
  }

  // Reset to queued
  const updated = await queryOne(
    `UPDATE tasks SET status = 'queued', error = NULL, started_at = NULL, completed_at = NULL
     WHERE id = $1 RETURNING id, status`,
    [req.params['id']]
  );

  res.json({ data: updated });
});

export default router;
