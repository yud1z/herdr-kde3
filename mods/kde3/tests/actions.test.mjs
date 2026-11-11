import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateMenuItem } from '../actions.mjs';

test('profile selections are queued to the persistent desktop before closing the popup', () => {
  for (const command of ['picture', 'black', 'linux', 'paper']) {
    const events = [];
    activateMenuItem({ command }, {
      run: (name) => events.push(['dispatch', name]),
      perform: () => assert.fail('Async profile must not run in the short-lived popup'),
      close: () => events.push(['close']),
    });
    assert.deepEqual(events, [['dispatch', `kde3.${command}`], ['close']]);
  }
});

test('a queued action still runs after its popup context is disposed', async () => {
  const queue = [];
  let popupAlive = true;
  let applied = false;
  activateMenuItem({ command: 'black' }, {
    run: (name) => queue.push(async () => {
      assert.equal(name, 'kde3.black');
      assert.equal(popupAlive, false);
      await Promise.resolve();
      applied = true;
    }),
    perform: () => assert.fail('Popup cannot own deferred work'),
    close: () => { popupAlive = false; },
  });
  await queue[0]();
  assert.equal(applied, true);
});

test('targeted session/layout actions preserve their target before closing', () => {
  for (const target of [{ id: 'remote/tab', space: 'remote/space' }, 'snowleopard']) {
    const events = [];
    activateMenuItem({ command: 'select', target }, {
      run: () => assert.fail('Targeted action must retain its payload'),
      perform: (...args) => events.push(args),
      close: () => events.push(['close']),
    });
    assert.deepEqual(events, [['select', target], ['close']]);
  }
});

test('empty items and separators do not dispatch or dismiss anything', () => {
  const fail = () => assert.fail('Inactive menu item performed an action');
  for (const item of [null, undefined, { sep: true }]) activateMenuItem(item, { run: fail, perform: fail, close: fail });
});
