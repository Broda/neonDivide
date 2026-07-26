import Phaser from 'phaser';

import { GAME_H, GAME_W } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { DialogueScene } from './scenes/DialogueScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { HudScene } from './scenes/HudScene.js';
import { JournalScene } from './scenes/JournalScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { WorldScene } from './scenes/WorldScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#07070d',

  // pixelArt disables antialiasing and (in Phaser 4) also forces roundPixels
  // on; we set it explicitly anyway because v4 flipped its default to false.
  pixelArt: true,
  roundPixels: true,

  // MAX_ZOOM picks the largest *whole* multiple of 320x272 that fits the
  // window. FIT would scale by a fraction (e.g. 4.21x), which makes some source
  // pixels 4 screen pixels wide and others 5 - text is where that unevenness
  // shows up worst.
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: Phaser.Scale.MAX_ZOOM,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },

  scene: [
    BootScene, TitleScene, WorldScene, HudScene, DialogueScene, JournalScene,
    GameOverScene,
  ],
};

export const game = new Phaser.Game(config);

// Scale.NONE doesn't recompute MAX_ZOOM on its own, so re-derive the integer
// zoom whenever the window changes size.
function fitIntegerZoom() {
  const parent = document.getElementById('game') ?? document.body;
  const zoom = Math.max(1, Math.floor(Math.min(
    parent.clientWidth / GAME_W,
    parent.clientHeight / GAME_H,
  )));
  if (zoom !== game.scale.zoom) game.scale.setZoom(zoom);
}

window.addEventListener('resize', fitIntegerZoom);
game.events.once('ready', fitIntegerZoom);

// Dev-only console/automation harness; `vite build` drops this branch.
if (import.meta.env?.DEV) {
  import('./dev/harness.js').then(({ installHarness }) => installHarness(game));
}
