/**
 * Poster editor workspace.
 *
 *  ┌ top bar: back · title · status · template · undo/redo · history · save · export ┐
 *  │ left: Данные | Шаблоны │        preview canvas + issues        │ right: Оформление │
 *
 * State lives in a store with undo/redo. The poster always renders from the project's
 * own snapshot (data) + style; saving appends an immutable revision.
 */
import { h } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { on } from '../core/events.js';
import { createStore } from './store.js';
import { createPreview } from './preview.js';
import { createSettingsPanel } from './settingsPanel.js';
import { createMatchPanel } from './panels/dataMatch.js';
import { createMatchesPanel } from './panels/dataMatches.js';
import { loadLookups, newProjectState, switchTemplateState, autoTitle, duplicateProject } from './projectFactory.js';
import { getTemplate, listTemplates, hasExactVersion, TEMPLATE_TYPES, normalizeStyle } from '../templates/index.js';
import { projects as projectsRepo, settings as settingsRepo } from '../data/repos.js';
import { saveAsset } from '../data/media.js';
import { renderPng, downloadBlob, exportFileName } from '../export/exportPng.js';
import { navigate, replaceHashSilently } from '../app/router.js';
import { confirmDialog, openMenu, openModal, toast, toastError } from '../ui/feedback.js';
import { emptyState, spinner } from '../ui/controls.js';
import { relativeTime, formatDateTimeShort } from '../domain/time.js';
import { createId, nowIso } from '../core/ids.js';
import { assetUrl } from '../data/media.js';

export async function newProjectPage({ query }) {
  const lookups = await loadLookups();
  if (query.duplicate) {
    const copy = await duplicateProject(query.duplicate);
    replaceHashSilently(`/editor/${copy.id}`);
    return editorPage({ params: { id: copy.id } });
  }
  const state = await newProjectState({
    templateId: query.template,
    matchId: query.match || null,
    matchIds: query.matches ? query.matches.split(',').filter(Boolean) : [],
    lookups,
  });
  return createEditor({ state, lookups, isNew: true });
}

export async function editorPage({ params }) {
  const [project, lookups] = await Promise.all([projectsRepo.get(params.id), loadLookups()]);
  if (!project) {
    return {
      title: 'Публикация не найдена',
      el: h('div', { class: 'h-full grid place-items-center' }, emptyState({ icon: 'image', title: 'Публикация не найдена', text: 'Возможно, она была удалена.', action: h('a', { class: 'btn btn-primary', href: '#/projects' }, 'К публикациям') })),
    };
  }
  return createEditor({ state: project, lookups, isNew: false });
}

const PANEL_KEY = 'df.editor.panels';

function createEditor({ state: initial, lookups, isNew }) {
  const exactVersion = hasExactVersion(initial.templateId, initial.templateVersion);
  let template = getTemplate(initial.templateId, initial.templateVersion) ?? getTemplate('match-announcement');
  const startState = { ...initial, style: normalizeStyle(template, initial.style) };
  const store = createStore(startState, { savedState: isNew ? null : startState });
  const cleanups = [];
  let issues = [];
  let saving = false;
  let exporting = false;
  let leftTab = 'data';
  let panels = { left: true, right: true };
  try {
    panels = { ...panels, ...JSON.parse(localStorage.getItem(PANEL_KEY) || '{}') };
  } catch {
    /* ignore */
  }

  /* ---------- Editor API (used by panels) ---------- */
  const listeners = new Map();
  const editor = {
    getState: () => store.get(),
    get template() {
      return template;
    },
    teams: lookups.teams,
    teamsById: lookups.teamsById,
    matches: lookups.matches,
    setData: (data, opts = {}) => store.commit({ ...store.get(), data }, opts),
    setStyle: (style, opts = {}) => store.commit({ ...store.get(), style }, opts),
    // Navigation link only (not rendered): set on the current state without a history entry.
    setMatchId: (matchId) => {
      store.get().matchId = matchId;
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
  };
  const fire = (event, payload) => listeners.get(event)?.forEach((fn) => fn(payload));

  /* ---------- Layout ---------- */
  const preview = createPreview({ onIssues: (list) => ((issues = list), renderIssues(), renderStatus()) });
  const settingsPanel = createSettingsPanel(editor);

  const titleInput = h('input', {
    class: 'bg-transparent border border-transparent hover:border-line-strong focus:border-brand focus:outline-none rounded-[6px] px-2 h-8 text-[14px] font-semibold text-fg min-w-0 w-full max-w-[420px] truncate',
    value: initial.title ?? '',
    maxLength: 120,
    'aria-label': 'Название публикации',
    onInput: (e) => store.commit({ ...store.get(), title: e.target.value }, { label: 'Название', coalesce: 'title' }),
  });
  const statusEl = h('div', { class: 'flex items-center gap-1.5 text-[12px] text-fg-faint whitespace-nowrap', role: 'status', 'aria-live': 'polite' });
  const templateBtn = h('button', { class: 'btn btn-sm', 'aria-haspopup': 'menu', onClick: (e) => openTemplateMenu(e.currentTarget) });
  const undoBtn = h('button', { class: 'btn btn-ghost btn-icon', title: 'Отменить (Ctrl+Z)', 'aria-label': 'Отменить', onClick: () => doUndo() }, icon('undo'));
  const redoBtn = h('button', { class: 'btn btn-ghost btn-icon', title: 'Повторить (Ctrl+Shift+Z)', 'aria-label': 'Повторить', onClick: () => doRedo() }, icon('redo'));
  const historyBtn = h('button', { class: 'btn btn-ghost btn-icon', title: 'История версий', 'aria-label': 'История версий', onClick: () => openHistory() }, icon('history'));
  const leftToggle = h('button', { class: 'btn btn-ghost btn-icon', title: 'Панель данных', 'aria-label': 'Панель данных', onClick: () => togglePanel('left') }, icon('panelLeft'));
  const rightToggle = h('button', { class: 'btn btn-ghost btn-icon', title: 'Панель оформления', 'aria-label': 'Панель оформления', onClick: () => togglePanel('right') }, icon('panelRight'));
  const saveBtn = h('button', { class: 'btn', title: 'Сохранить (Ctrl+S)', onClick: () => save() }, icon('save', { size: 15 }), h('span', { class: 'max-[900px]:hidden' }, 'Сохранить'));
  const exportBtn = h('button', { class: 'btn btn-primary rounded-r-none', title: 'Экспорт PNG (Ctrl+Shift+E)', onClick: () => exportPng() }, icon('download', { size: 15 }), h('span', {}, 'PNG'));
  const exportMore = h('button', { class: 'btn btn-primary btn-icon rounded-l-none border-l border-l-black/20 !w-7', 'aria-label': 'Параметры экспорта', 'aria-haspopup': 'menu', onClick: (e) => openExportMenu(e.currentTarget) }, icon('chevronDown', { size: 14 }));
  const moreBtn = h('button', { class: 'btn btn-ghost btn-icon', 'aria-label': 'Ещё', title: 'Ещё', onClick: (e) => openMoreMenu(e.currentTarget) }, icon('more'));

  const topbar = h(
    'header',
    { class: 'flex items-center gap-2 h-14 px-3 border-b border-line bg-panel shrink-0' },
    h('a', { href: '#/projects', class: 'btn btn-ghost btn-icon', title: 'К публикациям', 'aria-label': 'К публикациям' }, icon('arrowLeft')),
    leftToggle,
    h('div', { class: 'flex items-center gap-2 min-w-0 flex-1' }, titleInput, statusEl),
    h('div', { class: 'flex items-center gap-1 max-[1100px]:hidden' }, templateBtn),
    h('div', { class: 'w-px h-6 bg-line mx-1' }),
    undoBtn,
    redoBtn,
    historyBtn,
    rightToggle,
    moreBtn,
    h('div', { class: 'w-px h-6 bg-line mx-1' }),
    saveBtn,
    h('div', { class: 'flex' }, exportBtn, exportMore),
  );

  const tabsEl = h('div', { class: 'flex gap-1 px-3 pt-2.5 border-b border-line', role: 'tablist' });
  const leftBody = h('div', { class: 'flex-1 min-h-0 overflow-auto' });
  const leftPanel = h('aside', { class: 'df-editor-left w-[340px] shrink-0 flex flex-col border-r border-line bg-panel min-h-0', 'aria-label': 'Данные публикации' }, tabsEl, leftBody);
  const rightHeader = h('div', { class: 'flex items-center justify-between h-11 px-4 border-b border-line shrink-0' }, h('span', { class: 'text-[13px] font-semibold' }, 'Оформление'), h('button', { class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': 'Скрыть панель', onClick: () => togglePanel('right') }, icon('x', { size: 14 })));
  const rightPanel = h('aside', { class: 'df-editor-right w-[312px] shrink-0 flex flex-col border-l border-line bg-panel min-h-0', 'aria-label': 'Оформление' }, rightHeader, h('div', { class: 'flex-1 min-h-0 overflow-auto' }, settingsPanel.el));

  const issuesEl = h('div', { class: 'flex flex-col gap-1 max-h-[120px] overflow-auto', role: 'log', 'aria-label': 'Проверка макета' });
  const versionBanner = !exactVersion
    ? h('div', { class: 'px-4 py-2 text-[12px] text-warn bg-warn/5 border-b border-warn/20' }, `Публикация сохранена в версии шаблона ${initial.templateVersion}, которая больше не поставляется; показана версия ${template.version}.`)
    : null;
  const bottomBar = h('div', { class: 'flex items-start gap-3 px-4 py-2.5 border-t border-line bg-panel shrink-0' }, h('div', { class: 'flex-1 min-w-0' }, issuesEl), preview.zoomBar);
  const center = h('section', { class: 'flex-1 min-w-0 flex flex-col min-h-0 bg-canvas', 'aria-label': 'Предпросмотр' }, versionBanner, preview.el, bottomBar);
  const workspace = h('div', { class: 'relative flex flex-1 min-h-0' }, leftPanel, center, rightPanel);
  const root = h('div', { class: 'flex flex-col h-full', dataset: { editor: '' } }, topbar, workspace);

  /* ---------- Left panel ---------- */
  let dataPanel = null;
  let draftModule = null;
  async function mountDataPanel() {
    dataPanel?.destroy?.();
    dataPanel = null;
    if (template.source === 'match') dataPanel = createMatchPanel(editor);
    else if (template.source === 'matches') dataPanel = createMatchesPanel(editor);
    else if (template.source === 'draft') {
      try {
        draftModule ??= await import('./panels/dataDraft.js');
        dataPanel = draftModule.createDraftPanel(editor);
      } catch (err) {
        console.error(err);
        dataPanel = { el: emptyState({ icon: 'alert', title: 'Редактор драфта недоступен', text: err.message }) };
      }
    }
    dataPanel?.refresh?.();
    renderLeft();
  }

  function renderLeft() {
    const tabs = [
      ['data', 'Данные'],
      ['templates', 'Шаблоны'],
    ];
    if (window.innerWidth < 1100) tabs.push(['style', 'Оформление']);
    if (leftTab === 'style' && window.innerWidth >= 1100) leftTab = 'data';
    tabsEl.replaceChildren(
      ...tabs.map(([id, label]) =>
        h(
          'button',
          {
            role: 'tab',
            'aria-selected': String(leftTab === id),
            class: ['h-8 px-3 text-[12.5px] font-medium border-b-2 -mb-px transition-colors', leftTab === id ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg'],
            onClick: () => {
              leftTab = id;
              renderLeft();
            },
          },
          label,
        ),
      ),
    );
    if (leftTab === 'data') leftBody.replaceChildren(dataPanel?.el ?? h('div', { class: 'p-6' }, spinner()));
    else if (leftTab === 'templates') leftBody.replaceChildren(templateLibrary());
    else leftBody.replaceChildren(settingsPanel.el);
  }

  function templateLibrary() {
    const current = store.get().templateId;
    return h(
      'div',
      { class: 'flex flex-col p-2 gap-0.5' },
      listTemplates().map((t) =>
        h(
          'button',
          {
            class: ['text-left rounded-[9px] px-3 py-2.5 border transition-colors', t.id === current ? 'border-brand/50 bg-brand-soft' : 'border-transparent hover:bg-hover'],
            'aria-current': t.id === current ? 'true' : undefined,
            onClick: () => switchTemplate(t.id),
          },
          h('div', { class: 'flex items-center justify-between gap-2' }, h('span', { class: 'text-[13px] font-semibold' }, t.name), h('span', { class: 'badge' }, TEMPLATE_TYPES[t.type] ?? t.type)),
          h('div', { class: 'mt-1 text-[12px] text-fg-muted leading-snug' }, t.description),
        ),
      ),
    );
  }

  async function switchTemplate(id) {
    if (id === store.get().templateId) return;
    const next = await switchTemplateState(store.get(), id, lookups);
    store.commit(next, { label: `Шаблон ${getTemplate(id)?.name}` });
  }

  /* ---------- Rendering ---------- */
  function renderStatus() {
    const s = store.get();
    const dirty = store.isDirty();
    const errors = issues.filter((i) => i.level === 'error').length;
    statusEl.replaceChildren(
      saving ? spinner('!w-3 !h-3') : h('span', { class: ['w-1.5 h-1.5 rounded-full', dirty ? 'bg-warn' : 'bg-ok'] }),
      h('span', { class: 'max-[1280px]:hidden' }, saving ? 'Сохранение…' : store.isNew() ? 'Не сохранено' : dirty ? 'Есть несохранённые изменения' : `Сохранено ${relativeTime(s.savedAt)}`),
    );
    templateBtn.replaceChildren(icon('layers', { size: 14 }), h('span', { class: 'max-w-[180px] truncate' }, template.name), icon('chevronDown', { size: 13 }));
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    historyBtn.disabled = store.isNew();
    saveBtn.disabled = saving || (!dirty && !store.isNew());
    exportBtn.disabled = exporting || errors > 0;
    exportBtn.title = errors ? 'Исправьте ошибки макета, чтобы экспортировать' : 'Экспорт PNG (Ctrl+Shift+E)';
    exportBtn.querySelector('span').textContent = exporting ? 'Экспорт…' : `PNG ${sizeOf(s).width}`;
    leftToggle.setAttribute('aria-pressed', String(panels.left));
    rightToggle.setAttribute('aria-pressed', String(panels.right));
    if (document.activeElement !== titleInput && titleInput.value !== s.title) titleInput.value = s.title ?? '';
  }

  function renderIssues() {
    issuesEl.replaceChildren(
      ...(issues.length
        ? issues.map((i) =>
            h(
              'div',
              { class: ['flex items-start gap-2 text-[12px] leading-snug', i.level === 'error' ? 'text-danger' : 'text-warn'] },
              h('span', { class: 'mt-px' }, icon('alert', { size: 13 })),
              h('span', {}, i.message),
            ),
          )
        : [h('div', { class: 'flex items-center gap-2 text-[12px] text-fg-faint h-6' }, h('span', { class: 'text-ok' }, icon('check', { size: 13 })), 'Макет в порядке: текст помещается, данные заполнены')]),
    );
  }

  const sizeOf = (s) => template.exportSizes.find((x) => x.id === s.size) ?? template.exportSizes[0];

  function applyPanels() {
    const narrow = window.innerWidth < 1100;
    leftPanel.hidden = !panels.left;
    rightPanel.hidden = !panels.right || narrow;
    leftPanel.classList.toggle('df-drawer', window.innerWidth < 768);
    try {
      localStorage.setItem(PANEL_KEY, JSON.stringify(panels));
    } catch {
      /* ignore */
    }
    renderLeft();
    renderStatus();
  }
  function togglePanel(side) {
    if (side === 'right' && window.innerWidth < 1100) {
      panels.left = true;
      leftTab = leftTab === 'style' ? 'data' : 'style';
    } else panels[side] = !panels[side];
    applyPanels();
  }

  let lastTemplateId = template.id;
  function onState(s, meta) {
    const tplChanged = s.templateId !== lastTemplateId || (meta.type !== 'commit' && template.version !== s.templateVersion && hasExactVersion(s.templateId, s.templateVersion));
    if (s.templateId !== template.id) template = getTemplate(s.templateId, s.templateVersion) ?? getTemplate(s.templateId);
    preview.render({ template, data: s.data, style: s.style });
    if (tplChanged) {
      lastTemplateId = s.templateId;
      mountDataPanel();
      settingsPanel.refresh(true);
    } else {
      dataPanel?.refresh?.(meta);
      settingsPanel.refresh(meta.type !== 'commit');
      if (leftTab === 'templates') renderLeft();
    }
    fire('change', { state: s, meta });
    renderStatus();
  }
  cleanups.push(store.subscribe(onState));

  /* ---------- Actions ---------- */
  function doUndo() {
    const label = store.undo();
    if (label) toast(`Отменено: ${label}`, { duration: 1400 });
  }
  function doRedo() {
    const label = store.redo();
    if (label) toast(`Повторено: ${label}`, { duration: 1400 });
  }

  async function makeThumbnail(s) {
    try {
      const { blob } = await renderPng({ template, data: s.data, style: s.style, size: { width: 360, height: Math.round((360 * template.base.height) / template.base.width) } });
      const asset = { id: createId('media'), kind: 'thumbnail', mimeType: 'image/png', fileName: 'thumbnail.png', size: blob.size, width: 360, height: 360, blob, createdAt: nowIso() };
      await saveAsset(asset);
      return asset.id;
    } catch (err) {
      console.warn('[editor] thumbnail failed', err);
      return s.thumbnailAssetId ?? null;
    }
  }

  async function save({ silent = false } = {}) {
    if (saving) return false;
    const blocking = issues.filter((i) => i.level === 'error');
    saving = true;
    renderStatus();
    try {
      await dataPanel?.beforeSave?.();
      const s = store.get();
      const thumbnailAssetId = await makeThumbnail(s);
      const record = await projectsRepo.save({
        ...s,
        title: (s.title || '').trim() || autoTitle(template, s.data),
        templateId: template.id,
        templateVersion: template.version,
        thumbnailAssetId,
      });
      settingsRepo.set('defaults.socials', s.style.socials).catch(() => {});
      const wasNew = !s.id;
      const next = { ...store.get(), id: record.id, createdAt: record.createdAt, savedAt: record.savedAt, updatedAt: record.updatedAt, thumbnailAssetId, title: record.title };
      Object.assign(store.get(), { id: record.id, createdAt: record.createdAt, savedAt: record.savedAt, thumbnailAssetId, title: record.title });
      store.markSaved(next);
      if (wasNew) replaceHashSilently(`/editor/${record.id}`);
      if (!silent) toast(blocking.length ? 'Сохранено. В макете есть ошибки — экспорт недоступен до исправления.' : 'Публикация сохранена', { type: blocking.length ? 'warning' : 'success' });
      fire('saved', record);
      return true;
    } catch (err) {
      toastError(err, 'Не удалось сохранить');
      return false;
    } finally {
      saving = false;
      renderStatus();
    }
  }

  async function exportPng(sizeId) {
    if (exporting) return;
    const errors = issues.filter((i) => i.level === 'error');
    if (errors.length) return toast(errors[0].message, { type: 'error' });
    if (store.isDirty() || store.isNew()) {
      const ok = await save({ silent: true });
      if (!ok) return;
    }
    const s = store.get();
    const size = sizeId ? template.exportSizes.find((x) => x.id === sizeId) : sizeOf(s);
    exporting = true;
    renderStatus();
    const t = toast(`Экспорт PNG ${size.width}×${size.height}…`, { type: 'loading' });
    try {
      const { blob, width, height } = await renderPng({ template, data: s.data, style: s.style, size });
      downloadBlob(blob, exportFileName(s.title, template.id, size));
      t.update(`Готово: PNG ${width}×${height}, ${(blob.size / 1024).toFixed(0)} КБ`, 'success');
    } catch (err) {
      t.close();
      toastError(err, 'Экспорт не удался');
    } finally {
      exporting = false;
      renderStatus();
    }
  }

  function openTemplateMenu(anchor) {
    openMenu(
      anchor,
      listTemplates().map((t) => ({ label: t.name, hint: TEMPLATE_TYPES[t.type], icon: t.id === store.get().templateId ? 'check' : 'layers', onClick: () => switchTemplate(t.id) })),
      { align: 'start' },
    );
  }

  function openExportMenu(anchor) {
    const s = store.get();
    openMenu(anchor, [
      ...template.exportSizes.map((sz) => ({
        label: `PNG ${sz.label}`,
        icon: sz.id === s.size ? 'check' : 'download',
        hint: sz.id === s.size ? 'по умолчанию' : '',
        onClick: () => {
          if (sz.id !== s.size) store.commit({ ...store.get(), size: sz.id }, { label: 'Размер экспорта' });
          exportPng(sz.id);
        },
      })),
    ]);
  }

  function openMoreMenu(anchor) {
    openMenu(anchor, [
      { label: 'Дублировать публикацию', icon: 'copy', disabled: store.isNew(), onClick: () => duplicate() },
      { label: 'Новая публикация по этому матчу', icon: 'plus', disabled: !store.get().matchId, onClick: () => navigate('/new', { template: template.id, match: store.get().matchId }) },
      'separator',
      { label: 'Горячие клавиши', icon: 'keyboard', hint: '?', onClick: () => showShortcuts() },
      'separator',
      { label: 'Удалить публикацию', icon: 'trash', danger: true, disabled: store.isNew(), onClick: () => remove() },
    ]);
  }

  async function duplicate() {
    if (store.isDirty()) {
      const ok = await confirmDialog({ title: 'Сохранить перед копированием?', message: 'Копия будет создана из сохранённой версии. Сохранить текущие изменения?', confirmLabel: 'Сохранить и копировать' });
      if (!ok || !(await save({ silent: true }))) return;
    }
    try {
      const copy = await duplicateProject(store.get().id);
      toast('Создана копия публикации', { type: 'success' });
      navigate(`/editor/${copy.id}`, null, { force: true });
    } catch (err) {
      toastError(err);
    }
  }

  async function remove() {
    const ok = await confirmDialog({ title: 'Удалить публикацию?', message: `«${store.get().title}» и вся её история версий будут удалены без возможности восстановления. Матч и команды не изменятся.`, confirmLabel: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await projectsRepo.remove(store.get().id);
      toast('Публикация удалена', { type: 'success' });
      navigate('/projects', null, { force: true });
    } catch (err) {
      toastError(err);
    }
  }

  async function openHistory() {
    const id = store.get().id;
    if (!id) return;
    const list = h('div', { class: 'flex flex-col gap-1 -mx-1' }, h('div', { class: 'p-6 grid place-items-center' }, spinner()));
    const m = openModal({ title: 'История версий', description: 'Каждое сохранение — неизменяемый снимок данных и оформления. Его можно повторно экспортировать или восстановить в редакторе.', width: 620, content: list, footer: null });
    const revs = await projectsRepo.revisions(id);
    list.replaceChildren(
      ...revs.map((r, i) => {
        const thumb = h('div', { class: 'w-14 h-14 rounded-[6px] bg-base border border-line overflow-hidden shrink-0' });
        if (r.thumbnailAssetId) assetUrl(r.thumbnailAssetId).then((u) => u && thumb.append(h('img', { src: u, alt: '', class: 'w-full h-full object-cover' })));
        const tpl = getTemplate(r.templateId, r.templateVersion);
        return h(
          'div',
          { class: 'flex items-center gap-3 px-2 py-2 rounded-[8px] hover:bg-hover' },
          thumb,
          h('div', { class: 'flex-1 min-w-0' }, h('div', { class: 'text-[13px] font-medium truncate' }, r.title || 'Без названия'), h('div', { class: 'text-[12px] text-fg-faint' }, `${formatDateTimeShort(r.savedAt)} · ${tpl?.name ?? r.templateId} v${r.templateVersion}${i === 0 ? ' · текущая' : ''}${r.note ? ` · ${r.note}` : ''}`)),
          h(
            'button',
            {
              class: 'btn btn-sm',
              title: 'Экспорт этой версии',
              onClick: async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                  const t = getTemplate(r.templateId, r.templateVersion);
                  const size = t.exportSizes.find((x) => x.id === r.size) ?? t.exportSizes[0];
                  const { blob } = await renderPng({ template: t, data: r.data, style: r.style, size });
                  downloadBlob(blob, exportFileName(`${r.title}-${r.savedAt.slice(0, 10)}`, t.id, size));
                } catch (err) {
                  toastError(err, 'Экспорт не удался');
                } finally {
                  btn.disabled = false;
                }
              },
            },
            icon('download', { size: 13 }),
            'PNG',
          ),
          i > 0
            ? h(
                'button',
                {
                  class: 'btn btn-sm btn-ghost',
                  onClick: () => {
                    store.commit({ ...store.get(), title: r.title, templateId: r.templateId, templateVersion: r.templateVersion, data: r.data, style: r.style, size: r.size }, { label: 'Восстановление версии' });
                    m.close();
                    toast('Версия восстановлена в редакторе. Сохраните, чтобы закрепить её как текущую.', { type: 'info' });
                  },
                },
                'Восстановить',
              )
            : null,
        );
      }),
    );
    if (!revs.length) list.replaceChildren(h('p', { class: 'text-[13px] text-fg-muted py-6 text-center' }, 'Версий пока нет'));
  }

  function showShortcuts() {
    const rows = [
      ['Ctrl + S', 'Сохранить'],
      ['Ctrl + Z', 'Отменить'],
      ['Ctrl + Shift + Z / Ctrl + Y', 'Повторить'],
      ['Ctrl + Shift + E', 'Экспорт PNG'],
      ['0', 'Вписать предпросмотр'],
      ['1', 'Масштаб 100%'],
      ['+ / −', 'Масштаб'],
      ['[ / ]', 'Скрыть/показать панели'],
      ['?', 'Эта справка'],
    ];
    openModal({
      title: 'Горячие клавиши',
      width: 420,
      content: h('div', { class: 'flex flex-col' }, rows.map(([k, v]) => h('div', { class: 'flex justify-between items-center py-2 border-b border-line last:border-0 text-[13px]' }, h('span', { class: 'text-fg-muted' }, v), h('span', { class: 'flex gap-1' }, k.split(' / ').map((x) => h('kbd', { class: 'kbd' }, x)))))),
      footer: null,
    });
  }

  /* ---------- Keyboard ---------- */
  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target;
    const typing = target instanceof HTMLElement && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !['range', 'checkbox', 'color', 'radio', 'button'].includes(target.type)) || target.isContentEditable);
    if (document.querySelector('[role="dialog"]')) return;
    const key = e.key.toLowerCase();
    if (mod && key === 's') {
      e.preventDefault();
      save();
    } else if (mod && e.shiftKey && key === 'e') {
      e.preventDefault();
      exportPng();
    } else if (mod && !typing && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      doUndo();
    } else if (mod && !typing && ((key === 'z' && e.shiftKey) || key === 'y')) {
      e.preventDefault();
      doRedo();
    } else if (!mod && !typing && !e.altKey) {
      if (e.key === '0') preview.setZoom('fit');
      else if (e.key === '1') preview.setZoom(1);
      else if (e.key === '+' || e.key === '=') preview.step(1);
      else if (e.key === '-') preview.step(-1);
      else if (e.key === '[') togglePanel('left');
      else if (e.key === ']') togglePanel('right');
      else if (e.key === '?') showShortcuts();
    }
  }
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));
  const onResize = () => applyPanels();
  window.addEventListener('resize', onResize);
  cleanups.push(() => window.removeEventListener('resize', onResize));

  // Live lookups: keep team/match lists fresh for panels (snapshots are NOT touched).
  cleanups.push(
    on('data:changed', async ({ store: st }) => {
      if (st !== 'teams' && st !== 'matches') return;
      const fresh = await loadLookups();
      editor.teams = lookups.teams = fresh.teams;
      editor.matches = lookups.matches = fresh.matches;
      editor.teamsById = lookups.teamsById = fresh.teamsById;
      dataPanel?.refresh?.({ type: 'lookups' });
    }),
  );

  const statusTimer = setInterval(renderStatus, 30000);
  cleanups.push(() => clearInterval(statusTimer));

  /* ---------- Init ---------- */
  applyPanels();
  mountDataPanel();
  settingsPanel.refresh(true);
  preview.render({ template, data: store.get().data, style: store.get().style });
  renderStatus();
  renderIssues();

  return {
    el: root,
    title: store.get().title || 'Редактор',
    isDirty: () => store.isDirty(),
    async canLeave() {
      if (!store.isDirty()) return true;
      return confirmDialog({ title: 'Уйти без сохранения?', message: store.isNew() ? 'Публикация ещё не сохранена — изменения будут потеряны.' : 'Есть несохранённые изменения. Они будут потеряны.', confirmLabel: 'Уйти без сохранения', danger: true });
    },
    destroy() {
      cleanups.forEach((fn) => fn());
      preview.destroy();
      dataPanel?.destroy?.();
    },
  };
}
