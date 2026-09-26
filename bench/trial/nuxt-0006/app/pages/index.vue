<script setup lang="ts">
import type { Task } from '#shared/types/task'

type Filter = 'all' | 'open' | 'done'

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

const { data: tasks, refresh } = await useFetch<Task[]>('/api/tasks', { default: () => [] })

const newTitle = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const activeFilter = ref<Filter>('all')

const visibleTasks = computed(() =>
  tasks.value.filter((task) => {
    if (activeFilter.value === 'open') return !task.done
    if (activeFilter.value === 'done') return task.done
    return true
  }),
)

async function addTask() {
  submitting.value = true
  try {
    await $fetch('/api/tasks', { method: 'POST', body: { title: newTitle.value } })
    newTitle.value = ''
    errorMessage.value = ''
    await refresh()
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    errorMessage.value =
      status === 409 ? 'A task with this title already exists' : 'Title must be 3–80 characters'
  } finally {
    submitting.value = false
  }
}

async function toggleTask(task: Task) {
  await $fetch(`/api/tasks/${task.id}/toggle`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <h1 class="text-3xl font-bold tracking-tight text-slate-900">Tasks</h1>

    <form class="mt-6 flex flex-col gap-2" @submit.prevent="addTask">
      <label for="new-task" class="text-sm font-medium text-slate-700">New task</label>
      <div class="flex gap-2">
        <input
          id="new-task"
          v-model="newTitle"
          name="title"
          type="text"
          required
          minlength="3"
          maxlength="80"
          autocomplete="off"
          class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
        <button
          type="submit"
          :disabled="submitting"
          class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          Add
        </button>
      </div>
      <p v-if="errorMessage" role="alert" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {{ errorMessage }}
      </p>
    </form>

    <div class="mt-8 flex gap-2">
      <button
        v-for="filter in filters"
        :key="filter.value"
        type="button"
        :aria-pressed="activeFilter === filter.value ? 'true' : 'false'"
        class="rounded-full px-3 py-1 text-sm font-medium transition"
        :class="activeFilter === filter.value
          ? 'bg-slate-900 text-white'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'"
        @click="activeFilter = filter.value"
      >
        {{ filter.label }}
      </button>
    </div>

    <ul v-if="visibleTasks.length" class="mt-4 divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <li v-for="task in visibleTasks" :key="task.id" class="flex items-center gap-3 px-4 py-3">
        <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 font-medium text-slate-900 hover:text-indigo-600">
          {{ task.title }}
        </NuxtLink>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="task.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
        >{{ task.done ? 'done' : 'open' }}</span>
        <button
          type="button"
          class="rounded-md px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
          @click="toggleTask(task)"
        >
          {{ task.done ? 'Mark open' : 'Mark done' }}
        </button>
      </li>
    </ul>
    <p v-else class="mt-4 rounded-xl bg-white px-4 py-6 text-center text-slate-500 ring-1 ring-slate-200">No tasks</p>
  </main>
</template>
