import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapFrame, snapEdge, dragRestoreFrame, shownWindowFrame } from '../windows-model.mjs';

const viewport = { width: 1920, height: 1080 };
const frame = { x: 150, y: 120, w: 860, h: 560 };

test('left/right halves tile exactly above Kicker, including odd and small widths', () => {
  for (const width of [1920, 1919, 800]) {
    const v = { ...viewport, width };
    const left = snapFrame('left', v), right = snapFrame('right', v);
    assert.equal(left.x, 0);
    assert.equal(left.w, right.x);
    assert.equal(right.x + right.w, width);
    assert.equal(left.h, 1044);
    assert.equal(right.h, left.h);
    assert.equal(left.y, 0);
  }
});

test('edge detection uses the pointer and excludes the taskbar and middle of the screen', () => {
  assert.equal(snapEdge({ x: 5, y: 300 }, viewport), 'left');
  assert.equal(snapEdge({ x: 1918, y: 300 }, viewport), 'right');
  assert.equal(snapEdge({ x: 900, y: 300 }, viewport), null);
  assert.equal(snapEdge({ x: 0, y: 1060 }, viewport), null);
  assert.equal(snapEdge({ x: 900, y: 0 }, viewport), 'top');
  assert.equal(snapEdge({ x: 900, y: -1 }, viewport), 'top');
  assert.equal(snapEdge({ x: 900, y: 17 }, viewport), null);
});

test('the top snap zone previews the same maximized geometry as the window', () => {
  assert.equal(snapEdge({ x: 0, y: 0 }, viewport), 'top');
  assert.equal(snapEdge({ x: 1919, y: 0 }, viewport), 'top');
  assert.deepEqual(snapFrame('top', viewport), shownWindowFrame({ frame, big: true }, viewport));
});

test('snapping/shading/maximizing preserves the normal restore frame', () => {
  const state = { frame, snap: 'right' };
  assert.deepEqual(shownWindowFrame(state, viewport), snapFrame('right', viewport));
  assert.equal(shownWindowFrame({ ...state, shaded: true }, viewport).h, 27);
  assert.equal(shownWindowFrame({ ...state, big: true }, viewport).w, 1916);
  assert.deepEqual(shownWindowFrame({ ...state, snap: null }, viewport), frame);
  assert.deepEqual(state.frame, frame);
});

test('dragging away from a snapped/maximized title restores size under the pointer', () => {
  const restored = dragRestoreFrame({ frame, snap: 'right' }, { x: 1440, y: 12 }, viewport);
  assert.equal(restored.w, frame.w);
  assert.equal(restored.h, frame.h);
  assert.equal(restored.x + restored.w / 2, 1440);
  assert.equal(restored.y, 0);
  assert.deepEqual(dragRestoreFrame({ frame }, { x: 300, y: 125 }, viewport), frame);
});
