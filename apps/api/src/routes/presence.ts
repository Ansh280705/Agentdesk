/**
 * Presence + typing — in-memory only (pings expire fast; no DB rows needed).
 * POST /api/presence/heartbeat         → marks caller online, returns online users
 * GET  /api/presence/typing/:channelId → who is typing in a channel
 */
import { Router, Response } from 'express';
import { queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

interface Ping { wsId: string; name: string; at: number }
interface TypePing { userId: string; name: string; at: number }

const online = new Map<string, Ping>();           // userId -> last heartbeat
const typing = new Map<string, TypePing>();       // `${channelId}:${userId}` -> last typing ping
const ONLINE_MS = 45_000;
const TYPING_MS = 6_000;

router.post('/heartbeat', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const user = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [userId]);
  online.set(userId, { wsId: workspaceId, name: user?.name ?? 'User', at: Date.now() });

  const now = Date.now();
  const users = [...online.entries()]
    .filter(([, v]) => v.wsId === workspaceId && now - v.at < ONLINE_MS)
    .map(([id, v]) => ({ id, name: v.name }));
  res.json({ data: users });
});

// Who is typing in a channel (excluding me)
router.get('/typing/:channelId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const channelId = req.params['channelId'];
  const now = Date.now();
  const names = [...typing.entries()]
    .filter(([k, v]) => k.startsWith(`${channelId}:`) && !k.endsWith(`:${userId}`) && now - v.at < TYPING_MS && v.name)
    .map(([, v]) => v.name);
  void workspaceId;
  res.json({ data: names });
});

router.post('/typing/:channelId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const user = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [userId]);
  typing.set(`${req.params['channelId']}:${userId}`, { userId, name: user?.name ?? 'User', at: Date.now() });
  void workspaceId;
  res.json({ ok: true });
});

export default router;
