import { ui } from '@hozu/core'
import { chapter, doc, how } from '../../routes.ts'
import { peg } from '../../site/peg.ts'
import { Prose } from '../../site/prose.ts'
import { articleBody } from './body.ts'
import { pipelineDiagram, renderDiagram } from './diagrams.ts'
import { getChapter, getDoc, listChapters, listDocs } from './model.ts'

const articleView = (
  route: typeof doc,
  list: typeof listDocs,
  get: typeof getDoc,
  label: string,
  explain: boolean,
) =>
  ui.view({
    route,
    render: ({ params }) =>
      ui.query(
        get,
        { slug: params.slug },
        {
          ready: (article) =>
            ui.use(
              Prose,
              {
                slots: {
                  nav: ui.nav({ 'aria-label': label }, [
                    ui.p({ class: 'mb-3 text-xs font-extrabold uppercase tracking-widest text-ember' }, [
                      label,
                    ]),
                    ui.query(
                      list,
                      {},
                      {
                        ready: (items) =>
                          ui.ul({ class: 'grid gap-2' }, [
                            ui.each(items, 'slug', (item) =>
                              ui.li({}, [
                                params.slug === item.slug
                                  ? ui.a(
                                      {
                                        href: ui.link(route, { slug: item.slug }),
                                        'aria-current': 'page',
                                        class: 'font-black underline decoration-red decoration-4',
                                      },
                                      [item.title],
                                    )
                                  : ui.a({ href: ui.link(route, { slug: item.slug }) }, [item.title]),
                              ]),
                            ),
                          ]),
                        pending: null,
                        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Navigation is unavailable.']) },
                      },
                    ),
                  ]),
                  aside: ui.nav({ 'aria-label': 'On this page' }, [
                    ui.p({ class: 'mb-3 text-xs font-extrabold uppercase tracking-widest' }, [
                      'On this page',
                    ]),
                    ui.ul({ class: 'grid gap-2' }, [
                      ui.each(article.headings, 'id', (heading) =>
                        ui.li({}, [ui.a({ href: heading.href }, [heading.text])]),
                      ),
                    ]),
                  ]),
                  pager: ui.div({ class: 'flex w-full justify-between gap-4' }, [
                    ui.each(article.previous, 'slug', (item) =>
                      ui.a({ href: ui.link(route, { slug: item.slug }) }, ['← ', item.title]),
                    ),
                    ui.each(article.next, 'slug', (item) =>
                      ui.a({ href: ui.link(route, { slug: item.slug }) }, [item.title, ' →']),
                    ),
                  ]),
                },
              },
              [
                ui.a(
                  {
                    href: explain ? ui.link(how, null) : ui.link(doc, { slug: 'getting-started' }),
                    class: 'inline-block py-1.5 font-mono text-xs font-bold text-ember no-underline',
                  },
                  [label],
                ),
                ui.h1({}, [article.title]),
                ui.p({ class: 'text-xl' }, [article.description]),
                ...(explain
                  ? [
                      params.slug === 'pipeline' && pipelineDiagram(),
                      params.slug === 'derived-rendering' && renderDiagram(),
                    ]
                  : [
                      params.slug === 'diagnostics' &&
                        ui.div({ class: 'my-6 flex items-center gap-4' }, [
                          peg('calm', 80, 'h-auto shrink-0', true),
                          ui.p({ class: 'font-mono text-sm' }, [
                            'Peg reads these so you do not have to: hozu check prints each one with its file, line and fix, and your agent applies it.',
                          ]),
                        ]),
                    ]),
                articleBody(article),
              ],
            ),
          pending: null,
          failed: {
            NotFound: () => ui.use(Prose, {}, [ui.h1({}, ['Page not found'])]),
            Unexpected: () => ui.p({ role: 'alert' }, ['Article is unavailable.']),
          },
        },
      ),
  })
export const Docs = articleView(doc, listDocs, getDoc, 'Documentation', false)
export const Chapter = articleView(chapter, listChapters, getChapter, 'How it works', true)
