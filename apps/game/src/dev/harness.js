/**
 * Dev-only debugging harness, imported by main.js when `import.meta.env.DEV`.
 *
 * Its main job is making the game drivable when the page is hidden: browsers
 * suspend requestAnimationFrame in background tabs, which freezes Phaser's
 * loop, so `step()` advances the loop by hand against a synthetic clock. That
 * lets the game be smoke-tested from the console (or an automated agent)
 * without a visible window.
 *
 * Nothing here ships: the module is only imported in dev, and `vite build`
 * drops the branch entirely.
 */
export function installHarness(game) {
  const api = {};
  let clock = performance.now();

  /** Advance the game loop `frames` times at a fixed delta. */
  api.step = (frames = 1, dt = 1000 / 60) => {
    for (let i = 0; i < frames; i++) {
      clock += dt;
      game.loop.step(clock);
    }
    return api;
  };

  // Phaser dispatches its `keydown-X` events off `event.keyCode`, so synthetic
  // events must carry the right numeric code - not just `code`/`key`.
  const SPECIAL_KEYCODE = {
    Shift: 16, Tab: 9, Enter: 13, Escape: 27, ' ': 32,
  };
  const keyCodeFor = (key) => SPECIAL_KEYCODE[key] ?? key.toUpperCase().charCodeAt(0);

  const send = (type, code, key) => window.dispatchEvent(new KeyboardEvent(type, {
    code,
    key,
    keyCode: keyCodeFor(key),
    bubbles: true,
  }));

  const KEYS = {
    up: ['KeyW', 'w'],
    down: ['KeyS', 's'],
    left: ['KeyA', 'a'],
    right: ['KeyD', 'd'],
    melee: ['KeyJ', 'j'],
    fire: ['KeyK', 'k'],
    use: ['KeyE', 'e'],
    dash: ['ShiftLeft', 'Shift'],
    journal: ['Tab', 'Tab'],
    enter: ['Enter', 'Enter'],
    esc: ['Escape', 'Escape'],
  };

  const resolve = (name) => {
    if (KEYS[name]) return KEYS[name];
    if (/^[0-9]$/.test(name)) return [`Digit${name}`, name];
    if (/^[a-zA-Z]$/.test(name)) return [`Key${name.toUpperCase()}`, name.toLowerCase()];
    return [name, name];
  };

  api.hold = (name) => { send('keydown', ...resolve(name)); return api; };
  api.release = (name) => { send('keyup', ...resolve(name)); return api; };

  /** Press and release, stepping through the hold so JustDown is observed. */
  api.tap = (name, frames = 4) => {
    api.hold(name);
    api.step(frames);
    api.release(name);
    return api.step(3);
  };

  /** Hold a direction for `frames` and let go. */
  api.walk = (name, frames = 30) => {
    api.hold(name);
    api.step(frames);
    api.release(name);
    return api.step(2);
  };

  /**
   * Snapshot the WebGL framebuffer. A plain canvas.toDataURL() comes back blank
   * because Phaser runs without preserveDrawingBuffer, so go through the
   * renderer's own snapshot path. POSTs to the dev-server endpoint in
   * vite.config.js when a name is given.
   */
  api.shot = (name = null, scale = 1) => new Promise((resolve_) => {
    game.renderer.snapshot((img) => {
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/png');
      if (!name) return resolve_(data);
      return fetch('/__shot', { method: 'POST', body: JSON.stringify({ name, data }) })
        .then((r) => r.json())
        .then(resolve_)
        .catch(() => resolve_({ ok: false }));
    });
    api.step(1);
  });

  /**
   * Step while letting real wall-clock time pass.
   *
   * Phaser's TweenManager derives its delta from `Date.now()` rather than the
   * loop delta (it does its own lag smoothing), so tweens do not advance under
   * `step()` alone no matter how many frames you push. Anything gated on a
   * tween finishing - death fades, the game-over handoff - needs this instead.
   */
  api.run = async (ms, frameMs = 1000 / 60) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      clock += frameMs;
      game.loop.step(clock);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 8));
    }
    return api;
  };

  api.world = () => game.scene.getScene('World');
  api.dialogue = () => game.scene.getScene('Dialogue');
  api.title = () => game.scene.getScene('Title');

  /**
   * Get past the title screen without synthesising keystrokes. `'continue'`
   * resumes the checkpoint; anything else starts a fresh run.
   */
  api.begin = (mode = 'new') => {
    const title = api.title();
    if (!title?.scene.isActive()) return 'not on the title screen';
    title.startRun({ load: mode === 'continue' });
    return api.step(2);
  };

  /**
   * Force the next skill check's dice. Injected into the live DialogueRunner
   * rather than onto Math.random, which Phaser also uses to mint texture keys.
   * `null` restores normal randomness.
   */
  api.rig = (mode) => {
    const runner = api.dialogue()?.runner;
    if (!runner) return 'no dialogue open';
    runner.ctx.rng = mode === null ? null
      : mode === 'pass' ? () => 0.95   // every die a 6
        : () => 0.01;                  // every die a 1
    return api;
  };

  /** Compact snapshot of everything worth asserting on. */
  api.state = () => {
    const w = api.world();
    const active = () => game.scene.scenes.filter((x) => x.scene.isActive())
      .map((x) => x.scene.key);
    // No usable world means Boot or Title owns the screen - report which, so a
    // stalled automation run says something more useful than "booting".
    // Probing `anims` rather than `player`: returning to the title stops the
    // World scene but leaves the scene object registered, still holding a
    // reference to a destroyed player.
    if (!w?.player?.anims) return { booting: true, scenes: active() };
    const s = w.state;
    return {
      scenes: active(),
      room: w.roomId,
      player: {
        x: Math.round(w.player.x),
        y: Math.round(w.player.y),
        facing: w.player.facing,
        anim: w.player.anims.currentAnim?.key,
        dead: w.player.dead,
      },
      hp: `${s.hp}/${s.maxHp}`,
      ammo: s.ammo,
      nuyen: s.nuyen,
      karma: s.karma,
      items: [...s.inventory.keys()],
      jobs: s.jobs,
      counts: {
        enemies: w.enemies.getLength(),
        npcs: w.npcs.getLength(),
        pickups: w.pickups.getLength(),
        interactables: w.interactables.length,
      },
    };
  };

  window.__game = game;
  window.__h = api;
  return api;
}
