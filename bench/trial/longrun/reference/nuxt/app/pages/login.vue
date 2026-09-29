<script setup lang="ts">
const { data } = await useFetch('/api/session')
const submit = useFormAction()
</script>

<template>
  <main class="mx-auto max-w-sm px-4 py-16">
    <h1 class="text-3xl font-bold tracking-tight">Sign in</h1>
    <p v-if="data?.flash" role="alert" class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{{ data.flash }}</p>
    <form method="post" action="/api/login" class="mt-6 flex flex-col gap-3" @submit.prevent="submit">
      <label for="name" class="text-sm font-medium text-slate-700">Name</label>
      <input id="name" name="name" type="text" required autocomplete="username" class="input">
      <button type="submit" class="btn-primary">Sign in</button>
    </form>
  </main>
</template>
