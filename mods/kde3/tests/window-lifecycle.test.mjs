import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the actual controller with a synchronous Herdr boundary. No copies of
// the production switching logic, and no native app or user sessions in unit tests.
const calls = [];
let state;
let focusedTerminal;
let tabList;
let overlaySequence = 0;
let viewport;
const fake = {
  spaces: () => [{ id: 'space', tabs: tabList }],
  panes: () => [{ tab: 'a', terminal: 't1' }, { tab: 'b', terminal: 't2' }],
  terminals: () => [], focused: () => ({ terminal: focusedTerminal }),
  layout: () => ({ theme: 'kde3' }), shared: (key) => state[key],
  setShared: (key, value) => { state[key] = value; },
  openOverlay: (spec) => { calls.push(['open', spec]); return `overlay-${++overlaySequence}`; },
  closeOverlay: (id) => calls.push(['close', id]),
  run: (name, args) => { calls.push([name, args]); if (name === 'pane.focus') focusedTerminal = args.terminal; },
};
globalThis.__kde3TestHerdr = fake;
globalThis.window = { viewport_size: () => viewport };
const source = readFileSync(new URL('../windows.mjs', import.meta.url), 'utf8')
  .replace(/import \{([^}]+)\} from 'herdr';/, 'const {$1} = globalThis.__kde3TestHerdr;')
  .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(`../${path}`, import.meta.url).href}'`);
const controller = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function reset() {
  calls.length = 0;
  focusedTerminal = 't1';
  viewport = { width: 1920, height: 1080 };
  tabList = [{ id: 'a', name: 'Shell' }, { id: 'b', name: 'Shell 2' }];
  state = { 'kde3.windows': {} };
  controller.openWindow('a', { tabs: ['a', 'b'], activeTab: 'a' });
  calls.length = 0;
}

test('tab switches do not select the hidden model tab or focus before native layout', () => {
  reset();
  controller.selectWindowTab('a', 'b');
  assert.deepEqual(calls.map(([name]) => name), ['open']);
  const spec = calls.find(([name]) => name === 'open')[1];
  assert.equal(spec.key, 'kde3-window-a-0');
  assert.equal(state['kde3.windows'].a.activeTab, 'b');
  assert.equal(focusedTerminal, 't1', 'focus must wait for the new terminal block');
  controller.finishWindowFocus('a', state['kde3.windows'].a.overlay);
  assert.equal(focusedTerminal, 't2');
  calls.length = 0;
  controller.syncWindows();
  assert.deepEqual(calls, [], 'periodic sync must not replace the window a second time');
});

test('clicking the selected tab does not rebuild it, but taskbar raise reorders the overlay', () => {
  reset();
  controller.selectWindowTab('a', 'a');
  assert.ok(calls.every(([name]) => name === 'pane.focus'));
  calls.length = 0;
  controller.raiseWindow('a');
  assert.deepEqual(calls.map(([name]) => name), ['open']);
  controller.finishWindowFocus('a', state['kde3.windows'].a.overlay);
  assert.equal(calls.at(-1)[0], 'pane.focus');
});

test('restoring a minimized window still opens it and focuses its terminal', () => {
  reset();
  controller.minimizeWindow('a');
  calls.length = 0;
  controller.raiseWindow('a');
  assert.deepEqual(calls.map(([name]) => name), ['open']);
  assert.equal(state['kde3.windows'].a.min, false);
});

test('taskbar activation brings forward an inactive window, then minimizes and restores it', () => {
  reset();
  focusedTerminal = 'unrelated';
  state['kde3.focusedWindow'] = null;
  state['kde3.windows'].other = { tabs: ['b'], activeTab: 'b' };
  state['kde3.windows'].a.tabs = ['a'];
  focusedTerminal = 't2';
  controller.activateWindowTask('a');
  assert.equal(calls[0][0], 'open');
  assert.equal(controller.activeWindowId(), 'a', 'pending focus identifies the activated task immediately');
  controller.finishWindowFocus('a', state['kde3.windows'].a.overlay);
  controller.activateWindowTask('a');
  assert.equal(state['kde3.windows'].a.min, true);
  controller.activateWindowTask('a');
  assert.equal(state['kde3.windows'].a.min, false);
  assert.equal(calls.at(-1)[0], 'open');
});

test('new geometry opens the replacement before retiring the old key', () => {
  reset();
  controller.moveWindow('a', { x: 300, y: 250, w: 860, h: 560 });
  assert.deepEqual(calls.map(([name]) => name), ['open', 'close']);
  assert.equal(calls[0][1].key, 'kde3-window-a-1');
});

test('stale layout callbacks cannot steal focus after rapid tab or window switches', () => {
  reset();
  controller.selectWindowTab('a', 'b');
  const stale = state['kde3.windows'].a.overlay;
  controller.selectWindowTab('a', 'a');
  const current = state['kde3.windows'].a.overlay;
  calls.length = 0;
  controller.finishWindowFocus('a', stale);
  assert.deepEqual(calls, []);
  state['kde3.focusedWindow'] = 'another';
  controller.finishWindowFocus('a', current);
  assert.deepEqual(calls, []);
  state['kde3.focusedWindow'] = 'a';
  controller.finishWindowFocus('a', current);
  assert.equal(calls.at(-1)[1].terminal, 't1');
  calls.length = 0;
  controller.finishWindowFocus('a', current);
  assert.deepEqual(calls, [], 'post-layout focus is consumed once');
});

test('renaming a tab does not replace live terminal content', () => {
  reset();
  tabList[0].name = 'Renamed';
  controller.syncWindows();
  assert.deepEqual(calls, []);
});

test('snap actions preserve normal geometry and do not affect another window', () => {
  reset();
  const before = { ...state['kde3.windows'].a.frame };
  state['kde3.windows'].other = { tabs: ['b'], frame: { x: 10, y: 10, w: 600, h: 400 } };
  const other = structuredClone(state['kde3.windows'].other);
  controller.snapWindow('a', 'left');
  assert.deepEqual(state['kde3.windows'].a.frame, before);
  assert.equal(state['kde3.windows'].a.snap, 'left');
  assert.deepEqual(controller.windowFrame('a'), { x: 0, y: 0, w: 960, h: 1044 });
  controller.snapWindow('a', 'right');
  controller.minimizeWindow('a');
  controller.raiseWindow('a');
  assert.equal(state['kde3.windows'].a.snap, 'right');
  controller.maximizeWindow('a');
  controller.maximizeWindow('a');
  assert.equal(state['kde3.windows'].a.snap, 'right');
  controller.snapWindow('a', null);
  assert.deepEqual(controller.windowFrame('a'), before);
  assert.deepEqual(state['kde3.windows'].other, other);
});

test('manual move/resize exits snapping, and invalid snap actions do nothing', () => {
  reset();
  controller.snapWindow('a', 'right');
  controller.moveWindow('a', { x: 200, y: 100, w: 700, h: 500 });
  assert.equal(state['kde3.windows'].a.snap, null);
  assert.deepEqual(controller.windowFrame('a'), { x: 200, y: 100, w: 700, h: 500 });
  calls.length = 0;
  controller.snapWindow('a', 'invalid');
  controller.snapWindow('missing', 'left');
  assert.deepEqual(calls, []);
});

test('snapped halves adapt when the Herdr viewport changes without repeated rebuilds', () => {
  reset();
  controller.snapWindow('a', 'right');
  viewport = { width: 1601, height: 900 };
  calls.length = 0;
  controller.syncWindows();
  const spec = calls.find(([name]) => name === 'open')[1];
  assert.equal(spec.width, 801);
  assert.equal(spec.height, 864);
  assert.deepEqual(spec.at, { x: 800, y: 0 });
  calls.length = 0;
  controller.syncWindows();
  assert.deepEqual(calls, []);
});

test('top snapping maximizes rather than toggles, preserving normal and half-snap restore modes', () => {
  reset();
  const frame = { ...state['kde3.windows'].a.frame };
  controller.snapWindow('a', 'top');
  assert.equal(state['kde3.windows'].a.big, true);
  controller.snapWindow('a', 'top');
  assert.equal(state['kde3.windows'].a.big, true);
  assert.deepEqual(state['kde3.windows'].a.frame, frame);
  controller.maximizeWindow('a');
  assert.deepEqual(controller.windowFrame('a'), frame);
  controller.snapWindow('a', 'right');
  controller.snapWindow('a', 'top');
  controller.maximizeWindow('a');
  assert.equal(state['kde3.windows'].a.snap, 'right');
  assert.equal(state['kde3.windows'].a.big, false);
});
