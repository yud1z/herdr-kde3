import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowFocusId, composeWindow, initialWindowFrame, shownWindowFrame, windowSignature } from '../windows-model.mjs';
import { LOOK, FRAME_EDGE } from '../model.mjs';

const look = { theme: 'kde3-linux', font: 'Menlo', font_size: 13, ui_font: 'Tahoma', terminal_opacity: 1, terminal_padding: [3, 3] };
const frame = { x: 90, y: 85, w: 860, h: 560 };
const tab = { id: 'tab-a', terminals: ['t1', 't2'] };
const collect = (n) => [n, ...(n.children ?? []).flatMap(collect)];

test('each independent window owns only its own live terminal blocks', () => {
  const a = composeWindow(tab, { frame }, look);
  const b = composeWindow({ id: 'tab-b', terminals: ['remote/t3'] }, { frame }, look);
  assert.deepEqual(collect(a).filter((n) => n.content?.terminal).map((n) => n.content.terminal), ['t1', 't2']);
  assert.deepEqual(collect(b).filter((n) => n.content?.terminal).map((n) => n.content.terminal), ['remote/t3']);
  assert.equal(collect(a).find((n) => n.id === 'title').content.props.tab, 'tab-a');
  assert.equal(collect(b).find((n) => n.id === 'title').content.props.tab, 'tab-b');
});

test('roll-up removes only that window body without changing its saved dimensions', () => {
  const state = { frame, shaded: true };
  const rolled = composeWindow(tab, state, look);
  assert.deepEqual(rolled.children.map((n) => n.id), ['title', 'bottom']);
  assert.equal(shownWindowFrame(state, { width: 1920, height: 1080 }).h, LOOK.title + FRAME_EDGE);
  assert.deepEqual(state.frame, frame);
  assert.equal(shownWindowFrame({ ...state, shaded: false }, { width: 1920, height: 1080 }).h, frame.h);
});

test('focus follows the clicked terminal and excludes minimized windows', () => {
  const panes = [{ tab: 'a', terminal: 't1' }, { tab: 'b', terminal: 't2' }];
  assert.equal(windowFocusId({ a: {}, b: {} }, panes, 't1', 'b'), 'a');
  assert.equal(windowFocusId({ a: {}, b: {} }, panes, 't2', 'a'), 'b');
  assert.equal(windowFocusId({ a: { min: true }, b: {} }, panes, 't1', 'a'), 'b');
  assert.equal(windowFocusId({ a: { min: true } }, panes, 't1', 'a'), null);
});

test('tabs share a window identity even after the original tab closes', () => {
  const panes = [{ tab: 'second-tab', terminal: 't2' }, { tab: 'other-tab', terminal: 't3' }];
  const grouped = { 'original-tab': { tabs: ['second-tab'], activeTab: 'second-tab' }, 'other-tab': {} };
  assert.equal(windowFocusId(grouped, panes, 't2', 'other-tab'), 'original-tab');
  assert.equal(windowFocusId(grouped, panes, 't3', 'original-tab'), 'other-tab');
});

test('native overlay tree remains below the host argument-depth limit', () => {
  const depth = (v) => v && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0;
  const layout = composeWindow({ id: 'many', terminals: Array.from({ length: 20 }, (_, n) => `t${n}`) }, { frame, toolbar: true }, look);
  assert.ok(depth({ layout }) <= 16);
  const ids = collect(layout).map((n) => n.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('profile, font, zoom and pane changes invalidate only the window rendering signature', () => {
  const before = windowSignature(tab.terminals, {}, look);
  assert.notEqual(before, windowSignature(tab.terminals, {}, { ...look, theme: 'kde3-paper' }));
  assert.notEqual(before, windowSignature(tab.terminals, {}, { ...look, font_size: 16 }));
  assert.notEqual(before, windowSignature(['t1'], {}, look));
  assert.notEqual(windowSignature(['t1'], { activeTab: 'a' }, look), windowSignature(['t1'], { activeTab: 'b' }, look));
  assert.equal(before, windowSignature(tab.terminals, { frame: { ...frame, x: 500 } }, look));
});

test('new windows are cascaded and fit above Kicker', () => {
  const v = { width: 1920, height: 1080 };
  const a = initialWindowFrame(0, v), b = initialWindowFrame(1, v);
  assert.notEqual(a.x, b.x); assert.notEqual(a.y, b.y);
  assert.ok(a.x + a.w <= v.width && b.y + b.h <= v.height - 36);
});
