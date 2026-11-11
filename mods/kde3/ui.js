import { div, image, PathBuilder, Background } from 'gpui-kit';
import { h_flex } from 'gpui-base';
import { LOOK } from './model.mjs';

export const C = { face: '#c0c0c0', light: '#dfdfdf', white: '#ffffff', shadow: '#808080', dark: '#404040', text: '#111111', blue: '#223f67', select: '#8ca9be' };
export const A = 'mods/kde3';
let rect;
export const gradient = (from, to) => {
  rect ??= PathBuilder.fill().move_to('0%', '0%').line_to('100%', '0%').line_to('100%', '100%').line_to('0%', '100%').close().build();
  return window.paint_path(rect, Background.linear_gradient(180, from, to)).absolute().top(0).left(0).size_full();
};
const PERIOD_ICONS = new Set(['konsole', 'home', 'desktop', 'sessions', 'kmenu', 'new', 'configure', 'help', 'exit', 'split-right', 'split-down']);
export const icon = (name, size = 18) => image(PERIOD_ICONS.has(name) ? `${A}/icons/period/${name}-${size <= 18 ? 16 : 32}.png` : `${A}/icons/${name}.svg`).w(size).h(size).flex_none();
export const base = (el) => el.font_family('Tahoma').text_size(12).line_height('15px').text_color(C.text);

export function bevel(el, sunken = false) {
  return el.border_t(1).border_l(1).border_color(sunken ? C.shadow : C.white)
    .child(div().absolute().right(0).top(0).bottom(0).w(1).bg(sunken ? C.white : C.shadow))
    .child(div().absolute().left(0).right(0).bottom(0).h(1).bg(sunken ? C.white : C.shadow));
}

export function button(id, content, act, options = {}) {
  let el = bevel(h_flex().id(id).relative().h(options.h ?? 24).px(options.px ?? 5).gap(4).items_center().justify_center().flex_none().bg(options.selected ? '#b8b8b8' : C.face), Boolean(options.selected))
    .on_mouse_down('left', (_e, cx) => cx.stop_propagation());
  if (options.w) el = el.w(options.w);
  if (options.tip) el = el.tooltip(options.tip);
  if (act) el = el.cursor_pointer().hover((s) => s.bg('#d1d1d1')).active((s) => s.bg('#a8b1bc')).on_click(act);
  return el.child(content);
}

export const rule = () => div().relative().h(2).w_full().bg(C.shadow).child(div().absolute().left(0).top(1).h(1).w_full().bg(C.white));
export const grip = () => h_flex().gap(2).px(3).h(22).items_center().children([0, 1].map(() => div().w(2).h(16).bg('#8c8c8c').border_l(1).border_color('#ffffff')));

export function lcd(text) {
  return h_flex().gap(1).items_center().children([...text].map((ch) => image(`${A}/icons/lcd-${ch === ':' ? 'colon' : ch}.svg`).w(ch === ':' ? 4 : 11).h(21)));
}

export const MOHELI = {
  active: { title: '#3c6c9f', highlight: '#7298c0', shadow: '#264e78', text: '#ffffff', frame: '#a0a0a0' },
  inactive: { title: '#b6b6b6', highlight: '#dddddd', shadow: '#929292', text: '#555555', frame: '#aaaaaa' },
};
export const moheliImage = (part, state, w, h) => image(`${A}/icons/moheli/${part}-${state}.svg`).w(w).h(h).flex_none();

export function moheliCaption(title, state) {
  const c = MOHELI[state];
  return h_flex().relative().flex_1().min_w(0).h(LOOK.title).px(8).items_center().justify_center().bg(c.title)
    .child(div().absolute().top(0).left(0).w_full().h(1).bg(c.shadow))
    .child(div().absolute().top(1).left(0).w_full().h(1).bg(c.highlight))
    .child(div().min_w(0).truncate().font_family('Tahoma').font_bold().text_size(12).text_color(c.text).child(title));
}

export function moheliControl(id, kind, act, tip, { state, owner, toggled = false }) {
  const held = owner.pressedControl === id;
  const part = `${kind}${toggled ? '-toggled' : ''}`;
  return div().id(id).w(17).h(17).flex_none().cursor_pointer().tooltip(tip)
    .on_mouse_down('left', (_e, cx) => { cx.stop_propagation(); owner.pressedControl = id; cx.notify(); })
    .on_mouse_up('left', (_e, cx) => { owner.pressedControl = null; cx.notify(); })
    .on_hover((over, cx) => { if (!over && owner.pressedControl === id) { owner.pressedControl = null; cx.notify(); } })
    .on_click(act).child(moheliImage(part, held ? 'pressed' : state, 17, 17));
}
