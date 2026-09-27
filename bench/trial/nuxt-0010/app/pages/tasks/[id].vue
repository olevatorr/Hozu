<script setup lang="ts">
interface Task {
  id: string
  title: string
  done: boolean
  priority: 'low' | 'normal' | 'high'
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: task } = await useFetch<Task>(() => `/api/tasks/${id.value}`)

if (!task.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404, 'Not Found')
}

useHead({ title: () => task.value?.title ?? 'Task not found' })
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <div class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <template v-if="task">
        <h1 class="mb-2 text-2xl font-bold text-slate-900">{{ task.title }}</h1>
        <p class="text-slate-600">Status: {{ task.done ? 'done' : 'open' }}</p>
        <p class="text-slate-600">Priority: {{ task.priority }}</p>
      </template>
      <template v-else>
        <h1 class="mb-2 text-2xl font-bold text-slate-900">Task not found</h1>
      </template>
    </div>
    <NuxtLink to="/" class="mt-4 inline-block text-indigo-600 hover:underline">Back</NuxtLink>
  </main>
</template>
