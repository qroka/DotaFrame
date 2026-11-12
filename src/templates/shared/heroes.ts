/**
 * Hero tiles for the draft poster: portrait (snapshot asset version) or a neutral
 * placeholder with initials tinted by primary attribute; empty slot for null.
 */
import { h, s } from '../../core/dom';
import { heroPortraitUrl } from '../../data/heroes';
import type { HeroSnapshot } from '../../types';
import type { RenderContext } from '../types';
import { fitText } from './primitives';

export const ATTR_COLORS: Record<string, string> = {
  str: '#e0563f',
  agi: '#3fbf6a',
  int: '#3d8bfd',
  all: '#b58cff',
};

export const attrColor = (attr: string): string => ATTR_COLORS[attr] ?? '#8a8f99';

function initials(name = ''): string {
  const words = String(name).replace(/[^\p{L}\p{N}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return ((words[0]![0] ?? '') + (words[1]![0] ?? '')).toUpperCase();
}

/**
 * `hero` is a snapshot hero or null (empty slot).
 */
export function heroTile(ctx: RenderContext, hero: HeroSnapshot | null, { width, height, banned = false, showName = true, nameSize = 18, radius = 6 }: { width: number; height: number; banned?: boolean; showName?: boolean; nameSize?: number; radius?: number }): HTMLElement {
  const box = h('div', {
    class: ['df-hero', banned && 'df-hero--ban', !hero && 'df-hero--empty'],
    style: { width: `${width}px`, height: `${height}px`, borderRadius: `${radius}px` },
  });
  if (!hero) {
    box.append(h('span', { class: 'df-hero-empty', style: { fontSize: `${Math.round(height * 0.32)}px` } }, '?'));
    return box;
  }
  const src = (hero.portraitAssetId ? ctx.url(hero.portraitAssetId) : null) || heroPortraitUrl(hero);
  const color = attrColor(hero.attr);
  if (src) {
    box.append(h('img', { src, alt: hero.name ?? '', decoding: 'sync', class: 'df-hero-img' }));
  } else {
    box.style.background = `linear-gradient(160deg, ${color}55 0%, ${color}18 55%, rgba(0,0,0,0.35) 100%)`;
    box.append(
      h(
        'span',
        { class: 'df-hero-initials', style: { fontSize: `${Math.round(Math.min(width, height) * (banned ? 0.36 : 0.34))}px`, color } },
        initials(hero.name),
      ),
    );
  }
  if (banned) {
    box.append(
      h('div', { class: 'df-hero-ban-shade' }),
      s('svg', { class: 'df-hero-strike', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, s('line', { x1: 6, y1: 94, x2: 94, y2: 6, stroke: '#ff4b3e', 'stroke-width': 5, 'vector-effect': 'non-scaling-stroke' })),
    );
  } else if (showName) {
    box.append(
      h(
        'div',
        { class: 'df-hero-name' },
        fitText(hero.name, { ctx, size: nameSize, min: 10, width: width - 16, weight: 700, label: `Герой ${hero.name}`, align: 'left' }),
      ),
    );
  }
  return box;
}
