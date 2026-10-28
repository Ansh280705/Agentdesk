import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  jwtSecret: string;
  groqApiKey: string;
  groqModel: string;
  upstashRedisUrl: string;
  upstashRedisToken: string;
  frontendUrl: string;
  appUrl: string;
}

function getRequired(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function getOptional(key: string, defaultVal = ''): string {
  return process.env[key] || defaultVal;
}

export function validateConfig(): { valid: boolean; missing: string[]; warnings: string[] } {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const optional = ['GROQ_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];

  const missing = required.filter((k) => !process.env[k]);
  const warnings: string[] = [];

  if (!process.env['GROQ_API_KEY']) {
    warnings.push('GROQ_API_KEY not set - AI features will run in demo mode');
  }
  if (!process.env['UPSTASH_REDIS_REST_URL']) {
    warnings.push('UPSTASH_REDIS_REST_URL not set - Redis features disabled, using DB fallback');
  }

  return { valid: missing.length === 0, missing, warnings };
}

export const config: Config = {
  port: parseInt(process.env['PORT'] || '3001', 10),
  nodeEnv: getOptional('NODE_ENV', 'development'),
  databaseUrl: getOptional('DATABASE_URL', ''),
  jwtSecret: getOptional('JWT_SECRET', 'dev-secret-change-in-production'),
  groqApiKey: getOptional('GROQ_API_KEY', ''),
  groqModel: getOptional('GROQ_MODEL', 'openai/gpt-oss-120b'),
  upstashRedisUrl: getOptional('UPSTASH_REDIS_REST_URL', ''),
  upstashRedisToken: getOptional('UPSTASH_REDIS_REST_TOKEN', ''),
  frontendUrl: getOptional('FRONTEND_URL', 'http://localhost:5173'),
  appUrl: getOptional('APP_URL', 'http://localhost:3001'),
};

export const isProduction = config.nodeEnv === 'production';
export const hasGroq = !!config.groqApiKey;
export const hasRedis = !!config.upstashRedisUrl && !!config.upstashRedisToken;
export const hasDatabase = !!config.databaseUrl;
