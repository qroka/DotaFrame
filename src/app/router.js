/**
 * Hash router: `#/path/:param?query`. Works on static hosting without server rewrites.
 *
 * A route handler receives { params, query } and returns (or resolves) a page object:
 *   { el: HTMLElement, title?: string, destroy?(), canLeave?(): boolean | Promise<boolean> }
 * `canLeave` lets a page block navigation with unsaved changes.
 */
const routes = [];
let current = null;
let outlet = null;
let navToken = 0;
let onNavigate = () => {};
let skipNextGuard = false;
let lastHash = '';

export function route(pattern, handler, meta = {}) {
  const keys = [];
  if (pattern === '*') {
    routes.push({ pattern, re: /(?!)/, keys, handler, meta });
    return;
  }
  const re = new RegExp(
    '^' +
      pattern
        .replace(/\/+$/, '')
        .replace(/:([a-zA-Z]+)/g, (_m, k) => {
          keys.push(k);
          return '([^/]+)';
        }) +
      '/?$',
  );
  routes.push({ pattern, re, keys, handler, meta });
}

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function href(path, query) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path, query, { replace = false, force = false } = {}) {
  const target = href(path, query);
  if (force) skipNextGuard = true;
  if (replace) {
    history.replaceState(null, '', target);
    resolve();
  } else if (location.hash === target) {
    resolve();
  } else {
    location.hash = target;
  }
}

export const currentPage = () => current;

/** Change the URL without re-rendering the current page (e.g. new project got an id). */
export function replaceHashSilently(path, query) {
  const target = href(path, query);
  history.replaceState(null, '', target);
  lastHash = target;
}

async function resolve() {
  const token = ++navToken;
  const { path, query } = parseHash();

  if (current?.canLeave && !skipNextGuard && location.hash !== lastHash) {
    const ok = await current.canLeave();
    if (!ok) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
  }
  skipNextGuard = false;
  if (token !== navToken) return;

  let match = null;
  let params = {};
  for (const r of routes) {
    const m = r.re.exec(path === '/' ? '' : path.replace(/\/+$/, ''));
    if (m) {
      match = r;
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      break;
    }
  }
  if (!match) match = routes.find((r) => r.pattern === '*');

  try {
    current?.destroy?.();
  } catch (err) {
    console.error(err);
  }
  current = null;
  lastHash = location.hash || '#/';

  let page;
  try {
    page = await match.handler({ params, query, path });
  } catch (err) {
    console.error('[router] page failed', err);
    const el = document.createElement('div');
    el.className = 'p-10 text-fg-muted';
    el.textContent = `Не удалось открыть страницу: ${err.message}`;
    page = { el };
  }
  if (token !== navToken) {
    page?.destroy?.();
    return;
  }
  current = page;
  outlet.replaceChildren(page.el);
  document.title = page.title ? `${page.title} — DotaFrame` : 'DotaFrame';
  onNavigate({ path, query, meta: match.meta });
  outlet.scrollTop = 0;
}

export function startRouter(el, { onChange } = {}) {
  outlet = el;
  if (onChange) onNavigate = onChange;
  window.addEventListener('hashchange', resolve);
  window.addEventListener('beforeunload', (e) => {
    if (current?.isDirty?.()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  resolve();
}
