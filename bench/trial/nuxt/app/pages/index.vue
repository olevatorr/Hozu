<script setup lang="ts">
import { priorities, type Priority, type Task } from '#shared/types/task'

type Filter = 'all' | 'open' | 'done'
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

useHead({ title: 'Tasks' })

const { data: tasks, refresh } = await useFetch<Task[]>('/api/tasks', { default: () => [] })
const filter = ref<Filter>('all')
const title = ref('')
const priority = ref<Priority>('normal')
const error = ref('')
const pending = ref(false)

const visible = computed(() =>
  tasks.value.filter((t) => filter.value === 'all' || (filter.value === 'done') === t.done),
)

async function add() {
  error.value = ''
  pending.value = true
  try {
    await $fetch('/api/tasks', { method: 'POST', body: { title: title.value, priority: priority.value } })
    title.value = ''
    priority.value = 'normal'
    await refresh()
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    error.value =
      status === 409 ? 'A task with this title already exists' : 'Could not add the task'
  } finally {
    pending.value = false
  }
}

const badge: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-sky-100 text-sky-700',
  high: 'bg-rose-100 text-rose-700',
}

async function clearDone() {
  await $fetch('/api/tasks/clear-done', { method: 'POST' })
  await refresh()
}

async function toggle(task: Task) {
  await $fetch(`/api/tasks/${task.id}/toggle`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <h1 class="text-3xl font-bold tracking-tight text-slate-900">Tasks</h1>

    <form class="mt-6 flex items-end gap-2" @submit.prevent="add">
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
          pattern="\s*\S.+\S\s*"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        />
      </div>
      <div>
        <label for="new-priority" class="mb-1 block text-sm font-medium text-slate-700">Priority</label>
        <select
          id="new-priority"
          v-model="priority"
          name="priority"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        >
          <option v-for="p in priorities" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <button
        type="submit"
        :disabled="pending"
        class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
      >Add</button>
    </form>
    <p v-if="error" role="alert" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <div class="mt-6 flex gap-2">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        :aria-pressed="filter === f.value ? 'true' : 'false'"
        class="rounded-full border px-3 py-1 text-sm aria-pressed:border-indigo-600 aria-pressed:bg-indigo-600 aria-pressed:text-white border-slate-300 text-slate-700 hover:bg-slate-100"
        @click="filter = f.value"
      >{{ f.label }}</button>
      <button
        type="button"
        class="ml-auto rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
        @click="clearDone"
      >Clear done</button>
    </div>

    <ul v-if="visible.length" class="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
      <li v-for="task in visible" :key="task.id" class="flex items-center gap-3 px-4 py-3">
        <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 font-medium text-slate-800 hover:text-indigo-600">{{ task.title }}</NuxtLink>
        <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="badge[task.priority]">{{ task.priority }}</span>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="task.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
        >{{ task.done ? 'done' : 'open' }}</span>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
          @click="toggle(task)"
        >{{ task.done ? 'Mark open' : 'Mark done' }}</button>
      </li>
    </ul>
    <p v-else class="mt-4 text-slate-500">No tasks</p>
  </main>
</template>
