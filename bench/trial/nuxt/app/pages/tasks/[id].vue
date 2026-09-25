<script setup lang="ts">
import type { Task } from '#shared/types/task'

const route = useRoute()
const id = String(route.params.id)
const { data: task } = await useFetch<Task>(`/api/tasks/${encodeURIComponent(id)}`)
if (!task.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404, 'Task not found')
}
useHead({ title: () => task.value?.title ?? 'Task not found' })
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <NuxtLink to="/" class="text-sm text-indigo-600 hover:underline">Back</NuxtLink>
    <template v-if="task">
      <h1 class="mt-4 text-3xl font-bold tracking-tight text-slate-900">{{ task.title }}</h1>
      <p class="mt-2 text-slate-600">Status: {{ task.done ? 'done' : 'open' }}</p>
      <p class="mt-1 text-slate-600">Priority: {{ task.priority }}</p>
    </template>
    <h1 v-else class="mt-4 text-3xl font-bold tracking-tight text-slate-900">Task not found</h1>
  </main>
</template>
