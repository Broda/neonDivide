/**
 * Shadowrun-style dice pools: roll N six-sided dice, every 5 or 6 is a "hit",
 * and you beat the test if hits >= threshold.
 *
 * Kept pure and injectable (`rng`) so tests can assert distributions without
 * touching Phaser or Math.random.
 */

export const HIT_FACE = 5;

export function rollPool(pool, threshold = 1, rng = Math.random) {
  const dice = [];
  let hits = 0;
  const n = Math.max(0, Math.floor(pool));
  for (let i = 0; i < n; i++) {
    const face = 1 + Math.floor(rng() * 6);
    dice.push(face);
    if (face >= HIT_FACE) hits++;
  }
  // A glitch is the classic Shadowrun failure flourish: more than half the
  // pool came up 1s. We surface it so dialogue can react, but it is optional.
  const ones = dice.filter((d) => d === 1).length;
  const glitch = n > 0 && ones > n / 2;
  return {
    pool: n,
    threshold,
    dice,
    hits,
    success: hits >= threshold,
    glitch,
    criticalGlitch: glitch && hits === 0,
  };
}

/** Human-readable summary for the dialogue box. */
export function describeRoll(result) {
  const verdict = result.success ? 'SUCCESS' : 'FAILURE';
  const tail = result.criticalGlitch
    ? ' (critical glitch)'
    : result.glitch
      ? ' (glitch)'
      : '';
  return `${result.pool}d6 -> ${result.hits} hit${result.hits === 1 ? '' : 's'} ` +
    `vs ${result.threshold}: ${verdict}${tail}`;
}
