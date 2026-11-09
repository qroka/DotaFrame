/** Template library: live previews (fictional demo data) and a start flow that picks the source match(es). */
import { h } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { listTemplates, defaultStyle, defaultTexts, TEMPLATE_TYPES } from '../templates/index.js';
import { sampleData } from '../domain/snapshot.js';
import { renderPoster } from '../render/renderPoster.js';
import { matches as matchesRepo, teams as teamsRepo } from '../data/repos.js';
import { navigate } from '../app/router.js';
import { openModal, toast } from '../ui/feedback.js';
import { teamAvatar, textInput } from '../ui/controls.js';
import { matchSortKey, formatDateRu } from '../domain/time.js';
import { scoreLabel, STATUSES } from '../domain/series.js';
import { matchesQuery } from '../core/utils.js';

const SOURCE_LABEL = { match: 'Один матч', matches: 'Несколько матчей', draft: 'Драфт карты' };

export async function templatesPage() {
  const list = listTemplates();
  const grid = h('div', { class: 'grid gap-6 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]' });
  const thumbs = [];

  for (const tpl of list) {
    const box = h('div', { class: 'relative aspect-square overflow-hidden bg-base' });
    thumbs.push({ tpl, box });
    grid.append(
      h(
        'article',
        { class: 'group flex flex-col rounded-[14px] overflow-hidden border border-line bg-panel hover:border-line-strong transition-colors', dataset: { templateCard: tpl.id } },
        h('button', { class: 'block text-left', 'aria-label': `Создать: ${tpl.name}`, onClick: () => start(tpl) }, box),
        h(
          'div',
          { class: 'flex flex-col gap-2 p-4 border-t border-line flex-1' },
          h('div', { class: 'flex items-center justify-between gap-2' }, h('h2', { class: 'text-[14px] font-semibold' }, tpl.name), h('span', { class: 'badge' }, TEMPLATE_TYPES[tpl.type])),
          h('p', { class: 'text-[12.5px] text-fg-muted leading-relaxed flex-1' }, tpl.description),
          h(
            'div',
            { class: 'flex items-center justify-between gap-2 pt-1' },
            h('span', { class: 'text-[11.5px] text-fg-faint' }, `${SOURCE_LABEL[tpl.source]} · ${tpl.exportSizes.map((s) => s.width).join(' / ')} px · v${tpl.version}`),
            h('button', { class: 'btn btn-sm btn-primary', onClick: () => start(tpl) }, 'Создать'),
          ),
        ),
      ),
    );
  }

  // Render previews sequentially (keeps the page responsive).
  (async () => {
    for (const { tpl, box } of thumbs) {
      if (!box.isConnected) await new Promise((r) => setTimeout(r, 30));
      const scaler = h('div', { class: 'absolute left-0 top-0 origin-top-left pointer-events-none' });
      box.append(scaler);
      const fit = () => (scaler.style.transform = `scale(${box.clientWidth / tpl.base.width})`);
      try {
        await renderPoster(scaler, { template: tpl, data: sampleData(tpl.source, defaultTexts(tpl)), style: defaultStyle(tpl), mode: 'thumb' });
        scaler.querySelectorAll('[data-overflow]').forEach((n) => n.removeAttribute('data-overflow'));
        fit();
        new ResizeObserver(fit).observe(box);
      } catch (err) {
        box.append(h('div', { class: 'absolute inset-0 grid place-items-center text-[12px] text-danger' }, `Ошибка превью: ${err.message}`));
      }
    }
  })();

  const el = h(
    'div',
    { class: 'max-w-[1280px] mx-auto px-8 py-8 max-sm:px-4' },
    h('div', { class: 'mb-6' }, h('h1', { class: 'page-title' }, 'Шаблоны'), h('p', { class: 'mt-1 text-[13px] text-fg-muted max-w-[720px]' }, 'Готовые композиции в одной дизайн-системе. Превью построены на вымышленных демо-данных; в публикации подставляются данные вашего матча.')),
    grid,
  );
  return { el, title: 'Шаблоны' };
}

/** Pick source match(es), then open the editor. */
export async function start(tpl) {
  const [matches, teams] = await Promise.all([matchesRepo.list(), teamsRepo.list()]);
  const teamsById = Object.fromEntries(teams.map((t) => [t.id, t]));
  if (!matches.length) {
    if (tpl.source === 'matches') return navigate('/new', { template: tpl.id });
    toast('Сначала создайте матч — публикация строится на его данных', { type: 'info', action: { label: 'Создать матч', onClick: () => navigate('/matches/new') } });
    return;
  }
  const multi = tpl.source === 'matches';
  const max = tpl.capacity?.max ?? 6;
  const selected = new Set();
  let query = '';
  const sorted = [...matches].sort((a, b) => matchSortKey(b).localeCompare(matchSortKey(a)));
  const listEl = h('div', { class: 'flex flex-col max-h-[52vh] overflow-auto -mx-1' });
  const go = (ids) => navigate('/new', multi ? { template: tpl.id, matches: ids.join(',') } : { template: tpl.id, match: ids[0] });
  let modal;

  const paint = () => {
    const visible = sorted.filter((m) => matchesQuery([teamsById[m.teamAId]?.name, teamsById[m.teamBId]?.name, m.tournament, m.stage], query));
    listEl.replaceChildren(
      ...(visible.length
        ? visible.map((m) => {
            const a = teamsById[m.teamAId];
            const b = teamsById[m.teamBId];
            const row = h(
              multi ? 'label' : 'button',
              { class: 'flex items-center gap-3 px-2 py-2 rounded-[8px] hover:bg-hover text-left w-full cursor-pointer', onClick: multi ? undefined : () => (modal.close(), go([m.id])) },
              multi
                ? h('input', {
                    type: 'checkbox',
                    class: 'w-4 h-4 accent-[var(--color-brand)]',
                    checked: selected.has(m.id),
                    onChange: (e) => {
                      if (e.target.checked && selected.size >= max) {
                        e.target.checked = false;
                        return toast(`Максимум ${max} матчей в одной афише`, { type: 'warning' });
                      }
                      e.target.checked ? selected.add(m.id) : selected.delete(m.id);
                    },
                  })
                : null,
              teamAvatar(a, 24),
              teamAvatar(b, 24),
              h('div', { class: 'flex-1 min-w-0' }, h('div', { class: 'text-[13px] truncate' }, `${a?.name ?? '?'} vs ${b?.name ?? '?'}${scoreLabel(m) ? ` · ${scoreLabel(m)}` : ''}`), h('div', { class: 'text-[11.5px] text-fg-faint truncate' }, [m.tournament, m.stage, m.startDate ? formatDateRu(m.startDate) : '', m.startTime].filter(Boolean).join(' · '))),
              h('span', { class: ['badge', m.status === 'completed' && 'badge-ok'] }, STATUSES[m.status]?.label),
            );
            return row;
          })
        : [h('div', { class: 'py-8 text-center text-[13px] text-fg-muted' }, 'Ничего не найдено')]),
    );
  };
  paint();
  modal = openModal({
    title: `${tpl.name}: выберите ${multi ? 'матчи' : 'матч'}`,
    description: multi ? `До ${max} матчей. Позже их можно добавить, убрать или ввести вручную.` : 'Данные матча будут зафиксированы в публикации при сохранении.',
    width: 600,
    content: [h('div', { class: 'mb-3' }, textInput({ placeholder: 'Поиск по командам и турниру', autofocus: true, onInput: (v) => ((query = v), paint()) })), listEl],
    footer: ({ close }) => [
      multi ? h('button', { class: 'btn btn-ghost mr-auto', onClick: () => (close(), go([])) }, 'Начать с пустой афиши') : h('a', { class: 'btn btn-ghost mr-auto', href: '#/matches/new', onClick: () => close() }, icon('plus', { size: 14 }), 'Новый матч'),
      h('button', { class: 'btn', onClick: () => close() }, 'Отмена'),
      multi ? h('button', { class: 'btn btn-primary', onClick: () => (selected.size ? (close(), go(sorted.filter((m) => selected.has(m.id)).map((m) => m.id))) : toast('Выберите хотя бы один матч', { type: 'warning' })) }, 'Продолжить') : null,
    ],
  });
}
