# Neon Divide

A top-down 2D adventure built like the original *Zelda* — room-flip screens,
directional melee, knockback and i-frames — wearing a cyberpunk skin, with
*Shadowrun*-style jobs: branching dialogue, dice-pool skill checks, and
obstacles that have more than one solution.

All art is **generated**, not sourced: a Python/Pillow pipeline draws the
tilesheet and the animated character spritesheets that the game loads at runtime.

Built on **Phaser 4** + **Vite**. One level ships (`level01`, 8 screens), but
every content axis is data-driven — tiles, rooms, actors, items, jobs, dialogue,
objective types and AI brains are all additive.

---

## Running it

```bash
npm install
```

```bash
npm run assets
```

```bash
npm run dev
```

Then open <http://localhost:5173>.

| Script | What it does |
|---|---|
| `npm run assets` | Regenerates every PNG + metadata JSON into `public/assets/` (needs Python 3 with Pillow) |
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Production bundle into `dist/` |
| `npm test` | Headless `node --test` suite — rules, dice, quest logic and content validation |

Append `?debug=1` to the URL for a collision overlay, the melee hitbox, a live
state readout, and hotkeys (`1` heal, `2` ammo, `3` next room).

### Controls

| Key | Action |
|---|---|
| `WASD` / arrows | Move |
| `J` | Monoblade slash |
| `K` | Fire pistol (uses ammo) |
| `Shift` | Dash (brief i-frames) |
| `E` | Talk / use / open doors |
| `TAB` | Job log + character sheet |
| `1`–`6` | Pick a dialogue option |

---

## How it fits together

```
tools/                 Python asset pipeline -> public/assets/
src/
  config.js            tuning constants (speeds, damage, room size, depths)
  core/
    EventBus.js        dependency-free emitter; the seam between gameplay and quests
    GameState.js       character sheet, wallet, inventory, flags, save/load
    RoomManager.js     ASCII -> tilemap, collision, screen transitions
    AnimationFactory.js builds every anim from the fixed sheet layout
  entities/            Actor base -> Player / Enemy / Npc / Pickup / Interactable
    ai/                pluggable enemy brains
  quests/
    Conditions.js      one predicate + effect language
    dice.js            Shadowrun dice pools
    DialogueRunner.js  walks a dialogue graph (pure logic)
    JobManager.js      listens on the bus, advances objectives
    objectives.js      objective-type registry
  scenes/              Boot / World / Hud / Dialogue / Journal / GameOver
  data/                tiles, items, actors, rooms, jobs, dialogue
tests/                 headless node:test suite
```

### Why the text is a bitmap font

All UI text goes through `src/ui/text.js`, which uses a **generated bitmap font**
(`tools/gen_font.py` → `ui_font.png`, 100 glyphs at 5×7 in a 6×8 cell) rather
than Phaser's `Text` object.

`Text` rasterises a real browser font with canvas `fillText`, which antialiases
glyph edges. That is invisible at 1:1 but reads as blur once the 320×272 canvas
is scaled up, and looks wrong next to crisp pixel-art tiles. A bitmap font is
just sprites, so it scales identically to everything else. Glyphs are drawn
white, so colour is a tint.

For the same reason the game scales by **whole multiples only**
(`Scale.MAX_ZOOM` plus an integer-snapping resize handler in `main.js`).
`Scale.FIT` would pick a fractional factor like 4.21×, making some source pixels
4 screen pixels wide and others 5 — text is where that unevenness shows worst.

Three design decisions carry most of the extensibility:

1. **The generated tileset JSON is the single source of truth for collision.**
   `tools/gen_tileset.py` emits `solid` per tile; the game reads it. Art and
   physics cannot drift apart, and tile ids may be reshuffled freely.
2. **Rooms are ASCII art.** Editing a 20×15 grid of numbers by hand is
   unbearable; a room is two arrays of strings plus a shared legend.
3. **One condition/effect language.** `Conditions.js` powers dialogue gating,
   objective prerequisites and conditional spawns alike, so a new predicate is
   instantly available everywhere.

---

## How to add a…

### …glyph

Add an entry to `G` in `tools/gen_font.py` (7 strings of 5 characters, `#` is
ink) and append the character to `CHARS`, then `npm run assets`. The atlas
layout is published in `fx_manifest.json`, so the game picks it up with no code
change.

### …tile

1. Write a draw function in `tools/gen_tileset.py` and decorate it:

   ```python
   @tile('holo_kiosk', solid=True, tags=['prop'])
   def t_holo_kiosk(px):
       rect(px, 2, 3, 13, 15, METAL_D, TILE, TILE)
       glow(px, 8, 6, with_alpha(CYAN, 120), 6, TILE, TILE)
   ```

2. Give it a legend character in `src/data/tiles.js`.
3. `npm run assets`. Collision follows from `solid` automatically.

### …room (screen)

1. Copy any file in `src/data/rooms/level01/` as a template. A room is
   `ground` + `decor`, each 15 strings of exactly 20 characters (`' '` = empty).
2. **Match the wall tile to the direction it runs.** Masonry tiles come in
   pairs — `#`/`|` (street), `I`/`j` (interior), `L`/`(` (rooftop ledge). The
   first of each has courses running left-to-right for top and bottom edges;
   the second runs vertically for the left and right columns. Using a
   horizontal tile down a column reads as a stack of misplaced top-wall pieces.
   `C` (corrugated) already has vertical ridges and works in either run.
3. Register it in `src/data/rooms/level01/index.js`.
4. Add an `exits` entry on a neighbour pointing at it (`north`/`south`/`east`/
   `west`), or a `door` spawn with `to:`.
5. `npm test` validates the dimensions, legend characters, exits and spawn
   references — a typo fails there rather than silently rendering a hole.

### …enemy

1. Add a spec to `SPECS` in `tools/gen_actors.py` (colours + feature flags; a
   palette swap is just another spec) and run `npm run assets`.
2. Add an archetype to `ENEMIES` in `src/data/actors.js` — hp, speed, damage,
   `brain`, `drops`, `tags`.
3. Spawn it from a room: `{ type: 'enemy', archetype: 'my_goon', x, y, brain,
   path: [[x1,y1],[x2,y2]] }`.

Only write a new brain in `src/entities/ai/index.js` if the behaviour genuinely
differs; a brain is one object with a `think(enemy, player, dt)` method.

### …job

1. Drop a JSON file into `src/data/jobs/` and import it in that folder's
   `index.js`:

   ```json
   { "id": "job_x", "title": "…", "payment": { "nuyen": 1200, "karma": 1 },
     "objectives": [
       { "id": "step1", "type": "talk", "target": "vex", "text": "Find Vex" },
       { "id": "step2", "type": "kill", "archetype": "sec_drone", "count": 3,
         "text": "Scrap the drones", "requires": ["step1"] }
     ] }
   ```

2. Hand it out from dialogue with `{ "startJob": "job_x" }`.

Objective types live in `src/quests/objectives.js`: `kill`, `collect`, `reach`,
`talk`, `deliver`, `flag`, `hack`, `condition`. **Adding a type is one entry in
that registry** — `JobManager` never changes. A job completes automatically when
all non-`optional` objectives are done, unless it sets `manualComplete` and some
dialogue calls `completeJob`.

### …dialogue

Add a graph to any file in `src/data/dialogue/`. Options support gating and
skill checks:

```json
{ "text": "[Hacking] Spoof a badge.",
  "check": { "attr": "logic", "skill": "hacking", "dc": 2, "bonus": "cyberdeck" },
  "onSuccess": { "goto": "cracked", "do": [{ "unlock": "sec_door" }] },
  "onFail":    { "goto": "burned" } }
```

Dice pool = attribute + skill (+2 if the `bonus` gear is carried); each die is a
d6 and 5–6 is a hit, versus `dc`. Options whose `if` fails render greyed with the
requirement shown rather than being hidden.

Effect verbs (shared with jobs and pickups): `setFlag`, `clearFlag`, `giveItem`,
`takeItem`, `nuyen`, `karma`, `heal`, `damage`, `ammo`, `startJob`,
`completeJob`, `failJob`, `completeObjective`, `unlock`, `spawn`, `toast`,
`warp`.

---

## Level 01 — the Kagemori Sprawl

```
                     [rooftop]
                         |  (door from market)
   [alley] --- [backlot] === [lobby] --- [server]
      |                ^ security door
   [plaza] --- [market]
      |
   [strip]
```

Kaz the fixer wants a sealed wetwire case out of Ferristech. The centrepiece
obstacle — a locked corp door — has three independent solutions:

- **Hack** the badge reader (Logic + hacking, +2 dice with Vex's cyberdeck)
- **Badge** it with the red keycard Krait drops
- **Talk** the gate guard down (Charisma + etiquette, using something you can
  learn from a terminal)

The ending branches: hand the case to Kaz, or sell it to Sable in the market for
more nuyen, negative karma and a `kaz_burned` flag that changes what Kaz says
afterwards. A side job from the market vendor clears the rooftop drone nest.

---

## Testing

`npm test` runs headless — no browser, no Phaser. That is deliberate: the
EventBus is a small hand-rolled emitter rather than `Phaser.Events.EventEmitter`
precisely so the whole rules layer stays importable in Node.

Coverage: the condition evaluator, effect verbs, dice-pool distribution,
JobManager objective ordering/counting/completion/persistence, and a content
validator that checks every room's dimensions and legend characters, every exit
and door target, every spawn archetype and item, every dialogue link, and that
all rooms are reachable from the start.

For manual work in the browser, `src/dev/harness.js` (dev builds only) exposes
`window.__h` with `step`, `run`, `walk`, `tap`, `rig`, `shot` and `state`.
`h.shot('name.png')` writes a PNG to `.shots/` via a dev-server endpoint.

> Note when scripting the harness: Phaser's TweenManager derives its delta from
> `Date.now()`, so tween-gated behaviour (death fades, toasts) needs `h.run(ms)`,
> which lets real time pass, rather than `h.step(frames)`.
