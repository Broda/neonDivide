/** Sodium Alley - Vex the decker holds court here, guarded by a razor ganger. */
export default {
  id: 'alley',
  name: 'Sodium Alley',
  spawn: [10, 12],

  ground: [
    '....................',
    '....................',
    '....u...............',
    '....................',
    '......gggg..........',
    '....................',
    '..........U.........',
    '....................',
    '....................',
    '.....,..............',
    '....................',
    '..........u.........',
    '....................',
    '....................',
    '....................',
  ],

  decor: [
    'CCCCCCCCCCCCCCCCCCCC',
    'C   []           - C',
    'C                  C',
    'C        b         C',
    'C  !               C',
    'C                  C',
    'C            K     C',
    'C                   ',
    'C                   ',
    'C                  C',
    'C   B              C',
    'C                  C',
    'C          []      C',
    'C                  C',
    'CCCCCCCCC  CCCCCCCCC',
  ],

  exits: {
    south: 'plaza',
    east: 'backlot',
  },

  spawns: [
    {
      type: 'npc',
      archetype: 'decker',
      id: 'vex',
      x: 4,
      y: 6,
      facing: 'down',
      dialogueRules: [
        { if: { item: 'cyberdeck' }, dialogue: 'vex_after' },
        { if: true, dialogue: 'vex_intro' },
      ],
    },
    {
      type: 'enemy',
      archetype: 'ganger_blade',
      id: 'alley_g1',
      x: 14,
      y: 10,
      brain: 'patrol',
      path: [[14, 10], [14, 4], [17, 4]],
    },
    { type: 'pickup', item: 'medkit', amount: 1, x: 3, y: 12, once: 'alley_medkit' },
  ],
};
