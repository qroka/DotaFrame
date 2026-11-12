/**
 * Poster building blocks shared by all templates: root, background/overlay/gradient/player
 * layers, logos with placeholders, fitted text, socials. Templates compose these so the
 * business rules (what to show, fallbacks) live in one place.
 *
 * All sizes are in poster pixels of the base frame (1080 × 1080). Export scales the whole
 * frame with pixelRatio, so layout is identical for every export size.
 */
import { h, s } from '../../core/dom';
import { backgroundCss } from './backgrounds.js';
import { fontStyle, syntheticSkew } from './fonts.js';
import { FORMATS } from '../../domain/series';
import { formatPosterDate, tzShort } from '../../domain/time';

/** Poster root. Sets CSS variables used by poster.css. */
export function posterRoot(ctx, className, ...children) {
  const { style, base } = ctx;
  return h(
    'div',
    {
      class: ['df-poster', className],
      dataset: { template: ctx.template.id },
      style: {
        width: `${base.width}px`,
        height: `${base.height}px`,
        '--accent': style.accent,
        '--text': style.text,
        color: style.text,
        textTransform: style.uppercase ? 'uppercase' : 'none',
        ...fontStyle(style.bodyFont),
      },
    },
    ...children,
  );
}

/** Background: user photo (if any) or a procedural preset. */
export function backgroundLayer(ctx) {
  const { style, url } = ctx;
  const bg = style.background;
  const photo = bg.assetId ? url(bg.assetId) : null;
  const layer = h('div', { class: 'df-layer df-bg', style: { background: backgroundCss(bg.preset, style.accent, bg.solid) } });
  if (photo) {
    const scale = (bg.scale ?? 100) / 100;
    layer.append(
      h('img', {
        class: 'df-bg-photo',
        src: photo,
        alt: '',
        decoding: 'sync',
        style: {
          objectPosition: `${bg.x ?? 50}% ${bg.y ?? 50}%`,
          transform: `scale(${scale})`,
          transformOrigin: `${bg.x ?? 50}% ${bg.y ?? 50}%`,
          filter: [
            bg.blur ? `blur(${bg.blur}px)` : '',
            bg.grayscale ? `grayscale(${bg.grayscale}%)` : '',
            bg.brightness !== undefined && bg.brightness !== 100 ? `brightness(${bg.brightness}%)` : '',
          ]
            .filter(Boolean)
            .join(' ') || 'none',
        },
      }),
    );
  }
  return layer;
}

export function overlayLayer(ctx) {
  const o = ctx.style.overlay;
  if (!o?.enabled || !o.opacity) return null;
  return h('div', { class: 'df-layer', style: { background: o.color, opacity: String(o.opacity / 100) } });
}

export function gradientLayer(ctx) {
  const g = ctx.style.gradient;
  if (!g?.enabled || !g.opacity) return null;
  const dir = { 0: 'to top', 180: 'to bottom', 90: 'to right', 270: 'to left' }[g.angle] ?? 'to top';
  const size = g.size ?? 60;
  return h('div', {
    class: 'df-layer',
    style: { background: `linear-gradient(${dir}, ${hexA(g.color, g.opacity / 100)} 0%, ${hexA(g.color, (g.opacity / 100) * 0.55)} ${size * 0.45}%, ${hexA(g.color, 0)} ${size}%)` },
  });
}

/**
 * Player / character cut-out. `anchor` sets the default placement box:
 *  - right:  right half, bottom-aligned (MATCH, MATCHDAY)
 *  - center: centred, bottom-aligned (WIN / LOSE)
 */
export function playerLayer(ctx, { anchor = 'right', height = 1000, behind = false } = {}) {
  const p = ctx.style.player;
  if (!p?.enabled || !p.assetId) return null;
  const src = ctx.url(p.assetId);
  if (!src) return null;
  const scale = (p.scale ?? 100) / 100;
  const h0 = height * scale;
  const xPct = p.x ?? 50;
  const left = anchor === 'right' ? 540 + (xPct - 50) * 10.8 : (xPct - 50) * 10.8;
  const width = anchor === 'right' ? 540 : 1080;
  return h(
    'div',
    {
      class: ['df-layer df-player', behind && 'df-player--behind'],
      style: { left: `${left}px`, width: `${width}px`, top: 'auto', bottom: `${-(p.y ?? 0) * 10.8}px`, height: `${h0}px` },
    },
    h('img', {
      src,
      alt: '',
      decoding: 'sync',
      style: {
        transform: p.flip ? 'scaleX(-1)' : 'none',
        filter: p.shadow ? 'drop-shadow(0 24px 48px rgba(0,0,0,0.55))' : 'none',
      },
    }),
  );
}

/** Neutral team mark: initials in a shield — used when a team has no logo. */
export function logoPlaceholder(name = '', size = 200, color = 'currentColor') {
  const initials =
    String(name)
      .replace(/^(team|the)\s+/i, '')
      .split(/[\s\-_.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  return h(
    'div',
    { class: 'df-logo-ph', style: { width: `${size}px`, height: `${size}px`, color } },
    s(
      'svg',
      { viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true' },
      s('path', { d: 'M50 4 L90 18 V50 C90 72 73 88 50 96 C27 88 10 72 10 50 V18 Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, opacity: 0.9 }),
      s('path', { d: 'M50 12 L82 23 V50 C82 67 69 80 50 87 C31 80 18 67 18 50 V23 Z', fill: 'currentColor', opacity: 0.08 }),
    ),
    h('span', { class: 'df-logo-ph-text', style: { fontSize: `${size * (initials.length > 1 ? 0.3 : 0.38)}px` } }, initials),
  );
}

/** Team logo (snapshot asset version) or placeholder. */
export function teamLogo(ctx, team, size = 200, { className } = {}) {
  const src = team?.logoAssetId ? ctx.url(team.logoAssetId) : null;
  if (src) {
    return h(
      'div',
      { class: ['df-logo', className], style: { width: `${size}px`, height: `${size}px` } },
      h('img', { src, alt: team?.name ?? '', decoding: 'sync' }),
    );
  }
  const ph = logoPlaceholder(team?.name, size);
  if (className) ph.classList.add(className);
  return ph;
}

/**
 * Text node with automatic fitting. The renderer shrinks `font-size` (down to `min`)
 * until the content fits the box; anything still overflowing becomes a visible warning.
 *  - mode 'x': single line inside `width`
 *  - mode 'box': wraps inside width × height (use `lines` to cap)
 */
export function fitText(text, { size, min = Math.round(size * 0.45), width, height, mode = 'x', role = 'body', ctx, className, weight, slant, align, lineHeight, label, letterSpacing, tag = 'div' } = {}) {
  const fontConf = role === 'head' ? ctx.style.font : ctx.style.bodyFont;
  const st = {
    ...fontStyle(fontConf, { weight, slant }),
    fontSize: `${size}px`,
    width: width ? `${width}px` : undefined,
    maxWidth: width ? `${width}px` : undefined,
    height: mode === 'box' && height ? `${height}px` : undefined,
    whiteSpace: mode === 'x' ? 'nowrap' : 'normal',
    textAlign: align,
    lineHeight: lineHeight ?? (mode === 'box' ? '0.95' : '1'),
    letterSpacing,
  };
  const skew = syntheticSkew(fontConf, slant);
  const inner = h('span', { class: 'df-fit-inner', style: skew ? { display: 'inline-block', transform: `skewX(${skew}deg)`, transformOrigin: 'bottom left' } : undefined }, text ?? '');
  return h(tag, { class: ['df-fit', className], dataset: { fit: mode, fitMin: String(min), fitLabel: label ?? String(text ?? '').slice(0, 40) }, style: st }, inner);
}

/** Plain styled text (no fitting). */
export function text(value, { size, role = 'body', ctx, weight, slant, className, style: extra } = {}) {
  const fontConf = role === 'head' ? ctx.style.font : ctx.style.bodyFont;
  return h('div', { class: className, style: { ...fontStyle(fontConf, { weight, slant }), fontSize: `${size}px`, lineHeight: '1', ...extra } }, value ?? '');
}

export function socialsBlock(ctx, { size = 28, align = 'right', className } = {}) {
  const { style } = ctx;
  if (!style.show.socials) return null;
  const lines = [style.socials.line1, style.socials.line2].filter((l) => l && l.trim());
  if (!lines.length) return null;
  return h(
    'div',
    { class: ['df-socials', className], style: { textAlign: align, alignItems: align === 'right' ? 'flex-end' : 'flex-start', textTransform: 'lowercase' } },
    lines.map((l) => fitText(l, { ctx, size, width: 420, min: 16, align, label: 'Соцсети' })),
  );
}

export function handleBlock(ctx, { size = 24, align = 'right', className } = {}) {
  const { style } = ctx;
  if (!style.show.handle || !style.socials.handle?.trim()) return null;
  return fitText(style.socials.handle, { ctx, size, width: 420, min: 14, align, className, label: 'Подпись автора' });
}

/* ----------- Data formatting shared by match templates ----------- */

export const formatLong = (format) => (FORMATS[format]?.long ?? format ?? '').toUpperCase();

export function dateLine(ctx, d = ctx.data) {
  const { style } = ctx;
  const parts = [];
  if (style.show.date && d.startDate) parts.push(formatPosterDate(d.startDate, style.dateStyle));
  if (style.show.time && d.startTime) parts.push(d.startTime + (style.show.timezone && d.timezone ? ` ${tzShort(d.timezone)}` : ''));
  return parts.join(' · ');
}

export function tournamentLine(ctx, d = ctx.data) {
  const { style } = ctx;
  return [style.show.tournament ? d.tournament : '', style.show.stage ? d.stage : ''].filter(Boolean).join(' · ');
}

/** Teams from the "our team" perspective (WIN/LOSE). */
export function perspectiveTeams(d) {
  const ours = d.perspective === 'B' ? 'B' : 'A';
  return ours === 'A'
    ? { us: d.teamA, them: d.teamB, usScore: d.scoreA, themScore: d.scoreB, ours }
    : { us: d.teamB, them: d.teamA, usScore: d.scoreB, themScore: d.scoreA, ours };
}

export function displayName(team, useShort = false) {
  if (!team) return '';
  return (useShort && team.shortName) || team.name || '';
}

/** "#rrggbb" + alpha → rgba(). */
export function hexA(hex, alpha = 1) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

/** Standard stack: background → overlay → gradient. */
export const baseLayers = (ctx) => [backgroundLayer(ctx), overlayLayer(ctx), gradientLayer(ctx)];
