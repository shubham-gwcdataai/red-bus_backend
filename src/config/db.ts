import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Single connection pool — reused across all requests
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max:              20,    // max connections
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