import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { bus, EV } from '../src/core/EventBus.js';
import { GameState } from '../src/core/GameState.js';
import { JobManager } from '../src/quests/JobManager.js';

const DEFS = {
  job_test: {
    id: 'job_test',
    title: 'Test Job',
    payment: { nuyen: 1000, karma: 1 },
    objectives: [
      { id: 'talk', type: 'talk', target: 'vex', text: 'Talk to Vex' },
      {
        id: 'kill3',
        type: 'kill',
        archetype: 'sec_drone',
        count: 3,
        text: 'Kill 3 drones',
        requires: ['talk'],
      },
      { id: 'exfil', type: 'reach', room: 'plaza', text: 'Exfil', requires: ['kill3'] },
      { id: 'bonus', type: 'collect', item: 'credstick', optional: true, text: 'Loot' },
    ],
  },
};

function setup() {
  const state = new GameState();
  const jobs = new JobManager(state, DEFS);
  jobs.attach();
  return { state, jobs };
}

afterEach(() => bus.removeAllListeners());

describe('JobManager lifecycle', () => {
  it('starts a job and tracks it as active', () => {
    const { state, jobs } = setup();
    assert.equal(jobs.start('job_test'), true);
    assert.deepEqual(state.jobs.active, ['job_test']);
    assert.equal(jobs.isActive('job_test'), true);
  });

  it('refuses to start an unknown or already-active job', () => {
    const { jobs } = setup();
    assert.equal(jobs.start('nope'), false);
    jobs.start('job_test');
    assert.equal(jobs.start('job_test'), false);
  });
});

describe('JobManager objective ordering', () => {
  it('only exposes objectives whose prerequisites are met', () => {
    const { jobs } = setup();
    jobs.start('job_test');
    const ids = jobs.activeObjectives('job_test').map((o) => o.id);
    assert.deepEqual(ids, ['talk', 'bonus'], 'gated objectives stay hidden');
  });

  it('ignores events for objectives that are not yet available', () => {
    const { jobs } = setup();
    jobs.start('job_test');
    // kill3 requires `talk`, so these should not register at all
    for (let i = 0; i < 3; i++) {
      bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    }
    assert.equal(jobs.objectiveProgress('job_test', 'kill3'), 0);
    assert.equal(jobs.isObjectiveDone('job_test', 'kill3'), false);
  });

  it('advances objectives in sequence as events arrive', () => {
    const { jobs } = setup();
    jobs.start('job_test');

    bus.emit(EV.NPC_TALKED, { npc: 'vex' });
    assert.equal(jobs.isObjectiveDone('job_test', 'talk'), true);

    bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    assert.equal(jobs.objectiveProgress('job_test', 'kill3'), 1);
    assert.equal(jobs.isObjectiveDone('job_test', 'kill3'), false);
  });

  it('filters kill objectives by archetype', () => {
    const { jobs } = setup();
    jobs.start('job_test');
    bus.emit(EV.NPC_TALKED, { npc: 'vex' });
    bus.emit(EV.ENEMY_KILLED, { archetype: 'ganger_blade' });
    assert.equal(jobs.objectiveProgress('job_test', 'kill3'), 0);
  });

  it('completes a counted objective only on the final tick', () => {
    const { jobs } = setup();
    jobs.start('job_test');
    bus.emit(EV.NPC_TALKED, { npc: 'vex' });
    bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    assert.equal(jobs.isObjectiveDone('job_test', 'kill3'), false);
    bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    assert.equal(jobs.isObjectiveDone('job_test', 'kill3'), true);
  });
});

describe('JobManager completion', () => {
  it('completes the job and pays out once required objectives are done', () => {
    const { state, jobs } = setup();
    const before = state.nuyen;
    jobs.start('job_test');

    bus.emit(EV.NPC_TALKED, { npc: 'vex' });
    for (let i = 0; i < 3; i++) bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    assert.equal(jobs.isCompleted('job_test'), false, 'exfil still outstanding');

    bus.emit(EV.ROOM_ENTERED, { room: 'plaza' });
    assert.equal(jobs.isCompleted('job_test'), true);
    assert.equal(state.nuyen, before + 1000);
    assert.equal(state.karma, 1);
    assert.deepEqual(state.jobs.active, []);
  });

  it('does not require optional objectives', () => {
    const { jobs } = setup();
    jobs.start('job_test');
    bus.emit(EV.NPC_TALKED, { npc: 'vex' });
    for (let i = 0; i < 3; i++) bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });
    bus.emit(EV.ROOM_ENTERED, { room: 'plaza' });
    assert.equal(jobs.isCompleted('job_test'), true);
    assert.equal(jobs.isObjectiveDone('job_test', 'bonus'), false);
  });

  it('respects manualComplete', () => {
    const state = new GameState();
    const jobs = new JobManager(state, {
      j: {
        id: 'j',
        title: 'Manual',
        manualComplete: true,
        objectives: [{ id: 'a', type: 'flag', flag: 'x', text: 'x' }],
      },
    });
    jobs.attach();
    jobs.start('j');
    state.setFlag('x', true);
    assert.equal(jobs.isObjectiveDone('j', 'a'), true);
    assert.equal(jobs.isCompleted('j'), false, 'waits for an explicit complete()');
    jobs.complete('j');
    assert.equal(jobs.isCompleted('j'), true);
  });

  it('forceObjective completes by path', () => {
    const { jobs } = setup();
    jobs.start('job_test');
    assert.equal(jobs.forceObjective('job_test/talk'), true);
    assert.equal(jobs.isObjectiveDone('job_test', 'talk'), true);
    assert.equal(jobs.forceObjective('job_test/nope'), false);
  });

  it('fails a job into the burned list', () => {
    const { state, jobs } = setup();
    jobs.start('job_test');
    assert.equal(jobs.fail('job_test'), true);
    assert.deepEqual(state.jobs.failed, ['job_test']);
    assert.deepEqual(state.jobs.active, []);
  });
});

describe('JobManager persistence', () => {
  it('survives a serialize / deserialize round trip', () => {
    const { state, jobs } = setup();
    jobs.start('job_test');
    bus.emit(EV.NPC_TALKED, { npc: 'vex' });
    bus.emit(EV.ENEMY_KILLED, { archetype: 'sec_drone' });

    const blob = JSON.parse(JSON.stringify(state.serialize()));
    const restored = new GameState().deserialize(blob);
    const jobs2 = new JobManager(restored, DEFS);

    assert.equal(jobs2.isActive('job_test'), true);
    assert.equal(jobs2.isObjectiveDone('job_test', 'talk'), true);
    assert.equal(jobs2.objectiveProgress('job_test', 'kill3'), 1);
  });
});
