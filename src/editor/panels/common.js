/** Shared pieces for editor data panels. */
import { h } from '../../core/dom.js';
import { field, textInput } from '../../ui/controls.js';

export function panelSection(title, ...children) {
  return h('section', { class: 'panel-section flex flex-col gap-3' }, title ? h('div', { class: 'section-title' }, title) : null, ...children);
}

/** Editable poster copy (template.texts → data.texts). */
export function textsSection(editor) {
  const tpl = editor.template;
  if (!tpl.texts?.length) return null;
  const { data } = editor.getState();
  return panelSection(
    'Тексты на постере',
    ...tpl.texts.map((t) =>
      field({
        label: t.label,
        hint: t.hint,
        children: textInput({
          value: data.texts?.[t.key] ?? t.default ?? '',
          placeholder: t.default || '—',
          maxLength: t.maxLength,
          dataset: { text: t.key },
          onInput: (v) => {
            const s = editor.getState();
            editor.setData({ ...s.data, texts: { ...(s.data.texts ?? {}), [t.key]: v } }, { label: t.label, coalesce: `text.${t.key}` });
          },
        }),
      }),
    ),
  );
}

export function infoNote(text, tone = 'muted') {
  const color = tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : 'text-fg-faint';
  return h('p', { class: `text-[12px] leading-relaxed ${color}` }, text);
}
