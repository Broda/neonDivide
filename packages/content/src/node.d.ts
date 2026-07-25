import type { ContentProject, ResourceName, ValidationResult } from './index.js';
export const CONTENT_DIRECTORY: string;
export class ContentConflictError extends Error { code: 'CONTENT_CONFLICT' }
export class ContentValidationError extends Error { code: 'CONTENT_INVALID'; issues: ValidationResult['issues'] }
export function hashContent(content: string): string;
export function readWorkspace(directory?: string): Promise<{
  project: ContentProject;
  revisions: Record<ResourceName, string>;
  validation: ValidationResult;
}>;
export function saveResource(
  name: ResourceName,
  value: unknown,
  expectedRevision: string,
  options?: { directory?: string; beforeRename?: (temporaryPath: string, destinationPath: string) => void | Promise<void> },
): Promise<{ revision: string; validation: ValidationResult }>;
export function saveWorkspace(
  changes: Partial<Record<ResourceName, unknown>>,
  expectedRevisions: Partial<Record<ResourceName, string>>,
  options?: {
    directory?: string;
    beforeRename?: (pending: unknown[]) => void | Promise<void>;
    afterRename?: (entry: unknown, index: number) => void | Promise<void>;
  },
): Promise<{
  project: ContentProject;
  revisions: Record<ResourceName, string>;
  validation: ValidationResult;
}>;
