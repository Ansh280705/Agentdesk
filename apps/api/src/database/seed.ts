/**
 * Demo seed - creates a clearly labeled demo workspace and starter agents.
 * Run with: npm run seed --prefix apps/api
 * WARNING: This is for local development only. Never run on production data.
 */
import { getPool, withTransaction, initPool } from './pool';
import { v4 as uuidv4 } from 'uuid';
import * as argon2 from 'argon2';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import '../utils/dns-fix'; // Fix DNS resolution before any network calls

async function seed() {
  await initPool();
  const pool = getPool();

  console.log('[seed] Starting demo seed...');

  await withTransaction(async (client) => {
    // Create demo user
    const demoUserId = uuidv4();
    const demoEmail = 'demo@agentdesk.dev';
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [demoEmail]);

    if (existing.rows.length > 0) {
      console.log('[seed] Demo user already exists, skipping.');
      return;
    }

    const passwordHash = await argon2.hash('demo1234');
    await client.query(
      `INSERT INTO users (id, email, name, password_hash, is_demo)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [demoUserId, demoEmail, 'Demo User', passwordHash]
    );

    // Create demo workspace
    const workspaceId = uuidv4();
    await client.query(
      `INSERT INTO workspaces (id, name, slug, owner_id) VALUES ($1, $2, $3, $4)`,
      [workspaceId, 'Demo Workspace', 'demo-workspace', demoUserId]
    );

    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [workspaceId, demoUserId]
    );

    // Create user preferences
    await client.query(
      `INSERT INTO user_preferences (user_id) VALUES ($1)`,
      [demoUserId]
    );

    // Create starter agents
    const agentTemplates = [
      {
        name: 'Research Assistant',
        description: 'Helps you research topics, summarize information, and find answers.',
        system_prompt: 'You are a helpful research assistant. You help users find information, summarize topics, and answer questions thoroughly. Always cite your reasoning and be clear about what you know vs. what is uncertain.',
        template_type: 'research',
        allowed_tools: ['get_current_datetime', 'calculator', 'search_knowledge', 'retrieve_task_status'],
      },
      {
        name: 'Data Analyst',
        description: 'Analyzes data, generates charts, and provides insights.',
        system_prompt: 'You are a data analyst. You help users understand their data by performing calculations, generating charts, and providing clear, actionable insights. Always explain your methodology.',
        template_type: 'data_analyst',
        allowed_tools: ['get_current_datetime', 'calculator', 'generate_chart', 'create_csv_export', 'list_available_data_sources', 'query_connected_data'],
      },
      {
        name: 'Coding Assistant',
        description: 'Helps with code review, debugging, and implementation questions.',
        system_prompt: 'You are an expert software engineer and coding assistant. You help with code review, debugging, architecture questions, and implementation. Provide working code examples. Point out potential issues and best practices.',
        template_type: 'coding',
        allowed_tools: ['get_current_datetime', 'calculator', 'search_knowledge', 'create_markdown_report'],
      },
      {
        name: 'Document Assistant',
        description: 'Creates, summarizes, and manages documents and reports.',
        system_prompt: 'You are a document specialist. You help users create well-structured documents, reports, and summaries. Use clear formatting and professional language.',
        template_type: 'document',
        allowed_tools: ['get_current_datetime', 'search_knowledge', 'create_markdown_report', 'create_csv_export'],
      },
      {
        name: 'Business Analyst',
        description: 'Provides business insights, analysis, and strategic recommendations.',
        system_prompt: 'You are a business analyst. You help users analyze business situations, identify opportunities and risks, and make data-driven recommendations. Be pragmatic and results-oriented.',
        template_type: 'business',
        allowed_tools: ['get_current_datetime', 'calculator', 'generate_chart', 'create_markdown_report', 'search_knowledge'],
      },
    ];

    for (const tpl of agentTemplates) {
      await client.query(
        `INSERT INTO agents (id, workspace_id, user_id, name, description, system_prompt, allowed_tools, is_template, template_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)`,
        [uuidv4(), workspaceId, demoUserId, tpl.name, tpl.description, tpl.system_prompt, tpl.allowed_tools, tpl.template_type]
      );
    }

    // Create sample knowledge documents
    const knowledgeDocs = [
      {
        title: 'AgentDesk Overview',
        content: 'AgentDesk is a personal AI coworker platform. It allows users to create AI agents, have conversations with them, and automate tasks. Agents can call tools, generate artifacts, and maintain context across conversations.',
        type: 'document',
        tags: ['agentdesk', 'overview'],
      },
      {
        title: 'Available Tools',
        content: 'AgentDesk agents have access to the following tools: get_current_datetime (returns current date/time), calculator (performs math), search_knowledge (searches your knowledge base), list_available_data_sources (lists connected data sources), query_connected_data (queries data sources), generate_chart (creates charts), create_markdown_report (creates reports), create_csv_export (exports data), retrieve_task_status (checks task status).',
        type: 'fact',
        tags: ['tools', 'reference'],
      },
    ];

    for (const doc of knowledgeDocs) {
      await client.query(
        `INSERT INTO knowledge_documents (id, workspace_id, user_id, title, content, type, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), workspaceId, demoUserId, doc.title, doc.content, doc.type, doc.tags]
      );
    }

    console.log('[seed] Demo workspace created successfully.');
    console.log('[seed] Demo login: demo@agentdesk.dev / demo1234');
  });

  await pool.end();
}

seed().catch((err) => {
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
