import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = resolve(root, '.env');
let exists = false;
try {
  await access(envPath);
  exists = true;
} catch {}
if (exists) {
  console.log('.env exists; left unchanged.');
} else {
  let env = await readFile(resolve(root, '.env.example'), 'utf8');
  const password = randomBytes(18).toString('base64url');
  env = env.replaceAll('CHANGE_ME', password);
  await writeFile(envPath, env, { mode: 0o600 });
  console.log(
    'Created local .env. Demo users: kierownik / pracownik. Password is stored as DEMO_PASSWORD in .env.',
  );
}
await mkdir(resolve(root, '.data'), { recursive: true });
