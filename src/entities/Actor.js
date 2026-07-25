import Phaser from 'phaser';

import { DEPTH, DIRS } from '../config.js';
import { actorAnimKey } from '../core/AnimationFactory.js';

/**
 * Shared base for anything that walks, faces a direction and can be hurt.
 * Deliberately thin: it owns facing/animation/knockback/i-frames and nothing
 * about intent, so Player drives it from input and Enemy from a brain.
 */
export class Actor extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, sheet) {
    super(scene, x, y, sheet, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.sheet = sheet;
    this.facing = 'down';
    this.hp = 1;
    this.maxHp = 1;
    this.dead = false;
    this.invulnUntil = 0;
    this.stunUntil = 0;
    this.attackingUntil = 0;

    this.setOrigin(0.5, 0.5);
    // The collision body is a small footprint at the feet, so a character can
    // stand with their head overlapping a wall above them - standard for
    // top-down games and what makes tight rooms feel right.
    this.body.setSize(10, 8);
    this.body.setOffset(3, 15);
    this.setCollideWorldBounds(true);
  }

  get isStunned() {
    return this.scene.time.now < this.stunUntil;
  }

  get isAttacking() {
    return this.scene.time.now < this.attackingUntil;
  }

  get isInvulnerable() {
    return this.scene.time.now < this.invulnUntil;
  }

  /** Depth sorts by feet position so actors overlap correctly. */
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.setDepth(DEPTH.ACTOR + this.y);
  }

  faceVector(vx, vy) {
    if (vx === 0 && vy === 0) return this.facing;
    // Cardinal snap: the sprite sheet has no diagonals, and locking facing to
    // four directions is what makes the melee arc predictable.
    this.facing = Math.abs(vx) > Math.abs(vy)
      ? (vx < 0 ? 'left' : 'right')
      : (vy < 0 ? 'up' : 'down');
    return this.facing;
  }

  faceTowards(target) {
    return this.faceVector(target.x - this.x, target.y - this.y);
  }

  playPose(pose) {
    const key = actorAnimKey(this.sheet, pose, this.facing);
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.play(key, true);
  }

  /** Movement + animation in one call; brains and input both funnel here. */
  moveWith(vx, vy, speed) {
    if (this.isStunned || this.dead) {
      this.setVelocity(0, 0);
      return;
    }
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      this.setVelocity((vx / len) * speed, (vy / len) * speed);
      this.faceVector(vx, vy);
      if (!this.isAttacking) this.playPose('walk');
    } else {
      this.setVelocity(0, 0);
      if (!this.isAttacking) this.playPose('idle');
    }
  }

  /**
   * @returns {boolean} true if the hit landed (i.e. wasn't absorbed by i-frames)
   */
  hurt(amount, source = null, opts = {}) {
    if (this.dead || this.isInvulnerable) return false;

    this.hp = Math.max(0, this.hp - amount);
    this.invulnUntil = this.scene.time.now + (opts.invulnMs ?? 400);
    this.stunUntil = this.scene.time.now + (opts.stunMs ?? 140);

    this.playPose('hurt');
    this.flashHit();

    if (source && opts.knockback) {
      const ang = Phaser.Math.Angle.Between(source.x, source.y, this.x, this.y);
      this.setVelocity(Math.cos(ang) * opts.knockback, Math.sin(ang) * opts.knockback);
    }

    if (this.hp <= 0) this.die(source);
    return true;
  }

  /**
   * Phaser 4 removed setTintFill(); fill mode is now a separate call. Using
   * fill mode (rather than a multiply tint) is what makes the hit read as a
   * white silhouette flash on dark sprites.
   */
  flashHit() {
    this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => {
      // May have died during the flash - the death fade owns alpha from then on.
      if (!this.active || this.dead) return;
      this.setTintMode(Phaser.TintModes.MULTIPLY);
      this.clearTint();
      this.startBlink();
    });
  }

  /** Alpha pulse for the remainder of the i-frame window. */
  startBlink() {
    if (this.dead) return;
    const remaining = this.invulnUntil - this.scene.time.now;
    if (remaining <= 0) return;
    this.stopBlink();
    this.blinkTween = this.scene.tweens.add({
      targets: this,
      alpha: { from: 1, to: 0.25 },
      duration: 90,
      yoyo: true,
      repeat: Math.max(0, Math.min(6, Math.floor(remaining / 180))),
      onComplete: () => {
        this.blinkTween = null;
        if (!this.dead) this.setAlpha(1);
      },
    });
  }

  /**
   * Only ever stops the blink, never every tween on this sprite. An
   * indiscriminate killTweensOf here would also cancel the death fade and
   * leave a half-transparent corpse standing in the room forever.
   */
  stopBlink() {
    if (this.blinkTween) {
      this.blinkTween.stop();
      this.blinkTween.remove();
      this.blinkTween = null;
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.setVelocity(0, 0);
    if (this.body) this.body.enable = false;
    this.stopBlink();
    this.setAlpha(1);

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.6,
      duration: 200,
      onComplete: () => this.destroy(),
    });
    // Guaranteed cleanup: if anything interferes with the fade, the corpse
    // still leaves. A stuck body would keep blocking movement and inflating
    // enemy counts that quest objectives read.
    this.scene.time.delayedCall(400, () => {
      if (this.active) this.destroy();
    });
  }
}

export { DIRS };
