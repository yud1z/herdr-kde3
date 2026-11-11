import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terminalCaption } from '../windows-model.mjs';

test('automatic Shell tabs follow the terminal OSC title', () => {
  assert.equal(terminalCaption({ name: 'Shell', named: true }, { title: 'vim main.js', program: { name: 'Vim', shell: false } }), 'vim main.js');
  assert.equal(terminalCaption({ name: 'Shell 2', named: true }, { title: 'user@host: ~/project', program: { name: 'zsh', shell: true } }), 'user@host: ~/project');
});

test('foreground program is visible even when the shell leaves its old title behind', () => {
  assert.equal(terminalCaption({ name: 'Shell', named: true }, { title: '~/project', program: { name: 'sleep', shell: false } }), 'sleep — ~/project');
  assert.equal(terminalCaption({ name: '1', named: false }, { title: '', program: { name: 'Python', shell: false } }), 'Python');
});

test('a custom tab name remains as a prefix without hiding the running command', () => {
  assert.equal(terminalCaption({ name: 'Build', named: true }, { title: 'make test', program: { name: 'make', shell: false } }), 'Build — make test');
  assert.equal(terminalCaption({ name: 'Build', named: true }, { title: 'Build' }), 'Build');
});

test('idle title falls back to directory or shell and strips control characters', () => {
  assert.equal(terminalCaption({ name: 'Shell' }, { title: '', cwd: '/example/project', program: { name: 'zsh', shell: true } }), 'project');
  assert.equal(terminalCaption({ name: 'Shell' }, { title: 'hi\nthere\u0007' }), 'hi there');
  assert.equal(terminalCaption(null, null), 'Shell');
});

test('htop uses the actual foreground process, not the Activity display category', () => {
  const pane = { title: 't1c', program: { key: 'activity', name: 'Activity', shell: false } };
  const terminal = { title: '', cwd: '/example', foreground: { name: 'htop', argv: ['htop'] } };
  assert.equal(terminalCaption({ name: 'Shell', named: true }, pane, terminal), 'htop');
  assert.equal(terminalCaption({ name: 'Monitor', named: true }, pane, terminal), 'Monitor — htop');
});

test('raw OSC title is retained alongside the real process name', () => {
  const pane = { title: 'Metrics', program: { name: 'Activity', shell: false } };
  assert.equal(terminalCaption(null, pane, { title: 'Metrics', foreground: { name: 'htop' } }), 'htop — Metrics');
});

test('returning to the shell removes the foreground command and address fallback', () => {
  const pane = { title: 't1c', program: { name: 'zsh', shell: true } };
  assert.equal(terminalCaption(null, pane, { title: '', cwd: '/example/project', foreground: { name: 'zsh' } }), 'project');
});
