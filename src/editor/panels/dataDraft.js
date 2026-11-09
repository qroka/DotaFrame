/**
 * Editor data panel for templates with source 'draft' (Dota Draft).
 *
 * The working GameDraft is derived from the project's own snapshot (hero ids), so an
 * old project always shows its historical draft. Every edit rebuilds the snapshot
 * (names + immutable portrait asset ids) and hands it to the editor. On project save
 * the GameDraft is persisted (one record per match + map).
 *
 * createDraftPanel(editor) → { el, refresh(), beforeSave(), destroy() }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { select, segmented, emptyState, teamAvatar } from '../../ui/controls.js';
import { openModal, toast } from '../../ui/feedback.js';
import { HEROES, HEROES_BY_ID, ATTRIBUTES, getHero, searchHeroes, heroInitials } from '../../data/heroes.js';
import { portraitMap } from '../../data/heroPortraits.js';
import { assetUrls } from '../../data/media.js';
import { drafts as draftRepo, emptyDraft } from '../../data/repos.js';
import { buildDraftData } from '../../domain/snapshot.js';
import { validateDraft, swapSides, heroLocation, draftFromSnapshot, isDraftEmpty, MAX_BANS_PER_SIDE, PICKS_PER_SIDE } from '../../domain/draft.js';
import { mapsInFormat } from '../../domain/series.js';
import { on } from '../../core/events.js';

const LOCATION_LABEL = {
  picksRadiant: 'уже в пиках Radiant',
  picksDire: 'уже в пиках Dire',
  bansRadiant: 'уже в банах Radiant',
  bansDire: 'уже в банах Dire',
};

export function createDraftPanel(editor) {
  let portraits = {};
  let urls = {}; // assetId -> url
  let draft = draftFromSnapshot(editor.getState().data);
  let selfUpdate = false;
  const el = h('div', { class: 'flex flex-col', dataset: { panel: 'draft' } });

  const matchOf = (id) => editor.matches.find((m) => m.id === id) ?? null;
  const teamName = (id) => editor.teamsById[id]?.name ?? 'Команда не найдена';

  async function loadPortraits() {
    try {
      portraits = await portraitMap();
      urls = await assetUrls(Object.values(portraits));
    } catch {
      portraits = {};
      urls = {};
    }
  }

  /** Rebuild the snapshot from the working draft and push it to the editor. */
  function commit(next, label = 'Драфт', coalesce) {
    draft = next;
    const match = matchOf(draft.matchId);
    const data = editor.getState().data ?? {};
    let snapshot;
    if (match) {
      snapshot = buildDraftData(match, draft, editor.teamsById, HEROES_BY_ID, portraits, { texts: data.texts ?? {} });
    } else {
      snapshot = { ...data, matchId: null, picksRadiant: [], picksDire: [], bansRadiant: [], bansDire: [] };
    }
    snapshot.draftId = draft.id ?? data.draftId ?? null;
    selfUpdate = true;
    try {
      editor.setData(snapshot, { label, coalesce });
    } finally {
      selfUpdate = false;
    }
    render();
  }

  /* ---------------- Hero tile ---------------- */

  function heroTile(heroId, { size = 44, ban = false } = {}) {
    const hero = getHero(heroId);
    const attr = ATTRIBUTES[hero?.attr] ?? ATTRIBUTES.all;
    const url = hero && portraits[hero.id] ? urls[portraits[hero.id]] : null;
    const box = h('div', {
      class: 'relative shrink-0 rounded-[6px] overflow-hidden grid place-items-center text-[11px] font-bold',
      style: { width: `${size}px`, height: `${size}px`, background: `linear-gradient(160deg, ${attr.color}33, ${attr.color}12)`, color: attr.color, boxShadow: `inset 0 0 0 1px ${attr.color}40` },
    });
    if (url) box.append(h('img', { src: url, alt: '', class: 'absolute inset-0 w-full h-full object-cover', style: ban ? { filter: 'grayscale(1) brightness(0.7)' } : undefined }));
    else box.append(heroInitials(hero ?? String(heroId)));
    if (ban) box.append(h('div', { class: 'absolute inset-0', html: '<svg viewBox="0 0 10 10" preserveAspectRatio="none" width="100%" height="100%"><line x1="0" y1="10" x2="10" y2="0" stroke="#ff5b5b" stroke-width="0.7"/></svg>' }));
    return box;
  }

  /* ---------------- Hero picker ---------------- */

  /**
   * Open the picker for a slot. `target` = { key, index } (index null → append to bans).
   */
  function openPicker(target) {
    const currentId = target.index !== null ? draft[target.key][target.index] : null;
    let query = '';
    let attr = '';
    const grid = h('div', { class: 'grid gap-1.5', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }, role: 'listbox', 'aria-label': 'Герои' });
    const countEl = h('div', { class: 'text-[12px] text-fg-faint' });
    const search = h('input', { type: 'search', class: 'input', placeholder: 'Поиск героя: имя, сокращение, по-русски…', autofocus: true, 'aria-label': 'Поиск героя' });
    const sideLabel = { picksRadiant: 'Пик Radiant', picksDire: 'Пик Dire', bansRadiant: 'Бан Radiant', bansDire: 'Бан Dire' }[target.key];

    let modal;
    const choose = (hero) => {
      const next = structuredClone(draft);
      if (target.index === null) next[target.key].push(hero.id);
      else next[target.key][target.index] = hero.id;
      modal.close();
      commit(next, target.key.startsWith('bans') ? 'Бан' : 'Пик');
    };

    const available = (hero) => {
      const loc = heroLocation(draft, hero.id);
      return !loc || hero.id === currentId ? null : LOCATION_LABEL[loc];
    };

    function paint() {
      const list = searchHeroes(query, { attr: attr || undefined });
      countEl.textContent = list.length ? `Найдено: ${list.length}` : '';
      grid.replaceChildren(
        ...(list.length
          ? list.map((hero) => {
              const blocked = available(hero);
              return h(
                'button',
                {
                  type: 'button',
                  role: 'option',
                  class: ['flex flex-col items-center gap-1.5 p-1.5 rounded-[8px] border text-center transition-colors', hero.id === currentId ? 'border-brand bg-brand-soft' : 'border-transparent hover:bg-hover hover:border-line-strong', blocked && 'opacity-35'],
                  disabled: !!blocked,
                  title: blocked ? `${hero.name} — ${blocked}` : hero.name,
                  'aria-selected': String(hero.id === currentId),
                  dataset: { heroId: String(hero.id) },
                  onClick: () => choose(hero),
                },
                heroTile(hero.id, { size: 48 }),
                h('span', { class: 'text-[11px] leading-tight text-fg line-clamp-2' }, hero.name),
                blocked ? h('span', { class: 'text-[10px] leading-tight text-fg-muted' }, blocked) : null,
              );
            })
          : [h('div', { class: 'col-span-full py-10 text-center text-[13px] text-fg-muted' }, 'Герой не найден. Попробуйте английское название или сокращение.')]),
      );
    }

    search.addEventListener('input', () => {
      query = search.value;
      paint();
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        grid.querySelector('button:not([disabled])')?.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        grid.querySelector('button:not([disabled])')?.focus();
      }
    });
    grid.addEventListener('keydown', (e) => {
      const items = [...grid.querySelectorAll('button:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      if (i < 0) return;
      const cols = Math.max(1, Math.round(grid.clientWidth / 90));
      const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (move) {
        e.preventDefault();
        const j = i + move;
        if (j < 0) search.focus();
        else items[Math.min(items.length - 1, j)]?.focus();
      }
    });

    const attrSeg = segmented({
      value: '',
      label: 'Атрибут',
      options: [{ value: '', label: 'Все' }, ...Object.values(ATTRIBUTES).map((a) => ({ value: a.id, label: a.short, title: a.label }))],
      onChange: (v) => {
        attr = v;
        paint();
      },
    });

    modal = openModal({
      title: `Выбор героя · ${sideLabel}`,
      description: 'Герои, уже выбранные или забаненные на этой карте, недоступны. Enter — выбрать первого в списке, Esc — закрыть.',
      width: 760,
      content: [h('div', { class: 'flex flex-col gap-3' }, h('div', { class: 'flex gap-2 items-center' }, h('div', { class: 'flex-1' }, search), h('div', { class: 'w-[220px]' }, attrSeg)), countEl, h('div', { class: 'max-h-[52vh] overflow-auto -mx-1 px-1' }, grid))],
      footer: ({ close }) => [
        currentId !== null && currentId !== undefined
          ? h(
              'button',
              {
                class: 'btn btn-danger mr-auto',
                onClick: () => {
                  close();
                  removeAt(target);
                },
              },
              icon('trash', { size: 14 }),
              'Убрать героя',
            )
          : null,
        h('button', { class: 'btn', onClick: () => close() }, 'Отмена'),
      ].filter(Boolean),
    });
    paint();
  }

  function removeAt({ key, index }) {
    const next = structuredClone(draft);
    if (key.startsWith('picks')) next[key][index] = null;
    else next[key].splice(index, 1);
    commit(next, 'Удаление героя');
  }

  /* ---------------- Sections ---------------- */

  function section(title, ...children) {
    return h('section', { class: 'panel-section flex flex-col gap-3' }, title ? h('div', { class: 'section-title' }, title) : null, ...children);
  }

  function sideBlock(side) {
    const isRad = side === 'radiant';
    const picksKey = isRad ? 'picksRadiant' : 'picksDire';
    const bansKey = isRad ? 'bansRadiant' : 'bansDire';
    const teamId = isRad ? draft.radiantTeamId : draft.direTeamId;
    const color = isRad ? '#3ddc84' : '#ff5b5b';
    const team = editor.teamsById[teamId];

    const picks = h(
      'div',
      { class: 'grid grid-cols-5 gap-1.5' },
      draft[picksKey].map((heroId, index) => {
        const hero = getHero(heroId);
        return h(
          'button',
          {
            type: 'button',
            class: ['group relative aspect-square rounded-[7px] grid place-items-center transition-colors', hero ? 'hover:ring-1 hover:ring-fg-faint' : 'border border-dashed border-line-strong text-fg-faint hover:border-fg-faint hover:text-fg-muted'],
            title: hero ? `${hero.name} — заменить` : `Пик ${index + 1}`,
            'aria-label': hero ? `${isRad ? 'Radiant' : 'Dire'}, пик ${index + 1}: ${hero.name}. Заменить` : `${isRad ? 'Radiant' : 'Dire'}, пик ${index + 1}: выбрать героя`,
            dataset: { slot: `${picksKey}-${index}` },
            onClick: () => openPicker({ key: picksKey, index }),
          },
          hero ? heroTile(heroId, { size: 52 }) : h('span', { class: 'text-[12px] font-semibold tabular-nums' }, String(index + 1)),
        );
      }),
    );
    const pickNames = h(
      'div',
      { class: 'grid grid-cols-5 gap-1.5 -mt-1.5' },
      draft[picksKey].map((id) => h('div', { class: 'text-[10px] leading-tight text-fg-faint truncate text-center' }, getHero(id)?.name ?? '')),
    );

    const bans = h(
      'div',
      { class: 'flex flex-wrap gap-1.5 items-center' },
      draft[bansKey].map((heroId, index) =>
        h(
          'button',
          {
            type: 'button',
            class: 'relative rounded-[6px] hover:ring-1 hover:ring-fg-faint',
            title: `${getHero(heroId)?.name ?? heroId} — заменить или убрать`,
            'aria-label': `Бан ${index + 1}: ${getHero(heroId)?.name ?? heroId}`,
            dataset: { slot: `${bansKey}-${index}` },
            onClick: () => openPicker({ key: bansKey, index }),
          },
          heroTile(heroId, { size: 34, ban: true }),
        ),
      ),
      draft[bansKey].length < MAX_BANS_PER_SIDE
        ? h(
            'button',
            {
              type: 'button',
              class: 'h-[34px] px-2.5 rounded-[6px] border border-dashed border-line-strong text-[12px] text-fg-muted hover:text-fg hover:border-fg-faint inline-flex items-center gap-1',
              dataset: { addBan: side },
              onClick: () => openPicker({ key: bansKey, index: null }),
            },
            icon('plus', { size: 13 }),
            'Бан',
          )
        : h('span', { class: 'text-[11px] text-fg-faint' }, `Максимум ${MAX_BANS_PER_SIDE}`),
    );

    return h(
      'div',
      { class: 'flex flex-col gap-2.5', dataset: { side } },
      h(
        'div',
        { class: 'flex items-center gap-2 min-w-0' },
        h('span', { class: 'w-1.5 h-4 rounded-full shrink-0', style: { background: color } }),
        h('span', { class: 'text-[12px] font-semibold uppercase tracking-wide', style: { color } }, isRad ? 'Radiant' : 'Dire'),
        team ? teamAvatar(team, 20) : null,
        h('span', { class: 'text-[13px] text-fg truncate' }, team?.name ?? '—'),
        h('span', { class: 'ml-auto text-[11px] text-fg-faint tabular-nums' }, `${draft[picksKey].filter((v) => v !== null).length}/${PICKS_PER_SIDE}`),
      ),
      picks,
      pickNames,
      h('div', { class: 'flex items-center justify-between' }, h('span', { class: 'text-[11px] text-fg-faint' }, `Баны · ${draft[bansKey].length}`)),
      bans,
    );
  }

  async function onPickMatch(id) {
    const match = matchOf(id);
    if (!match) return commit({ ...draft, matchId: null }, 'Матч');
    const keepHeroes = draft.matchId === null || draft.matchId === undefined || draft.matchId === '';
    let next = { ...emptyDraft(match, Math.min(draft.mapNumber || 1, mapsInFormat(match.format))), picksRadiant: keepHeroes ? draft.picksRadiant : [null, null, null, null, null], picksDire: keepHeroes ? draft.picksDire : [null, null, null, null, null], bansRadiant: keepHeroes ? draft.bansRadiant : [], bansDire: keepHeroes ? draft.bansDire : [] };
    next = await maybeLoadStored(next);
    commit(next, 'Матч');
  }

  async function onPickMap(n) {
    let next = { ...draft, mapNumber: Number(n) };
    const stored = draft.matchId ? await draftRepo.find(draft.matchId, Number(n)).catch(() => null) : null;
    if (stored && isDraftEmpty(draft)) {
      next = fromStored(stored);
      toast(`Загружен сохранённый драфт карты ${n}`, { type: 'info' });
    } else if (stored) {
      toast(`Для карты ${n} есть сохранённый драфт`, { type: 'info', action: { label: 'Загрузить', onClick: () => commit(fromStored(stored), 'Загрузка драфта') } });
    }
    commit(next, 'Номер карты');
  }

  function fromStored(stored) {
    return {
      id: stored.id,
      matchId: stored.matchId,
      mapNumber: stored.mapNumber,
      radiantTeamId: stored.radiantTeamId,
      direTeamId: stored.direTeamId,
      picksRadiant: [...stored.picksRadiant, null, null, null, null, null].slice(0, PICKS_PER_SIDE),
      picksDire: [...stored.picksDire, null, null, null, null, null].slice(0, PICKS_PER_SIDE),
      bansRadiant: [...(stored.bansRadiant ?? [])],
      bansDire: [...(stored.bansDire ?? [])],
      winner: stored.winner ?? null,
    };
  }

  async function maybeLoadStored(next) {
    if (!next.matchId || !isDraftEmpty(next)) return next;
    const stored = await draftRepo.find(next.matchId, next.mapNumber).catch(() => null);
    if (!stored) return next;
    toast(`Загружен сохранённый драфт карты ${stored.mapNumber}`, { type: 'info' });
    return fromStored(stored);
  }

  function render() {
    const match = matchOf(draft.matchId);
    const sections = [];

    if (!editor.matches.length) {
      sections.push(
        emptyState({
          icon: 'swords',
          title: 'Нет сохранённых матчей',
          text: 'Драфт всегда относится к карте конкретной серии. Сначала создайте матч между двумя командами.',
          action: h('a', { class: 'btn btn-primary', href: '#/matches/new' }, icon('plus', { size: 14 }), 'Создать матч'),
          className: 'py-10',
        }),
      );
      el.replaceChildren(...sections);
      return;
    }

    const matchOptions = [...editor.matches]
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
      .map((m) => ({ value: m.id, label: `${teamName(m.teamAId)} vs ${teamName(m.teamBId)}${m.startDate ? ` · ${m.startDate.split('-').reverse().slice(0, 2).join('.')}` : ''} · ${m.format}` }));
    const missingMatch = draft.matchId && !match;

    sections.push(
      section(
        'Матч и карта',
        select({ value: match ? draft.matchId : '', options: matchOptions, placeholder: 'Выберите матч…', onChange: onPickMatch, invalid: !match }),
        missingMatch ? h('div', { class: 'field-hint' }, 'Исходный матч удалён. Публикация показывает сохранённый снимок; выберите матч, чтобы изменить драфт.') : null,
        match
          ? h(
              'div',
              { class: 'flex flex-col gap-1.5' },
              h('div', { class: 'field-label' }, h('span', {}, 'Номер карты'), h('span', { class: 'text-fg-faint' }, match.format)),
              segmented({
                value: draft.mapNumber,
                label: 'Номер карты',
                options: Array.from({ length: mapsInFormat(match.format) }, (_, i) => ({ value: i + 1, label: `Карта ${i + 1}` })),
                onChange: onPickMap,
              }),
            )
          : null,
      ),
    );

    if (match) {
      sections.push(
        section(
          null,
          h(
            'div',
            { class: 'flex items-center justify-between' },
            h('div', { class: 'section-title' }, 'Стороны и драфт'),
            h('button', { type: 'button', class: 'btn btn-sm btn-ghost', title: 'Поменять Radiant и Dire местами', dataset: { action: 'swap' }, onClick: () => commit(swapSides(draft), 'Смена сторон') }, icon('shuffle', { size: 13 }), 'Поменять стороны'),
          ),
          sideBlock('radiant'),
          h('div', { class: 'h-px bg-line' }),
          sideBlock('dire'),
        ),
        section(
          'Победитель карты',
          segmented({
            value: draft.winner ?? '',
            label: 'Победитель карты',
            options: [
              { value: '', label: 'Не указан' },
              { value: 'radiant', label: 'Radiant' },
              { value: 'dire', label: 'Dire' },
            ],
            onChange: (v) => commit({ ...draft, winner: v || null }, 'Победитель карты'),
          }),
          h('div', { class: 'field-hint' }, 'Необязательно. Указывайте только реальный результат карты.'),
        ),
      );
    }

    const v = validateDraft(draft, match);
    const msgs = [...v.errors.map((m) => ['error', m]), ...v.warnings.map((m) => ['warning', m])];
    sections.push(
      section(
        null,
        v.complete
          ? h('div', { class: 'flex items-center gap-2 text-[12.5px] text-ok' }, icon('check', { size: 14 }), 'Драфт заполнен: по 5 героев у каждой стороны')
          : null,
        ...msgs.map(([level, m]) =>
          h('div', { class: ['flex items-start gap-2 text-[12.5px] leading-snug', level === 'error' ? 'text-danger' : 'text-warn'], role: level === 'error' ? 'alert' : undefined }, icon('alert', { size: 14, className: 'mt-0.5' }), h('span', {}, m)),
        ),
        match && !isDraftEmpty(draft)
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn btn-sm btn-ghost self-start',
                onClick: () => commit({ ...draft, picksRadiant: [null, null, null, null, null], picksDire: [null, null, null, null, null], bansRadiant: [], bansDire: [] }, 'Очистка драфта'),
              },
              icon('trash', { size: 13 }),
              'Очистить пики и баны',
            )
          : null,
      ),
    );
    el.replaceChildren(...sections);
  }

  function refresh() {
    draft = draftFromSnapshot(editor.getState().data);
    render();
  }

  const offChange = editor.on('change', () => {
    if (!selfUpdate) refresh();
  });
  const offData = on('data:changed', async ({ store } = {}) => {
    if (store === 'heroPortraits') {
      await loadPortraits();
      render();
    }
  });

  render();
  loadPortraits().then(render);

  return {
    el,
    refresh,
    /** Persist the working GameDraft (one per match + map) and record its id in the snapshot. */
    async beforeSave() {
      const match = matchOf(draft.matchId);
      if (!match) return;
      const saved = await draftRepo.save({ ...draft, matchId: match.id });
      draft = { ...draft, id: saved.id };
      const data = editor.getState().data;
      if (data.draftId !== saved.id) {
        selfUpdate = true;
        try {
          editor.setData({ ...data, draftId: saved.id }, { label: 'Сохранение драфта', coalesce: 'draft-save' });
        } finally {
          selfUpdate = false;
        }
      }
    },
    destroy() {
      offChange?.();
      offData?.();
    },
  };
}

export { HEROES };
