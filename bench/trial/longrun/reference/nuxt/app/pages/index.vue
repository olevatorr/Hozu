<script setup lang="ts">
import type { NotesPage } from '#shared/types/note'

const route = useRoute()
const { data, error } = await useFetch<NotesPage>('/api/notes', { query: computed(() => route.query) })
if (error.value?.statusCode === 401) await navigateTo('/login')

const submit = useFormAction()
const text = ref('')
const adding = ref(false)

async function add(event: SubmitEvent) {
  if (adding.value) return
  adding.value = true
  try {
    await submit(event)
    if (!data.value?.flash) text.value = ''
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <main v-if="data" class="mx-auto max-w-xl px-4 py-12">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Notes</h1>
        <p class="mt-1 text-sm text-slate-600">Signed in as {{ data.user }}</p>
      </div>
      <form method="post" action="/api/logout" @submit.prevent="submit">
        <button type="submit" class="btn">Sign out</button>
      </form>
    </header>

    <p class="mt-6 text-sm text-slate-600">Notes: {{ data.count }}</p>
    <p v-if="data.flash" role="alert" class="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ data.flash }}</p>

    <form method="post" action="/api/notes" class="mt-4 flex flex-col gap-2" @submit.prevent="add">
      <input type="hidden" name="back" :value="route.fullPath">
      <label for="new-note" class="text-sm font-medium text-slate-700">New note</label>
      <div class="flex gap-2">
        <input id="new-note" v-model="text" name="text" type="text" required maxlength="100" autocomplete="off" class="input flex-1">
        <button type="submit" :disabled="adding" class="btn-primary">Add</button>
      </div>
    </form>

    <ul class="mt-6 divide-y divide-slate-200 rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <li v-for="note in data.notes" :key="note.id" class="flex items-center gap-3 px-4 py-3">
        <span class="flex-1">{{ note.text }}</span>
        <form method="post" :action="`/api/notes/${note.id}/delete`" @submit.prevent="submit">
          <input type="hidden" name="back" :value="route.fullPath">
          <button type="submit" class="btn">Delete</button>
        </form>
      </li>
    </ul>
  </main>
</template>
