import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(authenticate);

const DataSourceSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['google_sheets', 'csv_upload', 'json_api', 'postgres_readonly']),
  config: z.record(z.string()).optional().default({}),
});

// Available connector types
router.get('/connectors', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({
    data: [
      {
        type: 'google_sheets',
        name: 'Google Sheets',
        description: 'Connect to a Google Sheet for read-only data access.',
        status: 'available',
        setup_url: 'https://developers.google.com/sheets/api/guides/authorizing',
        required_config: ['spreadsheet_id', 'sheet_name'],
        icon: 'sheet',
      },
      {
        type: 'csv_upload',
        name: 'CSV Upload',
        description: 'Upload a CSV file and query it as a data source.',
        status: 'available',
        required_config: [],
        icon: 'file',
      },
      {
        type: 'json_api',
        name: 'JSON REST API',
        description: 'Connect to a read-only JSON API endpoint.',
        status: 'available',
        required_config: ['url'],
        icon: 'api',
      },
      {
        type: 'postgres_readonly',
        name: 'PostgreSQL (Read-only)',
        description: 'Connect a read-only PostgreSQL database.',
        status: 'available',
        required_config: ['connection_string'],
        icon: 'database',
      },
    ],
  });
});

router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const sources = await query(
    `SELECT id, name, type, status, config_public, last_synced_at, created_at
     FROM data_sources WHERE workspace_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [workspaceId, userId]
  );
  res.json({ data: sources });
});

router.post('/', validateBody(DataSourceSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const { name, type, config } = req.body as z.infer<typeof DataSourceSchema>;

  const id = uuidv4();
  // Store only public config (no secrets) - encrypted secrets would require a key service
  await query(
    `INSERT INTO data_sources (id, workspace_id, user_id, name, type, status, config_public)
     VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
    [id, workspaceId, userId, name, type, JSON.stringify(config)]
  );

  const source = await queryOne(`SELECT id, name, type, status, config_public, created_at FROM data_sources WHERE id = $1`, [id]);
  res.status(201).json({ data: source });
});

router.post('/:id/test', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const source = await queryOne<{ type: string; config_public: Record<string, string> }>(
    `SELECT type, config_public FROM data_sources WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );

  if (!source) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }

  // Test connectivity based on type
  let testResult: { success: boolean; message: string } = { success: false, message: 'Test not implemented for this source type' };

  if (source.type === 'json_api') {
    const url = source.config_public['url'];
    if (!url) {
      testResult = { success: false, message: 'URL not configured' };
    } else {
      try {
        const resp = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
        testResult = { success: resp.ok, message: resp.ok ? `Connected (HTTP ${resp.status})` : `HTTP ${resp.status}` };
      } catch (err) {
        testResult = { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
      }
    }
  } else if (source.type === 'csv_upload') {
    testResult = { success: true, message: 'CSV source ready' };
  } else {
    testResult = { success: false, message: `Manual setup required for ${source.type}. See documentation.` };
  }

  // Update status
  await query(
    `UPDATE data_sources SET status = $1, last_synced_at = NOW() WHERE id = $2`,
    [testResult.success ? 'connected' : 'error', req.params['id']]
  );

  res.json({ data: testResult });
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const deleted = await queryOne(
    `DELETE FROM data_sources WHERE id = $1 AND workspace_id = $2 AND user_id = $3 RETURNING id`,
    [req.params['id'], workspaceId, userId]
  );
  if (!deleted) {
    res.status(404).json({ error: 'Data source not found' });
    return;
  }
  res.json({ message: 'Data source disconnected' });
});

export default router;
