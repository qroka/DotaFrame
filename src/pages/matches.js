/** Matches list: search, filters, sort, multi-select for matchday, per-row publication actions. */
import { h } from '../core/dom.js';
import { on } from '../core/events.js';
import { matchesQuery } from '../core/utils.js';
import { teams as teamsRepo, matches as matchesRepo, projects as projectsRepo } from '../data/repos.js';
import { icon } from '../ui/icons.js';
import { searchInput, emptyState, teamAvatar, select, segmented } from '../ui/controls.js';
import { confirmDialog, toast, openMenu } from '../ui/feedback.js';
import { FORMAT_IDS, STATUSES, winnerOf, scoreLabel } from '../domain/series.js';
import { formatPosterDate, tzShort, weekday, matchSortKey, todayLocal } from '../domain/time.js';
import { navigate } from '../app/router.js';
import { openPublishMenu, matchdayTemplateId } from './publishMenu.js';

const MAX_MATCHDAY = 6;

export const STATUS_BADGE = { scheduled: 'badge', live: 'badge badge-danger', completed: 'badge badge-ok', cancelled: 'badge badge-warn' };

export function statusBadge(status) {
  return h('span', { class: STATUS_BADGE[status] ?? 'badge' }, status === 'live' ? h('span', { class: 'w-1.5 h-1.5 rounded-full bg-danger animate-pulse' }) : null, STATUSES[status]?.label ?? status);
}

/** Compact "A 2:1 B" line with avatars; winner highlighted. */
export function matchTeamsLine(m, teamsById, { size = 26 } = {}) {
  const a = teamsById[m.teamAId];
  const b = teamsById[m.teamBId];
  const w = winnerOf(m);
  const score = scoreLabel(m);
  const name = (t, win) => h('span', { class: ['truncate text-[13.5px]', win ? 'font-semibold text-fg' : 'text-fg', w && !win && w !== 'draw' ? 'text-fg-muted' : ''] }, t?.name ?? 'Команда удалена');
  return h(
    'div',
    { class: 'flex items-center gap-2.5 min-w-0' },
    h('div', { class: 'flex items-center gap-2 min-w-0 flex-1 justify-end' }, name(a, w === 'A'), teamAvatar(a, size)),
    h(
      'span',
      { class: ['shrink-0 min-w-[46px] text-center tabular-nums font-semibold text-[13px] rounded-[6px] px-1.5 py-0.5', score ? 'bg-raised text-fg' : 'text-fg-faint'] },
      score ? h('span', {}, h('span', { class: w === 'A' ? 'text-brand' : '' }, String(m.scoreA)), ':', h('span', { class: w === 'B' ? 'text-brand' : '' }, String(m.scoreB))) : 'vs',
    ),
    h('div', { class: 'flex items-center gap-2 min-w-0 flex-1' }, teamAvatar(b, size), name(b, w === 'B')),
  );
}

export function matchesPage() {
  const state = { query: '', status: 'all', format: '', tournament: '', sort: 'upcoming' };
  const selected = new Set();
  let all = [];
  let teamsById = {};
  let pubCount = {};

  const filters = h('div', { class: 'mt-6 flex flex-wrap items-center gap-2' });
  const bulkBar = h('div', { class: 'hidden' });
  const list = h('div', { class: 'mt-4' });
  const countEl = h('span', { class: 'text-fg-faint text-[13px] tabular-nums' });

  const el = h(
    'div',
    { class: 'max-w-[1200px] mx-auto px-8 py-8 max-[700px]:px-4' },
    h(
      'header',
      { class: 'flex flex-wrap items-end justify-between gap-4' },
      h('div', {}, h('h1', { class: 'page-title flex items-baseline gap-3' }, 'Матчи', countEl), h('p', { class: 'mt-1 text-[13px] text-fg-muted' }, 'Серии и их результаты. Из одного матча можно сделать сколько угодно публикаций.')),
      h('a', { class: 'btn btn-primary', href: '#/matches/new' }, icon('plus'), 'Создать матч'),
    ),
    filters,
    bulkBar,
    list,
  );

  function renderFilters() {
    const tournaments = [...new Set(all.map((m) => m.tournament).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
    if (state.tournament && !tournaments.includes(state.tournament)) state.tournament = '';
    filters.replaceChildren(
      searchInput({ value: state.query, placeholder: 'Команда, турнир, стадия', className: 'w-[230px] max-[700px]:w-full', onInput: (v) => ((state.query = v), renderList()) }),
      h(
        'div',
        { class: 'w-[400px] max-[1000px]:w-full' },
        segmented({
          label: 'Статус',
          value: state.status,
          options: [{ value: 'all', label: 'Все' }, ...Object.values(STATUSES).map((s) => ({ value: s.id, label: s.label }))],
          onChange: (v) => ((state.status = v), renderList()),
        }),
      ),
      select({ className: '!w-[110px]', value: state.format, placeholder: 'Формат', options: FORMAT_IDS.map((f) => ({ value: f, label: f })), onChange: (v) => ((state.format = v), renderList()) }),
      select({ className: '!w-[170px]', value: state.tournament, placeholder: 'Все турниры', options: tournaments.map((t) => ({ value: t, label: t })), onChange: (v) => ((state.tournament = v), renderList()) }),
      h(
        'div',
        { class: 'ml-auto max-[1000px]:ml-0' },
        select({
          className: '!w-[176px]',
          value: state.sort,
          options: [
            { value: 'upcoming', label: 'Сначала ближайшие' },
            { value: 'newest', label: 'Сначала поздние' },
            { value: 'updated', label: 'Недавно изменённые' },
          ],
          onChange: (v) => ((state.sort = v), renderList()),
        }),
      ),
    );
  }

  function filtered() {
    let rows = all.filter((m) => {
      if (state.status !== 'all' && m.status !== state.status) return false;
      if (state.format && m.format !== state.format) return false;
      if (state.tournament && m.tournament !== state.tournament) return false;
      const a = teamsById[m.teamAId];
      const b = teamsById[m.teamBId];
      return matchesQuery([a?.name, a?.shortName, b?.name, b?.shortName, m.tournament, m.stage], state.query);
    });
    if (state.sort === 'updated') rows.sort((x, y) => (y.updatedAt ?? '').localeCompare(x.updatedAt ?? ''));
    else if (state.sort === 'newest') rows.sort((x, y) => matchSortKey(y).localeCompare(matchSortKey(x)));
    else {
      // Upcoming first (today and later ascending), then past matches newest first.
      const today = todayLocal();
      const future = rows.filter((m) => !m.startDate || m.startDate >= today).sort((x, y) => matchSortKey(x).localeCompare(matchSortKey(y)));
      const past = rows.filter((m) => m.startDate && m.startDate < today).sort((x, y) => matchSortKey(y).localeCompare(matchSortKey(x)));
      rows = [...future, ...past];
    }
    return rows;
  }

  function renderBulk() {
    for (const id of [...selected]) if (!all.some((m) => m.id === id)) selected.delete(id);
    if (!selected.size) {
      bulkBar.className = 'hidden';
      return;
    }
    const over = selected.size > MAX_MATCHDAY;
    bulkBar.className = 'mt-4 flex flex-wrap items-center gap-3 px-3 py-2 rounded-[10px] border border-line-strong bg-raised animate-fade-in';
    bulkBar.replaceChildren(
      h('span', { class: 'text-[13px] text-fg' }, `Выбрано: ${selected.size}`),
      over ? h('span', { class: 'text-[12.5px] text-warn flex items-center gap-1.5' }, icon('alert', { size: 14 }), `В афише помещается не больше ${MAX_MATCHDAY} матчей`) : null,
      h('div', { class: 'ml-auto flex gap-2' }, h('button', { class: 'btn btn-ghost btn-sm', onClick: () => (selected.clear(), renderList()) }, 'Снять выбор'), h('button', { class: 'btn btn-primary btn-sm', disabled: over, onClick: () => createMatchday() }, icon('layers', { size: 14 }), 'Создать афишу игрового дня')),
    );
  }

  function createMatchday() {
    // Keep chronological order on the poster.
    const ids = all.filter((m) => selected.has(m.id)).sort((x, y) => matchSortKey(x).localeCompare(matchSortKey(y))).map((m) => m.id);
    if (ids.length > MAX_MATCHDAY) return toast(`Максимум ${MAX_MATCHDAY} матчей в одной афише`, { type: 'warning' });
    navigate('/new', { template: matchdayTemplateId(), matches: ids.join(',') });
  }

  function renderList() {
    countEl.textContent = all.length ? String(all.length) : '';
    renderBulk();
    if (!all.length) {
      list.replaceChildren(
        emptyState({
          icon: 'swords',
          title: 'Пока нет матчей',
          text: 'Создайте серию между двумя командами — затем из неё можно сделать анонс, результат, драфт и афишу дня.',
          action: [h('a', { class: 'btn btn-primary', href: '#/matches/new' }, icon('plus'), 'Создать матч'), h('a', { class: 'btn', href: '#/teams' }, 'К командам')],
        }),
      );
      return;
    }
    const rows = filtered();
    if (!rows.length) {
      list.replaceChildren(
        emptyState({
          icon: 'filter',
          title: 'Ничего не найдено',
          text: 'Попробуйте изменить поиск или сбросить фильтры.',
          action: h('button', { class: 'btn', onClick: () => (Object.assign(state, { query: '', status: 'all', format: '', tournament: '' }), renderFilters(), renderList()) }, 'Сбросить фильтры'),
        }),
      );
      return;
    }
    const allChecked = rows.every((m) => selected.has(m.id));
    const head = h(
      'div',
      { class: 'grid grid-cols-[28px_128px_minmax(0,1fr)_minmax(0,220px)_64px_112px_120px] gap-4 items-center px-3 py-2 text-[11.5px] font-medium text-fg-faint border-b border-line max-[1000px]:hidden' },
      h('input', { type: 'checkbox', class: 'accent-[var(--color-brand)] w-3.5 h-3.5', checked: allChecked, 'aria-label': 'Выбрать все', onChange: (e) => (rows.forEach((m) => (e.target.checked ? selected.add(m.id) : selected.delete(m.id))), renderList()) }),
      h('span', {}, 'Дата'),
      h('span', { class: 'text-center' }, 'Матч'),
      h('span', {}, 'Турнир'),
      h('span', {}, 'Формат'),
      h('span', {}, 'Статус'),
      h('span'),
    );
    list.replaceChildren(h('div', { class: 'border-t border-line', role: 'list', 'aria-label': 'Матчи' }, head, rows.map(row)));
  }

  function row(m) {
    const more = h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Ещё действия' }, icon('more'));
    more.addEventListener('click', () =>
      openMenu(more, [
        { label: 'Редактировать', icon: 'edit', onClick: () => navigate(`/matches/${m.id}`) },
        { label: 'Дублировать', icon: 'copy', onClick: () => duplicate(m) },
        'separator',
        { label: 'Удалить', icon: 'trash', danger: true, onClick: () => remove(m) },
      ]),
    );
    const pubBtn = h('button', { class: 'btn btn-sm', title: 'Создать публикацию', 'aria-label': 'Создать публикацию' }, icon('sparkles', { size: 13 }), h('span', { class: 'max-[1200px]:hidden' }, 'Публикация'));
    pubBtn.addEventListener('click', () => openPublishMenu(pubBtn, m));
    const count = pubCount[m.id] ?? 0;
    const date = m.startDate ? formatPosterDate(m.startDate, 'full') : 'Без даты';
    return h(
      'div',
      {
        role: 'listitem',
        dataset: { matchId: m.id },
        class: 'grid grid-cols-[28px_128px_minmax(0,1fr)_minmax(0,220px)_64px_112px_120px] gap-4 items-center px-3 py-2.5 border-b border-line hover:bg-white/[0.02] max-[1000px]:grid-cols-[28px_minmax(0,1fr)_auto] max-[1000px]:gap-y-2',
      },
      h('input', { type: 'checkbox', class: 'accent-[var(--color-brand)] w-3.5 h-3.5', checked: selected.has(m.id), 'aria-label': 'Выбрать матч', onChange: (e) => (e.target.checked ? selected.add(m.id) : selected.delete(m.id), renderList()) }),
      h(
        'a',
        { href: `#/matches/${m.id}`, class: 'min-w-0 max-[1000px]:order-1' },
        h('div', { class: 'text-[13px] text-fg tabular-nums' }, date, m.startDate ? h('span', { class: 'ml-1.5 text-fg-faint text-[11.5px]' }, weekday(m.startDate)) : null),
        h('div', { class: 'text-[12px] text-fg-faint tabular-nums' }, m.startTime ? `${m.startTime} ${tzShort(m.timezone)}` : '—'),
      ),
      h('a', { href: `#/matches/${m.id}`, class: 'min-w-0 max-[1000px]:order-3 max-[1000px]:col-span-3' }, matchTeamsLine(m, teamsById)),
      h(
        'div',
        { class: 'min-w-0 max-[1000px]:hidden' },
        h('div', { class: 'text-[13px] text-fg truncate' }, m.tournament || '—'),
        h('div', { class: 'text-[12px] text-fg-faint truncate' }, [m.stage, count ? `${count} публ.` : ''].filter(Boolean).join(' · ') || ' '),
      ),
      h('span', { class: 'badge font-mono max-[1000px]:hidden' }, m.format),
      h('div', { class: 'max-[1000px]:hidden' }, statusBadge(m.status)),
      h('div', { class: 'flex justify-end gap-1 max-[1000px]:order-2' }, pubBtn, more),
    );
  }

  async function duplicate(m) {
    try {
      const { id, createdAt, updatedAt, ...rest } = m;
      const copy = await matchesRepo.save({ ...rest, status: 'scheduled', scoreA: null, scoreB: null });
      toast('Матч продублирован', { type: 'success', action: { label: 'Открыть', onClick: () => navigate(`/matches/${copy.id}`) } });
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  async function remove(m) {
    const a = teamsById[m.teamAId]?.name ?? '?';
    const b = teamsById[m.teamBId]?.name ?? '?';
    const count = pubCount[m.id] ?? 0;
    const ok = await confirmDialog({
      title: `Удалить матч ${a} — ${b}?`,
      message: `Будут удалены матч и сохранённые драфты его карт.${count ? `\n\n${count} публикаций, созданных из матча, останутся без изменений — они хранят собственный снимок данных.` : ''}`,
      confirmLabel: 'Удалить матч',
      danger: true,
    });
    if (!ok) return;
    try {
      await matchesRepo.remove(m.id);
      selected.delete(m.id);
      toast('Матч удалён', { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  async function load() {
    const [m, t, p] = await Promise.all([matchesRepo.list(), teamsRepo.list(), projectsRepo.list()]);
    all = m;
    teamsById = Object.fromEntries(t.map((x) => [x.id, x]));
    pubCount = {};
    for (const pr of p) {
      const ids = new Set([pr.matchId, ...(pr.matchIds ?? [])].filter(Boolean));
      for (const id of ids) pubCount[id] = (pubCount[id] ?? 0) + 1;
    }
    renderFilters();
    renderList();
  }

  const off = on('data:changed', ({ store }) => {
    if (['matches', 'teams', 'projects'].includes(store)) load();
  });
  load();
  return { el, title: 'Матчи', destroy: off };
}
