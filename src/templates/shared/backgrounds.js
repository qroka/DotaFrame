/**
 * Built-in procedural backgrounds. They are pure CSS/SVG (no third-party photos),
 * so they are safe to ship and identical in preview and PNG export.
 * Users can upload their own photo on top (style.background.assetId).
 */

/**
 * Film grain as a tiny PNG generated once on a canvas with a fixed seed.
 * (An SVG feTurbulence filter looks the same in preview but renders as a solid
 * black rect inside html-to-image's foreignObject, so PNG is used instead.)
 */
const grainCache = new Map();
const grain = (opacity = 0.18) => {
  if (grainCache.has(opacity)) return grainCache.get(opacity);
  if (typeof document === 'undefined') return 'none';
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'none';
  const img = ctx.createImageData(size, size);
  let seed = 1337;
  const max = Math.round(255 * opacity * 0.9);
  for (let i = 0; i < size * size; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    img.data[o + 3] = (seed >> 8) % (max + 1);
  }
  ctx.putImageData(img, 0, 0);
  const css = `url("${canvas.toDataURL('image/png')}")`;
  grainCache.set(opacity, css);
  return css;
};

const lines = (color = 'rgba(255,255,255,0.05)', gap = 18) =>
  `repeating-linear-gradient(115deg, ${color} 0 2px, transparent 2px ${gap}px)`;

export const BACKGROUND_PRESETS = {
  ember: {
    id: 'ember',
    label: 'Ember',
    swatch: 'linear-gradient(135deg,#2a0b0b,#b3261e)',
    css: (accent) =>
      [
        grain(0.16),
        `radial-gradient(120% 90% at 85% 15%, ${accent}aa 0%, transparent 55%)`,
        'radial-gradient(90% 80% at 10% 100%, #3b0d0d 0%, transparent 60%)',
        'linear-gradient(160deg, #1a0606 0%, #0b0303 100%)',
      ].join(','),
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    swatch: 'linear-gradient(135deg,#050814,#1d2a5c)',
    css: (accent) =>
      [
        grain(0.14),
        `radial-gradient(110% 80% at 80% 0%, ${accent}66 0%, transparent 55%)`,
        'radial-gradient(80% 70% at 0% 100%, #1b2550 0%, transparent 60%)',
        'linear-gradient(180deg, #070a16 0%, #03040a 100%)',
      ].join(','),
  },
  radiant: {
    id: 'radiant',
    label: 'Radiant',
    swatch: 'linear-gradient(135deg,#04140e,#1f7a4d)',
    css: () =>
      [
        grain(0.15),
        'radial-gradient(100% 80% at 20% 10%, #2fa36b88 0%, transparent 55%)',
        'radial-gradient(90% 70% at 100% 100%, #0d3b2a 0%, transparent 60%)',
        'linear-gradient(170deg, #06140f 0%, #020805 100%)',
      ].join(','),
  },
  dire: {
    id: 'dire',
    label: 'Dire',
    swatch: 'linear-gradient(135deg,#140404,#7a1f1f)',
    css: () =>
      [
        grain(0.15),
        'radial-gradient(100% 80% at 80% 10%, #a3302f88 0%, transparent 55%)',
        'radial-gradient(90% 70% at 0% 100%, #3b0d0d 0%, transparent 60%)',
        'linear-gradient(170deg, #140606 0%, #080202 100%)',
      ].join(','),
  },
  graphite: {
    id: 'graphite',
    label: 'Graphite',
    swatch: 'linear-gradient(135deg,#0c0c0e,#3a3a40)',
    css: (accent) =>
      [
        grain(0.2),
        lines('rgba(255,255,255,0.035)', 22),
        `radial-gradient(90% 70% at 100% 0%, ${accent}33 0%, transparent 60%)`,
        'linear-gradient(160deg, #1c1c20 0%, #0a0a0c 100%)',
      ].join(','),
  },
  aegis: {
    id: 'aegis',
    label: 'Aegis',
    swatch: 'linear-gradient(135deg,#140f05,#b88a2a)',
    css: () =>
      [
        grain(0.15),
        'radial-gradient(80% 70% at 50% 0%, #e0b24f77 0%, transparent 60%)',
        'radial-gradient(90% 60% at 50% 110%, #3a2a0c 0%, transparent 60%)',
        'linear-gradient(180deg, #17110a 0%, #070503 100%)',
      ].join(','),
  },
  storm: {
    id: 'storm',
    label: 'Storm',
    swatch: 'linear-gradient(135deg,#0b0716,#5b3fb8)',
    css: (accent) =>
      [
        grain(0.15),
        `radial-gradient(100% 80% at 90% 10%, ${accent}66 0%, transparent 55%)`,
        'radial-gradient(90% 80% at 0% 90%, #3b2a7a88 0%, transparent 60%)',
        'linear-gradient(160deg, #0e0a1d 0%, #040309 100%)',
      ].join(','),
  },
  solid: {
    id: 'solid',
    label: 'Сплошной',
    swatch: '#111',
    css: (_accent, solid = '#0b0b0d') => solid,
  },
};

export const BACKGROUND_OPTIONS = Object.values(BACKGROUND_PRESETS).map((b) => ({ value: b.id, label: b.label, swatch: b.swatch }));

export function backgroundCss(presetId, accent = '#e5322d', solid) {
  const preset = BACKGROUND_PRESETS[presetId] ?? BACKGROUND_PRESETS.midnight;
  return preset.css(accent, solid);
}
