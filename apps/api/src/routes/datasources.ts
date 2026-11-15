import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../database/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validateBody } from '../middleware/validate';
import { testConnection, runReadOnlyQuery, listTables, isReadOnlyQuery } from '../connectors/postgres';

// Config keys that must never be exposed via the API
const SECRET_KEYS = new Set(['connection_string', 'password', 'api_key', 'token', 'secret']);

// config_encrypted is stored as a JSON string in a TEXT column
function getSecretConfig(raw: Record<string, string> | string | null | undefined): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
  }
  return raw;
}

const router = Router();
router.use(authenticate);

const DataSourceSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['google_sheets', 'csv_upload', 'json_api', 'postgres_readonly']),
  config: z.record(z.string()).optional().default({}),
  csv_data: z.string().max(500000).optional(), // inline CSV content for csv_upload type
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
  const { name, type, config, csv_data } = req.body as z.infer<typeof DataSourceSchema>;

  const id = uuidv4();
  // Split config: secret values go to config_encrypted, the rest to config_public.
  // Store CSV data inline in config_public if provided.
  const publicConfig: Record<string, string> = {};
  const secretConfig: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (SECRET_KEYS.has(key)) secretConfig[key] = value;
    else publicConfig[key] = value;
  }
  if (csv_data) publicConfig['csv_data'] = csv_data;

  await query(
    `INSERT INTO data_sources (id, workspace_id, user_id, name, type, status, config_public, config_encrypted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, workspaceId, userId, name, type, csv_data ? 'connected' : 'pending', JSON.stringify(publicConfig), JSON.stringify(secretConfig)]
  );

  const source = await queryOne(`SELECT id, name, type, status, config_public, created_at FROM data_sources WHERE id = $1`, [id]);
  res.status(201).json({ data: source });
});

router.post('/:id/test', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const source = await queryOne<{ type: string; config_public: Record<string, string>; config_encrypted: Record<string, string> | string | null }>(
    `SELECT type, config_public, config_encrypted FROM data_sources WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
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
  } else if (source.type === 'postgres_readonly') {
    const connStr = getSecretConfig(source.config_encrypted)['connection_string']
      ?? source.config_public['connection_string'];
    if (!connStr) {
      testResult = { success: false, message: 'connection_string not configured' };
    } else {
      testResult = await testConnection(connStr);
    }
  } else if (source.type === 'google_sheets') {
    const sheetId = source.config_public['spreadsheet_id'];
    const gid = source.config_public['gid'] ?? '0';
    const csvUrl = source.config_public['csv_url']
      ?? (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}` : null);
    if (!csvUrl) {
      testResult = { success: false, message: 'Spreadsheet ID or CSV URL not configured' };
    } else {
      try {
        const resp = await fetch(csvUrl, { method: 'GET', signal: AbortSignal.timeout(8000) });
        testResult = { success: resp.ok, message: resp.ok ? `Sheet reachable (HTTP ${resp.status})` : `HTTP ${resp.status} — is the sheet shared publicly?` };
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

// Schema introspection for a postgres source
router.get('/:id/schema', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const source = await queryOne<{ type: string; config_public: Record<string, string>; config_encrypted: Record<string, string> | string | null }>(
    `SELECT type, config_public, config_encrypted FROM data_sources WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!source || source.type !== 'postgres_readonly') {
    res.status(404).json({ error: 'PostgreSQL data source not found' });
    return;
  }
  const connStr = getSecretConfig(source.config_encrypted)['connection_string']
    ?? source.config_public['connection_string'];
  if (!connStr) {
    res.status(400).json({ error: 'connection_string not configured' });
    return;
  }
  try {
    const tables = await listTables(connStr);
    res.json({ data: tables });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Schema fetch failed' });
  }
});

// Run a read-only query against a postgres source
router.post('/:id/query', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { userId, workspaceId } = req.user!;
  const sql = typeof req.body?.sql === 'string' ? req.body.sql : '';
  const limit = Math.min(Math.max(parseInt(req.body?.limit ?? '100', 10) || 100, 1), 100);

  if (!isReadOnlyQuery(sql)) {
    res.status(400).json({ error: 'Only single read-only SELECT queries are allowed.' });
    return;
  }

  const source = await queryOne<{ type: string; config_public: Record<string, string>; config_encrypted: Record<string, string> | string | null }>(
    `SELECT type, config_public, config_encrypted FROM data_sources WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
    [req.params['id'], workspaceId, userId]
  );
  if (!source || source.type !== 'postgres_readonly') {
    res.status(404).json({ error: 'PostgreSQL data source not found' });
    return;
  }
  const connStr = getSecretConfig(source.config_encrypted)['connection_string']
    ?? source.config_public['connection_string'];
  if (!connStr) {
    res.status(400).json({ error: 'connection_string not configured' });
    return;
  }

  try {
    const result = await runReadOnlyQuery(connStr, sql, limit);
    await query(`UPDATE data_sources SET last_synced_at = NOW() WHERE id = $1`, [req.params['id']]);
    res.json({ data: result });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Query failed' });
  }
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
