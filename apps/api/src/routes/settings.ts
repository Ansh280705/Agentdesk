import { Router, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const PreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  default_model: z.string().max(100).optional(),
  sidebar_collapsed: z.boolean().optional(),
});

const ProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

router.get('/preferences', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const prefs = await queryOne(
    `SELECT theme, default_model, sidebar_collapsed FROM user_preferences WHERE user_id = $1`,
    [req.user!.userId]
  );
  res.json({ data: prefs ?? { theme: 'system', default_model: 'llama-3.3-70b-versatile', sidebar_collapsed: false } });
});

router.patch('/preferences', validateBody(PreferencesSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId } = req.user!;
  const updates = req.body as z.infer<typeof PreferencesSchema>;

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (updates.theme !== undefined) { fields.push(`theme=$${i++}`); values.push(updates.theme); }
  if (updates.default_model !== undefined) { fields.push(`default_model=$${i++}`); values.push(updates.default_model); }
  if (updates.sidebar_collapsed !== undefined) { fields.push(`sidebar_collapsed=$${i++}`); values.push(updates.sidebar_collapsed); }

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(userId);
  await query(
    `INSERT INTO user_preferences (user_id) VALUES ($${i}) ON CONFLICT (user_id) DO UPDATE SET ${fields.join(', ')}, updated_at = NOW()`,
    values
  );

  const prefs = await queryOne(`SELECT theme, default_model, sidebar_collapsed FROM user_preferences WHERE user_id = $1`, [userId]);
  res.json({ data: prefs });
});

router.patch('/profile', validateBody(ProfileSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name } = req.body as z.infer<typeof ProfileSchema>;
  const updated = await queryOne(
    `UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email`,
    [name, req.user!.userId]
  );
  res.json({ data: updated });
});

router.get('/activity', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const logs = await query(
    `SELECT action, resource_type, resource_id, created_at FROM audit_logs
     WHERE user_id = $1 AND workspace_id = $2
     ORDER BY created_at DESC LIMIT 50`,
    [userId, workspaceId]
  );
  res.json({ data: logs });
});

router.delete('/account', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  // Require explicit confirmation body
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== 'DELETE MY ACCOUNT') {
    res.status(400).json({ error: 'Send { "confirm": "DELETE MY ACCOUNT" } to confirm deletion' });
    return;
  }

  // Cascade deletes handle children via FK
  await query(`DELETE FROM users WHERE id = $1`, [req.user!.userId]);
  res.json({ message: 'Account deleted' });
});

export default router;
