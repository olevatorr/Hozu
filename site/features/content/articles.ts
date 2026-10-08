import { ui, type Val } from '@hozu/core'
import { chapter, doc, how } from '../../routes.ts'
import { peg } from '../../site/peg.ts'
import { Prose } from '../../site/prose.ts'
import { articleBody } from './body.ts'
import { pipelineDiagram, renderDiagram } from './diagrams.ts'
import { contentText as t } from './messages.ts'
import { getChapter, getDoc, listChapters, listDocs } from './model.ts'

const articleView = (
  route: typeof doc,
  list: typeof listDocs,
  get: typeof getDoc,
  label: Val<string>,
  explain: boolean,
) =>
  ui.view({
    route,
    render: ({ params, locale }) =>
      ui.query(
        get,
        { slug: params.slug, locale },
        {
          ready: (article) =>
            ui.use(
              Prose,
              {
                props: { pagerLabel: t.pager },
                slots: {
                  nav: ui.nav({ 'aria-label': label }, [
                    ui.p({ class: 'mb-3 text-xs font-extrabold uppercase tracking-widest text-ember' }, [
                      label,
                    ]),
                    ui.query(
                      list,
                      { locale },
                      {
                        ready: (items) =>
                          ui.ul({ class: 'grid gap-2' }, [
                            ui.each(items, 'slug', (item) =>
                              ui.li({}, [
                                ui.a(
                                  {
                                    href: ui.link(route, { slug: item.slug }),
                                    class:
                                      'aria-[current=page]:font-black aria-[current=page]:underline aria-[current=page]:decoration-red aria-[current=page]:decoration-4',
                                  },
                                  [item.title],
                                ),
                              ]),
                            ),
                          ]),
                        pending: null,
                        failed: { Unexpected: () => ui.p({ role: 'alert' }, [t.navUnavailable]) },
                      },
                    ),
                  ]),
                  aside: ui.nav({ 'aria-label': t.onThisPage }, [
                    ui.p({ class: 'mb-3 text-xs font-extrabold uppercase tracking-widest' }, [t.onThisPage]),
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
                !article.translated &&
                  locale !== 'en' &&
                  ui.p(
                    {
                      class: 'my-4 border-l-4 border-ember py-1 pl-3 text-sm',
                      'data-english-only': '',
                    },
                    [t.englishOnly],
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
                          ui.p({ class: 'font-mono text-sm' }, [t.pegDiagnostics]),
                        ]),
                    ]),
                articleBody(article),
              ],
            ),
          pending: null,
          failed: {
            NotFound: () => ui.use(Prose, { props: { pagerLabel: t.pager } }, [ui.h1({}, [t.notFound])]),
            Unexpected: () => ui.p({ role: 'alert' }, [t.articleUnavailable]),
          },
        },
      ),
  })
export const Docs = articleView(doc, listDocs, getDoc, t.docsLabel, false)
export const Chapter = articleView(chapter, listChapters, getChapter, t.navHow, true)
