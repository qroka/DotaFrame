import type { PosterData, PosterSource } from '../types'

export interface Size { width: number, height: number }
export interface ExportSize extends Size { id: string, label: string }

export interface FontSetting { family: string, weight: number, slant: number, width: number }

/** Appearance shared by every template; templates add their own keys through `defaults`. */
export interface BaseStyle {
  theme: string
  accent: string
  text: string
  font: FontSetting
  bodyFont: FontSetting
  uppercase: boolean
  background: { preset: string, solid: string, assetId: string | null, scale: number, x: number, y: number, blur: number, grayscale: number, brightness: number }
  overlay: { enabled: boolean, color: string, opacity: number }
  gradient: { enabled: boolean, color: string, opacity: number, angle: number, size: number }
  player: { enabled: boolean, assetId: string | null, scale: number, x: number, y: number, flip: boolean, shadow: boolean }
  dateStyle: string
  show: Record<string, boolean>
  socials: { line1: string, line2: string, handle: string }
}

/** Template-specific keys (e.g. `logoLayout`, `rowOpacity`) are open-ended, hence the index signature. */
export type PosterStyle = BaseStyle & { [key: string]: any }

export interface PosterIssue { level: 'error' | 'warning', message: string }

export interface RenderContext<D = any> {
  template: PosterTemplate<D>
  data: D
  style: PosterStyle
  base: Size
  mode: 'preview' | 'export'
  /** URL of a stored image, or null when the id is empty/unknown. */
  url: (id: string | null | undefined) => string | null
}

/** One editable control in the style panel; the editor renders controls generically from these. */
export interface SettingDescriptor {
  key: string
  type: 'theme' | 'color' | 'range' | 'select' | 'segmented' | 'toggle' | 'text' | 'image' | 'font' | 'background'
  label: string
  group: string
  options?: Array<{ value: string | number, label: string, swatch?: string }>
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  kind?: string
  maxLength?: number
  when?: (style: PosterStyle) => boolean | undefined
}

export interface TextField { key: string, label: string, default?: string, maxLength?: number }

/** What a template module passes to `defineTemplate()`. */
export interface TemplateDefinition<D = any> {
  id: string
  type: string
  version: number
  name: string
  description?: string
  source: PosterSource
  base: Size
  exportSizes?: Array<Size & Partial<Pick<ExportSize, 'id' | 'label'>>>
  texts?: TextField[]
  settings?: SettingDescriptor[]
  defaults?: Record<string, any>
  order?: number
  capacity?: { min: number, max: number }
  validate?: (data: D, style: PosterStyle) => PosterIssue[]
  render: (ctx: RenderContext<D>) => HTMLElement
}

/** A registered template: optional parts of the definition are filled in. */
export type PosterTemplate<D = any> = Omit<TemplateDefinition<D>, 'description' | 'texts' | 'settings' | 'defaults' | 'validate' | 'exportSizes'> & {
  description: string
  texts: TextField[]
  settings: SettingDescriptor[]
  defaults: Record<string, any>
  validate: (data: D, style: PosterStyle) => PosterIssue[]
  /** Never empty: defineTemplate falls back to the base size. */
  exportSizes: [ExportSize, ...ExportSize[]]
}

export type { PosterData }
