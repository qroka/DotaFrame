/**
 * Data panel for multi-match templates (Matchday): add rows from saved matches or manually,
 * reorder, edit per-row date/time/format/stage, remove. Capacity comes from template.capacity.
 */
import { h, compact } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { field, select, textInput, teamAvatar, segmented } from '../../ui/controls.js';
import { manualMatchItem, snapshotMatch, snapshotTeam } from '../../domain/snapshot.js';
import { FORMAT_IDS } from '../../domain/series.js';
import { TIMEZONES, DEFAULT_TIMEZONE, matchSortKey } from '../../domain/time.js';
import { openModal, toast } from '../../ui/feedback.js';
import { panelSection, textsSection, infoNote } from './common.js';
import { matchOptionLabel } from './dataMatch.js';
import { matchesQuery } from '../../core/utils.js';

export function createMatchesPanel(editor) {
  const el = h('div', { class: 'flex flex-col' });
  const expanded = new Set();

  const cap = () => editor.template.capacity ?? { min: 1, max: 6 };
  const items = () => editor.getState().data.items ?? [];
  const setItems = (next, label, coalesce) => editor.setData({ ...editor.getState().data, items: next }, { label, coalesce });

  function addFromMatches() {
    const used = new Set(items().map((i) => i.matchId).filter(Boolean));
    const selected = new Set();
    let query = '';
    const list = h('div', { class: 'flex flex-col max-h-[50vh] overflow-auto -mx-1' });
    const counter = h('span', { class: 'text-[12px] text-fg-muted mr-auto' });
    const sorted = [...editor.matches].sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b)));
    const free = () => cap().max - items().length;
    const paint = () => {
      const visible = sorted.filter((m) => matchesQuery([editor.teamsById[m.teamAId]?.name, editor.teamsById[m.teamBId]?.name, m.tournament, m.stage], query));
      list.replaceChildren(
        ...(visible.length
          ? visible.map((m) => {
              const disabled = used.has(m.id);
              const id = `pick-${m.id}`;
              return h(
                'label',
                { for: id, class: ['flex items-center gap-3 px-2 py-2 rounded-[8px]', disabled ? 'opacity-40' : 'hover:bg-hover cursor-pointer'] },
                h('input', {
                  id,
                  type: 'checkbox',
                  class: 'accent-[var(--color-brand)] w-4 h-4',
                  disabled,
                  checked: selected.has(m.id),
                  onChange: (e) => {
                    if (e.target.checked) {
                      if (selected.size >= free()) {
                        e.target.checked = false;
                        toast(`Можно добавить ещё ${free()} матч(а) — максимум ${cap().max}`, { type: 'warning' });
                        return;
                      }
                      selected.add(m.id);
                    } else selected.delete(m.id);
                    counter.textContent = `Выбрано: ${selected.size}`;
                  },
                }),
                teamAvatar(editor.teamsById[m.teamAId], 22),
                teamAvatar(editor.teamsById[m.teamBId], 22),
                h('span', { class: 'text-[13px] truncate flex-1' }, matchOptionLabel(m, editor.teamsById)),
                disabled ? h('span', { class: 'badge' }, 'уже добавлен') : null,
              );
            })
          : [h('div', { class: 'py-8 text-center text-[13px] text-fg-muted' }, editor.matches.length ? 'Ничего не найдено' : 'Сохранённых матчей пока нет')]),
      );
    };
    counter.textContent = 'Выбрано: 0';
    paint();
    openModal({
      title: 'Добавить матчи',
      description: `Свободно мест: ${free()} из ${cap().max}.`,
      width: 560,
      content: [h('div', { class: 'mb-3' }, textInput({ placeholder: 'Поиск по командам и турниру', autofocus: true, onInput: (v) => ((query = v), paint()) })), list],
      footer: ({ close }) => [
        counter,
        h('button', { class: 'btn', onClick: () => close() }, 'Отмена'),
        h(
          'button',
          {
            class: 'btn btn-primary',
            onClick: () => {
              const add = sorted.filter((m) => selected.has(m.id)).map((m) => snapshotMatch(m, editor.teamsById));
              if (add.length) setItems([...items(), ...add], 'Добавление матчей');
              close();
            },
          },
          'Добавить',
        ),
      ],
    });
  }

  function addManual() {
    if (items().length >= cap().max) return toast(`Максимум ${cap().max} матчей`, { type: 'warning' });
    const next = manualMatchItem(null, null, { timezone: DEFAULT_TIMEZONE, startDate: editor.getState().data.date || '' });
    next.teamA = { teamId: null, name: 'Команда 1', shortName: '', logoAssetId: null };
    next.teamB = { teamId: null, name: 'Команда 2', shortName: '', logoAssetId: null };
    expanded.add(items().length);
    setItems([...items(), next], 'Ручной матч');
  }

  function teamSelect(item, side, i) {
    const t = item[side];
    const options = [{ value: '__custom', label: 'Своё название…' }, ...editor.teams.map((x) => ({ value: x.id, label: x.name }))];
    return h(
      'div',
      { class: 'flex flex-col gap-1.5' },
      select({
        value: t?.teamId ?? '__custom',
        options,
        onChange: (v) => {
          const next = [...items()];
          next[i] = { ...next[i], matchId: null, [side]: v === '__custom' ? { teamId: null, name: t?.name ?? '', shortName: '', logoAssetId: null } : snapshotTeam(editor.teamsById[v]) };
          setItems(next, 'Команда');
        },
      }),
      !t?.teamId
        ? textInput({
            value: t?.name ?? '',
            placeholder: 'Название команды',
            maxLength: 60,
            onInput: (v) => {
              const next = [...items()];
              next[i] = { ...next[i], [side]: { ...next[i][side], name: v } };
              setItems(next, 'Название команды', `md-${i}-${side}`);
            },
          })
        : null,
    );
  }

  function patchItem(i, patch, label, coalesce) {
    const next = [...items()];
    next[i] = { ...next[i], ...patch };
    setItems(next, label, coalesce);
  }

  function render() {
    const list = items();
    const { max } = cap();
    const over = list.length > max;
    el.replaceChildren(...compact(
      panelSection(
        'Матчи в афише',
        h('div', { class: 'flex items-center justify-between text-[12px]' }, h('span', { class: over ? 'text-danger' : 'text-fg-muted' }, `${list.length} из ${max}`), h('span', { class: 'text-fg-faint' }, 'Порядок = порядок на постере')),
        over ? infoNote(`Шаблон вмещает не больше ${max} матчей. Удалите лишние или разделите афишу на две публикации.`, 'warn') : null,
        h(
          'div',
          { class: 'flex flex-col gap-1.5' },
          list.map((item, i) => {
            const open = expanded.has(i);
            return h(
              'div',
              { class: 'rounded-[9px] border border-line bg-base/50' },
              h(
                'div',
                { class: 'flex items-center gap-2 px-2.5 py-2' },
                h('span', { class: 'w-5 text-[11px] tabular-nums text-fg-faint text-center' }, String(i + 1).padStart(2, '0')),
                teamAvatar(item.teamA, 20),
                teamAvatar(item.teamB, 20),
                h(
                  'button',
                  { class: 'flex-1 min-w-0 text-left', 'aria-expanded': String(open), onClick: () => (open ? expanded.delete(i) : expanded.add(i), render()) },
                  h('div', { class: 'text-[12.5px] truncate' }, `${item.teamA?.name || '—'} vs ${item.teamB?.name || '—'}`),
                  h('div', { class: 'text-[11px] text-fg-faint truncate' }, [item.startDate, item.startTime, item.format, item.matchId ? '' : 'вручную'].filter(Boolean).join(' · ')),
                ),
                h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Выше', 'aria-label': 'Переместить выше', disabled: i === 0, onClick: () => move(i, -1) }, icon('chevronUp', { size: 14 })),
                h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Ниже', 'aria-label': 'Переместить ниже', disabled: i === list.length - 1, onClick: () => move(i, 1) }, icon('chevronDown', { size: 14 })),
                h('button', { class: 'btn btn-ghost btn-icon btn-sm hover:!text-danger', title: 'Убрать', 'aria-label': 'Убрать матч', onClick: () => (expanded.clear(), setItems(list.filter((_, j) => j !== i), 'Удаление матча')) }, icon('x', { size: 14 })),
              ),
              open
                ? h(
                    'div',
                    { class: 'grid grid-cols-2 gap-2.5 px-2.5 pb-3 pt-1 border-t border-line' },
                    field({ label: 'Команда 1', children: teamSelect(item, 'teamA', i) }),
                    field({ label: 'Команда 2', children: teamSelect(item, 'teamB', i) }),
                    field({ label: 'Дата', children: textInput({ type: 'date', value: item.startDate, onChange: (v) => patchItem(i, { startDate: v }, 'Дата') }) }),
                    field({ label: 'Время', children: textInput({ type: 'time', value: item.startTime, onChange: (v) => patchItem(i, { startTime: v }, 'Время') }) }),
                    field({ label: 'Часовой пояс', className: 'col-span-2', children: select({ value: item.timezone || DEFAULT_TIMEZONE, options: TIMEZONES.map((t) => ({ value: t.id, label: t.label })), onChange: (v) => patchItem(i, { timezone: v }, 'Часовой пояс') }) }),
                    field({ label: 'Формат', className: 'col-span-2', children: segmented({ value: item.format, options: FORMAT_IDS.map((f) => ({ value: f, label: f })), onChange: (v) => patchItem(i, { format: v }, 'Формат') }) }),
                    field({ label: 'Турнир', children: textInput({ value: item.tournament, maxLength: 120, onInput: (v) => patchItem(i, { tournament: v }, 'Турнир', `md-${i}-t`) }) }),
                    field({ label: 'Стадия', children: textInput({ value: item.stage, maxLength: 80, onInput: (v) => patchItem(i, { stage: v }, 'Стадия', `md-${i}-s`) }) }),
                    item.matchId ? h('p', { class: 'col-span-2 field-hint' }, 'Правки здесь меняют только эту публикацию, не сам матч.') : null,
                  )
                : null,
            );
          }),
        ),
        h(
          'div',
          { class: 'grid grid-cols-2 gap-2' },
          h('button', { class: 'btn', disabled: list.length >= max, onClick: addFromMatches }, icon('plus', { size: 14 }), 'Из матчей'),
          h('button', { class: 'btn', disabled: list.length >= max, onClick: addManual }, icon('edit', { size: 14 }), 'Вручную'),
        ),
      ),
      panelSection('Дата афиши', field({ label: 'Игровой день', hint: 'Показывается в заголовке, если шаблон это поддерживает', children: textInput({ type: 'date', value: editor.getState().data.date ?? '', onChange: (v) => editor.setData({ ...editor.getState().data, date: v }, { label: 'Дата афиши' }) }) })),
      textsSection(editor),
    ));
  }

  function move(i, dir) {
    const list = [...items()];
    const j = i + dir;
    [list[i], list[j]] = [list[j], list[i]];
    expanded.clear();
    setItems(list, 'Порядок матчей');
  }

  return {
    el,
    refresh(meta) {
      const active = document.activeElement;
      if (meta?.type === 'commit' && active && el.contains(active) && active.tagName === 'INPUT' && active.type !== 'checkbox') return;
      render();
    },
  };
}
