import Phaser from 'phaser';

import { snapToPixel } from './snap.js';

/**
 * All UI text goes through here.
 *
 * The game uses a generated bitmap font rather than Phaser's Text object.
 * Text rasterises a real browser font via canvas fillText, which antialiases
 * glyph edges - invisible at 1:1 but read as blur once the 320x272 canvas is
 * scaled 4x, and jarring next to crisp pixel-art tiles. A bitmap font is just
 * sprites, so it scales exactly like everything else.
 *
 * Glyphs are drawn white by tools/gen_font.py, so colour is a tint.
 */

export const FONT_KEY = 'pixel';

/** Shared palette, mirroring tools/palette.py. */
export const UI = {
  text: 0xcee8f8,
  dim: 0x6c8098,
  faint: 0x43506a,
  cyan: 0x00c8e8,
  cyanBright: 0x96f5ff,
  amber: 0xe89e30,
  green: 0x7ee858,
  red: 0xff7a7a,
  white: 0xffffff,
};

/** Tone name -> tint, used by toasts and objective ticks. */
export const TONE = {
  good: UI.green,
  bad: UI.red,
  job: UI.amber,
  objective: UI.cyanBright,
  info: UI.text,
};

/**
 * Registers the generated font with the BitmapText cache. Called once by
 * BootScene; the layout comes from fx_manifest.json so the atlas and the game
 * can never disagree about cell size or character order.
 */
export function registerFont(scene, fontMeta) {
  if (scene.cache.bitmapFont.has(FONT_KEY)) return;

  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'ui_font',
    width: fontMeta.width,
    height: fontMeta.height,
    chars: fontMeta.chars,
    charsPerRow: fontMeta.charsPerRow,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: fontMeta.lineSpacing ?? 1,
  });

  scene.cache.bitmapFont.add(FONT_KEY, data);
}

/**
 * @param {object} opts
 *   color      tint (see UI)
 *   maxWidth   pixel width to word-wrap at
 *   origin     [x, y]
 *   scale      integer multiplier for headings (keeps pixels square)
 *   align      0 left, 1 centre, 2 right
 */
export function makeText(scene, x, y, str = '', opts = {}) {
  const t = scene.add.bitmapText(x, y, FONT_KEY, str);
  t.setTint(opts.color ?? UI.text);
  if (opts.maxWidth) t.setMaxWidth(opts.maxWidth);
  if (opts.align === 1) t.setCenterAlign();
  else if (opts.align === 2) t.setRightAlign();
  // Scale rather than font size: an integer multiple keeps every glyph pixel
  // square, which a fractional font size would not.
  if (opts.scale) t.setScale(opts.scale);
  if (opts.origin) t.setOrigin(opts.origin[0], opts.origin[1]);
  return snapToPixel(t);
}

/**
 * Height of one line of text, in pixels: the 8px cell plus the font's line
 * spacing. Kept even on purpose - see the note in tools/gen_font.py.
 */
export const LINE_H = 10;
/** Advance width of one glyph. The font is fixed-width, so this is exact. */
export const CHAR_W = 6;

/**
 * Word-wrap with a hanging indent.
 *
 * BitmapText's own wrapping returns continuation lines to the left margin,
 * which makes a long numbered choice look like a new choice. Because the font
 * is fixed-width we can wrap by character count exactly.
 */
export function wrapIndented(str, pixelWidth, indent = '   ') {
  const cols = Math.max(8, Math.floor(pixelWidth / CHAR_W));
  const out = [];
  let line = '';

  for (const word of String(str).split(' ')) {
    const limit = out.length === 0 ? cols : cols - indent.length;
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > limit && line) {
      out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);

  return out.map((l, i) => (i === 0 ? l : indent + l)).join('\n');
}
