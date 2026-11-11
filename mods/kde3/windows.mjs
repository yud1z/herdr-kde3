// Independent native Herdr windows. The model tabs/terminals remain core-owned.
import { spaces, panes, terminals, focused, layout, shared, setShared, openOverlay, closeOverlay, run } from 'herdr';
import { initialWindowFrame, composeWindow, windowFocusId, shownWindowFrame, windowSignature, terminalCaption } from './windows-model.mjs';
import { clampFrame } from './model.mjs';

export const windows = () => shared('kde3.windows') ?? {};
const viewport = () => window.viewport_size();
const save = (id, change) => setShared('kde3.windows', { ...windows(), [id]: { ...windows()[id], ...change } });
const close = (id) => { if (id) closeOverlay(id); };

export function tabWindow(id) {
  for (const space of spaces()) {
    const tab = space.tabs.find((t) => t.id === id);
    if (tab) {
      const list = panes().filter((p) => p.tab === id && p.terminal);
      const zoomed = list.find((p) => p.zoomed);
      return { ...tab, space: space.id, machine: space.machine, terminals: (zoomed ? [zoomed] : list).map((p) => p.terminal) };
    }
  }
  return null;
}

export function activeWindowId() {
  const wanted = shared('kde3.focusedWindow');
  const state = windows()[wanted];
  if (state && !state.min && (state.focusPending || state.shaded)) return wanted;
  return windowFocusId(windows(), panes(), focused()?.terminal, shared('kde3.focusedWindow'));
}

export function windowInfo(id) {
  const state = windows()[id];
  const sessions = (state?.tabs ?? [id]).map(tabWindow).filter((tab) => tab?.terminals.length);
  const active = sessions.find((tab) => tab.id === state?.activeTab) ?? sessions[0];
  return active ? { ...active, id, sessionId: active.id, sessions } : null;
}

export function windowTasks() {
  const rank = { blocked: 0, done: 1, working: 2, idle: 3 };
  return Object.keys(windows()).map(windowInfo).filter(Boolean).map((info) => ({
    id: info.id, name: windowCaption(info.id), workspace: spaces().find((s) => s.id === info.space)?.name ?? '',
    machine: info.machine, tabs: info.sessions.length,
    status: info.sessions.map((tab) => tab.status).filter(Boolean).sort((a, b) => rank[a] - rank[b])[0] ?? null,
  }));
}

export function windowCaption(id) {
  const info = windowInfo(id);
  const pane = modelPane(id);
  return terminalCaption(info, pane, terminals().find((t) => t.address === pane?.terminal));
}

const signatureFor = (info, state, look) => windowSignature(info.terminals, state, look);

export function rememberWindow(id, overlay) {
  if (windows()[id] && windows()[id].overlay !== overlay) save(id, { overlay });
}

export function markWindowFocus(id) {
  if (shared('kde3.focusedWindow') !== id) setShared('kde3.focusedWindow', id);
  const tab = windowInfo(id);
  const selected = modelPane(id)?.terminal;
  if (tab?.terminals.length && !windows()[id]?.shaded) {
    run('pane.focus', { terminal: tab.terminals.includes(selected) ? selected : tab.terminals[0] });
  }
}

function requestWindowFocus(id) {
  if (!windows()[id]) return;
  setShared('kde3.focusedWindow', id);
  save(id, { focusPending: windows()[id].shaded ? null : windows()[id].overlay });
}

// The newly opened layout isn't a focus target until it has been laid out.
// An immediate pane.focus falls back to the hidden core pane/previous terminal.
export function finishWindowFocus(id, overlay) {
  const state = windows()[id];
  if (!overlay || state?.focusPending !== overlay || state.min || state.shaded
    || shared('kde3.focusedWindow') !== id) return;
  markWindowFocus(id);
  save(id, { focusPending: null });
}

export function openWindow(id, change = {}, newGeometry = false) {
  const tab = windowInfo(id);
  if (!tab?.terminals.length) return;
  const previous = windows()[id];
  const state = { frame: initialWindowFrame(Object.keys(windows()).length, viewport()),
    revision: 0, min: false, big: false, shaded: false, tabs: [tab.sessionId], activeTab: tab.sessionId,
    ...previous, ...change };
  if (newGeometry) state.revision++;
  // Keep persisted coordinates equal to the visible position, including when a
  // title at the bottom is expanded and the full window must move upward to fit.
  if (!state.big) state.frame = clampFrame(state.frame, viewport(), Boolean(state.shaded));
  state.snapViewport = state.snap ? `${viewport().width}x${viewport().height}` : null;
  const look = layout();
  const shown = shownWindowFrame(state, viewport());
  const signature = signatureFor(tab, state, look);
  // Record state first so the new title copy can resolve its own controls/focus.
  save(id, { ...state, min: false, signature });
  // Reopening the same key replaces it in place. Explicitly closing first tears
  // down the frame and terminal view between tabs, producing a visible blink.
  const overlay = openOverlay({ kind: 'window', frame: 'none', keep: true,
    key: `kde3-window-${id}-${state.revision}`, width: shown.w, height: shown.h,
    at: { x: shown.x, y: shown.y }, layout: composeWindow(tab, state, look) });
  if (newGeometry && previous?.overlay !== overlay) close(previous?.overlay);
  save(id, { overlay });
  return overlay;
}

export function raiseWindow(id) {
  if (!windowInfo(id)) return;
  // Terminal focus alone doesn't reorder native windows. The keyed replacement
  // is needed for taskbar activation to actually bring a covered window forward.
  openWindow(id, { min: false });
  requestWindowFocus(id);
}

export function minimizeWindow(id) {
  const w = windows()[id];
  if (!w) return;
  save(id, { min: true, overlay: null, focusPending: null });
  close(w.overlay);
}

export function activateWindowTask(id) {
  if (activeWindowId() === id && !windows()[id]?.min) minimizeWindow(id);
  else raiseWindow(id);
}

export function shadeWindow(id, on = !windows()[id]?.shaded) {
  if (windows()[id]) { openWindow(id, { shaded: on }, true); requestWindowFocus(id); }
}

export function maximizeWindow(id) {
  if (windows()[id]) { openWindow(id, { big: !windows()[id].big, shaded: false }, true); requestWindowFocus(id); }
}

export function snapWindow(id, side) {
  if (!windows()[id] || !['left', 'right', 'top', null].includes(side)) return;
  // Keep frame as the normal restore geometry; snapping is a presentation mode.
  openWindow(id, side === 'top' ? { big: true, shaded: false } : { snap: side, big: false, shaded: false }, true);
  requestWindowFocus(id);
}

export function moveWindow(id, frame) {
  if (windows()[id]) { openWindow(id, { frame, big: false, snap: null }, true); requestWindowFocus(id); }
}

export function toggleWindowToolbar(id) {
  if (windows()[id]) openWindow(id, { toolbar: !windows()[id].toolbar }, true);
}

export function selectWindowTab(id, sessionId) {
  if (!windows()[id]?.tabs?.includes(sessionId)) return;
  if (windows()[id].activeTab !== sessionId) {
    save(id, { activeTab: sessionId });
    // This is a composition terminal, not the hidden desktop's model tab.
    // Selecting both causes competing terminal sizing/focus during the switch.
    raiseWindow(id);
  } else {
    markWindowFocus(id);
  }
}

export function newWindowTab(id) {
  const info = windowInfo(id);
  if (!info) return false;
  const marker = `kde3-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setShared('kde3.pendingTabs', [...(shared('kde3.pendingTabs') ?? []), { window: id, name: marker }]);
  try {
    run('tab.new', { space: info.space, name: marker, ...(modelPane(id)?.cwd ? { folder: modelPane(id).cwd } : {}) });
  } catch (error) {
    setShared('kde3.pendingTabs', (shared('kde3.pendingTabs') ?? []).filter((request) => request.name !== marker));
    throw error;
  }
  syncWindows();
  return true;
}

export function windowFrame(id) {
  const w = windows()[id];
  if (!w) return null;
  return shownWindowFrame({ ...w, shaded: false }, viewport());
}

export function modelPane(id) {
  const session = windowInfo(id)?.sessionId;
  return panes().find((p) => p.tab === session && p.terminal === focused()?.terminal)
    ?? panes().find((p) => p.tab === session && p.focused)
    ?? panes().find((p) => p.tab === session && p.terminal);
}

export function splitWindow(id, direction) {
  const pane = modelPane(id);
  if (!pane) return;
  save(id, { axis: direction });
  run('pane.split', { pane: pane.pane, direction });
}

export function syncWindows() {
  const all = spaces();
  if (!all.length) return; // Core state can be transiently empty during reconnect/quit.
  const look = layout();
  const live = new Map(all.flatMap((space) => space.tabs.map((tab) => tabWindow(tab.id)))
    .filter((tab) => tab?.terminals.length).map((tab) => [tab.id, tab]));
  // Repair tab membership after a session exits. Window identity need not equal
  // its first tab forever: closing that tab must not orphan the remaining ones.
  for (const [id, state] of Object.entries(windows())) {
    const tabs = (state.tabs ?? [id]).filter((tab) => live.has(tab));
    if (!tabs.length) { close(state.overlay); continue; }
    const activeTab = tabs.includes(state.activeTab) ? state.activeTab : tabs[0];
    if (JSON.stringify(tabs) !== JSON.stringify(state.tabs) || activeTab !== state.activeTab) save(id, { tabs, activeTab });
  }
  const pending = shared('kde3.pendingTabs') ?? [];
  const remaining = [];
  const focusAfter = new Set();
  for (const request of pending) {
    const session = [...live.values()].find((tab) => tab.name === request.name);
    if (!windows()[request.window]) continue;
    if (!session) { remaining.push(request); continue; }
    const state = windows()[request.window];
    const tabs = [...new Set([...(state.tabs ?? [request.window]), session.id])];
    save(request.window, { tabs, activeTab: session.id, shaded: false, min: false });
    run('tab.rename', { id: session.id, name: `Shell ${tabs.length}` });
    focusAfter.add(request.window);
  }
  if (remaining.length !== pending.length) setShared('kde3.pendingTabs', remaining);
  const owned = new Set(Object.values(windows()).flatMap((state) => state.tabs ?? []));
  for (const space of all) for (const tab of space.tabs) {
    if (!live.has(tab.id) || owned.has(tab.id)) continue;
    openWindow(tab.id);
    if (space.active && tab.active) requestWindowFocus(tab.id);
  }
  for (const [id, state] of Object.entries(windows())) {
    const info = windowInfo(id);
    if (!info || state.min) continue;
    if (state.snap && state.snapViewport !== `${viewport().width}x${viewport().height}`) openWindow(id, {}, true);
    else if (signatureFor(info, state, look) !== state.signature) openWindow(id);
  }
  for (const id of focusAfter) requestWindowFocus(id);
  const stale = Object.entries(windows()).filter(([id]) => !windowInfo(id));
  if (stale.length) {
    for (const [, state] of stale) close(state.overlay);
    setShared('kde3.windows', Object.fromEntries(Object.entries(windows()).filter(([id]) => windowInfo(id))));
  }
}
