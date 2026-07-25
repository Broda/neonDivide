import actors from '../data/actors.json' with { type: 'json' };
import dialogues from '../data/dialogues.json' with { type: 'json' };
import items from '../data/items.json' with { type: 'json' };
import jobs from '../data/jobs.json' with { type: 'json' };
import levels from '../data/levels.json' with { type: 'json' };
import manifest from '../data/project.json' with { type: 'json' };
import rooms from '../data/rooms.json' with { type: 'json' };
import tiles from '../data/tiles.json' with { type: 'json' };

import { RESOURCE_NAMES, SCHEMAS, OBJECTIVE_TYPES, EFFECT_VERBS } from './schemas.js';
import { validateProject } from './validate.js';

export { EFFECT_VERBS, OBJECTIVE_TYPES, RESOURCE_NAMES, SCHEMAS, validateProject };

export const PROJECT = { manifest, levels, rooms, actors, items, jobs, dialogues, tiles };
export const LEVELS = levels;
export const ROOMS = rooms;
export const ACTORS = actors;
export const ENEMIES = actors.enemies;
export const NPCS = actors.npcs;
export const ITEMS = items;
export const JOBS = jobs;
export const DIALOGUES = dialogues;
export const EMPTY = tiles.empty;
export const LEGEND = tiles.legend;
export const CHAR_FOR_TILE = Object.fromEntries(Object.entries(LEGEND).map(([character, name]) => [name, character]));

export function compileProject(project = PROJECT) {
  const result = validateProject(project);
  if (!result.valid) {
    const message = result.issues.filter((entry) => entry.severity === 'error').map((entry) => `${entry.path}: ${entry.message}`).join('\n');
    throw new Error(`Cannot compile invalid content:\n${message}`);
  }
  return structuredClone(project);
}

export function parseProject(value) {
  const project = typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
  const result = validateProject(project);
  if (!result.valid) {
    const error = new Error('Content validation failed.');
    error.issues = result.issues;
    throw error;
  }
  return project;
}

export function serializeResource(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
