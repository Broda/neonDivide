/**
 * Kagemori Plaza - the hub screen and the level's start point.
 *
 * Room format: two 15x20 ASCII layers keyed by src/data/tiles.js LEGEND.
 * ' ' means no tile. `exits` wires the four screen edges to neighbouring rooms.
 */
export default {
  id: 'plaza',
  name: 'Kagemori Plaza',
  spawn: [10, 9],

  ground: [
    '____________________',
    '____________________',
    '__................__',
    '__.......u........__',
    '__................__',
    '__......,.........__',
    '__................__',
    '__................__',
    '__.........U......__',
    '__................__',
    '__......o.........__',
    '__................__',
    '__................__',
    '____________________',
    '____________________',
  ],

  decor: [
    '#W#WN#W##  #W#N#W#W#',
    '|  12             V|',
    '|  34              |',
    '|                  |',
    '|      T           |',
    '|          []      |',
    '|                  |',
    '|                   ',
    '|                   ',
    '|                  |',
    '|     P            |',
    '|                  |',
    '|   K K            |',
    '|                  |',
    '#W#W#N#W#  #W#N#W#W#',
  ],

  exits: {
    north: 'alley',
    east: 'market',
    south: 'strip',
  },

  spawns: [
    {
      type: 'npc',
      archetype: 'fixer',
      id: 'kaz',
      x: 5,
      y: 8,
      facing: 'right',
      // Which graph Kaz opens depends on how far the job has got. First match
      // wins, so the list reads top-down as the most advanced state first.
      dialogueRules: [
        { if: { flag: 'wetwire_resolved' }, dialogue: 'kaz_after' },
        { if: { item: 'wetwire_case' }, dialogue: 'kaz_handover' },
        { if: { job: 'job_wetwire', is: 'active' }, dialogue: 'kaz_busy' },
        { if: true, dialogue: 'kaz_intro' },
      ],
    },
    {
      type: 'npc',
      archetype: 'civ_a',
      id: 'plaza_civ',
      x: 15,
      y: 11,
      wander: true,
      dialogue: 'civ_plaza',
    },
    { type: 'pickup', item: 'ammo', amount: 1, x: 17, y: 3, once: 'plaza_ammo' },
    {
      type: 'sign',
      x: 3,
      y: 2,
      id: 'plaza_billboard',
      text: 'FERRISTECH — "YOUR BODY, PERFECTED." (someone has tagged it)',
    },
  ],
};
