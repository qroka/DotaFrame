/**
 * Minimal DOM helpers. No framework: `h()` builds elements declaratively.
 *
 * h('button', { class: 'btn', onClick: fn, disabled: true }, 'Text', childEl)
 * - `class` / `className` accept a string or an array (falsy entries are dropped)
 * - `style` accepts a string or an object (camelCase or --custom-props)
 * - `on*` props register event listeners
 * - `dataset` sets data-* attributes; boolean `true` sets an empty attribute
 */
export type Child = Node | string | number | boolean | null | undefined | Child[];
export type Props = Record<string, any> | null | undefined;

export function h<T extends HTMLElement = HTMLElement>(tag: string | T, props: Props = {}, ...children: Child[]): T {
  const el = (tag instanceof Element ? tag : document.createElement(tag)) as T;
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s(tag: string, props: Props = {}, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.setAttribute('class', clsx(value));
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(el, children);
  return el;
}

export function clsx(value: unknown): string {
  if (!value) return '';
  if (Array.isArray(value)) return value.flat(Infinity).filter(Boolean).join(' ');
  return String(value);
}

function applyProps(el: any, props: Props): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'class' || key === 'className') {
      const c = clsx(value);
      if (c) el.setAttribute('class', c);
    } else if (key === 'style') {
      if (typeof value === 'string') el.style.cssText = value;
      else setStyle(el, value);
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) if (v !== undefined && v !== null) el.dataset[k] = v;
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      el.innerHTML = value;
    } else if (key === 'text') {
      el.textContent = value;
    } else if (key in el && typeof value !== 'string' && !(el instanceof SVGElement)) {
      el[key] = value;
    } else if (value === false) {
      // skip
    } else if (value === true) {
      el.setAttribute(key, '');
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      el[key] = value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
}

export function setStyle(el: HTMLElement, styles: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(styles)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else (el.style as any)[k] = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v);
  }
}

const UNITLESS = new Set(['opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow', 'flexShrink', 'order', 'scale']);

export function appendChildren(el: Element, children: Child[]): void {
  for (const child of (children as any[]).flat(Infinity) as Child[]) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Drop null/undefined/false from child lists (Element.replaceChildren would print "null"). */
export const compact = (...children: Child[]): Child[] => (children as any[]).flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== true);

export function clear<T extends Element>(el: T): T {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function mount<T extends Element>(container: T, ...children: Child[]): T {
  clear(container);
  appendChildren(container, children);
  return container;
}

export const qs = <T extends Element = Element>(sel: string, root: ParentNode = document): T | null => root.querySelector<T>(sel);
export const qsa = <T extends Element = Element>(sel: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(sel)];

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 150) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  wrapped.flush = (...args: A) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export function escapeHtml(str: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, (c) => entities[c]!);
}
