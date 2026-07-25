import Phaser from 'phaser';

import { DIR_VECTORS } from '../Player.js';

/**
 * Enemy brains. A brain is a plain object with `think(enemy, player, dt)`;
 * the Enemy sprite owns the body and the brain owns the intent.
 *
 * Adding behaviour: register another entry here and reference it by name from
 * src/data/actors.js. Nothing else needs to know it exists.
 */

function distanceTo(a, b) {
  return Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
}

function canSee(enemy, player) {
  if (!player || player.dead) return false;
  const dist = distanceTo(enemy, player);
  if (dist > enemy.def.sightRange) return false;
  // Line of sight against the solid layer, so enemies don't chase through walls.
  return !enemy.scene.isLineBlocked(enemy.x, enemy.y, player.x, player.y);
}

/** Walks a waypoint loop, chases on sight, lunges into melee. */
const patrol = {
  init(enemy) {
    enemy.mem.wp = 0;
    enemy.mem.waitUntil = 0;
    enemy.mem.alerted = false;
  },

  think(enemy, player) {
    const now = enemy.scene.time.now;

    if (canSee(enemy, player)) {
      enemy.mem.alerted = true;
      enemy.mem.lastSeen = { x: player.x, y: player.y };
      enemy.mem.loseAt = now + 2500;
    } else if (enemy.mem.alerted && now > (enemy.mem.loseAt ?? 0)) {
      enemy.mem.alerted = false;
    }

    if (enemy.mem.alerted) {
      const dist = distanceTo(enemy, player);
      if (dist <= enemy.def.attackRange) {
        enemy.faceTowards(player);
        enemy.tryMeleeAttack(player);
        enemy.moveWith(0, 0, 0);
      } else {
        // Chase the player, or their last known position once they're down.
        const target = (player.dead ? enemy.mem.lastSeen : player) ?? enemy;
        enemy.moveWith(target.x - enemy.x, target.y - enemy.y, enemy.def.speed);
      }
      return;
    }

    // idle patrol
    const path = enemy.path;
    if (!path || path.length < 2) {
      enemy.moveWith(0, 0, 0);
      return;
    }
    if (now < (enemy.mem.waitUntil ?? 0)) {
      enemy.moveWith(0, 0, 0);
      return;
    }
    // Guard the index: another brain may delegate here with its own memory
    // shape, and `path[NaN]` would otherwise blow up on the next line.
    const wp = path[(enemy.mem.wp ?? 0) % path.length] ?? path[0];
    const dx = wp.x - enemy.x;
    const dy = wp.y - enemy.y;
    if (Math.hypot(dx, dy) < 4) {
      enemy.mem.wp = (enemy.mem.wp ?? 0) + 1;
      enemy.mem.waitUntil = now + 500;
      enemy.moveWith(0, 0, 0);
      return;
    }
    enemy.moveWith(dx, dy, enemy.def.speed * 0.6);
  },
};

/** Holds a preferred range and fires down the line; backs off when crowded. */
const shooter = {
  init(enemy) {
    // Falls back to patrol when it loses sight, so it needs patrol's memory too.
    patrol.init(enemy);
    enemy.mem.nextShot = 0;
    enemy.mem.strafe = Math.random() < 0.5 ? 1 : -1;
    enemy.mem.strafeUntil = 0;
  },

  think(enemy, player) {
    const now = enemy.scene.time.now;
    if (!canSee(enemy, player)) {
      patrol.think(enemy, player);
      return;
    }

    const dist = distanceTo(enemy, player);
    const want = enemy.def.preferredRange ?? 70;
    enemy.faceTowards(player);

    if (now > enemy.mem.strafeUntil) {
      enemy.mem.strafe *= -1;
      enemy.mem.strafeUntil = now + 900 + Math.random() * 700;
    }

    const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    // Radial component closes or opens the gap; tangential keeps them moving
    // so they're not a stationary target.
    const radial = dist > want + 12 ? 1 : dist < want - 12 ? -1 : 0;
    const vx = Math.cos(ang) * radial - Math.sin(ang) * 0.55 * enemy.mem.strafe;
    const vy = Math.sin(ang) * radial + Math.cos(ang) * 0.55 * enemy.mem.strafe;
    enemy.moveWith(vx, vy, enemy.def.speed);
    enemy.faceTowards(player);

    if (dist <= enemy.def.attackRange && now >= enemy.mem.nextShot) {
      enemy.mem.nextShot = now + (enemy.def.fireCooldownMs ?? 1300);
      enemy.shootAt(player);
    }
  },
};

/** Hovers a sweep, and on contact raises an alarm that spawns backup once. */
const drone = {
  init(enemy) {
    enemy.mem.nextShot = 0;
    enemy.mem.t = Math.random() * 1000;
    enemy.mem.alarmed = false;
  },

  think(enemy, player, dt) {
    const now = enemy.scene.time.now;
    enemy.mem.t += dt;

    if (!canSee(enemy, player)) {
      // lazy sinusoidal sweep around the spawn point
      const t = enemy.mem.t / 900;
      enemy.moveWith(Math.cos(t), Math.sin(t * 0.7), enemy.def.speed * 0.4);
      return;
    }

    if (!enemy.mem.alarmed) {
      enemy.mem.alarmed = true;
      enemy.scene.raiseAlarm?.(enemy);
    }

    const dist = distanceTo(enemy, player);
    enemy.faceTowards(player);
    const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, player.x, player.y);
    const radial = dist > 60 ? 1 : dist < 42 ? -1 : 0;
    enemy.moveWith(Math.cos(ang) * radial, Math.sin(ang) * radial, enemy.def.speed);
    enemy.faceTowards(player);

    if (dist <= enemy.def.attackRange && now >= enemy.mem.nextShot) {
      enemy.mem.nextShot = now + (enemy.def.fireCooldownMs ?? 1500);
      enemy.shootAt(player);
    }
  },
};

export const BRAINS = { patrol, shooter, drone };
export { DIR_VECTORS };
