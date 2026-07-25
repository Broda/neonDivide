import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GameState } from '../src/core/GameState.js';
import { describeRoll, rollPool } from '../src/quests/dice.js';

/** Deterministic RNG that yields the given 0..1 values in order, then repeats. */
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// Math.floor(r * 6) + 1, so: 0.0->1, 0.2->2, 0.4->3, 0.6->4, 0.7->5, 0.9->6
const ONE = 0.0;
const FIVE = 0.7;
const SIX = 0.9;

describe('rollPool', () => {
  it('rolls exactly `pool` dice', () => {
    const r = rollPool(5, 1, seq([0.5]));
    assert.equal(r.dice.length, 5);
    assert.equal(r.pool, 5);
  });

  it('counts 5s and 6s as hits and nothing else', () => {
    const r = rollPool(6, 1, seq([ONE, 0.2, 0.4, 0.6, FIVE, SIX]));
    assert.deepEqual(r.dice, [1, 2, 3, 4, 5, 6]);
    assert.equal(r.hits, 2);
  });

  it('succeeds when hits meet the threshold', () => {
    assert.equal(rollPool(3, 2, seq([FIVE, SIX, ONE])).success, true);
    assert.equal(rollPool(3, 3, seq([FIVE, SIX, ONE])).success, false);
  });

  it('handles an empty pool as an automatic failure', () => {
    const r = rollPool(0, 1, seq([SIX]));
    assert.equal(r.dice.length, 0);
    assert.equal(r.hits, 0);
    assert.equal(r.success, false);
    assert.equal(r.glitch, false);
  });

  it('flags a glitch when more than half the dice are 1s', () => {
    const r = rollPool(3, 1, seq([ONE, ONE, SIX]));
    assert.equal(r.glitch, true);
    assert.equal(r.criticalGlitch, false, 'a hit prevents a critical glitch');

    const crit = rollPool(3, 1, seq([ONE]));
    assert.equal(crit.criticalGlitch, true);
  });

  it('does not glitch on exactly half 1s', () => {
    const r = rollPool(4, 1, seq([ONE, ONE, SIX, SIX]));
    assert.equal(r.glitch, false);
  });

  it('produces roughly one third hits over many rolls', () => {
    const r = rollPool(6000, 1, Math.random);
    const rate = r.hits / r.pool;
    assert.ok(rate > 0.29 && rate < 0.38, `hit rate ${rate} outside expected band`);
  });
});

describe('describeRoll', () => {
  it('summarises the outcome for the dialogue box', () => {
    const r = rollPool(3, 2, seq([FIVE, SIX, ONE]));
    assert.equal(describeRoll(r), '3d6 -> 2 hits vs 2: SUCCESS');
  });

  it('singularises a lone hit and notes a glitch', () => {
    const r = rollPool(3, 2, seq([FIVE, ONE, ONE]));
    assert.equal(describeRoll(r), '3d6 -> 1 hit vs 2: FAILURE (glitch)');
  });
});

describe('GameState.poolFor', () => {
  it('adds attribute and skill', () => {
    const s = new GameState();
    s.attributes.logic = 3;
    s.skills.hacking = 2;
    assert.equal(s.poolFor({ attr: 'logic', skill: 'hacking' }), 5);
  });

  it('adds gear dice only when the gear is carried', () => {
    const s = new GameState();
    s.attributes.logic = 3;
    s.skills.hacking = 2;
    const check = { attr: 'logic', skill: 'hacking', bonus: 'cyberdeck' };
    assert.equal(s.poolFor(check), 5);
    s.addItem('cyberdeck');
    assert.equal(s.poolFor(check), 7);
  });
});
