const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const ROOT = path.resolve(__dirname, '../..');

async function openDatabase(options = {}) {
  const driver = options.driver || process.env.DATABASE_DRIVER || 'postgres';
  if (driver === 'pglite') {
    const { PGlite } = require('@electric-sql/pglite');
    const location = options.memory
      ? undefined
      : path.resolve(ROOT, process.env.PGLITE_DIR || '.data/prodflow');
    const db = new PGlite(location);
    await db.waitReady;
    return {
      driver,
      query: (sql, args = []) => db.query(sql, args),
      exec: (sql) => db.exec(sql),
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({ query: (sql, args = []) => tx.query(sql, args), exec: (sql) => tx.exec(sql) }),
        ),
      close: () => db.close(),
    };
  }
  if (driver !== 'postgres') throw new Error('DATABASE_DRIVER must be postgres or pglite');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
  });
  return {
    driver,
    query: (sql, args = []) => pool.query(sql, args),
    exec: (sql) => pool.query(sql),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: (sql, args = []) => client.query(sql, args),
          exec: (sql) => client.query(sql),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function migrate(db) {
  // Migration deployment must be serialized; checksum detects edited historical migrations.
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(734092120)');
    await tx.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const previous = (await tx.query('SELECT name, checksum FROM schema_migrations')).rows;
    const files = (await fs.readdir(path.join(__dirname, 'migrations')))
      .filter((x) => x.endsWith('.sql'))
      .sort();
    const applied = [];
    for (const name of files) {
      const sql = await fs.readFile(path.join(__dirname, 'migrations', name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = previous.find((x) => x.name === name);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Migration checksum mismatch: ${name}`);
        continue;
      }
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)', [
        name,
        checksum,
      ]);
      applied.push(name);
    }
    return applied;
  });
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 32);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  const parts = String(encoded).split('$');
  if (
    parts.length !== 3 ||
    parts[0] !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{64}$/.test(parts[2])
  )
    return false;
  const actual = await scrypt(password, parts[1], 32);
  return crypto.timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}
module.exports = { ROOT, openDatabase, migrate, hashPassword, verifyPassword };
