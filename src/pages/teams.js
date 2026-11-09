/** Teams directory: search, create, edit, delete (blocked while used by matches). */
import { h } from '../core/dom.js';
import { on } from '../core/events.js';
import { matchesQuery } from '../core/utils.js';
import { teams, matches as matchesRepo } from '../data/repos.js';
import { icon } from '../ui/icons.js';
import { searchInput, emptyState, teamAvatar } from '../ui/controls.js';
import { confirmDialog, toast, openMenu } from '../ui/feedback.js';
import { relativeTime } from '../domain/time.js';
import { openTeamDialog } from './teamDialog.js';
import { navigate } from '../app/router.js';

export function teamsPage() {
  let query = '';
  let all = [];
  let usage = {};

  const list = h('div', { class: 'mt-6' });
  const countEl = h('span', { class: 'text-fg-faint text-[13px] tabular-nums' });

  const el = h(
    'div',
    { class: 'max-w-[1200px] mx-auto px-8 py-8 max-[700px]:px-4' },
    h(
      'header',
      { class: 'flex flex-wrap items-end justify-between gap-4' },
      h('div', {}, h('h1', { class: 'page-title flex items-baseline gap-3' }, 'Команды', countEl), h('p', { class: 'mt-1 text-[13px] text-fg-muted' }, 'Единый справочник названий и логотипов для всех матчей и публикаций.')),
      h('div', { class: 'flex items-center gap-2' }, searchInput({ placeholder: 'Поиск команды', className: 'w-[260px] max-[700px]:w-full', onInput: (v) => ((query = v), render()) }), h('button', { class: 'btn btn-primary', onClick: () => create() }, icon('plus'), 'Добавить команду')),
    ),
    h('p', { class: 'mt-5 flex items-start gap-2 text-[12.5px] text-fg-faint border-l-2 border-line-strong pl-3 leading-relaxed' }, 'Изменение команды применяется только к новым публикациям. Сохранённые постеры хранят снимок названия и версии логотипа на момент сохранения.'),
    list,
  );

  async function load() {
    const [t, m] = await Promise.all([teams.list(), matchesRepo.list()]);
    all = t;
    usage = {};
    for (const match of m) {
      usage[match.teamAId] = (usage[match.teamAId] ?? 0) + 1;
      usage[match.teamBId] = (usage[match.teamBId] ?? 0) + 1;
    }
    render();
  }

  async function create() {
    const team = await openTeamDialog();
    if (team) load();
  }
  async function edit(team) {
    const saved = await openTeamDialog({ team });
    if (saved) load();
  }
  async function remove(team) {
    const used = usage[team.id] ?? 0;
    if (used) {
      await confirmDialog({
        title: 'Команду нельзя удалить',
        message: `«${team.name}» участвует в ${used} матч(ах). Удалите эти матчи или замените в них команду, затем повторите. Сохранённые публикации не пострадают в любом случае.`,
        confirmLabel: 'Понятно',
        cancelLabel: 'Закрыть',
      });
      return;
    }
    const ok = await confirmDialog({ title: `Удалить «${team.name}»?`, message: 'Команда исчезнет из справочника. Сохранённые публикации останутся без изменений.', confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await teams.remove(team.id);
      toast('Команда удалена', { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  function render() {
    countEl.textContent = all.length ? String(all.length) : '';
    const rows = all.filter((t) => matchesQuery([t.name, t.shortName, t.region], query));
    if (!all.length) {
      list.replaceChildren(
        emptyState({
          icon: 'users',
          title: 'Пока нет команд',
          text: 'Добавьте команды один раз — и используйте их во всех матчах и шаблонах.',
          action: h('button', { class: 'btn btn-primary', onClick: () => create() }, icon('plus'), 'Добавить команду'),
        }),
      );
      return;
    }
    if (!rows.length) {
      list.replaceChildren(emptyState({ icon: 'search', title: 'Ничего не найдено', text: `По запросу «${query}» команд нет.`, action: h('button', { class: 'btn', onClick: () => create() }, icon('plus'), 'Создать команду') }));
      return;
    }
    list.replaceChildren(
      h(
        'div',
        { class: 'border-t border-line', role: 'list', 'aria-label': 'Команды' },
        h(
          'div',
          { class: 'grid grid-cols-[minmax(0,1fr)_110px_120px_100px_130px_84px] gap-4 px-3 py-2 text-[11.5px] font-medium text-fg-faint border-b border-line max-[900px]:hidden' },
          h('span', {}, 'Команда'),
          h('span', {}, 'Короткое'),
          h('span', {}, 'Регион'),
          h('span', {}, 'Матчей'),
          h('span', {}, 'Изменена'),
          h('span'),
        ),
        rows.map((t) => row(t)),
      ),
    );
  }

  function row(t) {
    const used = usage[t.id] ?? 0;
    const more = h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Действия: ${t.name}` }, icon('more'));
    more.addEventListener('click', () =>
      openMenu(more, [
        { label: 'Редактировать', icon: 'edit', onClick: () => edit(t) },
        { label: 'Новый матч с командой', icon: 'swords', onClick: () => navigate('/matches/new', { team: t.id }) },
        'separator',
        { label: 'Удалить', icon: 'trash', danger: true, onClick: () => remove(t) },
      ]),
    );
    return h(
      'div',
      {
        role: 'listitem',
        class: 'group grid grid-cols-[minmax(0,1fr)_110px_120px_100px_130px_84px] items-center gap-4 px-3 py-2.5 border-b border-line hover:bg-white/[0.02] max-[900px]:grid-cols-[minmax(0,1fr)_auto] max-[900px]:gap-y-1',
        dataset: { teamId: t.id },
      },
      h(
        'button',
        { class: 'flex items-center gap-3 min-w-0 text-left', onClick: () => edit(t), title: 'Редактировать' },
        teamAvatar(t, 34),
        h('div', { class: 'min-w-0' }, h('div', { class: 'text-[13.5px] font-medium text-fg truncate' }, t.name), t.notes ? h('div', { class: 'text-[12px] text-fg-faint truncate' }, t.notes) : null),
      ),
      h('span', { class: 'text-[13px] text-fg-muted font-mono max-[900px]:hidden' }, t.shortName || '—'),
      h('span', { class: 'text-[13px] text-fg-muted truncate max-[900px]:hidden' }, t.region || '—'),
      h('span', { class: 'text-[13px] tabular-nums max-[900px]:hidden ' + (used ? 'text-fg' : 'text-fg-faint') }, String(used)),
      h('span', { class: 'text-[12.5px] text-fg-faint max-[900px]:hidden' }, relativeTime(t.updatedAt)),
      h('div', { class: 'flex justify-end gap-1' }, h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Редактировать ${t.name}`, title: 'Редактировать', onClick: () => edit(t) }, icon('edit')), more),
    );
  }

  const off = on('data:changed', ({ store }) => {
    if (store === 'teams' || store === 'matches') load();
  });
  load();
  return { el, title: 'Команды', destroy: off };
}
