import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import './utils/dns-fix'; // Fix DNS resolution before any network calls

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config, validateConfig } from './config';
import { initPool } from './database/pool';
import { apiRateLimiter } from './middleware/rateLimiter';

// Import routes
import authRoutes from './routes/auth';
import conversationRoutes from './routes/conversations';
import agentRoutes from './routes/agents';
import artifactRoutes from './routes/artifacts';
import knowledgeRoutes from './routes/knowledge';
import taskRoutes from './routes/tasks';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import dataSourceRoutes from './routes/datasources';
import healthRouter from './routes/health';
import scheduleRoutes from './routes/schedules';

// Load builtin tools
import './tools/builtin';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Set via CORS instead
}));

// CORS
app.use(cors({
  origin: [config.frontendUrl, 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limit all API routes
app.use('/api', apiRateLimiter);

// Routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/artifacts', artifactRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/data-sources', dataSourceRoutes);
app.use('/api/schedules', scheduleRoutes);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Never expose stack traces
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const { valid, missing, warnings } = validateConfig();

if (!valid) {
  console.warn('[config] Missing required variables:', missing.join(', '));
  console.warn('[config] The server will start but some features will be unavailable.');
}

warnings.forEach((w) => console.warn('[config]', w));

// Only start listening when run directly (not when imported in tests)
if (require.main === module) {
  // Initialize pool with DNS workaround, then start server
  initPool().then(() => {
    app.listen(config.port, () => {
      console.log(`\n🚀 AgentDesk API running on http://localhost:${config.port}`);
      console.log(`   Health: http://localhost:${config.port}/api/health`);
      console.log(`   Mode:   ${config.nodeEnv}`);
      console.log(`   Groq:   ${config.groqApiKey ? '✓ configured' : '✗ demo mode'}`);
      console.log(`   Redis:  ${config.upstashRedisUrl ? '✓ configured' : '✗ DB fallback'}`);
      console.log(`   DB:     ${config.databaseUrl ? '✓ configured' : '✗ NOT configured'}\n`);
    });
  }).catch((err) => {
    console.error('[startup] Failed to initialize database pool:', err.message);
    console.warn('[startup] Starting server without database — some features will fail.');
    app.listen(config.port, () => {
      console.log(`\n⚠️  AgentDesk API running on http://localhost:${config.port} (DB unavailable)`);
    });
  });
}

export default app;
