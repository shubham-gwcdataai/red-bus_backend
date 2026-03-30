import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

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
    } else {
      console.log('⚙️  Running migrations...');
      const fs = await import('fs');
      const path = await import('path');
      const sqlPath = path.resolve(__dirname, '../../migrations/001_init.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      console.log('✅ Migrations complete');
    }

    // Always ensure the admin user exists, regardless of whether migrations ran.
    // This fixes the 401 error when admin row is missing from an existing database.
    await ensureAdminUser(client);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
};

const ensureAdminUser = async (client: PoolClient): Promise<void> => {
  // bcrypt hash of "Admin@123" with 12 rounds — generated with bcryptjs
  const adminHash = '$2b$12$NQNxeOnkWHekqpvgww.5oesBjx2k9YOQpkqq4rpIlkJmix57tm.bi';

  await client.query(`
    INSERT INTO users (name, email, phone, password, role)
    VALUES ('Admin User', 'admin@redbus.com', '9999999999', $1, 'admin')
    ON CONFLICT (email) DO UPDATE
      SET password = EXCLUDED.password,
          role = 'admin'
  `, [adminHash]);

  console.log('✅ Admin user ensured (admin@redbus.com / Admin@123)');
};
