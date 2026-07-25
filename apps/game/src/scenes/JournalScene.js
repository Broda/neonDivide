import Phaser from 'phaser';

import { GAME_H, GAME_W, SCENES } from '../config.js';
import { ITEMS } from '../data/items.js';
import { makeText, UI, wrapIndented } from '../ui/text.js';

/**
 * TAB screen: character sheet on the left, job log on the right. Reads a
 * snapshot rather than the live systems so it can't accidentally mutate state.
 */
export class JournalScene extends Phaser.Scene {
  constructor() {
    super(SCENES.JOURNAL);
  }

  init(data) {
    this.snapshot = data.jobs ?? { active: [], completed: [], failed: [] };
    this.state = data.state;
  }

  create() {
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x07070d, 0.94).setOrigin(0, 0);
    this.add.nineslice(4, 4, 'ui_panel', undefined, GAME_W - 8, GAME_H - 8, 8, 8, 8, 8)
      .setOrigin(0, 0);

    makeText(this, GAME_W / 2, 12, 'S H A D O W   L O G', {
      color: UI.cyan, origin: [0.5, 0],
    });

    this.renderSheet();
    this.renderJobs();

    makeText(this, GAME_W / 2, GAME_H - 14, '[TAB] or [ESC] close', {
      color: UI.faint, origin: [0.5, 0],
    });

    const close = () => {
      this.scene.stop();
      this.scene.resume(SCENES.WORLD);
    };
    this.input.keyboard.on('keydown-TAB', close);
    this.input.keyboard.on('keydown-ESC', close);
  }

  renderSheet() {
    const s = this.state;
    const lines = [
      'RUNNER', '',
      `Vitals   ${s.hp}/${s.maxHp}`,
      `Nuyen    ${s.nuyen}¥`,
      `Karma    ${s.karma}`,
      `Ammo     ${s.ammo}/${s.maxAmmo}`,
      '',
      'ATTRIBUTES',
      // Pad wider than the longest key ('etiquette', 9) or the value collides.
      ...Object.entries(s.attributes).map(([k, v]) => `  ${pad(k, 11)}${v}`),
      '',
      'SKILLS',
      ...Object.entries(s.skills).map(([k, v]) => `  ${pad(k, 11)}${v}`),
      '',
      'GEAR',
    ];
    const gear = [...s.inventory.entries()]
      .filter(([id]) => id !== 'nuyen')
      .map(([id, n]) => `  ${ITEMS[id]?.name ?? id}${n > 1 ? ` x${n}` : ''}`);
    lines.push(...(gear.length ? gear : ['  (nothing but attitude)']));

    makeText(this, 12, 26, lines.join('\n'));
  }

  renderJobs() {
    const x = 122;
    const colW = GAME_W - x - 12;
    const lines = [];

    // Wrap here rather than letting BitmapText do it: continuation lines need
    // to stay indented under their bullet, and letting both wrap double-wraps.
    const add = (str, indent) => lines.push(wrapIndented(str, colW, indent));

    const push = (job, mark) => {
      add(`${mark} ${job.title}`, '  ');
      if (job.brief) add(`  ${job.brief}`, '  ');
      for (const o of job.objectives) {
        const box = o.done ? '[x]' : '[ ]';
        const prog = o.count > 1 ? ` (${o.progress}/${o.count})` : '';
        add(`  ${box} ${o.text}${prog}${o.optional ? ' *' : ''}`, '      ');
      }
      if (job.payment?.nuyen) lines.push(`  pay: ${job.payment.nuyen}¥`);
      lines.push('');
    };

    lines.push('ACTIVE JOBS', '');
    if (this.snapshot.active.length === 0) lines.push('  No active jobs.', '');
    this.snapshot.active.forEach((j) => push(j, '>'));

    if (this.snapshot.completed.length) {
      lines.push('COMPLETED', '');
      this.snapshot.completed.forEach((j) => push(j, '+'));
    }
    if (this.snapshot.failed.length) {
      lines.push('BURNED', '');
      this.snapshot.failed.forEach((j) => push(j, '-'));
    }

    makeText(this, x, 26, lines.join('\n'));
  }
}

function pad(s, n) {
  return (s + ' '.repeat(n)).slice(0, n);
}
