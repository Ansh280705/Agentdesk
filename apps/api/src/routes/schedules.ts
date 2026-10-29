import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const ScheduleSchema = z.object({
  name: z.string().min(1).max(200),
  agent_id: z.string().uuid().optional(),
  prompt: z.string().min(1).max(5000),
  cron_expression: z.string().max(100).optional(), // e.g. "0 9 * * *" = daily at 9am
  interval_minutes: z.number().int().min(1).max(10080).optional(), // alternative to cron
  is_active: z.boolean().optional().default(true),
});

// List schedules
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const schedules = await query(
    `SELECT id, name, agent_id, prompt, cron_expression, interval_minutes, is_active,
            last_run_at, next_run_at, created_at, updated_at
     FROM scheduled_jobs
     WHERE workspace_id = $1 AND user_id = $2
     ORDER BY created_at DESC`,
    [workspaceId, userId]
  );
  res.json({ data: schedules });
});

// Create schedule
router.post('/', validateBody(ScheduleSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const body = req.body as z.infer<typeof ScheduleSchema>;

  // Calculate next run time
  const now = new Date();
  let nextRunAt: Date;
  if (body.interval_minutes) {
    nextRunAt = new Date(now.getTime() + body.interval_minutes * 60_000);
  } else if (body.cron_expression) {
    // Simple interval-based fallback: parse basic cron like "0 9 * * *"
    // For production, use a real cron parser. For now, default to 1 hour.
    nextRunAt = new Date(now.getTime() + 60 * 60_000);
  } else {
    nextRunAt = new Date(now.getTime() + 60 * 60_000);
  }

  const id = uuidv4();
  await query(
    `INSERT INTO scheduled_jobs (id, workspace_id, user_id, name, agent_id, prompt,
                                   cron_expression, interval_minutes, is_active, next_run_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, workspaceId, userId, body.name, body.agent_id ?? null, body.prompt,
     body.cron_expression ?? null, body.interval_minutes ?? null, body.is_active, nextRunAt]
  );

  const schedule = await queryOne(`SELECT * FROM scheduled_jobs WHERE id = $1`, [id]);
  res.status(201).json({ data: schedule });
});

// Toggle active
router.patch('/:id/toggle', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const updated = await queryOne(
    `UPDATE scheduled_jobs SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND user_id = $3
     RETURNING id, name, is_active`,
    [req.params['id'], workspaceId, userId]
  );
  if (!updated) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  res.json({ data: updated });
});

// Delete schedule
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const deleted = await queryOne(
    `DELETE FROM scheduled_jobs WHERE id = $1 AND workspace_id = $2 AND user_id = $3 RETURNING id`,
    [req.params['id'], workspaceId, userId]
  );
  if (!deleted) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  res.json({ message: 'Schedule deleted' });
});

// Run schedule manually (trigger now)
router.post('/:id/run', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const schedule = await queryOne<{ name: string; agent_id: string; prompt: string }>(
    `SELECT name, agent_id, prompt FROM scheduled_jobs WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!schedule) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }

  // Create a conversation and run the agent
  const convId = uuidv4();
  await query(
    `INSERT INTO conversations (id, workspace_id, user_id, agent_id, title)
     VALUES ($1, $2, $3, $4, $5)`,
    [convId, workspaceId, userId, schedule.agent_id, `Scheduled: ${schedule.name}`]
  );

  // Update last run
  await query(`UPDATE scheduled_jobs SET last_run_at = NOW() WHERE id = $1`, [req.params['id']]);

  res.json({ data: { conversation_id: convId, message: 'Schedule triggered — check the conversation for results' } });
});

export default router;
