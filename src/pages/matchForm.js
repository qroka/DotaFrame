/** Create / edit a match series on its own page (S-01A). */
import { h } from '../core/dom.js';
import { on } from '../core/events.js';
import { stableStringify } from '../core/utils.js';
import { teams as teamsRepo, matches as matchesRepo, projects as projectsRepo, emptyMatch, ValidationError } from '../data/repos.js';
import { icon } from '../ui/icons.js';
import { field, textInput, select, segmented, teamAvatar, nextId } from '../ui/controls.js';
import { confirmDialog, toast } from '../ui/feedback.js';
import { FORMATS, FORMAT_IDS, STATUSES, finalScores, validateScore, validateMatch } from '../domain/series.js';
import { TIMEZONES, relativeTime } from '../domain/time.js';
import { navigate } from '../app/router.js';
import { getTemplate } from '../templates/index.js';
import { openTeamDialog } from './teamDialog.js';
import { openPublishMenu } from './publishMenu.js';

const editable = (m) => {
  const { createdAt, updatedAt, ...rest } = m;
  return rest;
};

export async function matchFormPage({ params = {}, query = {} } = {}) {
  const isNew = !params.id || params.id === 'new';
  const existing = isNew ? null : await matchesRepo.get(params.id);
  if (!isNew && !existing) {
    return {
      title: 'Матч не найден',
      el: h('div', { class: 'max-w-[760px] mx-auto px-8 py-16 text-center' }, h('h1', { class: 'page-title' }, 'Матч не найден'), h('p', { class: 'mt-2 text-fg-muted' }, 'Возможно, он был удалён.'), h('a', { class: 'btn mt-6', href: '#/matches' }, 'К списку матчей')),
    };
  }

  let m = existing ? editable(existing) : { ...emptyMatch(), teamAId: query.team ?? '' };
  let saved = stableStringify(m);
  let errors = {};
  let teams = await teamsRepo.list();
  let saving = false;
  let attempted = false;

  const ids = { a: nextId('ta'), b: nextId('tb'), tour: nextId('tour'), stage: nextId('st'), date: nextId('d'), time: nextId('tm'), tz: nextId('tz'), notes: nextId('n'), sa: nextId('sa'), sb: nextId('sb') };
  const tourList = nextId('tl');

  const body = h('div', { class: 'flex flex-col' });
  const pubs = h('div');
  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Сохранить');
  const pubBtn = h('button', { type: 'button', class: 'btn', onClick: () => saveThenPublish() }, icon('sparkles', { size: 14 }), 'Сохранить и создать публикацию');
  const dirtyDot = h('span', { class: 'badge badge-warn', hidden: true }, 'Не сохранено');

  const form = h(
    'form',
    { novalidate: true, class: 'contents', onSubmit: (e) => (e.preventDefault(), save()) },
    h(
      'div',
      { class: 'max-w-[880px] mx-auto px-8 py-8 max-[700px]:px-4' },
      h('a', { href: '#/matches', class: 'inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg' }, icon('arrowLeft', { size: 14 }), 'Матчи'),
      h('header', { class: 'mt-3 flex flex-wrap items-center gap-3' }, h('h1', { class: 'page-title' }, isNew ? 'Новый матч' : 'Редактирование матча'), dirtyDot),
      !isNew ? h('p', { class: 'mt-2 text-[12.5px] text-fg-faint border-l-2 border-line-strong pl-3 leading-relaxed' }, 'Изменение матча не меняет уже сохранённые публикации — они хранят снимок данных. Новые публикации получат актуальные значения.') : null,
      body,
      h('div', { class: 'sticky bottom-0 mt-8 -mx-2 px-2 py-3 flex flex-wrap items-center gap-2 bg-base/90 backdrop-blur border-t border-line' }, h('span', { class: 'text-[12px] text-fg-faint max-[700px]:hidden' }, h('span', { class: 'kbd' }, 'Ctrl'), ' + ', h('span', { class: 'kbd' }, 'S'), ' — сохранить'), h('div', { class: 'ml-auto flex flex-wrap gap-2' }, h('a', { class: 'btn', href: '#/matches' }, 'Отмена'), pubBtn, saveBtn)),
      pubs,
    ),
  );
  const el = h('div', { class: 'min-h-full' }, form);

  const isDirty = () => stableStringify(m) !== saved;
  const updateDirty = () => (dirtyDot.hidden = !isDirty());

  function set(key, value, rerender = false) {
    m = { ...m, [key]: value };
    if (attempted) errors = validateMatch(m);
    updateDirty();
    if (rerender) render();
  }

  function section(title, desc, ...children) {
    return h(
      'section',
      { class: 'grid grid-cols-[220px_minmax(0,1fr)] gap-8 py-7 border-b border-line max-[800px]:grid-cols-1 max-[800px]:gap-4' },
      h('div', {}, h('h2', { class: 'text-[14px] font-semibold text-fg' }, title), desc ? h('p', { class: 'mt-1 text-[12.5px] text-fg-faint leading-relaxed' }, desc) : null),
      h('div', { class: 'flex flex-col gap-4 min-w-0' }, ...children),
    );
  }

  function teamSlot(key, id, label) {
    const team = teams.find((t) => t.id === m[key]);
    const otherKey = key === 'teamAId' ? 'teamBId' : 'teamAId';
    return field({
      label,
      id,
      error: errors[key],
      children: h(
        'div',
        { class: 'flex items-center gap-2' },
        teamAvatar(team, 32),
        select({
          id,
          value: m[key],
          placeholder: teams.length ? 'Выберите команду' : 'Справочник пуст',
          invalid: !!errors[key],
          options: teams.map((t) => ({ value: t.id, label: t.id === m[otherKey] ? `${t.name} (уже выбрана)` : t.name })),
          onChange: (v) => set(key, v, true),
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-icon shrink-0',
            title: 'Новая команда',
            'aria-label': `Новая команда для слота «${label}»`,
            onClick: async () => {
              const t = await openTeamDialog();
              if (t) {
                teams = await teamsRepo.list();
                set(key, t.id, true);
              }
            },
          },
          icon('plus'),
        ),
      ),
    });
  }

  function resultBlock() {
    renderResultStatus = () => {};
    const fmt = FORMATS[m.format];
    const hasScore = m.status === 'live' || m.status === 'completed';
    const v = validateScore(m.format, m.status, m.scoreA, m.scoreB);
    const teamA = teams.find((t) => t.id === m.teamAId);
    const teamB = teams.find((t) => t.id === m.teamBId);
    const scoreInput = (key, id, label) =>
      h('input', {
        id,
        type: 'number',
        min: 0,
        max: fmt?.winsNeeded ?? 3,
        step: 1,
        inputMode: 'numeric',
        class: 'input !w-[72px] text-center text-[18px] font-semibold tabular-nums !h-11',
        value: m[key] ?? '',
        'aria-label': label,
        'aria-invalid': attempted && !v.ok ? 'true' : undefined,
        onInput: (e) => {
          const raw = e.target.value;
          set(key, raw === '' ? null : Number(raw));
          renderResultStatus();
        },
      });

    let status = h('div');
    const renderResultStatusInto = () => {
      const r = validateScore(m.format, m.status, m.scoreA, m.scoreB);
      const winnerName = r.winner === 'A' ? teamA?.name : r.winner === 'B' ? teamB?.name : null;
      status.replaceChildren(
        !r.ok && (attempted || (m.scoreA !== null && m.scoreB !== null))
          ? h('div', { class: 'field-error flex items-center gap-1.5', role: 'alert' }, icon('alert', { size: 13 }), r.errors[0])
          : r.winner === 'draw'
            ? h('div', { class: 'text-[12.5px] text-fg-muted' }, 'Ничья в BO2')
            : winnerName
              ? h('div', { class: 'text-[12.5px] text-ok flex items-center gap-1.5' }, icon('trophy', { size: 13 }), `Победитель: ${winnerName}`)
              : m.status === 'live'
                ? h('div', { class: 'text-[12.5px] text-fg-faint' }, 'Текущий счёт серии')
                : null,
      );
    };
    renderResultStatus = renderResultStatusInto;

    const children = [
      field({
        label: 'Статус',
        children: segmented({
          label: 'Статус',
          value: m.status,
          options: Object.values(STATUSES).map((s) => ({ value: s.id, label: s.label })),
          onChange: (val) => {
            const patch = { status: val };
            if (val === 'scheduled' || val === 'cancelled') Object.assign(patch, { scoreA: null, scoreB: null });
            m = { ...m, ...patch };
            if (attempted) errors = validateMatch(m);
            updateDirty();
            render();
          },
        }),
      }),
    ];
    if (hasScore) {
      children.push(
        h(
          'div',
          { class: 'flex flex-col gap-3' },
          h(
            'div',
            { class: 'flex items-center gap-3 flex-wrap' },
            h('label', { for: ids.sa, class: 'flex items-center gap-2 min-w-0 text-[13px] text-fg' }, teamAvatar(teamA, 28), h('span', { class: 'truncate max-w-[180px]' }, teamA?.name ?? 'Команда 1')),
            scoreInput('scoreA', ids.sa, `Счёт: ${teamA?.name ?? 'команда 1'}`),
            h('span', { class: 'text-fg-faint text-[18px] font-semibold' }, ':'),
            scoreInput('scoreB', ids.sb, `Счёт: ${teamB?.name ?? 'команда 2'}`),
            h('label', { for: ids.sb, class: 'flex items-center gap-2 min-w-0 text-[13px] text-fg' }, h('span', { class: 'truncate max-w-[180px]' }, teamB?.name ?? 'Команда 2'), teamAvatar(teamB, 28)),
          ),
          m.status === 'completed'
            ? h(
                'div',
                { class: 'flex flex-wrap items-center gap-1.5' },
                h('span', { class: 'text-[12px] text-fg-faint mr-1' }, `Итоговые счета ${m.format}:`),
                finalScores(m.format).map(([a, b]) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      class: 'btn btn-sm tabular-nums font-mono',
                      'aria-pressed': String(m.scoreA === a && m.scoreB === b),
                      onClick: () => {
                        m = { ...m, scoreA: a, scoreB: b };
                        if (attempted) errors = validateMatch(m);
                        updateDirty();
                        render();
                      },
                    },
                    `${a}:${b}`,
                  ),
                ),
              )
            : null,
          status,
        ),
      );
    }
    return children;
  }
  let renderResultStatus = () => {};

  function render() {
    const tournaments = [...new Set(allTournaments)].sort((a, b) => a.localeCompare(b, 'ru'));
    body.replaceChildren(
      section(
        'Участники',
        'Команды выбираются из справочника. Логотипы подставятся автоматически.',
        h(
          'div',
          { class: 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 max-[640px]:grid-cols-1' },
          teamSlot('teamAId', ids.a, 'Команда 1'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost btn-icon mb-0 max-[640px]:justify-self-center',
              title: 'Поменять местами',
              'aria-label': 'Поменять команды местами',
              onClick: () => {
                m = { ...m, teamAId: m.teamBId, teamBId: m.teamAId, scoreA: m.scoreB, scoreB: m.scoreA };
                if (attempted) errors = validateMatch(m);
                updateDirty();
                render();
              },
            },
            icon('shuffle'),
          ),
          teamSlot('teamBId', ids.b, 'Команда 2'),
        ),
        !teams.length ? h('p', { class: 'text-[12.5px] text-fg-muted' }, 'Справочник пуст — добавьте команды кнопкой «+».') : null,
      ),
      section(
        'Информация',
        'Турнир, время и формат серии. Время сохраняется вместе с часовым поясом.',
        h(
          'div',
          { class: 'grid grid-cols-2 gap-4 max-[640px]:grid-cols-1' },
          field({ label: 'Турнир', id: ids.tour, error: errors.tournament, children: [textInput({ id: ids.tour, value: m.tournament, maxLength: 120, list: tourList, placeholder: 'Например, EPL Masters', invalid: !!errors.tournament, onInput: (v) => set('tournament', v) }), h('datalist', { id: tourList }, tournaments.map((t) => h('option', { value: t })))] }),
          field({ label: 'Стадия', id: ids.stage, error: errors.stage, children: textInput({ id: ids.stage, value: m.stage, maxLength: 80, placeholder: 'Групповой этап, полуфинал…', invalid: !!errors.stage, onInput: (v) => set('stage', v) }) }),
        ),
        h(
          'div',
          { class: 'grid grid-cols-[1fr_1fr_1.4fr] gap-4 max-[640px]:grid-cols-1' },
          field({ label: 'Дата', id: ids.date, error: errors.startDate, children: textInput({ id: ids.date, type: 'date', value: m.startDate, invalid: !!errors.startDate, onInput: (v) => set('startDate', v) }) }),
          field({ label: 'Время начала', id: ids.time, error: errors.startTime, children: textInput({ id: ids.time, type: 'time', value: m.startTime, invalid: !!errors.startTime, onInput: (v) => set('startTime', v) }) }),
          field({ label: 'Часовой пояс', id: ids.tz, children: select({ id: ids.tz, value: m.timezone, options: TIMEZONES.map((t) => ({ value: t.id, label: t.label })), onChange: (v) => set('timezone', v) }) }),
        ),
        field({
          label: 'Формат серии',
          error: errors.format,
          hint: FORMATS[m.format] ? `${FORMATS[m.format].long}: ${FORMATS[m.format].allowDraw ? 'две карты, возможна ничья 1:1' : `до ${FORMATS[m.format].winsNeeded} побед`}` : '',
          children: segmented({
            label: 'Формат серии',
            value: m.format,
            options: FORMAT_IDS.map((f) => ({ value: f, label: f })),
            onChange: (v) => {
              m = { ...m, format: v };
              if (attempted) errors = validateMatch(m);
              updateDirty();
              render();
            },
          }),
        }),
      ),
      section('Результат', 'Счёт нужен для публикаций WIN, LOSE и Series Result. Проверяется по правилам формата.', ...resultBlock()),
      section('Заметки', 'Видны только вам.', h('textarea', { id: ids.notes, class: 'input', rows: 3, maxLength: 500, 'aria-label': 'Заметки', placeholder: 'Например, ссылка на трансляцию', onInput: (e) => set('notes', e.target.value) }, m.notes ?? '')),
    );
    renderResultStatus();
    updateDirty();
  }

  async function renderPubs() {
    if (isNew || !m.id) return pubs.replaceChildren();
    const list = (await projectsRepo.list()).filter((p) => p.matchId === m.id || p.matchIds?.includes(m.id));
    pubs.replaceChildren(
      h(
        'section',
        { class: 'mt-10' },
        h('div', { class: 'flex items-center justify-between' }, h('h2', { class: 'section-title' }, `Публикации из этого матча · ${list.length}`)),
        list.length
          ? h(
              'div',
              { class: 'mt-3 border-t border-line' },
              list.map((p) =>
                h(
                  'a',
                  { href: `#/editor/${p.id}`, class: 'flex items-center gap-3 px-2 py-2.5 border-b border-line hover:bg-white/[0.02]' },
                  icon('image', { size: 15, className: 'text-fg-faint' }),
                  h('span', { class: 'text-[13px] text-fg truncate flex-1' }, p.title || getTemplate(p.templateId)?.name || p.templateId),
                  h('span', { class: 'badge' }, getTemplate(p.templateId)?.name ?? p.templateId),
                  h('span', { class: 'text-[12px] text-fg-faint w-[110px] text-right' }, relativeTime(p.updatedAt)),
                ),
              ),
            )
          : h('p', { class: 'mt-3 text-[13px] text-fg-faint' }, 'Пока нет — создайте первую публикацию кнопкой выше.'),
      ),
    );
  }

  async function save({ quiet = false, publish = false } = {}) {
    if (saving) return null;
    attempted = true;
    errors = validateMatch(m);
    if (Object.keys(errors).length) {
      render();
      el.querySelector('[aria-invalid="true"], .field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.querySelector('[aria-invalid="true"]')?.focus({ preventScroll: true });
      toast(Object.values(errors)[0], { type: 'error' });
      return null;
    }
    saving = true;
    saveBtn.disabled = pubBtn.disabled = true;
    try {
      const rec = await matchesRepo.save(m);
      m = editable(rec);
      saved = stableStringify(m);
      updateDirty();
      if (!quiet) toast(isNew ? 'Матч создан' : 'Матч сохранён', { type: 'success' });
      if (isNew) navigate(`/matches/${rec.id}`, publish ? { publish: '1' } : undefined, { replace: true, force: true });
      else render();
      return rec;
    } catch (err) {
      if (err instanceof ValidationError) {
        errors = err.errors;
        render();
      }
      toast(err.message, { type: 'error' });
      return null;
    } finally {
      saving = false;
      saveBtn.disabled = pubBtn.disabled = false;
    }
  }

  async function saveThenPublish() {
    if (isNew) {
      // The page is replaced by /matches/:id?publish=1 which opens the menu itself.
      if (await save({ quiet: true, publish: true })) toast('Матч создан', { type: 'success' });
      return;
    }
    const rec = isDirty() ? await save({ quiet: true }) : existing;
    if (rec) openPublishMenu(pubBtn, rec);
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  }
  document.addEventListener('keydown', onKey);

  const allTournaments = (await matchesRepo.list()).map((x) => x.tournament).filter(Boolean);
  render();
  renderPubs();
  if (query.publish && existing) {
    setTimeout(() => {
      history.replaceState(null, '', `#/matches/${existing.id}`);
      if (pubBtn.isConnected) openPublishMenu(pubBtn, existing);
    }, 60);
  }
  const off = on('data:changed', async ({ store }) => {
    if (store === 'teams') {
      teams = await teamsRepo.list();
      render();
    }
    if (store === 'projects') renderPubs();
  });

  return {
    el,
    title: isNew ? 'Новый матч' : 'Редактирование матча',
    isDirty,
    async canLeave() {
      if (!isDirty()) return true;
      return confirmDialog({ title: 'Уйти без сохранения?', message: 'Изменения матча будут потеряны.', confirmLabel: 'Уйти', cancelLabel: 'Остаться', danger: true });
    },
    destroy() {
      document.removeEventListener('keydown', onKey);
      off();
    },
  };
}
