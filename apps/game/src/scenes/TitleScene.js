import Phaser from 'phaser';

import { GAME_H, GAME_W, SCENES } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { GameState, state } from '../core/GameState.js';
import { LEVEL_01 } from '../data/rooms/level01/index.js';
import { LINE_H, makeText, UI } from '../ui/text.js';

const MENU_TOP = 150;
const ROW_H = LINE_H + 5;

/**
 * The front door. Its real job is deciding which run the player is about to
 * play: a fresh one, or the checkpoint written by src/core/autosave.js.
 *
 * The save is only ever *read* here (GameState.peekSave), so nothing about the
 * live run is disturbed until a choice is confirmed.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super(SCENES.TITLE);
  }

  create() {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x07070d).setOrigin(0, 0);

    const cx = GAME_W / 2;

    // Integer scale keeps the heading's pixels square, as in GameOverScene.
    makeText(this, cx, 52, 'NEON DIVIDE', {
      color: UI.cyan, scale: 3, origin: [0.5, 0.5],
    });
    this.add.rectangle(cx, 74, 198, 1, 0x00c8e8, 0.5);
    makeText(this, cx, 86, LEVEL_01.name.toUpperCase(), {
      color: UI.dim, origin: [0.5, 0.5],
    });
    makeText(this, cx, 104, 'a job is a job until it is a body', {
      color: UI.faint, origin: [0.5, 0.5],
    });

    this.pendingErase = false;
    this.selected = 0;
    this.rows = Array.from({ length: 3 }, (_, i) => makeText(this, cx, MENU_TOP + i * ROW_H, '', {
      origin: [0.5, 0.5],
    }));
    this.detail = makeText(this, cx, MENU_TOP, '', {
      color: UI.dim, align: 1, origin: [0.5, 0],
    });

    // The title screen is where the mute key gets discovered: it is the only
    // place with room for the hint, and the only place with no HUD to toast to.
    this.footer = makeText(this, cx, GAME_H - 12, '', {
      color: UI.faint, origin: [0.5, 0.5],
    });
    this.footerMuted = null;
    this.renderFooter();

    this.refresh();
    this.bindKeys();
  }

  bindKeys() {
    const k = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard.addKeys({
      up: k.W, down: k.S, upArrow: k.UP, downArrow: k.DOWN,
      confirm: k.E, enter: k.ENTER, space: k.SPACE,
    });
  }

  /** Rebuilds the menu from whatever is on disk right now. */
  refresh() {
    this.save = GameState.peekSave();

    this.items = [];
    if (this.save) this.items.push({ id: 'continue', label: 'CONTINUE' });
    this.items.push({ id: 'new', label: this.save ? 'NEW RUN' : 'JACK IN' });
    if (this.save) this.items.push({ id: 'erase', label: 'ERASE SAVE' });

    this.selected = Math.min(this.selected, this.items.length - 1);
    this.render();
  }

  render() {
    this.rows.forEach((row, i) => {
      const item = this.items[i];
      row.setVisible(Boolean(item));
      if (!item) return;

      const active = i === this.selected;
      const erasing = item.id === 'erase' && this.pendingErase;
      const label = erasing ? 'ERASE SAVE - SURE?' : item.label;
      row.setText(`${active ? '>' : ' '}${label}`);
      row.setTint(erasing ? UI.red : active ? UI.cyanBright : UI.text);
    });

    // Follows the menu rather than sitting at a fixed y: the list is one row
    // long before there is a save and three rows long after.
    this.detail.setY(MENU_TOP + (this.items.length - 0.5) * ROW_H + 10);
    this.detail.setText(this.describe(this.items[this.selected]));
  }

  describe(item) {
    if (!item) return '';
    if (item.id === 'erase') {
      return this.pendingErase
        ? 'This cannot be undone.'
        : 'Wipe the checkpoint and start clean.';
    }
    if (item.id === 'new') {
      return `Fresh legend, fresh trouble.\nStarts in ${roomName(LEVEL_01.start)}.`;
    }

    const save = this.save;
    const jobs = save.jobs?.active?.length ?? 0;
    return [
      roomName(save.currentRoom ?? LEVEL_01.start),
      `${save.nuyen ?? 0}¥ · ${jobs} job${jobs === 1 ? '' : 's'} · ${ago(save.savedAt)}`,
    ].join('\n');
  }

  /** Only redraws when the mute state actually changed. */
  renderFooter() {
    const muted = Boolean(this.game.audio?.muted);
    if (muted === this.footerMuted) return;
    this.footerMuted = muted;
    this.footer.setText(`[W/S] select   [E] confirm   [M] sound ${muted ? 'off' : 'on'}`);
  }

  update() {
    this.renderFooter();
    const k = this.keys;
    const n = this.items.length;

    if (justDown(k.up) || justDown(k.upArrow)) {
      this.move(-1, n);
    } else if (justDown(k.down) || justDown(k.downArrow)) {
      this.move(1, n);
    } else if (justDown(k.confirm) || justDown(k.enter) || justDown(k.space)) {
      this.choose();
    }
  }

  move(delta, n) {
    this.selected = (this.selected + delta + n) % n;
    // Moving off the erase row is the cancel gesture; there's no other way out.
    this.pendingErase = false;
    this.render();
    bus.emit(EV.UI_MOVED, {});
  }

  choose() {
    const item = this.items[this.selected];
    if (!item) return;
    bus.emit(EV.UI_CONFIRMED, { item: item.id });

    if (item.id === 'erase') {
      if (!this.pendingErase) {
        this.pendingErase = true;
        this.render();
        return;
      }
      GameState.clearSave();
      this.pendingErase = false;
      this.selected = 0;
      this.refresh();
      return;
    }

    this.startRun({ load: item.id === 'continue' });
  }

  /**
   * Entry point into a run. Also called directly by the dev harness, which
   * needs to get past this screen without synthesising keystrokes.
   */
  startRun({ load = false } = {}) {
    // A save that fails to load falls through to a fresh run rather than
    // dropping the player into a half-restored one.
    if (!(load && state.load())) {
      state.reset();
      // Choosing a new run abandons the old one; the first room entry would
      // overwrite the checkpoint a frame later anyway.
      GameState.clearSave();
    }

    this.scene.start(SCENES.WORLD);
    this.scene.launch(SCENES.HUD);
  }
}

function roomName(roomId) {
  return String(LEVEL_01.rooms[roomId]?.name ?? roomId ?? '').toUpperCase();
}

/** Coarse relative time - the exact minute never matters, the shape does. */
function ago(savedAt) {
  if (!savedAt) return 'unknown';
  const mins = Math.floor((Date.now() - savedAt) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function justDown(key) {
  return key && Phaser.Input.Keyboard.JustDown(key);
}
