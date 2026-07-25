import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ROOM_H, ROOM_W } from '../src/config.js';
import { LEGEND } from '../src/data/tiles.js';
import { LEVEL_01 } from '../src/data/rooms/level01/index.js';
import { DIALOGUES } from '../src/data/dialogue/index.js';
import { JOBS } from '../src/data/jobs/index.js';
import { OBJECTIVE_TYPES } from '../src/quests/objectives.js';
import { ENEMIES, NPCS } from '../src/data/actors.js';
import { ITEMS } from '../src/data/items.js';

const tilesMeta = JSON.parse(
  readFileSync(new URL('../public/assets/tiles_neokyoto.json', import.meta.url), 'utf8'),
);
const tileNames = new Set(tilesMeta.tiles.map((t) => t.name));

const rooms = Object.entries(LEVEL_01.rooms);

/**
 * Content validation. Hand-authored ASCII maps and JSON graphs fail silently in
 * a running game (a wrong character is just a missing tile), so the cheapest
 * place to catch a typo is here.
 */

describe('tile legend', () => {
  it('maps every legend character to a generated tile', () => {
    for (const [ch, name] of Object.entries(LEGEND)) {
      assert.ok(tileNames.has(name), `legend '${ch}' -> unknown tile "${name}"`);
    }
  });
});

describe('level 01 rooms', () => {
  it('declares a start room that exists', () => {
    assert.ok(LEVEL_01.rooms[LEVEL_01.start], `start "${LEVEL_01.start}" missing`);
  });

  for (const [id, room] of rooms) {
    describe(id, () => {
      it('has correctly sized ground and decor layers', () => {
        for (const layer of ['ground', 'decor']) {
          const rows = room[layer];
          assert.ok(Array.isArray(rows), `${id}.${layer} is not an array`);
          assert.equal(rows.length, ROOM_H, `${id}.${layer} row count`);
          rows.forEach((row, y) => {
            assert.equal(row.length, ROOM_W, `${id}.${layer} row ${y}: "${row}"`);
          });
        }
      });

      it('uses only known legend characters', () => {
        for (const layer of ['ground', 'decor']) {
          room[layer].forEach((row, y) => {
            [...row].forEach((ch, x) => {
              if (ch === ' ') return;
              assert.ok(LEGEND[ch], `${id}.${layer} (${x},${y}) unknown char "${ch}"`);
            });
          });
        }
      });

      it('points every exit at a real room', () => {
        for (const [dir, target] of Object.entries(room.exits ?? {})) {
          assert.ok(LEVEL_01.rooms[target], `${id}.exits.${dir} -> "${target}" missing`);
        }
      });

      it('has valid spawns', () => {
        for (const s of room.spawns ?? []) {
          assert.ok(s.x >= 0 && s.x < ROOM_W, `${id}: spawn x ${s.x} out of range`);
          assert.ok(s.y >= 0 && s.y < ROOM_H, `${id}: spawn y ${s.y} out of range`);

          if (s.type === 'enemy') {
            assert.ok(ENEMIES[s.archetype], `${id}: unknown enemy "${s.archetype}"`);
          }
          if (s.type === 'npc') {
            assert.ok(NPCS[s.archetype], `${id}: unknown npc "${s.archetype}"`);
          }
          if (s.type === 'pickup') {
            assert.ok(ITEMS[s.item], `${id}: unknown item "${s.item}"`);
          }
          if (s.type === 'door' && s.to) {
            assert.ok(LEVEL_01.rooms[s.to], `${id}: door -> unknown room "${s.to}"`);
          }
          if (s.openTile) {
            assert.ok(tileNames.has(s.openTile), `${id}: unknown openTile "${s.openTile}"`);
          }
        }
      });

      it('resolves named door entries in the destination room', () => {
        for (const s of room.spawns ?? []) {
          if (s.type !== 'door' || !s.to || !s.entry) continue;
          const dest = LEVEL_01.rooms[s.to];
          const named = dest.entries?.[s.entry];
          const isEdge = ['north', 'south', 'east', 'west'].includes(s.entry);
          assert.ok(named || isEdge,
            `${id}: door entry "${s.entry}" not defined in room "${s.to}"`);
        }
      });

      it('references dialogue graphs that exist', () => {
        for (const s of room.spawns ?? []) {
          const keys = [
            s.dialogue,
            s.lockedDialogue,
            ...(s.dialogueRules ?? []).map((r) => r.dialogue),
          ].filter(Boolean);
          for (const k of keys) {
            assert.ok(DIALOGUES[k], `${id}: unknown dialogue "${k}"`);
          }
        }
      });
    });
  }

  it('makes every room reachable from the start', () => {
    const seen = new Set([LEVEL_01.start]);
    const queue = [LEVEL_01.start];
    while (queue.length) {
      const room = LEVEL_01.rooms[queue.shift()];
      const targets = [
        ...Object.values(room.exits ?? {}),
        ...(room.spawns ?? []).filter((s) => s.type === 'door' && s.to).map((s) => s.to),
      ];
      for (const t of targets) {
        if (!seen.has(t)) {
          seen.add(t);
          queue.push(t);
        }
      }
    }
    const unreachable = Object.keys(LEVEL_01.rooms).filter((id) => !seen.has(id));
    assert.deepEqual(unreachable, [], 'unreachable rooms');
  });
});

describe('jobs', () => {
  for (const [id, job] of Object.entries(JOBS)) {
    it(`${id} is well formed`, () => {
      assert.equal(job.id, id, 'registry key must match the job id');
      assert.ok(job.title, `${id} needs a title`);
      assert.ok(job.objectives?.length, `${id} needs objectives`);

      const ids = new Set();
      for (const o of job.objectives) {
        assert.ok(o.id, `${id}: objective without an id`);
        assert.ok(!ids.has(o.id), `${id}: duplicate objective "${o.id}"`);
        ids.add(o.id);
        assert.ok(OBJECTIVE_TYPES[o.type], `${id}/${o.id}: unknown type "${o.type}"`);
        if (o.type === 'collect') {
          assert.ok(ITEMS[o.item], `${id}/${o.id}: unknown item "${o.item}"`);
        }
      }
      for (const o of job.objectives) {
        for (const r of o.requires ?? []) {
          assert.ok(ids.has(r), `${id}/${o.id}: requires unknown objective "${r}"`);
        }
      }
    });
  }

  it('routes every kill/reach objective at real content', () => {
    for (const [id, job] of Object.entries(JOBS)) {
      for (const o of job.objectives) {
        if (o.type === 'kill' && o.archetype) {
          assert.ok(ENEMIES[o.archetype], `${id}/${o.id}: unknown enemy "${o.archetype}"`);
        }
        if (o.type === 'reach') {
          assert.ok(LEVEL_01.rooms[o.room], `${id}/${o.id}: unknown room "${o.room}"`);
        }
      }
    }
  });
});

describe('dialogue graphs', () => {
  for (const [key, graph] of Object.entries(DIALOGUES)) {
    it(`${key} has no dangling links`, () => {
      const nodes = graph.nodes ?? {};
      assert.ok(Object.keys(nodes).length, `${key} has no nodes`);

      const start = graph.start ?? Object.keys(nodes)[0];
      assert.ok(nodes[start], `${key}: start node "${start}" missing`);

      for (const [nodeId, node] of Object.entries(nodes)) {
        const where = `${key}.${nodeId}`;
        if (node.next) assert.ok(nodes[node.next], `${where}: next -> "${node.next}"`);

        for (const c of node.choices ?? []) {
          assert.ok(c.text, `${where}: choice without text`);
          if (c.goto) assert.ok(nodes[c.goto], `${where}: goto -> "${c.goto}"`);
          for (const branch of [c.onSuccess, c.onFail]) {
            if (branch?.goto) {
              assert.ok(nodes[branch.goto], `${where}: branch goto -> "${branch.goto}"`);
            }
          }
          assert.ok(
            c.goto || c.end || c.check || c.onSuccess || c.onFail,
            `${where}: choice "${c.text}" goes nowhere`,
          );
          if (c.check) {
            assert.ok(c.onSuccess || c.onFail, `${where}: check with no branches`);
          }
        }
      }
    });

    it(`${key} references known jobs and items`, () => {
      const effects = [];
      const collect = (fx) => {
        if (!fx) return;
        (Array.isArray(fx) ? fx : [fx]).forEach((e) => effects.push(e));
      };
      for (const node of Object.values(graph.nodes ?? {})) {
        collect(node.onEnter);
        for (const c of node.choices ?? []) {
          collect(c.do);
          collect(c.onSuccess?.do);
          collect(c.onFail?.do);
        }
      }
      for (const fx of effects) {
        if (typeof fx !== 'object' || fx === null) continue;
        for (const verb of ['startJob', 'completeJob', 'failJob']) {
          if (fx[verb]) assert.ok(JOBS[fx[verb]], `${key}: ${verb} -> unknown "${fx[verb]}"`);
        }
        for (const verb of ['giveItem', 'takeItem']) {
          if (fx[verb]) assert.ok(ITEMS[fx[verb]], `${key}: ${verb} -> unknown "${fx[verb]}"`);
        }
      }
    });
  }
});
