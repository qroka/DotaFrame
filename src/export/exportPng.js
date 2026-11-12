/**
 * PNG export. Renders a fresh, untransformed poster offscreen with the same pipeline
 * as the preview, waits for fonts/images, rasterizes with html-to-image and verifies
 * the real pixel size of the result.
 *
 * Size comes only from the template config: the base frame is rendered at its native
 * size and scaled with pixelRatio (e.g. 1080 base → 1280 export = ratio 1.185),
 * so layout never differs between preview and export sizes.
 */
import { toBlob } from 'html-to-image';
import { renderPoster } from '../render/renderPoster.js';
import { fontEmbedCss } from './fontEmbed.js';
import { slugify } from '../core/utils';

export class ExportError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ExportError';
    this.cause = cause;
  }
}

function createHost(base) {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.dataset.exportHost = 'true';
  host.style.cssText = `position:fixed;left:-${base.width * 3}px;top:0;width:${base.width}px;height:${base.height}px;overflow:hidden;pointer-events:none;contain:strict;`;
  document.body.append(host);
  return host;
}

async function pngSize(blob) {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return size;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Render and rasterize a poster.
 * @param {{ template, data, style, size?: {width, height}, transparent?: boolean }} opts
 * @returns {Promise<{ blob: Blob, width: number, height: number, issues: any[] }>}
 */
export async function renderPng({ template, data, style, size, transparent = false }) {
  const base = template.base;
  const target = size ?? template.exportSizes[0] ?? base;
  const ratio = target.width / base.width;
  if (Math.abs(target.height / base.height - ratio) > 0.001) throw new ExportError('Размер экспорта не совпадает с пропорциями шаблона');

  const host = createHost(base);
  try {
    const { el, issues, style: resolved } = await renderPoster(host, { template, data, style, mode: 'export' });
    if (issues.some((i) => i.level === 'error')) {
      throw new ExportError(issues.find((i) => i.level === 'error').message);
    }
    el.querySelectorAll('[data-overflow]').forEach((n) => n.removeAttribute('data-overflow'));
    if (transparent) el.style.background = 'transparent';

    let fontCSS = '';
    try {
      fontCSS = await fontEmbedCss([resolved.font.family, resolved.bodyFont.family, 'roboto-flex']);
    } catch (err) {
      throw new ExportError('Не удалось подготовить шрифты для экспорта', err);
    }

    const options = {
      width: base.width,
      height: base.height,
      canvasWidth: base.width,
      canvasHeight: base.height,
      pixelRatio: ratio,
      fontEmbedCSS: fontCSS,
      cacheBust: false,
      style: { transform: 'none', margin: '0', left: '0', top: '0' },
    };
    let blob;
    try {
      // Rasterize twice: the first pass warms decoded images inside the SVG foreignObject
      // (required by WebKit/Firefox to avoid blank images); the second is the result.
      await toBlob(el, options);
      blob = await toBlob(el, options);
    } catch (err) {
      throw new ExportError('Не удалось создать PNG. Проверьте изображения в макете.', err);
    }
    if (!blob) throw new ExportError('Браузер вернул пустое изображение');
    const real = await pngSize(blob);
    if (real.width !== target.width || real.height !== target.height) {
      throw new ExportError(`Получен PNG ${real.width}×${real.height} вместо ${target.width}×${target.height}`);
    }
    return { blob, width: real.width, height: real.height, issues };
  } finally {
    host.remove();
  }
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportFileName(title, templateId, size) {
  return `${slugify(title || templateId)}-${size.width}x${size.height}.png`;
}
