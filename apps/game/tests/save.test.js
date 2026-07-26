import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { startAutosave } from '../src/core/autosave.js';
import { bus, EV } from '../src/core/EventBus.js';
import { GameState, SAVE_VERSION, setStorage } from '../src/core/GameState.js';

const SAVE_KEY = 'neon-divide-save-v1';

/** Stands in for localStorage, and counts writes so autosave is observable. */
function memoryStorage() {
  const map = new Map();
  return {
    writes: 0,
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { this.writes++; map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    poke(key, value) { map.set(key, value); },
  };
}

let store;

beforeEach(() => {
  store = memoryStorage();
  setStorage(store);
});

afterEach(() => {
  setStorage(null);
  bus.removeAllListeners();
});

function playedState() {
  const s = new GameState();
  s.addItem('keycard_red');
  s.addItem('stimpack', 2);
  s.setFlag('door_open', true);
  s.jobs.active.push('job_wetwire');
  s.currentRoom = 'lobby';
  s.addNuyen(150);
  s.damage(2);
  return s;
}

describe('save round trip', () => {
  it('restores inventory, flags, jobs and position', () => {
    assert.equal(playedState().save(), true);

    const fresh = new GameState();
    assert.equal(fresh.load(), true);
    assert.equal(fresh.countItem('stimpack'), 2);
    assert.equal(fresh.hasItem('keycard_red'), true);
    assert.equal(fresh.getFlag('door_open'), true);
    assert.deepEqual(fresh.jobs.active, ['job_wetwire']);
    assert.equal(fresh.currentRoom, 'lobby');
    assert.equal(fresh.nuyen, 500);
    assert.equal(fresh.hp, 4);
  });

  it('stamps a version and a time so the title screen can describe it', () => {
    playedState().save();

    const peeked = GameState.peekSave();
    assert.equal(peeked.version, SAVE_VERSION);
    assert.equal(peeked.currentRoom, 'lobby');
    assert.ok(peeked.savedAt <= Date.now());
  });

  it('reports whether a save exists', () => {
    assert.equal(GameState.hasSave(), false);
    playedState().save();
    assert.equal(GameState.hasSave(), true);
    GameState.clearSave();
    assert.equal(GameState.hasSave(), false);
  });

  it('emits so the HUD can acknowledge the checkpoint', () => {
    const seen = [];
    bus.on(EV.GAME_SAVED, (p) => seen.push(p));
    playedState().save();
    assert.deepEqual(seen, [{ room: 'lobby' }]);
  });
});

describe('unusable saves', () => {
  it('ignores a blob from an older save version', () => {
    playedState().save();
    const blob = JSON.parse(store.getItem(SAVE_KEY));
    store.poke(SAVE_KEY, JSON.stringify({ ...blob, version: SAVE_VERSION - 1 }));

    assert.equal(GameState.peekSave(), null);

    const fresh = new GameState();
    assert.equal(fresh.load(), false);
    // A rejected load must leave the run untouched, not half-applied.
    assert.equal(fresh.currentRoom, null);
    assert.equal(fresh.inventory.size, 0);
  });

  it('ignores corrupt JSON rather than throwing into the title screen', () => {
    store.poke(SAVE_KEY, '{not json');
    assert.equal(GameState.peekSave(), null);
    assert.equal(new GameState().load(), false);
  });

  it('never resumes into an instant death', () => {
    const s = playedState();
    s.damage(99);
    assert.equal(s.hp, 0);
    s.save();

    const fresh = new GameState();
    fresh.load();
    assert.equal(fresh.hp, 1);
  });

  it('is inert with no storage backend at all', () => {
    setStorage(null);
    assert.equal(new GameState().save(), false);
    assert.equal(GameState.hasSave(), false);
    assert.doesNotThrow(() => GameState.clearSave());
  });
});

describe('autosave policy', () => {
  it('checkpoints on room entry and job completion', () => {
    const s = new GameState();
    startAutosave(s);

    bus.emit(EV.ROOM_ENTERED, { room: 'plaza' });
    assert.equal(store.writes, 1);

    bus.emit(EV.JOB_COMPLETED, { job: 'job_wetwire' });
    assert.equal(store.writes, 2);
  });

  it('does not checkpoint on death, so reloading rewinds the room', () => {
    const s = new GameState();
    s.currentRoom = 'server';
    startAutosave(s);
    bus.emit(EV.ROOM_ENTERED, { room: 'server' });

    s.currentRoom = 'rooftop';
    bus.emit(EV.PLAYER_DIED, {});
    bus.emit(EV.PLAYER_HURT, {});

    assert.equal(store.writes, 1);
    assert.equal(GameState.peekSave().currentRoom, 'server');
  });

  it('stops writing once the world scene is torn down', () => {
    const stop = startAutosave(new GameState());
    bus.emit(EV.ROOM_ENTERED, { room: 'plaza' });
    stop();
    bus.emit(EV.ROOM_ENTERED, { room: 'alley' });
    assert.equal(store.writes, 1);
  });
});
