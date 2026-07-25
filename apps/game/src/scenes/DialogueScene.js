import Phaser from 'phaser';

import { GAME_H, GAME_W, SCENES } from '../config.js';
import { bus, EV } from '../core/EventBus.js';
import { state } from '../core/GameState.js';
import { DialogueRunner } from '../quests/DialogueRunner.js';
import { LINE_H, makeText, UI, wrapIndented } from '../ui/text.js';

const PANEL_H = 122;
const TEXT_X = 46;
const LINE_GAP = 2;
/** Hard cap on options per node; the pool is sized to match. */
const MAX_CHOICES = 8;

/**
 * Modal dialogue overlay. Purely a renderer: DialogueRunner decides what the
 * node says and which choices are legal, this draws it and reports selections.
 */
export class DialogueScene extends Phaser.Scene {
  constructor() {
    super(SCENES.DIALOGUE);
  }

  init(data) {
    this.graph = data.graph;
    this.meta = data.meta ?? {};
    this.jobs = data.jobs ?? null;
  }

  create() {
    const world = this.scene.get(SCENES.WORLD);
    this.runner = new DialogueRunner(this.graph, state, {
      jobs: this.jobs,
      scene: world,
      state,
      onRoll: (result) => bus.emit(EV.SKILL_CHECK, result),
    });

    const top = GAME_H - PANEL_H;
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.45).setOrigin(0, 0);

    this.panel = this.add.nineslice(0, top, 'ui_panel', undefined, GAME_W, PANEL_H, 8, 8, 8, 8)
      .setOrigin(0, 0);

    this.top = top;
    this.portrait = this.add.sprite(8, top + 10, 'ui_portraits', 0).setOrigin(0, 0);
    // The speaker name leads the text column rather than sitting under the
    // portrait: names are arbitrary length and a 38px gutter can't clip one
    // word, so a long name used to run straight into the choice list.
    this.speakerText = makeText(this, TEXT_X, top + 8, '', { color: UI.amber });
    this.bodyText = makeText(this, TEXT_X, top + 8, '', {
      maxWidth: GAME_W - TEXT_X - 10,
    });
    this.noticeText = makeText(this, TEXT_X, top + 8, '', { color: UI.green });
    // Pre-allocated and reused. Every Phaser Text owns its own canvas, so
    // destroying and rebuilding the option list on each keypress churned
    // through canvases fast enough to exhaust the browser's pool.
    // No maxWidth: wrapIndented() handles it, so continuation lines stay
    // indented under their option number.
    this.choiceTexts = Array.from({ length: MAX_CHOICES },
      () => makeText(this, TEXT_X, 0, '').setVisible(false));

    this.promptText = makeText(this, GAME_W - 8, GAME_H - 4, '', {
      color: UI.faint, origin: [1, 1],
    });

    this.selected = 0;
    this.view = this.runner.start();
    this.render();
    this.bindKeys();
  }

  bindKeys() {
    const k = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard.addKeys({
      up: k.W, down: k.S, upArrow: k.UP, downArrow: k.DOWN,
      confirm: k.E, enter: k.ENTER, space: k.SPACE, cancel: k.ESC,
    });
    // Selecting with number keys is faster than arrowing for long lists.
    for (let i = 1; i <= 6; i++) {
      this.input.keyboard.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'][i - 1]}`,
        () => this.pickIndex(i - 1));
    }
  }

  update() {
    if (this.view.finished) return;
    const k = this.keys;

    if (this.view.canAdvance) {
      if (justDown(k.confirm) || justDown(k.enter) || justDown(k.space)) {
        this.view = this.runner.advance();
        this.selected = 0;
        this.render();
      }
      return;
    }

    const n = this.view.choices.length;
    if (justDown(k.up) || justDown(k.upArrow)) {
      this.selected = (this.selected - 1 + n) % n;
      this.render();
    } else if (justDown(k.down) || justDown(k.downArrow)) {
      this.selected = (this.selected + 1) % n;
      this.render();
    } else if (justDown(k.confirm) || justDown(k.enter) || justDown(k.space)) {
      this.pickIndex(this.selected);
    }
  }

  pickIndex(displayIndex) {
    if (this.view.finished || this.view.canAdvance) return;
    const choice = this.view.choices[displayIndex];
    if (!choice || choice.locked) return;
    this.selected = displayIndex;
    // choice.index is the index in the authored array, which may differ from
    // the displayed order once hidden options are filtered out.
    this.view = this.runner.choose(choice.index);
    this.selected = 0;
    this.render();
  }

  /**
   * Two-pass layout: build everything at a local origin, measure the total,
   * then size the panel to fit and shift the content down into it. This means
   * no dialogue can ever overflow the box, however long the author makes it.
   */
  render() {
    if (this.view.finished) {
      this.close();
      return;
    }

    const world = this.scene.get(SCENES.WORLD);
    const pf = this.view.portrait ? world.portraitFrame(this.view.portrait) : null;
    this.portrait.setVisible(pf !== null);
    if (pf !== null) this.portrait.setFrame(pf);

    const speaker = this.view.speaker ?? '';
    this.speakerText.setText(speaker).setVisible(Boolean(speaker));
    this.bodyText.setText(this.view.lines.join('\n'));

    // pass 1 - stack from 0, measuring each block
    let y = 0;
    if (speaker) {
      this.speakerText.setY(y);
      y += this.speakerText.height + LINE_GAP;
    }
    this.bodyText.setY(y);
    y += this.bodyText.height + LINE_GAP;

    this.noticeText.setText(this.view.notice ?? '');
    if (this.view.notice) {
      this.noticeText.setY(y);
      y += this.noticeText.height + LINE_GAP;
    }

    const shown = Math.min(this.view.choices.length, MAX_CHOICES);
    this.choiceTexts.forEach((t, i) => t.setVisible(i < shown));

    for (let i = 0; i < shown; i++) {
      const c = this.view.choices[i];
      const active = i === this.selected;
      const color = c.locked ? UI.faint : active ? UI.cyanBright : UI.text;
      const marker = c.locked ? '-' : active ? '>' : ' ';
      const t = this.choiceTexts[i];
      const label = `${marker}${i + 1}. ${c.text}${c.hint ? `  ${c.hint}` : ''}`;
      t.setText(wrapIndented(label, GAME_W - TEXT_X - 10));
      t.setTint(color);
      t.setPosition(TEXT_X, y);
      y += t.height + LINE_GAP;
    }

    // pass 2 - size the panel around the measured content and shift into place
    const padTop = 8;
    const padBottom = LINE_H + 6; // leaves room for the key prompt
    const needed = Math.max(y + padTop + padBottom, 56 + padTop);
    const panelH = Math.min(needed, GAME_H - 24);
    const top = GAME_H - panelH;

    this.panel.setPosition(0, top);
    this.panel.setSize(GAME_W, panelH);
    this.portrait.setPosition(8, top + padTop);

    const shift = top + padTop;
    this.speakerText.setPosition(TEXT_X, this.speakerText.y + shift);
    this.bodyText.setPosition(TEXT_X, this.bodyText.y + shift);
    this.noticeText.setPosition(TEXT_X, this.noticeText.y + shift);
    for (const t of this.choiceTexts) {
      if (t.visible) t.setY(t.y + shift);
    }

    this.promptText.setPosition(GAME_W - 8, GAME_H - 4);
    this.promptText.setText(this.view.canAdvance ? '[E] continue' : '[W/S] select  [E] confirm');
  }

  close() {
    const world = this.scene.get(SCENES.WORLD);
    world.onDialogueClosed(this.meta);
    bus.emit(EV.DIALOGUE_END, { graph: this.graph.id });
    this.scene.stop();
    this.scene.resume(SCENES.WORLD);
  }
}

function justDown(key) {
  return key && Phaser.Input.Keyboard.JustDown(key);
}
