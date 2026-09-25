<script>
let { products } = $props()
let count = $state(0)
</script>

<main><h1>Products</h1><ul>{#each products as p (p.sku)}<li><strong>{p.name}</strong> — ${p.price}<button type="button" onclick={() => count++}>Add</button></li>{/each}</ul><p>Cart: {count} items</p></main>
