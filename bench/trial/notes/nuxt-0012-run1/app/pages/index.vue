<script setup lang="ts">
import { FetchError } from 'ofetch'

interface Note {
  id: string
  text: string
  pinned?: boolean
}

const route = useRoute()
const { data, error: loadError } = await useFetch<{ user: string, notes: Note[] }>('/api/notes', {
  key: 'notes',
})
if (loadError.value || !data.value) {
  await navigateTo('/login', { redirectCode: 303 })
}

useHead({ title: 'Notes' })

const messages: Record<string, string> = {
  duplicate: 'You already have this note',
  invalid: 'A note must be 1–100 characters',
}
const errorKey = ref<string | null>(typeof route.query.error === 'string' ? route.query.error : null)
const errorMessage = computed(() => (errorKey.value ? messages[errorKey.value] ?? null : null))

const newNote = ref('')
const adding = ref(false)
const deleting = ref(new Set<string>())
const pinning = ref(new Set<string>())
const search = ref('')

const sortedNotes = computed(() =>
  [...(data.value?.notes ?? [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)),
)
const visibleNotes = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return sortedNotes.value
  return sortedNotes.value.filter((n) => n.text.toLowerCase().includes(q))
})

function clearErrorQuery() {
  if (route.query.error) navigateTo({ path: '/', query: {} }, { replace: true })
}

async function addNote() {
  if (adding.value || !data.value) return
  adding.value = true
  try {
    const note = await $fetch<Note>('/api/notes', { method: 'POST', body: { text: newNote.value } })
    data.value.notes.unshift(note)
    newNote.value = ''
    errorKey.value = null
    clearErrorQuery()
  } catch (e) {
    if (e instanceof FetchError && e.statusCode === 401) return navigateTo('/login')
    errorKey.value = e instanceof FetchError && e.statusCode === 409 ? 'duplicate' : 'invalid'
  } finally {
    adding.value = false
  }
}

async function deleteNote(id: string) {
  if (deleting.value.has(id) || !data.value) return
  deleting.value.add(id)
  try {
    await $fetch('/api/notes/delete', { method: 'POST', body: { id } })
    data.value.notes = data.value.notes.filter((n) => n.id !== id)
  } catch (e) {
    if (e instanceof FetchError && e.statusCode === 401) return navigateTo('/login')
  } finally {
    deleting.value.delete(id)
  }
}

async function togglePin(note: Note) {
  if (pinning.value.has(note.id) || !data.value) return
  pinning.value.add(note.id)
  const pinned = !note.pinned
  try {
    await $fetch('/api/notes/pin', { method: 'POST', body: { id: note.id, pinned } })
    note.pinned = pinned
  } catch (e) {
    if (e instanceof FetchError && e.statusCode === 401) return navigateTo('/login')
  } finally {
    pinning.value.delete(note.id)
  }
}

async function signOut() {
  await $fetch('/api/logout', { method: 'POST', body: {} })
  clearNuxtData('notes')
  await navigateTo('/login')
}
</script>

<template>
  <main v-if="data" class="mx-auto max-w-xl px-4 py-12">
    <header class="mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold text-slate-900">Notes</h1>
        <p class="mt-1 text-sm text-slate-600">Signed in as {{ data.user }}</p>
      </div>
      <form method="post" action="/api/logout" @submit.prevent="signOut">
        <button
          type="submit"
          class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >Sign out</button>
      </form>
    </header>

    <section class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <form method="post" action="/api/notes" class="flex items-end gap-2" @submit.prevent="addNote">
        <div class="flex-1">
          <label for="new-note" class="mb-1 block text-sm font-medium text-slate-700">New note</label>
          <input
            id="new-note"
            v-model="newNote"
            name="text"
            type="text"
            required
            maxlength="100"
            autocomplete="off"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
        </div>
        <button
          type="submit"
          :disabled="adding"
          class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >Add</button>
      </form>
      <p v-if="errorMessage" role="alert" class="mt-3 text-sm text-red-600">{{ errorMessage }}</p>

      <div class="mt-6">
        <label for="search" class="mb-1 block text-sm font-medium text-slate-700">Search</label>
        <input
          id="search"
          v-model="search"
          type="search"
          autocomplete="off"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
      </div>

      <p class="mt-6 text-sm font-medium text-slate-500">Notes: {{ data.notes.length }}</p>
      <p v-if="search.trim() && visibleNotes.length === 0" class="mt-2 text-sm text-slate-500">No notes match</p>
      <ul v-else class="mt-2 divide-y divide-slate-100">
        <li v-for="note in visibleNotes" :key="note.id" class="flex items-center justify-between gap-4 py-2">
          <div class="flex min-w-0 items-center gap-2">
            <span class="break-all text-slate-800">{{ note.text }}</span>
            <span
              v-if="note.pinned"
              class="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
            >pinned</span>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <form method="post" action="/api/notes/pin" @submit.prevent="togglePin(note)">
              <input type="hidden" name="id" :value="note.id">
              <input type="hidden" name="pinned" :value="note.pinned ? 'false' : 'true'">
              <button
                type="submit"
                :disabled="pinning.has(note.id)"
                class="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >{{ note.pinned ? 'Unpin' : 'Pin' }}</button>
            </form>
            <form method="post" action="/api/notes/delete" @submit.prevent="deleteNote(note.id)">
              <input type="hidden" name="id" :value="note.id">
              <button
                type="submit"
                :disabled="deleting.has(note.id)"
                class="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >Delete</button>
            </form>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
