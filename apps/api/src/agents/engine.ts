import Groq from 'groq-sdk';
import { config, hasGroq } from '../config';
import { registry } from '../tools/registry';
import { query, queryOne } from '../database/pool';
import { v4 as uuidv4 } from 'uuid';

export interface AgentExecutionOptions {
  conversationId: string;
  userId: string;
  workspaceId: string;
  agentId?: string;
  userMessage: string;
  /** Skip inserting the user message — caller already saved it (shared rooms). */
  skipUserInsert?: boolean;
  onStatus?: (status: string, detail?: string) => void;
  onChunk?: (chunk: string) => void;
}

export interface AgentExecutionResult {
  messageId: string;
  content: string;
  toolCallCount: number;
  status: 'completed' | 'failed' | 'demo';
  error?: string;
  artifacts?: Array<{ type: string; data: unknown }>;
  learnedInsight?: {
    title: string;
    content: string;
    type: 'fact' | 'note' | 'procedure';
    tags: string[];
  } | null;
}

interface GroqMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

// Demo mode responses when Groq is not configured
const DEMO_RESPONSES = [
  "I'm running in **demo mode** because no Groq API key is configured.\n\nTo enable real AI responses:\n1. Get a free API key at [console.groq.com](https://console.groq.com)\n2. Add `GROQ_API_KEY=your-key` to `apps/api/.env`\n3. Restart the server\n\nIn demo mode I can still show you the interface and tool execution flow.",
  "**Demo Mode Active** — Groq API key not configured.\n\nThis is a simulated response. Your message was received and would be sent to the Groq AI model if credentials were set up.\n\nPlease configure your `GROQ_API_KEY` in `apps/api/.env` to enable real AI conversations.",
];

let demoResponseIndex = 0;

function getDemoResponse(): string {
  const resp = DEMO_RESPONSES[demoResponseIndex % DEMO_RESPONSES.length];
  demoResponseIndex++;
  return resp;
}

/**
 * Extracts a learnable insight from a user<>assistant exchange.
 * Returns null if there's nothing worth saving (chit-chat, errors, etc.)
 */
async function extractInsight(
  groq: Groq,
  model: string,
  userMessage: string,
  assistantResponse: string
): Promise<AgentExecutionResult['learnedInsight']> {
  // Don't extract from short or error responses
  if (assistantResponse.length < 80 || assistantResponse.startsWith('I encountered an error')) {
    return null;
  }
  // Don't extract from very short user messages (1-2 words like "hi", "thanks")
  if (userMessage.trim().split(/\s+/).length < 3) {
    return null;
  }

  try {
    const extractParams: Record<string, unknown> = {
      model,
      messages: [
        {
          role: 'system',
          content: `You are a knowledge extractor. Given a user question and an AI response, extract ONE concise, reusable piece of knowledge worth saving.

Rules:
- Extract something useful whenever the response contains a definition, explanation, fact, or procedure
- "What is X?" questions almost ALWAYS have extractable knowledge
- Return null ONLY for pure chit-chat ("hi", "thanks", "ok"), or error messages
- The extracted knowledge must be self-contained (readable without the original conversation)
- Keep content to 1-3 sentences — be specific and concrete

Respond ONLY with valid JSON in this exact format, nothing else:
{"title": "Short descriptive title (max 8 words)", "content": "The knowledge to save (1-3 sentences)", "type": "fact|note|procedure", "tags": ["tag1", "tag2"]}

If truly nothing is worth saving: respond with exactly: null`,
        },
        {
          role: 'user',
          content: `User asked: "${userMessage.slice(0, 500)}"\n\nAI responded: "${assistantResponse.slice(0, 1000)}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    };

    const completion = await groq.chat.completions.create(
      extractParams as unknown as Parameters<typeof groq.chat.completions.create>[0]
    ) as { choices: Array<{ message: { content: string | null } }> };

    const raw = completion.choices[0]?.message?.content?.trim() ?? 'null';

    if (raw === 'null' || raw === '') return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.title || !parsed.content) return null;

    return {
      title: String(parsed.title).slice(0, 200),
      content: String(parsed.content).slice(0, 2000),
      type: (['fact', 'note', 'procedure'].includes(parsed.type) ? parsed.type : 'note') as 'fact' | 'note' | 'procedure',
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map((t: unknown) => String(t)) : [],
    };
  } catch {
    // Non-fatal — insight extraction is best-effort
    return null;
  }
}

/** Live status of currently-running agent executions, keyed by conversation. */
export const agentRunStatus = new Map<string, { status: string; detail?: string; at: number }>();

export async function executeAgent(opts: AgentExecutionOptions): Promise<AgentExecutionResult> {
  const { conversationId, userId, workspaceId, agentId, userMessage, onStatus, onChunk } = opts;

  const notify = (status: string, detail?: string) => {
    agentRunStatus.set(conversationId, { status, detail, at: Date.now() });
    onStatus?.(status, detail);
  };

  notify('understanding');

  // Load agent config
  let systemPrompt = `You are a helpful AI coworker called AgentDesk. You help users analyze data, answer questions, and get work done.

WORKFLOW:
1. First call search_knowledge with the user's question — the user saves previous answers to their wiki. If a saved answer covers the question well, reply with it and mention it's from their wiki.
2. If the saved answer might be stale (the user asks for "latest", "current", "this month", etc.) or the knowledge base has nothing relevant, then gather fresh data: call list_available_data_sources, then query_connected_data with the source name.
3. For live data questions, always use query_connected_data — never invent numbers.

Keep tool calls minimal — avoid repeating the same query with slightly different phrasing.`;
  let allowedTools = [
    'get_current_datetime', 'calculator', 'search_knowledge',
    'list_available_data_sources', 'query_connected_data',
    'generate_chart', 'create_markdown_report', 'create_csv_export',
    'retrieve_task_status',
  ];
  let maxToolCalls = 10;
  let maxIterations = 8;
  let model = config.groqModel;

  if (agentId) {
    const agent = await queryOne<{
      system_prompt: string;
      allowed_tools: string[];
      max_tool_calls: number;
      max_iterations: number;
      model: string;
    }>(
      `SELECT system_prompt, allowed_tools, max_tool_calls, max_iterations, model
       FROM agents WHERE id = $1 AND workspace_id = $2`,
      [agentId, workspaceId]
    );

    if (agent) {
      systemPrompt = agent.system_prompt || systemPrompt;
      allowedTools = agent.allowed_tools ?? allowedTools;
      maxToolCalls = agent.max_tool_calls ?? maxToolCalls;
      maxIterations = agent.max_iterations ?? maxIterations;
      model = agent.model ?? model;
    }
  }
  if (!opts.skipUserInsert) {
    // Save user message
    const userMsgId = uuidv4();
    await query(
      `INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)`,
      [userMsgId, conversationId, userMessage]
    );

    // Update conversation title if it's the first message
    await query(
      `UPDATE conversations SET title = $1, updated_at = NOW()
       WHERE id = $2 AND title = 'New Conversation'`,
      [userMessage.slice(0, 80), conversationId]
    );
  }

  await query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );

  // Demo mode
  if (!hasGroq) {
    notify('generating');
    const demoContent = getDemoResponse();
    const assistantMsgId = uuidv4();
    await query(
      `INSERT INTO messages (id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, '{"demo": true}')`,
      [assistantMsgId, conversationId, demoContent]
    );
    onChunk?.(demoContent);
    return { messageId: assistantMsgId, content: demoContent, toolCallCount: 0, status: 'demo' };
  }

  // Real Groq execution
  const groq = new Groq({ apiKey: config.groqApiKey });
  const groqTools = registry.toGroqTools(allowedTools);

  // Load recent conversation history (last 20 messages)
  // IMPORTANT: Only load user and assistant text messages for context.
  // Tool call messages (role='tool') and assistant messages with tool_calls
  // are only valid within a single turn's execution loop — replaying them
  // in a new turn causes errors with models like openai/gpt-oss-120b.
  const history = await query<{ role: string; content: string }>(
    `SELECT role, content
     FROM messages
     WHERE conversation_id = $1
       AND role IN ('user', 'assistant')
       AND (tool_call_id IS NULL OR tool_call_id = '')
       AND content != ''
     ORDER BY created_at DESC
     LIMIT 20`,
    [conversationId]
  );

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    // Reverse so oldest first, exclude the user message we just added
    ...history
      .reverse()
      .slice(0, -1) // exclude the message we just inserted
      .filter((m) => m.content && m.content.trim() !== '')
      .map((m): GroqMessage => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        // Never replay tool_calls in history — causes API errors on multi-turn
      })),
    { role: 'user', content: userMessage },
  ];

  let toolCallCount = 0;
  let iterations = 0;
  let finalContent = '';
  const artifacts: Array<{ type: string; data: unknown }> = [];

  try {
    while (iterations < maxIterations) {
      iterations++;
      notify('planning', `Iteration ${iterations}/${maxIterations}`);

      const requestMessages = messages.filter((m) => {
        // In-turn tool messages need tool_call_id; history messages are already clean
        if (m.role === 'tool') return !!(m.tool_call_id && m.content);
        // Strip any assistant messages that have empty content and no tool_calls
        if (m.role === 'assistant' && !m.content && !m.tool_calls?.length) return false;
        return true;
      });

    // Use non-streaming completion
    const completionParams: Record<string, unknown> = {
      model,
      messages: requestMessages,
      max_tokens: 4096,
      temperature: 0.7,
    };
    if (groqTools.length > 0) {
      completionParams['tools'] = groqTools;
    }

    // Cast through unknown to avoid Groq SDK's Stream union type complexity
    const completion = await groq.chat.completions.create(completionParams as unknown as Parameters<typeof groq.chat.completions.create>[0]) as {
      choices: Array<{
        finish_reason: string;
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('No completion choice returned');
    }

    const assistantMessage = choice.message;
      messages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls as GroqMessage['tool_calls'],
      });

      // Check if done
      if (choice.finish_reason === 'stop' || !assistantMessage.tool_calls?.length) {
        finalContent = assistantMessage.content ?? '';
        notify('generating');
        onChunk?.(finalContent);
        break;
      }

      // Process tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCallCount >= maxToolCalls) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: JSON.stringify({ error: 'Tool call limit reached' }),
            });
            continue;
          }

          notify('tool_calling', toolCall.function.name);
          toolCallCount++;

          let toolInput: unknown;
          try {
            toolInput = JSON.parse(toolCall.function.arguments);
          } catch {
            toolInput = {};
          }

          const toolResult = await registry.execute(
            toolCall.function.name,
            toolInput,
            { userId, workspaceId, conversationId },
            allowedTools
          );

          notify('checking', toolCall.function.name);

          // Track artifacts
          if (toolResult.success && toolResult.result && typeof toolResult.result === 'object') {
            const r = toolResult.result as Record<string, unknown>;
            if (r['artifact_type']) {
              artifacts.push({ type: r['artifact_type'] as string, data: toolResult.result });
            }
          }

          const toolResultContent = toolResult.success
            ? JSON.stringify(toolResult.result)
            : JSON.stringify({ error: toolResult.error });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: toolResultContent,
          });

          // Save tool execution record
          await query(
            `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, tool_name, metadata)
             VALUES ($1, $2, 'tool', $3, $4, $5, $6)`,
            [
              uuidv4(),
              conversationId,
              toolResultContent.slice(0, 10000),
              toolCall.id,
              toolCall.function.name,
              JSON.stringify({ success: toolResult.success }),
            ]
          );
        }

        // Save assistant's tool-call message
        await query(
          `INSERT INTO messages (id, conversation_id, role, content, tool_calls, metadata)
           VALUES ($1, $2, 'assistant', $3, $4, '{}')`,
          [
            uuidv4(),
            conversationId,
            assistantMessage.content ?? '',
            JSON.stringify(assistantMessage.tool_calls),
          ]
        );
      }
    }

    if (!finalContent && iterations >= maxIterations) {
      // Ran out of iterations — force one final no-tools call so the model
      // summarizes what it actually found instead of a static fallback.
      notify('generating');
      messages.push({
        role: 'user',
        content:
          'You have used all your tool-call budget. Do NOT call any more tools. ' +
          'Now write your best final answer to the user using only the data already retrieved above. ' +
          'If some part is missing, say briefly what you could and could not get.',
      });
      try {
        const final = await groq.chat.completions.create({
          model,
          messages,
          max_tokens: 4096,
          temperature: 0.7,
        } as unknown as Parameters<typeof groq.chat.completions.create>[0]) as {
          choices: Array<{ message: { content: string | null } }>;
        };
        finalContent = final.choices[0]?.message?.content ?? 'I was unable to finish processing this request.';
      } catch {
        finalContent = 'I was unable to finish processing this request.';
      }
    }

    // Save final assistant message
    const assistantMsgId = uuidv4();
    await query(
      `INSERT INTO messages (id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [
        assistantMsgId,
        conversationId,
        finalContent,
        JSON.stringify({ tool_call_count: toolCallCount, iterations }),
      ]
    );

    // Record usage
    await query(
      `INSERT INTO usage_records (user_id, workspace_id, resource_type, amount)
       VALUES ($1, $2, 'ai_message', 1)`,
      [userId, workspaceId]
    ).catch(() => {/* non-fatal */});

    // Extract a learnable insight from this exchange (best-effort, non-blocking)
    const learnedInsight = await extractInsight(groq, model, userMessage, finalContent).catch(() => null);

    agentRunStatus.delete(conversationId);

    return {
      messageId: assistantMsgId,
      content: finalContent,
      toolCallCount,
      status: 'completed',
      artifacts,
      learnedInsight,
    };

  } catch (err) {
    agentRunStatus.delete(conversationId);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[agent] Execution error:', errorMessage);

    const errorContent = `I encountered an error while processing your request: ${errorMessage}. Please try again or check your configuration.`;
    const errorMsgId = uuidv4();

    await query(
      `INSERT INTO messages (id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [errorMsgId, conversationId, errorContent, JSON.stringify({ error: errorMessage })]
    );

    return {
      messageId: errorMsgId,
      content: errorContent,
      toolCallCount,
      status: 'failed',
      error: errorMessage,
      learnedInsight: null,
    };
  }
}
