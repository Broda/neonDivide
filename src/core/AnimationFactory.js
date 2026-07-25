import { ACTOR_FRAME, DIRS, POSE_COLS } from '../config.js';

/**
 * Builds every animation from the fixed sheet layout instead of hand-writing
 * ~200 anim definitions. Frame index = directionRow * cols + poseCol, matching
 * the layout documented in tools/gen_actors.py.
 */

export function actorAnimKey(sheet, pose, dir) {
  return `${sheet}-${pose}-${dir}`;
}

export function registerActorAnims(scene, sheet) {
  const { cols } = ACTOR_FRAME;

  DIRS.forEach((dir, row) => {
    const idx = (col) => row * cols + col;

    define(scene, actorAnimKey(sheet, 'idle', dir), {
      frames: POSE_COLS.idle.map(idx),
      frameRate: 1,
      repeat: -1,
    }, sheet);

    define(scene, actorAnimKey(sheet, 'walk', dir), {
      frames: POSE_COLS.walk.map(idx),
      frameRate: 9,
      repeat: -1,
    }, sheet);

    define(scene, actorAnimKey(sheet, 'attack', dir), {
      frames: POSE_COLS.attack.map(idx),
      frameRate: 13,
      repeat: 0,
    }, sheet);

    define(scene, actorAnimKey(sheet, 'hurt', dir), {
      frames: POSE_COLS.hurt.map(idx),
      frameRate: 1,
      repeat: 0,
    }, sheet);
  });
}

function define(scene, key, { frames, frameRate, repeat }, sheet) {
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: frames.map((f) => ({ key: sheet, frame: f })),
    frameRate,
    repeat,
  });
}

/** One-shot effect animations that don't follow the actor layout. */
export function registerFxAnims(scene) {
  const fx = [
    ['fx-slash', 'fx_slash', 4, 34],
    ['fx-muzzle', 'fx_muzzle', 3, 30],
    ['fx-impact', 'fx_impact', 3, 26],
  ];
  for (const [key, sheet, count, rate] of fx) {
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(sheet, { start: 0, end: count - 1 }),
      frameRate: rate,
      repeat: 0,
    });
  }
}
