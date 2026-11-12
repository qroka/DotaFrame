import { createStore } from '~~/src/editor/store'
import { api } from '~/services/api'
import type { Match, PosterProject, PosterTemplate, Team } from '~/types/dotaframe'

export interface EditorProjectOptions { projectId?: string, templateId?: string, matchId?: string, matchIds?: string[], mapNumber?: number }
type Store = ReturnType<typeof createStore>
type Lookups = { teams: Team[], matches: Match[], teamsById: Record<string, Team> }

const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

/**
 * State of one open publication: loading, undoable edits, dirty tracking and saving.
 * The project is an immutable value; every edit replaces it, so "has unsaved changes" is a reference check.
 */
export function useEditorProject(options: EditorProjectOptions) {
  const toast = useToast()
  const loading = shallowRef(true)
  const saving = shallowRef(false)
  const project = shallowRef<PosterProject | null>(null)
  const templates = shallowRef<PosterTemplate[]>([])
  const template = shallowRef<PosterTemplate | null>(null)
  const teams = shallowRef<Team[]>([])
  const matches = shallowRef<Match[]>([])
  const canUndo = shallowRef(false)
  const canRedo = shallowRef(false)
  const dirty = shallowRef(false)
  const selectedMatchIds = computed<string[]>(() => (project.value?.data.items as Array<{ matchId?: string }> | undefined)?.map(item => item.matchId).filter((id): id is string => !!id) ?? options.matchIds ?? [])

  let store: Store | null = null
  let registry: typeof import('~~/src/templates/index') | null = null
  let factory: typeof import('~/services/projectFactory') | null = null

  const lookups = (): Lookups => ({ teams: teams.value, matches: matches.value, teamsById: Object.fromEntries(teams.value.map(team => [team.id, team])) })
  const templateFor = (value: PosterProject) => (registry?.getTemplate(value.templateId, value.templateVersion) ?? registry?.getTemplate(value.templateId) ?? null) as PosterTemplate | null

  /** Mirror the store into reactive state after every change (edit, undo, redo, save). */
  function sync() {
    if (!store) return
    project.value = store.get() as PosterProject
    template.value = templateFor(project.value)
    canUndo.value = store.canUndo()
    canRedo.value = store.canRedo()
    dirty.value = store.hasUnsaved()
  }

  function edit(next: PosterProject, label: string, coalesce: string | null = null) {
    store?.commit(next, { label, coalesce })
    sync()
  }

  async function load() {
    try {
      const [registryModule, factoryModule] = await Promise.all([import('~~/src/templates/index'), import('~/services/projectFactory')])
      registry = registryModule
      factory = factoryModule
      templates.value = registryModule.listTemplates() as PosterTemplate[]
      const loaded = await factoryModule.loadLookups()
      teams.value = loaded.teams
      matches.value = loaded.matches
      const opened = options.projectId
        ? await api.projects.get(options.projectId)
        : await factoryModule.newProjectState({ templateId: options.templateId, matchId: options.matchId ?? null, matchIds: options.matchIds ?? [], mapNumber: options.mapNumber ?? 1, lookups: lookups() })
      if (!opened) throw new Error('Публикация не найдена')
      store = createStore(opened)
      if (options.projectId) store.markSaved()
      sync()
    } catch (cause) {
      toast.add({ title: 'Не удалось открыть редактор', description: message(cause), color: 'error' })
    } finally { loading.value = false }
  }

  function setTitle(title: string) { if (project.value) edit({ ...project.value, title }, 'Название', 'title') }
  function setSize(size: string) { if (project.value) edit({ ...project.value, size }, 'Размер экспорта') }
  function setStyle(style: Record<string, any>) { if (project.value) edit({ ...project.value, style }, 'Оформление', 'style') }
  function setText(key: string, value: string) {
    if (!project.value) return
    edit({ ...project.value, data: { ...project.value.data, texts: { ...project.value.data.texts, [key]: value } } }, 'Текст', `text:${key}`)
  }

  /** Rebuild the poster data from a match (or several) while keeping the edited texts. */
  async function rebuildData(matchId: string | null, matchIds: string[]) {
    const current = project.value
    const tpl = template.value
    if (!current || !tpl || !factory) return
    const data = await factory.buildData(tpl, { matchId, matchIds, mapNumber: current.data.mapNumber ?? options.mapNumber ?? 1, texts: current.data.texts, lookups: lookups() })
    edit({ ...current, matchId, data }, 'Матч')
  }
  const selectMatch = (matchId: string) => rebuildData(matchId, selectedMatchIds.value)
  const selectMatches = (ids: string[]) => rebuildData(null, ids.slice(0, 6))

  async function switchTemplate(id: string) {
    const current = project.value
    if (!current || !factory || id === current.templateId) return
    edit(await factory.switchTemplateState(current, id, lookups()), 'Шаблон')
  }

  function undo() { if (store?.undo()) sync() }
  function redo() { if (store?.redo()) sync() }

  /** Saves the current state. Returns false when nothing was saved. */
  async function save(): Promise<boolean> {
    const current = store?.get() as PosterProject | undefined
    if (!store || !current) return false
    saving.value = true
    try {
      const saved = await api.projects.save(structuredClone(current), current.id ? 'Изменения в редакторе' : 'Первая версия')
      if (current.id) store.markSaved(current)
      else store.reset(saved, { saved: true }) // a new project gets its id from the server; history starts over
      sync()
      toast.add({ title: 'Публикация сохранена', color: 'success', icon: 'i-lucide-check' })
      if (!options.projectId) await navigateTo(`/editor/${saved.id}`, { replace: true })
      return true
    } catch (cause) {
      toast.add({ title: 'Не удалось сохранить', description: message(cause), color: 'error' })
      return false
    } finally { saving.value = false }
  }

  onMounted(load)

  return {
    loading, saving, project, template, templates, teams, matches, selectedMatchIds, dirty, canUndo, canRedo,
    setTitle, setSize, setStyle, setText, selectMatch, selectMatches, switchTemplate, undo, redo, save
  }
}
