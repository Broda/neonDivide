# Neon Divide

A top-down 2D adventure built like the original *Zelda* — room-flip screens,
directional melee, knockback and i-frames — wearing a cyberpunk skin, with
*Shadowrun*-style jobs: branching dialogue, dice-pool skill checks, and
obstacles that have more than one solution.

Every asset is **generated**, not sourced: a Python pipeline draws the
tilesheet and the animated character spritesheets, and synthesises the sound
effects from oscillators and envelopes. Same source, same bytes, every run.

Built on **Phaser 4** + **Vite**. One level ships (`level01`, 8 screens), but
every content axis is data-driven — tiles, rooms, actors, items, jobs, dialogue,
objective types and AI brains are all additive.

---

## Running the game and editor

```bash
npm install
```

Regenerate the pixel-art assets when changing an asset generator:

```bash
npm run assets
```

Start the game:

```bash
npm run dev:game
```

Then open <http://localhost:5173>.

Start the editor in a second terminal:

```bash
npm run dev:editor
```

Then open <http://localhost:5174>. Keep the game dev server running if you want
the editor's **Playtest** button to open the selected room.

| Script | What it does |
|---|---|
| `npm run assets` | Regenerates every PNG, WAV + metadata JSON into `apps/game/public/assets/` (needs Python 3 with Pillow) |
| `npm run dev:game` | Game dev server on :5173 |
| `npm run dev:editor` | Local content editor on :5174 |
| `npm run build:game` | Production game bundle in `apps/game/dist/` |
| `npm run build:editor` | Production editor bundle in `apps/editor/dist/` |
| `npm run build` | Builds the game and editor independently |
| `npm run validate:content` | Validates canonical content and cross-references |
| `npm test` | Shared-content, game, editor, persistence and isolation tests |

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
| `M` | Mute / unmute (remembered) |

On the title screen and in dialogue, `W`/`S` (or the arrows) move the cursor and
`E` confirms. The death screen offers `E` to reload the last checkpoint, `N` for
a new run and `T` to return to the title.

---

## Sound

The 19 sound effects are synthesised, not sampled. `tools/gen_sfx.py` builds
each one from square, saw, triangle and pitched-noise oscillators through an
attack/decay envelope, quantised to a handful of amplitude steps — the audible
equivalent of the pixel art's limited palette. `tools/synth.py` holds the
primitives and is the audio counterpart to `pixel.py`: buffers of floats in
−1..1 at 22050 Hz mono, with seeded randomness so regeneration is
byte-reproducible.

The whole soundtrack is ~200 lines of source and 194 KB of output, a new effect
is one decorated function, and there is no file anybody has to find a licence
for. Every clip is normalised to the same peak on write, so the `volume` in the
manifest describes a sound's place in the mix rather than compensating for how
hot its synthesis happened to come out.

`apps/game/src/core/audio.js` maps events to sounds in one table and subscribes
to the bus — an entity never needs to know an audio system exists, for the same
reason `JobManager` listens rather than being called. Adding a sound to an
existing moment is one line in `SOUND_FOR_EVENT`; a value can be a function of
the payload, which is how a collected `nuyen` sounds different from a collected
medkit and a passed skill check sounds different from a failed one.

Identical sounds are gated to one start per 45 ms. A single melee swing can
land on three enemies in the same frame, and three copies of one sample
starting together do not sound three times louder — they clip.

`M` mutes, from anywhere, and the preference persists. Because the title screen
takes a keypress to leave, the browser's autoplay lock is always released
before the first gameplay sound would fire.

## Saving

The game keeps **one** save, in `localStorage` under `neon-divide-save-v1`. It
is written automatically — there is no save command — and the HUD flashes
`SAVED` when it happens.

`apps/game/src/core/autosave.js` holds the whole policy: the game checkpoints
on `ROOM_ENTERED` and `JOB_COMPLETED`, and deliberately **not** on death, so
reloading rewinds to the start of the room you died in rather than to a corpse.
Changing when the game saves means editing that one array.

A save is just `GameState.serialize()` plus a version stamp, which works because
job progress is stored as flags rather than in a parallel structure — see
`JobManager`. `GameState.peekSave()` reads it without disturbing the live run,
so the title screen can describe a save it hasn't loaded. A blob whose
`version` doesn't match the current `SAVE_VERSION` is ignored rather than
migrated, and never half-applied to a run.

`setStorage()` swaps the backend, which is how `tests/save.test.js` exercises
persistence headlessly alongside the rest of the rules layer.

---

## How it fits together

```
tools/                    Python asset + audio pipeline -> apps/game/public/assets/
apps/
  game/
    src/
      config.js           tuning constants (speeds, damage, room size, depths)
      core/               state, events, rooms and animation
      entities/           actors, interactables and enemy AI
      quests/             conditions, dialogue, dice, jobs and objectives
      scenes/             Boot / Title / World / Hud / Dialogue / Journal / GameOver
      data/               thin adapters around shared canonical content
    public/assets/        generated runtime art and metadata
    tests/                headless game rules tests
  editor/
    src/                  React + TypeScript authoring UI
    tests/                editor model and history tests
packages/
  content/
    data/                 canonical JSON edited by the editor
    src/                  contracts, compiler, validation and safe persistence
    tests/                content and persistence tests
```

### Why the text is a bitmap font

All UI text goes through `apps/game/src/ui/text.js`, which uses a **generated bitmap font**
(`tools/gen_font.py` → `ui_font.png`, 100 glyphs at 5×7 in a 6×8 cell) rather
than Phaser's `Text` object.

`Text` rasterises a real browser font with canvas `fillText`, which antialiases
glyph edges. That is invisible at 1:1 but reads as blur once the 320×272 canvas
is scaled up, and looks wrong next to crisp pixel-art tiles. A bitmap font is
just sprites, so it scales identically to everything else. Glyphs are drawn
white, so colour is a tint.

For the same reason the game scales by **whole multiples only**
(`Scale.MAX_ZOOM` plus an integer-snapping resize handler in
`apps/game/src/main.js`).
`Scale.FIT` would pick a fractional factor like 4.21×, making some source pixels
4 screen pixels wide and others 5 — text is where that unevenness shows worst.

Three design decisions carry most of the extensibility:

1. **The generated tileset JSON is the single source of truth for collision.**
   `tools/gen_tileset.py` emits `solid` per tile; the game reads it. Art and
   physics cannot drift apart, and tile ids may be reshuffled freely.
2. **Rooms are ASCII art.** Editing a 20×15 grid of numbers by hand is
   unbearable; a room is two arrays of strings plus a shared legend.
3. **One condition/effect language.** `apps/game/src/quests/Conditions.js`
   powers dialogue gating,
   objective prerequisites and conditional spawns alike, so a new predicate is
   instantly available everywhere.

---

## Authoring content with Content Forge

Content Forge is the default way to edit the data-driven parts of the game.
It reads and writes the canonical JSON in `packages/content/data/`; the game
consumes the same shared package, so there is no separate export or copy step.

### Editing safely

1. Run `npm run dev:game` and `npm run dev:editor` in separate terminals.
2. Make changes in the editor. Changes remain an in-memory draft until saved.
3. Watch the validation bar at the bottom of the editor. Click an issue to jump
   to the affected content.
4. Use **Save** or `Ctrl+S` to write all changed content resources. Invalid
   projects cannot be saved.
5. Use **Playtest** to open the selected room in the running game.

The editor supports undo and redo (`Ctrl+Z` / `Ctrl+Y`), warns about unsaved
changes, detects files changed outside the editor, and rolls back a multi-file
save if any replacement fails. Use **Reload** to discard the current draft and
read the latest files from disk.

### Rooms and world layout

- Open **World** to inspect the complete room graph. Normal exits and doors are
  both shown; click a room node to open it.
- In **Rooms**, choose the `Ground` or `Decor` layer, choose a tile from the
  palette, and click cells on the 20×15 canvas to paint.
- Right-click a cell to pick its tile. Choose the `×` palette entry to erase.
- Set the player start coordinates and the north/east/south/west room
  connections in the room inspector.
- Use **Entities → Add** to place an enemy, NPC, pickup, door or terminal.
  Select a numbered marker on the canvas or entity list to edit its position,
  archetype, item and advanced properties.

The palette shows the generated art directly. Horizontal and vertical wall
variants remain distinct, so use the tile preview to choose the variant that
matches the wall's direction.

### Actors and items

- Open **Actors** and switch between enemy and NPC archetypes. Edit tuning
  fields such as health, speed, damage, AI brain and sheet, with nested drops
  and tags available under **Structured properties**.
- Open **Items** to edit names, icons, descriptions, pickup behavior and
  structured effects.
- Room spawn and job-objective inspectors use the current actor and item IDs as
  reference choices, avoiding free-form cross-reference typos.

### Dialogue

- Open **Dialogue**, select a graph, then select a node card.
- Edit node text and its direct next-node link in the inspector.
- Edit choices, skill checks, branches and effects in the validated
  **Choices** and **On enter effects** JSON fields.
- Use **Add node** to create a node. Dangling `goto`, `next`, job and item
  references are reported in the project validation drawer.

Dice pool = attribute + skill (+2 when the named bonus gear is carried); each
die is a d6 and 5–6 is a hit against the choice's `dc`. Options whose condition
fails render disabled with the requirement shown rather than being hidden.

Effect verbs shared by dialogue, jobs and pickups are: `setFlag`, `clearFlag`,
`giveItem`, `takeItem`, `nuyen`, `karma`, `heal`, `damage`, `ammo`,
`startJob`, `completeJob`, `failJob`, `completeObjective`, `unlock`, `spawn`,
`toast` and `warp`.

### Jobs

- Open **Jobs** and select a job to see its objective graph.
- Select an objective to edit its ID, player-facing text, type, prerequisites
  and typed references to rooms, items or enemy archetypes.
- Use **Add objective** to append a step. Optional objectives and less common
  properties are available in **Advanced properties**.

Supported objective types are `kill`, `collect`, `reach`, `talk`, `deliver`,
`flag`, `hack` and `condition`. Jobs complete when all non-optional objectives
are done unless `manualComplete` is set and dialogue completes the job.

### Creating records

Every section's list has a **＋ New** button that creates a top-level record —
a room, enemy or NPC archetype, item, dialogue graph or job. The new record is
selected immediately so it can be edited in place.

Records are created ready to save rather than as stubs that need repairing:

- **Rooms** are walled 20×15 blanks, registered in the level of the room they
  attach to, with the exit wired in *both* directions and a two-tile doorway
  opened in *both* walls — so the connection is walkable from the moment it
  exists. Neither half is a convenience. A room listed in a level that can't be
  walked to from its start room is a validation error, so a half-connected room
  would block saving the project; and an exit the player cannot physically
  reach is worse than an error, because nothing reports it — the connection
  just silently does nothing. Sides that already carry an exit are not offered,
  since attaching there would replace that exit and strand whatever it led to.
- **Actors** offer only sprite sheets that already exist, **items** only
  existing icons and **dialogue graphs** only existing portraits. All three are
  generated art, and a name with no PNG behind it fails at load time rather
  than in validation.
- **Jobs** are seeded with one objective. A job with an empty objective list has
  nothing outstanding, so it would complete the instant it started.

Opening the doorway is the one operation that edits art somebody already drew,
so it is kept as narrow as it can be. It clears the two cells the doorway
occupies and nothing else, and only where a tile actually collides — decoration
sitting on that edge survives, and an edge that is already open is left alone.
The dialog names the cost before you commit ("Clears 2 wall tiles from Neon
Market to open the way through"), and `Ctrl+Z` undoes the whole creation.

Both doorways land on the same cells (x 9–10 north/south, y 7–8 east/west,
matching every hand-authored exit in the game) because
`RoomManager.entryPosition` carries the player's perpendicular coordinate
across the edge — a gap at y=7 leading to a gap at y=3 would deposit them
against a wall.

IDs become object keys that other records reference as bare strings, so they
are restricted to lower case letters, digits and underscores, and are checked
for collisions within their own collection as you type. An ID cannot be renamed
from the editor afterwards.

### Operations that still require source changes

The editor owns game content, not generated artwork or executable behavior.
These operations remain code workflows:

- **New glyph:** update `tools/gen_font.py`, then run `npm run assets`.
- **New sound:** add a `@sfx`-decorated function to `tools/gen_sfx.py`, then
  run `npm run assets`. Map it to an event in `apps/game/src/core/audio.js`;
  the boot scene picks the clip up from the manifest without being edited.
- **New tile artwork:** add the tile generator to `tools/gen_tileset.py`, add
  its legend character to `packages/content/data/tiles.json`, then run
  `npm run assets`. Collision comes from the generated tile metadata.
- **New actor artwork:** add a spec to `tools/gen_actors.py`, then run
  `npm run assets`.
- **New AI brain:** implement it in `apps/game/src/entities/ai/index.js`.
- **New objective type:** implement it in
  `apps/game/src/quests/objectives.js`.

Levels and tile legend entries are still hand-edited in
`packages/content/data/*.json`. After a direct JSON change, choose **Reload** in
the editor and run `npm run validate:content`.

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

Coverage includes the condition evaluator, effect verbs, dice-pool
distribution, JobManager lifecycle and persistence, the save round trip and
checkpoint policy, audio event routing and retrigger gating, editor history,
painting and record creation, atomic content
persistence and rollback, and game/editor dependency isolation. Every record
creator is asserted to leave the project passing validation, which is the whole
contract: creating something must never hand the author a project they cannot
save. The content validator checks room dimensions, tile characters,
player and entity coordinates, exits, doors, archetypes, items, dialogue links,
job objectives and reachability from each level's start room.

For automated or console-driven game checks,
`apps/game/src/dev/harness.js` (dev builds only) exposes `window.__h` with
`step`, `run`, `walk`, `tap`, `rig`, `shot`, `state` and `begin`.
`h.begin()` skips the title screen into a fresh run (`h.begin('continue')`
resumes the checkpoint) without synthesising keystrokes.
`h.shot('name.png')` writes a PNG to `.shots/` through the game dev server.

> Note when scripting the harness: Phaser's TweenManager derives its delta from
> `Date.now()`, so tween-gated behaviour (death fades, toasts) needs `h.run(ms)`,
> which lets real time pass, rather than `h.step(frames)`.
