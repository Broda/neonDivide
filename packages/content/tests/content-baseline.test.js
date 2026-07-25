import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  DIALOGUES, ENEMIES, ITEMS, JOBS, LEGEND, NPCS, OBJECTIVE_TYPES, PROJECT,
} from '../src/index.js';

const tilesMeta = JSON.parse(readFileSync(
  new URL('../../../apps/game/public/assets/tiles_neokyoto.json', import.meta.url),
  'utf8',
));
const tileNames = new Set(tilesMeta.tiles.map((tile) => tile.name));
const rooms = Object.entries(PROJECT.rooms);

describe('tile legend baseline', () => {
  it('maps every legend character to a generated tile', () => {
    for (const [character, name] of Object.entries(LEGEND)) {
      assert.ok(tileNames.has(name), `legend '${character}' -> unknown tile "${name}"`);
    }
  });
});

describe('room content baseline', () => {
  for (const [id, room] of rooms) {
    describe(id, () => {
      it('has correctly sized layers', () => {
        for (const layer of ['ground', 'decor']) {
          assert.equal(room[layer].length, 15);
          room[layer].forEach((row) => assert.equal(row.length, 20));
        }
      });
      it('uses only known legend characters', () => {
        for (const layer of ['ground', 'decor']) {
          room[layer].forEach((row) => [...row].forEach((character) => {
            if (character !== ' ') assert.ok(LEGEND[character]);
          }));
        }
      });
      it('points every exit and door at a real room', () => {
        Object.values(room.exits ?? {}).forEach((target) => assert.ok(PROJECT.rooms[target]));
        (room.spawns ?? []).filter((spawn) => spawn.type === 'door' && spawn.to)
          .forEach((spawn) => assert.ok(PROJECT.rooms[spawn.to]));
      });
      it('has valid spawn references and coordinates', () => {
        for (const spawn of room.spawns ?? []) {
          assert.ok(spawn.x >= 0 && spawn.x < 20);
          assert.ok(spawn.y >= 0 && spawn.y < 15);
          if (spawn.type === 'enemy') assert.ok(ENEMIES[spawn.archetype]);
          if (spawn.type === 'npc') assert.ok(NPCS[spawn.archetype]);
          if (spawn.type === 'pickup') assert.ok(ITEMS[spawn.item]);
          if (spawn.openTile) assert.ok(tileNames.has(spawn.openTile));
        }
      });
      it('resolves named door entries', () => {
        for (const spawn of room.spawns ?? []) {
          if (spawn.type !== 'door' || !spawn.to || !spawn.entry) continue;
          const destination = PROJECT.rooms[spawn.to];
          assert.ok(destination.entries?.[spawn.entry] || ['north', 'south', 'east', 'west'].includes(spawn.entry));
        }
      });
      it('references dialogue graphs that exist', () => {
        for (const spawn of room.spawns ?? []) {
          const keys = [spawn.dialogue, spawn.lockedDialogue, ...(spawn.dialogueRules ?? []).map((rule) => rule.dialogue)].filter(Boolean);
          keys.forEach((key) => assert.ok(DIALOGUES[key], `${id}: unknown dialogue "${key}"`));
        }
      });
    });
  }

  it('makes every room reachable from the level start', () => {
    const level = PROJECT.levels.level01;
    const seen = new Set([level.start]);
    const queue = [level.start];
    while (queue.length) {
      const room = PROJECT.rooms[queue.shift()];
      const targets = [
        ...Object.values(room.exits ?? {}),
        ...(room.spawns ?? []).filter((spawn) => spawn.type === 'door' && spawn.to).map((spawn) => spawn.to),
      ];
      for (const target of targets) if (!seen.has(target)) { seen.add(target); queue.push(target); }
    }
    assert.deepEqual([...seen].sort(), [...level.rooms].sort());
  });
});

describe('job content baseline', () => {
  for (const [id, job] of Object.entries(JOBS)) {
    it(`${id} is well formed`, () => {
      assert.equal(job.id, id);
      assert.ok(job.title);
      const objectiveIds = new Set(job.objectives.map((objective) => objective.id));
      for (const objective of job.objectives) {
        assert.ok(OBJECTIVE_TYPES.includes(objective.type));
        (objective.requires ?? []).forEach((required) => assert.ok(objectiveIds.has(required)));
        if (objective.item) assert.ok(ITEMS[objective.item]);
        if (objective.room) assert.ok(PROJECT.rooms[objective.room]);
        if (objective.archetype) assert.ok(ENEMIES[objective.archetype]);
      }
    });
  }
});

describe('dialogue content baseline', () => {
  for (const [graphId, graph] of Object.entries(DIALOGUES)) {
    it(`${graphId} has no dangling links`, () => {
      const start = graph.start ?? Object.keys(graph.nodes)[0];
      assert.ok(graph.nodes[start]);
      for (const node of Object.values(graph.nodes)) {
        if (node.next) assert.ok(graph.nodes[node.next]);
        for (const choice of node.choices ?? []) {
          for (const target of [choice.goto, choice.onSuccess?.goto, choice.onFail?.goto].filter(Boolean)) {
            assert.ok(graph.nodes[target]);
          }
        }
      }
    });
    it(`${graphId} references known jobs and items`, () => {
      const encoded = JSON.stringify(graph);
      for (const match of encoded.matchAll(/"(?:startJob|completeJob|failJob)":"([^"]+)"/g)) assert.ok(JOBS[match[1]]);
      for (const match of encoded.matchAll(/"(?:giveItem|takeItem)":"([^"]+)"/g)) assert.ok(ITEMS[match[1]]);
    });
  }
});
