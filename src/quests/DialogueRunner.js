import { applyEffects, describe, evaluate } from './Conditions.js';
import { describeRoll, rollPool } from './dice.js';

/**
 * Walks a dialogue graph. Pure logic - it produces "what to display" and takes
 * "the player chose N", so DialogueScene stays a dumb renderer and the whole
 * thing is testable headlessly.
 *
 * Graph shape:
 *   {
 *     id, speaker, portrait,
 *     start: 'greet',
 *     nodes: {
 *       greet: {
 *         text: '...' | ['line 1', 'line 2'],
 *         speaker, portrait,          // optional per-node override
 *         onEnter: [ effects ],
 *         next: 'other_node',         // auto-advance when there are no choices
 *         choices: [
 *           { text, goto, if, hideIfLocked, do: [effects] },
 *           { text, check: { attr, skill, dc, bonus },
 *             onSuccess: { goto, do }, onFail: { goto, do } },
 *           { text, end: true }
 *         ]
 *       }
 *     }
 *   }
 */
export class DialogueRunner {
  constructor(graph, state, ctx = {}) {
    this.graph = graph;
    this.state = state;
    this.ctx = ctx;
    this.nodeId = null;
    this.finished = false;
    /** Transient line shown under the text, e.g. a dice roll result. */
    this.notice = null;
  }

  start() {
    this.enter(this.graph.start ?? Object.keys(this.graph.nodes)[0]);
    return this.view();
  }

  enter(nodeId) {
    this.nodeId = nodeId;
    const node = this.node();
    if (!node) {
      this.finished = true;
      return;
    }
    applyEffects(node.onEnter, this.state, this.ctx);
  }

  node() {
    return this.graph.nodes?.[this.nodeId] ?? null;
  }

  /**
   * The renderable state of the current node: speaker, text lines, and the
   * choice list already filtered/annotated for locked options.
   */
  view() {
    const node = this.node();
    if (!node || this.finished) {
      return { finished: true };
    }

    const raw = node.choices ?? [];
    const choices = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      const unlocked = evaluate(c.if, this.state, this.ctx);
      if (!unlocked && c.hideIfLocked) continue;

      let label = c.text;
      let hint = '';
      if (c.check) {
        const pool = this.state.poolFor(c.check);
        hint = `[${labelForCheck(c.check)} ${pool}d6 vs ${c.check.dc ?? 1}]`;
      } else if (!unlocked) {
        hint = `[${describe(c.if)}]`;
      }

      choices.push({ index: i, text: label, hint, locked: !unlocked });
    }

    return {
      finished: false,
      speaker: node.speaker ?? this.graph.speaker ?? '',
      portrait: node.portrait ?? this.graph.portrait ?? null,
      lines: Array.isArray(node.text) ? node.text : [node.text ?? ''],
      choices,
      notice: this.notice,
      // A node with no choices is a "press to continue" beat.
      canAdvance: choices.length === 0,
      next: node.next ?? null,
    };
  }

  /** Advance a choice-less node. Returns the new view. */
  advance() {
    const node = this.node();
    if (!node) return this.view();
    this.notice = null;
    if (node.next) this.enter(node.next);
    else this.finished = true;
    return this.view();
  }

  /**
   * Pick a choice by its index in the *original* choice array (the view carries
   * that index so filtering never desynchronises the two).
   *
   * The dice source falls back to `ctx.rng` before Math.random, which lets a
   * test force a skill check either way without stubbing the global - Phaser
   * derives texture UUIDs from Math.random, so patching it globally corrupts
   * the renderer.
   */
  choose(index, rng = this.ctx.rng ?? Math.random) {
    const node = this.node();
    if (!node) return this.view();
    const choice = (node.choices ?? [])[index];
    if (!choice) return this.view();
    if (!evaluate(choice.if, this.state, this.ctx)) return this.view(); // locked

    this.notice = null;

    if (choice.check) {
      const pool = this.state.poolFor(choice.check);
      const result = rollPool(pool, choice.check.dc ?? 1, rng);
      this.notice = describeRoll(result);
      const branch = result.success ? choice.onSuccess : choice.onFail;
      this.ctx.onRoll?.(result, choice);
      return this.takeBranch(branch ?? {});
    }

    applyEffects(choice.do, this.state, this.ctx);
    if (choice.end) {
      this.finished = true;
      return this.view();
    }
    if (choice.goto) this.enter(choice.goto);
    else this.finished = true;
    return this.view();
  }

  takeBranch(branch) {
    applyEffects(branch.do, this.state, this.ctx);
    if (branch.end) {
      this.finished = true;
      return this.view();
    }
    if (branch.goto) this.enter(branch.goto);
    else this.finished = true;
    return this.view();
  }
}

function labelForCheck(check) {
  if (check.skill) return check.skill.charAt(0).toUpperCase() + check.skill.slice(1);
  if (check.attr) return check.attr.charAt(0).toUpperCase() + check.attr.slice(1);
  return 'Test';
}
