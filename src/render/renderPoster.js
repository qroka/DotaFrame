/**
 * Single rendering pipeline used by preview, thumbnails and PNG export.
 *
 *   resolve assets → template.render(ctx) → mount → wait fonts & images → fit text → report
 *
 * Preview and export call exactly the same function with the same data/style,
 * so what the user sees is what gets exported.
 */
import { collectAssetRefs } from '../data/media.js';
import { getFont } from '../templates/shared/fonts.js';
import { normalizeStyle } from '../templates/registry.js';

/** Ensure fonts used by the style are loaded (with Cyrillic + Latin glyphs). */
export async function loadPosterFonts(style) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'MATCH WIN LOSE 0123456789 Матч Победа ЁЖЩ';
  const confs = [style.font, style.bodyFont, { family: 'roboto-flex', weight: 700 }];
  await Promise.all(
    confs.map((f) => {
      const fam = getFont(f?.family).cssFamily;
      return document.fonts.load(`${f?.weight ?? 700} 64px "${fam}"`, sample).catch(() => null);
    }),
  );
  await document.fonts.ready;
}

async function waitImages(el) {
  const imgs = [...el.querySelectorAll('img')];
  const failed = [];
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.getAttribute('src')) return;
      try {
        if (!img.complete) await new Promise((res, rej) => ((img.onload = res), (img.onerror = rej)));
        await img.decode();
      } catch {
        failed.push(img);
        img.remove();
      }
    }),
  );
  return failed.length;
}

// Single-line ('x') boxes only check width: with `text-box-trim` the box is trimmed to cap
// height, so glyph ascenders/descenders always exceed clientHeight by design.
const overflows = (el, tol = 1.5) => el.scrollWidth > el.clientWidth + tol || (el.dataset.fit === 'box' && el.scrollHeight > el.clientHeight + tol);

/**
 * Shrink each [data-fit] element's font-size until it fits (binary search down to data-fit-min).
 * Returns labels of elements that still overflow at the minimum size.
 */
export function fitAll(root) {
  const stillOverflowing = [];
  for (const el of root.querySelectorAll('[data-fit]')) {
    el.removeAttribute('data-overflow');
    const max = parseFloat(el.style.fontSize) || 48;
    const min = Math.min(max, parseFloat(el.dataset.fitMin) || max * 0.5);
    if (!overflows(el)) continue;
    let lo = min;
    let hi = max;
    el.style.fontSize = `${lo}px`;
    if (overflows(el)) {
      el.dataset.overflow = 'true';
      stillOverflowing.push(el.dataset.fitLabel || el.textContent.slice(0, 40));
      continue;
    }
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (overflows(el)) hi = mid;
      else lo = mid;
    }
    el.style.fontSize = `${Math.floor(lo * 10) / 10}px`;
  }
  return stillOverflowing;
}

/**
 * Render a poster into `host`.
 * @returns {Promise<{ el: HTMLElement, issues: Array<{level, message}> }>}
 */
export async function renderPoster(host, { template, data, style: rawStyle, mode = 'preview' }) {
  const style = normalizeStyle(template, rawStyle);
  const ids = [...collectAssetRefs({ data, style })];
  const urls = Object.fromEntries(ids.map((id) => [id, `/api/media/${encodeURIComponent(id)}`]));
  const issues = [];
  const missing = ids.filter((id) => !urls[id]);
  if (missing.length) issues.push({ level: 'warning', message: `Не найдено изображений: ${missing.length}. Вместо них показаны заглушки.` });

  const ctx = {
    template,
    data,
    style,
    base: template.base,
    mode,
    url: (id) => (id ? (urls[id] ?? null) : null),
  };

  let el;
  try {
    el = template.render(ctx);
  } catch (err) {
    console.error('[render] template failed', err);
    el = document.createElement('div');
    el.className = 'df-poster';
    el.style.cssText = `width:${template.base.width}px;height:${template.base.height}px;display:grid;place-items:center;color:#fff;font:600 40px sans-serif;background:#2a0b0b`;
    el.textContent = 'Ошибка рендеринга шаблона';
    issues.push({ level: 'error', message: `Ошибка рендеринга: ${err.message}` });
  }

  await loadPosterFonts(style);
  host.append(el);
  const broken = await waitImages(el);
  if (broken) issues.push({ level: 'warning', message: `Не удалось отобразить изображений: ${broken}` });

  const over = fitAll(el);
  for (const label of over) issues.push({ level: 'warning', message: `Текст не помещается даже в минимальном размере: «${label}». Сократите его.` });

  try {
    for (const issue of template.validate(data, style) ?? []) issues.push(issue);
  } catch (err) {
    issues.push({ level: 'warning', message: `Проверка шаблона не выполнена: ${err.message}` });
  }
  return { el, issues, style };
}
