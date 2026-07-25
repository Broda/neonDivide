import { PROJECT, validateProject } from '../src/index.js';

const result = validateProject(PROJECT);
for (const entry of result.issues) {
  console.log(`${entry.severity.toUpperCase()} ${entry.path}: ${entry.message}`);
}
if (!result.valid) process.exitCode = 1;
else console.log(`Content is valid (${Object.keys(PROJECT.rooms).length} rooms, ${Object.keys(PROJECT.dialogues).length} dialogues).`);
