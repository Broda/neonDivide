import { DEPTH, EDGE_BAND, ROOM_H, ROOM_W, TILE } from '../config.js';
import { EMPTY, LEGEND } from '../data/tiles.js';

/**
 * Owns the tilemap side of a room: parsing the ASCII art, resolving tile names
 * to generated indices, building the two layers, and applying collision from
 * the tileset metadata.
 *
 * Entity spawning is delegated back to the scene, so this class stays about
 * geometry and the scene stays about gameplay.
 */
export class RoomManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} level  { rooms: { id: def }, start: 'id' }
   * @param {object} tilesetMeta parsed tiles_neokyoto.json
   */
  constructor(scene, level, tilesetMeta) {
    this.scene = scene;
    this.level = level;
    this.meta = tilesetMeta;

    /** tile name -> index, built once from the generated metadata. */
    this.indexByName = new Map(tilesetMeta.tiles.map((t) => [t.name, t.id]));
    this.tileById = new Map(tilesetMeta.tiles.map((t) => [t.id, t]));
    this.solidIndices = tilesetMeta.tiles.filter((t) => t.solid).map((t) => t.id);

    this.maps = [];
    this.layers = {};
    this.roomId = null;
    this.def = null;
  }

  get(roomId) {
    return this.level.rooms[roomId] ?? null;
  }

  indexOfName(name) {
    const idx = this.indexByName.get(name);
    if (idx === undefined) {
      console.warn(`[rooms] unknown tile name "${name}"`);
      return -1;
    }
    return idx;
  }

  /** Char -> tile index, with ' ' meaning empty. */
  indexOfChar(ch) {
    if (ch === EMPTY || ch === undefined) return -1;
    const name = LEGEND[ch];
    if (!name) {
      console.warn(`[rooms] no legend entry for "${ch}"`);
      return -1;
    }
    return this.indexOfName(name);
  }

  /**
   * ASCII rows -> 2D index grid, padded to ROOM_W x ROOM_H so a short row in a
   * hand-written room can't produce a ragged map.
   */
  parseGrid(rows = []) {
    const grid = [];
    for (let y = 0; y < ROOM_H; y++) {
      const line = rows[y] ?? '';
      const row = [];
      for (let x = 0; x < ROOM_W; x++) {
        row.push(this.indexOfChar(line[x]));
      }
      grid.push(row);
    }
    return grid;
  }

  isSolidIndex(index) {
    return index >= 0 && Boolean(this.tileById.get(index)?.solid);
  }

  tileNameAt(tx, ty, layerName = 'decor') {
    const layer = this.layers[layerName];
    if (!layer) return null;
    const tile = layer.getTileAt(tx, ty);
    return tile ? this.tileById.get(tile.index)?.name ?? null : null;
  }

  hasTag(tx, ty, tag) {
    for (const name of ['decor', 'ground']) {
      const layer = this.layers[name];
      const tile = layer?.getTileAt(tx, ty);
      if (!tile) continue;
      if ((this.tileById.get(tile.index)?.tags ?? []).includes(tag)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ build

  build(roomId) {
    this.teardown();

    const def = this.get(roomId);
    if (!def) throw new Error(`[rooms] no such room "${roomId}"`);

    this.roomId = roomId;
    this.def = def;

    this.layers.ground = this.buildLayer(def.ground, DEPTH.GROUND);
    this.layers.decor = this.buildLayer(def.decor, DEPTH.DECOR);

    // Collision comes from the generated metadata, never a hand-kept list -
    // that's what stops art and physics from drifting apart.
    for (const layer of Object.values(this.layers)) {
      layer.setCollision(this.solidIndices, true);
    }

    this.applyDirectionalWalls();
    return def;
  }

  /** True if a tile blocks. Off-map counts as blocked, so screen edges read as
   *  the outside of the room rather than as open floor. */
  isSolidAt(tx, ty) {
    if (tx < 0 || tx >= ROOM_W || ty < 0 || ty >= ROOM_H) return true;
    for (const layer of Object.values(this.layers)) {
      const tile = layer.getTileAt(tx, ty);
      if (tile && this.isSolidIndex(tile.index)) return true;
    }
    return false;
  }

  /**
   * Mirrors vertical-run wall tiles so their cast shadow always falls on the
   * side facing open floor.
   *
   * The art is drawn lit on one edge and shadowed on the other, which is
   * correct for a left-hand wall but backwards for a right-hand one - the
   * shadow would land on the outer screen edge while the room-facing side got
   * the highlight. Deriving the flip from the neighbours (rather than from the
   * column index) means it stays correct for walls anywhere in a room, not
   * just at the borders, and room authors never have to think about it.
   */
  applyDirectionalWalls() {
    for (const layer of Object.values(this.layers)) {
      layer.forEachTile((tile) => {
        if (!tile || tile.index < 0) return;
        const meta = this.tileById.get(tile.index);
        if (!meta || !meta.tags.includes('vertical')) return;

        const openLeft = !this.isSolidAt(tile.x - 1, tile.y);
        const openRight = !this.isSolidAt(tile.x + 1, tile.y);

        if (openLeft !== openRight) {
          // Unambiguous: shadow goes on whichever side is open floor.
          tile.flipX = openLeft;
        } else {
          // Both sides blocked (a crate or vending machine parked against the
          // wall) or both open (a free-standing pillar). Neighbours tell us
          // nothing, so fall back to which half of the room it sits in and
          // keep the column visually consistent.
          tile.flipX = tile.x >= ROOM_W / 2;
        }
      });
    }
  }

  buildLayer(rows, depth) {
    const map = this.scene.make.tilemap({
      data: this.parseGrid(rows),
      tileWidth: TILE,
      tileHeight: TILE,
    });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE);
    const layer = map.createLayer(0, tileset, 0, 0);
    layer.setDepth(depth);
    this.maps.push(map);
    return layer;
  }

  /** Replace a tile at runtime, e.g. a door opening. */
  setTile(tx, ty, tileName, layerName = 'decor') {
    const layer = this.layers[layerName];
    if (!layer) return;
    const index = this.indexOfName(tileName);
    if (index < 0) return;
    const tile = layer.putTileAt(index, tx, ty);
    if (tile) tile.setCollision(this.isSolidIndex(index));
  }

  teardown() {
    for (const map of this.maps) map.destroy();
    this.maps = [];
    this.layers = {};
  }

  // ------------------------------------------------------------ transitions

  /**
   * Which room edge (if any) an actor has walked into.
   * @returns {'north'|'south'|'east'|'west'|null}
   */
  edgeAt(actor) {
    // Measured off the physics body, not the sprite centre: the body is clamped
    // to the world bounds, so its edges reliably reach 0 / roomSize and the
    // band triggers no matter how tall the sprite is.
    const b = actor.body;
    if (!b) return null;
    if (b.left <= EDGE_BAND) return 'west';
    if (b.right >= ROOM_W * TILE - EDGE_BAND) return 'east';
    if (b.top <= EDGE_BAND) return 'north';
    if (b.bottom >= ROOM_H * TILE - EDGE_BAND) return 'south';
    return null;
  }

  exitFor(edge) {
    return this.def?.exits?.[edge] ?? null;
  }

  /**
   * Where to place the player when arriving. Named entries win; otherwise we
   * mirror their position across the shared edge so walking north then south
   * puts you back roughly where you were.
   */
  entryPosition(def, entry, fromActor) {
    if (entry && def.entries?.[entry]) {
      const [tx, ty] = def.entries[entry];
      return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    }

    // `entry` names the edge of THIS room the player is coming in through, so
    // arriving via 'south' means being placed at the bottom of the new screen.
    const margin = TILE * 1.6;
    switch (entry) {
      case 'south':
        return { x: fromActor.x, y: ROOM_H * TILE - margin };
      case 'north':
        return { x: fromActor.x, y: margin };
      case 'east':
        return { x: ROOM_W * TILE - margin, y: fromActor.y };
      case 'west':
        return { x: margin, y: fromActor.y };
      default:
        return {
          x: (def.spawn?.[0] ?? ROOM_W / 2) * TILE + TILE / 2,
          y: (def.spawn?.[1] ?? ROOM_H / 2) * TILE + TILE / 2,
        };
    }
  }

  static oppositeEdge(edge) {
    return { north: 'south', south: 'north', east: 'west', west: 'east' }[edge];
  }
}
