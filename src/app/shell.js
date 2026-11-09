/** App frame: collapsible sidebar navigation + content outlet. */
import { h } from '../core/dom.js';
import { icon } from '../ui/icons.js';

export const NAV = [
  { path: '/', label: 'Обзор', icon: 'home', match: (p) => p === '/' },
  { path: '/matches', label: 'Матчи', icon: 'swords', match: (p) => p.startsWith('/matches') },
  { path: '/teams', label: 'Команды', icon: 'users', match: (p) => p.startsWith('/teams') },
  { path: '/projects', label: 'Публикации', icon: 'image', match: (p) => p.startsWith('/projects') || p.startsWith('/editor') },
  { path: '/templates', label: 'Шаблоны', icon: 'layers', match: (p) => p.startsWith('/templates') || p.startsWith('/new') },
  { path: '/settings', label: 'Данные и настройки', icon: 'settings', match: (p) => p.startsWith('/settings') },
];

export function logoMark(size = 22) {
  return h(
    'div',
    { class: 'grid place-items-center rounded-[6px] bg-brand text-[#120705] shrink-0', style: { width: `${size}px`, height: `${size}px` } },
    h('svg', { viewBox: '0 0 24 24', width: size * 0.62, height: size * 0.62, fill: 'currentColor', html: '<path d="M4 3h8.5C17.2 3 21 6.6 21 12s-3.8 9-8.5 9H4zm4 4v10h4.3c2.6 0 4.6-2.1 4.6-5s-2-5-4.6-5z"/>' }),
  );
}

export function createShell() {
  let collapsed = false;
  try {
    collapsed = localStorage.getItem('df.sidebar') === 'collapsed';
  } catch {
    /* storage blocked */
  }

  const navList = h('nav', { class: 'flex flex-col gap-0.5 px-2', 'aria-label': 'Основная навигация' });
  const outlet = h('main', { id: 'outlet', class: 'flex-1 min-w-0 h-full overflow-auto bg-base', tabIndex: -1 });
  const toggleBtn = h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Свернуть панель', title: 'Свернуть панель', onClick: () => setCollapsed(!collapsed) }, icon('panelLeft', { size: 15 }));
  const brandLabel = h('span', { class: 'font-display font-extrabold tracking-tight text-[15px]', style: { fontVariationSettings: '"wdth" 120, "opsz" 24' } }, 'DotaFrame');
  const footer = h('div', { class: 'mt-auto px-3 pb-3 pt-2 text-[11px] text-fg-faint leading-relaxed', dataset: { sidebarFooter: '' } }, 'Данные хранятся только в этом браузере.');

  const sidebar = h(
    'aside',
    { class: 'flex flex-col h-full border-r border-line bg-panel shrink-0 transition-[width] duration-200 overflow-hidden', dataset: { sidebar: '' } },
    h('div', { class: 'flex items-center gap-2.5 h-14 px-4 shrink-0' }, h('a', { href: '#/', class: 'flex items-center gap-2.5 min-w-0', 'aria-label': 'DotaFrame — обзор' }, logoMark(), brandLabel), h('div', { class: 'ml-auto', dataset: { collapseSlot: '' } }, toggleBtn)),
    navList,
    footer,
  );

  const root = h('div', { class: 'flex h-full w-full overflow-hidden' }, sidebar, outlet);

  function renderNav(path = '/') {
    navList.replaceChildren(
      ...NAV.map((item) => {
        const active = item.match(path);
        return h(
          'a',
          {
            href: `#${item.path}`,
            class: [
              'group flex items-center gap-3 h-9 rounded-[8px] text-[13px] font-medium transition-colors',
              collapsed ? 'justify-center px-0' : 'px-2.5',
              active ? 'bg-hover text-fg' : 'text-fg-muted hover:text-fg hover:bg-hover/60',
            ],
            'aria-current': active ? 'page' : undefined,
            title: collapsed ? item.label : undefined,
          },
          h('span', { class: active ? 'text-brand' : 'text-fg-faint group-hover:text-fg-muted' }, icon(item.icon, { size: 17 })),
          collapsed ? null : h('span', { class: 'truncate' }, item.label),
        );
      }),
    );
  }

  let lastPath = '/';
  function setCollapsed(v) {
    collapsed = v;
    try {
      localStorage.setItem('df.sidebar', v ? 'collapsed' : 'open');
    } catch {
      /* ignore */
    }
    sidebar.style.width = v ? '60px' : '232px';
    brandLabel.hidden = v;
    footer.hidden = v;
    toggleBtn.setAttribute('aria-label', v ? 'Развернуть панель' : 'Свернуть панель');
    toggleBtn.title = toggleBtn.getAttribute('aria-label');
    toggleBtn.parentElement.classList.toggle('ml-auto', !v);
    sidebar.firstChild.classList.toggle('px-4', !v);
    sidebar.firstChild.classList.toggle('flex-col', v);
    sidebar.firstChild.classList.toggle('justify-center', v);
    sidebar.firstChild.classList.toggle('h-14', !v);
    sidebar.firstChild.classList.toggle('py-3', v);
    renderNav(lastPath);
  }

  setCollapsed(collapsed || window.innerWidth < 1100);

  return {
    root,
    outlet,
    onRoute({ path, meta }) {
      lastPath = path;
      renderNav(path);
      // The editor is a full-bleed workspace: auto-collapse on narrow screens.
      if (meta?.fullBleed && window.innerWidth < 1440 && !collapsed) setCollapsed(true);
    },
  };
}
