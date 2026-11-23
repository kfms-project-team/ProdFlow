import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await import('./setup.mjs');
loadEnvFile(resolve('.env'));
const { openDatabase, migrate } = await import('../packages/database/index.cjs');
const { seed } = await import('../packages/database/seed.cjs');
if (process.env.DATABASE_DRIVER !== 'pglite' || process.env.NODE_ENV === 'production')
  throw new Error(
    'start-local is only for the local PGlite demo. Use the documented PostgreSQL workflow otherwise.',
  );
const db = await openDatabase();
try {
  console.log('Migracje:', await migrate(db));
  if (process.env.ALLOW_DEMO_SEED === 'true')
    console.log('Dane demonstracyjne:', await seed(db, process.env.DEMO_PASSWORD));
} finally {
  await db.close();
}
await import('./dev.mjs');
