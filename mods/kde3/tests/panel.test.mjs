import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const panel = source.slice(source.indexOf('  panel() {'), source.indexOf('  popup(cx) {'));

test('Kicker has no virtual-desktop pager or space creation/switching actions', () => {
  assert.doesNotMatch(panel, /desktop-\$\{index\}|space\.(?:select|new)|New terminal workspace/);
});

test('removing the pager preserves launchers, Show Desktop, window tasks and clock', () => {
  for (const control of ['k-menu', 'quick-home', 'quick-konsole', 'show-desktop', 'session-list', 'panel-settings']) {
    assert.ok(panel.includes(`'${control}'`), `Missing ${control}`);
  }
  assert.match(panel, /activateWindowTask\(s\.id\)/);
  assert.match(panel, /lcd\(clockText/);
});
