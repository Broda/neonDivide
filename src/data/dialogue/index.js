// See src/data/jobs/index.js - the `with { type: 'json' }` attribute keeps
// these importable by both Node's test runner and Vite.
import backlot from './backlot.json' with { type: 'json' };
import kaz from './kaz.json' with { type: 'json' };
import misc from './misc.json' with { type: 'json' };
import vex from './vex.json' with { type: 'json' };

/**
 * Dialogue registry, keyed by graph id.
 *
 * Each JSON file holds several graphs so related conversations live together.
 * Adding one: add the graph to a file (or add a new file and import it), then
 * reference its key from a room's `dialogue` / `dialogueRules`.
 */
export const DIALOGUES = {
  ...kaz,
  ...vex,
  ...backlot,
  ...misc,
};

export default DIALOGUES;
