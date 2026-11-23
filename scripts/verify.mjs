import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (args, cwd = root) => {
  const r = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
};
run(['apps/api/node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json']);
run(['apps/web/node_modules/typescript/bin/tsc', '-p', 'apps/web/tsconfig.json']);
run([resolve(root, 'apps/web/node_modules/vite/bin/vite.js'), 'build'], resolve(root, 'apps/web'));
run(['--test', 'apps/api/test/integration.test.cjs']);
