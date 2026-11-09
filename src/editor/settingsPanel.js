/**
 * Generic appearance panel: renders controls from the template's setting descriptors,
 * grouped and collapsible. Adding a template never requires changes here.
 */
import { h } from '../core/dom.js';
import { getPath, setPath } from '../core/utils.js';
import { icon } from '../ui/icons.js';
import { colorInput, field, imageField, range, segmented, select, textInput, toggleRow } from '../ui/controls.js';
import { GROUPS, applyTheme } from '../templates/shared/settings.js';
import { defaultStyle } from '../templates/registry.js';
import { BACKGROUND_PRESETS } from '../templates/shared/backgrounds.js';
import { confirmDialog } from '../ui/feedback.js';

const GROUP_ORDER = ['theme', 'colors', 'background', 'player', 'typography', 'layout', 'elements', 'socials'];
const ACCENT_PRESETS = ['#ff4b3e', '#ff8a3d', '#e9b949', '#3ddc84', '#4f7cff', '#9b7bff', '#ffffff'];

export function createSettingsPanel(editor) {
  const el = h('div', { class: 'flex flex-col' });
  const openGroups = new Set(loadOpen());
  let lastTemplateId = null;

  function loadOpen() {
    try {
      return JSON.parse(localStorage.getItem('df.groups') || '["theme","colors","background"]');
    } catch {
      return ['theme', 'colors', 'background'];
    }
  }
  function saveOpen() {
    try {
      localStorage.setItem('df.groups', JSON.stringify([...openGroups]));
    } catch {
      /* ignore */
    }
  }

  const setStyle = (path, value, opts = {}) => {
    const s = editor.getState();
    if (getPath(s.style, path) === value) return;
    editor.setStyle(setPath(s.style, path, value), { label: opts.label ?? 'Оформление', coalesce: opts.coalesce });
  };

  function control(d, style) {
    const value = getPath(style, d.key);
    switch (d.type) {
      case 'theme':
        return h(
          'div',
          { class: 'grid grid-cols-4 gap-1.5', role: 'radiogroup', 'aria-label': d.label },
          d.options.map((o) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                'aria-checked': String(value === o.value),
                class: ['group flex flex-col items-center gap-1.5 py-2 rounded-[8px] border text-[11px] transition-colors', value === o.value ? 'border-brand/60 bg-brand-soft text-fg' : 'border-line hover:border-line-strong text-fg-muted'],
                onClick: () => editor.setStyle(applyTheme(editor.getState().style, o.value), { label: `Тема ${o.label}` }),
              },
              h('span', { class: 'w-6 h-6 rounded-full border border-white/10', style: { background: `radial-gradient(circle at 30% 30%, ${o.swatch}, #0b0b0d 75%)` } }),
              o.label,
            ),
          ),
        );
      case 'background':
        return h(
          'div',
          { class: 'grid grid-cols-4 gap-1.5', role: 'radiogroup', 'aria-label': d.label },
          d.options.map((o) =>
            h(
              'button',
              {
                type: 'button',
                role: 'radio',
                title: o.label,
                'aria-checked': String(value === o.value),
                class: ['relative h-11 rounded-[7px] border overflow-hidden', value === o.value ? 'border-brand ring-1 ring-brand/50' : 'border-line hover:border-line-strong'],
                style: { background: BACKGROUND_PRESETS[o.value]?.swatch },
                onClick: () => setStyle(d.key, o.value, { label: 'Фон' }),
              },
              h('span', { class: 'absolute bottom-0.5 left-1 text-[9.5px] text-white/80 font-medium' }, o.label),
            ),
          ),
        );
      case 'color':
        return colorInput({ value, label: d.label, presets: d.key === 'accent' ? ACCENT_PRESETS : [], onInput: (v) => setStyle(d.key, v, { coalesce: d.key, label: d.label }) });
      case 'range': {
        const r = range({ value, min: d.min, max: d.max, step: d.step, unit: d.unit ?? '', label: d.label, onInput: (v) => setStyle(d.key, v, { coalesce: d.key, label: d.label }) });
        return r.el;
      }
      case 'select':
      case 'font':
        return select({ value, options: d.options, onChange: (v) => setStyle(d.key, v, { label: d.label }) });
      case 'segmented':
        return segmented({ value, options: d.options, label: d.label, onChange: (v) => setStyle(d.key, typeof d.options[0].value === 'number' ? Number(v) : v, { label: d.label }) });
      case 'toggle':
        return null; // rendered as a row
      case 'text':
        return textInput({ value, maxLength: d.maxLength, onInput: (v) => setStyle(d.key, v, { coalesce: d.key, label: d.label }) });
      case 'image':
        return imageField({ assetId: value, kind: d.kind, label: 'Загружено', emptyText: 'Файл не выбран', defaultAssetId: getPath(defaultStyle(editor.template), d.key) ?? null, onChange: (id) => setStyle(d.key, id, { label: d.label }) });
      default:
        return h('div', { class: 'field-hint' }, `Неизвестный тип: ${d.type}`);
    }
  }

  function render() {
    const { style } = editor.getState();
    const tpl = editor.template;
    const visible = tpl.settings.filter((d) => !d.when || safeWhen(d, style));
    const byGroup = new Map();
    for (const d of visible) {
      if (!byGroup.has(d.group)) byGroup.set(d.group, []);
      byGroup.get(d.group).push(d);
    }
    const groups = [...byGroup.keys()].sort((a, b) => idx(a) - idx(b));
    const focusedKey = document.activeElement?.closest?.('[data-setting]')?.dataset.setting;

    el.replaceChildren(
      ...groups.map((g) => {
        const open = openGroups.has(g);
        const body = h(
          'div',
          { class: 'flex flex-col gap-3.5 px-4 pb-4', hidden: !open },
          byGroup.get(g).map((d) => {
            const wrap = h('div', { dataset: { setting: d.key } });
            if (d.type === 'toggle') wrap.append(toggleRow({ label: d.label, hint: d.hint, checked: !!getPath(style, d.key), onChange: (v) => setStyle(d.key, v, { label: d.label }) }));
            else wrap.append(field({ label: d.label, hint: d.hint, children: control(d, style) }));
            return wrap;
          }),
        );
        return h(
          'section',
          { class: 'border-b border-line' },
          h(
            'button',
            {
              type: 'button',
              class: 'w-full flex items-center justify-between px-4 h-11 text-[12.5px] font-semibold text-fg hover:bg-hover/40',
              'aria-expanded': String(open),
              onClick: () => {
                if (openGroups.has(g)) openGroups.delete(g);
                else openGroups.add(g);
                saveOpen();
                render();
              },
            },
            GROUPS[g] ?? g,
            h('span', { class: 'text-fg-faint' }, icon(open ? 'chevronUp' : 'chevronDown', { size: 14 })),
          ),
          body,
        );
      }),
      h(
        'div',
        { class: 'p-4' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-ghost w-full',
            onClick: async () => {
              const ok = await confirmDialog({ title: 'Сбросить оформление?', message: 'Все настройки оформления этого шаблона вернутся к исходным. Действие можно отменить (Ctrl+Z).', confirmLabel: 'Сбросить' });
              if (ok) editor.setStyle(defaultStyle(editor.template), { label: 'Сброс оформления' });
            },
          },
          icon('refresh', { size: 14 }),
          'Сбросить оформление',
        ),
      ),
    );
    if (focusedKey) el.querySelector(`[data-setting="${CSS.escape(focusedKey)}"] input, [data-setting="${CSS.escape(focusedKey)}"] select`)?.focus();
    lastTemplateId = tpl.id;
  }

  const idx = (g) => (GROUP_ORDER.indexOf(g) + 1 || 99);
  const safeWhen = (d, style) => {
    try {
      return d.when(style);
    } catch {
      return true;
    }
  };

  // Structural re-render only when visibility of controls or template changes, to keep
  // sliders/inputs alive while dragging/typing.
  let lastSignature = '';
  function refresh(force = false) {
    const { style } = editor.getState();
    const tpl = editor.template;
    const signature = tpl.id + '|' + tpl.settings.map((d) => (!d.when || safeWhen(d, style) ? '1' : '0')).join('');
    const active = document.activeElement;
    const interacting = active && el.contains(active) && (active.type === 'range' || active.type === 'text' || active.tagName === 'INPUT' || active.type === 'color');
    if (!force && signature === lastSignature && interacting) return;
    if (!force && signature === lastSignature && lastTemplateId === tpl.id && interacting) return;
    lastSignature = signature;
    render();
  }

  return { el, refresh };
}
