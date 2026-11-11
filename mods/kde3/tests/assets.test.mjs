import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PANEL_HEIGHT, LOOK } from '../model.mjs';
import { composeWindow } from '../windows-model.mjs';

const mod = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const home = resolve(mod, '../..');
const tree = JSON.parse(readFileSync(resolve(home, 'layouts/kde3.json')));
const nodes = new Map();
function collect(n) {
  assert.ok(!nodes.has(n.id), `Duplicate ID ${n.id}`);
  nodes.set(n.id, n);
  for (const child of n.children ?? []) collect(child);
}
collect(tree);

test('window title has its own full-width layout block and optional extra bars', () => {
  assert.equal(nodes.get('konsole').background, '#00000000');
  assert.equal(nodes.get('konsole').hidden, true, 'Legacy embedded frame must not duplicate floating terminals');
  assert.equal(nodes.get('title').size.px, LOOK.title);
  assert.equal(nodes.get('title').content.props.role, 'title');
  assert.equal(nodes.get('toolbar').hidden, true);
  assert.equal(nodes.get('status').hidden, true);
  assert.equal(nodes.get('kicker').size.px, PANEL_HEIGHT);
});

test('scroll controls sit left of the real terminal and picture exists', () => {
  const native = composeWindow({ id: 'qa', terminals: ['tQA'] }, {}, {});
  const body = native.children.find((n) => n.id === 'body');
  assert.deepEqual(body.children.map((n) => n.id), ['edge-left', 'scrollbar', 'terminals', 'edge-right']);
  const terminal = body.children[2].children[0];
  assert.equal(terminal.content.terminal, 'tQA');
  assert.ok(existsSync(resolve(home, terminal.background.image)));
  assert.ok(existsSync(resolve(home, tree.background.image)));
});

test('the hidden desktop scaffold cannot compete with overlay terminals for size or focus', () => {
  assert.ok([...nodes.values()].every((n) => !n.content?.tab && !n.content?.terminal));
});

test('historical artwork preserves original dimensions, bytes and attribution', () => {
  const manifest = JSON.parse(readFileSync(resolve(mod, 'icons/period/manifest.json')));
  assert.equal(manifest.length, 22);
  for (const icon of ['konsole', 'home', 'desktop', 'sessions', 'kmenu', 'new', 'configure', 'help', 'exit', 'split-right', 'split-down']) {
    for (const size of [16, 32]) {
      const path = `icons/period/${icon}-${size}.png`;
      const original = manifest.find((asset) => asset.path === path);
      assert.ok(original, `Missing original artwork record: ${path}`);
      const bytes = readFileSync(resolve(mod, path));
      assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
      assert.equal(bytes.readUInt32BE(16), original.width);
      assert.equal(bytes.readUInt32BE(20), original.height);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), original.sha256);
    }
  }
  assert.ok(existsSync(resolve(mod, 'COPYING-KDE-ASSETS')));
  assert.match(readFileSync(resolve(mod, 'ASSETS.md'), 'utf8'), /download\.kde\.org/);
});

test('Moheli assets retain source attribution and all focus/control states', () => {
  const manifest = JSON.parse(readFileSync(resolve(mod, 'icons/moheli/manifest.json')));
  for (const name of ['top-left-active', 'top-right-inactive', 'shade-active', 'shade-toggled-active', 'shade-pressed', 'hide-active', 'hide-inactive', 'maximize-toggled-active', 'close-inactive']) {
    const asset = manifest.find((it) => it.name === name);
    assert.ok(asset, name);
    const data = readFileSync(resolve(mod, `icons/moheli/${name}.svg`));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.svg_sha256);
  }
  assert.notEqual(readFileSync(resolve(mod, 'icons/moheli/title-3-active.svg'), 'utf8'), readFileSync(resolve(mod, 'icons/moheli/title-3-inactive.svg'), 'utf8'));
  assert.match(readFileSync(resolve(mod, 'icons/moheli/README.md'), 'utf8'), /Olivier Fourdan/);
});
