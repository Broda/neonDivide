import { EFFECT_VERBS, OBJECTIVE_TYPES, RESOURCE_NAMES } from './schemas.js';

const ROOM_W = 20;
const ROOM_H = 15;
const DIRECTIONS = new Set(['north', 'south', 'east', 'west']);

function issue(issues, severity, code, path, message) {
  issues.push({ severity, code, path, message });
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectEffects(graph) {
  const effects = [];
  const add = (value) => {
    if (!value) return;
    for (const effect of Array.isArray(value) ? value : [value]) effects.push(effect);
  };
  for (const node of Object.values(graph?.nodes ?? {})) {
    add(node.onEnter);
    for (const choice of node.choices ?? []) {
      add(choice.do);
      add(choice.onSuccess?.do);
      add(choice.onFail?.do);
    }
  }
  return effects;
}

function validateEffects(effects, project, path, issues) {
  effects.forEach((effect, index) => {
    if (!isRecord(effect)) {
      issue(issues, 'error', 'effect.shape', `${path}.${index}`, 'Effect must be an object.');
      return;
    }
    const known = Object.keys(effect).filter((key) => EFFECT_VERBS.includes(key));
    if (known.length === 0) {
      issue(issues, 'warning', 'effect.unknown', `${path}.${index}`, 'Effect has no known verb.');
    }
    for (const verb of ['startJob', 'completeJob', 'failJob']) {
      if (effect[verb] && !project.jobs[effect[verb]]) {
        issue(issues, 'error', 'reference.job', `${path}.${index}.${verb}`, `Unknown job "${effect[verb]}".`);
      }
    }
    for (const verb of ['giveItem', 'takeItem']) {
      if (effect[verb] && !project.items[effect[verb]]) {
        issue(issues, 'error', 'reference.item', `${path}.${index}.${verb}`, `Unknown item "${effect[verb]}".`);
      }
    }
  });
}

export function validateProject(project) {
  const issues = [];
  if (!isRecord(project)) {
    issue(issues, 'error', 'project.shape', 'project', 'Project must be an object.');
    return { valid: false, issues };
  }
  for (const name of RESOURCE_NAMES) {
    const key = name === 'project' ? 'manifest' : name;
    if (!(key in project)) issue(issues, 'error', 'project.resource', key, `Missing "${key}" resource.`);
  }
  if (issues.length) return { valid: false, issues };

  const { manifest, levels, rooms, actors, items, jobs, dialogues, tiles } = project;
  if (!isRecord(manifest) || !manifest.id || !Array.isArray(manifest.levels)) {
    issue(issues, 'error', 'manifest.shape', 'project', 'Project manifest is malformed.');
  }
  for (const levelId of manifest?.levels ?? []) {
    if (!levels[levelId]) issue(issues, 'error', 'reference.level', `project.levels.${levelId}`, `Unknown level "${levelId}".`);
  }
  const legend = tiles?.legend ?? {};
  const tileNames = new Set(Object.values(legend));
  if (!isRecord(legend)) issue(issues, 'error', 'tiles.legend', 'tiles.legend', 'Tile legend must be an object.');

  for (const [levelId, level] of Object.entries(levels ?? {})) {
    if (level.id !== levelId) issue(issues, 'error', 'id.mismatch', `levels.${levelId}.id`, 'Level key and id must match.');
    if (!rooms[level.start]) issue(issues, 'error', 'reference.room', `levels.${levelId}.start`, `Unknown start room "${level.start}".`);
    for (const roomId of level.rooms ?? []) {
      if (!rooms[roomId]) issue(issues, 'error', 'reference.room', `levels.${levelId}.rooms`, `Unknown room "${roomId}".`);
    }
    if (rooms[level.start]) {
      const allowed = new Set(level.rooms ?? []);
      const seen = new Set([level.start]);
      const queue = [level.start];
      while (queue.length) {
        const room = rooms[queue.shift()];
        const targets = [
          ...Object.values(room.exits ?? {}),
          ...(room.spawns ?? []).filter((spawn) => spawn.type === 'door' && spawn.to).map((spawn) => spawn.to),
        ];
        for (const target of targets) {
          if (allowed.has(target) && !seen.has(target)) {
            seen.add(target);
            queue.push(target);
          }
        }
      }
      for (const roomId of allowed) {
        if (!seen.has(roomId)) issue(issues, 'error', 'level.unreachable', `levels.${levelId}.rooms.${roomId}`, `Room "${roomId}" is unreachable from "${level.start}".`);
      }
    }
  }

  for (const [roomId, room] of Object.entries(rooms ?? {})) {
    const base = `rooms.${roomId}`;
    if (room.id !== roomId) issue(issues, 'error', 'id.mismatch', `${base}.id`, 'Room key and id must match.');
    if (typeof room.name !== 'string' || room.name.trim() === '') issue(issues, 'error', 'room.name', `${base}.name`, 'Room name is required.');
    if (!Array.isArray(room.spawn) || room.spawn.length !== 2) {
      issue(issues, 'error', 'room.spawn', `${base}.spawn`, 'Player start must be an [x, y] pair.');
    } else {
      const [spawnX, spawnY] = room.spawn;
      if (!Number.isInteger(spawnX) || spawnX < 0 || spawnX >= ROOM_W) issue(issues, 'error', 'room.spawnX', `${base}.spawn.0`, 'Player start x is outside the room.');
      if (!Number.isInteger(spawnY) || spawnY < 0 || spawnY >= ROOM_H) issue(issues, 'error', 'room.spawnY', `${base}.spawn.1`, 'Player start y is outside the room.');
    }
    for (const layerName of ['ground', 'decor']) {
      const layer = room[layerName];
      if (!Array.isArray(layer) || layer.length !== ROOM_H) {
        issue(issues, 'error', 'room.height', `${base}.${layerName}`, `Layer must contain ${ROOM_H} rows.`);
        continue;
      }
      layer.forEach((row, y) => {
        if (typeof row !== 'string' || [...row].length !== ROOM_W) {
          issue(issues, 'error', 'room.width', `${base}.${layerName}.${y}`, `Row must contain ${ROOM_W} characters.`);
          return;
        }
        [...row].forEach((character, x) => {
          if (character !== (tiles.empty ?? ' ') && !legend[character]) {
            issue(issues, 'error', 'reference.tile', `${base}.${layerName}.${y}.${x}`, `Unknown tile character "${character}".`);
          }
        });
      });
    }
    for (const [direction, target] of Object.entries(room.exits ?? {})) {
      if (!DIRECTIONS.has(direction)) issue(issues, 'error', 'room.exitDirection', `${base}.exits.${direction}`, 'Unknown exit direction.');
      if (!rooms[target]) issue(issues, 'error', 'reference.room', `${base}.exits.${direction}`, `Unknown room "${target}".`);
    }
    (room.spawns ?? []).forEach((spawn, index) => {
      const path = `${base}.spawns.${index}`;
      if (!Number.isInteger(spawn.x) || spawn.x < 0 || spawn.x >= ROOM_W) issue(issues, 'error', 'spawn.x', `${path}.x`, 'Spawn x is outside the room.');
      if (!Number.isInteger(spawn.y) || spawn.y < 0 || spawn.y >= ROOM_H) issue(issues, 'error', 'spawn.y', `${path}.y`, 'Spawn y is outside the room.');
      if (spawn.type === 'enemy' && !actors.enemies?.[spawn.archetype]) issue(issues, 'error', 'reference.enemy', `${path}.archetype`, `Unknown enemy "${spawn.archetype}".`);
      if (spawn.type === 'npc' && !actors.npcs?.[spawn.archetype]) issue(issues, 'error', 'reference.npc', `${path}.archetype`, `Unknown NPC "${spawn.archetype}".`);
      if (spawn.type === 'pickup' && !items[spawn.item]) issue(issues, 'error', 'reference.item', `${path}.item`, `Unknown item "${spawn.item}".`);
      if (spawn.type === 'door' && spawn.to && !rooms[spawn.to]) issue(issues, 'error', 'reference.room', `${path}.to`, `Unknown room "${spawn.to}".`);
      if (spawn.openTile && !tileNames.has(spawn.openTile)) issue(issues, 'error', 'reference.tileName', `${path}.openTile`, `Unknown tile "${spawn.openTile}".`);
      for (const key of [spawn.dialogue, spawn.lockedDialogue, ...(spawn.dialogueRules ?? []).map((rule) => rule.dialogue)].filter(Boolean)) {
        if (!dialogues[key]) issue(issues, 'error', 'reference.dialogue', `${path}.dialogue`, `Unknown dialogue "${key}".`);
      }
    });
  }

  for (const [jobId, job] of Object.entries(jobs ?? {})) {
    const base = `jobs.${jobId}`;
    if (job.id !== jobId) issue(issues, 'error', 'id.mismatch', `${base}.id`, 'Job key and id must match.');
    const objectiveIds = new Set();
    for (const objective of job.objectives ?? []) {
      if (!objective.id) issue(issues, 'error', 'job.objectiveId', `${base}.objectives`, 'Objective needs an id.');
      if (objectiveIds.has(objective.id)) issue(issues, 'error', 'job.duplicateObjective', `${base}.objectives.${objective.id}`, 'Duplicate objective id.');
      objectiveIds.add(objective.id);
      if (!OBJECTIVE_TYPES.includes(objective.type)) issue(issues, 'error', 'job.objectiveType', `${base}.objectives.${objective.id}.type`, `Unknown objective type "${objective.type}".`);
      if (objective.item && !items[objective.item]) issue(issues, 'error', 'reference.item', `${base}.objectives.${objective.id}.item`, `Unknown item "${objective.item}".`);
      if (objective.room && !rooms[objective.room]) issue(issues, 'error', 'reference.room', `${base}.objectives.${objective.id}.room`, `Unknown room "${objective.room}".`);
      if (objective.archetype && !actors.enemies?.[objective.archetype]) issue(issues, 'error', 'reference.enemy', `${base}.objectives.${objective.id}.archetype`, `Unknown enemy "${objective.archetype}".`);
    }
    for (const objective of job.objectives ?? []) {
      for (const required of objective.requires ?? []) {
        if (!objectiveIds.has(required)) issue(issues, 'error', 'reference.objective', `${base}.objectives.${objective.id}.requires`, `Unknown objective "${required}".`);
      }
    }
  }

  for (const [graphId, graph] of Object.entries(dialogues ?? {})) {
    const base = `dialogues.${graphId}`;
    const nodes = graph.nodes ?? {};
    const start = graph.start ?? Object.keys(nodes)[0];
    if (!nodes[start]) issue(issues, 'error', 'reference.node', `${base}.start`, `Unknown start node "${start}".`);
    for (const [nodeId, node] of Object.entries(nodes)) {
      if (node.next && !nodes[node.next]) issue(issues, 'error', 'reference.node', `${base}.nodes.${nodeId}.next`, `Unknown node "${node.next}".`);
      for (const choice of node.choices ?? []) {
        for (const target of [choice.goto, choice.onSuccess?.goto, choice.onFail?.goto].filter(Boolean)) {
          if (!nodes[target]) issue(issues, 'error', 'reference.node', `${base}.nodes.${nodeId}.choices`, `Unknown node "${target}".`);
        }
      }
    }
    validateEffects(collectEffects(graph), project, `${base}.effects`, issues);
  }

  const referencedRooms = new Set();
  for (const level of Object.values(levels ?? {})) for (const room of level.rooms ?? []) referencedRooms.add(room);
  for (const roomId of Object.keys(rooms ?? {})) {
    if (!referencedRooms.has(roomId)) issue(issues, 'warning', 'room.orphan', `rooms.${roomId}`, 'Room is not assigned to a level.');
  }

  return { valid: !issues.some((entry) => entry.severity === 'error'), issues };
}
