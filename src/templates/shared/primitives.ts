/**
 * Poster building blocks shared by all templates: root, background/overlay/gradient/player
 * layers, logos with placeholders, fitted text, socials. Templates compose these so the
 * business rules (what to show, fallbacks) live in one place.
 *
 * All sizes are in poster pixels of the base frame (1080 × 1080). Export scales the whole
 * frame with pixelRatio, so layout is identical for every export size.
 */
import { h, s, type Child } from '../../core/dom';
import { backgroundCss } from './backgrounds';
import { fontStyle, syntheticSkew } from './fonts';
import { FORMATS } from '../../domain/series';
import { formatPosterDate, tzShort } from '../../domain/time';
import type { MatchPosterData, MatchSnapshot, Side, TeamSnapshot } from '../../types';
import type { RenderContext } from '../types';

type NamedTeam = Pick<TeamSnapshot, 'name'> & Partial<Pick<TeamSnapshot, 'shortName' | 'logoAssetId'>>;

/** Poster root. Sets CSS variables used by poster.css. */
export function posterRoot(ctx: RenderContext, className: string, ...children: Child[]): HTMLElement {
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
export function backgroundLayer(ctx: RenderContext): HTMLElement {
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

export function overlayLayer(ctx: RenderContext): HTMLElement | null {
  const o = ctx.style.overlay;
  if (!o?.enabled || !o.opacity) return null;
  return h('div', { class: 'df-layer', style: { background: o.color, opacity: String(o.opacity / 100) } });
}

export function gradientLayer(ctx: RenderContext): HTMLElement | null {
  const g = ctx.style.gradient;
  if (!g?.enabled || !g.opacity) return null;
  const dir = ({ 0: 'to top', 180: 'to bottom', 90: 'to right', 270: 'to left' } as Record<number, string>)[g.angle] ?? 'to top';
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
export function playerLayer(ctx: RenderContext, { anchor = 'right', height = 1000, behind = false }: { anchor?: 'right' | 'center'; height?: number; behind?: boolean } = {}): HTMLElement | null {
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

/** "No logo" mark (512 × 512). Keep in sync with app/assets/icons/no-logo.svg used in the UI. */
const NO_LOGO_PATH = 'M461.999 89.2382V69.6191C461.999 64.2043 457.615 59.8096 452.19 59.8096L412.952 59.8096C409.067 59.8096 405.948 60.0647 403.142 60.7906V59.8096C403.142 54.3948 398.757 50.0001 393.333 50.0001L334.476 50.0001C317.466 50.0001 311.316 59.6527 307.706 69.6191L299.74 69.6191C297.455 66.5684 295.238 62.6152 295.238 59.8096C295.238 54.3948 290.853 50.0001 285.428 50.0001L216.762 50.0001C211.749 50.0001 207.541 53.8553 207.001 58.8287C206.776 60.8887 202.607 69.6191 196.122 69.6191L169.244 69.6191C168.607 68.8638 167.685 67.461 166.89 65.6659C165.321 62.1051 161.789 59.8096 157.905 59.8096L59.8095 59.8096C54.3849 59.8096 50 64.2043 50 69.6191L50 148.095C50 175.787 58.0928 210.847 59.7997 217.919L59.7212 232.781L53.0704 239.069C51.1085 240.913 50 243.493 50 246.19L50 285.428C50 288.038 51.03 290.529 52.8742 292.364L59.8095 299.299L59.8095 342.696L50.5101 370.614C49.9117 372.39 49.843 374.283 50.3041 376.098L59.4171 412.569L50.5199 439.29C49.5095 442.282 50.0196 445.578 51.8638 448.129C53.6982 450.679 56.6607 452.19 59.8095 452.19L197.143 452.19C199.752 452.19 202.244 451.16 204.078 449.316L204.961 448.433C210.17 455.555 217.419 461.999 226.571 461.999L256 461.999C263.219 461.999 269.537 458.851 275.099 456.065C278.905 454.152 282.839 452.19 285.428 452.19L334.476 452.19C337.085 452.19 339.577 451.16 341.411 449.316L343.795 446.932C344.413 447.717 345.001 448.492 345.58 449.237C350.397 455.515 355.37 461.999 363.904 461.999L412.952 461.999C418.376 461.999 422.761 457.615 422.761 452.19V445.137L449.816 451.886C452.749 452.641 455.859 451.955 458.252 450.081C460.636 448.217 462.019 445.343 461.999 442.302C461.99 441.341 461.381 345.09 461.999 295.356C462.029 292.707 460.989 290.166 459.125 288.293L452.19 281.367L452.19 236.381C452.19 233.781 451.16 231.28 449.316 229.445L444.509 224.639L450.444 212.769L459.125 204.088C460.969 202.244 461.999 199.742 461.999 197.143L461.852 147.997C461.852 147.203 461.754 146.418 461.568 145.643L452.778 110.015L460.969 93.6328C461.646 92.2693 461.999 90.7586 461.999 89.2382ZM345.158 128.476L375.018 148.095L365.062 206.952L285.428 148.095L345.158 128.476ZM157.905 383.523L118.667 354.095L138.286 285.428L216.762 363.904L157.905 383.523ZM365.866 373.714L320.085 373.714L118.667 137.56L155.285 128.476L393.333 310.129L365.866 373.714Z';

/** Neutral "no logo" mark used when a team has no logo; drawn in the poster text colour. */
export function logoPlaceholder(name = '', size = 200, color = 'currentColor'): HTMLElement {
  return h(
    'div',
    {
      class: 'df-logo-ph df-logo-ph--mark',
      role: 'img',
      'aria-label': name ? `${name}: нет логотипа` : 'Нет логотипа',
      style: { width: `${size}px`, height: `${size}px`, color },
    },
    s(
      'svg',
      { viewBox: '0 0 512 512', width: size, height: size, 'aria-hidden': 'true' },
      s('path', { d: NO_LOGO_PATH, fill: 'currentColor' }),
    ),
  );
}

/** Team logo (snapshot asset version) or placeholder. */
export function teamLogo(ctx: RenderContext, team: NamedTeam | null | undefined, size = 200, { className }: { className?: string } = {}): HTMLElement {
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
export interface FitTextOptions {
  ctx: RenderContext;
  size: number;
  min?: number;
  width?: number;
  height?: number;
  mode?: 'x' | 'box';
  role?: 'head' | 'body';
  className?: string;
  weight?: number;
  slant?: number;
  align?: 'left' | 'right' | 'center';
  lineHeight?: string;
  label?: string;
  letterSpacing?: string;
  tag?: string;
}

export function fitText(text: unknown, { size, min = Math.round(size * 0.45), width, height, mode = 'x', role = 'body', ctx, className, weight, slant, align, lineHeight, label, letterSpacing, tag = 'div' }: FitTextOptions): HTMLElement {
  const fontConf = role === 'head' ? ctx.style.font : ctx.style.bodyFont;
  const st: Record<string, string | undefined> = {
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
  const inner = h('span', { class: 'df-fit-inner', style: skew ? { display: 'inline-block', transform: `skewX(${skew}deg)`, transformOrigin: 'bottom left' } : undefined }, (text ?? '') as Child);
  return h(tag, { class: ['df-fit', className], dataset: { fit: mode, fitMin: String(min), fitLabel: label ?? String(text ?? '').slice(0, 40) }, style: st }, inner);
}

/** Plain styled text (no fitting). */
export function text(value: unknown, { size, role = 'body', ctx, weight, slant, className, style: extra }: { size: number; role?: 'head' | 'body'; ctx: RenderContext; weight?: number; slant?: number; className?: string; style?: Record<string, unknown> }): HTMLElement {
  const fontConf = role === 'head' ? ctx.style.font : ctx.style.bodyFont;
  return h('div', { class: className, style: { ...fontStyle(fontConf, { weight, slant }), fontSize: `${size}px`, lineHeight: '1', ...extra } }, (value ?? '') as Child);
}

export function socialsBlock(ctx: RenderContext, { size = 28, align = 'right', className }: { size?: number; align?: 'left' | 'right'; className?: string } = {}): HTMLElement | null {
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

export function handleBlock(ctx: RenderContext, { size = 24, align = 'right', className }: { size?: number; align?: 'left' | 'right'; className?: string } = {}): HTMLElement | null {
  const { style } = ctx;
  if (!style.show.handle || !style.socials.handle?.trim()) return null;
  return fitText(style.socials.handle, { ctx, size, width: 420, min: 14, align, className, label: 'Подпись автора' });
}

/* ----------- Data formatting shared by match templates ----------- */

export const formatLong = (format: string | null | undefined): string => (FORMATS[format ?? '']?.long ?? format ?? '').toUpperCase();

export function dateLine(ctx: RenderContext, d: Pick<MatchSnapshot, 'startDate' | 'startTime' | 'timezone'> = ctx.data): string {
  const { style } = ctx;
  const parts: string[] = [];
  if (style.show.date && d.startDate) parts.push(formatPosterDate(d.startDate, style.dateStyle));
  if (style.show.time && d.startTime) parts.push(d.startTime + (style.show.timezone && d.timezone ? ` ${tzShort(d.timezone)}` : ''));
  return parts.join(' · ');
}

export function tournamentLine(ctx: RenderContext, d: Pick<MatchSnapshot, 'tournament' | 'stage'> = ctx.data): string {
  const { style } = ctx;
  return [style.show.tournament ? d.tournament : '', style.show.stage ? d.stage : ''].filter(Boolean).join(' · ');
}

/** Teams from the "our team" perspective (WIN/LOSE). */
export function perspectiveTeams(d: Pick<MatchPosterData, 'perspective' | 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>) {
  const ours: Side = d.perspective === 'B' ? 'B' : 'A';
  return ours === 'A'
    ? { us: d.teamA, them: d.teamB, usScore: d.scoreA, themScore: d.scoreB, ours }
    : { us: d.teamB, them: d.teamA, usScore: d.scoreB, themScore: d.scoreA, ours };
}

export function displayName(team: NamedTeam | null | undefined, useShort = false): string {
  if (!team) return '';
  return (useShort && team.shortName) || team.name || '';
}

/** "#rrggbb" + alpha → rgba(). */
export function hexA(hex: string | null | undefined, alpha = 1): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha))})`;
}

/** Standard stack: background → overlay → gradient. */
export const baseLayers = (ctx: RenderContext): Array<HTMLElement | null> => [backgroundLayer(ctx), overlayLayer(ctx), gradientLayer(ctx)];
