<script setup lang="ts">
import type { Task } from '#shared/types/task'

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: task } = await useFetch<Task>(() => `/api/tasks/${id.value}`)

if (!task.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404, 'Task not found')
}

useHead({ title: () => task.value?.title ?? 'Task not found' })
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <template v-if="task">
      <h1 class="text-3xl font-bold tracking-tight text-slate-900">{{ task.title }}</h1>
      <p class="mt-4 text-slate-600">Status: {{ task.done ? 'done' : 'open' }}</p>
    </template>
    <p v-else class="text-xl font-semibold text-slate-900">Task not found</p>
    <NuxtLink to="/" class="mt-8 inline-block text-indigo-600 hover:text-indigo-500">Back</NuxtLink>
  </main>
</template>
