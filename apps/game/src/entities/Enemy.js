import Phaser from 'phaser';

import { ENEMY_DEFAULTS } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { ENEMIES } from '../data/actors.js';
import { Actor } from './Actor.js';
import { BRAINS } from './ai/index.js';

/**
 * A hostile. All numbers come from the archetype in src/data/actors.js and all
 * behaviour from a named brain, so this class only bridges the two.
 */
export class Enemy extends Actor {
  constructor(scene, x, y, archetype, opts = {}) {
    const def = { ...ENEMY_DEFAULTS, ...(ENEMIES[archetype] ?? {}) };
    super(scene, x, y, def.sheet ?? archetype);

    this.archetype = archetype;
    this.def = def;
    this.spawnId = opts.spawnId ?? null;
    this.hp = def.hp ?? 3;
    this.maxHp = this.hp;
    this.mem = {};
    this.nextAttack = 0;

    /** Waypoints authored in tile space are converted to world space here. */
    this.path = (opts.path ?? []).map(([tx, ty]) => ({
      x: tx * 16 + 8,
      y: ty * 16 + 8,
    }));

    this.brain = BRAINS[opts.brain ?? def.brain] ?? BRAINS.patrol;
    this.brain.init?.(this);

    if (def.hover) this.body.setSize(12, 10).setOffset(2, 10);
  }

  update(time, delta) {
    if (this.dead || this.isStunned) return;
    this.brain.think(this, this.scene.player, delta);
  }

  tryMeleeAttack(target) {
    const now = this.scene.time.now;
    if (now < this.nextAttack) return;
    this.nextAttack = now + (this.def.attackCooldownMs ?? 900);
    this.attackingUntil = now + 240;
    this.playPose('attack');
    // Damage lands mid-swing, giving the player a window to dash out.
    this.scene.time.delayedCall(140, () => {
      if (!this.active || this.dead || !target.active) return;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (dist <= this.def.attackRange + 6) target.hurt(this.def.damage, this);
    });
  }

  shootAt(target) {
    this.attackingUntil = this.scene.time.now + 200;
    this.playPose('attack');
    const ang = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
    this.scene.spawnBullet(
      this.x + Math.cos(ang) * 10,
      this.y + 4 + Math.sin(ang) * 10,
      { x: Math.cos(ang), y: Math.sin(ang) },
      { damage: this.def.damage, speed: 170, friendly: false },
    );
  }

  hurt(amount, source) {
    const landed = super.hurt(amount, source, {
      invulnMs: this.def.invulnMs ?? 180,
      knockback: this.def.knockback ?? 150,
      stunMs: 180,
    });
    if (landed && !this.dead) {
      bus.emit(EV.ENEMY_HURT, { archetype: this.archetype, amount });
      // Getting shot from off-screen should still pull aggro.
      this.mem.alerted = true;
      this.mem.loseAt = this.scene.time.now + 3000;
      this.mem.lastSeen = { x: source?.x ?? this.x, y: source?.y ?? this.y };
    }
    return landed;
  }

  die(source) {
    if (this.dead) return;
    const payload = {
      archetype: this.archetype,
      name: this.def.name,
      tags: this.def.tags ?? [],
      room: this.scene.roomId,
      x: this.x,
      y: this.y,
      spawnId: this.spawnId,
    };

    this.dropLoot();
    // Persist the kill so the corpse stays gone when the player walks back in.
    if (this.spawnId) {
      this.scene.state.setFlag(`killed:${this.scene.roomId}:${this.spawnId}`, true);
    }
    super.die(source);
    bus.emit(EV.ENEMY_KILLED, payload);
  }

  dropLoot() {
    for (const drop of this.def.drops ?? []) {
      if (Math.random() > (drop.chance ?? 1)) continue;
      this.scene.spawnPickup({
        item: drop.item,
        amount: drop.amount ?? 1,
        x: this.x,
        y: this.y,
        scatter: true,
      });
    }
  }
}
