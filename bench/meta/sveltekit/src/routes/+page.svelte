<script>
  import { onMount } from 'svelte'

  let { data } = $props()
  let count = $state(0)
  onMount(() => {
    window.__hydrated = { start: window.__hydrateStart, end: performance.now() }
  })
</script>

<main>
  <h1>Products</h1>
  <ul>
    {#each data.products as p (p.sku)}
      <li>
        <strong>{p.name}</strong> — ${p.price}
        <button type="button" onclick={() => count++}>Add</button>
      </li>
    {/each}
  </ul>
  <p>Cart: {count} items</p>
</main>
