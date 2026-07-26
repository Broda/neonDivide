/**
 * Global tuning constants. Anything a designer might want to nudge lives here
 * rather than being buried in the entity code.
 */

export const TILE = 16;

/** A room is one Zelda-style screen. The camera never scrolls within a room. */
export const ROOM_W = 20;
export const ROOM_H = 15;
export const ROOM_PX_W = TILE * ROOM_W; // 320
export const ROOM_PX_H = TILE * ROOM_H; // 240

/** The HUD occupies a strip above the play area, NES-style. */
export const HUD_H = 32;
export const GAME_W = ROOM_PX_W;
export const GAME_H = ROOM_PX_H + HUD_H;

export const SCENES = {
  BOOT: 'Boot',
  TITLE: 'Title',
  WORLD: 'World',
  HUD: 'Hud',
  DIALOGUE: 'Dialogue',
  JOURNAL: 'Journal',
  GAMEOVER: 'GameOver',
};

/** Actors y-sort by adding their y to the base, so ACTOR must have headroom. */
export const DEPTH = {
  GROUND: 0,
  DECOR: 10,
  PICKUP: 50,
  ACTOR: 100,
  FX: 900,
  OVERLAY: 1000,
};

export const DIRS = ['down', 'left', 'right', 'up'];

/** Sheet layout produced by tools/gen_actors.py - keep in sync with that file. */
export const ACTOR_FRAME = { w: 16, h: 24, cols: 7, rows: 4 };
export const POSE_COLS = {
  walk: [0, 1, 2, 3],
  idle: [0],
  attack: [4, 5],
  hurt: [6],
};

export const PLAYER = {
  speed: 78,
  dashSpeed: 210,
  dashMs: 160,
  dashCooldownMs: 620,
  attackCooldownMs: 320,
  attackWindupMs: 70,
  attackActiveMs: 110,
  meleeReach: 15,
  meleeWidth: 20,
  meleeDamage: 2,
  fireCooldownMs: 260,
  bulletSpeed: 260,
  bulletDamage: 2,
  invulnMs: 700,
  knockback: 130,
  interactRange: 22,
};

export const ENEMY_DEFAULTS = {
  speed: 46,
  sightRange: 92,
  attackRange: 18,
  attackCooldownMs: 900,
  damage: 1,
  knockback: 150,
  invulnMs: 180,
};

/** Width of the band at a room edge that triggers a transition. */
export const EDGE_BAND = 5;
export const TRANSITION_MS = 260;
