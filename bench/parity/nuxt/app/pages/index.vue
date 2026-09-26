<script setup lang="ts">
import { computed, ref } from 'vue'

const container = 'mx-auto max-w-6xl px-4 sm:px-6'
const heading = 'text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl dark:text-white'
const card =
  'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900'
const button =
  'inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
const tabs = ['design', 'build', 'ship'] as const
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const slides = ['Islands', 'Contracts', 'Motion', 'Widgets', 'Tailwind', 'Streaming'].map((title, i) => ({
  id: `s${i}`,
  title,
  body: `${title} without giving up verification.`,
  hue: 200 + i * 28,
}))
const stats = {
  visits: { label: 'Visits', labels: days, values: [320, 410, 380, 520, 610, 450, 390] },
  signups: { label: 'Sign-ups', labels: days, values: [12, 18, 15, 26, 31, 22, 17] },
}

const tab = ref<(typeof tabs)[number]>('design')
const todos = ref([
  { id: 't1', title: 'Sketch the layout' },
  { id: 't2', title: 'Pick the palette' },
])
const draft = ref('')
const next = ref(3)
const metric = ref<'visits' | 'signups'>('visits')
const slide = ref(0)
const spin = ref(true)
const series = computed(() => stats[metric.value])

const add = (e: Event) => {
  const title = String(new FormData(e.target as HTMLFormElement).get('title') ?? '')
  if (!title) return
  todos.value.push({ id: `t${next.value}`, title })
  next.value++
  draft.value = ''
}

const widgets = {
  globe: () => import('../../../../../examples/showcase/features/site/widgets/globe.client.ts'),
  reveal: () => import('../../../../../examples/showcase/features/site/widgets/reveal.client.ts'),
  smooth: () => import('../../../../../examples/showcase/features/site/widgets/smooth.client.ts'),
  carousel: () => import('../../../../../examples/showcase/features/site/widgets/carousel.client.ts'),
  chart: () => import('../../../../../examples/showcase/features/site/widgets/chart.client.ts'),
  sketch: () => import('../../../../../examples/showcase/features/site/widgets/sketch.client.ts'),
}
</script>

<template>
  <Widget :setup="widgets.smooth" :props="{}" class="min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header class="site-header sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <nav :class="`${container} flex h-16 items-center justify-between`">
        <a href="/" class="text-lg font-bold text-slate-900 dark:text-white">Hozu</a>
        <div class="flex gap-6 text-sm text-slate-600 dark:text-slate-300">
          <a href="#features" class="hover:text-indigo-600">Features</a>
          <a href="#gallery" class="hover:text-indigo-600">Gallery</a>
          <a href="/about" class="hover:text-indigo-600">About</a>
        </div>
      </nav>
    </header>
    <main>
      <section :class="`${container} grid items-center gap-12 py-20 md:grid-cols-2`">
        <div class="space-y-6">
          <p class="text-sm font-semibold uppercase tracking-widest text-indigo-600">AI-first, human-facing</p>
          <h1 class="bg-gradient-to-br from-slate-900 to-indigo-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl dark:from-white dark:to-indigo-400">Verified by machines. Built for people.</h1>
          <p class="max-w-prose text-lg text-slate-600 dark:text-slate-300">Every animation, widget and style you expect from a modern site, with a program an AI can check.</p>
          <div class="flex flex-wrap gap-3">
            <a href="#features" :class="`${button} bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500`">Explore</a>
            <button type="button" :class="`${button} border border-slate-300 text-slate-700 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200`" :aria-pressed="spin" @click="spin = !spin">{{ spin ? 'Pause globe' : 'Spin globe' }}</button>
          </div>
        </div>
        <Widget :setup="widgets.globe" :props="{ spin }" load="visible" class="aspect-square w-full text-indigo-500">
          <div class="h-full w-full rounded-full bg-gradient-to-br from-indigo-500/30 to-sky-400/10"></div>
        </Widget>
      </section>
      <Widget :setup="widgets.reveal" :props="{}" class="py-16">
        <section id="features" :class="`${container} space-y-10`">
          <h2 :class="heading">What you get</h2>
          <div class="grid gap-6 md:grid-cols-3">
            <article :class="card" data-reveal="true">
              <h3 class="text-lg font-semibold">Closed views</h3>
              <p class="mt-2 text-slate-600 dark:text-slate-300">Every node is data the validator can read.</p>
            </article>
            <article :class="card" data-reveal="true">
              <h3 class="text-lg font-semibold">Derived rendering</h3>
              <p class="mt-2 text-slate-600 dark:text-slate-300">Static, ISR or streamed: decided, not configured.</p>
            </article>
            <article :class="card" data-reveal="true">
              <h3 class="text-lg font-semibold">Any library</h3>
              <p class="mt-2 text-slate-600 dark:text-slate-300">three.js, GSAP, Swiper and more, behind typed widgets.</p>
            </article>
          </div>
        </section>
      </Widget>
      <section :class="`${container} space-y-6 py-16`">
        <h2 :class="heading">How it works</h2>
        <div role="tablist" class="inline-flex rounded-full bg-slate-200/70 p-1 dark:bg-slate-800">
          <button v-for="t in tabs" :key="t" type="button" role="tab" :class="['rounded-full px-4 py-1.5 text-sm font-medium capitalize text-slate-600 transition dark:text-slate-300', { 'bg-white text-slate-900 shadow dark:bg-slate-950 dark:text-white': tab === t }]" :aria-selected="tab === t" @click="tab = t">{{ t }}</button>
        </div>
        <div role="tabpanel" class="relative min-h-24">
          <Transition name="fade">
            <p v-if="tab === 'design'" key="design" class="panel">Describe features as data: events, queries, machines and views.</p>
            <p v-else-if="tab === 'build'" key="build" class="panel">The validator checks every reference, state and class before you run it.</p>
            <p v-else key="ship" class="panel">Ship HTML first; only interactive islands download JavaScript.</p>
          </Transition>
        </div>
      </section>
      <section id="gallery" class="space-y-6 py-16">
        <div :class="`${container} flex items-end justify-between`">
          <h2 :class="heading">Gallery</h2>
          <p class="text-sm tabular-nums text-slate-500">{{ slide + 1 }} / {{ slides.length }}</p>
        </div>
        <Widget :setup="widgets.carousel" :props="{ perView: 3 }" load="visible" :class="`swiper ${container}`" @event="(_n, d) => (slide = d.index)">
          <div class="swiper-wrapper">
            <article v-for="s in slides" :key="s.id" :class="`swiper-slide ${card} h-48`" :style="{ '--hue': s.hue }">
              <div class="mb-4 h-2 w-12 rounded-full bg-[hsl(var(--hue)_80%_60%)]"></div>
              <h3 class="text-lg font-semibold">{{ s.title }}</h3>
              <p class="mt-2 text-slate-600 dark:text-slate-300">{{ s.body }}</p>
            </article>
          </div>
        </Widget>
      </section>
      <section :class="`${container} grid gap-10 py-16 md:grid-cols-2`">
        <div class="space-y-4">
          <h2 :class="heading">Tasks</h2>
          <form class="flex gap-2" @submit.prevent="add">
            <label for="title" class="sr-only">New task</label>
            <input id="title" v-model="draft" name="title" required minlength="2" placeholder="Add a task" class="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 invalid:[&:not(:placeholder-shown)]:border-rose-400 dark:border-slate-700 dark:bg-slate-900" />
            <button type="submit" :class="`${button} bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900`">Add</button>
          </form>
          <p v-if="todos.length === 0" class="text-slate-500">Nothing left. Nice.</p>
          <ul v-else class="relative space-y-2">
            <TransitionGroup name="list">
              <li v-for="todo in todos" :key="todo.id" class="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <span>{{ todo.title }}</span>
                <button type="button" aria-label="Remove" class="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" @click="todos = todos.filter((t) => t.id !== todo.id)">×</button>
              </li>
            </TransitionGroup>
          </ul>
          <button type="button" class="text-sm text-indigo-600 hover:underline" @click="todos = [...todos].reverse()">Reverse order</button>
        </div>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 :class="heading">Traffic</h2>
            <select v-model="metric" class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Metric">
              <option value="visits">Visits</option>
              <option value="signups">Sign-ups</option>
            </select>
          </div>
          <Widget :setup="widgets.chart" :props="series" load="visible" class="h-64 rounded-2xl border border-slate-200 bg-white p-4 text-indigo-500 dark:border-slate-800 dark:bg-slate-900">
            <table class="w-full text-sm">
              <tbody>
                <tr v-for="label in stats.visits.labels" :key="label"><th class="text-left font-normal">{{ label }}</th></tr>
              </tbody>
            </table>
          </Widget>
        </div>
      </section>
      <section :class="`${container} py-16`">
        <Widget :setup="widgets.sketch" :props="{ hue: 230 }" load="visible" class="h-64 overflow-hidden rounded-3xl bg-slate-900">
          <p class="p-6 text-slate-400">Generative sketch</p>
        </Widget>
      </section>
    </main>
    <footer :class="`${container} border-t border-slate-200 py-10 text-sm text-slate-500 dark:border-slate-800`">© 2026 Hozu</footer>
  </Widget>
</template>
