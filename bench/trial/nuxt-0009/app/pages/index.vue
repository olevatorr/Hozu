<script setup lang="ts">
import type { Priority, Task } from '~~/server/utils/tasks'

type Filter = 'all' | 'open' | 'done'

const { data: tasks } = await useFetch<Task[]>('/api/tasks', { default: () => [] })

const title = ref('')
const priority = ref<Priority>('normal')
const priorities: Priority[] = ['low', 'normal', 'high']
const clearing = ref(false)
const error = ref('')
const submitting = ref(false)
const filter = ref<Filter>('all')

const filters: { value: Filter, label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

const visible = computed(() => tasks.value.filter(t =>
  filter.value === 'all' ? true : filter.value === 'done' ? t.done : !t.done,
))

async function addTask() {
  error.value = ''
  submitting.value = true
  try {
    const task = await $fetch<Task>('/api/tasks', { method: 'POST', body: { title: title.value, priority: priority.value } })
    tasks.value = [task, ...tasks.value]
    title.value = ''
    priority.value = 'normal'
  }
  catch (e: unknown) {
    const err = e as { statusCode?: number, statusMessage?: string, data?: { statusMessage?: string } }
    error.value = err.statusCode === 409
      ? 'A task with this title already exists'
      : (err.data?.statusMessage ?? err.statusMessage ?? 'Could not add task')
  }
  finally {
    submitting.value = false
  }
}

async function toggle(task: Task) {
  const updated = await $fetch<Task>(`/api/tasks/${task.id}`, { method: 'PATCH' })
  tasks.value = tasks.value.map(t => (t.id === updated.id ? updated : t))
}

async function clearDoneTasks() {
  clearing.value = true
  try {
    await $fetch('/api/tasks/done', { method: 'DELETE' })
    tasks.value = tasks.value.filter(t => !t.done)
  }
  finally {
    clearing.value = false
  }
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <h1 class="mb-6 text-3xl font-bold tracking-tight text-slate-900">Tasks</h1>

    <form class="mb-4 flex items-end gap-2" @submit.prevent="addTask">
      <div class="flex-1">
        <label for="new-task" class="mb-1 block text-sm font-medium text-slate-700">New task</label>
        <input
          id="new-task"
          v-model="title"
          type="text"
          name="title"
          required
          minlength="3"
          maxlength="80"
          pattern="\s*\S.{1,78}\S\s*"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          @input="error = ''"
        >
      </div>
      <div>
        <label for="new-task-priority" class="mb-1 block text-sm font-medium text-slate-700">Priority</label>
        <select
          id="new-task-priority"
          v-model="priority"
          name="priority"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option v-for="p in priorities" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <button
        type="submit"
        :disabled="submitting"
        class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
      >
        Add
      </button>
    </form>

    <p v-if="error" role="alert" class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>

    <div class="mb-4 flex gap-2">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        :aria-pressed="filter === f.value ? 'true' : 'false'"
        class="rounded-full px-3 py-1 text-sm font-medium transition"
        :class="filter === f.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
        @click="filter = f.value"
      >
        {{ f.label }}
      </button>
      <button
        type="button"
        :disabled="clearing"
        class="ml-auto rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60"
        @click="clearDoneTasks"
      >
        Clear done
      </button>
    </div>

    <ul v-if="visible.length" class="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
      <li v-for="task in visible" :key="task.id" class="flex items-center gap-3 px-4 py-3">
        <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 font-medium text-slate-900 hover:text-indigo-600">{{ task.title }}</NuxtLink>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="task.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
        >{{ task.done ? 'done' : 'open' }}</span>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="task.priority === 'high' ? 'bg-rose-100 text-rose-700' : task.priority === 'low' ? 'bg-slate-100 text-slate-600' : 'bg-sky-100 text-sky-700'"
        >{{ task.priority }}</span>
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
          @click="toggle(task)"
        >
          {{ task.done ? 'Mark open' : 'Mark done' }}
        </button>
      </li>
    </ul>
    <p v-else class="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-slate-500">No tasks</p>
  </main>
</template>
