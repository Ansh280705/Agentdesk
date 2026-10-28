import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { registry } from '../tools/registry';

const router = Router();
router.use(authenticate);

const AgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  system_prompt: z.string().max(10000).optional().default(''),
  model: z.string().max(100).optional().default('llama-3.3-70b-versatile'),
  allowed_tools: z.array(z.string()).optional().default([]),
  max_tool_calls: z.number().int().min(1).max(50).optional().default(10),
  max_iterations: z.number().int().min(1).max(20).optional().default(5),
  requires_approval: z.boolean().optional().default(false),
  is_enabled: z.boolean().optional().default(true),
});

// List available tools
router.get('/tools', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  const tools = registry.list().map((t) => ({
    name: t.name,
    description: t.description,
  }));
  res.json({ data: tools });
});

// List agents
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const agents = await query(
    `SELECT id, name, description, model, allowed_tools, is_enabled, is_template, template_type,
            max_tool_calls, max_iterations, requires_approval, created_at, updated_at
     FROM agents
     WHERE workspace_id = $1 AND user_id = $2
     ORDER BY is_template DESC, created_at ASC`,
    [workspaceId, userId]
  );
  res.json({ data: agents });
});

// Get single agent
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const agent = await queryOne(
    `SELECT * FROM agents WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ data: agent });
});

// Create agent
router.post('/', validateBody(AgentSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const body = req.body as z.infer<typeof AgentSchema>;

  const id = uuidv4();
  await query(
    `INSERT INTO agents (id, workspace_id, user_id, name, description, system_prompt, model,
                         allowed_tools, max_tool_calls, max_iterations, requires_approval, is_enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, workspaceId, userId, body.name, body.description, body.system_prompt,
      body.model, body.allowed_tools, body.max_tool_calls, body.max_iterations,
      body.requires_approval, body.is_enabled,
    ]
  );

  const agent = await queryOne(`SELECT * FROM agents WHERE id = $1`, [id]);
  res.status(201).json({ data: agent });
});

// Update agent
router.put('/:id', validateBody(AgentSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const body = req.body as z.infer<typeof AgentSchema>;

  const updated = await queryOne(
    `UPDATE agents SET name=$1, description=$2, system_prompt=$3, model=$4,
                       allowed_tools=$5, max_tool_calls=$6, max_iterations=$7,
                       requires_approval=$8, is_enabled=$9, updated_at=NOW()
     WHERE id=$10 AND workspace_id=$11 AND user_id=$12
     RETURNING *`,
    [
      body.name, body.description, body.system_prompt, body.model,
      body.allowed_tools, body.max_tool_calls, body.max_iterations,
      body.requires_approval, body.is_enabled,
      req.params['id'], workspaceId, userId,
    ]
  );

  if (!updated) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ data: updated });
});

// Toggle enabled
router.patch('/:id/toggle', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const updated = await queryOne(
    `UPDATE agents SET is_enabled = NOT is_enabled, updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2 AND user_id = $3
     RETURNING id, name, is_enabled`,
    [req.params['id'], workspaceId, userId]
  );
  if (!updated) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ data: updated });
});

// Duplicate agent
router.post('/:id/duplicate', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;

  const original = await queryOne<{
    name: string; description: string; system_prompt: string; model: string;
    allowed_tools: string[]; max_tool_calls: number; max_iterations: number;
    requires_approval: boolean;
  }>(
    `SELECT * FROM agents WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );

  if (!original) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  const newId = uuidv4();
  await query(
    `INSERT INTO agents (id, workspace_id, user_id, name, description, system_prompt, model,
                         allowed_tools, max_tool_calls, max_iterations, requires_approval)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      newId, workspaceId, userId,
      `${original.name} (Copy)`, original.description, original.system_prompt,
      original.model, original.allowed_tools, original.max_tool_calls,
      original.max_iterations, original.requires_approval,
    ]
  );

  const agent = await queryOne(`SELECT * FROM agents WHERE id = $1`, [newId]);
  res.status(201).json({ data: agent });
});

// Delete agent
router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const deleted = await queryOne(
    `DELETE FROM agents WHERE id = $1 AND workspace_id = $2 AND user_id = $3 RETURNING id`,
    [req.params['id'], workspaceId, userId]
  );
  if (!deleted) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ message: 'Agent deleted' });
});

export default router;
