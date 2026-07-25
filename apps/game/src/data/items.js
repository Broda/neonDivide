import { bus, EV } from '../core/EventBus.js';
import { applyEffects } from '../quests/Conditions.js';
import { ITEMS } from '@neon-divide/content';

export { ITEMS } from '@neon-divide/content';

/**
 * Item definitions. `icon` must match a name registered in tools/gen_fx.py's
 * ICONS list; the generated fx_manifest.json maps it to a sprite frame.
 *
 * `onPickup` uses the same effect verbs as dialogue and jobs (Conditions.js),
 * so a new consumable needs no code at all.
 */

export function itemName(id) {
  return ITEMS[id]?.name ?? id;
}

/**
 * The single way an item enters the player's possession, whether from a floor
 * pickup or a job payout.
 *
 * Consumables must apply their `onPickup` effects rather than being stashed in
 * the inventory - otherwise an ammo clip handed over as a quest reward sits in
 * the bag as a useless entry instead of loading rounds into the gun.
 */
export function grantItem(state, id, count = 1, ctx = {}) {
  if (id === 'nuyen') {
    state.addNuyen(count);
    return;
  }

  const def = ITEMS[id];
  if (def?.consumeOnPickup) {
    for (let i = 0; i < count; i++) applyEffects(def.onPickup, state, ctx);
    // Announce it anyway so `collect` objectives can track consumables.
    bus.emit(EV.ITEM_COLLECTED, { item: id, count });
    return;
  }

  state.addItem(id, count);
}
