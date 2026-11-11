import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampFrame, displayFrame } from '../model.mjs';
import { snapEdge, snapFrame } from '../windows-model.mjs';

// Run the actual drag event handlers with fluent GPUI elements stubbed out.
const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  drag() {'), source.indexOf('  dialog() {'));
function fixture(extra = {}) {
  const handlers = {}, calls = [];
  const p = { mode: 'move', start: { x: 300, y: 100 }, frame: { x: 200, y: 90, w: 860, h: 560 }, window: 'owned', overlay: 'drag', ...extra };
  const element = new Proxy({}, { get: (_target, key) => (...args) => {
    if (key.startsWith('on_')) handlers[key] = args.at(-1);
    return element;
  } });
  const Drag = new Function('props', 'div', 'clampFrame', 'viewport', 'displayFrame', 'snapEdge', 'snapFrame', 'snapWindow', 'moveWindow', 'closeOverlay', 'setShared', 'place', `return class {${method}}`)(
    () => p, () => element, clampFrame, () => ({ width: 1920, height: 1080 }), displayFrame, snapEdge, snapFrame,
    (...args) => calls.push(['snap', ...args]), (...args) => calls.push(['move', ...args]),
    (id) => calls.push(['close', id]), () => assert.fail('Not a legacy frame'), () => assert.fail('Not a legacy frame'));
  const view = new Drag();
  view.want = p.frame;
  view.drag();
  return { calls, move: (position) => handlers.on_mouse_move({ position }, { notify() {} }), release: (position) => handlers.on_mouse_up({ position }) };
}

test('drag to either edge snaps only the owning window on release', () => {
  for (const [x, side] of [[0, 'left'], [1919, 'right']]) {
    const f = fixture();
    f.move({ x, y: 200 });
    assert.deepEqual(f.calls, [], 'preview must not resize the real terminal');
    f.release({ x, y: 200 });
    assert.deepEqual(f.calls, [['snap', 'owned', side], ['close', 'drag']]);
  }
});

test('dragging to the top maximizes on release; leaving the top cancels it', () => {
  const top = fixture();
  top.move({ x: 900, y: 0 });
  assert.deepEqual(top.calls, []);
  top.release({ x: 900, y: 0 });
  assert.deepEqual(top.calls, [['snap', 'owned', 'top'], ['close', 'drag']]);
  const away = fixture();
  away.move({ x: 900, y: 0 });
  away.move({ x: 900, y: 100 });
  away.release({ x: 900, y: 100 });
  assert.equal(away.calls[0][0], 'move');
});

test('a click or tiny pointer movement does not unsnap/rebuild the window', () => {
  const f = fixture();
  f.move({ x: 301, y: 101 });
  f.release({ x: 301, y: 101 });
  assert.deepEqual(f.calls, [['close', 'drag']]);
});

test('resize and rolled-up drags never trigger edge snapping', () => {
  for (const extra of [{ mode: 'resize' }, { shaded: true }]) {
    const f = fixture(extra);
    f.move({ x: 0, y: 200 });
    f.release({ x: 0, y: 200 });
    assert.equal(f.calls[0][0], 'move');
  }
});

test('dragging away uses the saved restore size, and leaving the edge cancels the snap preview', () => {
  const f = fixture({ frame: { x: 0, y: 0, w: 960, h: 1044 }, restoreFrame: { x: 150, y: 90, w: 700, h: 500 } });
  f.move({ x: 0, y: 200 });
  f.move({ x: 600, y: 200 });
  f.release({ x: 600, y: 200 });
  assert.equal(f.calls[0][0], 'move');
  assert.equal(f.calls[0][2].w, 700);
  assert.equal(f.calls[0][2].h, 500);
});
