/** Neon Market - the vendor hands out the side job; a door leads to the roof. */
export default {
  id: 'market',
  name: 'Neon Market',
  spawn: [3, 7],

  entries: {
    from_roof: [16, 2],
  },

  ground: [
    '____________________',
    '__________________c_',
    '__................__',
    '__................__',
    '__.....u..........__',
    '__................__',
    '__................__',
    '__................__',
    '__................__',
    '__......,.........__',
    '__................__',
    '__.........U......__',
    '__................__',
    '____________________',
    '____________________',
  ],

  decor: [
    '#N56#N#N#N#N#56#D#N#',
    '|                  |',
    '|  V V         H   |',
    '|                  |',
    '|     P            |',
    '|         K K      |',
    '|                  |',
    '                   |',
    '                   |',
    '|                  |',
    '|   []        b    |',
    '|                  |',
    '|        P         |',
    '|                  |',
    '#N#W#N#W#N#W#N#W#N##',
  ],

  exits: {
    west: 'plaza',
  },

  spawns: [
    {
      type: 'npc',
      archetype: 'civ_b',
      id: 'vendor',
      x: 4,
      y: 3,
      facing: 'down',
      dialogueRules: [
        { if: { job: 'job_dronenest', is: 'completed' }, dialogue: 'vendor_after' },
        { if: { job: 'job_dronenest', is: 'active' }, dialogue: 'vendor_busy' },
        { if: true, dialogue: 'vendor_intro' },
      ],
    },
    {
      // The rival buyer only shows up once you're actually carrying the goods.
      type: 'npc',
      archetype: 'ganger_boss',
      id: 'rival',
      name: 'Sable',
      x: 15,
      y: 11,
      facing: 'left',
      if: { item: 'wetwire_case' },
      dialogue: 'rival_offer',
    },
    {
      type: 'door',
      id: 'roof_door',
      x: 16,
      y: 0,
      to: 'rooftop',
      entry: 'from_market',
      openTile: 'door_open',
    },
    { type: 'pickup', item: 'nuyen', amount: 120, x: 17, y: 5, once: 'market_cash' },
  ],
};
