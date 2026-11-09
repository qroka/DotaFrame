/** Saved publications gallery: search, filter by template, open, re-export, duplicate, delete. */
import { h } from '../core/dom.js';
import { on } from '../core/events.js';
import { icon } from '../ui/icons.js';
import { emptyState, searchInput, select } from '../ui/controls.js';
import { projects as projectsRepo } from '../data/repos.js';
import { assetUrl } from '../data/media.js';
import { getTemplate, listTemplates, TEMPLATE_TYPES } from '../templates/index.js';
import { relativeTime } from '../domain/time.js';
import { matchesQuery } from '../core/utils.js';
import { navigate } from '../app/router.js';
import { confirmDialog, openMenu, toast, toastError } from '../ui/feedback.js';
import { renderPng, downloadBlob, exportFileName } from '../export/exportPng.js';
import { duplicateProject } from '../editor/projectFactory.js';

export async function projectsPage() {
  let query = '';
  let type = '';
  let all = [];
  const grid = h('div', { class: 'grid gap-5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]' });
  const countEl = h('span', { class: 'text-[13px] text-fg-faint' });

  async function load() {
    all = await projectsRepo.list();
    render();
  }

  function card(p) {
    const tpl = getTemplate(p.templateId, p.templateVersion);
    const thumb = h('div', { class: 'aspect-square bg-base grid place-items-center overflow-hidden' }, h('div', { class: 'text-fg-faint' }, icon('image', { size: 28 })));
    if (p.thumbnailAssetId)
      assetUrl(p.thumbnailAssetId).then((url) => {
        if (url) thumb.replaceChildren(h('img', { src: url, alt: '', loading: 'lazy', class: 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]' }));
      });
    const more = h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Действия: ${p.title}`, onClick: (e) => (e.preventDefault(), e.stopPropagation(), menu(e.currentTarget, p)) }, icon('more', { size: 15 }));
    return h(
      'article',
      { class: 'group flex flex-col rounded-[12px] overflow-hidden border border-line bg-panel hover:border-line-strong transition-colors', dataset: { projectId: p.id } },
      h('a', { href: `#/editor/${p.id}`, class: 'block', 'aria-label': `Открыть ${p.title}` }, thumb),
      h(
        'div',
        { class: 'flex items-start gap-2 px-3 py-2.5 border-t border-line' },
        h(
          'div',
          { class: 'flex-1 min-w-0' },
          h('a', { href: `#/editor/${p.id}`, class: 'block text-[13px] font-medium truncate hover:text-brand' }, p.title || 'Без названия'),
          h('div', { class: 'mt-0.5 text-[11.5px] text-fg-faint truncate' }, `${TEMPLATE_TYPES[tpl?.type] ?? p.templateId} · ${relativeTime(p.updatedAt)}`),
        ),
        more,
      ),
    );
  }

  function menu(anchor, p) {
    openMenu(anchor, [
      { label: 'Открыть', icon: 'edit', onClick: () => navigate(`/editor/${p.id}`) },
      { label: 'Скачать PNG', icon: 'download', onClick: () => reexport(p) },
      { label: 'Дублировать', icon: 'copy', onClick: () => duplicate(p) },
      p.matchId ? { label: 'Новая публикация по матчу', icon: 'plus', onClick: () => navigate('/new', { template: p.templateId, match: p.matchId }) } : null,
      'separator',
      { label: 'Удалить', icon: 'trash', danger: true, onClick: () => remove(p) },
    ]);
  }

  async function reexport(p) {
    const t = toast('Экспорт PNG…', { type: 'loading' });
    try {
      const tpl = getTemplate(p.templateId, p.templateVersion);
      const size = tpl.exportSizes.find((s) => s.id === p.size) ?? tpl.exportSizes[0];
      const { blob, width, height } = await renderPng({ template: tpl, data: p.data, style: p.style, size });
      downloadBlob(blob, exportFileName(p.title, tpl.id, size));
      t.update(`Готово: PNG ${width}×${height}`, 'success');
    } catch (err) {
      t.close();
      toastError(err, 'Экспорт не удался');
    }
  }

  async function duplicate(p) {
    try {
      const copy = await duplicateProject(p.id);
      toast(`Создана копия «${copy.title}»`, { type: 'success', action: { label: 'Открыть', onClick: () => navigate(`/editor/${copy.id}`) } });
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(p) {
    const ok = await confirmDialog({ title: 'Удалить публикацию?', message: `«${p.title}» и все её сохранённые версии будут удалены без возможности восстановления.`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await projectsRepo.remove(p.id);
      toast('Публикация удалена', { type: 'success' });
    } catch (err) {
      toastError(err);
    }
  }

  function render() {
    const visible = all.filter((p) => (!type || getTemplate(p.templateId)?.type === type) && matchesQuery([p.title, p.data?.teamA?.name, p.data?.teamB?.name, p.data?.tournament, ...(p.data?.items ?? []).flatMap((i) => [i.teamA?.name, i.teamB?.name])], query));
    countEl.textContent = all.length ? `${visible.length} из ${all.length}` : '';
    if (!all.length) {
      grid.replaceWith(
        (grid._empty = emptyState({
          icon: 'image',
          title: 'Пока нет публикаций',
          text: 'Создайте матч и выберите шаблон — сохранённые публикации появятся здесь вместе с историей версий.',
          action: [h('a', { class: 'btn btn-primary', href: '#/templates' }, icon('plus', { size: 14 }), 'Новая публикация'), h('a', { class: 'btn', href: '#/matches' }, 'К матчам')],
        })),
      );
      return;
    }
    if (grid._empty) {
      grid._empty.replaceWith(grid);
      grid._empty = null;
    }
    grid.replaceChildren(...(visible.length ? visible.map(card) : [h('div', { class: 'col-span-full py-16 text-center text-[13px] text-fg-muted' }, 'Ничего не найдено')]));
  }

  const typeOptions = [{ value: '', label: 'Все шаблоны' }, ...[...new Map(listTemplates().map((t) => [t.type, TEMPLATE_TYPES[t.type] ?? t.type])).entries()].map(([value, label]) => ({ value, label }))];

  const el = h(
    'div',
    { class: 'max-w-[1280px] mx-auto px-8 py-8 max-sm:px-4' },
    h(
      'div',
      { class: 'flex items-end justify-between gap-4 flex-wrap mb-6' },
      h('div', {}, h('h1', { class: 'page-title' }, 'Публикации'), h('p', { class: 'mt-1 text-[13px] text-fg-muted' }, 'Сохранённые постеры. Каждый хранит собственный снимок данных — изменения матчей и команд их не затрагивают.')),
      h('a', { class: 'btn btn-primary', href: '#/templates' }, icon('plus', { size: 15 }), 'Новая публикация'),
    ),
    h('div', { class: 'flex items-center gap-3 flex-wrap mb-5' }, searchInput({ placeholder: 'Поиск по названию, командам, турниру', className: 'w-[340px] max-w-full', onInput: (v) => ((query = v), render()) }), select({ value: type, options: typeOptions, className: '!w-[190px]', onChange: (v) => ((type = v), render()) }), countEl),
    grid,
  );

  const off = on('data:changed', ({ store }) => store === 'projects' && load());
  await load();
  return { el, title: 'Публикации', destroy: off };
}
