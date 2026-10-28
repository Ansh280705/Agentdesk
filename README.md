# AgentDesk — AI Coworker Platform

AgentDesk is a personal AI coworker web application. Users can instruct AI agents in natural language to analyze data, use connected tools, perform multi-step tasks, generate artifacts, and maintain useful context across conversations.

Built with React, Vite, TypeScript, Tailwind CSS, Express, Groq AI, Neon PostgreSQL, and Upstash Redis.

## Features

- **AI Chat Workspace** — Full chat interface with streaming, Markdown rendering, code blocks, tables, follow-up questions, copy, and feedback.
- **Agent Management** — Create, edit, duplicate, enable/disable, and delete custom AI agents with specific system instructions, models, and tool permissions.
- **Tool Calling** — Real tool execution with Zod-validated inputs: calculator, knowledge search, chart generation, CSV export, markdown reports, data source queries, and more.
- **Knowledge Base** — Full-text searchable notes, documents, procedures, and facts using PostgreSQL's built-in search.
- **Artifacts** — Generated reports, charts, CSV exports, and documents stored in the database with download and preview.
- **Data Sources** — Connect external data (JSON API, Google Sheets, CSV uploads, PostgreSQL read-only).
- **Task Management** — Background task queue with status tracking, retry, and cancellation.
- **Authentication** — Secure registration and login with Argon2 password hashing and JWT tokens.
- **Dark/Light Themes** — System-aware theme switching with persistent preferences.
- **Demo Mode** — When Groq API key is missing, the app runs in a clearly labeled demo mode with simulated responses.

## System Architecture

```
agentdesk/
├── apps/
│   ├── api/          Express + TypeScript backend
│   │   └── src/
│   │       ├── config/        Environment configuration
│   │       ├── database/      PostgreSQL pool, migrations, seed
│   │       ├── middleware/    Auth, validation, rate limiting
│   │       ├── routes/        REST API routes
│   │       ├── agents/        AI agent engine (Groq integration)
│   │       ├── tools/         Tool registry and builtin tools
│   │       └── utils/         Redis client, auth utilities
│   └── web/          React + Vite + TypeScript frontend
│       └── src/
│           ├── components/    UI library (Button, Card, Dialog, etc.)
│           ├── pages/        Dashboard, Chat, Agents, Knowledge, etc.
│           ├── features/     Chat rendering, agent forms
│           ├── hooks/        useAuth, useTheme
│           └── lib/          API client, utilities
└── packages/
    └── shared/       Shared TypeScript types
```

## Prerequisites

- **Node.js** 18+ 
- **npm** (comes with Node.js)
- A **Neon** PostgreSQL project (free tier works)
- A **Groq** API key (free tier works)
- **Upstash** Redis (optional — app works without it using DB fallback)

## Setup

### 1. Clone and install

```bash
cd agentdesk
npm install
```

This installs root dependencies. Then install per-package:

```bash
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
# Get your key at: https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key

# Recommended free model (supports tool calling)
GROQ_MODEL=llama-3.3-70b-versatile

# Create a free project at: https://neon.tech
# Copy the connection string from your project dashboard
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Optional: Create at https://upstash.com
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Generate a strong secret:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=your-generated-secret-at-least-64-chars-long

FRONTEND_URL=http://localhost:5173
APP_URL=http://localhost:3001
PORT=3001
NODE_ENV=development
```

### 3. Run database migrations

```bash
npm run migrate
```

This creates all tables (users, workspaces, conversations, messages, agents, tasks, artifacts, knowledge, data sources, etc.).

### 4. Seed demo data (optional)

```bash
npm run seed
```

Creates a demo user (`demo@agentdesk.dev` / `demo1234`) with a workspace and 5 starter agent templates.

### 5. Start the application

```bash
npm run dev
```

This starts both the API (port 3001) and the web frontend (port 5173) concurrently.

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001
- **Health check**: http://localhost:3001/api/health

## Running individually

```bash
# API only
cd apps/api && npm run dev

# Web only
cd apps/web && npm run dev
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both API and web in development mode |
| `npm run build` | Build both API and web for production |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed demo data |
| `npm run test` | Run API tests |
| `npm run typecheck` | Type-check both projects |
| `npm run lint` | Run frontend linter |

## External Service Setup

### Neon PostgreSQL

1. Go to [neon.tech](https://neon.tech) and create a free account
2. Create a new project
3. Copy the connection string from the dashboard
4. Paste it as `DATABASE_URL` in `apps/api/.env`
5. Make sure it includes `?sslmode=require` at the end

### Groq AI

1. Go to [console.groq.com](https://console.groq.com) and sign up
2. Navigate to API Keys and create a new key
3. Paste it as `GROQ_API_KEY` in `apps/api/.env`
4. The default model `llama-3.3-70b-versatile` supports tool calling and is recommended
5. Other supported models: `llama-3.1-8b-instant` (faster), `mixtral-8x7b-32768`, `gemma2-9b-it`

### Upstash Redis (optional)

1. Go to [upstash.com](https://upstash.com) and create a free account
2. Create a new Redis database
3. Copy the REST URL and REST token
4. Paste them as `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `apps/api/.env`

Without Redis, the app uses a database-backed fallback for task coordination and allows all rate-limited requests.

## What works without API keys

- Full UI navigation and all pages
- User registration and login (requires DATABASE_URL)
- Creating and managing agents
- Knowledge base CRUD and search
- Artifacts viewing and download
- Data source management
- Settings and preferences
- **Demo mode chat** — clearly labeled simulated responses when GROQ_API_KEY is missing

## What requires external credentials

- **DATABASE_URL** (Neon): Required for all data persistence. Without it, the server starts but API calls will fail.
- **GROQ_API_KEY**: Required for real AI responses. Without it, chat runs in demo mode.
- **UPSTASH_REDIS_REST_URL/TOKEN**: Optional. Without it, Redis features use DB fallback.

## Free-tier constraints

- **Groq free tier**: Rate limits apply (typically 30 requests/minute). The app has built-in rate limiting to stay within bounds.
- **Neon free tier**: 0.5 GB storage, autoscaling compute. Sufficient for personal use.
- **Upstash free tier**: 10,000 commands/day. The app minimizes Redis usage.
- **Frontend bundle**: ~980KB minified (284KB gzipped). Could be reduced with code splitting.

## Testing

```bash
npm run test
```

Tests cover:
- Auth route validation (registration, login, token verification)
- Tool registry (permission checks, input validation, timeout handling)
- Calculator tool (expression evaluation, blocking non-permitted tools)
- Health check endpoint

## Security

- Passwords hashed with Argon2id
- JWT tokens with 7-day expiry
- Server-side authorization on every user-specific query
- Workspace isolation (users can only access their own data)
- Tool permission enforcement (agents can only call allowed tools)
- Input validation with Zod on all API endpoints
- Rate limiting on auth and AI endpoints
- Security headers via Helmet
- CORS allowlisting
- No secrets exposed to the frontend
- No arbitrary code execution in the agent runtime

## Deployment

### Frontend (Vercel/Netlify)

```bash
cd apps/web
npm run build
# Deploy the dist/ folder
```

Set `VITE_API_URL` to your deployed API URL.

### Backend (Railway/Render/Fly.io)

```bash
cd apps/api
npm run build
npm start
```

Set all environment variables in your deployment dashboard.

### Environment variables for production

Same as `apps/api/.env.example`, but:
- Set `NODE_ENV=production`
- Use a strong random `JWT_SECRET`
- Set `FRONTEND_URL` to your deployed frontend URL
- Set `APP_URL` to your deployed API URL

## Troubleshooting

**"DATABASE_URL is not configured"**
- Make sure `apps/api/.env` exists and has a valid Neon connection string
- Ensure the connection string ends with `?sslmode=require`

**"Demo mode" in chat**
- `GROQ_API_KEY` is not set. Add it to `apps/api/.env` and restart the server

**"Cannot connect to database"**
- Verify your Neon project is active (free tier pauses after inactivity)
- Check the connection string format
- Ensure `?sslmode=require` is included

**Port already in use**
- Change `PORT` in `.env` for the API
- Change the port in `vite.config.ts` for the web

**Migrations fail**
- Ensure your Neon database is accessible
- Try running `npm run migrate` again (migrations are idempotent)

## Known limitations

- No real-time streaming (responses are returned as complete chunks)
- Google Sheets connector requires manual setup (OAuth flow not automated)
- Vector/semantic search not implemented (uses PostgreSQL full-text search instead)
- No file upload processing (UI is ready, backend processing is stub)
- No scheduled jobs/cron (requires a persistent worker process)
- Bundle size warning (could be optimized with code splitting)

## License

Private project. Not for redistribution.
