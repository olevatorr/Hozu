import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: false },
  css: ['~/assets/app.css'],
  vite: { plugins: [tailwindcss()] },
  app: { head: { htmlAttrs: { lang: 'en' }, title: 'Tasks' } },
})
