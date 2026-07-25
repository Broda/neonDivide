import { evaluate } from './Conditions.js';
import { EV } from '../core/EventBus.js';

/**
 * Objective type registry.
 *
 * Each handler declares which bus events can advance it and how to read a
 * payload. Adding a new objective type is exactly one entry here - JobManager
 * never changes.
 *
 * A handler returns the amount of progress an event contributes (usually 1),
 * or 0 if the event is not relevant to this particular objective.
 */

export const OBJECTIVE_TYPES = {
  /** Kill N enemies, optionally of a specific archetype or in a given room. */
  kill: {
    events: [EV.ENEMY_KILLED],
    progress(obj, payload) {
      if (obj.archetype && payload.archetype !== obj.archetype) return 0;
      if (obj.room && payload.room !== obj.room) return 0;
      if (obj.tag && !(payload.tags ?? []).includes(obj.tag)) return 0;
      return 1;
    },
  },

  /** Pick up N of an item. Counts pickups only, not dialogue rewards. */
  collect: {
    events: [EV.ITEM_COLLECTED],
    progress(obj, payload) {
      if (payload.item !== obj.item) return 0;
      return payload.count ?? 1;
    },
  },

  /** Enter a room. */
  reach: {
    events: [EV.ROOM_ENTERED],
    progress(obj, payload) {
      return payload.room === obj.room ? 1 : 0;
    },
  },

  /** Speak to a named NPC (the npc's `id`, not its archetype). */
  talk: {
    events: [EV.NPC_TALKED],
    progress(obj, payload) {
      if (payload.npc !== obj.target) return 0;
      if (obj.node && payload.node !== obj.node) return 0;
      return 1;
    },
  },

  /** Hand an item to an NPC - consumes the item when it fires. */
  deliver: {
    events: [EV.NPC_TALKED],
    progress(obj, payload, state) {
      if (payload.npc !== obj.target) return 0;
      if (!state.hasItem(obj.item, obj.count ?? 1)) return 0;
      state.removeItem(obj.item, obj.count ?? 1);
      return obj.count ?? 1;
    },
  },

  /** Satisfied when an arbitrary flag becomes true - the catch-all escape hatch. */
  flag: {
    events: [EV.FLAG_SET],
    progress(obj, payload) {
      if (payload.flag !== obj.flag) return 0;
      const want = 'value' in obj ? obj.value : true;
      return payload.value === want ? 1 : 0;
    },
  },

  /** Use a terminal / console by id. */
  hack: {
    events: [EV.TERMINAL_USED],
    progress(obj, payload) {
      return payload.id === obj.target ? 1 : 0;
    },
  },

  /**
   * Passive: never advanced by an event, only by its condition becoming true.
   * Re-checked whenever any tracked event fires.
   */
  condition: {
    events: [
      EV.FLAG_SET, EV.ITEM_COLLECTED, EV.ROOM_ENTERED,
      EV.ENEMY_KILLED, EV.NPC_TALKED, EV.STATE_CHANGED,
    ],
    progress(obj, payload, state) {
      return evaluate(obj.when, state) ? 1 : 0;
    },
  },
};

/** All bus events any objective type cares about, deduplicated. */
export function trackedEvents() {
  const set = new Set();
  for (const handler of Object.values(OBJECTIVE_TYPES)) {
    handler.events.forEach((e) => set.add(e));
  }
  return [...set];
}
