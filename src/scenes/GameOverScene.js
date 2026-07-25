import Phaser from 'phaser';

import { GAME_H, GAME_W, SCENES } from '../config.js';
import { state } from '../core/GameState.js';
import { makeText, UI } from '../ui/text.js';

/**
 * Death screen. Restarting rebuilds the run from scratch but keeps the level
 * data loaded, so it's instant.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SCENES.GAMEOVER);
  }

  create() {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x07070d, 0.9).setOrigin(0, 0);

    // Integer scale keeps the heading's pixels square.
    makeText(this, GAME_W / 2, GAME_H / 2 - 34, 'FLATLINED', {
      color: 0xd0303e, scale: 3, origin: [0.5, 0.5],
    });

    makeText(this, GAME_W / 2, GAME_H / 2 - 4,
      `The street keeps your ${state.nuyen}¥ and your name.`, {
        color: UI.dim, origin: [0.5, 0.5],
      });

    makeText(this, GAME_W / 2, GAME_H / 2 + 22, '[ENTER] jack back in', {
      color: UI.cyan, origin: [0.5, 0.5],
    });

    this.input.keyboard.once('keydown-ENTER', () => {
      state.reset();
      this.scene.stop(SCENES.HUD);
      this.scene.stop(SCENES.WORLD);
      this.scene.stop();
      this.scene.start(SCENES.WORLD);
      this.scene.launch(SCENES.HUD);
    });
  }
}
