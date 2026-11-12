/**
 * Builds @font-face CSS with fonts inlined as data URLs for html-to-image.
 *
 * Why: html-to-image otherwise walks every stylesheet and fetches fonts itself,
 * which is slow and fails on cross-origin sheets. We embed exactly the bundled
 * files (latin, latin-ext, cyrillic, cyrillic-ext) of the fonts a poster uses,
 * so exports never depend on the network or a CDN.
 */
import robotoCss from '@fontsource-variable/roboto-flex/full.css?raw';
import oswaldCss from '@fontsource-variable/oswald/index.css?raw';
import unboundedCss from '@fontsource-variable/unbounded/index.css?raw';
import interCss from '@fontsource-variable/inter/index.css?raw';
import { blobToDataUrl } from '../core/assets';

const FILES = {
  ...import.meta.glob('/node_modules/@fontsource-variable/roboto-flex/files/roboto-flex-{latin,latin-ext,cyrillic,cyrillic-ext}-full-normal.woff2', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob('/node_modules/@fontsource-variable/{oswald,unbounded,inter}/files/*-{latin,latin-ext,cyrillic,cyrillic-ext}-wght-normal.woff2', { query: '?url', import: 'default', eager: true }),
};

const CSS = { 'roboto-flex': robotoCss, oswald: oswaldCss, unbounded: unboundedCss, inter: interCss };

/** file name → resolved URL */
const urlByFile = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.split('/').pop(), url]));

const cache = new Map(); // fontId -> Promise<string css>

async function buildFontCss(fontId) {
  const source = CSS[fontId];
  if (!source) return '';
  const blocks = source.match(/@font-face\s*{[^}]*}/g) ?? [];
  const out = [];
  for (const block of blocks) {
    const file = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
    const url = file && urlByFile[file];
    if (!url) continue; // subset not bundled for export (greek, vietnamese…)
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось загрузить шрифт ${file}`);
    const dataUrl = await blobToDataUrl(await res.blob());
    out.push(block.replace(/url\([^)]+\)/, `url(${dataUrl})`));
  }
  return out.join('\n');
}

export function fontEmbedCss(fontIds) {
  const unique = [...new Set(fontIds)];
  return Promise.all(
    unique.map((id) => {
      if (!cache.has(id)) {
        const p = buildFontCss(id).catch((err) => {
          cache.delete(id);
          throw err;
        });
        cache.set(id, p);
      }
      return cache.get(id);
    }),
  ).then((parts) => parts.join('\n'));
}
