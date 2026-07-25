/** The Sodium Strip - a shooting gallery of gangers guarding a stash. */
export default {
  id: 'strip',
  name: 'The Strip',
  spawn: [10, 2],

  ground: [
    '....................',
    '.......:............',
    '.......:............',
    '.......:.....u......',
    '.......:............',
    '=======:============',
    '.......:............',
    '.......:............',
    '..,....:............',
    '.......:............',
    '.......:......o.....',
    '.......:............',
    '.......:........U...',
    '....................',
    '____________________',
  ],

  decor: [
    '#########  #########',
    '|                  |',
    '|  x x x           |',
    '|                  |',
    '|           K      |',
    '|                  |',
    '|      T           |',
    '|                  |',
    '|            []    |',
    '|                  |',
    '|   b b            |',
    '|                  |',
    '|          P       |',
    '|                  |',
    '#N#W#N#W#N#W#N#W#N##',
  ],

  exits: {
    north: 'plaza',
  },

  spawns: [
    {
      type: 'enemy',
      archetype: 'ganger_gun',
      id: 'strip_g1',
      x: 15,
      y: 4,
      brain: 'shooter',
      path: [[15, 4], [15, 10]],
    },
    {
      type: 'enemy',
      archetype: 'ganger_blade',
      id: 'strip_g2',
      x: 5,
      y: 9,
      brain: 'patrol',
      path: [[5, 9], [12, 9], [12, 12]],
    },
    { type: 'pickup', item: 'stimpack', amount: 1, x: 17, y: 2, once: 'strip_stim' },
    { type: 'pickup', item: 'ammo', amount: 1, x: 3, y: 12, once: 'strip_ammo' },
  ],
};
