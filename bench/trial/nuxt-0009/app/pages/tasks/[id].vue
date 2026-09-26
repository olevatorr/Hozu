<script setup lang="ts">
import type { Task } from '~~/server/utils/tasks'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: task, error } = await useFetch<Task>(() => `/api/tasks/${id.value}`)

if (error.value || !task.value) {
  throw createError({ statusCode: 404, statusMessage: 'Task not found', fatal: true })
}

useHead({ title: () => task.value?.title ?? 'Task not found' })
</script>

<template>
  <main v-if="task" class="mx-auto max-w-xl px-4 py-12">
    <NuxtLink to="/" class="text-sm font-medium text-indigo-600 hover:text-indigo-500">Back</NuxtLink>
    <h1 class="mt-4 text-3xl font-bold tracking-tight text-slate-900">{{ task.title }}</h1>
    <p class="mt-2 text-slate-600">Status: {{ task.done ? 'done' : 'open' }}</p>
    <p class="mt-1 text-slate-600">Priority: {{ task.priority }}</p>
  </main>
</template>
