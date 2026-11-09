/**
 * Form controls. Each returns an element; controlled via `value` + `onChange(value)`.
 * Kept framework-free: callers re-render or patch as needed.
 */
import { h, debounce } from '../core/dom.js';
import { icon } from './icons.js';
import { assetUrl, importFile, ACCEPT_IMAGES } from '../data/media.js';
import { toast } from './feedback.js';

let uid = 0;
export const nextId = (p = 'f') => `${p}-${++uid}`;

/** Labelled field wrapper. */
export function field({ label, hint, error, id, children, aside, className }) {
  return h(
    'div',
    { class: ['field', className] },
    label ? h('label', { class: 'field-label', for: id }, h('span', {}, label), aside ?? null) : null,
    children,
    error ? h('div', { class: 'field-error', role: 'alert', id: id ? `${id}-err` : undefined }, error) : null,
    hint && !error ? h('div', { class: 'field-hint' }, hint) : null,
  );
}

export function textInput({ id = nextId(), value = '', placeholder = '', maxLength, onInput, onChange, type = 'text', invalid, autofocus, name, className, list, ...rest } = {}) {
  return h('input', {
    id,
    name,
    type,
    class: ['input', className],
    value: value ?? '',
    placeholder,
    maxLength,
    list,
    autofocus,
    'aria-invalid': invalid ? 'true' : undefined,
    'aria-describedby': invalid ? `${id}-err` : undefined,
    onInput: onInput ? (e) => onInput(e.target.value, e) : undefined,
    onChange: onChange ? (e) => onChange(e.target.value, e) : undefined,
    ...rest,
  });
}

export function select({ id = nextId(), value, options, onChange, invalid, placeholder, className, disabled } = {}) {
  const el = h(
    'select',
    { id, class: ['input', className], disabled, 'aria-invalid': invalid ? 'true' : undefined, onChange: (e) => onChange?.(e.target.value) },
    placeholder !== undefined ? h('option', { value: '' }, placeholder) : null,
    options.map((o) => h('option', { value: String(o.value) }, o.label)),
  );
  el.value = value === null || value === undefined ? '' : String(value);
  return el;
}

export function segmented({ value, options, onChange, label } = {}) {
  const wrap = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const render = (v) => {
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            'aria-pressed': String(String(o.value) === String(v)),
            title: o.title,
            onClick: () => {
              render(o.value);
              onChange?.(o.value);
            },
          },
          o.icon ? icon(o.icon, { size: 14 }) : null,
          o.label,
        ),
      ),
    );
  };
  render(value);
  return wrap;
}

export function toggle({ id = nextId(), checked, onChange, label } = {}) {
  const btn = h('button', { id, type: 'button', role: 'switch', class: 'switch', 'aria-checked': String(!!checked), 'aria-label': label });
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange?.(next);
  });
  return btn;
}

/** Toggle with an inline label row. */
export function toggleRow({ label, checked, onChange, hint }) {
  const id = nextId('t');
  return h(
    'div',
    { class: 'flex items-center justify-between gap-3 min-h-[28px]' },
    h('label', { for: id, class: 'text-[13px] text-fg cursor-pointer select-none flex-1' }, label, hint ? h('div', { class: 'field-hint mt-0.5' }, hint) : null),
    toggle({ id, checked, onChange, label }),
  );
}

export function range({ id = nextId(), value, min = 0, max = 100, step = 1, unit = '', onInput, onCommit, label } = {}) {
  const out = h('span', { class: 'text-[12px] tabular-nums text-fg-muted min-w-[42px] text-right' });
  const input = h('input', { id, type: 'range', class: 'range', min, max, step, value, 'aria-label': label });
  const paint = () => {
    const pct = ((input.value - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    out.textContent = `${input.value}${unit}`;
  };
  input.addEventListener('input', () => {
    paint();
    onInput?.(Number(input.value));
  });
  input.addEventListener('change', () => onCommit?.(Number(input.value)));
  paint();
  return { el: h('div', { class: 'flex items-center gap-3' }, input, out), input };
}

const HEX = /^#[0-9a-f]{6}$/i;

export function colorInput({ value = '#ffffff', onInput, onCommit, label, presets = [] } = {}) {
  const swatch = h('input', { type: 'color', class: 'w-8 h-8 rounded-[7px] border border-line-strong bg-base cursor-pointer p-0.5 shrink-0', value, 'aria-label': label });
  const textEl = h('input', { class: 'input font-mono uppercase !w-[96px]', value, maxLength: 7, 'aria-label': `${label} (HEX)`, spellcheck: false });
  const set = (v, commit) => {
    if (!HEX.test(v)) return;
    swatch.value = v;
    textEl.value = v;
    onInput?.(v.toLowerCase());
    if (commit) onCommit?.(v.toLowerCase());
  };
  swatch.addEventListener('input', () => set(swatch.value, false));
  swatch.addEventListener('change', () => set(swatch.value, true));
  textEl.addEventListener('change', () => {
    let v = textEl.value.trim();
    if (!v.startsWith('#')) v = `#${v}`;
    if (/^#[0-9a-f]{3}$/i.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    if (HEX.test(v)) set(v, true);
    else textEl.value = swatch.value;
  });
  return h(
    'div',
    { class: 'flex items-center gap-2 flex-wrap' },
    swatch,
    textEl,
    presets.map((p) => h('button', { type: 'button', class: 'w-5 h-5 rounded-full border border-white/15', style: { background: p }, title: p, 'aria-label': `Цвет ${p}`, onClick: () => set(p, true) })),
  );
}

export function searchInput({ value = '', placeholder = 'Поиск', onInput, className, id } = {}) {
  const deb = debounce((v) => onInput?.(v), 120);
  const input = h('input', { id, type: 'search', class: 'input', value, placeholder, 'aria-label': placeholder, onInput: (e) => deb(e.target.value) });
  return h('div', { class: ['input-group', className] }, icon('search', { size: 15 }), input);
}

/**
 * Image picker with preview and Replace / Remove / Reset actions.
 * Stores the file as a new immutable MediaAsset and reports its id.
 *
 * imageField({ assetId, kind, onChange(assetId|null), defaultAssetId?, label, emptyText })
 */
export function imageField({ assetId, kind = 'other', onChange, defaultAssetId = null, label = 'Изображение', emptyText = 'Файл не выбран', compact = false, checker = true } = {}) {
  const fileInput = h('input', { type: 'file', accept: ACCEPT_IMAGES, class: 'sr-only', tabIndex: -1, 'aria-hidden': 'true' });
  const preview = h('div', { class: ['relative overflow-hidden rounded-[8px] border border-line-strong grid place-items-center shrink-0', checker && 'checker', compact ? 'w-12 h-12' : 'w-16 h-16'] });
  const info = h('div', { class: 'min-w-0 flex-1 flex flex-col gap-1.5' });
  const wrap = h('div', { class: 'flex items-center gap-3', dataset: { imageField: kind } }, preview, info, fileInput);
  let current = assetId ?? null;
  let busy = false;

  async function paint() {
    preview.replaceChildren();
    const url = current ? await assetUrl(current) : null;
    if (url) preview.append(h('img', { src: url, alt: '', class: 'w-full h-full object-contain' }));
    else preview.append(icon('image', { size: 18, className: 'text-fg-faint' }));
    info.replaceChildren(
      h('div', { class: 'text-[12px] truncate ' + (current ? 'text-fg' : 'text-fg-faint') }, busy ? 'Загрузка…' : current ? (url ? label : 'Файл не найден в хранилище') : emptyText),
      h(
        'div',
        { class: 'flex flex-wrap gap-1.5' },
        h('button', { type: 'button', class: 'btn btn-sm', disabled: busy, onClick: () => fileInput.click() }, icon(current ? 'refresh' : 'upload', { size: 13 }), current ? 'Заменить' : 'Выбрать файл'),
        current ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', disabled: busy, onClick: () => set(null) }, icon('trash', { size: 13 }), 'Удалить') : null,
        defaultAssetId !== null && current !== defaultAssetId ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', disabled: busy, onClick: () => set(defaultAssetId) }, 'Сбросить') : null,
      ),
    );
  }

  function set(id) {
    current = id;
    paint();
    onChange?.(id);
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    busy = true;
    paint();
    try {
      const asset = await importFile(file, kind);
      busy = false;
      set(asset.id);
    } catch (err) {
      busy = false;
      paint();
      toast(err.message || 'Не удалось загрузить файл', { type: 'error' });
    }
  });

  // Drag & drop
  wrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    wrap.classList.add('ring-1', 'ring-brand/60', 'rounded-[8px]');
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('ring-1', 'ring-brand/60'));
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('ring-1', 'ring-brand/60');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });

  paint();
  wrap.setValue = (id) => {
    current = id;
    paint();
  };
  wrap.fileInput = fileInput;
  return wrap;
}

/** Empty state block with optional action. */
export function emptyState({ icon: ic = 'sparkles', title, text, action, className } = {}) {
  return h(
    'div',
    { class: ['flex flex-col items-center justify-center text-center gap-3 py-16 px-6', className] },
    h('div', { class: 'w-11 h-11 rounded-full grid place-items-center bg-raised border border-line-strong text-fg-muted' }, icon(ic, { size: 20 })),
    h('div', { class: 'text-[15px] font-semibold text-fg' }, title),
    text ? h('p', { class: 'text-[13px] text-fg-muted max-w-[380px] leading-relaxed' }, text) : null,
    action ? h('div', { class: 'mt-2 flex gap-2' }, [].concat(action)) : null,
  );
}

/** Team logo thumbnail for UI lists (not posters). */
export function teamAvatar(team, size = 28) {
  const box = h('div', {
    class: 'relative shrink-0 rounded-[7px] bg-base border border-line grid place-items-center overflow-hidden text-[10px] font-bold text-fg-muted',
    style: { width: `${size}px`, height: `${size}px` },
  });
  const initials = (team?.shortName || team?.name || '?').replace(/^team\s+/i, '').slice(0, 3).toUpperCase();
  box.style.fontSize = size < 30 ? '8px' : '10px';
  box.style.letterSpacing = '-0.02em';
  box.textContent = initials;
  if (team?.logoAssetId) {
    assetUrl(team.logoAssetId).then((url) => {
      if (url) box.replaceChildren(h('img', { src: url, alt: '', class: 'w-[82%] h-[82%] object-contain' }));
    });
  }
  return box;
}

export function spinner(className = '') {
  return h('span', { class: ['spinner inline-block', className], role: 'status', 'aria-label': 'Загрузка' });
}
