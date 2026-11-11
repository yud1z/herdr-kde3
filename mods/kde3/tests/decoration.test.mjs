import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decorationState, displayFrame, clampFrame, LOOK, FRAME_EDGE, PANEL_HEIGHT } from '../model.mjs';
import { shownWindowFrame } from '../windows-model.mjs';

test('decoration loses focus when Herdr is backgrounded or its dialog is key', () => {
  assert.equal(decorationState(true, false), 'active');
  assert.equal(decorationState(false, false), 'inactive');
  assert.equal(decorationState(true, true), 'inactive');
  assert.equal(decorationState(false, true), 'inactive');
});

test('roll-up changes only visible height and restores the exact full frame', () => {
  const frame = Object.freeze({ x: 288, y: 156, w: 1406, h: 760 });
  const rolled = displayFrame(frame, true);
  assert.deepEqual(rolled, { ...frame, h: LOOK.title + FRAME_EDGE });
  assert.deepEqual(displayFrame(frame, false), frame);
  assert.equal(frame.h, 760);
});

test('rolling up a maximized frame preserves its expanded dimensions', () => {
  const maximized = { x: 2, y: 2, w: 1916, h: 1040 };
  assert.equal(displayFrame(maximized, true).w, maximized.w);
  assert.equal(displayFrame(maximized, true).h, LOOK.title + FRAME_EDGE);
  assert.deepEqual(displayFrame(maximized, false), maximized);
});

test('rolled-up window can move to the bottom using only its visible title height', () => {
  const viewport = { width: 1920, height: 1080 };
  const requested = { x: 300, y: 5000, w: 860, h: 560 };
  const moved = clampFrame(requested, viewport, true);
  assert.equal(moved.y, viewport.height - PANEL_HEIGHT - LOOK.title - FRAME_EDGE);
  assert.equal(moved.h, 560, 'Moving the rolled-up title must preserve expanded height');
  const shown = shownWindowFrame({ frame: moved, shaded: true }, viewport);
  assert.equal(shown.y, moved.y, 'Reopening must not clamp against the hidden body');
  assert.equal(shown.y + shown.h, viewport.height - PANEL_HEIGHT);
});

test('rolling down near the bottom keeps the full window visible without changing its size', () => {
  const viewport = { width: 1920, height: 1080 };
  const rolled = clampFrame({ x: 300, y: 5000, w: 860, h: 560 }, viewport, true);
  const expanded = clampFrame(rolled, viewport, false);
  assert.equal(expanded.h, rolled.h);
  assert.equal(expanded.w, rolled.w);
  assert.equal(expanded.y + expanded.h, viewport.height - PANEL_HEIGHT);
});
