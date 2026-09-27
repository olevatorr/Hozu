<script setup lang="ts">
interface Task {
  id: string
  title: string
  done: boolean
  priority: Priority
}
type Priority = 'low' | 'normal' | 'high'
type Filter = 'all' | 'open' | 'done'

const { data: tasks, refresh } = await useFetch<Task[]>('/api/tasks', { default: () => [] })

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
  filter.value === 'all' || (filter.value === 'done' ? t.done : !t.done),
))

async function addTask() {
  error.value = ''
  const trimmed = title.value.trim()
  if (trimmed.length < 3 || trimmed.length > 80) {
    error.value = 'Title must be 3–80 characters'
    return
  }
  submitting.value = true
  try {
    await $fetch('/api/tasks', { method: 'POST', body: { title: trimmed, priority: priority.value } })
    title.value = ''
    priority.value = 'normal'
    await refresh()
  }
  catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    error.value = status === 409 ? 'A task with this title already exists' : 'Could not add task'
  }
  finally {
    submitting.value = false
  }
}

async function clearDone() {
  clearing.value = true
  try {
    await $fetch('/api/tasks/done', { method: 'DELETE' })
    await refresh()
  }
  finally {
    clearing.value = false
  }
}

async function toggle(task: Task) {
  await $fetch(`/api/tasks/${task.id}`, { method: 'PATCH' })
  await refresh()
}
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <h1 class="mb-6 text-3xl font-bold tracking-tight text-slate-900">Tasks</h1>

    <form class="mb-6 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" @submit.prevent="addTask">
      <label for="new-task" class="mb-1 block text-sm font-medium text-slate-700">New task</label>
      <div class="flex gap-2">
        <input
          id="new-task"
          v-model="title"
          type="text"
          name="title"
          required
          minlength="3"
          maxlength="80"
          autocomplete="off"
          class="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
        <label for="new-priority" class="sr-only">Priority</label>
        <select
          id="new-priority"
          v-model="priority"
          name="priority"
          class="rounded-lg border border-slate-300 px-2 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option v-for="p in priorities" :key="p" :value="p">{{ p }}</option>
        </select>
        <button
          type="submit"
          :disabled="submitting"
          class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >Add</button>
      </div>
      <p v-if="error" role="alert" class="mt-2 text-sm text-red-600">{{ error }}</p>
    </form>

    <div class="mb-4 flex gap-2">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        :aria-pressed="filter === f.value ? 'true' : 'false'"
        class="rounded-full px-3 py-1 text-sm font-medium ring-1"
        :class="filter === f.value ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'"
        @click="filter = f.value"
      >{{ f.label }}</button>
      <button
        type="button"
        :disabled="clearing"
        class="ml-auto rounded-full px-3 py-1 text-sm font-medium text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-60"
        @click="clearDone"
      >Clear done</button>
    </div>

    <ul v-if="visible.length" class="divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <li v-for="task in visible" :key="task.id" class="flex items-center gap-3 px-4 py-3">
        <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 text-slate-900 hover:text-indigo-600 hover:underline">{{ task.title }}</NuxtLink>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-medium"
          :class="task.priority === 'high' ? 'bg-red-100 text-red-700' : task.priority === 'low' ? 'bg-slate-100 text-slate-600' : 'bg-sky-100 text-sky-700'"
        >{{ task.priority }}</span>
        <span
          class="rounded-full px-2 py-0.5 text-xs font-medium"
          :class="task.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
        >{{ task.done ? 'done' : 'open' }}</span>
        <button
          type="button"
          class="rounded-lg px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
          @click="toggle(task)"
        >{{ task.done ? 'Mark open' : 'Mark done' }}</button>
      </li>
    </ul>
    <p v-else class="rounded-xl bg-white px-4 py-6 text-center text-slate-500 ring-1 ring-slate-200">No tasks</p>
  </main>
</template>
