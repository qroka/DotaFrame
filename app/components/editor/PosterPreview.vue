<!-- @level L2-Controller -->
<script setup lang="ts">
import type { PosterTemplate } from '~/types/dotaframe'

const props = defineProps<{ template: PosterTemplate, data: Record<string, any>, style: Record<string, any> }>()
const emit = defineEmits<{ issues: [items: Array<{ level: 'error' | 'warning', message: string }>] }>()
const stage = useTemplateRef<HTMLElement>('stage')
const host = useTemplateRef<HTMLElement>('host')
const scale = shallowRef(0.5)
const rendering = shallowRef(false)
let resizeObserver: ResizeObserver | null = null
let sequence = 0

function layout() {
  if (!stage.value) return
  const width = Math.max(280, stage.value.clientWidth - 64)
  const height = Math.max(280, stage.value.clientHeight - 64)
  scale.value = Math.min(width / props.template.base.width, height / props.template.base.height, 1)
}

async function render() {
  if (!host.value) return
  const run = ++sequence
  rendering.value = true
  const target = document.createElement('div')
  try {
    const { renderPoster } = await import('~~/src/render/renderPoster.js')
    const result = await renderPoster(target, { template: props.template, data: props.data, style: props.style, mode: 'preview' })
    if (run !== sequence || !host.value) return
    host.value.replaceChildren(...target.childNodes)
    emit('issues', result.issues)
  } catch (cause) {
    emit('issues', [{ level: 'error', message: cause instanceof Error ? cause.message : String(cause) }])
  } finally { if (run === sequence) rendering.value = false }
}

watch(() => [props.template, props.data, props.style], render, { deep: false })
onMounted(() => {
  layout()
  resizeObserver = new ResizeObserver(layout)
  if (stage.value) resizeObserver.observe(stage.value)
  render()
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section ref="stage" class="df-grid relative grid min-h-0 flex-1 place-items-center overflow-auto bg-muted p-8" aria-label="Предпросмотр публикации">
    <div class="relative shrink-0 shadow-2xl shadow-black/50 ring-1 ring-white/10" :style="{ width: `${template.base.width * scale}px`, height: `${template.base.height * scale}px` }">
      <div ref="host" class="absolute left-0 top-0 origin-top-left" :style="{ width: `${template.base.width}px`, height: `${template.base.height}px`, transform: `scale(${scale})` }" />
      <UBadge v-if="rendering" class="absolute right-3 top-3 z-10" color="neutral" variant="solid" label="Обновление" icon="i-lucide-loader-circle" />
    </div>
  </section>
</template>
