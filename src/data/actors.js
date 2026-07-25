/**
 * Actor archetypes. `sheet` is the texture key, which BootScene derives from
 * the generated actor_<name>.png files.
 *
 * Adding an enemy: add an entry here, add a matching spec to
 * tools/gen_actors.py's SPECS, re-run `npm run assets`. Only pick a new `brain`
 * if the behaviour genuinely differs - otherwise reuse and retune.
 */

export const ENEMIES = {
  ganger_blade: {
    sheet: 'ganger_blade',
    name: 'Razor Ganger',
    hp: 4,
    speed: 52,
    brain: 'patrol',
    damage: 1,
    attackRange: 18,
    sightRange: 96,
    drops: [{ item: 'nuyen', amount: 40, chance: 0.7 }],
    tags: ['ganger'],
  },
  ganger_gun: {
    sheet: 'ganger_gun',
    name: 'Street Shooter',
    hp: 3,
    speed: 40,
    brain: 'shooter',
    damage: 1,
    attackRange: 110,
    sightRange: 130,
    preferredRange: 70,
    drops: [{ item: 'ammo', amount: 1, chance: 0.6 }],
    tags: ['ganger'],
  },
  ganger_boss: {
    sheet: 'ganger_boss',
    name: 'Krait',
    hp: 12,
    speed: 58,
    brain: 'patrol',
    damage: 2,
    attackRange: 20,
    sightRange: 140,
    drops: [{ item: 'keycard_red', amount: 1, chance: 1 }],
    tags: ['ganger', 'boss'],
  },
  sec_drone: {
    sheet: 'sec_drone',
    name: 'Watcher Drone',
    hp: 3,
    speed: 62,
    brain: 'drone',
    damage: 1,
    attackRange: 100,
    sightRange: 120,
    drops: [{ item: 'nuyen', amount: 25, chance: 0.5 }],
    tags: ['drone', 'security'],
  },
  guard: {
    sheet: 'guard',
    name: 'Ferristech Guard',
    hp: 6,
    speed: 44,
    brain: 'shooter',
    damage: 2,
    attackRange: 105,
    sightRange: 125,
    preferredRange: 62,
    drops: [{ item: 'ammo', amount: 1, chance: 0.8 }],
    tags: ['corp', 'security'],
  },
};

export const NPCS = {
  fixer: { sheet: 'fixer', name: 'Kaz' },
  decker: { sheet: 'decker', name: 'Vex' },
  civ_a: { sheet: 'civ_a', name: 'Passerby' },
  civ_b: { sheet: 'civ_b', name: 'Street Vendor' },
  guard: { sheet: 'guard', name: 'Guard' },
  ganger_boss: { sheet: 'ganger_boss', name: 'Krait' },
};

/** Every sheet BootScene must load. */
export const ALL_SHEETS = [
  'runner',
  ...new Set([
    ...Object.values(ENEMIES).map((e) => e.sheet),
    ...Object.values(NPCS).map((n) => n.sheet),
  ]),
];
