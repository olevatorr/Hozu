import type { DevPageTree, DevPreview, DevTreeNode } from '@hozu/core/ir'
import { t } from '../messages.ts'
import { tagName } from '../plain.ts'
import { held } from './api.ts'
import { h } from './dom.ts'

export interface LayersHost {
  plain: boolean
  shown(id: string): Element | null
  hover(el: Element | null): void
  pick(id: string, el: Element): void
  hold(preview: DevPreview | null): void
  close(): void
}

const expanded = new Set<string>()
const spaced = (name: string) => {
  const s = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const same = (a: DevPreview | null, b: DevPreview) => !!a && JSON.stringify(a) === JSON.stringify(b)

export function previewLabel(tree: DevPageTree | null, preview: DevPreview): string {
  const found = tree?.scenarios.find((s) => same(preview, s.preview))
  if (found) return found.label
  return 'query' in preview ? `${preview.query} ${preview.branch}` : `state ${preview.state}`
}

export function renderLayers(panel: HTMLElement, tree: DevPageTree | null, host: LayersHost) {
  const current = held()
  const search = h('input', {
    type: 'search',
    class: 'outcome',
    placeholder: t('layers.find.placeholder'),
    'aria-label': t('layers.find'),
  }) as HTMLInputElement
  const list = h('div', { class: 'layers' })
  const states = h('div', { class: 'sec' })

  const structural = (n: DevTreeNode) => ['query', 'if', 'when', 'list'].includes(n.kind)
  const label = (n: DevTreeNode, depth: number) => {
    if (depth === 0) return host.plain ? spaced(n.label.split('.').pop() ?? n.label) : n.label
    if (!host.plain || n.component) return n.label
    if (n.kind === 'element') return tagName(n.label)
    if (n.kind === 'query') return t('layers.data', { name: spaced(n.label.split('.').pop() ?? '') })
    if (n.kind === 'when')
      return t('layers.while', {
        states: n.label
          .replace(/^while /, '')
          .split(' | ')
          .map((x) => spaced(x).toLowerCase())
          .join(t('plain.or')),
      })
    if (n.kind === 'if') return t('layers.if')
    if (n.kind === 'list') return t('plain.tag.list')
    return n.label
  }

  const row = (n: DevTreeNode, depth: number, query: string): HTMLElement[] => {
    if (n.kind === 'text') return []
    const el = host.shown(n.id)
    const group = structural(n)
    const kids = n.children.filter((c) => c.kind !== 'text')
    const folded = !!n.component && !expanded.has(n.id) && !query
    const own = label(n, depth)
    const match = !query || `${own} ${n.component ?? ''}`.toLowerCase().includes(query)
    const below = folded ? [] : kids.flatMap((c) => row(c, depth + 1, query))
    if (!match && !below.length) return []
    const line = h('div', { class: `layer${el || group ? '' : ' off'}${group ? ' group' : ''}` }, [
      h('span', { class: 'indent' }),
      kids.length && n.component
        ? h(
            'button',
            {
              class: 'fold',
              type: 'button',
              'aria-label': t(folded ? 'layers.fold.show' : 'layers.fold.hide'),
              onclick: () => {
                if (expanded.has(n.id)) expanded.delete(n.id)
                else expanded.add(n.id)
                draw()
              },
            },
            [folded ? '▸' : '▾'],
          )
        : h('span', { class: 'fold' }),
      h(
        'button',
        {
          class: 'name',
          type: 'button',
          disabled: !el,
          title: el ? '' : t('layers.off.title'),
          onpointerenter: () => host.hover(el),
          onpointerleave: () => host.hover(null),
          onclick: () => {
            if (el) host.pick(n.id, el)
          },
        },
        [
          own,
          n.component && !host.plain ? h('span', { class: 'badge-ref' }, [n.component]) : null,
          n.component && host.plain ? h('span', { class: 'badge-ref' }, [t('layers.shared')]) : null,
          el || group ? null : h('span', { class: 'badge-off' }, [t('layers.off')]),
        ],
      ),
    ])
    ;(line.firstChild as HTMLElement).style.width = `${depth * 12}px`
    return [line, ...below]
  }

  const draw = () => {
    const query = search.value.trim().toLowerCase()
    list.replaceChildren(...(tree?.views ?? []).flatMap((v) => row(v, 0, query)))
    const scenarios = (tree?.scenarios ?? []).filter((s) => !query || s.label.toLowerCase().includes(query))
    states.replaceChildren(
      h('div', { class: 'label' }, [t(host.plain ? 'layers.states.plain' : 'layers.states')]),
      ...(scenarios.length
        ? scenarios.map((s) =>
            h('div', { class: `state${same(current, s.preview) ? ' on' : ''}` }, [
              h('span', {}, [s.label]),
              same(current, s.preview)
                ? h('button', { class: 'link', type: 'button', onclick: () => host.hold(null) }, [
                    t('layers.exitPreview'),
                  ])
                : h('button', { class: 'link', type: 'button', onclick: () => host.hold(s.preview) }, [
                    t('layers.preview'),
                  ]),
            ]),
          )
        : [h('div', { class: 'plain' }, [t('layers.noStates')])]),
    )
  }
  search.addEventListener('input', draw)
  draw()
  panel.hidden = false
  panel.replaceChildren(
    h('div', { class: 'head' }, [
      h('div', { class: 'kicker' }, [location.pathname]),
      h('h2', { class: 'title' }, [t('layers.title')]),
      h('button', { class: 'close', type: 'button', 'aria-label': t('common.close'), onclick: host.close }, [
        '×',
      ]),
      h('div', { class: 'find' }, [search]),
      tree?.scenarios.length
        ? h(
            'button',
            {
              class: 'jump',
              type: 'button',
              onclick: () => states.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            },
            [t(host.plain ? 'layers.jump.plain' : 'layers.jump', { count: tree.scenarios.length })],
          )
        : null,
    ]),
    tree ? list : h('div', { class: 'empty' }, [t('layers.noTree')]),
    states,
  )
}
