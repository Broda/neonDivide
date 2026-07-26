import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { snapToPixel } from '../src/ui/snap.js';

/**
 * Stands in for a Phaser BitmapText. Only the members snapToPixel touches:
 * displayOrigin is origin * size, exactly as Phaser derives it.
 */
function fakeText({ x, y, width = 54, height = 9, originX = 0.5, originY = 0.5, scale = 1 }) {
  return {
    x,
    y,
    scaleX: scale,
    scaleY: scale,
    displayOriginX: width * originX,
    displayOriginY: height * originY,
    setPosition(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
      return this;
    },
    get left() { return this.x - this.displayOriginX * this.scaleX; },
    get top() { return this.y - this.displayOriginY * this.scaleY; },
  };
}

describe('bitmap text pixel snapping', () => {
  it('pulls a half-pixel line onto a whole pixel', () => {
    // A 9px line centred with origin 0.5 draws at y - 4.5. With NEAREST
    // sampling that reads the neighbouring row of a 20-glyph-wide atlas, so
    // the text renders as different letters entirely rather than as a blur.
    const text = fakeText({ x: 160, y: 150 });
    assert.equal(text.top, 145.5);
    snapToPixel(text);
    assert.equal(Number.isInteger(text.top), true);
    assert.equal(Number.isInteger(text.left), true);
  });

  it('moves it by less than a pixel', () => {
    const text = fakeText({ x: 160, y: 150 });
    snapToPixel(text);
    assert.ok(Math.abs(text.y - 150) <= 0.5, `moved ${Math.abs(text.y - 150)}px`);
  });

  it('leaves text that already lands on a pixel alone', () => {
    const text = fakeText({ x: 160, y: 195, originY: 0 });
    snapToPixel(text);
    assert.deepEqual([text.x, text.y], [160, 195]);
  });

  it('is idempotent, so re-snapping a moved object never drifts', () => {
    const text = fakeText({ x: 160, y: 150 });
    snapToPixel(text);
    const once = [text.x, text.y];
    snapToPixel(text);
    snapToPixel(text);
    assert.deepEqual([text.x, text.y], once);
  });

  it('accounts for scale, so headings snap too', () => {
    // A scale-3 heading offsets by displayOrigin * 3.
    const text = fakeText({ x: 160, y: 52, height: 9, scale: 3 });
    assert.equal(text.top, 38.5);
    snapToPixel(text);
    assert.equal(Number.isInteger(text.top), true);
  });

  it('snaps an odd width on the horizontal axis', () => {
    const text = fakeText({ x: 160, y: 100, width: 45, originY: 0 });
    assert.equal(text.left, 137.5);
    snapToPixel(text);
    assert.equal(Number.isInteger(text.left), true);
  });
});
