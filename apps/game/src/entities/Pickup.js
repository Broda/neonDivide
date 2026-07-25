import Phaser from 'phaser';

import { DEPTH } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { grantItem, ITEMS, itemName } from '../data/items.js';

/**
 * A floating collectable. `once` marks it with a flag id so a picked-up item
 * doesn't respawn when the player re-enters the room.
 */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, opts = {}) {
    const def = ITEMS[opts.item] ?? {};
    const frame = scene.iconFrame(def.icon ?? 'nuyen');
    super(scene, x, y, 'ui_icons', frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.itemId = opts.item;
    this.amount = opts.amount ?? 1;
    this.onceFlag = opts.once ?? null;
    this.def = def;

    this.setDepth(DEPTH.PICKUP);
    this.body.setSize(12, 12).setOffset(2, 2);
    this.body.setAllowGravity(false);

    if (opts.scatter) {
      // Loot pops out of a corpse rather than landing dead centre.
      const ang = Math.random() * Math.PI * 2;
      this.setVelocity(Math.cos(ang) * 60, Math.sin(ang) * 60);
      this.setDrag(320);
    }

    // Idle bob makes small icons legible against busy tiles.
    scene.tweens.add({
      targets: this,
      y: y - 3,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  collect(state, ctx) {
    // The overlap keeps firing every frame until the sprite is actually gone,
    // and the pickup lingers for a 220ms fade - so without this guard standing
    // on a nuyen pile pays out once per frame.
    if (this.collected) return;
    this.collected = true;
    if (this.body) this.body.enable = false;

    grantItem(state, this.itemId, this.amount, ctx);

    const toast = this.itemId === 'nuyen'
      ? `+${this.amount}¥`
      : this.def.consumeOnPickup
        ? itemName(this.itemId)
        : `Acquired: ${itemName(this.itemId)}`;
    bus.emit(EV.TOAST, { text: toast, tone: 'good' });

    if (this.onceFlag) state.setFlag(`taken:${this.onceFlag}`, true);

    this.scene.tweens.add({
      targets: this,
      y: this.y - 12,
      alpha: 0,
      duration: 220,
      onComplete: () => this.destroy(),
    });
  }
}
