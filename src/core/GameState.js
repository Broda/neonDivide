import { bus, EV } from './EventBus.js';

const SAVE_KEY = 'neon-divide-save-v1';

/**
 * Every mutable fact about the run: the character sheet, the wallet, the
 * inventory, and the flag store. Quest progress is kept as flags too, so a
 * save is one JSON blob and nothing can drift out of sync.
 *
 * The class is deliberately free of Phaser imports so it can be unit tested
 * headlessly (see tests/).
 */
export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    // Shadowrun-ish attributes; used as the base of every dice pool.
    this.attributes = { body: 3, agility: 4, logic: 3, charisma: 3 };
    this.skills = { blades: 3, firearms: 2, hacking: 1, etiquette: 2, stealth: 2 };

    this.maxHp = 6;
    this.hp = 6;
    this.maxAmmo = 24;
    this.ammo = 10;
    this.nuyen = 350;
    this.karma = 0;

    /** @type {Map<string, number>} itemId -> count */
    this.inventory = new Map();
    /** @type {Map<string, any>} arbitrary named world state */
    this.flags = new Map();

    this.jobs = { active: [], completed: [], failed: [] };
    this.currentRoom = null;
  }

  // ------------------------------------------------------------- attributes

  attr(name) {
    return this.attributes[name] ?? 0;
  }

  skill(name) {
    return this.skills[name] ?? 0;
  }

  /**
   * Dice pool for a check: attribute + skill, plus a flat bonus if the
   * character carries the named piece of gear.
   */
  poolFor({ attr = null, skill = null, bonus = null, bonusDice = 2 } = {}) {
    let pool = 0;
    if (attr) pool += this.attr(attr);
    if (skill) pool += this.skill(skill);
    if (bonus && this.hasItem(bonus)) pool += bonusDice;
    return pool;
  }

  // -------------------------------------------------------------- inventory

  hasItem(id, count = 1) {
    return (this.inventory.get(id) ?? 0) >= count;
  }

  countItem(id) {
    return this.inventory.get(id) ?? 0;
  }

  addItem(id, count = 1) {
    const next = this.countItem(id) + count;
    this.inventory.set(id, next);
    bus.emit(EV.ITEM_COLLECTED, { item: id, count, total: next });
    this.touch();
    return next;
  }

  removeItem(id, count = 1) {
    const next = Math.max(0, this.countItem(id) - count);
    if (next === 0) this.inventory.delete(id);
    else this.inventory.set(id, next);
    this.touch();
    return next;
  }

  // ------------------------------------------------------------------ flags

  getFlag(name, fallback = false) {
    return this.flags.has(name) ? this.flags.get(name) : fallback;
  }

  setFlag(name, value = true) {
    const prev = this.flags.get(name);
    if (prev === value) return value;
    this.flags.set(name, value);
    bus.emit(EV.FLAG_SET, { flag: name, value, prev });
    this.touch();
    return value;
  }

  // ---------------------------------------------------------------- vitals

  damage(amount = 1) {
    this.hp = Math.max(0, this.hp - amount);
    this.touch();
    return this.hp;
  }

  heal(amount = 1) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.touch();
    return this.hp;
  }

  addAmmo(amount) {
    this.ammo = Math.max(0, Math.min(this.maxAmmo, this.ammo + amount));
    this.touch();
    return this.ammo;
  }

  addNuyen(amount) {
    this.nuyen = Math.max(0, this.nuyen + amount);
    this.touch();
    return this.nuyen;
  }

  addKarma(amount) {
    this.karma += amount;
    this.touch();
    return this.karma;
  }

  touch() {
    bus.emit(EV.STATE_CHANGED, this);
  }

  // --------------------------------------------------------- serialisation

  serialize() {
    return {
      attributes: this.attributes,
      skills: this.skills,
      maxHp: this.maxHp,
      hp: this.hp,
      maxAmmo: this.maxAmmo,
      ammo: this.ammo,
      nuyen: this.nuyen,
      karma: this.karma,
      inventory: [...this.inventory.entries()],
      flags: [...this.flags.entries()],
      jobs: this.jobs,
      currentRoom: this.currentRoom,
    };
  }

  deserialize(data) {
    if (!data) return this;
    Object.assign(this, {
      attributes: data.attributes ?? this.attributes,
      skills: data.skills ?? this.skills,
      maxHp: data.maxHp ?? this.maxHp,
      hp: data.hp ?? this.hp,
      maxAmmo: data.maxAmmo ?? this.maxAmmo,
      ammo: data.ammo ?? this.ammo,
      nuyen: data.nuyen ?? this.nuyen,
      karma: data.karma ?? this.karma,
      jobs: data.jobs ?? this.jobs,
      currentRoom: data.currentRoom ?? this.currentRoom,
    });
    this.inventory = new Map(data.inventory ?? []);
    this.flags = new Map(data.flags ?? []);
    this.touch();
    return this;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      return true;
    } catch {
      return false; // private browsing / quota - not worth interrupting play
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      this.deserialize(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch { /* ignore */ }
  }
}

/** The single live state instance the whole game shares. */
export const state = new GameState();
