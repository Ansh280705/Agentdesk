import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/auth';
import { queryOne } from '../database/pool';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    // If user's workspace in token does not match an active workspace or is stale, resolve from workspace_members
    const memberWs = await queryOne<{ workspace_id: string }>(
      `SELECT wm.workspace_id
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY (wm.workspace_id = '4aab8669-02a4-440e-b95c-b349f016c977') DESC, (wm.workspace_id = $2) DESC, (wm.role = 'owner') DESC, wm.created_at ASC
       LIMIT 1`,
      [payload.userId, payload.workspaceId]
    );

    if (memberWs?.workspace_id) {
      payload.workspaceId = memberWs.workspace_id;
    }
  } catch (err) {
    // Non-fatal
  }

  req.user = payload;
  next();
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      try {
        const memberWs = await queryOne<{ workspace_id: string }>(
          `SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = $1 LIMIT 1`,
          [payload.userId]
        );
        if (memberWs?.workspace_id) {
          payload.workspaceId = memberWs.workspace_id;
        }
      } catch {}
      req.user = payload;
    }
  }

  next();
}
