import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PROJECT } from '@neon-divide/content';
import {
  commitHistory, createHistory, dirtyResourceNames, layoutRooms, paintTile,
  redoHistory, undoHistory,
} from '../src/model.js';

describe('editor history', () => {
  it('commits, undoes, and redoes immutable project drafts', () => {
    const initial = createHistory(PROJECT);
    const edited = structuredClone(PROJECT);
    edited.rooms.plaza.name = 'Changed';
    const committed = commitHistory(initial, edited);
    assert.equal(committed.present.rooms.plaza.name, 'Changed');
    assert.equal(undoHistory(committed).present.rooms.plaza.name, PROJECT.rooms.plaza.name);
    assert.equal(redoHistory(undoHistory(committed)).present.rooms.plaza.name, 'Changed');
    assert.equal(PROJECT.rooms.plaza.name, 'Kagemori Plaza');
  });

  it('caps retained undo history', () => {
    let history = createHistory(PROJECT);
    for (let index = 0; index < 70; index++) {
      const project = structuredClone(history.present);
      project.rooms.plaza.name = `Edit ${index}`;
      history = commitHistory(history, project);
    }
    assert.equal(history.past.length, 50);
  });
});

describe('room operations', () => {
  it('paints one tile without mutating other rows or canonical content', () => {
    const before = PROJECT.rooms.plaza.decor[4];
    const edited = paintTile(PROJECT, 'plaza', 'decor', 4, 4, 'K');
    assert.equal(edited.rooms.plaza.decor[4][4], 'K');
    assert.equal(PROJECT.rooms.plaza.decor[4], before);
    assert.equal(edited.rooms.plaza.decor[3], PROJECT.rooms.plaza.decor[3]);
  });

  it('ignores out-of-range paint operations', () => {
    assert.equal(paintTile(PROJECT, 'plaza', 'decor', 20, 1, 'K'), PROJECT);
  });

  it('lays out every room in the world graph', () => {
    const positions = layoutRooms(PROJECT.rooms, PROJECT.levels.level01.start);
    assert.deepEqual(Object.keys(positions).sort(), Object.keys(PROJECT.rooms).sort());
    assert.notDeepEqual(positions.plaza, positions.alley);
  });
});

describe('dirty resources', () => {
  it('identifies only changed canonical domains', () => {
    const edited = structuredClone(PROJECT);
    edited.items.medkit.name = 'Patch';
    assert.deepEqual(dirtyResourceNames(edited, PROJECT, ['rooms', 'items', 'jobs']), ['items']);
  });
});
