import { Router, Request, Response } from 'express';
import { healthCheck } from '../database/pool';
import { redis } from '../utils/redis';
import { validateConfig, hasGroq, hasRedis, hasDatabase } from '../config';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const { valid, missing, warnings } = validateConfig();
  const dbOk = hasDatabase ? await healthCheck() : false;
  const redisOk = hasRedis ? await redis.health() : false;

  const status = {
    status: valid && dbOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: {
        configured: hasDatabase,
        connected: dbOk,
        message: !hasDatabase ? 'DATABASE_URL not set' : dbOk ? 'Connected' : 'Connection failed',
      },
      redis: {
        configured: hasRedis,
        connected: redisOk,
        message: !hasRedis ? 'Redis not configured (using DB fallback)' : redisOk ? 'Connected' : 'Connection failed',
      },
      groq: {
        configured: hasGroq,
        message: !hasGroq ? 'GROQ_API_KEY not set — running in demo mode' : 'Configured',
      },
    },
    configuration: {
      valid,
      missing_required: missing,
      warnings,
    },
  };

  res.status(valid && dbOk ? 200 : 503).json(status);
});

export default router;
