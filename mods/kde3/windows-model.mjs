import { LOOK, FRAME_EDGE, PANEL_HEIGHT, displayFrame, clampFrame } from './model.mjs';

export function snapFrame(side, viewport) {
  if (side === 'top') return { x: 2, y: 2, w: viewport.width - 4, h: viewport.height - PANEL_HEIGHT - 4 };
  const width = Math.max(2, Math.round(viewport.width));
  const half = Math.floor(width / 2);
  return { x: side === 'right' ? half : 0, y: 0,
    w: side === 'right' ? width - half : half,
    h: Math.max(1, Math.round(viewport.height - PANEL_HEIGHT)) };
}

export function snapEdge(pointer, viewport) {
  if (pointer.y >= viewport.height - PANEL_HEIGHT) return null;
  const threshold = Math.min(16, viewport.width / 4);
  if (pointer.y <= threshold) return 'top';
  return pointer.x <= threshold ? 'left' : pointer.x >= viewport.width - threshold ? 'right' : null;
}

export function dragRestoreFrame(state, pointer, viewport) {
  if (!state.big && !state.snap) return { ...state.frame };
  const shown = shownWindowFrame({ ...state, shaded: false }, viewport);
  const ratio = Math.max(0, Math.min(1, (pointer.x - shown.x) / shown.w));
  return clampFrame({ ...state.frame, x: pointer.x - state.frame.w * ratio,
    y: pointer.y - Math.min(Math.max(0, pointer.y - shown.y), state.frame.h - 1) }, viewport, Boolean(state.shaded));
}

export function terminalCaption(tab, pane, terminal) {
  const clean = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 512);
  // Pane titles include synthetic address fallbacks; program names are display
  // categories (e.g. htop -> Activity). Prefer the core's unmodified fields.
  const title = clean(terminal?.title ?? pane?.title);
  const program = pane?.program && !pane.program.shell
    ? clean(terminal?.foreground?.name) || clean(pane.program.name) : '';
  const running = program && !/^(program|unknown)$/i.test(program) ? program : '';
  const folder = clean(terminal?.cwd ?? pane?.cwd).replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  let caption = title || running || folder || 'Shell';
  if (running && title && !title.toLowerCase().includes(running.toLowerCase())) caption = `${running} — ${title}`;
  const name = clean(tab?.name);
  const custom = tab?.named && name && !/^Shell(?: \d+)?$/i.test(name);
  return custom && name !== caption ? `${name} — ${caption}` : caption;
}

export function windowFocusId(windows, paneList, terminal, fallback) {
  const tab = paneList.find((pane) => pane.terminal === terminal)?.tab;
  const owner = tab && Object.keys(windows).find((id) => id === tab || windows[id].tabs?.includes(tab));
  if (owner && !windows[owner].min) return owner;
  if (fallback && windows[fallback] && !windows[fallback].min) return fallback;
  return Object.keys(windows).find((id) => !windows[id].min) ?? null;
}

export function initialWindowFrame(index, viewport) {
  return clampFrame({ x: 90 + index * 60, y: 85 + index * 48,
    w: Math.min(860, viewport.width * 0.65), h: Math.min(560, viewport.height * 0.65) }, viewport);
}

export function composeWindow(tab, state, look) {
  const mod = (id, role, height, extra = {}) => ({ id, type: 'block',
    ...(height ? { size: { px: height } } : {}),
    content: { mod: 'kde3', props: { role, tab: tab.id, ...extra } } });
  const edge = (part) => ({ ...mod(`edge-${part}`, 'frame', 0, { part }), size: { px: FRAME_EDGE } });
  const terminal = (address, index) => ({ id: `terminal-${index}`, type: 'block',
    background: { image: 'mods/kde3/konsole-blue.svg', fit: 'cover' },
    content: { terminal: address } });
  return { id: `window-${tab.id}`, type: 'column', resizable: false,
    background: '#00000000', shadow: 'lg', theme: look.theme,
    font: look.font, font_size: look.font_size, ui_font: look.ui_font,
    terminal_padding: look.terminal_padding, terminal_opacity: look.terminal_opacity,
    children: [mod('title', 'floating-title', LOOK.title),
      ...(!state.shaded ? [mod('menu', 'floating-menu', LOOK.menubar),
        ...(state.toolbar ? [mod('toolbar', 'floating-toolbar', LOOK.toolbar)] : []),
        { id: 'body', type: 'row', resizable: false, children: [edge('left'),
          { ...mod('scrollbar', 'scrollbar', 0), size: { px: 14 } },
          { id: 'terminals', type: state.axis === 'down' ? 'column' : 'row',
            gap: 3, children: tab.terminals.map(terminal) }, edge('right')] },
        mod('bar', 'floating-bar', LOOK.tabs)] : []),
      mod('bottom', 'frame', FRAME_EDGE, { part: 'bottom' })] };
}

export const windowSignature = (terminals, state, look) => JSON.stringify([
  terminals, look.theme, look.terminal_opacity, look.font, look.font_size,
  look.ui_font, look.terminal_padding, state?.axis, state?.activeTab,
]);

export const shownWindowFrame = (state, viewport) => displayFrame(
  state.big ? snapFrame('top', viewport)
    : state.snap ? snapFrame(state.snap, viewport)
      : clampFrame(state.frame, viewport, Boolean(state.shaded)), state.shaded);
