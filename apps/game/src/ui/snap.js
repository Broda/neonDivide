/**
 * Nudges a text object so its top-left corner lands on a whole pixel.
 *
 * Drawing this font off the pixel grid does not soften it. With NEAREST
 * sampling a half-pixel offset reads the neighbouring row of the atlas, and
 * the atlas is 20 glyphs wide - so the result is not a blurry "A" but a crisp,
 * confident, entirely different letter: "JACK IN" renders as "2JHUK IN".
 *
 * The line height is kept even (see tools/gen_font.py) so that centring text
 * with a 0.5 origin cannot land on a half pixel in the first place. This is
 * the second line of defence, for anything positioned at a fractional
 * coordinate by arithmetic rather than by origin.
 *
 * Lives apart from text.js, which imports Phaser, so the arithmetic stays
 * testable under `node --test` like the rest of the non-rendering code. It
 * only reads position, scale and displayOrigin, so it works on anything
 * shaped like a Phaser game object.
 */
export function snapToPixel(text) {
  const left = text.x - text.displayOriginX * text.scaleX;
  const top = text.y - text.displayOriginY * text.scaleY;
  text.setPosition(
    text.x + (Math.round(left) - left),
    text.y + (Math.round(top) - top),
  );
  return text;
}
