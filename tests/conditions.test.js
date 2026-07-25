import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GameState } from '../src/core/GameState.js';
import { describe as describeCond, applyEffects, evaluate } from '../src/quests/Conditions.js';

function freshState(overrides = {}) {
  const s = new GameState();
  Object.assign(s, overrides);
  return s;
}

describe('Conditions.evaluate', () => {
  it('treats missing / empty conditions as satisfied', () => {
    const s = freshState();
    assert.equal(evaluate(undefined, s), true);
    assert.equal(evaluate(null, s), true);
    assert.equal(evaluate({}, s), true);
    assert.equal(evaluate(true, s), true);
    assert.equal(evaluate(false, s), false);
  });

  it('checks flags, including explicit equality', () => {
    const s = freshState();
    assert.equal(evaluate({ flag: 'met_kaz' }, s), false);
    s.setFlag('met_kaz', true);
    assert.equal(evaluate({ flag: 'met_kaz' }, s), true);

    s.setFlag('burned', false);
    assert.equal(evaluate({ flag: 'burned' }, s), false);
    assert.equal(evaluate({ flag: 'burned', equals: false }, s), true);
  });

  it('checks inventory with counts', () => {
    const s = freshState();
    assert.equal(evaluate({ item: 'ammo' }, s), false);
    s.addItem('ammo', 2);
    assert.equal(evaluate({ item: 'ammo' }, s), true);
    assert.equal(evaluate({ item: 'ammo', count: 2 }, s), true);
    assert.equal(evaluate({ item: 'ammo', count: 3 }, s), false);
    assert.equal(evaluate({ noItem: 'keycard_red' }, s), true);
  });

  it('checks skills and attributes against a threshold', () => {
    const s = freshState();
    s.skills.hacking = 3;
    assert.equal(evaluate({ skill: 'hacking', gte: 3 }, s), true);
    assert.equal(evaluate({ skill: 'hacking', gte: 4 }, s), false);
    assert.equal(evaluate({ attr: 'agility', gte: 4 }, s), true);
    assert.equal(evaluate({ attr: 'nonexistent', gte: 1 }, s), false);
  });

  it('ANDs the keys of a single object', () => {
    const s = freshState();
    s.skills.hacking = 3;
    // has the skill but not the item -> false
    assert.equal(evaluate({ skill: 'hacking', gte: 3, item: 'cyberdeck' }, s), false);
    s.addItem('cyberdeck');
    assert.equal(evaluate({ skill: 'hacking', gte: 3, item: 'cyberdeck' }, s), true);
  });

  it('composes with all / any / not', () => {
    const s = freshState();
    s.setFlag('a', true);
    assert.equal(evaluate({ all: [{ flag: 'a' }, { flag: 'b' }] }, s), false);
    assert.equal(evaluate({ any: [{ flag: 'a' }, { flag: 'b' }] }, s), true);
    assert.equal(evaluate({ not: { flag: 'b' } }, s), true);
    assert.equal(evaluate([{ flag: 'a' }, { not: { flag: 'b' } }], s), true);
  });

  it('reads job and objective state', () => {
    const s = freshState();
    s.jobs.active.push('job_x');
    assert.equal(evaluate({ job: 'job_x', is: 'active' }, s), true);
    assert.equal(evaluate({ job: 'job_x', is: 'completed' }, s), false);
    assert.equal(evaluate({ job: 'job_y', is: 'unstarted' }, s), true);

    s.setFlag('obj:job_x/step1', true);
    assert.equal(evaluate({ objective: 'job_x/step1' }, s), true);
    assert.equal(evaluate({ objective: 'job_x/step2' }, s), false);
  });
});

describe('Conditions.applyEffects', () => {
  it('applies inventory, wallet and flag verbs', () => {
    const s = freshState();
    const startNuyen = s.nuyen;
    applyEffects([
      { setFlag: 'done' },
      { giveItem: 'keycard_red' },
      { nuyen: 500 },
      { karma: 2 },
    ], s);

    assert.equal(s.getFlag('done'), true);
    assert.equal(s.hasItem('keycard_red'), true);
    assert.equal(s.nuyen, startNuyen + 500);
    assert.equal(s.karma, 2);
  });

  it('accepts a single effect object as well as a list', () => {
    const s = freshState();
    applyEffects({ setFlag: 'solo' }, s);
    assert.equal(s.getFlag('solo'), true);
  });

  it('applies several verbs on one object and clamps vitals', () => {
    const s = freshState();
    s.hp = 2;
    applyEffects([{ heal: 99, setFlag: 'patched' }], s);
    assert.equal(s.hp, s.maxHp);
    assert.equal(s.getFlag('patched'), true);
  });

  it('ignores unknown verbs rather than throwing', () => {
    const s = freshState();
    assert.doesNotThrow(() => applyEffects([{ notARealVerb: 1 }, null, 'nope'], s));
  });

  it('routes job verbs through the injected context', () => {
    const s = freshState();
    const calls = [];
    const ctx = { jobs: { start: (id) => calls.push(['start', id]) } };
    applyEffects([{ startJob: 'job_x' }], s, ctx);
    assert.deepEqual(calls, [['start', 'job_x']]);
  });
});

describe('Conditions.describe', () => {
  it('renders requirement text for locked dialogue options', () => {
    assert.equal(describeCond({ skill: 'hacking', gte: 3 }), 'Hacking 3');
    assert.equal(describeCond({ item: 'keycard_red' }), 'Keycard Red');
    assert.equal(describeCond({ nuyen: 500 }), '500¥');
    assert.equal(
      describeCond({ all: [{ skill: 'etiquette', gte: 2 }, { nuyen: 100 }] }),
      'Etiquette 2, 100¥',
    );
  });
});
