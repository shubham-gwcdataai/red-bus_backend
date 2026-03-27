import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Single connection pool — reused across all requests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,    // max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
  process.exit(1);
});

// Helper: run a query
export const query = (text: string, params?: unknown[]) =>
  pool.query(text, params);

// Helper: get a client for transactions
export const getClient = (): Promise<PoolClient> =>
  pool.connect();

// Test connection on startup
export const testConnection = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    console.log('✅ Database connection test passed');
  } finally {
    client.release();
  }
};

export default pool;
// Run migrations if tables don't exist yet
export const runMigrations = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) AS exists
    `);

    if (rows[0].exists) {
      console.log('✅ Database already migrated — skipping');
      return;
    }

    console.log('⚙️  Running migrations...');
    const fs = await import('fs');
    const path = await import('path');
    const sqlPath = path.resolve(__dirname, '../../migrations/001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('✅ Migrations complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};