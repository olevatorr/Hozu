<script setup lang="ts">
const route = useRoute()
const invalid = computed(() => route.query.error === 'invalid')
useHead({ title: 'Sign in' })
</script>

<template>
  <main class="mx-auto max-w-sm px-4 py-16">
    <div class="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 class="mb-6 text-2xl font-semibold text-slate-900">Sign in</h1>
      <form method="post" action="/api/login" class="space-y-4">
        <div>
          <label for="name" class="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minlength="2"
            maxlength="20"
            pattern="\p{L}{2,20}"
            title="2–20 letters"
            autocomplete="username"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
        </div>
        <p v-if="invalid" role="alert" class="text-sm text-red-600">Name must be 2–20 letters</p>
        <button
          type="submit"
          class="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >Sign in</button>
      </form>
    </div>
  </main>
</template>
