import { Router, Response } from 'express';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;

  const [
    recentConversations,
    recentTasks,
    recentArtifacts,
    agentCount,
    dataSourceCount,
    knowledgeCount,
    usageThisMonth,
  ] = await Promise.all([
    query(
      `SELECT c.id, c.title, c.agent_id, c.updated_at,
              COUNT(m.id)::int AS message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.workspace_id = $1 AND c.user_id = $2
       GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 5`,
      [workspaceId, userId]
    ),
    query(
      `SELECT id, type, status, created_at FROM tasks
       WHERE workspace_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 5`,
      [workspaceId, userId]
    ),
    query(
      `SELECT id, name, type, created_at FROM artifacts
       WHERE workspace_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 5`,
      [workspaceId, userId]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM agents WHERE workspace_id = $1 AND user_id = $2 AND is_enabled = TRUE`,
      [workspaceId, userId]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM data_sources WHERE workspace_id = $1 AND user_id = $2 AND status = 'connected'`,
      [workspaceId, userId]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM knowledge_documents WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    ),
    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM usage_records
       WHERE user_id = $1 AND workspace_id = $2
         AND created_at >= date_trunc('month', NOW())`,
      [userId, workspaceId]
    ),
  ]);

  res.json({
    data: {
      recent_conversations: recentConversations,
      recent_tasks: recentTasks,
      recent_artifacts: recentArtifacts,
      stats: {
        active_agents: agentCount?.count ?? 0,
        connected_sources: dataSourceCount?.count ?? 0,
        knowledge_documents: knowledgeCount?.count ?? 0,
        messages_this_month: usageThisMonth?.count ?? 0,
      },
    },
  });
});

export default router;
