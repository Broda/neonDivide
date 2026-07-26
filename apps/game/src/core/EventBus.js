/**
 * One global emitter. Gameplay systems publish here and the quest layer
 * subscribes, so JobManager never needs a reference to an entity and entities
 * never need to know a quest system exists.
 *
 * This deliberately does NOT use Phaser.Events.EventEmitter: importing Phaser
 * pulls in `window` and would make the whole quest layer un-testable outside a
 * browser. A ~40 line emitter buys headless `node --test` coverage of every
 * rule in the game.
 */
class Emitter {
  constructor() {
    /** @type {Map<string, Array<{fn: Function, ctx: any, once: boolean}>>} */
    this.listeners = new Map();
  }

  on(event, fn, ctx = null) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push({ fn, ctx, once: false });
    return this;
  }

  once(event, fn, ctx = null) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push({ fn, ctx, once: true });
    return this;
  }

  off(event, fn, ctx = null) {
    const list = this.listeners.get(event);
    if (!list) return this;
    const next = list.filter((l) => !(l.fn === fn && (ctx === null || l.ctx === ctx)));
    if (next.length) this.listeners.set(event, next);
    else this.listeners.delete(event);
    return this;
  }

  emit(event, payload) {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return false;
    // Iterate a copy: a handler may subscribe or unsubscribe while running.
    for (const l of [...list]) {
      if (l.once) this.off(event, l.fn, l.ctx);
      l.fn.call(l.ctx, payload);
    }
    return true;
  }

  removeAllListeners(event) {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
    return this;
  }

  listenerCount(event) {
    return this.listeners.get(event)?.length ?? 0;
  }
}

export const bus = new Emitter();

/** Event names as constants - a typo in a string literal fails silently. */
export const EV = {
  // world
  ROOM_ENTERED: 'room.entered',
  ROOM_LEFT: 'room.left',
  // combat
  ENEMY_KILLED: 'enemy.killed',
  PLAYER_HURT: 'player.hurt',
  PLAYER_DIED: 'player.died',
  // interaction
  NPC_TALKED: 'npc.talked',
  TERMINAL_USED: 'terminal.used',
  DOOR_OPENED: 'door.opened',
  // inventory / state
  ITEM_COLLECTED: 'item.collected',
  ITEM_USED: 'item.used',
  FLAG_SET: 'flag.set',
  STATE_CHANGED: 'state.changed',
  GAME_SAVED: 'game.saved',
  // quests
  JOB_STARTED: 'job.started',
  JOB_OBJECTIVE_DONE: 'job.objective.done',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  // ui
  TOAST: 'ui.toast',
  DIALOGUE_START: 'dialogue.start',
  DIALOGUE_END: 'dialogue.end',
  SKILL_CHECK: 'ui.skillcheck',
};

/** Convenience so callers don't import both the bus and the names separately. */
export function emit(event, payload) {
  bus.emit(event, payload);
}
