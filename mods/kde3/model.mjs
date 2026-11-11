// Pure layout/session rules, shared with the regression tests.
export const PANEL_HEIGHT = 36;
export const MENU_ROW = 23;
export const LOOK = { title: 23, menubar: 22, toolbar: 29, tabs: 27, status: 20 };
export const FRAME_EDGE = 4;

export function decorationState(appActive, dialogOpen = false) {
  return appActive && !dialogOpen ? 'active' : 'inactive';
}

export function displayFrame(frame, shaded = false) {
  return { ...frame, h: shaded ? LOOK.title + FRAME_EDGE : frame.h };
}

export function profileLook(name) {
  return { theme: name, terminal_opacity: name === 'kde3' ? 0 : 1 };
}

export function clampFrame(frame, viewport, shaded = false) {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height - PANEL_HEIGHT);
  const w = Math.round(Math.min(width - Math.min(8, width - 1), Math.max(Math.min(500, width), frame.w)));
  const h = Math.round(Math.min(height - Math.min(8, height - 1), Math.max(Math.min(280, height), frame.h)));
  const visibleHeight = shaded ? Math.min(height, LOOK.title + FRAME_EDGE) : h;
  return {
    x: Math.round(Math.max(0, Math.min(width - w, frame.x))),
    y: Math.round(Math.max(0, Math.min(height - visibleHeight, frame.y))),
    w, h,
  };
}

export function defaultFrame(viewport) {
  return clampFrame({ x: viewport.width * 0.15, y: 90, w: viewport.width * 0.78, h: viewport.height * 0.73 }, viewport);
}

export function terminalSessions(spaces, panes) {
  const terminalTabs = new Set(panes.filter((p) => p.terminal && !p.mod).map((p) => p.tab));
  return spaces.flatMap((space) => space.tabs.filter((tab) => terminalTabs.has(tab.id)).map((tab) => ({
    id: tab.id, space: space.id, workspace: space.name, machine: space.machine,
    name: tab.named ? tab.name : `Shell ${tab.index}`,
    active: space.active && tab.active, status: tab.status,
  })));
}

export function clockText(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function nextMenuIndex(items, current, direction) {
  if (!items.length) return -1;
  let index = current < 0 ? (direction > 0 ? -1 : 0) : current;
  for (let n = 0; n < items.length; n++) {
    index = (index + direction + items.length) % items.length;
    if (!items[index].sep) return index;
  }
  return -1;
}
