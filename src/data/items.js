import { bus, EV } from '../core/EventBus.js';
import { applyEffects } from '../quests/Conditions.js';

/**
 * Item definitions. `icon` must match a name registered in tools/gen_fx.py's
 * ICONS list; the generated fx_manifest.json maps it to a sprite frame.
 *
 * `onPickup` uses the same effect verbs as dialogue and jobs (Conditions.js),
 * so a new consumable needs no code at all.
 */

export const ITEMS = {
  nuyen: {
    name: 'Nuyen',
    icon: 'nuyen',
    stack: true,
    consumeOnPickup: true,
    desc: 'Corporate scrip. Spends anywhere that matters.',
  },
  medkit: {
    name: 'Trauma Patch',
    icon: 'medkit',
    consumeOnPickup: true,
    onPickup: [{ heal: 2 }],
    desc: 'Slaps on, seals up, hurts later.',
  },
  stimpack: {
    name: 'Stim Ampoule',
    icon: 'stimpack',
    consumeOnPickup: true,
    onPickup: [{ heal: 4 }],
    desc: 'Four points of "you will regret this tomorrow".',
  },
  ammo: {
    name: 'Ammo Clip',
    icon: 'ammo',
    consumeOnPickup: true,
    onPickup: [{ ammo: 8 }],
    desc: 'Eight rounds of caseless.',
  },
  keycard_red: {
    name: 'Red Keycard',
    icon: 'keycard',
    desc: 'Ferristech maintenance access. Lifted off a corpse, probably.',
  },
  cyberdeck: {
    name: 'Renraku Cyberdeck',
    icon: 'cyberdeck',
    desc: 'Adds 2 dice to any hacking test while carried.',
  },
  credstick: {
    name: 'Certified Credstick',
    icon: 'credstick',
    desc: 'Untraceable. That is the whole point.',
  },
  wetwire_case: {
    name: 'Wetwire Case',
    icon: 'wetwire',
    desc: 'Sealed neural interface wetware. Somebody wants this badly.',
  },
  datachip: {
    name: 'Data Chip',
    icon: 'datachip',
    desc: 'Encrypted payload. Vex could crack it.',
  },
};

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
