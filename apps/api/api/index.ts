// Vercel serverless entry — wraps the Express app.
// app.listen is guarded by require.main === module in src/index.ts,
// but initPool() must be ensured before the first request.
import app from '../src/index';
import { initPool } from '../src/database/pool';

const ready = initPool().catch((err) => {
  console.error('[serverless] Failed to initialize database pool:', err);
});

export default async function handler(req: unknown, res: unknown) {
  await ready;
  // Express apps are callable request handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (app as any)(req, res);
}
