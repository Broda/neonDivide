import { bus, EV } from './EventBus.js';

const MUTE_KEY = 'neon-divide-muted';

/**
 * Two of the same sample starting together is not twice as loud, it is a
 * clipped spike. One melee swing can land on three enemies in the same frame,
 * so identical sounds are gated to one start per this many milliseconds.
 */
const RETRIGGER_GAP_MS = 45;

/**
 * What the game makes a noise for, in one table.
 *
 * A value is either a sound name or a function of the event payload returning
 * one - or null for silence. Everything is driven off the event bus for the
 * same reason JobManager is: an entity should never need to know that an audio
 * system exists, and adding a sound should never mean editing an entity.
 */
export const SOUND_FOR_EVENT = {
  // player verbs
  [EV.MELEE_SWUNG]: 'slash',
  [EV.SHOT_FIRED]: 'shoot',
  [EV.PLAYER_DASHED]: 'dash',

  // taking and dealing damage
  [EV.ENEMY_HURT]: 'hit',
  [EV.ENEMY_KILLED]: 'enemy_down',
  [EV.PLAYER_HURT]: 'hurt',
  [EV.PLAYER_DIED]: 'death',
  [EV.ALARM_RAISED]: 'alarm',

  // the world
  [EV.ITEM_COLLECTED]: (payload) => (payload.item === 'nuyen' ? 'nuyen' : 'pickup'),
  [EV.DOOR_OPENED]: 'door',
  [EV.TERMINAL_USED]: 'terminal',

  // jobs
  [EV.JOB_STARTED]: 'job',
  [EV.JOB_OBJECTIVE_DONE]: 'objective',
  [EV.JOB_COMPLETED]: 'job_done',
  [EV.JOB_FAILED]: 'deny',
  [EV.GAME_SAVED]: 'save',

  // ui
  [EV.SKILL_CHECK]: (payload) => (payload.success ? 'objective' : 'deny'),
  [EV.ACTION_DENIED]: 'deny',
  [EV.UI_MOVED]: 'select',
  [EV.UI_CONFIRMED]: 'confirm',
};

/** Resolves one event payload to a sound name, or null. */
export function soundFor(event, payload = {}) {
  const entry = SOUND_FOR_EVENT[event];
  if (!entry) return null;
  return (typeof entry === 'function' ? entry(payload) : entry) ?? null;
}

function readMuted() {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted) {
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch { /* private browsing - the preference just won't persist */ }
}

/**
 * Wires the sound manager to the event bus.
 *
 * @param {{ play: Function, mute: boolean }} sound Phaser's global sound
 *   manager, or anything with the same two members - which is what lets the
 *   routing table be tested without a browser.
 * @param {object} manifest parsed fx_manifest.json; `sfx` carries per-sound
 *   mix volumes so loudness is authored in the generator, not scattered here.
 * @param {() => number} now injectable clock, for the retrigger gate
 */
export function installAudio(sound, manifest, now = () => Date.now()) {
  const sfx = manifest?.sfx ?? {};
  const lastPlayed = new Map();
  let muted = readMuted();
  sound.mute = muted;

  const play = (name) => {
    const def = sfx[name];
    if (!def) return false;
    const at = now();
    if (at - (lastPlayed.get(name) ?? -Infinity) < RETRIGGER_GAP_MS) return false;
    lastPlayed.set(name, at);
    sound.play(name, { volume: def.volume ?? 1 });
    return true;
  };

  const handlers = new Map();
  for (const event of Object.keys(SOUND_FOR_EVENT)) {
    const handler = (payload) => {
      const name = soundFor(event, payload ?? {});
      if (name) play(name);
    };
    handlers.set(event, handler);
    bus.on(event, handler);
  }

  const api = {
    play,
    get muted() { return muted; },
    setMuted(next) {
      muted = Boolean(next);
      sound.mute = muted;
      writeMuted(muted);
      return muted;
    },
    toggle() {
      const next = api.setMuted(!muted);
      // Unmuting plays its own confirmation; muting obviously cannot.
      if (!next) play('confirm');
      bus.emit(EV.TOAST, { text: next ? 'SOUND OFF' : 'SOUND ON', tone: 'info' });
      return next;
    },
    stop() {
      for (const [event, handler] of handlers) bus.off(event, handler);
      handlers.clear();
    },
  };

  return api;
}
