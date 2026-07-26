import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { installAudio, soundFor, SOUND_FOR_EVENT } from '../src/core/audio.js';
import { bus, EV } from '../src/core/EventBus.js';

/** Stands in for Phaser's sound manager. */
function fakeSound() {
  return {
    mute: false,
    played: [],
    play(key, config) { this.played.push({ key, ...config }); },
  };
}

/** A manifest shaped like the `sfx` block tools/gen_sfx.py emits. */
const MANIFEST = {
  sfx: Object.fromEntries(
    ['slash', 'shoot', 'dash', 'hit', 'enemy_down', 'hurt', 'death', 'alarm',
      'pickup', 'nuyen', 'door', 'terminal', 'deny', 'objective', 'job',
      'job_done', 'save', 'select', 'confirm']
      .map((name) => [name, { volume: 0.5, seconds: 0.1 }]),
  ),
};

let sound;
let clock;
let audio;

beforeEach(() => {
  sound = fakeSound();
  clock = 10_000;
  audio = installAudio(sound, MANIFEST, () => clock);
});

afterEach(() => {
  audio.stop();
  bus.removeAllListeners();
});

describe('event routing', () => {
  it('plays the mapped sound at its authored volume', () => {
    bus.emit(EV.MELEE_SWUNG, {});
    assert.deepEqual(sound.played, [{ key: 'slash', volume: 0.5 }]);
  });

  it('routes every entry in the table to a sound the generator emits', () => {
    // Guards the table against drifting from tools/gen_sfx.py.
    for (const event of Object.keys(SOUND_FOR_EVENT)) {
      const entry = SOUND_FOR_EVENT[event];
      const names = typeof entry === 'function'
        // Exercise both branches of every conditional mapping.
        ? [entry({ item: 'nuyen', success: true }), entry({ item: 'medkit', success: false })]
        : [entry];
      for (const name of names.filter(Boolean)) {
        assert.ok(MANIFEST.sfx[name], `${event} -> "${name}" is not a generated sound`);
      }
    }
  });

  it('tells money apart from any other pickup', () => {
    assert.equal(soundFor(EV.ITEM_COLLECTED, { item: 'nuyen' }), 'nuyen');
    assert.equal(soundFor(EV.ITEM_COLLECTED, { item: 'medkit' }), 'pickup');
  });

  it('gives a skill check a different answer for pass and fail', () => {
    assert.equal(soundFor(EV.SKILL_CHECK, { success: true }), 'objective');
    assert.equal(soundFor(EV.SKILL_CHECK, { success: false }), 'deny');
  });

  it('stays quiet for events it has no opinion about', () => {
    assert.equal(soundFor(EV.STATE_CHANGED, {}), null);
    assert.equal(soundFor(EV.ROOM_LEFT, {}), null);
    bus.emit(EV.STATE_CHANGED, {});
    assert.deepEqual(sound.played, []);
  });

  it('ignores a sound the manifest does not carry', () => {
    const bare = fakeSound();
    const partial = installAudio(bare, { sfx: {} }, () => clock);
    bus.emit(EV.PLAYER_DIED, {});
    assert.deepEqual(bare.played, []);
    partial.stop();
  });
});

describe('retrigger gate', () => {
  it('collapses the same sound fired twice in one frame', () => {
    // One swing landing on three enemies emits ENEMY_HURT three times; three
    // copies of one sample starting together clip rather than get louder.
    bus.emit(EV.ENEMY_HURT, {});
    bus.emit(EV.ENEMY_HURT, {});
    bus.emit(EV.ENEMY_HURT, {});
    assert.equal(sound.played.length, 1);
  });

  it('lets the same sound through once the gap has passed', () => {
    bus.emit(EV.SHOT_FIRED, {});
    clock += 50;
    bus.emit(EV.SHOT_FIRED, {});
    assert.equal(sound.played.length, 2);
  });

  it('never gates two different sounds against each other', () => {
    bus.emit(EV.MELEE_SWUNG, {});
    bus.emit(EV.ENEMY_HURT, {});
    assert.deepEqual(sound.played.map((entry) => entry.key), ['slash', 'hit']);
  });
});

describe('mute', () => {
  it('drives the sound manager and reports its state', () => {
    assert.equal(audio.muted, false);
    audio.setMuted(true);
    assert.equal(audio.muted, true);
    assert.equal(sound.mute, true);
    audio.setMuted(false);
    assert.equal(sound.mute, false);
  });

  it('announces itself both ways round', () => {
    const toasts = [];
    bus.on(EV.TOAST, (payload) => toasts.push(payload.text));
    audio.toggle();
    audio.toggle();
    assert.deepEqual(toasts, ['SOUND OFF', 'SOUND ON']);
  });
});

describe('teardown', () => {
  it('unsubscribes every handler it installed', () => {
    audio.stop();
    bus.emit(EV.MELEE_SWUNG, {});
    assert.deepEqual(sound.played, []);
    for (const event of Object.keys(SOUND_FOR_EVENT)) {
      assert.equal(bus.listenerCount(event), 0, `${event} still has a listener`);
    }
  });
});
