import { part, type RouteDecl, ui } from '@hozu/core'
import { changelog, chapter, devtools, doc, home, how, trial, trials } from '../../routes.ts'
import { SiteFooter } from '../../site/footer.ts'
import { SiteHeader } from '../../site/header.ts'
import { Tag } from '../../site/tag.ts'
import { getRelease } from './model.ts'

export const support = 'https://ko-fi.com/hozu'

const marked = 'aria-[current]:text-red'
const links = part((current: (route: RouteDecl<any, any>) => boolean) => [
  ...(
    [
      [ui.link(doc, { slug: 'getting-started' }), 'Docs', current(doc)],
      [ui.link(devtools, null), 'DevTools', current(devtools)],
      [ui.link(how, null), 'How it works', current(how) || current(chapter)],
      [ui.link(trials, null), 'Trials', current(trials) || current(trial)],
      [ui.link(changelog, null), 'Changelog', current(changelog)],
    ] as const
  ).map(([href, label, here]) => ui.a({ href, 'aria-current': here, class: marked }, [label])),
  ui.a({ href: 'https://github.com/olevatorr/Hozu' }, ['GitHub']),
  ui.a({ href: 'https://www.npmjs.com/package/create-hozu' }, ['npm']),
])
export const Header = ui.view({
  render: ({ current }) =>
    ui.query(
      getRelease,
      {},
      {
        ready: (release) =>
          ui.use(SiteHeader, {
            props: { version: release.version },
            slots: {
              brand: ui.a(
                {
                  href: ui.link(home, null),
                  'aria-label': 'Hozu home',
                  class: 'flex items-center gap-2 font-black',
                },
                [
                  ui.img({
                    src: ui.asset(new URL('../../assets/logo.png', import.meta.url)),
                    width: 28,
                    height: 28,
                    alt: '',
                  }),
                  'HOZU',
                  ui.use(Tag, { variant: { tone: 'red' } }, [release.version]),
                ],
              ),
              nav: ui.div({ class: 'flex gap-6' }, links(current)),
              menu: ui.nav(
                {
                  'aria-label': 'Mobile navigation',
                  class:
                    "grid [&>a]:flex [&>a]:items-center [&>a]:justify-between [&>a]:border-b-2 [&>a]:border-ink [&>a]:py-3 [&>a]:text-2xl [&>a]:font-black [&>a]:uppercase [&>a]:tracking-tight [&>a]:after:text-red [&>a]:after:content-['→'] [&>a:last-child]:border-b-0 [&>a:hover]:text-red motion-safe:group-open:[&>a]:animate-menu-item [&>a:nth-child(2)]:[animation-delay:40ms] [&>a:nth-child(3)]:[animation-delay:80ms] [&>a:nth-child(4)]:[animation-delay:120ms] [&>a:nth-child(5)]:[animation-delay:160ms] [&>a:nth-child(6)]:[animation-delay:200ms] [&>a:nth-child(7)]:[animation-delay:240ms]",
                },
                links(current),
              ),
            },
          }),
        pending: null,
        failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Header unavailable.']) },
      },
    ),
})
export const Footer = ui.view({
  render: () =>
    ui.use(SiteFooter, {}, [
      ui.a(
        {
          href: support,
          class: 'mb-8 flex items-center gap-4 bg-paper p-4 text-ink no-underline hover:bg-red',
          'data-support': true,
        },
        [
          ui.img({
            src: ui.asset(new URL('../../assets/peg/peg-cup.svg', import.meta.url)),
            width: 64,
            height: 80,
            alt: '',
            class: 'shrink-0',
          }),
          ui.span({}, [
            ui.span({ class: 'block font-black uppercase' }, ['Buy Peg a coffee']),
            'Hozu is free and open source, made by one person. If it saves you time, a coffee keeps it going.',
          ]),
        ],
      ),
      ui.p({ class: 'font-black uppercase' }, ['Hozu (ほぞ): the tenon that makes a joint fit.']),
      ui.p({}, [
        'Built with Hozu and its own component kit. ',
        ui.a({ href: 'https://github.com/olevatorr/Hozu/blob/main/LICENSE', class: 'underline' }, [
          'MIT license',
        ]),
      ]),
    ]),
})
