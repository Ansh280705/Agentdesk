import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });
import '../utils/dns-fix';
import { initPool, getPool } from './pool';

async function main() {
  await initPool();
  const pool = getPool();
  const users = await pool.query(
    `SELECT u.id, u.email, u.name, wm.role, w.name AS workspace, w.id AS ws_id
     FROM users u
     LEFT JOIN workspace_members wm ON wm.user_id = u.id
     LEFT JOIN workspaces w ON w.id = wm.workspace_id
     ORDER BY w.name, u.email`
  );
  console.log('all users:', JSON.stringify(users.rows, null, 1));
  const orphans = await pool.query(
    `SELECT w.id, w.name, w.owner_id, u.email AS owner_email,
            (SELECT COUNT(*) FROM conversations c WHERE c.workspace_id = w.id) AS conv_count,
            (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count
     FROM workspaces w LEFT JOIN users u ON u.id = w.owner_id ORDER BY w.created_at`
  );
  console.log('workspaces detail:', JSON.stringify(orphans.rows, null, 1));
  const wss = await pool.query(`SELECT id, name, slug, created_at FROM workspaces ORDER BY created_at`);
  console.log('workspaces:', JSON.stringify(wss.rows, null, 1));
  const convs = await pool.query(
    `SELECT id, name, kind, visibility, workspace_id FROM conversations WHERE kind = 'channel'`
  );
  console.log('channels:', JSON.stringify(convs.rows, null, 1));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
