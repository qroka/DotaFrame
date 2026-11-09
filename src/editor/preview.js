/**
 * Preview canvas: renders the poster through the shared pipeline, scales it to fit
 * (or a fixed zoom), and reports issues. Renders are serialized and coalesced.
 */
import { h } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { renderPoster } from '../render/renderPoster.js';

const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25];

export function createPreview({ onIssues } = {}) {
  let zoom = 'fit';
  let base = { width: 1080, height: 1080 };
  let rendering = false;
  let pending = null;
  let lastIssues = [];

  const frame = h('div', { class: 'relative shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 bg-black', dataset: { previewFrame: '' } });
  const scaler = h('div', { class: 'origin-top-left absolute left-0 top-0', dataset: { previewScaler: '' } });
  frame.append(scaler);
  const busy = h('div', { class: 'absolute top-3 right-3 z-10 hidden items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white/80' }, h('span', { class: 'spinner !w-3 !h-3' }), 'Обновление');
  const stage = h('div', { class: 'relative flex-1 min-h-0 overflow-auto checker-dim', dataset: { previewStage: '' } }, h('div', { class: 'min-w-full min-h-full grid place-items-center p-8 box-border' }, frame), busy);

  const zoomLabel = h('span', { class: 'w-12 text-center text-[12px] tabular-nums text-fg-muted' });
  const zoomBar = h(
    'div',
    { class: 'flex items-center gap-0.5' },
    h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Уменьшить (−)', 'aria-label': 'Уменьшить масштаб', onClick: () => step(-1) }, icon('zoomOut', { size: 15 })),
    zoomLabel,
    h('button', { class: 'btn btn-ghost btn-icon btn-sm', title: 'Увеличить (+)', 'aria-label': 'Увеличить масштаб', onClick: () => step(1) }, icon('zoomIn', { size: 15 })),
    h('button', { class: 'btn btn-ghost btn-sm', title: 'Вписать (0)', onClick: () => setZoom('fit') }, icon('maximize', { size: 14 }), 'Вписать'),
    h('button', { class: 'btn btn-ghost btn-sm tabular-nums', title: '100% (1)', onClick: () => setZoom(1) }, '100%'),
  );

  function currentScale() {
    if (zoom !== 'fit') return zoom;
    const w = stage.clientWidth - 64;
    const hgt = stage.clientHeight - 64;
    return Math.max(0.1, Math.min(w / base.width, hgt / base.height, 1.5));
  }

  function layout() {
    const sc = currentScale();
    frame.style.width = `${Math.round(base.width * sc)}px`;
    frame.style.height = `${Math.round(base.height * sc)}px`;
    scaler.style.width = `${base.width}px`;
    scaler.style.height = `${base.height}px`;
    scaler.style.transform = `scale(${sc})`;
    zoomLabel.textContent = `${Math.round(sc * 100)}%`;
  }

  function setZoom(z) {
    zoom = z;
    layout();
  }
  function step(dir) {
    const sc = currentScale();
    const next = dir > 0 ? ZOOMS.find((z) => z > sc + 0.01) : [...ZOOMS].reverse().find((z) => z < sc - 0.01);
    if (next) setZoom(next);
  }

  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);

  async function render(job) {
    if (rendering) {
      pending = job;
      return;
    }
    rendering = true;
    const showBusy = setTimeout(() => (busy.classList.remove('hidden'), busy.classList.add('flex')), 250);
    try {
      base = job.template.base;
      layout();
      const holder = h('div', { class: 'absolute left-0 top-0', style: { visibility: 'hidden' } });
      scaler.append(holder);
      const { issues } = await renderPoster(holder, job);
      holder.style.visibility = 'visible';
      for (const child of [...scaler.children]) if (child !== holder) child.remove();
      lastIssues = issues;
      onIssues?.(issues);
    } catch (err) {
      console.error(err);
      onIssues?.([{ level: 'error', message: `Не удалось построить предпросмотр: ${err.message}` }]);
    } finally {
      clearTimeout(showBusy);
      busy.classList.add('hidden');
      busy.classList.remove('flex');
      rendering = false;
      if (pending) {
        const next = pending;
        pending = null;
        render(next);
      }
    }
  }

  return {
    el: stage,
    zoomBar,
    render,
    setZoom,
    step,
    issues: () => lastIssues,
    destroy: () => ro.disconnect(),
  };
}
