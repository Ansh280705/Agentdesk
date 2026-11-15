/**
 * Workspace invites — shareable join links.
 * POST /api/invites            → create invite (auth)
 * GET  /api/invites            → list my workspace's invites (auth)
 * GET  /api/invites/:code/info → public preview (shows workspace name on register)
 */
import { Router, Response } from 'express';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';

const router = Router();

// Public: peek at a workspace behind an invite code (for the register page)
router.get('/:code/info', async (req, res: Response): Promise<void> => {
  const invite = await queryOne<{ workspace_name: string }>(
    `SELECT w.name AS workspace_name
     FROM workspace_invites wi JOIN workspaces w ON w.id = wi.workspace_id
     WHERE wi.code = $1
       AND (wi.expires_at IS NULL OR wi.expires_at > NOW())
       AND (wi.max_uses IS NULL OR wi.use_count < wi.max_uses)`,
    [req.params['code']]
  );
  if (!invite) { res.status(404).json({ error: 'Invalid or expired invite' }); return; }
  res.json({ data: { workspace_name: invite.workspace_name } });
});

router.use(authenticate);

// Create an invite link for my workspace
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const code = randomBytes(6).toString('hex'); // 12-char code
  const id = uuidv4();
  await query(
    `INSERT INTO workspace_invites (id, workspace_id, code, created_by) VALUES ($1,$2,$3,$4)`,
    [id, workspaceId, code, userId]
  );
  res.status(201).json({ data: { id, code, url: `${code}` } });
});

// List active invites for my workspace
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { workspaceId } = req.user!;
  const invites = await query(
    `SELECT i.id, i.code, i.use_count, i.max_uses, i.expires_at, i.created_at, u.name AS created_by_name
     FROM workspace_invites i JOIN users u ON u.id = i.created_by
     WHERE i.workspace_id = $1
     ORDER BY i.created_at DESC LIMIT 20`,
    [workspaceId]
  );
  res.json({ data: invites });
});

export default router;
