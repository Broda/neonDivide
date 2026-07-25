/** Cold Room - the wetwire case sits here, and so do the drones. */
export default {
  id: 'server',
  name: 'Cold Room',
  spawn: [2, 7],

  ground: [
    'pppppppppppppppppppp',
    'pnnnnnnnnnnnnnnnnnnp',
    'pppppppppppppppppppp',
    'pnnnnnnnnnnnnnnnnnnp',
    'pppppppppppppppppppp',
    'pppppppppppppppppppp',
    'ppppppppppppppppppnp',
    'ppppppppppppppppppnp',
    'ppppppppppppppppppnp',
    'pppppppppppppppppppp',
    'pppppppppppppppppppp',
    'pnnnnnnnnnnnnnnnnnnp',
    'pppppppppppppppppppp',
    'pppppppppppppppppppp',
    'pppppppppppppppppppp',
  ],

  decor: [
    'IIIIIIIIIIIIIIIIIIII',
    'j S S S S S S S    j',
    'j                  j',
    'j S S S S S S S    j',
    'j                  j',
    'j                  j',
    'j                  j',
    '                   j',
    '                   j',
    'j                  j',
    'j   S S S          j',
    'j                  j',
    'j         t        j',
    'j                  j',
    'IIIIIIIIIIIIIIIIIIII',
  ],

  exits: {
    west: 'lobby',
  },

  spawns: [
    {
      type: 'pickup',
      item: 'wetwire_case',
      amount: 1,
      x: 16,
      y: 7,
      once: 'the_case',
    },
    {
      type: 'enemy',
      archetype: 'sec_drone',
      id: 'server_drone1',
      x: 12,
      y: 5,
      brain: 'drone',
    },
    {
      type: 'enemy',
      archetype: 'sec_drone',
      id: 'server_drone2',
      x: 8,
      y: 9,
      brain: 'drone',
    },
    {
      type: 'terminal',
      id: 'server_terminal',
      x: 10,
      y: 12,
      dialogue: 'terminal_server',
    },
  ],

  reinforcements: [
    { archetype: 'sec_drone', brain: 'drone', x: 18, y: 2 },
    { archetype: 'guard', brain: 'shooter', x: 2, y: 12 },
  ],
};
