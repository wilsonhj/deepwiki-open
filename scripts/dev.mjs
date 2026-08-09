#!/usr/bin/env node
/**
 * Development runner.
 *
 * Starts three watchers and keeps them together so one Ctrl-C stops
 * everything:
 *
 *   tsc   — recompiles the server on change
 *   node  — restarts the server when its output changes
 *   vite  — serves the client on :5173, proxying /ws and /api to :8080
 *
 * Deliberately hand-rolled rather than pulling in a process runner:
 * Lexo's only production dependency is `ws`, and that is worth keeping.
 */

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [];
let stopping = false;

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, FORCE_COLOR: '1' },
    ...options,
  });
  child.on('exit', (code) => {
    if (stopping) return;
    if (code !== 0 && code !== null) {
      console.error(`\n[dev] ${name} exited with code ${code}`);
      stop(code);
    }
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

// One clean build first, so `node --watch` has something to start from.
console.log('[dev] building core + server…');
const build = spawnSync(npm, ['run', 'build', '-w', '@lexo/core'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const buildServer = spawnSync(npm, ['run', 'build', '-w', '@lexo/server'], {
  cwd: root,
  stdio: 'inherit',
});
if (buildServer.status !== 0) process.exit(buildServer.status ?? 1);

run('tsc', npm, ['exec', '--', 'tsc', '-p', 'packages/server', '--watch', '--preserveWatchOutput']);
run('server', process.execPath, ['--watch', 'packages/server/dist/index.js']);
run('client', npm, ['run', 'dev', '-w', '@lexo/client']);

console.log('\n[dev] client → http://localhost:5173');
console.log('[dev] server → http://localhost:8080\n');
