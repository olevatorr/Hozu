export default defineNuxtPlugin({
  name: 'hydrate-start',
  enforce: 'pre',
  setup() {
    ;(window as unknown as { __hydrateStart: number }).__hydrateStart = performance.now()
  },
})
