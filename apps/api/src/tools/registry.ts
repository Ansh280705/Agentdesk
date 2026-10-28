import { z, ZodSchema } from 'zod';

export interface ToolExecutionContext {
  userId: string;
  workspaceId: string;
  conversationId?: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  permissions: string[];
  timeoutMs: number;
  handler: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
  // Groq-compatible function definition
  toGroqTool(): object;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition<any, any>> = new Map();

  register(tool: ToolDefinition<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<any, any>[] {
    return Array.from(this.tools.values());
  }

  listForAgent(allowedTools: string[]): ToolDefinition<any, any>[] {
    return allowedTools
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolDefinition<any, any> => !!t);
  }

  toGroqTools(allowedTools: string[]): object[] {
    return this.listForAgent(allowedTools).map((t) => t.toGroqTool());
  }

  async execute(
    name: string,
    rawInput: unknown,
    ctx: ToolExecutionContext,
    allowedTools: string[]
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    if (!allowedTools.includes(name)) {
      return { success: false, error: `Tool '${name}' is not permitted for this agent` };
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid tool input: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
      };
    }

    try {
      const result = await Promise.race([
        tool.handler(parsed.data, ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), tool.timeoutMs)
        ),
      ]);
      return { success: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown tool error';
      return { success: false, error: message };
    }
  }
}

export const registry = new ToolRegistry();
