import Phaser from 'phaser';

import { NPCS } from '../data/actors.js';
import { Actor } from './Actor.js';

/**
 * A talkable character. Holds an id (what quests reference), a dialogue graph
 * key, and optional idle wandering so streets don't look like a waxwork museum.
 */
export class Npc extends Actor {
  constructor(scene, x, y, archetype, opts = {}) {
    const def = NPCS[archetype] ?? { sheet: archetype, name: archetype };
    super(scene, x, y, def.sheet);

    this.archetype = archetype;
    this.npcId = opts.id ?? archetype;
    this.displayName = opts.name ?? def.name;
    this.dialogueKey = opts.dialogue ?? null;
    /** Optional per-npc override chosen by condition, evaluated at talk time. */
    this.dialogueRules = opts.dialogueRules ?? null;
    this.facing = opts.facing ?? 'down';
    this.wander = opts.wander ?? false;
    this.homeX = x;
    this.homeY = y;
    this.mem = { nextMove: 0, vx: 0, vy: 0 };

    this.body.setImmovable(true);
    this.hp = this.maxHp = 999;
    this.playPose('idle');
  }

  update(time) {
    if (this.talking) {
      this.setVelocity(0, 0);
      this.playPose('idle');
      return;
    }
    if (!this.wander) {
      this.setVelocity(0, 0);
      return;
    }
    if (time > this.mem.nextMove) {
      this.mem.nextMove = time + 900 + Math.random() * 1600;
      if (Math.random() < 0.45) {
        this.mem.vx = 0;
        this.mem.vy = 0;
      } else {
        const ang = Math.random() * Math.PI * 2;
        this.mem.vx = Math.cos(ang);
        this.mem.vy = Math.sin(ang);
      }
    }
    // Leash to the spawn point so wanderers never drift into a doorway.
    const drift = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);
    if (drift > 26) {
      this.mem.vx = (this.homeX - this.x) / drift;
      this.mem.vy = (this.homeY - this.y) / drift;
    }
    this.moveWith(this.mem.vx, this.mem.vy, 22);
  }

  /** Resolve which dialogue graph to open, honouring conditional overrides. */
  resolveDialogue(state, evaluate) {
    if (this.dialogueRules) {
      for (const rule of this.dialogueRules) {
        if (evaluate(rule.if, state)) return rule.dialogue;
      }
    }
    return this.dialogueKey;
  }

  faceToward(target) {
    this.faceTowards(target);
    this.playPose('idle');
  }

  hurt() {
    return false; // civilians and contacts are not valid targets
  }
}
