<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type Setup = (ctx: { el: HTMLElement; props: any; emit: (name: string, detail: any) => void; signal: AbortSignal }) =>
  | { update?(props: any): void; destroy?(): void }
  | undefined

const props = defineProps<{ setup: () => Promise<{ default: Setup }>; props: any; tag?: string; load?: 'eager' | 'visible' }>()
const emit = defineEmits<{ (e: 'event', name: string, detail: any): void }>()
const host = ref<HTMLElement>()
const controller = new AbortController()
let instance: ReturnType<Setup>

onMounted(() => {
  const start = async () => {
    const setup = (await props.setup()).default
    instance = setup({ el: host.value!, props: props.props, emit: (n, d) => emit('event', n, d), signal: controller.signal })
  }
  if (props.load !== 'visible') return void start()
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    void start()
  })
  io.observe(host.value!)
})
watch(
  () => JSON.stringify(props.props),
  () => instance?.update?.(props.props),
)
onBeforeUnmount(() => {
  controller.abort()
  instance?.destroy?.()
})
</script>

<template>
  <component :is="tag ?? 'div'" ref="host"><slot /></component>
</template>
