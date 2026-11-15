/**
 * Connects an external PostgreSQL database as an AgentDesk data source.
 *
 * What it does:
 *   1. Seeds the EXTERNAL database (connection string arg) with dummy tables + rows
 *   2. Registers a `postgres_readonly` data source for a workspace in the app DB
 *   3. Runs a real query through the tool registry to prove it works
 *
 * Usage (from apps/api):
 *   npx ts-node src/database/seed-datasource.ts "<connection-string>" [user-email] [source-name]
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

import '../utils/dns-fix';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { resolveHost, extractHostname } from '../utils/dns-fix';
import { initPool, getPool } from './pool';
import '../tools/builtin';
import { registry } from '../tools/registry';

const CONNECTION_STRING = process.argv[2];
const TARGET_EMAIL = process.argv[3];
const SOURCE_NAME = process.argv[4] || 'Demo Sales Database';

if (!CONNECTION_STRING) {
  console.error('Usage: ts-node src/database/seed-datasource.ts "<connection-string>" [user-email] [source-name]');
  process.exit(1);
}

async function externalPool() {
  let connStr = CONNECTION_STRING!;
  const hostname = extractHostname(connStr);
  let servername: string | undefined;
  if (hostname) {
    const ip = await resolveHost(hostname);
    if (ip) {
      connStr = connStr
        .replace(hostname, ip)
        .replace(/[?&]sslmode=[^&]*/g, '')
        .replace(/[?&]channel_binding=[^&]*/g, '')
        .replace(/[?&]$/, '');
      servername = hostname;
    }
  }
  return new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false, ...(servername ? { servername } : {}) },
    max: 2,
    connectionTimeoutMillis: 15000,
  });
}

async function seedExternalDb() {
  console.log('[seed] Connecting to external database...');
  const pool = await externalPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        city TEXT,
        country TEXT DEFAULT 'India',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        price NUMERIC(10,2) NOT NULL,
        stock INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL,
        total NUMERIC(10,2) NOT NULL,
        status TEXT DEFAULT 'completed',
        ordered_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT,
        role TEXT,
        salary NUMERIC(10,2),
        hired_at DATE DEFAULT CURRENT_DATE
      );
    `);

    await client.query(`
      INSERT INTO customers (name, email, city, country) VALUES
        ('Aarav Shah', 'aarav@example.com', 'Mumbai', 'India'),
        ('Diya Patel', 'diya@example.com', 'Ahmedabad', 'India'),
        ('Rohan Verma', 'rohan@example.com', 'Delhi', 'India'),
        ('Sneha Iyer', 'sneha@example.com', 'Chennai', 'India'),
        ('Kabir Singh', 'kabir@example.com', 'Jaipur', 'India'),
        ('Emma Wilson', 'emma@example.com', 'London', 'UK'),
        ('Liam Chen', 'liam@example.com', 'Singapore', 'Singapore'),
        ('Olivia Brown', 'olivia@example.com', 'New York', 'USA')
      ON CONFLICT (email) DO NOTHING;

      INSERT INTO products (name, category, price, stock)
      SELECT * FROM (VALUES
        ('Organic Honey 500g', 'Food', 349.00, 120),
        ('Cold-Pressed Coconut Oil', 'Food', 499.00, 85),
        ('Herbal Shampoo', 'Personal Care', 299.00, 200),
        ('Aloe Vera Gel', 'Personal Care', 199.00, 340),
        ('Green Tea 100g', 'Beverages', 249.00, 150),
        ('Almond Butter 250g', 'Food', 599.00, 60),
        ('Turmeric Powder 200g', 'Spices', 149.00, 500),
        ('Bamboo Toothbrush', 'Personal Care', 99.00, 800),
        ('Protein Granola 400g', 'Food', 449.00, 95),
        ('Essential Oil - Lavender', 'Wellness', 699.00, 45)
      ) AS v(name, category, price, stock)
      WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);

      INSERT INTO orders (customer_id, product_id, quantity, total, status, ordered_at)
      SELECT c.id, p.id, v.quantity, v.total, v.status, v.ordered_at
      FROM (VALUES
        ('aarav@example.com',  'Organic Honey 500g',        2, 698.00, 'completed', NOW() - INTERVAL '30 days'),
        ('aarav@example.com',  'Green Tea 100g',            1, 249.00, 'completed', NOW() - INTERVAL '22 days'),
        ('diya@example.com',   'Herbal Shampoo',            1, 299.00, 'completed', NOW() - INTERVAL '18 days'),
        ('rohan@example.com',  'Cold-Pressed Coconut Oil',  1, 499.00, 'completed', NOW() - INTERVAL '15 days'),
        ('rohan@example.com',  'Turmeric Powder 200g',      3, 447.00, 'completed', NOW() - INTERVAL '14 days'),
        ('sneha@example.com',  'Almond Butter 250g',        1, 599.00, 'shipped',   NOW() - INTERVAL '9 days'),
        ('kabir@example.com',  'Protein Granola 400g',      2, 898.00, 'shipped',   NOW() - INTERVAL '6 days'),
        ('emma@example.com',   'Essential Oil - Lavender',  1, 699.00, 'pending',   NOW() - INTERVAL '3 days'),
        ('liam@example.com',   'Aloe Vera Gel',             2, 398.00, 'completed', NOW() - INTERVAL '2 days'),
        ('olivia@example.com', 'Bamboo Toothbrush',         5, 495.00, 'pending',   NOW() - INTERVAL '1 day')
      ) AS v(email, product_name, quantity, total, status, ordered_at)
      JOIN customers c ON c.email = v.email
      JOIN products p ON p.name = v.product_name
      WHERE NOT EXISTS (SELECT 1 FROM orders LIMIT 1);

      INSERT INTO employees (name, department, role, salary, hired_at)
      SELECT * FROM (VALUES
        ('Ananya Rao', 'Engineering', 'Senior Developer', 145000.00, '2022-03-15'::date),
        ('Vikram Nair', 'Engineering', 'DevOps Engineer', 120000.00, '2023-01-10'::date),
        ('Meera Joshi', 'Marketing', 'Marketing Lead', 95000.00, '2021-07-01'::date),
        ('Arjun Desai', 'Sales', 'Sales Executive', 72000.00, '2023-06-20'::date),
        ('Priyanka Menon', 'HR', 'HR Manager', 88000.00, '2020-11-05'::date),
        ('Sanjay Kumar', 'Engineering', 'Junior Developer', 65000.00, '2024-02-12'::date),
        ('Neha Kulkarni', 'Sales', 'Regional Manager', 110000.00, '2019-09-30'::date),
        ('Rahul Bose', 'Marketing', 'Content Writer', 55000.00, '2024-05-18'::date)
      ) AS v(name, department, role, salary, hired_at)
      WHERE NOT EXISTS (SELECT 1 FROM employees LIMIT 1);
    `);

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM customers) AS customers,
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM orders) AS orders,
        (SELECT COUNT(*) FROM employees) AS employees
    `);
    console.log('[seed] External DB seeded:', counts.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

async function registerDataSource(): Promise<{ sourceId: string; userId: string; workspaceId: string }> {
  await initPool();
  const pool = getPool();

  // Pick the target user: explicit email → first non-demo user → any user
  let userRow;
  if (TARGET_EMAIL) {
    const r = await pool.query(`SELECT id, email FROM users WHERE email = $1`, [TARGET_EMAIL]);
    userRow = r.rows[0];
    if (!userRow) throw new Error(`No user found with email ${TARGET_EMAIL}`);
  } else {
    const r = await pool.query(`SELECT id, email FROM users ORDER BY is_demo ASC, created_at DESC LIMIT 1`);
    userRow = r.rows[0];
  }
  if (!userRow) throw new Error('No users in the app database — register an account first.');

  const ws = await pool.query(
    `SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userRow.id]
  );
  let workspaceId: string;
  if (ws.rows.length) {
    workspaceId = ws.rows[0].workspace_id;
  } else {
    workspaceId = uuidv4();
    await pool.query(`INSERT INTO workspaces (id, name, slug, owner_id) VALUES ($1,$2,$3,$4)`,
      [workspaceId, 'My Workspace', `ws-${workspaceId.slice(0, 8)}`, userRow.id]);
    await pool.query(`INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ($1,$2,$3,'owner')`,
      [uuidv4(), workspaceId, userRow.id]);
  }

  // Reuse an existing source with the same name, else create it
  const existing = await pool.query(
    `SELECT id FROM data_sources WHERE workspace_id = $1 AND user_id = $2 AND name = $3`,
    [workspaceId, userRow.id, SOURCE_NAME]
  );

  let sourceId: string;
  const secretConfig = JSON.stringify({ connection_string: CONNECTION_STRING });
  const publicConfig = JSON.stringify({ description: 'Neon PostgreSQL demo database — customers, products, orders, employees' });

  if (existing.rows.length) {
    sourceId = existing.rows[0].id;
    await pool.query(
      `UPDATE data_sources SET type = 'postgres_readonly', status = 'connected',
         config_public = $1, config_encrypted = $2, last_synced_at = NOW()
       WHERE id = $3`,
      [publicConfig, secretConfig, sourceId]
    );
  } else {
    sourceId = uuidv4();
    await pool.query(
      `INSERT INTO data_sources (id, workspace_id, user_id, name, type, status, config_public, config_encrypted, last_synced_at)
       VALUES ($1,$2,$3,$4,'postgres_readonly','connected',$5,$6,NOW())`,
      [sourceId, workspaceId, userRow.id, SOURCE_NAME, publicConfig, secretConfig]
    );
  }

  console.log(`[seed] Data source "${SOURCE_NAME}" (${sourceId}) registered for ${userRow.email}`);
  return { sourceId, userId: userRow.id, workspaceId };
}

async function verify(sourceId: string, userId: string, workspaceId: string) {
  const ctx = { userId, workspaceId };

  console.log('\n[verify] Schema introspection via query_connected_data...');
  const schemaRes = await registry.execute(
    'query_connected_data',
    { source_id: sourceId, description: 'List tables', limit: 20 },
    ctx,
    ['query_connected_data']
  );
  const schema = (schemaRes.result as { schema?: Array<{ table_name: string }> })?.schema;
  console.log('[verify] tables:', schema?.map((t) => t.table_name).join(', ') ?? JSON.stringify(schemaRes));

  console.log('\n[verify] Running SELECT through the tool...');
  const queryRes = await registry.execute(
    'query_connected_data',
    {
      source_id: sourceId,
      description: 'Top 5 orders by total',
      sql: 'SELECT o.id, c.name AS customer, p.name AS product, o.quantity, o.total, o.status FROM orders o JOIN customers c ON c.id = o.customer_id JOIN products p ON p.id = o.product_id ORDER BY o.total DESC LIMIT 5',
      limit: 5,
    },
    ctx,
    ['query_connected_data']
  );
  console.log('[verify] result:', JSON.stringify(queryRes.result ?? queryRes, null, 2));

  console.log('\n[verify] Write-guard check (DROP TABLE should be rejected)...');
  const writeRes = await registry.execute(
    'query_connected_data',
    { source_id: sourceId, description: 'attempted write', sql: 'DROP TABLE customers', limit: 5 },
    ctx,
    ['query_connected_data']
  );
  console.log('[verify] guard:', JSON.stringify(writeRes.result ?? writeRes));
}

async function main() {
  await seedExternalDb();
  const { sourceId, userId, workspaceId } = await registerDataSource();
  await verify(sourceId, userId, workspaceId);
  await getPool().end();
  console.log('\n[done] Data source is connected and queryable.');
}

main().catch((err) => {
  console.error('[seed-datasource] FAILED:', err);
  process.exit(1);
});
