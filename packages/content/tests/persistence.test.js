import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  CONTENT_DIRECTORY, ContentConflictError, readWorkspace, saveResource, saveWorkspace,
} from '../src/node.js';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'neon-content-'));
  await cp(CONTENT_DIRECTORY, directory, { recursive: true });
  return directory;
}

describe('content persistence', () => {
  it('writes a valid resource and advances its revision', async () => {
    const directory = await fixture();
    const before = await readWorkspace(directory);
    const rooms = structuredClone(before.project.rooms);
    rooms.plaza.name = 'Edited Plaza';
    const result = await saveResource('rooms', rooms, before.revisions.rooms, { directory });
    assert.notEqual(result.revision, before.revisions.rooms);
    assert.equal((await readWorkspace(directory)).project.rooms.plaza.name, 'Edited Plaza');
  });

  it('rejects stale revisions', async () => {
    const directory = await fixture();
    const before = await readWorkspace(directory);
    await writeFile(join(directory, 'rooms.json'), `${await readFile(join(directory, 'rooms.json'), 'utf8')}\n`);
    await assert.rejects(
      saveResource('rooms', before.project.rooms, before.revisions.rooms, { directory }),
      ContentConflictError,
    );
  });

  it('does not replace the destination if the atomic write fails', async () => {
    const directory = await fixture();
    const before = await readWorkspace(directory);
    const original = await readFile(join(directory, 'rooms.json'), 'utf8');
    const rooms = structuredClone(before.project.rooms);
    rooms.plaza.name = 'Must not persist';
    await assert.rejects(saveResource('rooms', rooms, before.revisions.rooms, {
      directory,
      beforeRename: () => { throw new Error('simulated failure'); },
    }));
    assert.equal(await readFile(join(directory, 'rooms.json'), 'utf8'), original);
  });

  it('rejects invalid project-wide changes', async () => {
    const directory = await fixture();
    const before = await readWorkspace(directory);
    const rooms = structuredClone(before.project.rooms);
    rooms.plaza.exits.east = 'nowhere';
    await assert.rejects(
      saveResource('rooms', rooms, before.revisions.rooms, { directory }),
      (error) => error.code === 'CONTENT_INVALID',
    );
  });

  it('rolls back every resource when a multi-file replacement fails partway through', async () => {
    const directory = await fixture();
    const before = await readWorkspace(directory);
    const originalRooms = await readFile(join(directory, 'rooms.json'), 'utf8');
    const originalItems = await readFile(join(directory, 'items.json'), 'utf8');
    const rooms = structuredClone(before.project.rooms);
    const items = structuredClone(before.project.items);
    rooms.plaza.name = 'Temporary name';
    items.medkit.name = 'Temporary item';
    await assert.rejects(saveWorkspace(
      { rooms, items },
      { rooms: before.revisions.rooms, items: before.revisions.items },
      { directory, afterRename: (_, index) => { if (index === 0) throw new Error('simulated mid-commit failure'); } },
    ));
    assert.equal(await readFile(join(directory, 'rooms.json'), 'utf8'), originalRooms);
    assert.equal(await readFile(join(directory, 'items.json'), 'utf8'), originalItems);
  });

  it('rejects resource names that could escape the content directory', async () => {
    const directory = await fixture();
    await assert.rejects(saveWorkspace({ '../rooms': {} }, {}, { directory }), TypeError);
  });
});
