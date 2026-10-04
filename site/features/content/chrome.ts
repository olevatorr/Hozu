import { ui } from '@hozu/core'
import { changelog, devtools, doc, home, how, trials } from '../../routes.ts'
import { SiteFooter } from '../../site/footer.ts'
import { SiteHeader } from '../../site/header.ts'
import { Tag } from '../../site/tag.ts'
import { getRelease } from './model.ts'

export const support = 'https://ko-fi.com/hozu'

const links = () => [
  ui.a({ href: ui.link(doc, { slug: 'getting-started' }) }, ['Docs']),
  ui.a({ href: ui.link(devtools, null) }, ['DevTools']),
  ui.a({ href: ui.link(how, null) }, ['How it works']),
  ui.a({ href: ui.link(trials, null) }, ['Trials']),
  ui.a({ href: ui.link(changelog, null) }, ['Changelog']),
  ui.a({ href: 'https://github.com/olevatorr/Hozu' }, ['GitHub']),
  ui.a({ href: 'https://www.npmjs.com/package/create-hozu' }, ['npm']),
]
export const Header = ui.view({
  render: () =>
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
              nav: ui.div({ class: 'flex gap-6' }, links()),
              menu: ui.nav(
                {
                  'aria-label': 'Mobile navigation',
                  class:
                    "grid [&>a]:flex [&>a]:items-center [&>a]:justify-between [&>a]:border-b-2 [&>a]:border-ink [&>a]:py-3 [&>a]:text-2xl [&>a]:font-black [&>a]:uppercase [&>a]:tracking-tight [&>a]:after:text-red [&>a]:after:content-['→'] [&>a:last-child]:border-b-0 [&>a:hover]:text-red",
                },
                links(),
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
