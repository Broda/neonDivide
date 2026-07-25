/** Ferristech Lobby - past the door, and patrolled accordingly. */
export default {
  id: 'lobby',
  name: 'Ferristech Lobby',
  spawn: [9, 12],

  entries: {
    from_backlot: [9, 12],
  },

  ground: [
    'ffffffffffffffffffff',
    'fppppppppppppppppppf',
    'fpffffffffffffffffpf',
    'fpffrrrrrrffffffffpf',
    'fpffrrrrrrffffffffpf',
    'fpffffffffffffffffpf',
    'fpffffffffffffffffpf',
    'nnffffffffffffffffpf',
    'nnffffffffffffffffpf',
    'fpffffffffffffffffpf',
    'fpffffffffffffffffpf',
    'fpffffffffffffffffpf',
    'fppppppppppppppppppf',
    'ffffffnnnnnnffffffff',
    'ffffffffffffffffffff',
  ],

  decor: [
    'IIIIIIIIIIIIIIIIIIII',
    'j                  j',
    'j  S S S           j',
    'j                  j',
    'j           H      j',
    'j                  j',
    'j        t         j',
    'j                   ',
    'j                   ',
    'j                  j',
    'j   K              j',
    'j                  j',
    'j                  j',
    'j                  j',
    'IIIIIIIII  IIIIIIIII',
  ],

  exits: {
    south: 'backlot',
    east: 'server',
  },

  spawns: [
    {
      type: 'enemy',
      archetype: 'guard',
      id: 'lobby_guard1',
      x: 6,
      y: 4,
      brain: 'shooter',
      path: [[6, 4], [14, 4], [14, 9], [6, 9]],
    },
    {
      type: 'enemy',
      archetype: 'sec_drone',
      id: 'lobby_drone',
      x: 15,
      y: 11,
      brain: 'drone',
    },
    {
      type: 'terminal',
      id: 'lobby_terminal',
      x: 9,
      y: 6,
      dialogue: 'terminal_lobby',
    },
    { type: 'pickup', item: 'medkit', amount: 1, x: 4, y: 10, once: 'lobby_medkit' },
  ],

  reinforcements: [
    { archetype: 'guard', brain: 'shooter', x: 17, y: 7 },
  ],
};
