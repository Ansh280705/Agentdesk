import { Router, Request, Response } from 'express';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { signToken, hashToken } from '../utils/auth';
import { validateBody } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimiter';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', authRateLimiter, validateBody(RegisterSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, name, password } = req.body as z.infer<typeof RegisterSchema>;

  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await argon2.hash(password);
  const userId = uuidv4();
  const workspaceId = uuidv4();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${userId.slice(0, 6)}`;

  // Create user, workspace, preferences in a transaction
  await query('BEGIN');
  try {
    await query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
      [userId, email.toLowerCase(), name, passwordHash]
    );
    await query(
      `INSERT INTO workspaces (id, name, slug, owner_id) VALUES ($1, $2, $3, $4)`,
      [workspaceId, `${name}'s Workspace`, slug, userId]
    );
    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceId, userId]
    );
    await query(`INSERT INTO user_preferences (user_id) VALUES ($1)`, [userId]);
    await query('COMMIT');
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }

  const token = signToken({ userId, email: email.toLowerCase(), workspaceId });

  // Audit log
  await query(
    `INSERT INTO audit_logs (user_id, workspace_id, action, resource_type)
     VALUES ($1, $2, 'user.register', 'user')`,
    [userId, workspaceId]
  ).catch(() => {/* non-fatal */});

  res.status(201).json({
    token,
    user: { id: userId, email: email.toLowerCase(), name },
    workspace: { id: workspaceId },
  });
});

router.post('/login', authRateLimiter, validateBody(LoginSchema), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as z.infer<typeof LoginSchema>;

  const user = await queryOne<{ id: string; email: string; name: string; password_hash: string }>(
    `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const workspace = await queryOne<{ id: string }>(
    `SELECT id FROM workspaces WHERE owner_id = $1 LIMIT 1`,
    [user.id]
  );

  const workspaceId = workspace?.id ?? uuidv4();
  const token = signToken({ userId: user.id, email: user.email, workspaceId });

  await query(
    `INSERT INTO audit_logs (user_id, workspace_id, action, resource_type)
     VALUES ($1, $2, 'user.login', 'user')`,
    [user.id, workspaceId]
  ).catch(() => {});

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: workspaceId },
  });
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const user = await queryOne<{ id: string; email: string; name: string; avatar_url: string; created_at: string }>(
    `SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1`,
    [userId]
  );

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const prefs = await queryOne<{ theme: string; default_model: string; sidebar_collapsed: boolean }>(
    `SELECT theme, default_model, sidebar_collapsed FROM user_preferences WHERE user_id = $1`,
    [userId]
  );

  res.json({ user, preferences: prefs ?? { theme: 'system', default_model: 'llama-3.3-70b-versatile', sidebar_collapsed: false } });
});

router.post('/logout', authenticate, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  // JWT is stateless; client drops the token
  res.json({ message: 'Logged out successfully' });
});

export default router;
