/**
 * Data panel for templates with source 'match' (Announcement, WIN, LOSE, Series Result).
 * The poster renders from the project's snapshot; the user explicitly refreshes it
 * from the live match when needed.
 */
import { h, compact } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { emptyState, field, segmented, select, teamAvatar } from '../../ui/controls.js';
import { buildMatchData, defaultPerspective } from '../../domain/snapshot.js';
import { FORMATS, STATUSES, scoreLabel } from '../../domain/series.js';
import { formatDateRu, formatDateTimeShort, matchSortKey } from '../../domain/time.js';
import { confirmDialog, toast } from '../../ui/feedback.js';
import { panelSection, textsSection, infoNote } from './common.js';

export function matchOptionLabel(m, teamsById) {
  const a = teamsById[m.teamAId]?.name ?? '?';
  const b = teamsById[m.teamBId]?.name ?? '?';
  const date = m.startDate ? ` · ${formatDateRu(m.startDate)}` : '';
  const score = scoreLabel(m) ? ` · ${scoreLabel(m)}` : '';
  return `${a} vs ${b}${score}${date}`;
}

export function createMatchPanel(editor) {
  const el = h('div', { class: 'flex flex-col' });

  function staleness(data) {
    const live = editor.matches.find((m) => m.id === data.matchId);
    if (!live) return data.matchId ? 'missing' : null;
    const captured = data.capturedAt ?? '';
    const teamA = editor.teamsById[live.teamAId];
    const teamB = editor.teamsById[live.teamBId];
    if ((live.updatedAt ?? '') > captured || (teamA?.updatedAt ?? '') > captured || (teamB?.updatedAt ?? '') > captured) return 'stale';
    return null;
  }

  function useMatch(matchId, label = 'Выбор матча') {
    const m = editor.matches.find((x) => x.id === matchId);
    if (!m) return;
    const s = editor.getState();
    const perspective = s.data.matchId === matchId ? s.data.perspective : defaultPerspective(m, editor.template.type);
    editor.setData(buildMatchData(m, editor.teamsById, { texts: s.data.texts ?? {}, perspective }), { label });
    editor.setMatchId(matchId);
  }

  function render() {
    const { data } = editor.getState();
    const sorted = [...editor.matches].sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));
    if (!sorted.length) {
      el.replaceChildren(
        emptyState({
          icon: 'swords',
          title: 'Нет матчей',
          text: 'Публикация строится на данных матча. Создайте матч — команды, турнир и время подставятся автоматически.',
          action: h('a', { class: 'btn btn-primary', href: '#/matches/new' }, icon('plus', { size: 14 }), 'Создать матч'),
        }),
      );
      return;
    }

    const state = staleness(data);
    const teams = [data.teamA, data.teamB];
    const fmt = FORMATS[data.format];

    el.replaceChildren(...compact(
      panelSection(
        'Матч',
        field({
          label: 'Источник данных',
          children: select({
            value: data.matchId ?? '',
            placeholder: data.matchId ? undefined : 'Выберите матч…',
            options: sorted.map((m) => ({ value: m.id, label: matchOptionLabel(m, editor.teamsById) })),
            onChange: async (id) => {
              if (!id) return;
              if (data.matchId && id !== data.matchId) {
                const ok = await confirmDialog({ title: 'Сменить матч?', message: 'Данные постера будут заменены данными выбранного матча. Тексты и оформление сохранятся.', confirmLabel: 'Сменить' });
                if (!ok) return render();
              }
              useMatch(id);
            },
          }),
        }),
        data.matchId
          ? h(
              'div',
              { class: 'rounded-[10px] border border-line bg-base/60 p-3 flex flex-col gap-2.5' },
              ...teams.map((t, i) =>
                h(
                  'div',
                  { class: 'flex items-center gap-2.5 min-w-0' },
                  teamAvatar({ name: t?.name, shortName: t?.shortName, logoAssetId: t?.logoAssetId }, 26),
                  h('span', { class: ['truncate text-[13px] flex-1', data.winner === (i ? 'B' : 'A') ? 'font-semibold text-fg' : 'text-fg-muted'] }, t?.name ?? '—'),
                  h('span', { class: 'tabular-nums text-[13px] font-semibold' }, (i ? data.scoreB : data.scoreA) ?? ''),
                ),
              ),
              h(
                'div',
                { class: 'flex flex-wrap gap-1.5 pt-1' },
                h('span', { class: 'badge' }, fmt?.label ?? data.format),
                h('span', { class: ['badge', data.status === 'completed' && 'badge-ok', data.status === 'live' && 'badge-brand'] }, STATUSES[data.status]?.label ?? data.status),
                data.tournament ? h('span', { class: 'badge max-w-full truncate' }, data.tournament) : null,
              ),
              h('div', { class: 'text-[11.5px] text-fg-faint' }, `Снимок данных: ${formatDateTimeShort(data.capturedAt)}`),
            )
          : null,
        state === 'stale'
          ? h(
              'div',
              { class: 'flex flex-col gap-2 rounded-[8px] border border-warn/30 bg-warn/5 p-3' },
              infoNote('Матч или команды изменились после снимка. Постер показывает сохранённые значения.', 'warn'),
              h('button', { class: 'btn btn-sm self-start', onClick: () => (useMatch(data.matchId, 'Обновление данных'), toast('Данные обновлены из матча', { type: 'success' })) }, icon('refresh', { size: 13 }), 'Обновить из матча'),
            )
          : null,
        state === 'missing' ? infoNote('Исходный матч удалён. Постер продолжает использовать сохранённый снимок.', 'warn') : null,
        data.matchId && state !== 'missing' ? h('a', { class: 'text-[12px] text-fg-muted hover:text-fg inline-flex items-center gap-1.5', href: `#/matches/${data.matchId}` }, icon('edit', { size: 12 }), 'Редактировать матч') : null,
      ),
      data.matchId && editor.template.type !== 'series-result'
        ? panelSection(
            'Наша команда',
            segmented({
              value: data.perspective ?? 'A',
              label: 'Наша команда',
              options: [
                { value: 'A', label: data.teamA?.shortName || data.teamA?.name || 'A' },
                { value: 'B', label: data.teamB?.shortName || data.teamB?.name || 'B' },
              ],
              onChange: (v) => editor.setData({ ...editor.getState().data, perspective: v }, { label: 'Наша команда' }),
            }),
            infoNote('Определяет, чьим глазами сделан постер: соперник, WIN/LOSE и порядок счёта.'),
          )
        : null,
      textsSection(editor),
    ));
  }

  return {
    el,
    refresh(meta) {
      const active = document.activeElement;
      if (meta?.type === 'commit' && active && el.contains(active) && active.tagName === 'INPUT') return;
      render();
    },
  };
}
