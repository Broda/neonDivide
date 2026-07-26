export function createHistory(project) {
  return { past: [], present: structuredClone(project), future: [] };
}

export function commitHistory(history, project) {
  if (JSON.stringify(project) === JSON.stringify(history.present)) return history;
  return {
    past: [...history.past.slice(-49), history.present],
    present: structuredClone(project),
    future: [],
  };
}

export function undoHistory(history) {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past.at(-1),
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history) {
  if (history.future.length === 0) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  };
}

export function paintTile(project, roomId, layer, x, y, character) {
  if (!['ground', 'decor'].includes(layer) || x < 0 || x >= 20 || y < 0 || y >= 15) return project;
  const next = structuredClone(project);
  const row = [...next.rooms[roomId][layer][y]];
  row[x] = character;
  next.rooms[roomId][layer][y] = row.join('');
  return next;
}

// --------------------------------------------------------- record creation

const ROOM_W = 20;
const ROOM_H = 15;

/** Tile characters used for a blank room, from packages/content/data/tiles.json. */
const FLOOR = 'f';
const WALL_CAP = 'I';
const WALL_SIDE = 'j';

export const OPPOSITE_DIRECTION = Object.freeze({
  north: 'south', south: 'north', east: 'west', west: 'east',
});

/**
 * IDs are object keys in the canonical JSON, referenced by other records as
 * bare strings, so they are kept to a conservative shape rather than allowing
 * anything JSON would technically accept as a key.
 */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Every collection a new record could collide with, by kind. */
function existingIds(project, kind) {
  switch (kind) {
    case 'room': return Object.keys(project.rooms);
    case 'enemy': return Object.keys(project.actors.enemies);
    case 'npc': return Object.keys(project.actors.npcs);
    case 'item': return Object.keys(project.items);
    case 'dialogue': return Object.keys(project.dialogues);
    case 'job': return Object.keys(project.jobs);
    default: return [];
  }
}

/**
 * @returns {string|null} why this id can't be used, or null if it can.
 */
export function idError(project, kind, id) {
  if (!id) return 'An ID is required.';
  if (!ID_PATTERN.test(id)) return 'Use lower case letters, digits and underscores, starting with a letter.';
  if (existingIds(project, kind).includes(id)) return `"${id}" already exists.`;
  return null;
}

function blankGround() {
  return Array.from({ length: ROOM_H }, () => FLOOR.repeat(ROOM_W));
}

function blankDecor() {
  return Array.from({ length: ROOM_H }, (_, y) => (
    y === 0 || y === ROOM_H - 1
      ? WALL_CAP.repeat(ROOM_W)
      : WALL_SIDE + ' '.repeat(ROOM_W - 2) + WALL_SIDE
  ));
}

/**
 * Where a doorway sits on a wall. Every hand-authored exit in the game uses
 * these same cells, and they have to match on both sides of a connection:
 * RoomManager.entryPosition carries the player's perpendicular coordinate
 * across the edge, so a gap at y=7 leading to a gap at y=3 would drop them
 * against a wall.
 */
const DOORWAY_ACROSS_X = [9, 10];
const DOORWAY_ACROSS_Y = [7, 8];

/** The cells a doorway occupies on one wall. */
export function doorwayCells(direction) {
  switch (direction) {
    case 'north': return DOORWAY_ACROSS_X.map((x) => ({ x, y: 0 }));
    case 'south': return DOORWAY_ACROSS_X.map((x) => ({ x, y: ROOM_H - 1 }));
    case 'west': return DOORWAY_ACROSS_Y.map((y) => ({ x: 0, y }));
    default: return DOORWAY_ACROSS_Y.map((y) => ({ x: ROOM_W - 1, y }));
  }
}

/**
 * Which doorway cells actually need clearing in an existing room.
 *
 * `solidChars` is the set of legend characters whose tiles collide, taken from
 * the generated tileset metadata. Filtering by it means a doorway removes only
 * what blocks the player and leaves decoration that happens to sit on the edge
 * alone. Passing null clears anything in the way.
 *
 * @param {{ decor: string[] }} room
 * @param {string} direction
 * @param {Set<string>|null} [solidChars]
 * @returns {Array<{ x: number, y: number }>}
 */
export function doorwayEdits(room, direction, solidChars = null) {
  return doorwayCells(direction).filter(({ x, y }) => {
    const character = room.decor[y][x];
    if (character === ' ') return false;
    return solidChars ? solidChars.has(character) : true;
  });
}

/**
 * Opens a two-tile gap in the wall on one edge.
 *
 * Without it a room is sealed: an exit only fires once the player reaches the
 * edge band, which a solid wall tile stops them from ever touching.
 *
 * @param {{ decor: string[] }} room
 * @param {string} direction
 * @param {Set<string>|null} [solidChars]
 */
function openDoorway(room, direction, solidChars = null) {
  const rows = [...room.decor];
  for (const { x, y } of doorwayEdits(room, direction, solidChars)) {
    const row = [...rows[y]];
    row[x] = ' ';
    rows[y] = row.join('');
  }
  return rows;
}

/**
 * Directions off `roomId` that no exit already uses.
 *
 * Attaching to an occupied direction would replace that exit and strand
 * whatever it led to, so the choice is restricted rather than validated after
 * the fact.
 */
export function freeDirections(project, roomId) {
  const exits = project.rooms[roomId]?.exits ?? {};
  return Object.keys(OPPOSITE_DIRECTION).filter((direction) => !exits[direction]);
}

/** Rooms that still have somewhere to attach a neighbour. */
export function connectableRooms(project) {
  return Object.keys(project.rooms).filter((id) => freeDirections(project, id).length > 0);
}

/**
 * Creates a room `direction` of `connectTo`, wired in both directions and
 * walkable from both sides.
 *
 * The reciprocal exit and the level registration are not optional extras: a
 * room listed in a level that can't be walked to from its start room is a
 * validation *error*, so a half-connected room would block saving the project.
 *
 * The doorway is opened on both sides for the same reason. An exit the player
 * cannot physically reach is not an error the validator can see - it is a
 * connection that simply does nothing, which is worse.
 */
export function createRoom(project, {
  id, name, connectTo, direction, solidChars = null,
}) {
  const next = structuredClone(project);
  const back = OPPOSITE_DIRECTION[direction];

  if (!next.rooms[connectTo]) throw new Error(`Unknown room "${connectTo}".`);
  if (next.rooms[connectTo].exits?.[direction]) {
    throw new Error(`"${connectTo}" already has a ${direction} exit to "${next.rooms[connectTo].exits[direction]}".`);
  }

  const created = {
    id,
    name,
    spawn: [10, 7],
    ground: blankGround(),
    decor: blankDecor(),
    exits: { [back]: connectTo },
    spawns: [],
  };
  created.decor = openDoorway(created, back);
  next.rooms[id] = created;

  const source = next.rooms[connectTo];
  source.exits = { ...(source.exits ?? {}), [direction]: id };
  source.decor = openDoorway(source, direction, solidChars);

  const levelId = Object.keys(next.levels).find((key) => next.levels[key].rooms.includes(connectTo));
  if (levelId) next.levels[levelId].rooms = [...next.levels[levelId].rooms, id];

  return next;
}

export function createActor(project, category, { id, name, sheet }) {
  const next = structuredClone(project);
  next.actors[category][id] = category === 'enemies'
    ? {
      sheet, name, hp: 4, speed: 48, brain: 'patrol', damage: 1,
      attackRange: 18, sightRange: 96,
    }
    : { sheet, name };
  return next;
}

export function createItem(project, { id, name, icon, desc }) {
  const next = structuredClone(project);
  next.items[id] = { name, icon, desc };
  return next;
}

export function createDialogue(project, { id, speaker, portrait }) {
  const next = structuredClone(project);
  next.dialogues[id] = {
    id,
    speaker,
    ...(portrait ? { portrait } : {}),
    start: 'start',
    nodes: {
      start: {
        text: ['New dialogue.'],
        choices: [{ text: 'Leave.', end: true }],
      },
    },
  };
  return next;
}

/**
 * Seeds one objective: a job with an empty objective list has nothing
 * outstanding, so JobManager would complete it the moment it started.
 */
export function createJob(project, { id, title, startRoom }) {
  const next = structuredClone(project);
  next.jobs[id] = {
    id,
    title,
    brief: '',
    payment: { nuyen: 0, karma: 0 },
    objectives: [{
      id: 'step1', type: 'reach', room: startRoom, text: 'New objective',
    }],
  };
  return next;
}

export function resourceValue(project, name) {
  return name === 'project' ? project.manifest : project[name];
}

export function dirtyResourceNames(project, baseline, resourceNames) {
  return resourceNames.filter((name) => JSON.stringify(resourceValue(project, name)) !== JSON.stringify(resourceValue(baseline, name)));
}

export function layoutRooms(rooms, startId) {
  const positions = { [startId]: { x: 0, y: 0 } };
  const delta = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  const occupied = new Set(['0,0']);
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    const connections = [
      ...Object.entries(rooms[id]?.exits ?? {}).map(([direction, target]) => ({ direction, target })),
      ...(rooms[id]?.spawns ?? []).filter((spawn) => spawn.type === 'door' && spawn.to)
        .map((spawn) => ({ direction: 'door', target: spawn.to })),
    ];
    for (const { direction, target } of connections) {
      if (!rooms[target] || positions[target]) continue;
      const candidates = direction === 'door'
        ? [[1, 0], [0, -1], [0, 1], [-1, 0]]
        : [delta[direction] ?? [1, 0], [1, 0], [0, -1], [0, 1], [-1, 0]];
      const [dx, dy] = candidates.find(([candidateX, candidateY]) => (
        !occupied.has(`${positions[id].x + candidateX},${positions[id].y + candidateY}`)
      )) ?? [1, 0];
      positions[target] = { x: positions[id].x + dx, y: positions[id].y + dy };
      occupied.add(`${positions[target].x},${positions[target].y}`);
      queue.push(target);
    }
  }
  let orphan = 0;
  for (const id of Object.keys(rooms)) {
    if (!positions[id]) positions[id] = { x: orphan++, y: 3 };
  }
  return positions;
}
