export { ENEMIES, NPCS } from '@neon-divide/content';

import { ENEMIES, NPCS } from '@neon-divide/content';

/** Every actor sheet the Phaser boot scene must load. */
export const ALL_SHEETS = [
  'runner',
  ...new Set([
    ...Object.values(ENEMIES).map((enemy) => enemy.sheet),
    ...Object.values(NPCS).map((npc) => npc.sheet),
  ]),
];
