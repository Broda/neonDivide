import Phaser from 'phaser';

import { GAME_W, HUD_H, SCENES } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { state } from '../core/GameState.js';
import { LINE_H, makeText, TONE, UI } from '../ui/text.js';

/** Toasts are pooled - allocating text objects per message churns textures. */
const MAX_TOASTS = 5;

/**
 * Always-on overlay: vitals strip along the top, plus transient toasts and the
 * active job tracker down the right-hand side.
 *
 * Runs as a parallel scene so it survives room rebuilds and never pauses when
 * the world does.
 */
export class HudScene extends Phaser.Scene {
  constructor() {
    super(SCENES.HUD);
  }

  create() {
    this.state = state;
    this.cameras.main.setViewport(0, 0, GAME_W, HUD_H + 240);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // vitals bar background
    this.add.rectangle(0, 0, GAME_W, HUD_H, 0x0a0c16, 0.96).setOrigin(0, 0);
    this.add.rectangle(0, HUD_H - 1, GAME_W, 1, 0x00c8e8, 0.8).setOrigin(0, 0);

    makeText(this, 6, 4, 'VITALS', { color: UI.dim });
    this.cells = [];
    for (let i = 0; i < 12; i++) {
      const c = this.add.sprite(8 + i * 11, 20, 'ui_cell', 2).setOrigin(0, 0.5);
      c.setVisible(false);
      this.cells.push(c);
    }

    this.ammoIcon = this.add.sprite(GAME_W - 112, 11, 'ui_icons', 0).setOrigin(0, 0);
    this.ammoText = makeText(this, GAME_W - 96, 15, '');
    this.nuyenIcon = this.add.sprite(GAME_W - 66, 11, 'ui_icons', 0).setOrigin(0, 0);
    this.nuyenText = makeText(this, GAME_W - 50, 15, '');

    this.roomText = makeText(this, GAME_W - 6, 4, '', { color: UI.dim, origin: [1, 0] });

    // Checkpoint feedback. Deliberately small and brief: it confirms the save
    // happened without competing with the toast lane for attention.
    this.savedText = makeText(this, GAME_W / 2, 4, 'SAVED', {
      color: UI.green, origin: [0.5, 0],
    }).setAlpha(0);

    // job tracker
    this.tracker = makeText(this, GAME_W - 4, HUD_H + 6, '', {
      color: UI.cyanBright, align: 2, origin: [1, 0],
    }).setAlpha(0.92);

    // Sits over the bottom wall row, so it introduces itself and then gets out
    // of the way rather than permanently speckling the scenery.
    this.hint = makeText(this, 4, HUD_H + 228,
      'WASD move  J blade  K fire  E use  SHIFT dash  TAB jobs', { color: UI.dim });
    this.tweens.add({
      targets: this.hint,
      alpha: 0,
      delay: 6000,
      duration: 1200,
      onComplete: () => this.hint.setVisible(false),
    });

    this.toasts = [];
    this.toastPool = Array.from({ length: MAX_TOASTS }, () => {
      const bg = this.add.rectangle(0, 0, 10, LINE_H + 2, 0x0a0c16, 0.85).setOrigin(0.5, 0.5);
      const label = makeText(this, 0, 0, '', { origin: [0.5, 0.5] });
      bg.setVisible(false);
      label.setVisible(false);
      return { bg, label, busy: false };
    });

    this.bind();
    // World starts before this scene, so its first ROOM_ENTERED has already
    // fired by now - seed the room name from the live scene instead of waiting
    // for the next transition.
    const world = this.scene.get(SCENES.WORLD);
    if (world?.rooms?.def) this.onRoom({ name: world.rooms.def.name });
    else this.refresh();
  }

  bind() {
    const on = (ev, fn) => {
      bus.on(ev, fn, this);
      this.events.once('shutdown', () => bus.off(ev, fn, this));
    };
    on(EV.STATE_CHANGED, this.refresh);
    on(EV.TOAST, this.toast);
    on(EV.ROOM_ENTERED, this.onRoom);
    on(EV.GAME_SAVED, this.onSaved);
    on(EV.JOB_STARTED, this.refresh);
    on(EV.JOB_OBJECTIVE_DONE, this.refresh);
    on(EV.JOB_COMPLETED, this.refresh);
  }

  onRoom({ name }) {
    this.roomText.setText(String(name ?? '').toUpperCase());
    this.refresh();
  }

  onSaved() {
    // Saves can land back-to-back (a job completing on room entry), and a
    // second tween on the same target would fight the first one's alpha.
    this.tweens.killTweensOf(this.savedText);
    this.savedText.setAlpha(1);
    this.tweens.add({
      targets: this.savedText, alpha: 0, delay: 800, duration: 500,
    });
  }

  refresh() {
    const s = this.state;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      c.setVisible(i < s.maxHp);
      if (i < s.maxHp) c.setFrame(i < s.hp ? 0 : 2);
    }
    this.ammoText.setText(String(s.ammo).padStart(2, '0'));
    this.nuyenText.setText(`${s.nuyen}`);

    // Icon frames come from the generated manifest via the world scene.
    const world = this.scene.get(SCENES.WORLD);
    if (world?.iconFrame) {
      this.ammoIcon.setFrame(world.iconFrame('ammo'));
      this.nuyenIcon.setFrame(world.iconFrame('nuyen'));
      this.renderTracker(world);
    }
  }

  renderTracker(world) {
    if (!world.jobs) return;
    const snap = world.jobs.snapshot();
    if (snap.active.length === 0) {
      this.tracker.setText('');
      return;
    }
    const lines = [];
    for (const job of snap.active.slice(0, 2)) {
      lines.push(job.title.toUpperCase());
      for (const o of job.objectives.filter((x) => !x.done).slice(0, 3)) {
        const prog = o.count > 1 ? ` ${o.progress}/${o.count}` : '';
        lines.push(`- ${o.text}${prog}`);
      }
    }
    this.tracker.setText(lines.join('\n'));
  }

  toast({ text, tone = 'info' }) {
    const slot = this.toastPool.find((s) => !s.busy);
    if (!slot) return; // all five in flight; dropping the oldest news is fine

    const y = HUD_H + 150 - this.toasts.length * (LINE_H + 3);
    slot.busy = true;
    this.toasts.push(slot);

    slot.label.setText(text).setTint(TONE[tone] ?? TONE.info);
    slot.label.setPosition(GAME_W / 2, y).setAlpha(1).setVisible(true);
    slot.bg.setSize(slot.label.width + 6, LINE_H + 2);
    slot.bg.setPosition(GAME_W / 2, y).setAlpha(0.85).setVisible(true);

    this.tweens.add({
      targets: [slot.label, slot.bg],
      y: y - 14,
      alpha: 0,
      delay: 1100,
      duration: 420,
      onComplete: () => {
        slot.busy = false;
        slot.label.setVisible(false);
        slot.bg.setVisible(false);
        this.toasts = this.toasts.filter((x) => x !== slot);
      },
    });
  }
}
