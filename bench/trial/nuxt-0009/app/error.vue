<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)

useHead({ title: () => (notFound.value ? 'Task not found' : 'Error') })
</script>

<template>
  <main class="mx-auto max-w-xl px-4 py-12">
    <h1 class="text-3xl font-bold tracking-tight text-slate-900">
      {{ notFound ? 'Task not found' : 'Something went wrong' }}
    </h1>
    <a href="/" class="mt-4 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">Back</a>
  </main>
</template>
