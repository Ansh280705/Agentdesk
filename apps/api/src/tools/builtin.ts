import { z } from 'zod';
import { registry, ToolDefinition } from './registry';
import { query } from '../database/pool';

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
        const results = await query<{
          id: string;
          title: string;
          content: string;
          type: string;
          tags: string[];
          rank: number;
        }>(
          `SELECT id, title, content, type, tags,
                  ts_rank(search_vector, plainto_tsquery('english', $1)) AS rank
           FROM knowledge_documents
           WHERE workspace_id = $2
             AND search_vector @@ plainto_tsquery('english', $1)
           ORDER BY rank DESC
           LIMIT $3`,
          [q, ctx.workspaceId, limit]
        );
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
    description: 'Queries data from a connected data source by its ID. Returns rows of data.',
    inputSchema: z.object({
      source_id: z.string().uuid().describe('ID of the data source to query'),
      description: z.string().max(500).describe('What data you want to retrieve'),
      limit: z.number().int().min(1).max(100).optional().default(20),
    }),
    permissions: ['data_sources:read'],
    timeoutMs: 10000,
    groqProperties: {
      source_id: { type: 'string', description: 'UUID of the data source' },
      description: { type: 'string', description: 'What data to retrieve' },
      limit: { type: 'integer', description: 'Max rows to return', minimum: 1, maximum: 100 },
    },
    groqRequired: ['source_id', 'description'],
    async handler({ source_id, description, limit }, ctx) {
      // Verify ownership
      const source = await query<{ id: string; name: string; type: string; config_public: Record<string, unknown> }>(
        `SELECT id, name, type, config_public FROM data_sources
         WHERE id = $1 AND workspace_id = $2 AND user_id = $3 AND status = 'connected'`,
        [source_id, ctx.workspaceId, ctx.userId]
      );

      if (source.length === 0) {
        return { error: 'Data source not found or not connected' };
      }

      return {
        source_name: source[0].name,
        source_type: source[0].type,
        description,
        message: 'Data source found but real-time querying requires connector implementation for this source type.',
        sample_note: 'Connect a Google Sheets or CSV source to query real data.',
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
