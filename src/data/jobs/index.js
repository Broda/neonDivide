// Import attributes are required by Node's ESM loader (for `npm test`) and are
// understood by Vite's bundler, so the same source runs in both.
import jobDroneNest from './job_dronenest.json' with { type: 'json' };
import jobWetwire from './job_wetwire.json' with { type: 'json' };

/**
 * Job registry. Adding a job: drop a JSON file next to these and import it
 * here. Objective types come from src/quests/objectives.js.
 */
export const JOBS = {
  [jobWetwire.id]: jobWetwire,
  [jobDroneNest.id]: jobDroneNest,
};

export default JOBS;
