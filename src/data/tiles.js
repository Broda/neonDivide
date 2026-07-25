/**
 * ASCII legend for hand-authored rooms.
 *
 * Rooms are written as string art (see src/data/rooms/) because editing a 20x15
 * grid of numbers by hand is unbearable. Each character maps to a tile *name*;
 * RoomManager resolves names to indices using the generated
 * public/assets/tiles_neokyoto.json, so tile ids can shuffle when the generator
 * changes without breaking a single room file.
 *
 * ' ' (space) means "no tile" in any layer.
 */

export const EMPTY = ' ';

export const LEGEND = {
  // -- ground ---------------------------------------------------------------
  '.': 'asphalt',
  ',': 'asphalt_crack',
  o: 'asphalt_drain',
  ':': 'road_line',
  '=': 'crosswalk',
  u: 'puddle_cyan',
  U: 'puddle_magenta',
  _: 'sidewalk',
  c: 'sidewalk_curb',
  g: 'grate',
  f: 'floor_tile',
  p: 'floor_panel',
  n: 'floor_neon',
  v: 'gravel',
  r: 'rug',
  '~': 'sludge',
  '<': 'stairs_up',
  '>': 'stairs_down',

  // -- walls ----------------------------------------------------------------
  // Walls come in two runs. '#'-style tiles have courses running left-to-right
  // and belong on the top/bottom edges; the '|'-style variants run vertically
  // for the left/right edges. Using the horizontal tile down a column reads as
  // a stack of misplaced top-wall pieces, so pick the one matching the run.
  '#': 'wall',
  '|': 'wall_side',
  '^': 'wall_top',
  C: 'wall_corrugated', // vertical ridges already - fine in either run
  W: 'wall_window_lit',
  w: 'wall_window_dark',
  N: 'wall_neon',
  I: 'wall_interior',
  j: 'wall_interior_side',
  x: 'fence',
  X: 'fence_post',
  '!': 'pipe_v',
  '-': 'pipe_h',
  L: 'ledge',
  '(': 'ledge_side',
  '@': 'void',

  // -- props ----------------------------------------------------------------
  K: 'crate',
  k: 'crate_tech',
  '[': 'dumpster_l',
  ']': 'dumpster_r',
  b: 'barrel',
  B: 'barrel_toxic',
  V: 'vending',
  A: 'ac_unit',
  S: 'server_rack',
  H: 'bench',
  P: 'planter',
  T: 'streetlight',
  Y: 'antenna',

  // -- signage (2x2 billboard) ----------------------------------------------
  1: 'billboard_tl',
  2: 'billboard_tr',
  3: 'billboard_bl',
  4: 'billboard_br',
  5: 'neon_sign_l',
  6: 'neon_sign_r',

  // -- doors and interactive ------------------------------------------------
  D: 'door',
  d: 'door_open',
  Z: 'sec_door',
  z: 'sec_door_open',
  t: 'terminal',
  y: 'terminal_dead',
  R: 'reader',
};

/** Reverse lookup, handy for debug overlays. */
export const CHAR_FOR_TILE = Object.fromEntries(
  Object.entries(LEGEND).map(([ch, name]) => [name, ch]),
);
