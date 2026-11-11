// KDE3 / Knoppix-inspired desktop. Only its own layout is read/written for profiles.
import { View, div, image } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { props, spaces, panes, focused, home, appHome, readTextFile, writeTextFile, layout, layouts, run, shared, setShared, openOverlay, closeOverlay, nextCommand, window as appWindow } from 'herdr';
import { A, C, base, bevel, button, gradient, grip, icon, rule, lcd, MOHELI, moheliCaption, moheliControl, moheliImage } from './ui.js';
import { PANEL_HEIGHT, MENU_ROW, LOOK, FRAME_EDGE, clampFrame, defaultFrame, terminalSessions, clockText, nextMenuIndex, profileLook, decorationState, displayFrame } from './model.mjs';
import { activateMenuItem } from './actions.mjs';
import { snapEdge, snapFrame, dragRestoreFrame } from './windows-model.mjs';
import { windows, tabWindow, activeWindowId, rememberWindow, markWindowFocus, raiseWindow, minimizeWindow,
  shadeWindow, maximizeWindow, moveWindow, windowFrame, modelPane, splitWindow, syncWindows, toggleWindowToolbar,
  windowInfo, windowTasks, windowCaption, newWindowTab, selectWindowTab, finishWindowFocus, activateWindowTask, snapWindow } from './windows.mjs';

const sessions = () => terminalSessions(spaces(), panes());
const activeTab = () => spaces().find((s) => s.active)?.tabs.find((t) => t.active);
const viewport = () => window.viewport_size();
const hidden = () => Boolean(shared('kde3.hidden'));
const frame = () => shared('kde3.frame') ?? defaultFrame(viewport());
const maximizedFrame = () => ({ x: 2, y: 2, w: viewport().width - 4, h: viewport().height - PANEL_HEIGHT - 4 });
const fullFrame = () => shared('kde3.maximized') ? maximizedFrame() : clampFrame(frame(), viewport());
const shaded = () => Boolean(shared('kde3.shaded'));
const mainDecorationState = () => decorationState(appWindow()?.active, Boolean(shared('kde3.dialog')));
const ownerDecorationState = (id = props()?.tab) => decorationState(appWindow()?.active,
  Boolean(shared('kde3.dialog')) || Boolean(id && activeWindowId() !== id));

function place(f) {
  const shown = displayFrame(f, shaded());
  for (const [id, px] of [['desk-top', shown.y], ['desk-left', shown.x], ['konsole', shown.w], ['desk-row', shown.h]]) run('layout.resize', { id, px });
}

function setShaded(on) {
  setShared('kde3.shaded', on);
  run(on ? 'layout.hide' : 'layout.show', { id: 'konsole-body' });
  place(fullFrame());
}

function reveal() {
  syncWindows();
}

function minimize() {
  setShared('kde3.hidden', true);
  run('layout.hide', { id: 'konsole' });
}

function selectSession(row) {
  raiseWindow(row.id);
}

function launch(atHome = false) {
  const owner = windowInfo(props()?.tab ?? activeWindowId());
  const cwd = modelPane(owner?.id)?.cwd;
  // Omit argv: herdr-core starts the user's default shell, never a hard-coded program.
  if (!spaces().length || (atHome && (owner?.machine ?? spaces().find((s) => s.active)?.machine))) {
    run('space.new', { name: 'Desktop', machine: '', ...(atHome ? { folder: home() } : {}) });
  } else run('tab.new', { name: 'Shell', ...(owner ? { space: owner.space } : {}),
    ...(atHome ? { folder: home() } : cwd ? { folder: cwd } : {}) });
  reveal();
}

function maximize() {
  if (shaded()) setShaded(false);
  const on = !shared('kde3.maximized');
  setShared('kde3.maximized', on);
  place(on ? maximizedFrame() : clampFrame(frame(), viewport()));
}

function closeSession(id = props()?.tab ?? activeWindowId()) {
  const session = windowInfo(id)?.sessionId;
  if (session) openDialog('confirm', { tab: session }, 410, 170);
}

function closeWindow(id = props()?.tab ?? activeWindowId()) {
  const tabs = windowInfo(id)?.sessions.map((tab) => tab.id);
  if (tabs?.length) openDialog('confirm', { window: id, tabs }, 410, 190);
}

function openDialog(role, extra = {}, width = 430, height = 210) {
  const id = openOverlay({ mod: 'kde3', kind: 'dialog', frame: 'none', width, height,
    props: { role, ...extra } });
  setShared('kde3.dialog', id);
}

const menuHeight = (items, title = '') => Math.min(560, 8 + (title ? 26 : 0) + items.reduce((n, it) => n + (it.sep ? 7 : MENU_ROW), 0));
function menu(items, at, title = '', kmenu = false) {
  const owner = props()?.tab;
  const targeted = new Set(['newtab', 'close', 'closewindow', 'minimize', 'maximize', 'shade', 'rollup', 'rolldown', 'rename', 'split-right', 'split-down', 'zoom', 'toolbar', 'snap-left', 'snap-right', 'restore-window']);
  if (owner) items = items.map((it) => targeted.has(it.command) && it.target === undefined ? { ...it, target: { window: owner } } : it);
  openOverlay({ mod: 'kde3', kind: 'popup', frame: 'none', width: kmenu ? 248 : 252,
    height: menuHeight(items, title), at, props: { role: 'menu', title, items, kmenu } });
}

const item = (label, command, extra = {}) => ({ label, command, ...extra });
const sessionMenu = () => windowTasks().map((s) => item(`${s.name} — ${s.workspace}${s.tabs > 1 ? ` (${s.tabs} tabs)` : ''}`, 'select', { target: s, checked: activeWindowId() === s.id, icon: 'konsole' }));
const layoutMenu = () => layouts().map((name) => item(name === 'kde3' ? 'KDE 3 — Konsole Desktop' : name, 'layout', { target: name, checked: name === 'kde3' }));
const windowMenu = () => [item(windows()[props()?.tab ?? activeWindowId()]?.shaded ? 'Roll Down' : 'Roll Up', 'shade'), item('Minimize', 'minimize'), item('Maximize / Restore', 'maximize'),
  item('Snap Left Half', 'snap-left'), item('Snap Right Half', 'snap-right'), item('Restore Window Size', 'restore-window'), { sep: true }, item('Close Window…', 'closewindow')];

function itemsFor(name) {
  switch (name) {
    case 'K': return [item('Konsole — Terminal Emulator', 'launch', { icon: 'konsole', shortcut: '⌘T' }), item('Terminal at Home', 'home', { icon: 'home' }),
      { sep: true }, ...sessionMenu(), { sep: true }, item('Show Desktop', 'desktop', { icon: 'desktop' }), item('Configure Desktop…', 'layouts', { icon: 'configure' }), item('About KDE Desktop', 'about', { icon: 'help' })];
    case 'Session': return [item('New Tab', 'newtab', { icon: 'new', shortcut: '⌘T' }), item('New Konsole Window', 'launch', { icon: 'konsole', shortcut: '⌘⇧N' }), item('Terminal at Home', 'home', { icon: 'home' }), { sep: true },
      item('Rename Session…', 'rename'), ...sessionMenu(), { sep: true }, item('Close Session…', 'close', { shortcut: '⌘W' })];
    case 'Edit': return [item('Copy', 'copy', { shortcut: '⌘C' }), item('Paste', 'paste', { shortcut: '⌘V' }), { sep: true }, item('Find in Terminal…', 'search', { shortcut: '⌘F' })];
    case 'View': return [item('Snap Left Half', 'snap-left'), item('Snap Right Half', 'snap-right'), item('Restore Window Size', 'restore-window'), { sep: true },
      item('Split Vertically', 'split-right'), item('Split Horizontally', 'split-down'), item('Zoom Active Pane', 'zoom'), { sep: true },
      item('Larger Text', 'larger'), item('Smaller Text', 'smaller'), { sep: true }, item('Show Toolbar', 'toolbar', { checked: Boolean(windows()[props()?.tab ?? activeWindowId()]?.toolbar) }), item(windows()[props()?.tab ?? activeWindowId()]?.shaded ? 'Roll Down Window' : 'Roll Up Window', 'shade'), item('Maximize / Restore Window', 'maximize'), item('Show Desktop', 'desktop')];
    case 'Settings': return [item('KDE Picture (Reference)', 'picture', { checked: layout().theme === 'kde3' }), item('Konsole Black', 'black', { checked: layout().theme === 'kde3-black' }), item('Linux Console', 'linux', { checked: layout().theme === 'kde3-linux' }), item('Paper Terminal', 'paper', { checked: layout().theme === 'kde3-paper' }),
      { sep: true }, item('Herdr Settings…', 'settings'), item('Switch Layout…', 'layouts')];
    case 'Help': return [item('About This Desktop', 'about'), item('Herdr Help', 'help')];
    default: return [];
  }
}

async function setProfile(name) {
  // Sending the full nested desktop through run(layout.set) exceeds the host's
  // argument-depth limit. Edit only our layout's root look, with a stale-write guard.
  const path = `${appHome()}/layouts/kde3.json`;
  const before = await readTextFile(path);
  if (!before) throw new Error('The KDE3 layout file is missing.');
  const root = { ...JSON.parse(before), ...profileLook(name) };
  await writeTextFile(path, JSON.stringify(root, null, 2) + '\n', before);
}

async function perform(command, target) {
  const id = target?.window ?? props()?.tab ?? activeWindowId();
  const commands = {
    launch: () => launch(), home: () => launch(true), minimize: () => minimizeWindow(id), maximize: () => maximizeWindow(id), close: () => closeSession(id),
    newtab: () => newWindowTab(id) || launch(), closewindow: () => closeWindow(id),
    'snap-left': () => snapWindow(id, 'left'), 'snap-right': () => snapWindow(id, 'right'), 'restore-window': () => snapWindow(id, null),
    shade: () => shadeWindow(id), rollup: () => shadeWindow(id, true), rolldown: () => shadeWindow(id, false),
    desktop: () => {
      const all = Object.entries(windows());
      if (all.some(([, state]) => !state.min)) for (const [tab] of all) minimizeWindow(tab);
      else for (const [tab] of all) raiseWindow(tab);
    }, select: () => selectSession(target),
    layouts: () => menu(layoutMenu(), undefined, 'Choose a desktop'), layout: () => run('layout.switch', { name: target }),
    rename: () => windowInfo(id) && run('tab.rename', { id: windowInfo(id).sessionId }),
    copy: () => run('terminal.copy'), paste: () => run('terminal.paste'), search: () => run('terminal.search'),
    'split-right': () => splitWindow(id, 'right'), 'split-down': () => splitWindow(id, 'down'),
    zoom: () => modelPane(id) && run('pane.zoom', { pane: modelPane(id).pane }),
    larger: () => run('app.zoom_in'), smaller: () => run('app.zoom_out'), settings: () => run('app.settings'), help: () => run('app.help'),
    picture: () => setProfile('kde3'), black: () => setProfile('kde3-black'),
    linux: () => setProfile('kde3-linux'), paper: () => setProfile('kde3-paper'),
    toolbar: () => toggleWindowToolbar(id),
    about: () => openDialog('about'),
    menu: () => menu(itemsFor('K'), { x: 1, y: Math.max(0, viewport().height - PANEL_HEIGHT - menuHeight(itemsFor('K'))) }, '', true),
  };
  try {
    await commands[command]?.();
    if (shared('kde3.lastCommandError')) setShared('kde3.lastCommandError', null);
  } catch (error) {
    console.log(`kde3: ${command}: ${error}`);
    setShared('kde3.lastCommandError', `${command}: ${error}`);
  }
}

function startDrag(e, mode, owner = null) {
  if (owner) {
    const state = windows()[owner];
    if (!state || (state.shaded && mode === 'resize')) return;
    markWindowFocus(owner);
    if (e.click_count > 1) return maximizeWindow(owner);
    openOverlay({ mod: 'kde3', kind: 'window', frame: 'none', width: viewport().width, height: viewport().height,
      at: { x: 0, y: 0 }, props: { role: 'drag', mode, start: e.position, frame: windowFrame(owner),
        restoreFrame: dragRestoreFrame(state, e.position, viewport()), shaded: Boolean(state.shaded), window: owner } });
    return;
  }
  if (shaded() && mode === 'resize') return;
  if (e.click_count > 1) return maximize();
  const f = shared('kde3.maximized') ? maximizedFrame() : frame();
  openOverlay({ mod: 'kde3', kind: 'window', frame: 'none', width: viewport().width, height: viewport().height,
    at: { x: 0, y: 0 }, props: { role: 'drag', mode, start: e.position, frame: f, shaded: shaded() } });
}

function titleStrip(title, owner, controls = true) {
  const tab = props()?.tab;
  const state = controls ? ownerDecorationState(tab) : decorationState(appWindow()?.active);
  const windowState = windows()[tab] ?? {};
  const target = tab ? { window: tab } : undefined;
  const options = { state, owner };
  const silver = (el) => el.relative().h(LOOK.title).items_center().bg(C.face)
    .child(div().absolute().top(0).left(0).w_full().h(1).bg(MOHELI[state].frame))
    .child(div().absolute().top(1).left(0).w_full().h(1).bg('#e0e0e0'));
  const appIcon = div().id('window-menu').w(20).h(20).flex().items_center().justify_center()
    .when(controls, (el) => el.cursor_pointer().tooltip('Window menu')
      .on_mouse_down('left', (_e, cx) => cx.stop_propagation()).on_click((e) => menu(windowMenu(), e.position)))
    .child(icon('konsole', 16));
  return h_flex().relative().w_full().h(LOOK.title).flex_none().gap(0).items_center()
    .child(moheliImage('top-left', state, 7, LOOK.title))
    .child(silver(h_flex().flex_none()).child(appIcon))
    .child(moheliImage('title-2', state, 4, LOOK.title))
    .child(moheliCaption(title, state))
    .child(moheliImage('title-4', state, 4, LOOK.title))
    .when(controls, (el) => el.child(silver(h_flex().flex_none()).children([
      moheliControl('title-shade', 'shade', () => perform('shade', target), windowState.shaded ? 'Roll down window' : 'Roll up window', { ...options, toggled: Boolean(windowState.shaded) }),
      moheliControl('title-min', 'hide', () => perform('minimize', target), 'Minimize to panel', options),
      moheliControl('title-max', 'maximize', () => perform('maximize', target), 'Maximize / restore', { ...options, toggled: Boolean(windowState.big) }),
      moheliControl('title-close', 'close', () => closeWindow(tab), 'Close window…', options),
    ])))
    .child(moheliImage('top-right', state, 7, LOOK.title));
}

export default class KDE3 extends View {
  init(_p, cx) {
    this.role = props()?.role ?? _p?.role ?? 'panel';
    this.now = new Date();
    this.selected = -1;
    this.pressedControl = null;
    if (this.role === 'panel') {
      this.lastViewport = '';
      this.fit();
      cx.timer.every(1000, () => this.fit());
      cx.timer.every(30000, (cx) => {
        const now = new Date();
        if (clockText(now) !== clockText(this.now)) { this.now = now; cx.notify(); }
      });
    }
    // Herdr routes mod key commands through its first layout copy (desktop).
    if (this.role === 'desktop') cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        await perform(command);
        cx.notify();
      }
    });
    if (['menu', 'about', 'confirm'].includes(this.role)) {
      this.handle = cx.focus_handle();
      this.handle.focus();
    }
    if (['about', 'confirm'].includes(this.role)) setShared('kde3.dialog', props()?.overlay);
    if (this.role === 'drag') {
      this.want = props().frame;
    }
    if (this.role === 'floating-title') rememberWindow(props().tab, props().overlay);
  }

  async close() {
    if (['about', 'confirm'].includes(this.role) && shared('kde3.dialog') === props()?.overlay) setShared('kde3.dialog', null);
  }

  fit() {
    // Every session now owns a real overlay window. The old embedded frame stays
    // hidden so no terminal is rendered twice at conflicting sizes.
    if (!this.windowsStarted) { run('layout.hide', { id: 'konsole' }); this.windowsStarted = true; }
    syncWindows();
  }

  render(cx) {
    return base(this.content(cx));
  }

  content(cx) {
    switch (this.role) {
      case 'desktop': return this.desktop();
      case 'title': return this.title();
      case 'menubar': return this.menubar();
      case 'toolbar': return this.toolbar();
      case 'tabs': return this.tabs();
      case 'pane': return this.pane();
      case 'status': return this.status();
      case 'scrollbar': return this.scrollbar();
      case 'frame': return this.frameEdge();
      case 'floating-title': return this.floatingTitle();
      case 'floating-menu': return this.menubar();
      case 'floating-toolbar': return this.toolbar();
      case 'floating-bar': return this.floatingBar();
      case 'panel': return this.panel();
      case 'menu': return this.popup(cx);
      case 'drag': return this.drag();
      case 'about': case 'confirm': return this.dialog();
      default: return div();
    }
  }

  desktop() {
    const launchers = [['home', 'Home', () => launch(true)], ['konsole', 'Konsole', () => launch()], ['desktop', 'Sessions', (e) => menu(sessionMenu(), e.position, 'Konsole sessions')]];
    return h_flex().id('desktop-icons').size_full().items_start().p(10).gap(18).children(launchers.map(([name, label, act]) =>
      v_flex().id(`desktop-${name}`).w(68).h(57).gap(1).items_center().justify_center().cursor_pointer().hover((s) => s.bg('#397cbf55'))
        .tooltip(name === 'home' ? 'Open a shell in your home folder' : name === 'konsole' ? 'Open a new terminal session' : 'Switch between running terminals')
        .on_click(act).child(icon(name === 'desktop' ? 'sessions' : name, 32)).child(div().underline().text_color('#071e3f').text_size(12).child(label))));
  }

  title() {
    const tab = activeTab();
    return h_flex().id('konsole-title').relative().size_full().justify_center().items_end()
      .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); startDrag(e, 'move'); })
      .on_mouse_down('right', (e, cx) => { cx.stop_propagation(); menu(windowMenu(), e.position); })
      .child(titleStrip(`${tab?.named ? tab.name : 'Shell'} - Konsole`, this));
  }

  frameEdge() {
    const part = props()?.part;
    const edge = MOHELI[ownerDecorationState()].frame;
    let el = div().relative().size_full().bg(C.face);
    if (part === 'left') el = el.border_l(1).border_color(edge);
    else if (part === 'right') el = el.border_r(1).border_color(edge);
    else el = el.border_b(1).border_color(edge);
    return el;
  }

  floatingTitle() {
    const id = props().tab;
    return h_flex().id('floating-title').size_full()
      .on_size_change((_size, cx) => {
        const overlay = props().overlay;
        // Size callbacks run inside layout; terminal hit/focus registrations
        // become available after that frame has finished.
        cx.timer.after(30, () => finishWindowFocus(id, overlay));
      })
      .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); startDrag(e, 'move', id); })
      .on_mouse_down('right', (e, cx) => { cx.stop_propagation(); markWindowFocus(id); menu(windowMenu(), e.position); })
      .child(titleStrip(`${windowCaption(id)} - Konsole`, this));
  }

  floatingBar() {
    const id = props().tab;
    const info = windowInfo(id);
    return h_flex().relative().size_full().px(2).gap(3).items_center().child(gradient('#eeeeee', '#b8b8b8'))
      .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); startDrag(e, 'move', id); })
      .child(button('new-tab', h_flex().gap(3).items_center().child(icon('new', 16)).child('New'), () => perform('newtab', { window: id }), { h: 25, tip: 'New tab in this window (⌘T)' }))
      .child(h_flex().relative().flex_1().min_w(0).gap(3).overflow_x_scroll().children((info?.sessions ?? []).map((tab) =>
        button(`window-session-${tab.id}`, h_flex().gap(3).items_center().child(icon('konsole', 20)).child(tab.name), () => selectWindowTab(id, tab.id),
          { h: 25, selected: info.sessionId === tab.id, tip: `Show ${tab.name} in this window` }))))
      .child(div().id('window-resize').relative().w(14).h(24).cursor_nwse_resize().text_color('#656565').child('◢')
        .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); startDrag(e, 'resize', id); }));
  }

  menubar() {
    return h_flex().relative().size_full().px(2).gap(0).items_center().child(gradient('#f3f3f3', '#bcbcbc'))
      .children(['Session', 'Edit', 'View', 'Settings', 'Help'].map((name) =>
        div().id(`menu-${name}`).relative().h(20).px(5).flex().items_center().cursor_pointer().hover((s) => s.bg('#aec1dc'))
          .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); menu(itemsFor(name), e.bounds ? { x: e.bounds.x, y: e.bounds.y + e.bounds.height } : e.position); }).child(name)));
  }

  toolbar() {
    return h_flex().size_full().bg(C.face).items_center().px(3).gap(5).child(grip())
      .child(button('new-shell', h_flex().gap(5).items_center().child(icon('konsole', 21)).child('New Session'), () => launch(), { h: 28, tip: 'Start your default shell' }))
      .child(button('toolbar-home', icon('home', 23), () => launch(true), { h: 28, tip: 'Terminal at Home' }))
      .child(div().w(1).h(23).bg(C.shadow))
      .child(button('split-v', '▥', () => perform('split-right'), { h: 28, tip: 'Split vertically' }))
      .child(button('split-h', '▤', () => perform('split-down'), { h: 28, tip: 'Split horizontally' }))
      .child(div().flex_1()).child(div().text_size(11).text_color('#545454').pr(8).child('Terminal Emulator'));
  }

  tabs() {
    const all = sessions().filter((s) => s.space === focused()?.space);
    return h_flex().relative().size_full().items_center().gap(3).px(2).child(gradient('#eeeeee', '#b8b8b8'))
      .child(h_flex().relative().gap(0)
        .child(button('new-bottom', h_flex().gap(3).items_center().child(icon('new', 16)).child('New'), () => launch(), { h: 25, tip: 'New terminal session' }))
        .child(button('new-bottom-menu', '▾', (e) => menu(itemsFor('Session'), e.position), { h: 25, px: 2, tip: 'Session menu' })))
      .child(h_flex().relative().flex_1().min_w(0).gap(3).overflow_x_scroll().children(all.map((s) =>
        button(`session-${s.id}`, h_flex().gap(4).items_center().child(icon('konsole', 20)).child(s.name), () => selectSession(s), { h: 25, selected: s.active, tip: `${s.name} — ${s.workspace}` }))))
      .child(div().id('resize-grip').relative().w(12).h(22).cursor_nwse_resize().text_color('#656565').child('◢')
        .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); startDrag(e, 'resize'); }));
  }

  scrollbar() {
    const scroll = (args) => {
      const terminal = props()?.tab ? modelPane(props().tab)?.terminal : focused()?.terminal;
      if (terminal) run('terminal.scroll', { terminal, ...args });
    };
    return v_flex().size_full().bg(C.face).gap(1)
      .child(button('scroll-top', '▴', () => scroll({ lines: -3 }), { w: 14, h: 15, px: 0, tip: 'Scroll terminal up' }))
      .child(bevel(div().id('scroll-track').relative().flex_1().min_h(0).bg('#eeeeee').cursor_pointer(), true)
        .tooltip('Previous page of terminal scrollback').on_click(() => scroll({ pages: -1 })))
      .child(button('scroll-bottom', '▴', () => scroll({ pages: -1 }), { w: 14, h: 14, px: 0, tip: 'Previous page' }))
      .child(button('scroll-down', '▾', () => scroll({ lines: 3 }), { w: 14, h: 14, px: 0, tip: 'Scroll terminal down' }));
  }

  pane() {
    const p = panes().find((p) => p.pane === props()?.pane);
    return h_flex().size_full().px(5).gap(4).items_center().bg(p?.focused && mainDecorationState() === 'active' ? '#c5d0df' : C.face).text_size(11)
      .child(icon('konsole', 13)).child(div().flex_1().min_w(0).truncate().child(p?.title ?? 'Shell'))
      .child(button('pane-zoom', '□', () => p && run('pane.zoom', { pane: p.pane }), { h: 16, px: 3, tip: 'Zoom this pane' }));
  }

  status() {
    const p = panes().find((p) => p.focused);
    const where = p?.cwd?.replace(home(), '~') ?? '~';
    return h_flex().size_full().bg(C.face).items_center().px(5).gap(8)
      .child(div().text_size(11).child(p?.program?.name ?? 'Shell')).child(div().w(1).h(14).bg(C.shadow))
      .child(div().flex_1().min_w(0).truncate().text_size(11).child(where))
      .child(div().text_size(11).child('Linux, the good old days.'))
      .child(div().id('resize-grip').w(16).h(18).cursor_nwse_resize().text_color('#656565').child('◢')
        .on_mouse_down('left', (e, cx) => { cx.stop_propagation(); startDrag(e, 'resize'); }));
  }

  panel() {
    const tasks = windowTasks();
    const launcher = (id, name, tip, act) => div().id(id).relative().w(34).h(32).flex_none().flex().items_center().justify_center()
      .cursor_pointer().tooltip(tip).hover((s) => s.bg('#e1e1e1')).active((s) => s.bg('#adadad'))
      .on_mouse_down('left', (_e, cx) => cx.stop_propagation()).on_click(act).child(icon(name, 32));
    return bevel(h_flex().id('kicker').relative().size_full().bg(C.face).px(2).gap(2).items_center())
      .child(launcher('k-menu', 'kmenu', 'K menu — terminal applications', () => perform('menu')))
      .child(grip())
      .child(launcher('quick-home', 'home', 'Terminal at Home', () => launch(true)))
      .child(launcher('quick-konsole', 'konsole', 'Konsole — new shell', () => launch()))
      .child(launcher('show-desktop', 'desktop', 'Show Desktop / restore Konsole', () => perform('desktop')))
      .child(grip())
      .child(h_flex().flex_1().min_w(0).h(30).gap(2).overflow_x_scroll().children(tasks.map((s) =>
        button(`task-${s.id}`, h_flex().gap(3).min_w(0).items_center().child(icon('konsole', 16))
          .child(div().min_w(0).truncate().when(activeWindowId() === s.id, (el) => el.font_bold()).child(`${s.status === 'blocked' ? '! ' : s.status === 'done' ? '• ' : ''}${s.name} - Konsole`)),
        () => activateWindowTask(s.id), { h: 29, w: 168, selected: activeWindowId() === s.id, tip: `${s.workspace}${s.machine ? ` on ${s.machine}` : ''} — ${s.name}` }))))
      .child(v_flex().flex_none().gap(1)
        .child(button('session-list', icon('sessions', 16), (e) => menu(sessionMenu(), { x: Math.max(0, e.position.x - 240), y: Math.max(0, viewport().height - PANEL_HEIGHT - menuHeight(sessionMenu(), 'Sessions')) }, 'Sessions'), { h: 16, px: 2, tip: 'All terminal sessions' }))
        .child(button('panel-settings', icon('configure', 16), () => perform('settings'), { h: 16, px: 2, tip: 'Herdr settings' })))
      .child(bevel(v_flex().relative().flex_none().w(69).h(32).items_center().justify_center().bg('#bbc1b0'), true)
        .child(lcd(clockText(this.now)))
        .child(div().text_size(9).line_height('10px').child(`${String(this.now.getDate()).padStart(2, '0')}/${String(this.now.getMonth() + 1).padStart(2, '0')}/${this.now.getFullYear()}`)));
  }

  popup(cx) {
    const p = props();
    const items = p.items ?? [];
    const choose = (it) => activateMenuItem(it, { run, perform, close: () => closeOverlay(p.overlay) });
    return bevel(h_flex().id('popup').relative().size_full().bg(C.face).p(2).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === 'enter') choose(items[this.selected]);
        else if (e.key === 'up' || e.key === 'down') {
          this.selected = nextMenuIndex(items, this.selected, e.key === 'up' ? -1 : 1);
          cx.notify();
        } else return;
        cx.stop_propagation();
      }))
      .when(Boolean(p.kmenu), (el) => el.child(div().relative().flex_none().w(24).h_full().bg('#7a93ab').overflow_hidden()
        .child(image(`${A}/icons/kmenu-banner.svg`).absolute().bottom(0).left(0).w(24).h(220))))
      .child(v_flex().flex_1().min_w(0).min_h(0)
        .when(Boolean(p.title), (el) => el.child(div().h(26).px(7).flex().items_center().font_bold().text_color(C.blue).child(p.title)))
        .child(v_flex().flex_1().min_h(0).overflow_y_scroll().children(items.map((it, i) => it.sep ? div().py(2).child(rule()) :
        h_flex().id(`item-${i}`).h(MENU_ROW).flex_none().px(4).gap(4).items_center().cursor_pointer()
          .bg(i === this.selected ? '#9dbacc' : C.face).text_color(C.text)
          .on_hover((on, cx) => { if (on) { this.selected = i; cx.notify(); } }).on_click(() => choose(it))
          .child(div().w(18).child(it.icon ? icon(it.icon, 16) : it.checked ? '✓' : ''))
          .child(div().flex_1().min_w(0).truncate().child(it.label)).child(div().text_size(10).child(it.shortcut ?? ''))))));
  }

  drag() {
    const p = props();
    const finish = (e) => {
      if (!this.moved) { closeOverlay(p.overlay); return; }
      const side = p.window && p.mode === 'move' && !p.shaded ? snapEdge(e.position, viewport()) : null;
      const f = clampFrame(this.want, viewport(), Boolean(p.shaded));
      if (side) snapWindow(p.window, side);
      else if (p.window) moveWindow(p.window, f);
      else { setShared('kde3.frame', f); setShared('kde3.maximized', false); place(f); }
      closeOverlay(p.overlay);
    };
    const preview = this.snapSide ? snapFrame(this.snapSide, viewport()) : displayFrame(this.want, Boolean(p.shaded));
    return div().id('drag-surface').size_full().on_mouse_down('left', (_e, cx) => cx.stop_propagation())
      .on_mouse_move((e, cx) => {
        const dx = e.position.x - p.start.x, dy = e.position.y - p.start.y;
        if (!this.moved && Math.hypot(dx, dy) < 4) return;
        this.moved = true;
        const base = p.restoreFrame ?? p.frame;
        this.want = clampFrame(p.mode === 'resize' ? { ...p.frame, w: p.frame.w + dx, h: p.frame.h + dy } : { ...base, x: base.x + dx, y: base.y + dy }, viewport(), Boolean(p.shaded));
        this.snapSide = p.window && p.mode === 'move' && !p.shaded ? snapEdge(e.position, viewport()) : null;
        cx.notify();
      }).on_mouse_up('left', finish)
      .child(div().absolute().left(preview.x).top(preview.y).w(preview.w).h(preview.h).border_2().border_color('#ffffff').bg(this.snapSide ? '#397cbf55' : '#143d6b33'));
  }

  dialog() {
    const confirm = this.role === 'confirm';
    const wholeWindow = Boolean(props()?.window);
    const close = () => closeOverlay(props().overlay);
    const yes = () => {
      const ids = props().tabs ?? (props().tab ? [props().tab] : []);
      close();
      for (const id of ids) run('tab.close', { id, confirmed: true });
    };
    return bevel(v_flex().id('dialog').relative().size_full().bg(C.face).p(3).track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === 'enter') { confirm ? yes() : close(); cx.stop_propagation(); } }))
      .child(titleStrip(confirm ? `Close ${wholeWindow ? 'Window' : 'Session'} — Konsole` : 'About KDE 3 — Konsole Desktop', this, false))
      .child(h_flex().flex_1().gap(15).p(15).items_center().child(icon(confirm ? 'konsole' : 'kmenu', 48))
        .child(v_flex().gap(7).flex_1().min_w(0).child(div().font_bold().child(confirm ? wholeWindow ? 'Close this window?' : 'Close this terminal session?' : 'Welcome to the old days.'))
          .child(div().whitespace_normal().child(confirm ? wholeWindow ? `Its ${props().tabs.length} terminal session(s) and their running programs will end. Other windows stay open.` : 'Its running programs will end. Other sessions stay open.' : 'A KDE 3 / Knoppix-inspired desktop for Herdr. Real terminals, silver windows, and a little nostalgia.'))
          .when(!confirm, (el) => el.child(div().whitespace_normal().text_size(11).text_color('#535353').child('Inspired by KDE. Not KDE or the Konsole application.')))))
      .child(h_flex().justify_end().gap(8).p(7)
        .when(confirm, (el) => el.child(button('cancel', 'Cancel', close, { w: 80 })))
        .child(button('dialog-ok', confirm ? wholeWindow ? 'Close Window' : 'Close Session' : 'OK', confirm ? yes : close, { w: confirm ? 112 : 80 })));
  }
}
