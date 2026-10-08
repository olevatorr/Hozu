import { readFile } from 'node:fs/promises'
import { bundleComponents } from '@hozu/bundle'
import { loadCollection } from '@hozu/content'
import { resolvers } from '@hozu/data'
import { app } from '@hozu/runtime-server'
import { z } from 'zod'
import {
  Frontmatter,
  getChangelog,
  getChapter,
  getDoc,
  getRelease,
  getStart,
  getTrial,
  listChapters,
  listDocs,
  listTrials,
  Translated,
} from './features/content/model.ts'
import { mediaOrigin } from './features/home/media.ts'
import { getPlayground } from './features/home/model.ts'
import { highlight } from './highlight.ts'
import project from './hozu.config.ts'

const release = JSON.parse(
  await readFile(new URL('../packages/core/package.json', import.meta.url), 'utf8'),
) as {
  version: string
}
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const buttonSource = await readFile(new URL('./site/button.ts', import.meta.url), 'utf8')
const renders = JSON.parse(
  await readFile(new URL('./features/home/render-snapshot.json', import.meta.url), 'utf8'),
)
const jointSource = await readFile(new URL('./site/joint.ts', import.meta.url), 'utf8')
const jointClient = await readFile(new URL('./site/joint.client.ts', import.meta.url), 'utf8')
const jointExcerpt = [
  jointClient.slice(
    jointClient.indexOf('export default implement'),
    jointClient.indexOf('\n', jointClient.indexOf('export default implement')),
  ),
  '  // … GLTFLoader, toon materials, ink hulls, idle turn, drag …',
  jointClient.slice(jointClient.indexOf('  return {'), jointClient.indexOf('    destroy()')).trimEnd(),
  '    destroy() { … },\n  }\n})',
].join('\n')
const playground = {
  source: highlight(`<pre><code class="language-ts">${escapeHtml(buttonSource)}</code></pre>`),
  solid: JSON.stringify(renders.solid, null, 2),
  outline: JSON.stringify(renders.outline, null, 2),
  joint: highlight(
    `<pre><code class="language-ts">${escapeHtml(jointSource)}\n// site/joint.client.ts\n${escapeHtml(jointExcerpt)}</code></pre>`,
  ),
}
const repository = 'https://github.com/olevatorr/Hozu/blob/main/'
const rewriteLinks = (html: string, source: string) =>
  html
    .replace(/href="([^"#]+)(#[^"]*)?"/g, (match, href: string, hash = '') => {
      if (/^(?:[a-z]+:|\/)/i.test(href)) return match
      const path = new URL(href, `https://source.local/${source}`).pathname.slice(1)
      if (path.startsWith('docs/trials/') && path.endsWith('.md'))
        return `href="/trials/${path.slice(12, -3)}${hash}"`
      if (path === 'CHANGELOG.md') return `href="/changelog${hash}"`
      return `href="${repository}${path}${hash}"`
    })
    .replace(/src="([^"]+)"/g, (match, src: string) => {
      if (/^(?:[a-z]+:|\/)/i.test(src)) return match
      const path = new URL(src, `https://source.local/${source}`).pathname.slice(1)
      return path.startsWith('docs/trials/') ? `src="/trials/${path.slice(12)}"` : match
    })
const collection = async (path: string, translated = false) =>
  (
    await loadCollection({
      dir: new URL(path, import.meta.url),
      schema: translated ? Translated : Frontmatter,
    }).catch(() => [])
  )
    .map(({ slug, data, html, headings }) => ({
      slug,
      title: data.title,
      description: data.description,
      order: data.order,
      html: highlight(html),
      headings: headings.map((heading) => ({ ...heading, href: `#${heading.id}` })),
    }))
    .sort((a, b) => a.order - b.order)
const docs = await collection('./content/docs/')
const chapters = await collection('./content/how-it-works/')
/** Translated pages by locale; a page without one shows the English text with translated: false (ADR 0074). */
const translations: Record<string, { docs: typeof docs; chapters: typeof docs }> = {
  'zh-TW': {
    docs: await collection('./content/zh-TW/docs/', true),
    chapters: await collection('./content/zh-TW/how-it-works/', true),
  },
}
const localized = (items: typeof docs, kind: 'docs' | 'chapters', locale: string) => {
  const own = translations[locale]?.[kind] ?? []
  return items.map((item) => {
    const t = own.find((x) => x.slug === item.slug)
    return t ? { ...t, order: item.order, translated: true } : { ...item, translated: locale === 'en' }
  })
}
const trials = await Promise.all(
  (await loadCollection({ dir: new URL('../docs/trials/', import.meta.url), schema: z.object({}) })).map(
    async ({ slug, html, headings }) => {
      const raw = await readFile(new URL(`../docs/trials/${slug}.md`, import.meta.url), 'utf8')
      return {
        slug,
        title: raw
          .split('\n')[0]!
          .replace(/^# /, '')
          .replace(/`([^`]+)`/g, '$1'),
        description: 'Original methods, results and limitations from the Hozu repository.',
        order: Number(slug.slice(0, 4)),
        html: highlight(rewriteLinks(html, `docs/trials/${slug}.md`)),
        headings: headings.map((heading) => ({ ...heading, href: `#${heading.id}` })),
      }
    },
  ),
)
trials.sort((a, b) => b.order - a.order)
const changelog = (await loadCollection({ dir: new URL('../', import.meta.url), schema: z.object({}) })).find(
  (entry) => entry.slug === 'CHANGELOG',
)
if (!changelog) throw new Error('CHANGELOG.md was not loaded')
const changelogHtml = highlight(rewriteLinks(changelog.html, 'CHANGELOG.md'))
const summary = ({
  slug,
  title,
  description,
  order,
}: {
  slug: string
  title: string
  description: string
  order: number
}) => ({
  slug,
  title,
  description,
  order,
})
const article = (items: ((typeof docs)[number] & { translated?: boolean })[], slug: string) => {
  const index = items.findIndex((item) => item.slug === slug)
  const item = items[index]
  return item
    ? {
        ...item,
        hasCode: item.html.includes('<pre'),
        translated: item.translated ?? true,
        previous: items.slice(Math.max(0, index - 1), index).map(summary),
        next: items.slice(index + 1, index + 2).map(summary),
      }
    : undefined
}
export default app({
  resolvers: resolvers(project, (implement) => [
    implement(listChapters, ({ locale }) => localized(chapters, 'chapters', locale).map(summary)),
    implement(
      getChapter,
      ({ slug, locale }, { fail }) =>
        article(localized(chapters, 'chapters', locale), slug) ?? fail('NotFound', { slug }),
    ),
    implement(getStart, () => ({
      html: highlight(
        '<pre><code class="language-sh">npm create hozu@latest my-app -- --agent claude\ncd my-app\nnpm install\nnpx hozu add feature tasks --page /tasks\nnpx hozu check</code></pre>',
      ),
    })),
    implement(listDocs, ({ locale }) => localized(docs, 'docs', locale).map(summary)),
    implement(
      getDoc,
      ({ slug, locale }, { fail }) =>
        article(localized(docs, 'docs', locale), slug) ?? fail('NotFound', { slug }),
    ),
    implement(listTrials, () => trials.map(summary)),
    implement(getTrial, ({ slug }, { fail }) => article(trials, slug) ?? fail('NotFound', { slug })),
    implement(getPlayground, () => playground),
    implement(getRelease, () => ({ version: release.version })),
    implement(getChangelog, () => ({ html: changelogHtml, hasCode: changelogHtml.includes('<pre') })),
  ]),
  components: bundleComponents,
  csp: { media: [mediaOrigin] },
})
