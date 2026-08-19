import assert from 'node:assert/strict';
import { mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isInvokedDirectly } from '../src/index.js';

test('recognizes an npm-style symlink as the direct executable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'chainrpc-entrypoint-'));
  t.after(() => import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true })));

  const entrypoint = fileURLToPath(new URL('../src/index.js', import.meta.url));
  const executable = join(directory, 'chainrpc-mcp');
  await symlink(entrypoint, executable);

  assert.equal(await isInvokedDirectly(executable), true);
});
