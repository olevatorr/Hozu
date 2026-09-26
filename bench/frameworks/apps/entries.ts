export const reactClient = `
import { createElement as h, useEffect } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { App } from './apps/react.ts'
const start = performance.now()
function Root(props) {
  useEffect(() => { window.__hydrated = { start, end: performance.now() } }, [])
  return h(App, props)
}
hydrateRoot(document.getElementById('root'), h(Root, JSON.parse(document.getElementById('props').textContent)))
`
export const preactClient = `
import { h, hydrate } from 'preact'
import { App } from './apps/preact.ts'
const start = performance.now()
hydrate(h(App, JSON.parse(document.getElementById('props').textContent)), document.getElementById('root'))
window.__hydrated = { start, end: performance.now() }
`
export const vueClient = `
import { createSSRApp } from 'vue'
import { App } from './apps/vue.ts'
const start = performance.now()
createSSRApp(App, JSON.parse(document.getElementById('props').textContent)).mount('#root')
window.__hydrated = { start, end: performance.now() }
`
export const svelteClient = `
import { hydrate } from 'svelte'
import App from './out/App.client.js'
const start = performance.now()
hydrate(App, { target: document.getElementById('root'), props: JSON.parse(document.getElementById('props').textContent) })
window.__hydrated = { start, end: performance.now() }
`
export const hozuClient = `
import { hydrate } from '../../packages/runtime-client/src/hydrate.ts'
const start = performance.now()
hydrate(document).then(() => { window.__hydrated = { start, end: performance.now() } })
`
