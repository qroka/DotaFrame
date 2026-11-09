/** Overview: quick actions, upcoming matches, recent publications, onboarding, storage warning. */
import { h } from '../core/dom.js';
import { on } from '../core/events.js';
import { teams as teamsRepo, matches as matchesRepo, projects as projectsRepo } from '../data/repos.js';
import { assetUrl } from '../data/media.js';
import { storageInfo, requestPersistence } from '../data/db.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/feedback.js';
import { formatPosterDate, tzShort, weekday, matchSortKey, todayLocal, relativeTime } from '../domain/time.js';
import { getTemplate, TEMPLATE_TYPES } from '../templates/index.js';
import { openTeamDialog } from './teamDialog.js';
import { openPublishMenu } from './publishMenu.js';
import { matchTeamsLine, statusBadge } from './matches.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Доброй ночи';
  if (hr < 12) return 'Доброе утро';
  if (hr < 18) return 'Добрый день';
  return 'Добрый вечер';
}

const DEMO_TEAMS = [
  { name: 'Demo Wolves', shortName: 'DWV', region: 'EEU' },
  { name: 'Example Ravens', shortName: 'EXR', region: 'WEU' },
  { name: 'Sample Titans', shortName: 'SMT', region: 'SA' },
  { name: 'Тестовые Ястребы', shortName: 'ТЯ', region: 'CIS' },
];

async function fillDemo() {
  const created = [];
  for (const t of DEMO_TEAMS) created.push(await teamsRepo.save({ ...t, notes: 'Демо-данные' }));
  const today = todayLocal();
  const plus = (days) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const base = { tournament: 'Demo League', timezone: 'Europe/Moscow', notes: 'Демо-данные' };
  await matchesRepo.save({ ...base, teamAId: created[0].id, teamBId: created[1].id, stage: 'Групповой этап', startDate: plus(1), startTime: '18:00', format: 'BO3', status: 'scheduled' });
  await matchesRepo.save({ ...base, teamAId: created[2].id, teamBId: created[3].id, stage: 'Групповой этап', startDate: plus(1), startTime: '21:00', format: 'BO2', status: 'scheduled' });
  await matchesRepo.save({ ...base, teamAId: created[0].id, teamBId: created[3].id, stage: 'Полуфинал', startDate: plus(-1), startTime: '19:00', format: 'BO3', status: 'completed', scoreA: 2, scoreB: 1 });
}

export function dashboardPage() {
  const el = h('div', { class: 'max-w-[1200px] mx-auto px-8 py-8 max-[700px]:px-4' });
  const banner = h('div');

  async function load() {
    const [t, m, p] = await Promise.all([teamsRepo.list(), matchesRepo.list(), projectsRepo.list()]);
    const teamsById = Object.fromEntries(t.map((x) => [x.id, x]));
    const empty = !t.length && !m.length && !p.length;
    const today = todayLocal();
    const upcoming = m
      .filter((x) => (x.status === 'scheduled' || x.status === 'live') && (!x.startDate || x.startDate >= today || x.status === 'live'))
      .sort((a, b) => (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0) || matchSortKey(a).localeCompare(matchSortKey(b)))
      .slice(0, 5);

    const action = (label, desc, ic, onClick, primary) =>
      h(
        'button',
        { class: ['group flex items-start gap-3 text-left p-4 rounded-[10px] border transition-colors', primary ? 'border-brand/40 bg-brand-soft hover:bg-brand/20' : 'border-line hover:border-line-strong hover:bg-raised'], onClick },
        h('span', { class: ['w-8 h-8 shrink-0 rounded-[8px] grid place-items-center', primary ? 'bg-brand text-[#120705]' : 'bg-raised text-fg-muted group-hover:text-fg'] }, icon(ic, { size: 16 })),
        h('span', { class: 'min-w-0' }, h('span', { class: 'block text-[13.5px] font-semibold text-fg' }, label), h('span', { class: 'block mt-0.5 text-[12px] text-fg-faint leading-snug' }, desc)),
      );

    const stat = (n, label, href) => h('a', { href, class: 'flex flex-col gap-1 px-5 py-4 border-l border-line first:border-l-0 hover:bg-white/[0.02]' }, h('span', { class: 'text-[26px] font-display font-bold tabular-nums leading-none' }, String(n)), h('span', { class: 'text-[12px] text-fg-faint' }, label));

    const onboarding = empty
      ? h(
          'section',
          { class: 'mt-8 rounded-[14px] border border-line bg-panel overflow-hidden' },
          h(
            'div',
            { class: 'px-6 pt-6' },
            h('div', { class: 'section-title' }, 'С чего начать'),
            h('h2', { class: 'mt-2 text-[18px] font-semibold' }, 'Три шага до первой публикации'),
            h('p', { class: 'mt-1 text-[13px] text-fg-muted' }, 'Данные вводятся один раз и используются во всех шаблонах.'),
          ),
          h(
            'ol',
            { class: 'grid grid-cols-3 mt-5 border-t border-line max-[800px]:grid-cols-1' },
            [
              ['Добавьте команды', 'Название, короткое имя и логотип.', '#/teams'],
              ['Создайте матч', 'Турнир, дата, формат, позже — счёт.', '#/matches/new'],
              ['Выберите шаблон', 'Анонс, WIN/LOSE, результат, драфт или афиша.', '#/templates'],
            ].map(([title, desc, href], i) =>
              h(
                'li',
                { class: 'border-l border-line first:border-l-0 max-[800px]:border-l-0 max-[800px]:border-t max-[800px]:first:border-t-0' },
                h('a', { href, class: 'flex gap-3 p-5 hover:bg-white/[0.02] h-full' }, h('span', { class: 'w-6 h-6 rounded-full border border-line-strong grid place-items-center text-[12px] font-semibold text-fg-muted shrink-0' }, String(i + 1)), h('span', {}, h('span', { class: 'block text-[13.5px] font-medium' }, title), h('span', { class: 'block mt-0.5 text-[12px] text-fg-faint' }, desc))),
              ),
            ),
          ),
          h(
            'div',
            { class: 'flex flex-wrap items-center gap-3 px-6 py-4 border-t border-line bg-base/40' },
            h('span', { class: 'text-[12.5px] text-fg-faint' }, 'Хотите сначала осмотреться? Заполните приложение вымышленными командами и матчами.'),
            h(
              'button',
              {
                class: 'btn btn-sm ml-auto',
                onClick: async (e) => {
                  e.currentTarget.disabled = true;
                  try {
                    await fillDemo();
                    toast('Демо-данные добавлены: 4 команды и 3 матча', { type: 'success' });
                  } catch (err) {
                    toast(err.message, { type: 'error' });
                  }
                },
              },
              icon('sparkles', { size: 13 }),
              'Заполнить демо-данными',
            ),
          ),
        )
      : null;

    const upcomingBlock = h(
      'section',
      { class: 'min-w-0' },
      h('div', { class: 'flex items-center justify-between mb-3' }, h('h2', { class: 'section-title' }, 'Ближайшие матчи'), h('a', { href: '#/matches', class: 'text-[12px] text-fg-muted hover:text-fg' }, 'Все матчи →')),
      upcoming.length
        ? h(
            'div',
            { class: 'border-t border-line' },
            upcoming.map((m2) => {
              const pb = h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': 'Создать публикацию', title: 'Создать публикацию' }, icon('sparkles', { size: 13 }));
              pb.addEventListener('click', () => openPublishMenu(pb, m2));
              return h(
                'div',
                { class: 'grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 px-2 border-b border-line hover:bg-white/[0.02]' },
                h('a', { href: `#/matches/${m2.id}`, class: 'min-w-0' }, h('div', { class: 'text-[12.5px] tabular-nums' }, m2.startDate ? `${formatPosterDate(m2.startDate)} ${weekday(m2.startDate)}` : 'Без даты'), h('div', { class: 'text-[11.5px] text-fg-faint tabular-nums' }, m2.status === 'live' ? statusBadge('live') : m2.startTime ? `${m2.startTime} ${tzShort(m2.timezone)}` : '—')),
                h('a', { href: `#/matches/${m2.id}`, class: 'min-w-0' }, matchTeamsLine(m2, teamsById, { size: 22 }), h('div', { class: 'mt-0.5 text-center text-[11.5px] text-fg-faint truncate' }, [m2.tournament, m2.format].filter(Boolean).join(' · '))),
                pb,
              );
            }),
          )
        : h('div', { class: 'border-t border-line py-8 text-center text-[13px] text-fg-faint' }, m.length ? 'Нет запланированных матчей' : 'Матчей пока нет', h('div', { class: 'mt-3' }, h('a', { href: '#/matches/new', class: 'btn btn-sm' }, icon('plus', { size: 13 }), 'Создать матч'))),
    );

    const recent = p.slice(0, 6);
    const recentBlock = h(
      'section',
      { class: 'min-w-0' },
      h('div', { class: 'flex items-center justify-between mb-3' }, h('h2', { class: 'section-title' }, 'Недавние публикации'), h('a', { href: '#/projects', class: 'text-[12px] text-fg-muted hover:text-fg' }, 'Все публикации →')),
      recent.length
        ? h(
            'div',
            { class: 'grid grid-cols-3 gap-3 max-[640px]:grid-cols-2' },
            recent.map((pr) => {
              const tpl = getTemplate(pr.templateId);
              const thumb = h('div', { class: 'aspect-square rounded-[8px] overflow-hidden border border-line bg-raised grid place-items-center' }, h('div', { class: 'flex flex-col items-center gap-1.5 text-fg-faint' }, icon('image', { size: 18 }), h('span', { class: 'text-[11px]' }, TEMPLATE_TYPES[tpl?.type] ?? tpl?.name ?? pr.templateId)));
              if (pr.thumbnailAssetId) assetUrl(pr.thumbnailAssetId).then((u) => u && thumb.replaceChildren(h('img', { src: u, alt: '', class: 'w-full h-full object-cover' })));
              return h('a', { href: `#/editor/${pr.id}`, class: 'group flex flex-col gap-1.5 min-w-0' }, thumb, h('span', { class: 'text-[12.5px] text-fg truncate group-hover:text-brand' }, pr.title || tpl?.name || 'Публикация'), h('span', { class: 'text-[11.5px] text-fg-faint' }, relativeTime(pr.updatedAt)));
            }),
          )
        : h('div', { class: 'border-t border-line py-8 text-center text-[13px] text-fg-faint' }, 'Сохранённых публикаций пока нет', h('div', { class: 'mt-3' }, h('a', { href: '#/templates', class: 'btn btn-sm' }, icon('layers', { size: 13 }), 'Открыть шаблоны'))),
    );

    el.replaceChildren(
      ...[h(
        'header',
        { class: 'flex flex-wrap items-end justify-between gap-4' },
        h('div', {}, h('p', { class: 'text-[13px] text-fg-faint' }, greeting()), h('h1', { class: 'page-title mt-1' }, 'Графика Dota 2 из ваших данных')),
        h('div', { class: 'flex border border-line rounded-[10px] overflow-hidden' }, stat(t.length, 'команд', '#/teams'), stat(m.length, 'матчей', '#/matches'), stat(p.length, 'публикаций', '#/projects')),
      ),
      banner,
      h(
        'div',
        { class: 'mt-8 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1' },
        action('Новый матч', 'Серия, турнир, время и счёт', 'swords', () => (location.hash = '#/matches/new'), true),
        action('Новая команда', 'Название и логотип для справочника', 'users', () => openTeamDialog()),
        action('Открыть шаблоны', 'Анонс, WIN, LOSE, результат, драфт, афиша', 'layers', () => (location.hash = '#/templates')),
      ),
      onboarding,
      empty ? null : h('div', { class: 'mt-10 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-10 max-[1000px]:grid-cols-1' }, upcomingBlock, recentBlock),
      ].filter(Boolean),
    );
  }

  async function checkStorage() {
    const info = await storageInfo();
    if (info.persisted !== false) return banner.replaceChildren();
    banner.replaceChildren(
      h(
        'div',
        { class: 'mt-6 flex flex-wrap items-center gap-3 px-4 py-3 rounded-[10px] border border-warn/30 bg-warn/[0.06] text-[13px]' },
        h('span', { class: 'text-warn' }, icon('alert', { size: 16 })),
        h('span', { class: 'flex-1 min-w-[240px] text-fg-muted' }, 'Браузер может очистить локальные данные при нехватке места. Разрешите постоянное хранение и регулярно делайте резервные копии.'),
        h(
          'button',
          {
            class: 'btn btn-sm',
            onClick: async () => {
              const ok = await requestPersistence();
              toast(ok ? 'Постоянное хранение включено' : 'Браузер отклонил запрос. Сделайте резервную копию в настройках.', { type: ok ? 'success' : 'warning' });
              checkStorage();
            },
          },
          'Разрешить',
        ),
        h('a', { class: 'btn btn-sm btn-ghost', href: '#/settings' }, 'Резервная копия'),
      ),
    );
  }

  const off = on('data:changed', ({ store }) => {
    if (['teams', 'matches', 'projects'].includes(store)) load();
  });
  load();
  checkStorage();
  return { el, title: 'Обзор', destroy: off };
}
