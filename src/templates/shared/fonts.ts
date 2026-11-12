/**
 * Poster font registry. All fonts are bundled locally (@fontsource-variable, OFL)
 * so saved posters never depend on a CDN. The same files are embedded into PNG export
 * (see src/export/fontEmbed.js).
 */
import '@fontsource-variable/roboto-flex/full.css';
import '@fontsource-variable/oswald/index.css';
import '@fontsource-variable/unbounded/index.css';
import '@fontsource-variable/inter/index.css';

export interface PosterFont {
  id: string;
  label: string;
  family: string;
  cssFamily: string;
  weight: [number, number];
  width: [number, number] | null;
  nativeSlant: boolean;
}

type FontSettings = Partial<{ family: string; weight: number; slant: number; width: number }>;

export const POSTER_FONTS: Record<string, PosterFont> = {
  'roboto-flex': {
    id: 'roboto-flex',
    label: 'Roboto Flex',
    family: '"Roboto Flex Variable", "Roboto Flex", sans-serif',
    cssFamily: 'Roboto Flex Variable',
    weight: [100, 1000],
    width: [25, 151],
    nativeSlant: true, // has a real slnt axis (-10…0)
  },
  oswald: {
    id: 'oswald',
    label: 'Oswald',
    family: '"Oswald Variable", "Oswald", sans-serif',
    cssFamily: 'Oswald Variable',
    weight: [200, 700],
    width: null,
    nativeSlant: false,
  },
  unbounded: {
    id: 'unbounded',
    label: 'Unbounded',
    family: '"Unbounded Variable", "Unbounded", sans-serif',
    cssFamily: 'Unbounded Variable',
    weight: [200, 900],
    width: null,
    nativeSlant: false,
  },
  inter: {
    id: 'inter',
    label: 'Inter',
    family: '"Inter Variable", "Inter", sans-serif',
    cssFamily: 'Inter Variable',
    weight: [100, 900],
    width: null,
    nativeSlant: false,
  },
};

export const FONT_OPTIONS = Object.values(POSTER_FONTS).map((f) => ({ value: f.id, label: f.label }));

export const getFont = (id: string | null | undefined): PosterFont => POSTER_FONTS[id ?? ''] ?? POSTER_FONTS['roboto-flex']!;

/**
 * CSS declarations for a typographic setting.
 * `font.slant`: 0…-15 (degrees, negative = forward).
 */
export function fontStyle(font: FontSettings = {}, { weight, slant, width }: { weight?: number; slant?: number; width?: number } = {}): Record<string, string> {
  const f = getFont(font.family);
  const w = clampTo(weight ?? font.weight ?? 700, f.weight);
  const sl = Math.max(-15, Math.min(0, slant ?? font.slant ?? 0));
  const wd = f.width ? clampTo(width ?? font.width ?? 100, f.width) : 100;
  const style: Record<string, string> = {
    fontFamily: f.family,
    fontWeight: String(w),
  };
  if (f.nativeSlant) {
    // Roboto Flex: real slant axis up to -10°, the rest is synthesized by the skew below.
    const native = Math.max(-10, sl);
    style.fontVariationSettings = `"wdth" ${wd}, "slnt" ${native}, "opsz" 144`;
    style.fontStretch = `${wd}%`;
    style.fontStyle = native < 0 ? `oblique ${-native}deg` : 'normal';
  } else {
    style.fontStyle = 'normal';
  }
  return style;
}

/** Extra skew needed beyond the font's native slant (applied to headline wrappers). */
export function syntheticSkew(font: FontSettings = {}, slant?: number): number {
  const f = getFont(font.family);
  const sl = Math.max(-15, Math.min(0, slant ?? font.slant ?? 0));
  const remaining = f.nativeSlant ? Math.min(0, sl + 10) : sl;
  return remaining; // degrees, ≤ 0
}

function clampTo(v: unknown, [min, max]: [number, number]): number {
  return Math.max(min, Math.min(max, Number(v) || min));
}

/** Families + weights used by a style, for `document.fonts.load` before measuring/exporting. */
export function fontLoadDescriptors(style: { font?: { family?: string }; bodyFont?: { family?: string } } | null | undefined): string[] {
  const fams = new Set<string>(['roboto-flex']);
  if (style?.font?.family) fams.add(style.font.family);
  if (style?.bodyFont?.family) fams.add(style.bodyFont.family);
  return [...fams].map((id) => getFont(id).cssFamily);
}
