import { z } from 'zod';
import { registry, ToolDefinition } from './registry';
import { query } from '../database/pool';
import { runReadOnlyQuery, listTables, isReadOnlyQuery } from '../connectors/postgres';
import { toOrTsQuery } from '../utils/search';

// config_encrypted is stored as a JSON string in a TEXT column
function parseSecretConfig(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
  }
  return raw as Record<string, string>;
}

function makeTool<TInput, TOutput>(def: {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  permissions: string[];
  timeoutMs: number;
  groqProperties: Record<string, unknown>;
  groqRequired?: string[];
  handler: (input: TInput, ctx: import('./registry').ToolExecutionContext) => Promise<TOutput>;
}): ToolDefinition<TInput, TOutput> {
  return {
    ...def,
    toGroqTool() {
      return {
        type: 'function',
        function: {
          name: def.name,
          description: def.description,
          parameters: {
            type: 'object',
            properties: def.groqProperties,
            required: def.groqRequired ?? [],
          },
        },
      };
    },
  };
}

// ── get_current_datetime ───────────────────────────────────────────
registry.register(
  makeTool({
    name: 'get_current_datetime',
    description: 'Returns the current date, time, and timezone. Use when asked about the current time, date, or scheduling.',
    inputSchema: z.object({
      timezone: z.string().optional().describe('IANA timezone string, e.g. America/New_York'),
    }),
    permissions: [],
    timeoutMs: 2000,
    groqProperties: {
      timezone: { type: 'string', description: 'Optional IANA timezone string. Omit for UTC.' },
    },
    groqRequired: [],
    async handler({ timezone }) {
      const now = new Date();
      const tz = timezone ?? 'UTC';
      try {
        return {
          iso: now.toISOString(),
          local: now.toLocaleString('en-US', { timeZone: tz }),
          timezone: tz,
          unix: Math.floor(now.getTime() / 1000),
        };
      } catch {
        return {
          iso: now.toISOString(),
          local: now.toUTCString(),
          timezone: 'UTC',
          unix: Math.floor(now.getTime() / 1000),
        };
      }
    },
  })
);

// ── calculator ─────────────────────────────────────────────────────
registry.register(
  makeTool({
    name: 'calculator',
    description: 'Evaluates a mathematical expression and returns the result. Supports basic arithmetic, percentages, powers, and common math functions. Do NOT pass arbitrary code.',
    inputSchema: z.object({
      expression: z.string().max(500).describe('Mathematical expression to evaluate, e.g. "2 + 2 * 10" or "sqrt(144)"'),
    }),
    permissions: [],
    timeoutMs: 2000,
    groqProperties: {
      expression: { type: 'string', description: 'Mathematical expression to evaluate' },
    },
    groqRequired: ['expression'],
    async handler({ expression }) {
      // Safe math evaluator - only allows numbers and math operators
      const sanitized = expression
        .replace(/[^0-9+\-*/().,^%\s]/g, '')
        .replace(/\^/g, '**');

      if (!sanitized.trim()) {
        return { error: 'Invalid expression - only numbers and operators allowed' };
      }

      try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${sanitized})`)();
        if (!isFinite(result)) {
          return { error: 'Result is not finite (division by zero?)' };
        }
        return { expression, result: Math.round(result * 1e10) / 1e10 };
      } catch (err) {
        return { error: 'Could not evaluate expression' };
      }
    },
  })
);

// ── search_knowledge ───────────────────────────────────────────────
registry.register(
  makeTool({
    name: 'search_knowledge',
    description: 'Searches the user\'s knowledge base using full-text search. Returns relevant documents, notes, and facts.',
    inputSchema: z.object({
      query: z.string().min(1).max(500).describe('Search query'),
      limit: z.number().int().min(1).max(10).optional().default(5),
    }),
    permissions: ['knowledge:read'],
    timeoutMs: 5000,
    groqProperties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'integer', description: 'Max results (1-10)', minimum: 1, maximum: 10 },
    },
    groqRequired: ['query'],
    async handler({ query: q, limit }, ctx) {
      try {
        type Row = {
          id: string;
          title: string;
          content: string;
          type: string;
          tags: string[];
          rank: number;
        };
        // Strict AND first; fall back to OR-ed terms for natural-language questions
        let results = await query<Row>(
          `SELECT id, title, content, type, tags,
                  ts_rank(search_vector, plainto_tsquery('english', $1)) AS rank
           FROM knowledge_documents
           WHERE search_vector @@ plainto_tsquery('english', $1)
           ORDER BY rank DESC
           LIMIT $2`,
          [q, limit]
        );
        const orQuery = toOrTsQuery(q);
        if (!results.length && orQuery) {
          results = await query<Row>(
            `SELECT id, title, content, type, tags,
                    ts_rank(search_vector, to_tsquery('english', $1)) AS rank
             FROM knowledge_documents
             WHERE search_vector @@ to_tsquery('english', $1)
             ORDER BY rank DESC
             LIMIT $2`,
            [orQuery, limit]
          );
        }
        return {
          query: q,
          count: results.length,
          results: results.map((r) => ({
            id: r.id,
            title: r.title,
            excerpt: r.content.slice(0, 500),
            type: r.type,
            tags: r.tags,
          })),
        };
      } catch {
        return { query: q, count: 0, results: [], error: 'Search unavailable' };
      }
    },
  })
);

// ── list_available_data_sources ────────────────────────────────────
registry.register(
  makeTool({
    name: 'list_available_data_sources',
    description: 'Lists all connected data sources available to query.',
    inputSchema: z.object({}),
    permissions: ['data_sources:read'],
    timeoutMs: 3000,
    groqProperties: {},
    async handler(_, ctx) {
      try {
        const sources = await query<{
          id: string;
          name: string;
          type: string;
          status: string;
          last_synced_at: string;
        }>(
          `SELECT id, name, type, status, last_synced_at
           FROM data_sources
           WHERE workspace_id = $1 AND status = 'connected'`,
          [ctx.workspaceId]
        );
        return { count: sources.length, sources };
      } catch {
        return { count: 0, sources: [], error: 'Could not list data sources' };
      }
    },
  })
);

// ── query_connected_data ───────────────────────────────────────────
registry.register(
  makeTool({
    name: 'query_connected_data',
    description: 'Queries data from a connected data source by its ID. Returns actual rows of data from the source.',
    inputSchema: z.object({
      source_id: z.string().min(1).describe('ID (UUID) or name of the data source to query'),
      description: z.string().max(500).describe('What data you want to retrieve'),
      sql: z.string().max(2000).optional().describe('Read-only SELECT statement for postgres_readonly sources. Omit to get the schema.'),
      limit: z.number().int().min(1).max(100).optional().default(20),
    }),
    permissions: ['data_sources:read'],
    timeoutMs: 15000,
    groqProperties: {
      source_id: { type: 'string', description: 'UUID or name of the data source (from list_available_data_sources)' },
      description: { type: 'string', description: 'What data to retrieve' },
      sql: { type: 'string', description: 'Optional read-only SELECT statement (postgres sources only). Omit to list available tables.' },
      limit: { type: 'integer', description: 'Max rows to return', minimum: 1, maximum: 100 },
    },
    groqRequired: ['source_id', 'description'],
    async handler({ source_id, description, sql, limit }, ctx) {
      // Resolve by UUID or by name — models sometimes mangle long IDs
      const source = await query<{
        id: string; name: string; type: string;
        config_public: Record<string, string>;
        config_encrypted: unknown;
      }>(
        `SELECT id, name, type, config_public, config_encrypted FROM data_sources
         WHERE workspace_id = $2 AND user_id = $3 AND status = 'connected'
           AND (id::text = $1 OR name ILIKE '%' || $1 || '%')
         ORDER BY (id::text = $1) DESC
         LIMIT 1`,
        [source_id.trim(), ctx.workspaceId, ctx.userId]
      );

      if (source.length === 0) {
        const available = await query<{ name: string }>(
          `SELECT name FROM data_sources WHERE workspace_id = $1 AND user_id = $2 AND status = 'connected'`,
          [ctx.workspaceId, ctx.userId]
        );
        return {
          error: `No connected data source matches "${source_id}".`,
          available_sources: available.map((s) => s.name),
          hint: 'Retry with an exact source name, or call list_available_data_sources to get IDs.',
        };
      }

      const src = source[0];

      // JSON API — actually fetch the data
      if (src.type === 'json_api') {
        const url = src.config_public['url'];
        if (!url) return { error: 'URL not configured for this data source' };
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) return { error: `HTTP ${resp.status} from data source` };
          const raw = await resp.json() as unknown;
          const data = Array.isArray(raw) ? raw.slice(0, limit) : [raw];
          return {
            source_name: src.name,
            source_type: src.type,
            description,
            row_count: data.length,
            columns: data.length > 0 ? Object.keys(data[0] as Record<string, unknown>) : [],
            rows: data,
          };
        } catch (err) {
          return { error: 'Failed to fetch data: ' + (err instanceof Error ? err.message : 'Unknown') };
        }
      }

      // CSV data stored in config
      if (src.type === 'csv_upload') {
        const csvContent = src.config_public['csv_data'];
        if (!csvContent) {
          // Return sample data from config description
          return {
            source_name: src.name,
            source_type: src.type,
            description: src.config_public['description'] ?? '',
            message: 'CSV data not yet uploaded. Use the Data Sources page to upload a file.',
            sample_note: description,
          };
        }
        // Parse CSV
        const lines = csvContent.trim().split('\n');
        const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1, (limit ?? 20) + 1).map((line: string) => {
          const vals = line.split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''));
          return Object.fromEntries(headers.map((h: string, i: number) => [h, vals[i] ?? '']));
        });
        return {
          source_name: src.name,
          source_type: src.type,
          description,
          row_count: rows.length,
          columns: headers,
          rows,
        };
      }

      // Google Sheets — fetch public CSV export (or a direct csv_url)
      if (src.type === 'google_sheets') {
        const sheetId = src.config_public['spreadsheet_id'];
        const gid = src.config_public['gid'] ?? '0';
        const csvUrl = src.config_public['csv_url']
          ?? (sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}` : null);
        if (!csvUrl) return { error: 'Spreadsheet ID or CSV URL not configured' };
        try {
          const resp = await fetch(csvUrl, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) {
            return { error: `Could not fetch sheet (is it public?): HTTP ${resp.status}` };
          }
          const csv = await resp.text();
          const lines = csv.trim().split('\n');
          const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
          const rows = lines.slice(1, (limit ?? 20) + 1).map((line: string) => {
            const vals = line.split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''));
            return Object.fromEntries(headers.map((h: string, i: number) => [h, vals[i] ?? '']));
          });
          return {
            source_name: src.name,
            source_type: src.type,
            description,
            row_count: rows.length,
            total_rows: lines.length - 1,
            columns: headers,
            rows,
          };
        } catch (err) {
          return { error: 'Failed to fetch sheet: ' + (err instanceof Error ? err.message : 'Unknown') };
        }
      }

      // PostgreSQL — real read-only queries via connection_string
      if (src.type === 'postgres_readonly') {
        const connStr = parseSecretConfig(src.config_encrypted)['connection_string']
          ?? src.config_public['connection_string'];
        if (!connStr) {
          return { error: 'PostgreSQL connection_string not configured for this source.' };
        }
        const rowLimit = limit ?? 20;
        try {
          // No SQL → return schema so the agent can build a query
          if (!sql) {
            const tables = await listTables(connStr);
            return {
              source_name: src.name,
              source_type: src.type,
              description,
              schema: tables,
              hint: 'Call this tool again with a `sql` SELECT statement to retrieve rows.',
            };
          }
          if (!isReadOnlyQuery(sql)) {
            return { error: 'Only read-only SELECT queries are allowed on connected data sources.' };
          }
          const result = await runReadOnlyQuery(connStr, sql, rowLimit);
          return {
            source_name: src.name,
            source_type: src.type,
            description,
            sql,
            row_count: result.rowCount,
            rows: result.rows,
          };
        } catch (err) {
          return { error: 'PostgreSQL query failed: ' + (err instanceof Error ? err.message : 'Unknown') };
        }
      }

      return {
        source_name: src.name,
        source_type: src.type,
        description,
        message: `Connector type "${src.type}" requires additional setup. See Data Sources page.`,
      };
    },
  })
);

// ── generate_chart ─────────────────────────────────────────────────
registry.register(
  makeTool({
    name: 'generate_chart',
    description: 'Generates a chart specification from data. Returns a chart configuration that the frontend will render.',
    inputSchema: z.object({
      title: z.string().max(200),
      type: z.enum(['bar', 'line', 'pie', 'area', 'scatter']),
      data: z.array(z.record(z.union([z.string(), z.number()]))).max(100),
      x_key: z.string().describe('Key from data to use as X axis'),
      y_keys: z.array(z.string()).min(1).max(5).describe('Keys from data to use as Y axis values'),
      description: z.string().optional(),
    }),
    permissions: [],
    timeoutMs: 3000,
    groqProperties: {
      title: { type: 'string' },
      type: { type: 'string', enum: ['bar', 'line', 'pie', 'area', 'scatter'] },
      data: { type: 'array', items: { type: 'object' }, maxItems: 100 },
      x_key: { type: 'string' },
      y_keys: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
      description: { type: 'string' },
    },
    groqRequired: ['title', 'type', 'data', 'x_key', 'y_keys'],
    async handler(input, ctx) {
      const { title, type, data, x_key, y_keys, description } = input;
      const chartSpec = {
        artifact_type: 'chart',
        title,
        type,
        data,
        x_key,
        y_keys,
        description: description ?? '',
        generated_at: new Date().toISOString(),
      };

      // Save as artifact
      try {
        await query(
          `INSERT INTO artifacts (workspace_id, user_id, conversation_id, name, type, content, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, 'chart', $5, 'application/json', $6)`,
          [
            ctx.workspaceId,
            ctx.userId,
            ctx.conversationId ?? null,
            title,
            JSON.stringify(chartSpec),
            JSON.stringify(chartSpec).length,
          ]
        );
      } catch {
        // Non-fatal
      }

      return chartSpec;
    },
  })
);

// ── create_markdown_report ─────────────────────────────────────────
registry.register(
  makeTool({
    name: 'create_markdown_report',
    description: 'Creates a formatted Markdown report and saves it as an artifact.',
    inputSchema: z.object({
      title: z.string().max(200),
      content: z.string().max(50000).describe('Full Markdown content of the report'),
    }),
    permissions: [],
    timeoutMs: 5000,
    groqProperties: {
      title: { type: 'string', description: 'Report title' },
      content: { type: 'string', description: 'Markdown content' },
    },
    groqRequired: ['title', 'content'],
    async handler({ title, content }, ctx) {
      try {
        const result = await query<{ id: string }>(
          `INSERT INTO artifacts (workspace_id, user_id, conversation_id, name, type, content, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, 'markdown', $5, 'text/markdown', $6)
           RETURNING id`,
          [ctx.workspaceId, ctx.userId, ctx.conversationId ?? null, title, content, content.length]
        );
        return {
          artifact_type: 'markdown',
          artifact_id: result[0]?.id,
          title,
          preview: content.slice(0, 500),
          size: content.length,
          message: `Report "${title}" created successfully.`,
        };
      } catch {
        return { artifact_type: 'markdown', title, preview: content.slice(0, 500), message: 'Report created (not persisted - DB unavailable)' };
      }
    },
  })
);

// ── create_csv_export ──────────────────────────────────────────────
registry.register(
  makeTool({
    name: 'create_csv_export',
    description: 'Creates a CSV file from tabular data and saves it as an artifact.',
    inputSchema: z.object({
      title: z.string().max(200),
      columns: z.array(z.string()).min(1).max(50),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(1000),
    }),
    permissions: [],
    timeoutMs: 5000,
    groqProperties: {
      title: { type: 'string' },
      columns: { type: 'array', items: { type: 'string' } },
      rows: { type: 'array', items: { type: 'array' } },
    },
    groqRequired: ['title', 'columns', 'rows'],
    async handler({ title, columns, rows }, ctx) {
      const csvLines = [
        columns.join(','),
        ...rows.map((row) => row.map((cell) => {
          if (cell === null) return '';
          const str = String(cell);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(',')),
      ];
      const csvContent = csvLines.join('\n');

      try {
        const result = await query<{ id: string }>(
          `INSERT INTO artifacts (workspace_id, user_id, conversation_id, name, type, content, mime_type, size_bytes)
           VALUES ($1, $2, $3, $4, 'csv', $5, 'text/csv', $6)
           RETURNING id`,
          [ctx.workspaceId, ctx.userId, ctx.conversationId ?? null, `${title}.csv`, csvContent, csvContent.length]
        );
        return {
          artifact_type: 'csv',
          artifact_id: result[0]?.id,
          title,
          columns,
          row_count: rows.length,
          preview: csvLines.slice(0, 6).join('\n'),
          message: `CSV "${title}" with ${rows.length} rows created.`,
        };
      } catch {
        return { artifact_type: 'csv', title, row_count: rows.length, preview: csvLines.slice(0, 3).join('\n'), message: 'CSV created (not persisted)' };
      }
    },
  })
);

// ── retrieve_task_status ───────────────────────────────────────────
registry.register(
  makeTool({
    name: 'retrieve_task_status',
    description: 'Retrieves the status of a background task by its ID.',
    inputSchema: z.object({
      task_id: z.string().uuid().describe('UUID of the task to check'),
    }),
    permissions: ['tasks:read'],
    timeoutMs: 3000,
    groqProperties: {
      task_id: { type: 'string', description: 'UUID of the task' },
    },
    groqRequired: ['task_id'],
    async handler({ task_id }, ctx) {
      const task = await query<{
        id: string;
        type: string;
        status: string;
        error: string;
        created_at: string;
        started_at: string;
        completed_at: string;
      }>(
        `SELECT id, type, status, error, created_at, started_at, completed_at
         FROM tasks
         WHERE id = $1 AND workspace_id = $2 AND user_id = $3`,
        [task_id, ctx.workspaceId, ctx.userId]
      );

      if (task.length === 0) {
        return { error: 'Task not found or access denied' };
      }

      return task[0];
    },
  })
);

console.log('[tools] Registered builtin tools:', registry.list().map((t) => t.name));
