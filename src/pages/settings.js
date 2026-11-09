/** Data & settings: storage usage, persistence, backup/restore, hero portrait pack, cleanup. */
import { h } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { spinner } from '../ui/controls.js';
import { storageInfo, requestPersistence, wipeAll, STORES, dbGetAll } from '../data/db.js';
import { collectGarbage, revokeAllUrls } from '../data/media.js';
import { backupBlob, readBackupFile, restoreBackup } from '../data/backup.js';
import { downloadBlob } from '../export/exportPng.js';
import { confirmDialog, openModal, toast, toastError } from '../ui/feedback.js';
import { formatBytes } from '../core/utils.js';
import { emit } from '../core/events.js';

function section(title, description, ...children) {
  return h(
    'section',
    { class: 'grid grid-cols-[260px_1fr] gap-8 py-8 border-b border-line max-[900px]:grid-cols-1 max-[900px]:gap-4' },
    h('div', {}, h('h2', { class: 'text-[14px] font-semibold' }, title), description ? h('p', { class: 'mt-1.5 text-[12.5px] text-fg-muted leading-relaxed' }, description) : null),
    h('div', { class: 'flex flex-col gap-4 min-w-0' }, ...children),
  );
}

export async function settingsPage() {
  const usageEl = h('div', { class: 'flex flex-col gap-3' }, spinner());

  async function paintUsage() {
    const [info, ...lists] = await Promise.all([storageInfo(), ...['teams', 'matches', 'projects', 'revisions', 'media'].map((s) => dbGetAll(STORES[s]).catch(() => []))]);
    const [teams, matches, projects, revisions, media] = lists;
    const mediaBytes = media.reduce((n, m) => n + (m.size || 0), 0);
    const pct = info.usage && info.quota ? Math.min(100, (info.usage / info.quota) * 100) : null;
    usageEl.replaceChildren(
      h(
        'div',
        { class: 'grid grid-cols-5 gap-px rounded-[10px] overflow-hidden border border-line bg-line max-[700px]:grid-cols-2' },
        [
          ['Команды', teams.length],
          ['Матчи', matches.length],
          ['Публикации', projects.length],
          ['Версии', revisions.length],
          ['Изображения', `${media.length} · ${formatBytes(mediaBytes)}`],
        ].map(([k, v]) => h('div', { class: 'bg-panel px-4 py-3' }, h('div', { class: 'text-[11.5px] text-fg-faint' }, k), h('div', { class: 'mt-1 text-[15px] font-semibold tabular-nums' }, String(v)))),
      ),
      pct !== null
        ? h(
            'div',
            { class: 'flex flex-col gap-1.5' },
            h('div', { class: 'flex justify-between text-[12px] text-fg-muted' }, h('span', {}, `Занято в браузере: ${formatBytes(info.usage)}`), h('span', {}, `доступно до ${formatBytes(info.quota)}`)),
            h('div', { class: 'h-1.5 rounded-full bg-line overflow-hidden' }, h('div', { class: ['h-full rounded-full', pct > 80 ? 'bg-danger' : 'bg-brand'], style: { width: `${Math.max(1, pct)}%` } })),
            pct > 80 ? h('p', { class: 'text-[12px] text-danger' }, 'Хранилище почти заполнено. Сделайте резервную копию и удалите неиспользуемые изображения.') : null,
          )
        : h('p', { class: 'text-[12px] text-fg-faint' }, 'Браузер не сообщает объём хранилища.'),
      h(
        'div',
        { class: 'flex items-center gap-3 flex-wrap' },
        info.persisted
          ? h('span', { class: 'badge badge-ok' }, icon('shield', { size: 12 }), 'Постоянное хранение включено')
          : h('span', { class: 'badge badge-warn' }, icon('alert', { size: 12 }), 'Браузер может очистить данные при нехватке места'),
        info.persisted
          ? null
          : h(
              'button',
              {
                class: 'btn btn-sm',
                onClick: async () => {
                  const ok = await requestPersistence();
                  toast(ok ? 'Постоянное хранение включено' : 'Браузер отклонил запрос. Регулярно делайте резервные копии.', { type: ok ? 'success' : 'warning' });
                  paintUsage();
                },
              },
              'Запросить постоянное хранение',
            ),
      ),
    );
  }

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', tabIndex: -1 });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let backup;
    try {
      backup = await readBackupFile(file);
    } catch (err) {
      return toastError(err, 'Восстановление невозможно');
    }
    const c = backup.counts ?? {};
    let mode = 'merge';
    const modeEl = h(
      'div',
      { class: 'flex flex-col gap-2 mt-4' },
      ...[
        ['merge', 'Объединить', 'Записи из копии добавятся; совпадающие по ID будут заменены.'],
        ['replace', 'Заменить всё', 'Текущие данные будут удалены и заменены копией.'],
      ].map(([v, label, hint]) =>
        h(
          'label',
          { class: 'flex items-start gap-3 p-3 rounded-[8px] border border-line hover:border-line-strong cursor-pointer' },
          h('input', { type: 'radio', name: 'restore-mode', value: v, checked: v === 'merge', class: 'mt-0.5 accent-[var(--color-brand)]', onChange: () => (mode = v) }),
          h('span', {}, h('span', { class: 'block text-[13px] font-medium' }, label), h('span', { class: 'block text-[12px] text-fg-muted mt-0.5' }, hint)),
        ),
      ),
    );
    openModal({
      title: 'Восстановить из резервной копии?',
      description: `Копия от ${new Date(backup.exportedAt).toLocaleString('ru-RU')}: команд ${c.teams ?? 0}, матчей ${c.matches ?? 0}, публикаций ${c.projects ?? 0}, изображений ${c.media ?? 0}.`,
      width: 500,
      content: modeEl,
      footer: ({ close }) => [
        h('button', { class: 'btn', onClick: () => close() }, 'Отмена'),
        h(
          'button',
          {
            class: 'btn btn-primary',
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              try {
                const counts = await restoreBackup(backup, { mode });
                close();
                toast(`Восстановлено: публикаций ${counts.projects}, матчей ${counts.matches}, команд ${counts.teams}`, { type: 'success' });
                paintUsage();
              } catch (err) {
                e.currentTarget.disabled = false;
                toastError(err, 'Восстановление не удалось');
              }
            },
          },
          'Восстановить',
        ),
      ],
    });
  });

  const heroSlot = h('div', {}, spinner());
  import('../ui/heroPack.js')
    .then((m) => heroSlot.replaceChildren(m.heroPackSection()))
    .catch((err) => heroSlot.replaceChildren(h('p', { class: 'text-[13px] text-danger' }, `Не удалось загрузить раздел: ${err.message}`)));

  const el = h(
    'div',
    { class: 'max-w-[1100px] mx-auto px-8 py-8 max-sm:px-4' },
    h('h1', { class: 'page-title' }, 'Данные и настройки'),
    h('p', { class: 'mt-1 text-[13px] text-fg-muted max-w-[720px]' }, 'DotaFrame работает без сервера и учётной записи: все команды, матчи, публикации и изображения хранятся в IndexedDB этого браузера.'),
    section('Хранилище', 'Объём данных и статус постоянного хранения. При очистке данных сайта в браузере всё будет удалено.', usageEl),
    section(
      'Резервная копия',
      'Один JSON-файл со всеми данными и изображениями. Используйте его для переноса на другой компьютер или в другой браузер.',
      h(
        'div',
        { class: 'flex gap-2 flex-wrap' },
        h(
          'button',
          {
            class: 'btn btn-primary',
            onClick: async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              try {
                const { blob, backup } = await backupBlob();
                downloadBlob(blob, `dotaframe-backup-${backup.exportedAt.slice(0, 10)}.json`);
                toast(`Резервная копия сохранена (${formatBytes(blob.size)})`, { type: 'success' });
              } catch (err) {
                toastError(err, 'Не удалось создать копию');
              } finally {
                btn.disabled = false;
              }
            },
          },
          icon('download', { size: 15 }),
          'Скачать резервную копию',
        ),
        h('button', { class: 'btn', onClick: () => fileInput.click() }, icon('upload', { size: 15 }), 'Восстановить из файла'),
        fileInput,
      ),
      h('p', { class: 'field-hint' }, 'Перед восстановлением файл проверяется: формат, версия, целостность записей и изображений. При ошибке данные не изменяются.'),
    ),
    section('Портреты героев', 'Локальный набор изображений для генератора драфтов.', heroSlot),
    section(
      'Обслуживание',
      'Неиспользуемые изображения — файлы, на которые не ссылается ни одна команда, публикация или версия.',
      h(
        'div',
        { class: 'flex gap-2 flex-wrap' },
        h(
          'button',
          {
            class: 'btn',
            onClick: async () => {
              try {
                const dry = await collectGarbage({ dryRun: true });
                if (!dry.removed) return toast('Неиспользуемых изображений нет', { type: 'info' });
                const ok = await confirmDialog({ title: 'Удалить неиспользуемые изображения?', message: `Будет удалено файлов: ${dry.removed} (${formatBytes(dry.bytes)}). Изображения сохранённых публикаций и их версий не затрагиваются.`, confirmLabel: 'Удалить', danger: true });
                if (!ok) return;
                const res = await collectGarbage();
                toast(`Удалено файлов: ${res.removed}, освобождено ${formatBytes(res.bytes)}`, { type: 'success' });
                paintUsage();
              } catch (err) {
                toastError(err);
              }
            },
          },
          icon('trash', { size: 15 }),
          'Очистить неиспользуемые изображения',
        ),
        h(
          'button',
          {
            class: 'btn btn-danger',
            onClick: async () => {
              const ok = await confirmDialog({ title: 'Удалить все данные?', message: 'Все команды, матчи, драфты, публикации, версии и изображения будут удалены из этого браузера без возможности восстановления.\n\nРекомендуем сначала скачать резервную копию.', confirmLabel: 'Удалить всё', danger: true });
              if (!ok) return;
              try {
                await wipeAll();
                revokeAllUrls();
                emit('data:changed', { store: '*', action: 'wipe' });
                toast('Все данные удалены', { type: 'success' });
                paintUsage();
              } catch (err) {
                toastError(err);
              }
            },
          },
          'Удалить все данные',
        ),
      ),
    ),
  );

  paintUsage();
  return { el, title: 'Данные и настройки' };
}
