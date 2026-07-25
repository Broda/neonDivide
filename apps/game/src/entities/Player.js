import Phaser from 'phaser';

import { DEPTH, PLAYER } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { Actor } from './Actor.js';

/**
 * The runner. Owns input handling, the melee arc, the pistol and the dash.
 *
 * Health/ammo/nuyen live in GameState (not on this sprite) so they survive room
 * transitions, which destroy and rebuild every entity.
 */
export class Player extends Actor {
  constructor(scene, x, y, state) {
    super(scene, x, y, 'runner');
    this.state = state;
    this.maxHp = state.maxHp;
    this.hp = state.hp;

    this.nextAttack = 0;
    this.nextFire = 0;
    this.nextDash = 0;
    this.dashUntil = 0;
    this.dashVec = new Phaser.Math.Vector2();

    this.keys = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      melee: Phaser.Input.Keyboard.KeyCodes.J,
      fire: Phaser.Input.Keyboard.KeyCodes.K,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      dash: Phaser.Input.Keyboard.KeyCodes.SHIFT,
    });
    this.cursors = scene.input.keyboard.createCursorKeys();
  }

  /** Keeps the sprite's hp mirrored from authoritative state. */
  syncFromState() {
    this.hp = this.state.hp;
    this.maxHp = this.state.maxHp;
  }

  update() {
    if (this.dead) return;
    const now = this.scene.time.now;

    if (now < this.dashUntil) {
      this.setVelocity(this.dashVec.x * PLAYER.dashSpeed, this.dashVec.y * PLAYER.dashSpeed);
      return;
    }

    const k = this.keys;
    const c = this.cursors;
    const vx = (k.right.isDown || c.right.isDown ? 1 : 0) - (k.left.isDown || c.left.isDown ? 1 : 0);
    const vy = (k.down.isDown || c.down.isDown ? 1 : 0) - (k.up.isDown || c.up.isDown ? 1 : 0);

    // Attacks root the player briefly - that commitment is what makes the
    // Zelda melee rhythm work instead of letting you slash while strafing.
    if (this.isAttacking) {
      this.setVelocity(0, 0);
    } else {
      this.moveWith(vx, vy, PLAYER.speed);
    }

    if (Phaser.Input.Keyboard.JustDown(k.dash) && (vx || vy) && now >= this.nextDash) {
      this.startDash(vx, vy);
    }
    if (Phaser.Input.Keyboard.JustDown(k.melee) && now >= this.nextAttack) {
      this.melee();
    }
    if (Phaser.Input.Keyboard.JustDown(k.fire) && now >= this.nextFire) {
      this.fire();
    }
    if (Phaser.Input.Keyboard.JustDown(k.interact)) {
      this.scene.tryInteract(this);
    }
  }

  startDash(vx, vy) {
    const now = this.scene.time.now;
    const len = Math.hypot(vx, vy) || 1;
    this.dashVec.set(vx / len, vy / len);
    this.dashUntil = now + PLAYER.dashMs;
    this.nextDash = now + PLAYER.dashCooldownMs;
    // i-frames are the point of the dash; without them it is just a sprint.
    this.invulnUntil = Math.max(this.invulnUntil, now + PLAYER.dashMs + 60);
    this.faceVector(vx, vy);
    this.playPose('walk');
    this.scene.spawnDashTrail?.(this);
  }

  melee() {
    const now = this.scene.time.now;
    this.nextAttack = now + PLAYER.attackCooldownMs;
    this.attackingUntil = now + PLAYER.attackWindupMs + PLAYER.attackActiveMs;
    this.setVelocity(0, 0);
    this.playPose('attack');

    const rect = this.meleeRect();
    this.scene.spawnSlash(this, rect);

    // The hitbox is evaluated once, a beat after the swing starts, so the
    // visual and the damage line up.
    this.scene.time.delayedCall(PLAYER.attackWindupMs, () => {
      if (!this.active) return;
      this.scene.applyMeleeHit(this.meleeRect(), PLAYER.meleeDamage, this);
    });
  }

  /** Rectangle swept by the monoblade, in world space. */
  meleeRect() {
    const reach = PLAYER.meleeReach;
    const width = PLAYER.meleeWidth;
    const cx = this.x;
    const cy = this.y + 4; // aim at torso height, not the sprite centre
    switch (this.facing) {
      case 'left':
        return new Phaser.Geom.Rectangle(cx - reach - 4, cy - width / 2, reach + 4, width);
      case 'right':
        return new Phaser.Geom.Rectangle(cx, cy - width / 2, reach + 4, width);
      case 'up':
        return new Phaser.Geom.Rectangle(cx - width / 2, cy - reach - 4, width, reach + 4);
      default:
        return new Phaser.Geom.Rectangle(cx - width / 2, cy, width, reach + 4);
    }
  }

  fire() {
    if (this.state.ammo <= 0) {
      bus.emit(EV.TOAST, { text: 'CLICK. Dry.', tone: 'bad' });
      this.nextFire = this.scene.time.now + 300;
      return;
    }
    const now = this.scene.time.now;
    this.nextFire = now + PLAYER.fireCooldownMs;
    this.attackingUntil = now + 90;
    this.playPose('attack');
    this.state.addAmmo(-1);

    const dir = DIR_VECTORS[this.facing];
    this.scene.spawnBullet(
      this.x + dir.x * 10,
      this.y + 4 + dir.y * 10,
      dir,
      { damage: PLAYER.bulletDamage, speed: PLAYER.bulletSpeed, friendly: true },
    );
  }

  hurt(amount, source) {
    if (this.dead || this.isInvulnerable) return false;
    const landed = super.hurt(amount, source, {
      invulnMs: PLAYER.invulnMs,
      knockback: PLAYER.knockback,
      stunMs: 160,
    });
    if (!landed) return false;

    this.state.damage(amount);
    this.hp = this.state.hp;
    bus.emit(EV.PLAYER_HURT, { hp: this.state.hp, amount });
    this.scene.cameras.main.shake(120, 0.006);
    if (this.state.hp <= 0) this.die();
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.setVelocity(0, 0);
    if (this.body) this.body.enable = false;
    this.stopBlink();
    this.setAlpha(1);
    this.setDepth(DEPTH.FX);
    this.scene.tweens.add({
      targets: this,
      angle: 90,
      alpha: 0.4,
      duration: 420,
      onComplete: () => bus.emit(EV.PLAYER_DIED, {}),
    });
  }
}

export const DIR_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
