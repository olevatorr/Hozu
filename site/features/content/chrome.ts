import { ui } from '@hozu/core'
import { changelog, doc, home, how, trials } from '../../routes.ts'

const links = () => [
  ui.a({ href: ui.link(doc, { slug: 'getting-started' }) }, ['Docs']),
  ui.a({ href: ui.link(how, null) }, ['How it works']),
  ui.a({ href: ui.link(trials, null) }, ['Trials']),
  ui.a({ href: ui.link(changelog, null) }, ['Changelog']),
  ui.a({ href: 'https://github.com/olevatorr/Hozu' }, ['GitHub']),
  ui.a({ href: 'https://www.npmjs.com/package/@hozu/cli' }, ['npm']),
]
export const Header = ui.view({
  render: () =>
    ui.header({ 'data-site-header': '' }, [
      ui.a({ href: '#main', 'data-skip': '' }, ['Skip to content']),
      ui.div({ 'data-header': '' }, [
        ui.a({ href: ui.link(home, null), 'data-brand': '', 'aria-label': 'Hozu home' }, [
          ui.img({
            src: ui.asset(new URL('../../assets/logo.png', import.meta.url)),
            width: 28,
            height: 28,
            alt: '',
          }),
          'Hozu',
        ]),
        ui.nav({ 'aria-label': 'Main navigation', 'data-desktop-nav': '' }, links()),
        ui.details({ 'data-mobile-nav': '' }, [
          ui.summary({}, ['Menu']),
          ui.nav({ 'aria-label': 'Mobile navigation' }, links()),
        ]),
      ]),
    ]),
})
export const Footer = ui.view({
  render: () =>
    ui.footer({ 'data-footer': '' }, [
      ui.div({}, [
        ui.p({}, ['Hozu (ほぞ). A precise fit between intent and implementation.']),
        ui.p({}, ['Built with Hozu. HTML first, with room to explore.']),
      ]),
      ui.a({ href: 'https://github.com/olevatorr/Hozu/blob/main/LICENSE' }, ['MIT license']),
    ]),
})
