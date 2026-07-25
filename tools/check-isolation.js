import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const gamePackage = JSON.parse(await readFile(resolve(root, 'apps/game/package.json'), 'utf8'));
const dependencies = { ...gamePackage.dependencies, ...gamePackage.devDependencies };

for (const forbidden of ['@neon-divide/editor', 'react', 'react-dom', '@vitejs/plugin-react']) {
  assert.equal(dependencies[forbidden], undefined, `game package must not depend on ${forbidden}`);
}

async function filesBelow(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesBelow(path));
    else output.push(path);
  }
  return output;
}

const sourceFiles = (await filesBelow(resolve(root, 'apps/game/src'))).filter((path) => /\.[cm]?js$/.test(path));
for (const path of sourceFiles) {
  const source = await readFile(path, 'utf8');
  assert.ok(!source.includes('@neon-divide/editor'), `${path} imports the editor`);
  assert.ok(!/from\s+['"]react(?:-dom)?['"]/.test(source), `${path} imports React`);
}

console.log(`Isolation check passed: ${sourceFiles.length} game modules contain no editor or React imports.`);
