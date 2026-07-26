import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PROJECT, validateProject } from '@neon-divide/content';
import {
  commitHistory, connectableRooms, createActor, createDialogue, createHistory,
  createItem, createJob, createRoom, dirtyResourceNames, doorwayCells,
  doorwayEdits, freeDirections, idError, layoutRooms, paintTile, redoHistory,
  undoHistory,
} from '../src/model.js';

/** Wall characters, as the editor derives them from the tileset metadata. */
const SOLID = new Set(['|', '^', '#', 'I', 'j', 'N', 'W', 'w', 'C', 'L', '(']);

/** Every creator has the same contract: the project stays saveable. */
function assertValid(project) {
  const result = validateProject(project);
  const errors = result.issues.filter((entry) => entry.severity === 'error');
  assert.deepEqual(errors, [], `expected no validation errors, got ${JSON.stringify(errors)}`);
  assert.equal(result.valid, true);
}

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

describe('new record ids', () => {
  it('rejects ids that are missing, malformed or already taken', () => {
    assert.match(idError(PROJECT, 'room', ''), /required/);
    assert.match(idError(PROJECT, 'room', 'Sodium Alley'), /lower case/);
    assert.match(idError(PROJECT, 'room', '2nd_floor'), /lower case/);
    assert.match(idError(PROJECT, 'room', 'plaza'), /already exists/);
    assert.equal(idError(PROJECT, 'room', 'cargo_bay'), null);
  });

  it('scopes collisions to the right collection', () => {
    // "guard" is both an enemy and an NPC archetype, and neither is an item.
    assert.match(idError(PROJECT, 'enemy', 'guard'), /already exists/);
    assert.match(idError(PROJECT, 'npc', 'guard'), /already exists/);
    assert.equal(idError(PROJECT, 'item', 'guard'), null);
  });
});

describe('creating rooms', () => {
  it('only offers sides that are not already an exit', () => {
    // plaza already runs north, east and south.
    assert.deepEqual(freeDirections(PROJECT, 'plaza'), ['west']);
    assert.deepEqual(freeDirections(PROJECT, 'rooftop').sort(), ['east', 'north', 'south', 'west']);
    assert.ok(connectableRooms(PROJECT).includes('market'));
  });

  it('refuses to overwrite an exit rather than stranding what it led to', () => {
    assert.throws(
      () => createRoom(PROJECT, { id: 'cargo_bay', name: 'Cargo Bay', connectTo: 'plaza', direction: 'east' }),
      /already has a east exit to "market"/,
    );
  });

  it('wires both exits and registers the room in its level', () => {
    const next = createRoom(PROJECT, {
      id: 'cargo_bay', name: 'Cargo Bay', connectTo: 'plaza', direction: 'west',
    });
    assertValid(next);
    assert.equal(next.rooms.plaza.exits.west, 'cargo_bay');
    assert.equal(next.rooms.cargo_bay.exits.east, 'plaza');
    // The exits plaza already had must survive.
    assert.equal(next.rooms.plaza.exits.east, 'market');
    assert.ok(next.levels.level01.rooms.includes('cargo_bay'));
    assert.deepEqual(next.rooms.cargo_bay.spawns, []);
  });

  it('opens a doorway on the wall facing the room it connects from', () => {
    const east = createRoom(PROJECT, { id: 'a_room', name: 'A', connectTo: 'market', direction: 'east' });
    // Entered from the east, so the way back out is the west wall.
    assert.equal(east.rooms.a_room.decor[7][0], ' ');
    assert.equal(east.rooms.a_room.decor[8][0], ' ');
    assert.notEqual(east.rooms.a_room.decor[6][0], ' ');

    const south = createRoom(PROJECT, { id: 'b_room', name: 'B', connectTo: 'market', direction: 'south' });
    assert.equal(south.rooms.b_room.decor[0][9], ' ');
    assert.equal(south.rooms.b_room.decor[0][10], ' ');
  });

  it('opens the matching doorway in the room it connects from', () => {
    // market's east wall is solid wall_side at the doorway rows.
    assert.equal(PROJECT.rooms.market.decor[7][19], '|');
    const next = createRoom(PROJECT, {
      id: 'a_room', name: 'A', connectTo: 'market', direction: 'east', solidChars: SOLID,
    });
    assert.equal(next.rooms.market.decor[7][19], ' ');
    assert.equal(next.rooms.market.decor[8][19], ' ');
    // Only the doorway rows - the rest of that wall is left alone.
    assert.equal(next.rooms.market.decor[6][19], PROJECT.rooms.market.decor[6][19]);
    assert.equal(next.rooms.market.decor[9][19], PROJECT.rooms.market.decor[9][19]);
  });

  it('puts both doorways on the same cells so the crossing lines up', () => {
    // RoomManager.entryPosition carries the perpendicular coordinate across.
    const out = doorwayCells('east').map((cell) => cell.y);
    const back = doorwayCells('west').map((cell) => cell.y);
    assert.deepEqual(out, back);
    assert.deepEqual(doorwayCells('north').map((cell) => cell.x), doorwayCells('south').map((cell) => cell.x));
  });

  it('removes only tiles that actually block', () => {
    // Nothing is solid, so there is nothing worth clearing from the wall.
    const next = createRoom(PROJECT, {
      id: 'a_room', name: 'A', connectTo: 'market', direction: 'east', solidChars: new Set(),
    });
    assert.deepEqual(next.rooms.market.decor, PROJECT.rooms.market.decor);
  });

  it('clears whatever is in the way when solidity is unknown', () => {
    const next = createRoom(PROJECT, {
      id: 'a_room', name: 'A', connectTo: 'market', direction: 'east', solidChars: null,
    });
    assert.equal(next.rooms.market.decor[7][19], ' ');
  });

  it('leaves an already-open edge untouched', () => {
    const opened = structuredClone(PROJECT);
    const wall = [...opened.rooms.market.decor[7]];
    wall[19] = ' ';
    opened.rooms.market.decor[7] = wall.join('');

    assert.deepEqual(doorwayEdits(opened.rooms.market, 'east', SOLID), [{ x: 19, y: 8 }]);
    const next = createRoom(opened, {
      id: 'a_room', name: 'A', connectTo: 'market', direction: 'east', solidChars: SOLID,
    });
    assert.equal(next.rooms.market.decor[7], opened.rooms.market.decor[7]);
    assert.equal(next.rooms.market.decor[8][19], ' ');
  });

  it('stays valid in every direction', () => {
    for (const direction of freeDirections(PROJECT, 'rooftop')) {
      assertValid(createRoom(PROJECT, {
        id: `room_${direction}`, name: 'Test', connectTo: 'rooftop', direction,
      }));
    }
  });

  it('leaves the canonical project untouched', () => {
    const exits = JSON.stringify(PROJECT.rooms.plaza.exits);
    const decor = JSON.stringify(PROJECT.rooms.plaza.decor);
    const rooms = PROJECT.levels.level01.rooms.length;
    createRoom(PROJECT, {
      id: 'c_room', name: 'C', connectTo: 'plaza', direction: 'west', solidChars: SOLID,
    });
    assert.equal(JSON.stringify(PROJECT.rooms.plaza.exits), exits);
    // The source room's art is edited now, so it especially must be a copy.
    assert.equal(JSON.stringify(PROJECT.rooms.plaza.decor), decor);
    assert.equal(PROJECT.levels.level01.rooms.length, rooms);
    assert.equal(PROJECT.rooms.c_room, undefined);
  });
});

describe('creating actors, items, dialogue and jobs', () => {
  it('creates an enemy archetype that room spawns can reference', () => {
    const next = createActor(PROJECT, 'enemies', { id: 'sec_heavy', name: 'Heavy', sheet: 'guard' });
    assertValid(next);
    assert.equal(next.actors.enemies.sec_heavy.brain, 'patrol');
    assert.equal(next.actors.enemies.sec_heavy.sheet, 'guard');
  });

  it('creates an NPC archetype with only the fields NPCs use', () => {
    const next = createActor(PROJECT, 'npcs', { id: 'medic', name: 'Street Doc', sheet: 'civ_a' });
    assertValid(next);
    assert.deepEqual(next.actors.npcs.medic, { sheet: 'civ_a', name: 'Street Doc' });
  });

  it('creates an item', () => {
    const next = createItem(PROJECT, { id: 'lockpick', name: 'Lockpick', icon: 'keycard', desc: 'Old school.' });
    assertValid(next);
    assert.equal(next.items.lockpick.name, 'Lockpick');
  });

  it('creates a dialogue graph whose start node exists', () => {
    const next = createDialogue(PROJECT, { id: 'medic_intro', speaker: 'Doc', portrait: 'kaz' });
    assertValid(next);
    const graph = next.dialogues.medic_intro;
    assert.ok(graph.nodes[graph.start], 'start node must exist');
  });

  it('omits the portrait when none was chosen', () => {
    const next = createDialogue(PROJECT, { id: 'no_face', speaker: 'Voice', portrait: '' });
    assertValid(next);
    assert.equal('portrait' in next.dialogues.no_face, false);
  });

  it('creates a job seeded with one reachable objective', () => {
    const next = createJob(PROJECT, { id: 'job_courier', title: 'Courier Run', startRoom: 'plaza' });
    assertValid(next);
    assert.equal(next.jobs.job_courier.objectives.length, 1);
    assert.equal(next.jobs.job_courier.objectives[0].room, 'plaza');
  });
});

describe('dirty resources', () => {
  it('identifies only changed canonical domains', () => {
    const edited = structuredClone(PROJECT);
    edited.items.medkit.name = 'Patch';
    assert.deepEqual(dirtyResourceNames(edited, PROJECT, ['rooms', 'items', 'jobs']), ['items']);
  });
});
