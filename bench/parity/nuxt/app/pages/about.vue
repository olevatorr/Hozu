<template>
  <div class="min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header class="site-header sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <nav class="mx-auto max-w-6xl px-4 sm:px-6 flex h-16 items-center justify-between">
        <a href="/" class="text-lg font-bold text-slate-900 dark:text-white">Hozu</a>
        <div class="flex gap-6 text-sm text-slate-600 dark:text-slate-300">
          <a href="#features" class="hover:text-indigo-600">Features</a>
          <a href="#gallery" class="hover:text-indigo-600">Gallery</a>
          <a href="/about" class="hover:text-indigo-600">About</a>
        </div>
      </nav>
    </header>
    <main class="mx-auto max-w-6xl px-4 sm:px-6 prose prose-slate py-20 dark:prose-invert">
      <h1>About this showcase</h1>
      <p>The same page is built with Hozu and with Nuxt, then compared screenshot by screenshot. See docs/benchmarks/0002-parity.md.</p>
    </main>
  </div>
</template>
