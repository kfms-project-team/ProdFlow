import { openDatabase, migrate } from './index.cjs';
import { seed } from './seed.cjs';
if (process.env.NODE_ENV === 'production' && process.argv[2] === 'seed')
  throw new Error('Demo seed is disabled in production');
const db = await openDatabase();
try {
  if (process.argv[2] === 'migrate') console.log('Migrations:', await migrate(db));
  else if (process.argv[2] === 'seed') {
    if (process.env.ALLOW_DEMO_SEED !== 'true')
      throw new Error('Set ALLOW_DEMO_SEED=true explicitly');
    console.log('Seed:', await seed(db, process.env.DEMO_PASSWORD));
  } else throw new Error('Usage: cli.mjs migrate|seed');
} finally {
  await db.close();
}
