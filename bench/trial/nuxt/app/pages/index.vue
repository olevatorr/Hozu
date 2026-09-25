<script setup lang="ts">
import { PRIORITIES, type Priority, type Task } from '#shared/types/task'

type Filter = 'all' | 'open' | 'done'
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

const route = useRoute()
const { data: tasks, refresh } = await useFetch<Task[]>('/api/tasks', { default: () => [] })

const filter = ref<Filter>('all')
const title = ref('')
const priority = ref<Priority>('normal')
const error = ref<string | null>(route.query.error === 'duplicate' ? 'A task with this title already exists' : null)
const pending = ref(false)

const visible = computed(() =>
  tasks.value.filter((t) => filter.value === 'all' || (filter.value === 'done') === t.done),
)

async function add() {
  pending.value = true
  error.value = null
  try {
    const task = await $fetch<Task>('/api/tasks', { method: 'POST', body: { title: title.value, priority: priority.value } })
    tasks.value = [task, ...tasks.value]
    title.value = ''
    priority.value = 'normal'
    if (route.query.error) await navigateTo('/', { replace: true })
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    error.value = status === 409 ? 'A task with this title already exists' : 'Could not add the task'
  } finally {
    pending.value = false
  }
}

async function toggle(task: Task) {
  const updated = await $fetch<Task>(`/api/tasks/${task.id}/toggle`, { method: 'POST' })
  tasks.value = tasks.value.map((t) => (t.id === updated.id ? updated : t))
}

const clearing = ref(false)

async function clearDoneTasks() {
  clearing.value = true
  try {
    const { removed } = await $fetch<{ removed: string[] }>('/api/tasks/clear-done', { method: 'POST' })
    tasks.value = tasks.value.filter((t) => !removed.includes(t.id) && !t.done)
  } finally {
    clearing.value = false
  }
}

const priorityClass: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-sky-100 text-sky-700',
  high: 'bg-rose-100 text-rose-700',
}

onMounted(() => {
  if (!tasks.value.length) refresh()
})
</script>

<template>
  <div class="space-y-8">
    <h1 class="text-3xl font-bold tracking-tight">Tasks</h1>

    <form
      method="post"
      action="/api/tasks"
      class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
      @submit.prevent="add"
    >
      <label for="new-task" class="mb-1 block text-sm font-medium text-slate-700">New task</label>
      <div class="flex gap-2">
        <input
          id="new-task"
          v-model="title"
          name="title"
          type="text"
          required
          minlength="3"
          maxlength="80"
          pattern=".*\S.*\S.*\S.*"
          autocomplete="off"
          class="flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        >
        <label for="new-task-priority" class="sr-only">Priority</label>
        <select
          id="new-task-priority"
          v-model="priority"
          name="priority"
          class="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        >
          <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
        </select>
        <button
          type="submit"
          :disabled="pending"
          class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >Add</button>
      </div>
      <p v-if="error" role="alert" class="mt-2 text-sm text-red-600">{{ error }}</p>
    </form>

    <div class="flex flex-wrap items-center gap-2">
    <div class="flex gap-2" role="group" aria-label="Filter tasks">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        :aria-pressed="filter === f.value ? 'true' : 'false'"
        class="rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-slate-300 aria-pressed:bg-slate-900 aria-pressed:text-white aria-pressed:ring-slate-900"
        @click="filter = f.value"
      >{{ f.label }}</button>
    </div>
    <form method="post" action="/api/tasks/clear-done" class="ml-auto" @submit.prevent="clearDoneTasks">
      <button
        type="submit"
        :disabled="clearing"
        class="rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
      >Clear done</button>
    </form>
    </div>

    <ul v-if="visible.length" class="divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <li v-for="task in visible" :key="task.id" class="flex items-center gap-3 px-4 py-3">
        <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 font-medium hover:text-indigo-600">{{ task.title }}</NuxtLink>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="task.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
        >{{ task.done ? 'done' : 'open' }}</span>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="priorityClass[task.priority]"
        >{{ task.priority }}</span>
        <form method="post" :action="`/api/tasks/${task.id}/toggle`" @submit.prevent="toggle(task)">
          <button
            type="submit"
            class="rounded-lg px-3 py-1 text-sm ring-1 ring-slate-300 hover:bg-slate-100"
          >{{ task.done ? 'Mark open' : 'Mark done' }}</button>
        </form>
      </li>
    </ul>
    <p v-else class="text-slate-500">No tasks</p>
  </div>
</template>
