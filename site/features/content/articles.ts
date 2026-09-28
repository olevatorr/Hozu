import { op, ui } from '@hozu/core'
import { chapter, doc, how } from '../../routes.ts'
import { pipelineDiagram, renderDiagram } from './diagrams.ts'
import { getChapter, getDoc, listChapters, listDocs } from './model.ts'
import { CodeCopy } from './widgets.ts'

const articleView = (
  route: typeof doc,
  list: typeof listDocs,
  get: typeof getDoc,
  label: string,
  explain: boolean,
) =>
  ui.view({
    route,
    render: ({ params }) => {
      const navigation = () =>
        ui.query(
          list,
          {},
          {
            ready: (items) =>
              ui.ul({}, [
                ui.each(items, 'slug', (item) =>
                  ui.li({}, [
                    ui.if(
                      op.eq(params.slug, item.slug),
                      [
                        ui.a({ href: ui.link(route, { slug: item.slug }), 'aria-current': 'page' }, [
                          item.title,
                        ]),
                      ],
                      [ui.a({ href: ui.link(route, { slug: item.slug }) }, [item.title])],
                    ),
                  ]),
                ),
              ]),
            pending: null,
            failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Navigation is unavailable.']) },
          },
        )
      return ui.main({ id: 'main', 'data-doc-layout': '' }, [
        ui.aside({ 'data-sidebar': '' }, [
          ui.nav({ 'aria-label': label }, [ui.p({ 'data-nav-title': '' }, [label]), navigation()]),
        ]),
        ui.div({ 'data-article-column': '' }, [
          ui.details({ 'data-mobile-sections': '' }, [
            ui.summary({}, [label, ' chapters']),
            ui.nav({ 'aria-label': `${label} chapters` }, [navigation()]),
          ]),
          ui.query(
            get,
            { slug: params.slug },
            {
              ready: (article) =>
                ui.div({ 'data-article-grid': '' }, [
                  ui.article({ class: 'prose max-w-none', 'data-article': '' }, [
                    ui.a(
                      {
                        'data-breadcrumb': '',
                        href: explain ? ui.link(how, null) : ui.link(doc, { slug: 'getting-started' }),
                      },
                      [label],
                    ),
                    ui.h1({}, [article.title]),
                    ui.p({ 'data-description': '' }, [article.description]),
                    ui.details({ 'data-mobile-toc': '' }, [
                      ui.summary({}, ['On this page']),
                      ui.nav({ 'aria-label': 'On this page' }, [
                        ui.ul({}, [
                          ui.each(article.headings, 'id', (heading) =>
                            ui.li({}, [ui.a({ href: heading.href }, [heading.text])]),
                          ),
                        ]),
                      ]),
                    ]),
                    ...(explain
                      ? [
                          ui.if(op.eq(params.slug, 'pipeline'), [pipelineDiagram()], []),
                          ui.if(op.eq(params.slug, 'derived-rendering'), [renderDiagram()], []),
                        ]
                      : []),
                    article.hasCode
                      ? ui.use(CodeCopy, { props: {}, on: {} }, [ui.html(article.html)])
                      : ui.html(article.html),
                    ui.a({ href: article.source, 'data-edit': '' }, ['Edit this page on GitHub']),
                    ui.nav({ 'aria-label': 'Previous and next pages', 'data-pagination': '' }, [
                      ui.each(article.previous, 'slug', (item) =>
                        ui.a({ href: ui.link(route, { slug: item.slug }) }, [
                          ui.small({}, ['Previous']),
                          ui.span({}, [item.title]),
                        ]),
                      ),
                      ui.each(article.next, 'slug', (item) =>
                        ui.a({ href: ui.link(route, { slug: item.slug }) }, [
                          ui.small({}, ['Next']),
                          ui.span({}, [item.title]),
                        ]),
                      ),
                    ]),
                  ]),
                  ui.aside({ 'data-toc': '' }, [
                    ui.nav({ 'aria-label': 'On this page' }, [
                      ui.p({ 'data-nav-title': '' }, ['On this page']),
                      ui.ul({}, [
                        ui.each(article.headings, 'id', (heading) =>
                          ui.li({ 'data-depth': heading.depth }, [
                            ui.a({ href: heading.href }, [heading.text]),
                          ]),
                        ),
                      ]),
                    ]),
                  ]),
                ]),
              pending: null,
              failed: {
                NotFound: () => ui.h1({}, ['Page not found']),
                Unexpected: () => ui.p({ role: 'alert' }, ['Article is unavailable.']),
              },
            },
          ),
        ]),
      ])
    },
  })
export const Docs = articleView(doc, listDocs, getDoc, 'Documentation', false)
export const Chapter = articleView(chapter, listChapters, getChapter, 'How it works', true)
