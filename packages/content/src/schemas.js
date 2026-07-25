export const SCHEMAS = Object.freeze({
  project: {
    type: 'object',
    required: ['version', 'id', 'name', 'levels'],
    properties: {
      version: { type: 'integer', minimum: 1 },
      id: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      levels: { type: 'array', items: { type: 'string' } },
    },
  },
  level: {
    type: 'object',
    required: ['id', 'name', 'start', 'rooms'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      start: { type: 'string' },
      rooms: { type: 'array', items: { type: 'string' } },
    },
  },
  room: {
    type: 'object',
    required: ['id', 'name', 'ground', 'decor'],
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      spawn: { type: 'array', minItems: 2, maxItems: 2 },
      ground: { type: 'array', minItems: 15, maxItems: 15 },
      decor: { type: 'array', minItems: 15, maxItems: 15 },
      exits: { type: 'object' },
      entries: { type: 'object' },
      spawns: { type: 'array' },
    },
  },
  actor: { type: 'object', required: ['sheet', 'name'] },
  item: { type: 'object', required: ['name', 'icon', 'desc'] },
  job: { type: 'object', required: ['id', 'title', 'objectives'] },
  dialogue: { type: 'object', required: ['nodes'] },
});

export const RESOURCE_NAMES = Object.freeze([
  'project', 'levels', 'rooms', 'actors', 'items', 'jobs', 'dialogues', 'tiles',
]);

export const OBJECTIVE_TYPES = Object.freeze([
  'kill', 'collect', 'reach', 'talk', 'deliver', 'flag', 'hack', 'condition',
]);

export const EFFECT_VERBS = Object.freeze([
  'setFlag', 'clearFlag', 'giveItem', 'takeItem', 'nuyen', 'karma', 'heal',
  'damage', 'ammo', 'startJob', 'completeJob', 'failJob',
  'completeObjective', 'unlock', 'spawn', 'toast', 'warp',
]);
