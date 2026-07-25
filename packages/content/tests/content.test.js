import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileProject, parseProject, PROJECT, serializeResource, validateProject,
} from '../src/index.js';

describe('canonical content', () => {
  it('is structurally and referentially valid', () => {
    const result = validateProject(PROJECT);
    assert.equal(result.valid, true, result.issues.map((entry) => `${entry.path}: ${entry.message}`).join('\n'));
    assert.equal(result.issues.filter((entry) => entry.severity === 'error').length, 0);
  });

  it('compiles without changing the canonical project', () => {
    const compiled = compileProject();
    assert.deepEqual(compiled, PROJECT);
    assert.notEqual(compiled, PROJECT);
  });

  it('reports dangling room, dialogue, item, and job references', () => {
    const broken = structuredClone(PROJECT);
    broken.rooms.plaza.exits.east = 'missing-room';
    broken.rooms.plaza.spawns[0].dialogue = 'missing-dialogue';
    broken.jobs.job_wetwire.objectives[0].item = 'missing-item';
    broken.dialogues.kaz_intro.nodes[broken.dialogues.kaz_intro.start].onEnter = [{ startJob: 'missing-job' }];
    const result = validateProject(broken);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((entry) => entry.code === 'reference.room'));
    assert.ok(result.issues.some((entry) => entry.code === 'reference.dialogue'));
    assert.ok(result.issues.some((entry) => entry.code === 'reference.item'));
    assert.ok(result.issues.some((entry) => entry.code === 'reference.job'));
  });

  it('parses valid projects and rejects invalid ones with issues', () => {
    assert.deepEqual(parseProject(JSON.stringify(PROJECT)), PROJECT);
    const broken = structuredClone(PROJECT);
    broken.rooms.plaza.ground[0] = 'short';
    assert.throws(() => parseProject(broken), (error) => Array.isArray(error.issues));
  });

  it('validates room names and player start coordinates', () => {
    const broken = structuredClone(PROJECT);
    broken.rooms.plaza.name = '';
    broken.rooms.plaza.spawn = [20, -1];
    const result = validateProject(broken);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((entry) => entry.code === 'room.name'));
    assert.ok(result.issues.some((entry) => entry.code === 'room.spawnX'));
    assert.ok(result.issues.some((entry) => entry.code === 'room.spawnY'));
  });

  it('serializes deterministically', () => {
    const value = { z: 1, a: { y: 2, b: 3 } };
    const a = serializeResource(value);
    const b = serializeResource(structuredClone(value));
    assert.equal(a, b);
  });
});
