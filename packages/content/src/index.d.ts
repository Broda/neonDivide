export type ResourceName = 'project' | 'levels' | 'rooms' | 'actors' | 'items' | 'jobs' | 'dialogues' | 'tiles';
export type IssueSeverity = 'error' | 'warning';
export interface ValidationIssue { severity: IssueSeverity; code: string; path: string; message: string }
export interface ValidationResult { valid: boolean; issues: ValidationIssue[] }
export interface Spawn { type: string; id?: string; archetype?: string; item?: string; x: number; y: number; [key: string]: unknown }
export interface Room {
  id: string; name: string; spawn?: [number, number]; ground: string[]; decor: string[];
  exits?: Record<string, string>; entries?: Record<string, [number, number]>; spawns?: Spawn[];
  [key: string]: unknown;
}
export interface Level { id: string; name: string; start: string; rooms: string[] }
export interface ContentProject {
  manifest: { version: number; id: string; name: string; levels: string[] };
  levels: Record<string, Level>;
  rooms: Record<string, Room>;
  actors: { enemies: Record<string, Record<string, unknown>>; npcs: Record<string, Record<string, unknown>> };
  items: Record<string, Record<string, unknown>>;
  jobs: Record<string, Record<string, unknown>>;
  dialogues: Record<string, Record<string, unknown>>;
  tiles: { empty: string; legend: Record<string, string> };
}
export const PROJECT: ContentProject;
export const LEVELS: ContentProject['levels'];
export const ROOMS: ContentProject['rooms'];
export const ACTORS: ContentProject['actors'];
export const ENEMIES: ContentProject['actors']['enemies'];
export const NPCS: ContentProject['actors']['npcs'];
export const ITEMS: ContentProject['items'];
export const JOBS: ContentProject['jobs'];
export const DIALOGUES: ContentProject['dialogues'];
export const EMPTY: string;
export const LEGEND: Record<string, string>;
export const CHAR_FOR_TILE: Record<string, string>;
export const RESOURCE_NAMES: readonly ResourceName[];
export const OBJECTIVE_TYPES: readonly string[];
export const EFFECT_VERBS: readonly string[];
export const SCHEMAS: Readonly<Record<string, unknown>>;
export function validateProject(project: unknown): ValidationResult;
export function compileProject(project?: ContentProject): ContentProject;
export function parseProject(value: string | unknown): ContentProject;
export function serializeResource(value: unknown): string;
