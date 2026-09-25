<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const notFound = computed(() => props.error.statusCode === 404)
useHead({ title: () => (notFound.value ? 'Task not found' : 'Error') })
</script>

<template>
  <div class="min-h-screen bg-slate-50 text-slate-900">
    <main class="mx-auto max-w-xl space-y-4 px-4 py-12">
      <h1 class="text-3xl font-bold tracking-tight">{{ notFound ? 'Task not found' : 'Something went wrong' }}</h1>
      <NuxtLink to="/" class="inline-block text-indigo-600 hover:underline">Back</NuxtLink>
    </main>
  </div>
</template>
