import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
// Calling Node directly avoids platform-dependent .cmd shell quoting.
const children = [];
const run = (args, cwd = root) =>
  spawn(process.execPath, args, { cwd, stdio: 'inherit', windowsHide: true });
const build = run(
  [resolve(root, 'apps/api/node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'],
  resolve(root, 'apps/api'),
);
const code = await new Promise((res) => build.on('exit', res));
if (code !== 0) process.exit(Number(code) || 1);
children.push(run(['--env-file=.env', 'apps/api/dist/main.js']));
children.push(
  run(
    [resolve(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'],
    resolve(root, 'apps/web'),
  ),
);
let closing = false;
const stop = () => {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    stop();
    process.exitCode = code || 0;
  });
