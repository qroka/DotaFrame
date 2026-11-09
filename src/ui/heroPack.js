/**
 * Settings section: local hero portrait pack.
 *
 * Official Dota 2 artwork is © Valve and is NOT bundled with DotaFrame. Users import
 * their own portrait files; each file is matched to a hero by its name and stored as
 * an immutable MediaAsset. Replacing a portrait creates a new asset, so saved draft
 * posters keep the portrait version they were saved with.
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { imageField, searchInput, spinner } from './controls.js';
import { confirmDialog, toast } from './feedback.js';
import { HEROES, ATTRIBUTES, matchHeroFile, heroInitials } from '../data/heroes.js';
import { portraitMap, setPortrait, setPortraits, clearPortraits } from '../data/heroPortraits.js';
import { importFile, ACCEPT_IMAGES } from '../data/media.js';
import { matchesQuery } from '../core/utils.js';

export function heroPackSection() {
  let portraits = {};
  let query = '';
  let filter = 'all'; // all | with | without
  let busy = false;
  let lastReport = null;

  const fileInput = h('input', { type: 'file', accept: ACCEPT_IMAGES, multiple: true, class: 'sr-only', tabIndex: -1, 'aria-hidden': 'true' });
  const stats = h('div', { class: 'text-[12.5px] text-fg-muted' });
  const report = h('div');
  const list = h('div', { class: 'grid gap-x-4 gap-y-1', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' } });
  const importBtn = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => fileInput.click() }, icon('upload', { size: 14 }), 'Импортировать портреты');
  const clearBtn = h('button', { type: 'button', class: 'btn btn-danger', onClick: onClear }, icon('trash', { size: 14 }), 'Удалить все портреты');

  const filterSeg = h(
    'div',
    { class: 'segmented !w-auto' },
    [
      ['all', 'Все'],
      ['with', 'С портретом'],
      ['without', 'Без портрета'],
    ].map(([v, label]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'whitespace-nowrap !px-3',
          'aria-pressed': String(v === filter),
          dataset: { filter: v },
          onClick: (e) => {
            filter = v;
            [...filterSeg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === v)));
            paintList();
          },
        },
        label,
      ),
    ),
  );

  const root = h(
    'section',
    { class: 'flex flex-col gap-4', dataset: { section: 'hero-pack' } },
    h(
      'div',
      { class: 'flex flex-col gap-2' },
      h('h2', { class: 'text-[15px] font-semibold text-fg' }, 'Портреты героев'),
      h(
        'p',
        { class: 'text-[13px] text-fg-muted leading-relaxed max-w-[720px]' },
        'Официальные изображения Dota 2 принадлежат Valve и не входят в DotaFrame. Используйте собственные файлы с правом на их использование. ',
        'Пока портрет не загружен, в драфте и на постере показывается нейтральная плитка с инициалами героя.',
      ),
      h(
        'p',
        { class: 'field-hint max-w-[720px]' },
        'Можно выбрать сразу много файлов: герой определяется по имени файла — внутреннему имени (antimage.png, npc_dota_hero_zuus.webp), названию (Anti-Mage.png) или числовому ID (1.png). При замене создаётся новая версия файла, сохранённые публикации не меняются.',
      ),
    ),
    h('div', { class: 'flex flex-wrap items-center gap-2' }, importBtn, clearBtn, h('div', { class: 'ml-auto' }, stats), fileInput),
    report,
    h('div', { class: 'flex flex-wrap items-center gap-2' }, searchInput({ placeholder: 'Найти героя', className: 'w-[260px]', onInput: (v) => ((query = v), paintList()) }), filterSeg),
    list,
  );

  async function load() {
    portraits = await portraitMap().catch(() => ({}));
    paintStats();
    paintList();
  }

  function paintStats() {
    const n = HEROES.filter((h0) => portraits[h0.id]).length;
    stats.textContent = `Портреты: ${n} из ${HEROES.length}`;
    clearBtn.disabled = busy || n === 0;
    importBtn.disabled = busy;
    importBtn.replaceChildren(busy ? spinner() : icon('upload', { size: 14 }), busy ? 'Импорт…' : 'Импортировать портреты');
  }

  function paintList() {
    const rows = HEROES.filter((hero) => {
      if (filter === 'with' && !portraits[hero.id]) return false;
      if (filter === 'without' && portraits[hero.id]) return false;
      return matchesQuery([hero.name, hero.slug, ...hero.aliases], query);
    });
    list.replaceChildren(
      ...(rows.length
        ? rows.map((hero) => {
            const attr = ATTRIBUTES[hero.attr];
            return h(
              'div',
              { class: 'flex items-center gap-3 py-2 border-b border-line min-w-0', dataset: { heroRow: hero.slug } },
              h('div', { class: 'w-[120px] min-w-0' }, h('div', { class: 'text-[13px] text-fg truncate' }, hero.name), h('div', { class: 'text-[11px] truncate', style: { color: attr.color } }, `${attr.short} · ${hero.slug}`)),
              h(
                'div',
                { class: 'flex-1 min-w-0' },
                imageField({
                  assetId: portraits[hero.id] ?? null,
                  kind: 'hero',
                  compact: true,
                  label: 'Портрет загружен',
                  emptyText: heroInitials(hero) + ' · без портрета',
                  onChange: async (assetId) => {
                    try {
                      await setPortrait(hero.id, assetId);
                      if (assetId) portraits[hero.id] = assetId;
                      else delete portraits[hero.id];
                      paintStats();
                    } catch (err) {
                      toast(err.message, { type: 'error' });
                    }
                  },
                }),
              ),
            );
          })
        : [h('div', { class: 'py-8 text-[13px] text-fg-muted' }, 'Ничего не найдено')]),
    );
  }

  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = '';
    if (!files.length) return;
    busy = true;
    paintStats();
    const matched = [];
    const unmatched = [];
    const failed = [];
    const entries = [];
    const seen = new Set();
    for (const file of files) {
      const hero = matchHeroFile(file.name);
      if (!hero) {
        unmatched.push(file.name);
        continue;
      }
      if (seen.has(hero.id)) {
        unmatched.push(`${file.name} (повтор: ${hero.name})`);
        continue;
      }
      try {
        const asset = await importFile(file, 'hero');
        entries.push([hero.id, asset.id]);
        matched.push(hero.name);
        seen.add(hero.id);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    try {
      if (entries.length) await setPortraits(entries);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
    busy = false;
    lastReport = { matched, unmatched, failed };
    paintReport();
    await load();
    toast(`Импортировано портретов: ${matched.length}${unmatched.length + failed.length ? `, пропущено: ${unmatched.length + failed.length}` : ''}`, { type: matched.length ? 'success' : 'warning' });
  });

  function paintReport() {
    if (!lastReport) return report.replaceChildren();
    const { matched, unmatched, failed } = lastReport;
    report.replaceChildren(
      h(
        'div',
        { class: 'rounded-[10px] border border-line bg-panel p-3.5 flex flex-col gap-2 text-[12.5px]', role: 'status' },
        h('div', { class: 'flex items-center gap-2 text-fg' }, icon('check', { size: 14, className: 'text-ok' }), `Сопоставлено: ${matched.length}`),
        unmatched.length
          ? h('div', { class: 'text-warn' }, h('div', { class: 'flex items-center gap-2' }, icon('alert', { size: 14 }), `Не удалось определить героя: ${unmatched.length}`), h('div', { class: 'mt-1 text-fg-faint break-words' }, unmatched.slice(0, 30).join(', ') + (unmatched.length > 30 ? '…' : '')))
          : null,
        failed.length ? h('div', { class: 'text-danger' }, failed.slice(0, 10).map((f) => h('div', {}, f))) : null,
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost self-start', onClick: () => ((lastReport = null), paintReport()) }, 'Скрыть отчёт'),
      ),
    );
  }

  async function onClear() {
    const ok = await confirmDialog({
      title: 'Удалить все портреты?',
      message: 'Портреты будут отвязаны от героев. Уже сохранённые публикации сохранят свои изображения. Неиспользуемые файлы можно затем удалить очисткой хранилища.',
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await clearPortraits();
      toast('Портреты удалены', { type: 'success' });
      await load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }

  load();
  return root;
}
