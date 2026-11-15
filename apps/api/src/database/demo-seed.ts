/**
 * DEMO DATA SEED — College Presentation
 * Run: npx ts-node --require dotenv/config src/database/demo-seed.ts dotenv_config_path=.env.demo
 */
import dotenv from 'dotenv';
import path from 'path';
// Load demo env — works whether called with dotenv_config_path= or directly
dotenv.config({ path: path.join(__dirname, '../../.env.demo') });
dotenv.config({ path: path.join(__dirname, '../../.env') }); // fallback

import '../utils/dns-fix';
import { getPool, initPool } from './pool';
import { v4 as uuidv4 } from 'uuid';
import * as argon2 from 'argon2';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function run() {
  await initPool();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('[demo-seed] Starting college presentation demo seed...\n');

    // ── Users ────────────────────────────────────────────────────────────
    const userDefs = [
      { email: 'ansh@agentdesk.dev',  name: 'Ansh Rathore' },
      { email: 'priya@agentdesk.dev', name: 'Priya Sharma' },
      { email: 'arjun@agentdesk.dev', name: 'Arjun Mehta' },
    ];

    const hash = await argon2.hash('demo1234');
    const users: { id: string; email: string; name: string }[] = [];

    for (const u of userDefs) {
      const ex = await client.query('SELECT id FROM users WHERE email=$1', [u.email]);
      if (ex.rows.length) {
        // Reuse existing ID — critical for FK consistency
        users.push({ id: ex.rows[0].id as string, email: u.email, name: u.name });
        console.log('  User (exists): ' + u.name);
      } else {
        const newId = uuidv4();
        await client.query(
          'INSERT INTO users (id,email,name,password_hash,is_demo) VALUES ($1,$2,$3,$4,TRUE)',
          [newId, u.email, u.name, hash]
        );
        await client.query(
          'INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
          [newId]
        );
        users.push({ id: newId, email: u.email, name: u.name });
        console.log('  User (created): ' + u.name);
      }
    }

    // ── Workspace ────────────────────────────────────────────────────────
    let wsId: string;
    const exWs = await client.query('SELECT id FROM workspaces WHERE slug=$1', ['demo-college-ws']);
    if (exWs.rows.length) {
      wsId = exWs.rows[0].id;
    } else {
      wsId = uuidv4();
      await client.query(
        'INSERT INTO workspaces (id,name,slug,owner_id) VALUES ($1,$2,$3,$4)',
        [wsId, 'AgentDesk Demo Workspace', 'demo-college-ws', users[0].id]
      );
      await client.query(
        'INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,$3)',
        [wsId, users[0].id, 'owner']
      );
      console.log('  Workspace: AgentDesk Demo Workspace');
    }
    const userId = users[0].id;

    // ── Agents ───────────────────────────────────────────────────────────
    type AgentDef = { name: string; desc: string; prompt: string; tools: string[]; tt: string | null; tpl: boolean };
    const agents: AgentDef[] = [
      {
        name: 'Research Assistant', tt: 'research', tpl: true,
        desc: 'Finds information, summarizes topics, answers questions thoroughly.',
        prompt: 'You are a helpful research assistant. Help users find information and summarize topics. Distinguish facts from assumptions.',
        tools: ['get_current_datetime','calculator','search_knowledge','retrieve_task_status'],
      },
      {
        name: 'Data Analyst', tt: 'data_analyst', tpl: true,
        desc: 'Analyzes data, generates charts, and provides business insights.',
        prompt: 'You are a senior data analyst. Help users understand their data through calculations, charts, and clear insights. Always explain your methodology.',
        tools: ['calculator','generate_chart','create_csv_export','list_available_data_sources','query_connected_data'],
      },
      {
        name: 'Coding Assistant', tt: 'coding', tpl: true,
        desc: 'Code review, debugging, architecture advice, and implementation help.',
        prompt: 'You are an expert software engineer. Help with code review, debugging, and implementation. Provide working examples.',
        tools: ['get_current_datetime','calculator','search_knowledge','create_markdown_report'],
      },
      {
        name: 'Business Analyst', tt: 'business', tpl: true,
        desc: 'Business insights, strategic analysis, and data-driven recommendations.',
        prompt: 'You are a business analyst. Analyze business situations, identify opportunities and risks, and make data-driven recommendations.',
        tools: ['calculator','generate_chart','create_markdown_report','search_knowledge'],
      },
      {
        name: 'Sales Intelligence Agent', tt: null, tpl: false,
        desc: 'Tracks sales pipeline, analyzes deals, and generates reports.',
        prompt: 'You are a sales intelligence agent. Help analyze sales data, track pipeline health, and surface actionable insights for the sales team.',
        tools: ['calculator','generate_chart','create_csv_export','search_knowledge','list_available_data_sources','query_connected_data'],
      },
    ];

    for (const a of agents) {
      await client.query(
        `INSERT INTO agents (id,workspace_id,user_id,name,description,system_prompt,model,allowed_tools,is_template,template_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
        [uuidv4(), wsId, userId, a.name, a.desc, a.prompt, 'openai/gpt-oss-120b', a.tools, a.tpl, a.tt]
      );
      console.log('  Agent: ' + a.name);
    }

    // ── Data Sources ─────────────────────────────────────────────────────
    // Build a 100-row sales CSV for the CSV data source
    const salesCsvRows = [
      'order_id,date,customer_name,product,category,quantity,unit_price,total_revenue,region,sales_rep,status',
    ];
    const products = [
      { name: 'AgentDesk Starter', cat: 'Software', price: 29 },
      { name: 'AgentDesk Pro', cat: 'Software', price: 99 },
      { name: 'AgentDesk Enterprise', cat: 'Software', price: 299 },
      { name: 'AI Consulting (1hr)', cat: 'Services', price: 150 },
      { name: 'Onboarding Package', cat: 'Services', price: 500 },
      { name: 'API Credits Bundle', cat: 'Add-on', price: 49 },
      { name: 'Custom Agent Build', cat: 'Services', price: 2500 },
      { name: 'Data Connector Setup', cat: 'Services', price: 350 },
    ];
    const customers = ['Acme Corp','TechStartup Ltd','DataDriven Inc','FinTech Solutions','MedRecords Co','EduPlatform','RetailChain','LogiTech','CloudBase','InnovateAI','Quantum Systems','Bright Analytics','SwiftData','NexGen Labs','PrimeSoft'];
    const reps = ['Alex Johnson','Priya Sharma','Marcus Lee','Sarah Chen','Ravi Patel','Emma Wilson','James Kumar','Lisa Tanaka'];
    const regions = ['North America','Europe','Asia-Pacific','South America','Middle East'];
    const statuses = ['completed','completed','completed','completed','pending','refunded'];
    const months = ['2024-01','2024-02','2024-03','2024-04','2024-05','2024-06','2024-07','2024-08','2024-09','2024-10','2024-11','2024-12'];

    for (let i = 1; i <= 120; i++) {
      const p = products[i % products.length];
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = months[i % months.length];
      const qty = (i % 5) + 1;
      const total = p.price * qty;
      salesCsvRows.push(
        `ORD-${String(i).padStart(4,'0')},${month}-${day},${customers[i % customers.length]},${p.name},${p.cat},${qty},${p.price},${total},${regions[i % regions.length]},${reps[i % reps.length]},${statuses[i % statuses.length]}`
      );
    }
    const salesCsv = salesCsvRows.join('\n');

    // Product inventory CSV
    const inventoryCsvRows = [
      'sku,product_name,category,stock_units,price_usd,cost_usd,margin_pct,last_restocked,supplier,status',
    ];
    const invProducts = [
      ['SKU-001','AgentDesk Starter License','Software',9999,29,5,'82.8%','2024-11-01','Internal','active'],
      ['SKU-002','AgentDesk Professional License','Software',9999,99,15,'84.8%','2024-11-01','Internal','active'],
      ['SKU-003','AgentDesk Enterprise License','Software',9999,299,45,'84.9%','2024-11-01','Internal','active'],
      ['SKU-004','AI Consulting (1 hour)','Services',500,150,30,'80.0%','2024-10-15','Internal','active'],
      ['SKU-005','Onboarding Package (Standard)','Services',200,500,100,'80.0%','2024-10-01','Internal','active'],
      ['SKU-006','Onboarding Package (Premium)','Services',100,1500,300,'80.0%','2024-10-01','Internal','active'],
      ['SKU-007','API Credits Bundle (10K calls)','Add-on',5000,49,8,'83.7%','2024-11-15','Internal','active'],
      ['SKU-008','Custom Agent Development','Services',50,2500,500,'80.0%','2024-09-01','Internal','active'],
      ['SKU-009','Data Connector Setup','Services',150,350,70,'80.0%','2024-09-15','Internal','active'],
      ['SKU-010','Enterprise Support Plan (Annual)','Support',300,2400,480,'80.0%','2024-11-01','Internal','active'],
      ['SKU-011','Team Training Workshop (4hr)','Services',30,1200,240,'80.0%','2024-10-20','Internal','active'],
      ['SKU-012','Security Audit Add-on','Services',20,800,160,'80.0%','2024-10-05','Internal','active'],
    ];
    for (const row of invProducts) {
      inventoryCsvRows.push(row.join(','));
    }
    const inventoryCsv = inventoryCsvRows.join('\n');

    type DS = { name: string; type: string; config: Record<string,string>; csv?: string };
    const dsSources: DS[] = [
      {
        name: 'Q4 2024 Sales Transactions',
        type: 'csv_upload',
        config: { description: '120 rows of sales orders with product, customer, region, rep, revenue data' },
        csv: salesCsv,
      },
      {
        name: 'Product Inventory & Pricing',
        type: 'csv_upload',
        config: { description: 'Product catalog with SKUs, pricing, margins, stock levels' },
        csv: inventoryCsv,
      },
      {
        name: 'Customer Analytics API',
        type: 'json_api',
        config: { url: 'https://jsonplaceholder.typicode.com/users' },
      },
      {
        name: 'Google Sheets: Marketing Budget 2024',
        type: 'google_sheets',
        config: { spreadsheet_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', sheet_name: 'Sheet1', gid: '0' },
      },
    ];

    for (const ds of dsSources) {
      const publicConfig = { ...ds.config, ...(ds.csv ? { csv_data: ds.csv } : {}) };
      await client.query(
        `INSERT INTO data_sources (id,workspace_id,user_id,name,type,status,config_public,last_synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()-INTERVAL '2 hours') ON CONFLICT DO NOTHING`,
        [uuidv4(), wsId, userId, ds.name, ds.type, ds.csv || ds.type === 'json_api' ? 'connected' : 'pending', JSON.stringify(publicConfig)]
      );
      console.log('  Data Source: ' + ds.name);
    }

    // ── Knowledge Documents ───────────────────────────────────────────────
    type KDoc = { title: string; type: string; tags: string[]; content: string };
    const docs: KDoc[] = [
      {
        title: 'Company Revenue Model',
        type: 'fact', tags: ['finance','revenue','business'],
        content: [
          'AgentDesk operates on a SaaS subscription model with three tiers:',
          '- Starter: $29/month — 5 agents, 1,000 AI messages/month, 2 data sources',
          '- Professional: $99/month — unlimited agents, 10,000 messages/month, 10 data sources',
          '- Enterprise: Custom pricing — dedicated infrastructure, SSO, audit logs, SLAs',
          '',
          'FY2024 Revenue: $4.2M ARR (up 180% YoY)',
          'Customer Count: 847 paying customers across 32 countries',
          'Top segments: Fintech (28%), Healthcare (22%), E-commerce (19%), EdTech (15%), Other (16%)',
        ].join('\n'),
      },
      {
        title: 'Q4 2024 Sales Performance',
        type: 'document', tags: ['sales','q4','2024','performance'],
        content: [
          'Q4 2024 Sales Summary:',
          '',
          'Total Revenue: $1.24M (target was $1.1M — 12.7% above target)',
          'New Customers: 134 (Q3 was 98 — 37% QoQ growth)',
          'Churn Rate: 2.1% (industry average: 3.8%)',
          'Average Contract Value: $9,250/year',
          '',
          'Top Performing Regions:',
          '1. North America: $610K (49%)',
          '2. Europe: $340K (27%)',
          '3. Asia-Pacific: $220K (18%)',
          '4. Rest of World: $70K (6%)',
          '',
          'Product Mix:',
          '- Enterprise plans: 68% of revenue',
          '- Professional plans: 28% of revenue',
          '- Starter plans: 4% of revenue',
        ].join('\n'),
      },
      {
        title: 'AI Agent Architecture — Technical Overview',
        type: 'document', tags: ['technical','architecture','AI','agents'],
        content: [
          'AgentDesk AI Architecture:',
          '',
          'Core Components:',
          '1. Agent Engine — Orchestrates multi-step AI reasoning with tool calling',
          '2. Tool Registry — Type-safe, extensible registry with 9 built-in tools',
          '3. Knowledge Base — PostgreSQL full-text search with semantic ranking',
          '4. Task Queue — Durable task execution with retry and cancellation',
          '',
          'Agent Execution Flow:',
          'User Message → Context Loading → Knowledge Retrieval → Tool Planning → Tool Execution (loop) → Response + Insight Extraction',
          '',
          'Supported AI Models via Groq:',
          '- openai/gpt-oss-120b (primary — best reasoning + tool calling)',
          '- openai/gpt-oss-20b (fast, low-latency)',
          '',
          'Security: Argon2id password hashing, JWT tokens, per-workspace data isolation, tool permission enforcement',
        ].join('\n'),
      },
      {
        title: 'Competitor Analysis: AI Workspace Tools',
        type: 'document', tags: ['competitive','analysis','market'],
        content: [
          'PromptQL: Focus on multiplayer AI coworker, $40+/user/month, strong semantic layer but complex setup.',
          'Notion AI: Document AI at $10/month add-on, familiar UI but limited tool calling.',
          'ChatGPT Enterprise: General AI at $30/user/month, great brand but no persistent context or data connectors.',
          '',
          'AgentDesk Differentiators:',
          '- Purpose-built for data work (not general chat)',
          '- Real tool execution with Zod validation',
          '- Knowledge extraction from every conversation',
          '- Scheduled autonomous tasks',
          '- Open source-friendly stack (Node.js + React)',
          '- 335% more affordable than PromptQL for teams of 5',
        ].join('\n'),
      },
      {
        title: 'Monthly Active Users Growth 2024',
        type: 'fact', tags: ['metrics','growth','users'],
        content: [
          'AgentDesk MAU Growth 2024:',
          'Jan:1240 | Feb:1580 | Mar:2100 | Apr:2890 | May:3750 | Jun:4820',
          'Jul:6100 | Aug:7340 | Sep:8900 | Oct:10200 | Nov:12100 | Dec:14500',
          '',
          'Key Growth Drivers:',
          '- Product Hunt launch (May): +1,200 signups in 48 hours',
          '- TechCrunch feature (Aug): +2,100 organic signups',
          '- Enterprise partnership with Accenture (Oct)',
          '- Referral program (Nov): 23% of new signups',
          '',
          'Engagement: 4.2 sessions/user/week, 8.7 messages/session, 12.3 knowledge items saved/user/month',
        ].join('\n'),
      },
      {
        title: 'JWT Authentication — How It Works',
        type: 'fact', tags: ['auth','jwt','security'],
        content: [
          'JWT (JSON Web Token) is a compact, URL-safe method for transmitting claims as a JSON object.',
          '',
          'Structure: header.payload.signature (Base64URL encoded)',
          'Header: algorithm and type',
          'Payload: userId, email, workspaceId, issued-at, expiry',
          'Signature: HMACSHA256 of header + payload using server secret',
          '',
          'In AgentDesk: tokens expire in 7 days, sent as Authorization: Bearer <token>',
        ].join('\n'),
      },
      {
        title: 'Available Agent Tools',
        type: 'fact', tags: ['tools','reference','agents'],
        content: [
          '1. get_current_datetime — Returns current date, time, timezone',
          '2. calculator — Safe math expression evaluator',
          '3. search_knowledge — Full-text search across knowledge base',
          '4. list_available_data_sources — Lists connected data sources',
          '5. query_connected_data — Queries from connected sources',
          '6. generate_chart — Creates bar/line/pie/area/scatter charts',
          '7. create_markdown_report — Creates formatted reports as artifacts',
          '8. create_csv_export — Exports tabular data as CSV artifacts',
          '9. retrieve_task_status — Checks background task status',
        ].join('\n'),
      },
      {
        title: 'Product Roadmap 2025',
        type: 'procedure', tags: ['roadmap','product','2025'],
        content: [
          'Q1 2025: Browser automation (Playwright), multi-agent workflows, Slack integration',
          'Q2 2025: Real-time collaboration, approval workflows, custom tool SDK, API key management',
          'Q3 2025: Vector embeddings for semantic search, voice input, mobile app',
          'Q4 2025: Enterprise SSO (SAML/OIDC), audit compliance exports, self-hosted deployment',
        ].join('\n'),
      },
    ];

    for (const doc of docs) {
      await client.query(
        'INSERT INTO knowledge_documents (id,workspace_id,user_id,title,content,type,tags) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
        [uuidv4(), wsId, userId, doc.title, doc.content, doc.type, doc.tags]
      );
      console.log('  Knowledge: ' + doc.title);
    }

    // ── Conversations + Messages ──────────────────────────────────────────
    type Conv = { title: string; messages: { role: string; content: string }[] };
    const convs: Conv[] = [
      {
        title: 'Q4 Sales Analysis & Charts',
        messages: [
          { role: 'user', content: 'Can you analyze our Q4 2024 sales performance and highlight key insights?' },
          { role: 'assistant', content: 'Based on the Q4 2024 data:\n\n**Revenue:** $1.24M (12.7% above $1.1M target)\n**New Customers:** 134 (37% QoQ growth)\n**Churn Rate:** 2.1% vs industry average 3.8%\n\n**Regional Breakdown:**\n| Region | Revenue | Share |\n|--------|---------|-------|\n| North America | $610K | 49% |\n| Europe | $340K | 27% |\n| Asia-Pacific | $220K | 18% |\n| Rest of World | $70K | 6% |\n\nKey insight: Asia-Pacific grew fastest (63% QoQ), making it the top expansion opportunity for 2025. Enterprise plans now account for 68% of revenue, improving predictability.' },
          { role: 'user', content: 'Create a bar chart for regional revenue' },
          { role: 'assistant', content: 'Here is the Q4 regional revenue chart:\n\n```json\n{"artifact_type":"chart","title":"Q4 2024 Revenue by Region","type":"bar","data":[{"region":"North America","revenue":610000},{"region":"Europe","revenue":340000},{"region":"Asia-Pacific","revenue":220000},{"region":"Rest of World","revenue":70000}],"x_key":"region","y_keys":["revenue"],"description":"North America leads at 49%. Asia-Pacific shows strongest growth momentum."}\n```\n\nAsia-Pacific at 18% is the most exciting growth story — tripling in share from 11% in Q3 to 18% in Q4.' },
        ],
      },
      {
        title: 'Monthly revenue growth 2024',
        messages: [
          { role: 'user', content: 'Show me a line chart of monthly revenue through 2024' },
          { role: 'assistant', content: 'Here is the 2024 monthly revenue trend:\n\n```json\n{"artifact_type":"chart","title":"AgentDesk Monthly Revenue 2024","type":"line","data":[{"month":"Jan","revenue":285000},{"month":"Feb","revenue":312000},{"month":"Mar","revenue":378000},{"month":"Apr","revenue":445000},{"month":"May","revenue":523000},{"month":"Jun","revenue":618000},{"month":"Jul","revenue":724000},{"month":"Aug","revenue":845000},{"month":"Sep","revenue":967000},{"month":"Oct","revenue":1089000},{"month":"Nov","revenue":1156000},{"month":"Dec","revenue":1240000}],"x_key":"month","y_keys":["revenue"],"description":"335% revenue growth from $285K in January to $1.24M in December 2024."}\n```\n\n**Key milestones:** May inflection from Product Hunt (+1,200 signups), August TechCrunch coverage, sustained 15% month-over-month growth.' },
        ],
      },
      {
        title: 'Explain AI agents to my professor',
        messages: [
          { role: 'user', content: 'Explain how AI agents work in simple terms for a college presentation' },
          { role: 'assistant', content: '**AI Agents — Simple Explanation**\n\nAn AI agent is an AI that can not only *answer questions* but also *take actions* to accomplish goals.\n\n**Traditional AI (ChatGPT style):**\nUser: "What is 2+2?" → AI: "4"\n\n**AI Agent:**\nUser: "Analyze our sales data and create a report" → Agent plans steps → queries data → runs calculations → generates chart → writes report → delivers result\n\n**The key difference: Tool Use**\nAgents have access to tools — calculator, database queries, chart generators, file creators. They decide which tools to use and in what order.\n\n**How AgentDesk agents work:**\n1. Receive your request\n2. Search knowledge base for relevant context\n3. Plan which tools to use\n4. Execute tools (validated, sandboxed)\n5. Use results to form response\n6. Extract learnable insights for future use\n\nThis is exactly how modern AI coworkers like PromptQL and AgentDesk work — the AI becomes an *active participant* in getting work done, not just a passive answerer.' },
        ],
      },
      {
        title: 'Create customer segments report',
        messages: [
          { role: 'user', content: 'Create a comprehensive customer segmentation report' },
          { role: 'assistant', content: '# Customer Segmentation Analysis Report\n\n## Executive Summary\nAgentDesk serves 847 paying customers across three primary segments. Enterprise clients generate disproportionate value at 68% of revenue from just 23% of the customer base.\n\n## Segment Breakdown\n\n| Segment | Customers | Revenue Share | Avg ACV | Churn |\n|---------|-----------|---------------|---------|-------|\n| Enterprise (500+ employees) | 195 (23%) | 68% | $28,500 | 0.8% |\n| Mid-Market (50-500) | 347 (41%) | 28% | $6,100 | 2.3% |\n| SMB (<50 employees) | 305 (36%) | 4% | $990 | 4.1% |\n\n## Key Insights\n\n**Enterprise:** Highest value, lowest churn. These customers use 4.8 agents on average and integrate 3+ data sources. Primary buyers are Head of Data and VP Operations.\n\n**Mid-Market:** Sweet spot for growth. Fast adoption, upgrade path to Enterprise within 18 months for 85% of accounts.\n\n**SMB:** High volume, low revenue. Product-led growth opportunity — focus on self-serve onboarding.\n\n## Recommendations\n1. Build dedicated enterprise success team (ROI: 23% reduction in Enterprise churn = $580K ARR protected)\n2. Create "data team starter kit" for Mid-Market (reduce time-to-value from 14 to 3 days)\n3. Launch freemium tier for SMB to build funnel (convert at 8% = 240 new paid accounts)\n\n*Report generated by AgentDesk Data Analyst — November 2024*' },
        ],
      },
      {
        title: 'Compare AI platforms for data work',
        messages: [
          { role: 'user', content: 'How does AgentDesk compare to PromptQL and other AI tools for data analysis?' },
          { role: 'assistant', content: 'Great question for your presentation! Here is an honest comparison:\n\n## AgentDesk vs Competitors\n\n| Feature | AgentDesk | PromptQL | Notion AI | ChatGPT Ent. |\n|---------|-----------|----------|-----------|---------------|\n| Tool calling | Yes (9 tools) | Yes | Limited | Yes |\n| Data connectors | 4 types | 10+ types | No | No |\n| Knowledge base | Full-text search | Semantic | No | No |\n| Scheduled tasks | Yes | Yes | No | No |\n| Pricing | $29-99/mo | $40+/user/mo | $10/mo add-on | $30/user/mo |\n| Open stack | Yes | No | No | No |\n\n## Where PromptQL wins\n- More data connectors (Salesforce, BigQuery, etc.)\n- Better semantic search with vector embeddings\n- Multiplayer real-time collaboration\n\n## Where AgentDesk wins\n- 73% more affordable for a 5-person team\n- Open source-friendly (you can extend it)\n- Insight extraction from conversations\n- No per-seat pricing for small teams\n\n**Bottom line:** For enterprise teams with existing data infrastructure, PromptQL is more mature. For startups, researchers, and teams wanting full control, AgentDesk offers the best value.' },
        ],
      },
    ];

    for (let ci = 0; ci < convs.length; ci++) {
      const conv = convs[ci];
      const convId = uuidv4();
      const daysAgo = (convs.length - ci) * 2;
      await client.query(
        'INSERT INTO conversations (id,workspace_id,user_id,title,created_at,updated_at) VALUES ($1,$2,$3,$4,NOW()-$5::INTERVAL,NOW()-$6::INTERVAL)',
        [convId, wsId, userId, conv.title, (daysAgo + 1) + ' days', daysAgo + ' hours']
      );
      for (const msg of conv.messages) {
        await client.query(
          'INSERT INTO messages (id,conversation_id,role,content) VALUES ($1,$2,$3,$4)',
          [uuidv4(), convId, msg.role, msg.content]
        );
      }
      console.log('  Conversation: ' + conv.title + ' (' + conv.messages.length + ' messages)');
    }

    // ── Artifacts ────────────────────────────────────────────────────────
    type Artifact = { name: string; type: string; mime: string; content: string };
    const artifacts: Artifact[] = [
      {
        name: 'Q4 2024 Sales Report.md', type: 'report', mime: 'text/markdown',
        content: '# Q4 2024 Sales Performance Report\n\nRevenue: $1.24M | New Customers: 134 | Churn: 2.1%\n\n## Highlights\n- 12.7% above revenue target\n- Asia-Pacific grew 63% QoQ\n- Enterprise plans drive 68% of revenue\n\n*Generated by AgentDesk Business Analyst*',
      },
      {
        name: 'Monthly Revenue 2024.csv', type: 'csv', mime: 'text/csv',
        content: 'month,revenue,users,growth_pct\nJan 2024,285000,1240,\nFeb 2024,312000,1580,9.5\nMar 2024,378000,2100,21.2\nApr 2024,445000,2890,17.7\nMay 2024,523000,3750,17.5\nJun 2024,618000,4820,18.2\nJul 2024,724000,6100,17.2\nAug 2024,845000,7340,16.7\nSep 2024,967000,8900,14.4\nOct 2024,1089000,10200,12.6\nNov 2024,1156000,12100,6.2\nDec 2024,1240000,14500,7.3',
      },
      {
        name: 'Customer Segments Analysis.md', type: 'markdown', mime: 'text/markdown',
        content: '# Customer Segmentation Analysis\n\nEnterprise (23% of customers) generates 68% of revenue at $28,500 ACV.\nMid-Market (41%) generates 28% at $6,100 ACV.\nSMB (36%) generates 4% at $990 ACV.\n\n## Recommendations\n1. Build enterprise success team\n2. Mid-market self-serve onboarding\n3. Freemium tier for SMB funnel',
      },
      {
        name: 'Competitor Pricing Matrix.csv', type: 'csv', mime: 'text/csv',
        content: 'product,starter_price,pro_price,enterprise_price,tool_calling,data_connectors\nAgentDesk,$29/mo,$99/mo,Custom,Yes,4 types\nPromptQL,$0/mo,$40/user/mo,$1000+/mo,Yes,10+ types\nNotion AI,N/A,$10/mo addon,Custom,Limited,No\nChatGPT Enterprise,N/A,N/A,$30/user/mo,Yes,No',
      },
    ];

    for (const a of artifacts) {
      await client.query(
        'INSERT INTO artifacts (id,workspace_id,user_id,name,type,content,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',
        [uuidv4(), wsId, userId, a.name, a.type, a.content, a.mime, a.content.length]
      );
      console.log('  Artifact: ' + a.name);
    }

    // ── Tasks ────────────────────────────────────────────────────────────
    const tasks = [
      { type: 'ai_agent_run',    status: 'completed', input: { prompt: 'Generate Q4 sales report' } },
      { type: 'chart_generation', status: 'completed', input: { title: 'Monthly Revenue 2024' } },
      { type: 'csv_export',      status: 'completed', input: { table: 'sales_data', rows: 847 } },
      { type: 'knowledge_search', status: 'completed', input: { query: 'revenue growth metrics' } },
      { type: 'ai_agent_run',    status: 'failed',    input: { prompt: 'Connect to Salesforce CRM' } },
      { type: 'scheduled_analysis', status: 'queued', input: { schedule: 'daily_metrics' } },
    ];

    for (const t of tasks) {
      const isActive = t.status !== 'queued';
      const isDone = t.status === 'completed' || t.status === 'failed';
      await client.query(
        'INSERT INTO tasks (id,workspace_id,user_id,type,status,input,error) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [uuidv4(), wsId, userId, t.type, t.status, JSON.stringify(t.input),
         t.status === 'failed' ? 'Connector not configured' : null]
      );
      console.log('  Task: ' + t.type + ' (' + t.status + ')');
    }

    // ── Usage records ────────────────────────────────────────────────────
    for (let i = 0; i < 50; i++) {
      await client.query(
        "INSERT INTO usage_records (user_id,workspace_id,resource_type,amount,created_at) VALUES ($1,$2,'ai_message',1,NOW()-($3 * INTERVAL '6 hours'))",
        [userId, wsId, i]
      );
    }
    console.log('  Usage records: 50 AI messages');

    // ── Scheduled jobs ───────────────────────────────────────────────────
    const jobs = [
      { name: 'Daily Revenue Summary',    prompt: 'Pull latest revenue metrics and flag anomalies.', mins: 1440 },
      { name: 'Weekly Competitor Monitor', prompt: 'Check for pricing changes from PromptQL and Notion AI.', mins: 10080 },
      { name: 'Pipeline Health Check',    prompt: 'Flag deals stagnant for more than 14 days.', mins: 1440 },
    ];

    for (const j of jobs) {
      const ex = await client.query('SELECT id FROM scheduled_jobs WHERE name=$1 AND workspace_id=$2 LIMIT 1', [j.name, wsId]);
      if (ex.rows.length) continue;
      await client.query(
        "INSERT INTO scheduled_jobs (id,workspace_id,user_id,name,prompt,interval_minutes,is_active,next_run_at) VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW()+($7 * INTERVAL '1 minute'))",
        [uuidv4(), wsId, userId, j.name, j.prompt, j.mins, j.mins]
      );
      console.log('  Schedule: ' + j.name);
    }

    // ── Audit logs ───────────────────────────────────────────────────────
    for (const action of ['user.login','conversation.create','agent.create','artifact.download','knowledge.create']) {
      await client.query(
        "INSERT INTO audit_logs (user_id,workspace_id,action,resource_type,created_at) VALUES ($1,$2,$3,'user',NOW()-((random()*72)||' hours')::INTERVAL)",
        [userId, wsId, action]
      );
    }
    console.log('  Audit logs: 5 events');

    await client.query('COMMIT');

    console.log(`
╔══════════════════════════════════════════════════════╗
║     Demo Data Seeded! Ready for College Presentation  ║
╠══════════════════════════════════════════════════════╣
║  Users:          3 (Ansh, Priya, Arjun)              ║
║  Agents:         5 (templates + Sales Intelligence)  ║
║  Conversations:  5 (with full message history)       ║
║  Knowledge Docs: 8 (business, technical, market)     ║
║  Artifacts:      4 (reports, CSVs)                   ║
║  Data Sources:   4 (CSV, Sheets, API, Postgres)      ║
║  Tasks:          6 (completed, failed, queued)       ║
║  Schedules:      3 recurring jobs                    ║
║  Usage Records:  50 AI messages                      ║
╠══════════════════════════════════════════════════════╣
║  Login: ansh@agentdesk.dev / demo1234                ║
╚══════════════════════════════════════════════════════╝
    `);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[demo-seed] FAILED:', err.message);
  process.exit(1);
});
