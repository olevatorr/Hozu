<script setup lang="ts">
const { data: products } = await useFetch('/api/products')
const count = ref(0)
onMounted(() => {
  const w = window as unknown as { __hydrateStart: number; __hydrated: { start: number; end: number } }
  w.__hydrated = { start: w.__hydrateStart, end: performance.now() }
})
</script>

<template>
  <main>
    <h1>Products</h1>
    <ul>
      <li v-for="p in products" :key="p.sku">
        <strong>{{ p.name }}</strong> — ${{ p.price }}
        <button type="button" @click="count++">Add</button>
      </li>
    </ul>
    <p>Cart: {{ count }} items</p>
  </main>
</template>
