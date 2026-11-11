import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampFrame, defaultFrame, terminalSessions, clockText, nextMenuIndex, PANEL_HEIGHT, LOOK, profileLook } from '../model.mjs';

test('windows remain above Kicker and inside small and large viewports', () => {
  for (const width of [320, 640, 1280, 1920]) for (const height of [240, 600, 1080]) {
    for (const frame of [defaultFrame({ width, height }), { x: -100, y: 9000, w: 4000, h: 8000 }]) {
      const f = clampFrame(frame, { width, height });
      assert.ok(f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0);
      assert.ok(f.x + f.w <= width);
      assert.ok(f.y + f.h <= height - PANEL_HEIGHT);
    }
  }
});

test('launcher lists terminal tabs only, preserving mixed terminal tabs and remote IDs', () => {
  const spaces = [{ id: 's', name: 'Home', active: true, machine: null, tabs: [
    { id: 't1', index: 1, name: '1', active: true },
    { id: 't2', index: 2, name: 'Notes', named: true },
    { id: 'remote/t3', index: 3, name: 'Build', named: true },
  ] }];
  const panes = [{ tab: 't1', terminal: 'x' }, { tab: 't2', mod: 'notes' },
    { tab: 'remote/t3', terminal: 'remote/x' }, { tab: 'remote/t3', mod: 'files' }];
  const rows = terminalSessions(spaces, panes);
  assert.deepEqual(rows.map((r) => r.id), ['t1', 'remote/t3']);
  assert.equal(rows[0].name, 'Shell 1');
  assert.equal(rows[0].active, true);
  assert.equal(rows[1].name, 'Build');
});

test('empty sessions do not invent a terminal', () => assert.deepEqual(terminalSessions([], []), []));
test('clock uses the old 24-hour panel format', () => assert.equal(clockText(new Date(2026, 10, 11, 2, 7)), '02:07'));

test('menu navigation wraps, skips separators, and enters at either end', () => {
  const items = [{ label: 'First' }, { sep: true }, { label: 'Last' }];
  assert.equal(nextMenuIndex(items, -1, 1), 0);
  assert.equal(nextMenuIndex(items, -1, -1), 2);
  assert.equal(nextMenuIndex(items, 0, 1), 2);
  assert.equal(nextMenuIndex(items, 2, 1), 0);
  assert.equal(nextMenuIndex([], -1, 1), -1);
  assert.equal(nextMenuIndex([{ sep: true }], -1, 1), -1);
});

test('reference profile reveals picture, opaque alternatives stay readable', () => {
  assert.deepEqual(profileLook('kde3'), { theme: 'kde3', terminal_opacity: 0 });
  for (const name of ['kde3-black', 'kde3-linux', 'kde3-paper']) assert.equal(profileLook(name).terminal_opacity, 1);
});

test('period chrome keeps the reference compact', () => {
  assert.equal(PANEL_HEIGHT, 36);
  assert.equal(LOOK.title, 23);
  assert.equal(LOOK.menubar, 22);
  assert.equal(LOOK.tabs, 27);
});
