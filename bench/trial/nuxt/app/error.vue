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
    <p class="mt-2 text-slate-600">HTTP {{ error.statusCode }}</p>
    <NuxtLink to="/" class="mt-4 inline-block text-indigo-600 hover:underline" @click.prevent="clearError({ redirect: '/' })">Back</NuxtLink>
  </main>
</template>
