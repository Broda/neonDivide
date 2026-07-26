import Phaser from 'phaser';

import { GAME_H, GAME_W, SCENES } from '../config.js';
import { GameState, state } from '../core/GameState.js';
import { LINE_H, makeText, UI } from '../ui/text.js';

/**
 * Death screen. Restarting rebuilds the run but keeps the level data loaded,
 * so it's instant either way.
 *
 * Because src/core/autosave.js checkpoints on room entry and never on death,
 * "reload" always rewinds to the start of the room you died in.
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

    const hasSave = GameState.hasSave();
    const prompts = hasSave
      ? [
        ['[E] reload the last checkpoint', UI.cyan],
        ['[N] start a new run', UI.dim],
      ]
      : [['[E] jack back in', UI.cyan]];
    prompts.push(['[T] back to the title', UI.dim]);

    prompts.forEach(([label, color], i) => {
      makeText(this, GAME_W / 2, GAME_H / 2 + 22 + i * (LINE_H + 3), label, {
        color, origin: [0.5, 0.5],
      });
    });

    this.input.keyboard.once('keydown-E', () => this.restart({ load: hasSave }));
    if (hasSave) this.input.keyboard.once('keydown-N', () => this.restart({ load: false }));
    this.input.keyboard.once('keydown-T', () => this.leaveTo(SCENES.TITLE));
  }

  restart({ load }) {
    if (!(load && state.load())) {
      state.reset();
      GameState.clearSave();
    }
    this.leaveTo(SCENES.WORLD);
    this.scene.launch(SCENES.HUD);
  }

  /** Tears down the whole run before handing off; the HUD outlives the world. */
  leaveTo(sceneKey) {
    this.scene.stop(SCENES.HUD);
    this.scene.stop(SCENES.WORLD);
    this.scene.stop();
    this.scene.start(sceneKey);
  }
}
