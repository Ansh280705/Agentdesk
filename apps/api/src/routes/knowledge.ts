import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const DocSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string().max(100000),
  type: z.enum(['note', 'document', 'procedure', 'fact']).optional().default('note'),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
});

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const page = Math.max(1, parseInt(req.query['page'] as string || '1', 10));
  const perPage = Math.min(50, parseInt(req.query['per_page'] as string || '20', 10));
  const offset = (page - 1) * perPage;
  const search = req.query['q'] as string;

  let rows, countRow;

  if (search) {
    [rows, countRow] = await Promise.all([
      query(
        `SELECT id, title, type, tags,
                LEFT(content, 200) AS excerpt,
                ts_rank(search_vector, plainto_tsquery('english', $1)) AS rank,
                created_at, updated_at
         FROM knowledge_documents
         WHERE workspace_id = $2 AND user_id = $3
           AND search_vector @@ plainto_tsquery('english', $1)
         ORDER BY rank DESC LIMIT $4 OFFSET $5`,
        [search, workspaceId, userId, perPage, offset]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM knowledge_documents
         WHERE workspace_id = $1 AND user_id = $2
           AND search_vector @@ plainto_tsquery('english', $3)`,
        [workspaceId, userId, search]
      ),
    ]);
  } else {
    [rows, countRow] = await Promise.all([
      query(
        `SELECT id, title, type, tags, LEFT(content, 200) AS excerpt, created_at, updated_at
         FROM knowledge_documents
         WHERE workspace_id = $1 AND user_id = $2
         ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
        [workspaceId, userId, perPage, offset]
      ),
      queryOne<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM knowledge_documents WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId]
      ),
    ]);
  }

  res.json({ data: rows, total: countRow?.count ?? 0, page, per_page: perPage });
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const doc = await queryOne(
    `SELECT * FROM knowledge_documents WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({ data: doc });
});

router.post('/', validateBody(DocSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { title, content, type, tags } = req.body as z.infer<typeof DocSchema>;

  const id = uuidv4();
  await query(
    `INSERT INTO knowledge_documents (id, workspace_id, user_id, title, content, type, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, workspaceId, userId, title, content, type, tags]
  );
  const doc = await queryOne(`SELECT * FROM knowledge_documents WHERE id = $1`, [id]);
  res.status(201).json({ data: doc });
});

router.put('/:id', validateBody(DocSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { title, content, type, tags } = req.body as z.infer<typeof DocSchema>;

  const updated = await queryOne(
    `UPDATE knowledge_documents SET title=$1, content=$2, type=$3, tags=$4, updated_at=NOW()
     WHERE id=$5 AND workspace_id=$6 AND user_id=$7
     RETURNING id, title, type, tags, updated_at`,
    [title, content, type, tags, req.params['id'], workspaceId, userId]
  );
  if (!updated) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({ data: updated });
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const deleted = await queryOne(
    `DELETE FROM knowledge_documents WHERE id=$1 AND workspace_id=$2 AND user_id=$3 RETURNING id`,
    [req.params['id'], workspaceId, userId]
  );
  if (!deleted) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.json({ message: 'Document deleted' });
});

export default router;
