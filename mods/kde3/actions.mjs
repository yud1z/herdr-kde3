// Keep deferred work out of a popup that is about to be destroyed.
export function activateMenuItem(item, { run, perform, close }) {
  if (!item || item.sep) return;
  if (item.target === undefined) run(`kde3.${item.command}`);
  else perform(item.command, item.target);
  close();
}
