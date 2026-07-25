import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESOURCE_NAMES } from './schemas.js';
import { serializeResource } from './index.js';
import { validateProject } from './validate.js';

export const CONTENT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../data');

export class ContentConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContentConflictError';
    this.code = 'CONTENT_CONFLICT';
  }
}

export class ContentValidationError extends Error {
  constructor(issues) {
    super('Content validation failed.');
    this.name = 'ContentValidationError';
    this.code = 'CONTENT_INVALID';
    this.issues = issues;
  }
}

function resourcePath(name, directory = CONTENT_DIRECTORY) {
  if (!RESOURCE_NAMES.includes(name)) throw new TypeError(`Unknown content resource "${name}".`);
  const base = resolve(directory);
  const path = resolve(base, `${name}.json`);
  if (dirname(path) !== base) throw new TypeError('Content path escapes the data directory.');
  return path;
}

export function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function readWorkspace(directory = CONTENT_DIRECTORY) {
  const resources = {};
  const revisions = {};
  await Promise.all(RESOURCE_NAMES.map(async (name) => {
    const content = await readFile(resourcePath(name, directory), 'utf8');
    resources[name] = JSON.parse(content);
    revisions[name] = hashContent(content);
  }));
  const project = {
    manifest: resources.project,
    levels: resources.levels,
    rooms: resources.rooms,
    actors: resources.actors,
    items: resources.items,
    jobs: resources.jobs,
    dialogues: resources.dialogues,
    tiles: resources.tiles,
  };
  return { project, revisions, validation: validateProject(project) };
}

export async function saveResource(name, value, expectedRevision, options = {}) {
  const directory = options.directory ?? CONTENT_DIRECTORY;
  const path = resourcePath(name, directory);
  const currentContent = await readFile(path, 'utf8');
  const currentRevision = hashContent(currentContent);
  if (expectedRevision !== currentRevision) {
    throw new ContentConflictError(`"${name}" changed on disk. Reload before saving.`);
  }

  const workspace = await readWorkspace(directory);
  const key = name === 'project' ? 'manifest' : name;
  workspace.project[key] = structuredClone(value);
  const validation = validateProject(workspace.project);
  if (!validation.valid) throw new ContentValidationError(validation.issues);

  const nextContent = serializeResource(value);
  const tempPath = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(tempPath, nextContent, { encoding: 'utf8', flag: 'wx' });
    if (options.beforeRename) await options.beforeRename(tempPath, path);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return { revision: hashContent(nextContent), validation };
}

export async function saveWorkspace(changes, expectedRevisions, options = {}) {
  const directory = options.directory ?? CONTENT_DIRECTORY;
  const names = Object.keys(changes);
  if (names.length === 0) return readWorkspace(directory);
  for (const name of names) resourcePath(name, directory);

  const workspace = await readWorkspace(directory);
  for (const name of names) {
    if (expectedRevisions?.[name] !== workspace.revisions[name]) {
      throw new ContentConflictError(`"${name}" changed on disk. Reload before saving.`);
    }
    workspace.project[name === 'project' ? 'manifest' : name] = structuredClone(changes[name]);
  }
  const validation = validateProject(workspace.project);
  if (!validation.valid) throw new ContentValidationError(validation.issues);

  const pending = [];
  try {
    for (const name of names) {
      const path = resourcePath(name, directory);
      const nextContent = serializeResource(changes[name]);
      const tempPath = `${path}.${randomUUID()}.tmp`;
      const backupPath = `${path}.${randomUUID()}.backup`;
      await writeFile(tempPath, nextContent, { encoding: 'utf8', flag: 'wx' });
      pending.push({ name, path, tempPath, backupPath, nextContent, backedUp: false, committed: false });
    }
    if (options.beforeRename) await options.beforeRename(pending);
    for (let index = 0; index < pending.length; index++) {
      const entry = pending[index];
      await rename(entry.path, entry.backupPath);
      entry.backedUp = true;
      await rename(entry.tempPath, entry.path);
      entry.committed = true;
      if (options.afterRename) await options.afterRename(entry, index);
    }
    await Promise.all(pending.map((entry) => rm(entry.backupPath, { force: true })));
  } catch (error) {
    for (const entry of [...pending].reverse()) {
      if (entry.committed) await rm(entry.path, { force: true });
      if (entry.backedUp) await rename(entry.backupPath, entry.path);
      await rm(entry.tempPath, { force: true });
      await rm(entry.backupPath, { force: true });
    }
    throw error;
  }
  return readWorkspace(directory);
}
