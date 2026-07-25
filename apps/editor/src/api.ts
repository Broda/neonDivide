import type { ContentProject, ResourceName, ValidationResult } from '@neon-divide/content';

export interface WorkspacePayload {
  project: ContentProject;
  revisions: Record<ResourceName, string>;
  validation: ValidationResult;
}

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? `Request failed (${response.status})`) as Error & { issues?: ValidationResult['issues'] };
    error.issues = data.issues;
    throw error;
  }
  return data;
}

export async function loadProject(): Promise<WorkspacePayload> {
  return responseJson(await fetch('/api/project'));
}

export async function saveProject(
  changes: Partial<Record<ResourceName, unknown>>,
  revisions: Record<ResourceName, string>,
): Promise<WorkspacePayload> {
  return responseJson(await fetch('/api/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changes, revisions }),
  }));
}
