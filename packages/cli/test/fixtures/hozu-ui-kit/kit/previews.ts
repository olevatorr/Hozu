import { ui } from '@hozu/core'
import { previews } from '@hozu/core/preview'
import { Badge } from './badge.ts'
import { Button } from './button.ts'
import { Card } from './card.ts'
import { Dialog } from './dialog.ts'
import { Field } from './field.ts'
import { Icon } from './icon.ts'
import { check, download, inbox, pencil, plus, search, trash } from './icons/lucide.ts'
import { Input } from './input.ts'
import { DropdownMenu, MenuItem } from './menu.ts'
import { Metric } from './metric.ts'
import { NavBar, NavLink } from './nav.ts'
import { PageHeader } from './page-header.ts'
import { EmptyState, Notice, Problem } from './states.ts'
import { Table, Td, Th, Tr } from './table.ts'

const row = 'flex flex-wrap items-center gap-3'

export default previews((p) => [
  p.example(Table, 'Orders', () =>
    ui.use(
      Table,
      {
        slots: {
          head: ui.use(Tr, {}, [
            ui.use(Th, {}, ['Order']),
            ui.use(Th, {}, ['Customer']),
            ui.use(Th, {}, ['Status']),
            ui.use(Th, { variant: { align: 'end' } }, ['Total']),
          ]),
        },
      },
      [
        ui.use(Tr, {}, [
          ui.use(Td, { variant: { emphasis: 'strong' } }, ['#1042']),
          ui.use(Td, {}, ['Ada Lovelace']),
          ui.use(Td, {}, [ui.use(Badge, { props: { tone: 'success', label: 'Paid' } })]),
          ui.use(Td, { variant: { align: 'end' } }, ['$120.00']),
        ]),
        ui.use(Tr, {}, [
          ui.use(Td, { variant: { emphasis: 'strong' } }, ['#1041']),
          ui.use(Td, {}, ['Grace Hopper']),
          ui.use(Td, {}, [ui.use(Badge, { props: { tone: 'warning', label: 'Pending' } })]),
          ui.use(Td, { variant: { align: 'end' } }, ['$48.50']),
        ]),
        ui.use(Tr, {}, [
          ui.use(Td, { variant: { emphasis: 'strong' } }, ['#1040']),
          ui.use(Td, {}, ['Linus Torvalds']),
          ui.use(Td, {}, [ui.use(Badge, { props: { tone: 'danger', label: 'Refunded' } })]),
          ui.use(Td, { variant: { align: 'end' } }, ['$9.99']),
        ]),
      ],
    ),
  ),
  p.example(DropdownMenu, 'Row actions', () =>
    ui.use(DropdownMenu, { props: { id: 'row-actions', label: 'Actions' } }, [
      ui.use(MenuItem, {}, ['Edit']),
      ui.use(MenuItem, {}, ['Duplicate']),
      ui.use(MenuItem, { variant: { intent: 'destructive' } }, ['Delete']),
    ]),
  ),
  p.example(NavBar, 'Tabs', () =>
    ui.use(NavBar, { props: { label: 'Sections' } }, [
      ui.use(NavLink, { props: { href: '#overview', current: true } }, ['Overview']),
      ui.use(NavLink, { props: { href: '#orders', count: 12 } }, ['Orders']),
      ui.use(NavLink, { props: { href: '#settings' } }, ['Settings']),
    ]),
  ),
  p.example(Dialog, 'Confirm delete', () =>
    ui.use(
      Dialog,
      {
        variant: { size: 'sm' },
        props: { id: 'confirm-delete', title: 'Delete this order?', description: 'It cannot be undone.', open: true },
        slots: {
          footer: ui.div({ class: row }, [
            ui.use(Button, { props: { commandfor: 'confirm-delete', command: 'close' } }, ['Cancel']),
            ui.use(Button, { variant: { intent: 'destructive' } }, ['Delete']),
          ]),
        },
      },
      [ui.p({}, ['Order #1042 and its invoice are removed.'])],
    ),
  ),
  p.example(Field, 'Email with a hint and an error', () =>
    ui.use(Field, {
      props: {
        for: 'email',
        label: 'Email',
        hint: 'We send the receipt here.',
        error: 'Enter an email address',
        errorId: 'email-error',
      },
      slots: {
        control: ui.use(Input, {
          props: { id: 'email', name: 'email', type: 'email', value: 'ada@', invalid: true, describedby: 'email-error' },
        }),
      },
    }),
  ),
  p.example(Card, 'With actions', () =>
    ui.use(
      Card,
      {
        props: { title: 'Team', description: 'Three people can edit.' },
        slots: { actions: ui.use(Button, { variant: { size: 'sm' } }, ['Invite']) },
      },
      [ui.p({}, ['Ada, Grace and Linus'])],
    ),
  ),
  p.example(Metric, 'Revenue and orders', () =>
    ui.div({ class: row }, [
      ui.use(Metric, { props: { label: 'Revenue', value: '$12,480', delta: '+8%', trend: 'up', period: 'vs last month' } }),
      ui.use(Metric, { props: { label: 'Orders', value: '312', delta: '-3%', trend: 'down', period: 'vs last month' } }),
    ]),
  ),
  p.example(PageHeader, 'With actions', () =>
    ui.use(PageHeader, {
      props: { title: 'Orders', description: 'Every order from the shop, newest first.' },
      slots: {
        actions: ui.div({ class: row }, [
          ui.use(Button, { slots: { icon: ui.use(Icon, { props: { d: download } }) } }, ['Export']),
          ui.use(Button, { variant: { intent: 'primary' }, slots: { icon: ui.use(Icon, { props: { d: plus } }) } }, ['New order']),
        ]),
      },
    }),
  ),
  p.example(EmptyState, 'No orders yet', () =>
    ui.use(EmptyState, {
      props: { title: 'No orders yet', body: 'Orders show here once a customer checks out.' },
      slots: { action: ui.use(Button, { variant: { intent: 'primary' } }, ['Share the shop']) },
    }),
  ),
  p.example(Problem, 'Orders failed', () =>
    ui.use(Problem, {
      props: { title: 'Orders could not be loaded', body: 'Check the connection and try again.' },
      slots: { action: ui.use(Button, {}, ['Try again']) },
    }),
  ),
  p.example(Notice, 'Saved', () => ui.use(Notice, { variant: { placement: 'inline' }, props: { message: 'Order saved' } })),
  p.example(Icon, 'A row of icons', () =>
    ui.div({ class: row }, [
      ui.use(Icon, { variant: { size: 'md' }, props: { d: search } }),
      ui.use(Icon, { variant: { size: 'md' }, props: { d: plus } }),
      ui.use(Icon, { variant: { size: 'md' }, props: { d: pencil } }),
      ui.use(Icon, { variant: { size: 'md' }, props: { d: check } }),
      ui.use(Icon, { variant: { size: 'md' }, props: { d: trash } }),
      ui.use(Icon, { variant: { size: 'md' }, props: { d: inbox } }),
    ]),
  ),
])
