import Phaser from 'phaser';

import {
  DEPTH, HUD_H, ROOM_H, ROOM_PX_H, ROOM_PX_W, ROOM_W, SCENES, TILE,
  TRANSITION_MS,
} from '../config.js';
import { startAutosave } from '../core/autosave.js';
import { bus, EV } from '../core/EventBus.js';
import { state } from '../core/GameState.js';
import { RoomManager } from '../core/RoomManager.js';
import { Enemy } from '../entities/Enemy.js';
import { Interactable } from '../entities/Interactable.js';
import { Npc } from '../entities/Npc.js';
import { Pickup } from '../entities/Pickup.js';
import { Player } from '../entities/Player.js';
import { LEVEL_01 } from '../data/rooms/level01/index.js';
import { JOBS } from '../data/jobs/index.js';
import { DIALOGUES } from '../data/dialogue/index.js';
import { JobManager } from '../quests/JobManager.js';
import { evaluate } from '../quests/Conditions.js';
import { makeText, UI } from '../ui/text.js';

/**
 * The play scene. Owns the room lifecycle, every live entity, and the combat
 * resolution that entities call back into.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super(SCENES.WORLD);
  }

  create() {
    this.state = state;
    const query = new URLSearchParams(location.search);
    this.debug = query.has('debug');
    const requestedRoom = import.meta.env.DEV ? query.get('room') : null;

    this.rooms = new RoomManager(this, LEVEL_01, this.cache.json.get('tilesmeta'));
    this.fxmeta = this.cache.json.get('fxmeta');

    this.jobs = new JobManager(this.state, JOBS);
    this.jobs.setScene(this);
    this.jobs.attach();

    this.enemies = this.add.group({ runChildUpdate: true });
    this.npcs = this.add.group({ runChildUpdate: true });
    this.pickups = this.add.group();
    this.bullets = this.physics.add.group({ maxSize: 64, runChildUpdate: false });
    this.interactables = [];
    this.colliders = [];

    // The play area sits below the HUD strip, NES-style.
    this.cameras.main.setViewport(0, HUD_H, ROOM_PX_W, ROOM_PX_H);
    this.cameras.main.setBounds(0, 0, ROOM_PX_W, ROOM_PX_H);
    this.cameras.main.setBackgroundColor(0x07070d);
    this.physics.world.setBounds(0, 0, ROOM_PX_W, ROOM_PX_H);

    const startId = (requestedRoom && LEVEL_01.rooms[requestedRoom])
      ? requestedRoom
      : this.state.currentRoom ?? LEVEL_01.start;
    const startDef = this.rooms.get(startId) ?? this.rooms.get(LEVEL_01.start);
    // `has` first: query.get() of a missing param is null, and Number(null) is
    // 0 - which passes the integer/range guard below and silently spawns every
    // dev run in the top-left corner instead of the room's authored start.
    const devQuery = (key) => (import.meta.env.DEV && query.has(key)
      ? Number(query.get(key))
      : Number.NaN);
    const requestedX = devQuery('x');
    const requestedY = devQuery('y');
    const spawnX = Number.isInteger(requestedX) && requestedX >= 0 && requestedX < ROOM_W
      ? requestedX : startDef.spawn?.[0] ?? 10;
    const spawnY = Number.isInteger(requestedY) && requestedY >= 0 && requestedY < ROOM_H
      ? requestedY : startDef.spawn?.[1] ?? 7;
    const sx = spawnX * TILE + TILE / 2;
    const sy = spawnY * TILE + TILE / 2;

    this.player = new Player(this, sx, sy, this.state);
    this.transitioning = false;

    // Installed before the first buildRoom so entering the opening room is
    // itself a checkpoint - Continue works from the moment a run begins.
    this.stopAutosave = startAutosave(this.state);

    this.buildRoom(startId);
    this.setupKeys();
    this.wireEvents();

    if (this.debug) this.createDebugOverlay();
  }

  setupKeys() {
    this.journalKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.journalKey.on('down', () => {
      if (this.scene.isActive(SCENES.DIALOGUE)) return;
      this.scene.pause();
      this.scene.launch(SCENES.JOURNAL, { jobs: this.jobs.snapshot(), state: this.state });
    });
    // Stop TAB from moving focus out of the canvas.
    this.input.keyboard.addCapture('TAB');

    if (this.debug) {
      this.input.keyboard.on('keydown-ONE', () => this.state.heal(99));
      this.input.keyboard.on('keydown-TWO', () => this.state.addAmmo(99));
      this.input.keyboard.on('keydown-THREE', () => {
        const ids = Object.keys(LEVEL_01.rooms);
        const next = ids[(ids.indexOf(this.roomId) + 1) % ids.length];
        this.changeRoom(next, {});
      });
    }
  }

  wireEvents() {
    bus.on(EV.PLAYER_DIED, this.onPlayerDied, this);
    this.events.once('shutdown', () => {
      bus.off(EV.PLAYER_DIED, this.onPlayerDied, this);
      this.jobs.detach();
      this.stopAutosave();
    });
  }

  onPlayerDied() {
    this.scene.pause();
    this.scene.launch(SCENES.GAMEOVER);
  }

  // ------------------------------------------------------------- room build

  buildRoom(roomId) {
    this.clearEntities();
    const def = this.rooms.build(roomId);
    this.roomId = roomId;
    this.state.currentRoom = roomId;

    for (const spawn of def.spawns ?? []) this.spawnEntity(spawn);

    this.setupColliders();
    bus.emit(EV.ROOM_ENTERED, { room: roomId, name: def.name });
    return def;
  }

  clearEntities() {
    this.enemies.clear(true, true);
    this.npcs.clear(true, true);
    this.pickups.clear(true, true);
    this.bullets.clear(true, true);
    for (const i of this.interactables) i.destroy();
    this.interactables = [];
    for (const c of this.colliders) c.destroy();
    this.colliders = [];
  }

  setupColliders() {
    const layers = Object.values(this.rooms.layers);
    const add = (c) => this.colliders.push(c);

    for (const layer of layers) {
      add(this.physics.add.collider(this.player, layer));
      add(this.physics.add.collider(this.enemies, layer));
      add(this.physics.add.collider(this.npcs, layer));
      add(this.physics.add.collider(this.bullets, layer, (a, b) => {
        this.killBullet(this.bullets.contains(a) ? a : b);
      }));
    }

    add(this.physics.add.collider(this.enemies, this.enemies));
    add(this.physics.add.collider(this.player, this.npcs));

    add(this.physics.add.overlap(this.player, this.pickups, (a, b) => {
      const pickup = this.pickups.contains(a) ? a : b;
      if (!pickup.active) return;
      pickup.collect(this.state, this.effectCtx());
    }));

    // Phaser normalises overlap dispatch internally (a group-vs-sprite test is
    // run as sprite-vs-group), so the callback argument order does NOT reliably
    // match the order passed here. Identify each operand by group membership
    // rather than by position.
    const asBullet = (a, b) => (this.bullets.contains(a) ? a : b);
    const asOther = (a, b) => (this.bullets.contains(a) ? b : a);

    add(this.physics.add.overlap(this.bullets, this.enemies, (a, b) => {
      const bullet = asBullet(a, b);
      const enemy = asOther(a, b);
      if (!bullet.active || !bullet.getData('friendly')) return;
      enemy.hurt(bullet.getData('damage'), bullet);
      this.killBullet(bullet, true);
    }));

    add(this.physics.add.overlap(this.bullets, this.player, (a, b) => {
      const bullet = asBullet(a, b);
      const player = asOther(a, b);
      if (!bullet.active || bullet.getData('friendly')) return;
      player.hurt(bullet.getData('damage'), bullet);
      this.killBullet(bullet, true);
    }));
  }

  /**
   * Turns a room's spawn record into a live entity. Conditional spawns and
   * "already dealt with" persistence are both handled here so no room file
   * needs to think about them.
   */
  spawnEntity(spawn) {
    if (spawn.if && !evaluate(spawn.if, this.state)) return null;

    const px = spawn.x * TILE + TILE / 2;
    const py = spawn.y * TILE + TILE / 2;

    switch (spawn.type) {
      case 'enemy': {
        const id = spawn.id ?? `${spawn.archetype}_${spawn.x}_${spawn.y}`;
        if (this.state.getFlag(`killed:${this.roomId}:${id}`)) return null;
        const e = new Enemy(this, px, py, spawn.archetype, { ...spawn, spawnId: id });
        this.enemies.add(e);
        return e;
      }
      case 'npc': {
        if (spawn.id && this.state.getFlag(`gone:${spawn.id}`)) return null;
        const n = new Npc(this, px, py, spawn.archetype, spawn);
        this.npcs.add(n);
        return n;
      }
      case 'pickup': {
        if (spawn.once && this.state.getFlag(`taken:${spawn.once}`)) return null;
        return this.spawnPickup({ ...spawn, x: px, y: py });
      }
      case 'door':
      case 'terminal':
      case 'sign': {
        const it = new Interactable(this, { kind: spawn.type, ...spawn });
        this.interactables.push(it);
        return it;
      }
      default:
        console.warn(`[world] unknown spawn type "${spawn.type}"`);
        return null;
    }
  }

  spawnPickup(opts) {
    const p = new Pickup(this, opts.x, opts.y, opts);
    this.pickups.add(p);
    return p;
  }

  // ---------------------------------------------------------------- combat

  spawnSlash(actor, _rect) {
    const dir = { up: -90, down: 90, left: 180, right: 0 }[actor.facing];
    const offset = { up: [0, -12], down: [0, 14], left: [-13, 4], right: [13, 4] }[actor.facing];
    const fx = this.add.sprite(actor.x + offset[0], actor.y + offset[1], 'fx_slash', 0);
    fx.setDepth(DEPTH.FX).setAngle(dir);
    fx.play('fx-slash');
    fx.once('animationcomplete', () => fx.destroy());
  }

  spawnDashTrail(actor) {
    const ghost = this.add.sprite(actor.x, actor.y, actor.sheet, actor.frame.name);
    ghost.setDepth(DEPTH.ACTOR + actor.y - 1).setAlpha(0.45).setTint(0x00c8e8);
    this.tweens.add({
      targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy(),
    });
  }

  spawnBullet(x, y, dir, opts) {
    const b = this.bullets.get(x, y, 'fx_bullet');
    if (!b) return null;
    b.setActive(true).setVisible(true);
    b.setDepth(DEPTH.FX);
    b.body.reset(x, y);
    b.body.setAllowGravity(false);
    b.body.setSize(4, 4);
    b.setVelocity(dir.x * opts.speed, dir.y * opts.speed);
    b.setRotation(Math.atan2(dir.y, dir.x));
    b.setData('damage', opts.damage);
    b.setData('friendly', Boolean(opts.friendly));

    const muzzle = this.add.sprite(x, y, 'fx_muzzle', 0).setDepth(DEPTH.FX);
    muzzle.setRotation(Math.atan2(dir.y, dir.x));
    muzzle.play('fx-muzzle');
    muzzle.once('animationcomplete', () => muzzle.destroy());

    // Safety net: a bullet that somehow misses every collider still expires.
    this.time.delayedCall(1600, () => {
      if (b.active) this.killBullet(b);
    });
    return b;
  }

  killBullet(bullet, impact = false) {
    if (!bullet || !bullet.active) return;
    if (impact) {
      const fx = this.add.sprite(bullet.x, bullet.y, 'fx_impact', 0).setDepth(DEPTH.FX);
      fx.play('fx-impact');
      fx.once('animationcomplete', () => fx.destroy());
    }
    bullet.setActive(false).setVisible(false);
    bullet.body.stop();
    this.bullets.killAndHide(bullet);
  }

  /** One-shot melee sweep: every enemy overlapping the arc takes the hit. */
  applyMeleeHit(rect, damage, source) {
    let hits = 0;
    for (const enemy of this.enemies.getChildren()) {
      if (!enemy.active || enemy.dead) continue;
      const b = enemy.getBounds();
      // Inset so the hit reads as the body, not the sprite's empty headroom.
      b.y += 6;
      b.height -= 8;
      if (Phaser.Geom.Rectangle.Overlaps(rect, b)) {
        if (enemy.hurt(damage, source)) hits++;
      }
    }
    if (hits > 0) {
      this.cameras.main.shake(70, 0.004);
      const fx = this.add.sprite(rect.centerX, rect.centerY, 'fx_impact', 0)
        .setDepth(DEPTH.FX);
      fx.play('fx-impact');
      fx.once('animationcomplete', () => fx.destroy());
    }
    return hits;
  }

  /** Drone alarm: pull in one wave of backup, once per room visit. */
  raiseAlarm(source) {
    if (this._alarmed) return;
    this._alarmed = true;
    bus.emit(EV.TOAST, { text: '!! ALARM RAISED !!', tone: 'bad' });
    this.cameras.main.flash(160, 90, 0, 0);
    const spawns = this.rooms.def?.reinforcements ?? [];
    spawns.forEach((s, i) => {
      this.time.delayedCall(500 + i * 350, () => {
        if (!this.scene.isActive()) return;
        this.spawnEntity({ type: 'enemy', ...s, id: `reinf_${i}_${Date.now()}` });
      });
    });
    if (spawns.length === 0 && source) {
      this.spawnEntity({
        type: 'enemy', archetype: 'guard', brain: 'shooter',
        x: Math.round(source.x / TILE), y: Math.round(source.y / TILE),
        id: `reinf_${Date.now()}`,
      });
    }
  }

  /** Bresenham-ish sampling against solid tiles, for enemy line of sight. */
  isLineBlocked(x0, y0, x1, y1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (const layer of Object.values(this.rooms.layers)) {
        const tile = layer.getTileAtWorldXY(x, y);
        if (tile && tile.collides) return true;
      }
    }
    return false;
  }

  // ----------------------------------------------------------- interaction

  tryInteract(player) {
    if (this.transitioning) return;

    // NPCs first: talking to someone standing in a doorway shouldn't teleport you.
    const npc = this.nearest(this.npcs.getChildren(), player, 26);
    if (npc) {
      npc.faceToward(player);
      const key = npc.resolveDialogue(this.state, evaluate);
      if (key) {
        this.openDialogue(key, { npc });
        return;
      }
    }

    const it = this.interactables
      .filter((i) => i.contains(player))
      .sort((a, b) => dist2(a, player) - dist2(b, player))[0];
    if (it) it.use(player);
  }

  nearest(list, from, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const item of list) {
      if (!item.active) continue;
      const d = dist2(item, from);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  openDialogue(key, meta = {}) {
    const graph = DIALOGUES[key];
    if (!graph) {
      console.warn(`[dialogue] unknown graph "${key}"`);
      return;
    }
    if (meta.npc) meta.npc.talking = true;
    this.scene.pause();
    this.scene.launch(SCENES.DIALOGUE, { graph, meta, jobs: this.jobs });
  }

  /** Called by DialogueScene when it closes. */
  onDialogueClosed(meta) {
    if (meta?.npc) {
      meta.npc.talking = false;
      bus.emit(EV.NPC_TALKED, { npc: meta.npc.npcId, room: this.roomId });
    }
  }

  effectCtx() {
    return { jobs: this.jobs, scene: this, state: this.state };
  }

  iconFrame(name) {
    return this.fxmeta?.icons?.[name] ?? 0;
  }

  portraitFrame(name) {
    return this.fxmeta?.portraits?.[name] ?? 0;
  }

  // ------------------------------------------------------------ transitions

  changeRoom(roomId, { entry = null } = {}) {
    if (this.transitioning) return;
    const def = this.rooms.get(roomId);
    if (!def) {
      console.warn(`[world] no room "${roomId}"`);
      return;
    }

    this.transitioning = true;
    this._alarmed = false;
    bus.emit(EV.ROOM_LEFT, { room: this.roomId });
    this.player.setVelocity(0, 0);

    const swap = () => {
      const pos = this.rooms.entryPosition(def, entry, this.player);
      this.buildRoom(roomId);
      this.player.setPosition(
        Phaser.Math.Clamp(pos.x, TILE, ROOM_PX_W - TILE),
        Phaser.Math.Clamp(pos.y, TILE, ROOM_PX_H - TILE),
      );
      this.player.setVelocity(0, 0);
    };

    // A paused scene never updates its cameras or its clock, so the fade would
    // never complete and `transitioning` would stay true forever - blocking
    // every future room change. This is reachable in normal play: the `warp`
    // effect verb fires from dialogue, and dialogue pauses this scene.
    if (!this.scene.isActive()) {
      swap();
      this.transitioning = false;
      return;
    }

    this.cameras.main.fadeOut(TRANSITION_MS / 2, 7, 7, 13);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      swap();
      this.cameras.main.fadeIn(TRANSITION_MS / 2, 7, 7, 13);
      this.time.delayedCall(TRANSITION_MS / 2, () => {
        this.transitioning = false;
      });
    });
  }

  warpTo(roomId) {
    this.changeRoom(roomId, {});
  }

  checkEdgeTransition() {
    if (this.transitioning || this.player.dead) return;
    const edge = this.rooms.edgeAt(this.player);
    if (!edge) return;
    const to = this.rooms.exitFor(edge);
    if (!to) return;
    this.changeRoom(to, { entry: RoomManager.oppositeEdge(edge) });
  }

  // ---------------------------------------------------------------- update

  update(time, delta) {
    if (this.transitioning) {
      this.player.setVelocity(0, 0);
      return;
    }
    this.player.update(time, delta);
    this.checkEdgeTransition();
    if (this.debug) this.updateDebugOverlay();
  }

  // ----------------------------------------------------------------- debug

  createDebugOverlay() {
    this.debugGfx = this.add.graphics().setDepth(DEPTH.OVERLAY);
    this.add.rectangle(0, 0, ROOM_PX_W, 40, 0x000000, 0.55)
      .setOrigin(0, 0).setDepth(DEPTH.OVERLAY).setScrollFactor(0);
    this.debugText = makeText(this, 2, 2, '', { color: UI.green })
      .setDepth(DEPTH.OVERLAY).setScrollFactor(0);
  }

  updateDebugOverlay() {
    const g = this.debugGfx;
    g.clear();
    g.lineStyle(1, 0xec2ca0, 0.5);
    for (const layer of Object.values(this.rooms.layers)) {
      layer.forEachTile((t) => {
        if (t.collides) g.strokeRect(t.pixelX, t.pixelY, TILE, TILE);
      });
    }
    g.lineStyle(1, 0x7ee858, 0.9);
    const r = this.player.meleeRect();
    g.strokeRect(r.x, r.y, r.width, r.height);

    this.debugText.setText([
      `room ${this.roomId}  (${Math.round(this.player.x)},${Math.round(this.player.y)})`,
      `hp ${this.state.hp}/${this.state.maxHp}  ammo ${this.state.ammo}  ¥${this.state.nuyen}`,
      `jobs ${this.state.jobs.active.join(',') || '-'}`,
      `enemies ${this.enemies.getLength()}  [1]heal [2]ammo [3]next room`,
    ].join('\n'));
  }
}

function dist2(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export { ROOM_W, ROOM_H };
