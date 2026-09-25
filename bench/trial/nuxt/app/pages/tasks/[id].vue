<script setup lang="ts">
import type { Task } from '#shared/types/task'

const route = useRoute()
const { data: task, error } = await useFetch<Task>(`/api/tasks/${encodeURIComponent(String(route.params.id))}`)

if (error.value || !task.value) {
  throw createError({ statusCode: 404, statusMessage: 'Task not found', fatal: true })
}

useHead({ title: () => task.value?.title ?? 'Task not found' })
</script>

<template>
  <article v-if="task" class="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <h1 class="text-3xl font-bold tracking-tight">{{ task.title }}</h1>
    <p class="text-slate-600">Status: {{ task.done ? 'done' : 'open' }}</p>
    <p class="text-slate-600">Priority: {{ task.priority }}</p>
    <NuxtLink to="/" class="inline-block text-indigo-600 hover:underline">Back</NuxtLink>
  </article>
</template>
