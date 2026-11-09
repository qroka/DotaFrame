/** Toasts, modal dialogs, confirm, dropdown menus. Accessible (focus trap, Esc, aria). */
import { h } from '../core/dom.js';
import { icon } from './icons.js';

/* ---------------- Toasts ---------------- */

let toastRoot;
function ensureToastRoot() {
  if (!toastRoot) {
    toastRoot = h('div', { class: 'fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none', role: 'region', 'aria-label': 'Уведомления', 'aria-live': 'polite' });
    document.body.append(toastRoot);
  }
  return toastRoot;
}

const TOAST_ICON = { success: ['check', 'text-ok'], error: ['alert', 'text-danger'], warning: ['alert', 'text-warn'], info: ['info', 'text-info'] };

/**
 * toast('Сохранено', { type: 'success' })
 * Returns { close, update(message) } — useful for progress toasts.
 */
export function toast(message, { type = 'info', duration = type === 'error' ? 7000 : 3200, action } = {}) {
  const root = ensureToastRoot();
  const [ic, color] = TOAST_ICON[type] ?? TOAST_ICON.info;
  const msg = h('div', { class: 'text-[13px] leading-snug text-fg' }, message);
  const el = h(
    'div',
    {
      class: 'pointer-events-auto flex items-start gap-3 min-w-[260px] max-w-[420px] rounded-[10px] bg-raised px-3.5 py-3 animate-slide-up',
      style: { boxShadow: 'var(--shadow-pop)' },
      role: type === 'error' ? 'alert' : 'status',
    },
    h('span', { class: `mt-px ${color}` }, type === 'loading' ? h('span', { class: 'spinner block text-fg-muted' }) : icon(ic, { size: 16 })),
    h('div', { class: 'flex-1 min-w-0 flex flex-col gap-2' }, msg, action ? h('div', {}, h('button', { class: 'btn btn-sm', onClick: () => (action.onClick(), close()) }, action.label)) : null),
    h('button', { class: 'btn btn-ghost btn-icon btn-sm -mr-1 -mt-0.5', 'aria-label': 'Закрыть', onClick: () => close() }, icon('x', { size: 14 })),
  );
  root.append(el);
  let timer = duration && type !== 'loading' ? setTimeout(close, duration) : null;
  function close() {
    clearTimeout(timer);
    el.style.transition = 'opacity 150ms';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 160);
  }
  return {
    close,
    update(text, nextType) {
      msg.textContent = text;
      if (nextType && nextType !== 'loading') {
        const [ic2, color2] = TOAST_ICON[nextType] ?? TOAST_ICON.info;
        el.firstChild.replaceWith(h('span', { class: `mt-px ${color2}` }, icon(ic2, { size: 16 })));
        timer = setTimeout(close, 3200);
      }
    },
  };
}

export function toastError(err, prefix = '') {
  console.error(err);
  const msg = err?.message || String(err);
  return toast(prefix ? `${prefix}: ${msg}` : msg, { type: 'error' });
}

/* ---------------- Modal ---------------- */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * openModal({ title, content, footer, width, onClose }) → { close, root, body }
 * `content` / `footer` may be nodes or functions receiving { close }.
 */
export function openModal({ title, description, content, footer, width = 520, onClose, dismissible = true } = {}) {
  const previouslyFocused = document.activeElement;
  const api = {};
  const titleId = `m-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'px-5 pb-5 overflow-auto' });
  const foot = h('div', { class: 'flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-panel/60' });
  const dialog = h(
    'div',
    {
      class: 'relative flex flex-col max-h-[88vh] w-full rounded-[14px] bg-panel border border-line-strong animate-slide-up overflow-hidden',
      style: { maxWidth: `${width}px`, boxShadow: 'var(--shadow-pop)' },
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
    },
    h(
      'div',
      { class: 'flex items-start justify-between gap-4 px-5 pt-5 pb-4' },
      h('div', { class: 'min-w-0' }, h('h2', { id: titleId, class: 'text-[15px] font-semibold text-fg' }, title ?? ''), description ? h('p', { class: 'mt-1 text-[13px] text-fg-muted leading-relaxed' }, description) : null),
      dismissible ? h('button', { class: 'btn btn-ghost btn-icon btn-sm -mr-1.5 -mt-1', 'aria-label': 'Закрыть', onClick: () => api.close() }, icon('x')) : null,
    ),
    body,
    foot,
  );
  const overlay = h('div', { class: 'fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] animate-fade-in' }, dialog);

  const resolveNode = (n) => (typeof n === 'function' ? n(api) : n);

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      api.close();
    } else if (e.key === 'Tab') {
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  api.close = (result) => {
    if (api.closed) return;
    api.closed = true;
    overlay.removeEventListener('keydown', onKey, true);
    overlay.remove();
    previouslyFocused?.focus?.();
    onClose?.(result);
  };
  api.root = dialog;
  api.body = body;
  api.setFooter = (node) => {
    foot.replaceChildren();
    if (node) foot.append(...[].concat(resolveNode(node)).flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
    foot.hidden = !node;
  };

  body.append(...[].concat(resolveNode(content) ?? []).flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));
  api.setFooter(footer);
  overlay.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && dismissible) api.close();
  });
  document.body.append(overlay);
  requestAnimationFrame(() => {
    const auto = dialog.querySelector('[autofocus]') ?? body.querySelector(FOCUSABLE) ?? dialog.querySelector(FOCUSABLE);
    if (!dialog.contains(document.activeElement) || document.activeElement === dialog) auto?.focus();
  });
  return api;
}

/** Promise-based confirmation dialog. */
export function confirmDialog({ title = 'Вы уверены?', message = '', confirmLabel = 'Подтвердить', cancelLabel = 'Отмена', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title,
      width: 440,
      content: message ? h('p', { class: 'text-[13px] text-fg-muted leading-relaxed whitespace-pre-line' }, message) : null,
      footer: ({ close }) => [
        h('button', { class: 'btn', onClick: () => close() }, cancelLabel),
        h(
          'button',
          {
            class: ['btn', danger ? 'btn-danger' : 'btn-primary'],
            autofocus: true,
            onClick: () => {
              result = true;
              close();
            },
          },
          confirmLabel,
        ),
      ],
      onClose: () => resolve(result),
    });
    return m;
  });
}

/* ---------------- Dropdown menu ---------------- */

/**
 * openMenu(anchorEl, [{ label, icon, onClick, danger, disabled, hint } | 'separator'])
 */
export function openMenu(anchor, items, { align = 'end' } = {}) {
  closeMenus();
  const menu = h('div', { class: 'menu fixed z-[95]', role: 'menu', dataset: { dfMenu: 'true' } });
  for (const item of items) {
    if (item === 'separator') {
      menu.append(h('div', { class: 'my-1 h-px bg-line' }));
      continue;
    }
    if (!item) continue;
    menu.append(
      h(
        'button',
        {
          class: ['menu-item', item.danger && 'danger'],
          role: 'menuitem',
          disabled: !!item.disabled,
          style: item.disabled ? { opacity: '0.4' } : undefined,
          onClick: (e) => {
            e.stopPropagation();
            closeMenus();
            item.onClick?.();
          },
        },
        item.icon ? icon(item.icon, { size: 15 }) : null,
        h('span', { class: 'flex-1' }, item.label),
        item.hint ? h('span', { class: 'text-[11px] text-fg-faint' }, item.hint) : null,
      ),
    );
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = align === 'end' ? r.right - mw : r.left;
  let top = r.bottom + 6;
  if (top + mh > window.innerHeight - 8) top = r.top - mh - 6;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.querySelector('.menu-item:not([disabled])')?.focus();

  const onDoc = (e) => {
    if (!menu.contains(e.target)) closeMenus();
  };
  const onKey = (e) => {
    const list = [...menu.querySelectorAll('.menu-item:not([disabled])')];
    const idx = list.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      closeMenus();
      anchor.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(idx + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(idx - 1 + list.length) % list.length]?.focus();
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
  });
  menu._cleanup = () => {
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
  };
  return menu;
}

export function closeMenus() {
  document.querySelectorAll('[data-df-menu]').forEach((m) => {
    m._cleanup?.();
    m.remove();
  });
}
