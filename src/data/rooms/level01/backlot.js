/**
 * Ferristech Backlot - the level's central obstacle.
 *
 * The security door has three independent solutions, which is the whole point:
 *   1. Hack the reader        (Logic + hacking, +2 dice with a cyberdeck)
 *   2. Take the red keycard   (Krait drops it on death)
 *   3. Talk the guard down    (Charisma + etiquette)
 * Routes 1 and 3 set the `unlocked:sec_door` flag; route 2 satisfies the door's
 * own `lock` condition. Interactable.isUnlocked accepts either.
 */
export default {
  id: 'backlot',
  name: 'Ferristech Backlot',
  spawn: [2, 7],

  entries: {
    from_lobby: [9, 2],
  },

  ground: [
    'vvvvvvvvvvvvvvvvvvvv',
    'vvvvvvvvv__vvvvvvvvv',
    'vv________________vv',
    'vv________________vv',
    'vv_____vvvv_______vv',
    'vv________________vv',
    '__________________vv',
    '__________________vv',
    'vv________________vv',
    'vv_____~__________vv',
    'vv________________vv',
    'vv________________vv',
    'vv_____vvvv_______vv',
    'vv________________vv',
    'vvvvvvvvvvvvvvvvvvvv',
  ],

  decor: [
    '####x####Z#R####x###',
    '|                  |',
    '|  A            A  |',
    '|                  |',
    '|      k    k      |',
    '|                  |',
    '                   |',
    '                   |',
    '|                  |',
    '|   K              |',
    '|                  |',
    '|        t         |',
    '|                  |',
    '|   [] B           |',
    '####################',
  ],

  exits: {
    west: 'alley',
  },

  spawns: [
    {
      type: 'door',
      id: 'sec_door',
      x: 9,
      y: 0,
      to: 'lobby',
      entry: 'from_backlot',
      lock: { item: 'keycard_red' },
      lockedDialogue: 'sec_door_locked',
      openTile: 'sec_door_open',
    },
    {
      type: 'terminal',
      id: 'door_reader',
      x: 11,
      y: 0,
      dialogue: 'reader_hack',
    },
    {
      type: 'npc',
      archetype: 'guard',
      id: 'gate_guard',
      name: 'Gate Guard',
      x: 7,
      y: 2,
      facing: 'down',
      // Once the door is open there's nothing left to negotiate.
      dialogueRules: [
        { if: { flag: 'unlocked:sec_door' }, dialogue: 'guard_after' },
        { if: true, dialogue: 'guard_gate' },
      ],
      if: { not: { flag: 'guard_dismissed' } },
    },
    {
      type: 'enemy',
      archetype: 'ganger_boss',
      id: 'krait',
      x: 14,
      y: 9,
      brain: 'patrol',
      path: [[14, 9], [5, 9], [5, 12], [14, 12]],
    },
    {
      type: 'enemy',
      archetype: 'ganger_gun',
      id: 'backlot_g1',
      x: 16,
      y: 4,
      brain: 'shooter',
      path: [[16, 4], [16, 11]],
    },
    {
      type: 'terminal',
      id: 'backlot_terminal',
      x: 9,
      y: 11,
      dialogue: 'terminal_backlot',
    },
  ],

  // Spawned in waves if a drone raises the alarm in this room.
  reinforcements: [
    { archetype: 'guard', brain: 'shooter', x: 10, y: 1 },
    { archetype: 'ganger_gun', brain: 'shooter', x: 2, y: 7 },
  ],
};
