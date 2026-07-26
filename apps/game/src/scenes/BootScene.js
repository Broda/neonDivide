import Phaser from 'phaser';

import { ACTOR_FRAME, GAME_W, GAME_H, SCENES } from '../config.js';
import { registerActorAnims, registerFxAnims } from '../core/AnimationFactory.js';
import { ALL_SHEETS } from '../data/actors.js';
import { registerFont } from '../ui/text.js';

/**
 * Loads every generated asset and builds the animation set, then hands off to
 * the world. Everything here is derived from data (ALL_SHEETS, the manifests)
 * so adding art never means editing this file.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  preload() {
    this.showProgress();

    this.load.setPath('assets/');

    // Tileset: loaded as a plain image because addTilesetImage slices it itself.
    this.load.image('tiles', 'tiles_neokyoto.png');
    this.load.json('tilesmeta', 'tiles_neokyoto.json');
    this.load.json('fxmeta', 'fx_manifest.json');

    for (const sheet of ALL_SHEETS) {
      this.load.spritesheet(sheet, `actor_${sheet}.png`, {
        frameWidth: ACTOR_FRAME.w,
        frameHeight: ACTOR_FRAME.h,
      });
    }

    this.load.spritesheet('fx_slash', 'fx_slash.png', { frameWidth: 24, frameHeight: 24 });
    this.load.spritesheet('fx_muzzle', 'fx_muzzle.png', { frameWidth: 12, frameHeight: 12 });
    this.load.spritesheet('fx_impact', 'fx_impact.png', { frameWidth: 12, frameHeight: 12 });
    this.load.image('fx_bullet', 'fx_bullet.png');

    this.load.spritesheet('ui_icons', 'ui_icons.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('ui_portraits', 'ui_portraits.png', { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('ui_cell', 'ui_cell.png', { frameWidth: 10, frameHeight: 10 });
    this.load.image('ui_panel', 'ui_panel.png');
    this.load.image('ui_font', 'ui_font.png');
  }

  showProgress() {
    // The bitmap font isn't registered until create(), so the loading label is
    // the one place that still uses a plain rectangle-and-shape treatment.
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const bar = this.add.rectangle(cx - 60, cy, 0, 4, 0x00c8e8).setOrigin(0, 0.5);
    this.add.rectangle(cx, cy, 122, 6).setStrokeStyle(1, 0x006078);

    this.load.on('progress', (p) => bar.setSize(120 * p, 4));
    this.load.on('complete', () => bar.destroy());
  }

  create() {
    registerFont(this, this.cache.json.get('fxmeta').font);
    for (const sheet of ALL_SHEETS) registerActorAnims(this, sheet);
    registerFxAnims(this);

    // The editor's Playtest button deep-links to a room (?debug&room=...), and
    // routing that through the title screen would throw the deep link away.
    const query = new URLSearchParams(location.search);
    if (import.meta.env.DEV && query.has('room')) {
      this.scene.start(SCENES.WORLD);
      this.scene.launch(SCENES.HUD);
      return;
    }

    this.scene.start(SCENES.TITLE);
  }
}
