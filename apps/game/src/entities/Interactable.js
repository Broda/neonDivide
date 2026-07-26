import Phaser from 'phaser';

import { DEPTH, PLAYER, TILE } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { applyEffects, describe, evaluate } from '../quests/Conditions.js';

/**
 * A non-actor thing the player can press E on: a door, a terminal, a sign.
 *
 * These are zones rather than sprites - the visual is already painted into the
 * tilemap, so all this owns is the trigger area, the lock rule and the payload.
 */
export class Interactable {
  /**
   * @param {object} opts
   *   kind    'door' | 'terminal' | 'sign'
   *   x, y    tile coordinates
   *   id      stable identifier used by quests and unlock flags
   *   to      (door) destination room id
   *   entry   (door) entry marker in the destination room
   *   lock    condition that must hold to pass/use
   *   lockedDialogue  dialogue graph shown when locked
   *   dialogue        dialogue graph shown when used
   *   do      effects applied on successful use
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.kind = opts.kind ?? 'terminal';
    this.id = opts.id ?? `${this.kind}_${opts.x}_${opts.y}`;
    this.tx = opts.x;
    this.ty = opts.y;
    this.x = opts.x * TILE + TILE / 2;
    this.y = opts.y * TILE + TILE / 2;
    this.opts = opts;

    /**
     * Radial reach rather than a tile rect. Doors, readers and signs are
     * painted into wall tiles, so the player can never stand on them - they
     * approach from an adjacent tile, and a strict one-tile box left
     * wall-mounted devices effectively unusable.
     */
    this.range = opts.range ?? PLAYER.interactRange + TILE * 0.5;

    this.marker = null;
    if (opts.marker !== false) this.createMarker();
  }

  /** A small pulsing chevron so the player can tell what is usable. */
  createMarker() {
    const g = this.scene.add.rectangle(this.x, this.y - 12, 3, 3, 0x96f5ff, 1);
    g.setDepth(DEPTH.FX);
    this.scene.tweens.add({
      targets: g,
      y: this.y - 16,
      alpha: 0.25,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.marker = g;
  }

  get isUnlocked() {
    // An explicit unlock flag (set by a successful hack, say) always wins.
    if (this.scene.state.getFlag(`unlocked:${this.id}`)) return true;
    if (!this.opts.lock) return true;
    return evaluate(this.opts.lock, this.scene.state);
  }

  lockText() {
    return describe(this.opts.lock);
  }

  contains(actor) {
    // Measured from the actor's feet, which is where they visually "stand".
    return Phaser.Math.Distance.Between(actor.x, actor.y + 6, this.x, this.y) <= this.range;
  }

  use(player) {
    const state = this.scene.state;
    const ctx = this.scene.effectCtx();

    if (!this.isUnlocked) {
      if (this.opts.lockedDialogue) {
        this.scene.openDialogue(this.opts.lockedDialogue, { source: this });
      } else {
        bus.emit(EV.TOAST, {
          text: `LOCKED — needs ${this.lockText() || 'authorisation'}`,
          tone: 'bad',
        });
        bus.emit(EV.ACTION_DENIED, { reason: 'locked', id: this.id });
      }
      return;
    }

    applyEffects(this.opts.do, state, ctx);

    switch (this.kind) {
      case 'door':
        this.openDoorTile();
        bus.emit(EV.DOOR_OPENED, { id: this.id, room: this.scene.roomId });
        if (this.opts.to) {
          this.scene.changeRoom(this.opts.to, { entry: this.opts.entry ?? this.id });
        }
        break;

      case 'terminal':
        bus.emit(EV.TERMINAL_USED, { id: this.id, room: this.scene.roomId });
        if (this.opts.dialogue) {
          this.scene.openDialogue(this.opts.dialogue, { source: this });
        }
        break;

      default:
        if (this.opts.dialogue) {
          this.scene.openDialogue(this.opts.dialogue, { source: this });
        } else if (this.opts.text) {
          bus.emit(EV.TOAST, { text: this.opts.text, tone: 'info' });
        }
    }
  }

  /** Swap the closed door tile for its open variant and drop its collision. */
  openDoorTile() {
    const open = this.opts.openTile ?? null;
    if (!open) return;
    this.scene.rooms.setTile(this.tx, this.ty, open, 'decor');
  }

  destroy() {
    if (this.marker) {
      this.scene.tweens.killTweensOf(this.marker);
      this.marker.destroy();
      this.marker = null;
    }
  }
}
