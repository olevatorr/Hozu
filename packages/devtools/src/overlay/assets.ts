import type { DevComponent, IsolatedUse } from '@hozu/core/ir'
import type { Theme } from '../theme.ts'
import { h } from './dom.ts'

export interface Catalogued extends DevComponent {
  previews: { name: string; use: IsolatedUse }[]
}

export interface Screens {
  pages: { route: string; path: string; previews: { name: string }[] }[]
}

export interface AssetsHost {
  plain: boolean
  theme(): Promise<Theme | null>
  stylesheets(): string[]
  /** Frames every use of the component on this page, or opens a page that has one. */
  show(component: Catalogued): void
  /** Adds "change the main component" to the request, with the note. */
  change(component: Catalogued, note: string): void
  /** Opens a page preview: the page with its queries answered by `previews.ts`. */
  screen(route: string, path: string, name: string): void
}

interface Tile {
  label: string
  use: Partial<IsolatedUse>
  preview: boolean
}

const json = async <T>(url: string): Promise<T | null> => {
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
  return res?.ok ? ((await res.json()) as T) : null
}

/** The default, each variant value on its own, then the named previews (ADR 0058 G). */
export function tilesOf(c: Catalogued): Tile[] {
  const children = c.children ? { children: c.name } : {}
  const tiles: Tile[] = [{ label: 'Default', use: { variant: {}, ...children }, preview: false }]
  for (const [dim, values] of Object.entries(c.variants))
    for (const value of values)
      if (value !== c.defaults[dim])
        tiles.push({
          label: `${dim}: ${value}`,
          use: { variant: { [dim]: value }, ...children },
          preview: false,
        })
  for (const p of c.previews) tiles.push({ label: p.name, use: { ...children, ...p.use }, preview: true })
  return tiles
}

const schemaRows = (props: Catalogued['props']) =>
  Object.entries((props.properties ?? {}) as Record<string, { type?: unknown; enum?: unknown[] }>).map(
    ([k, s]) => [k, Array.isArray(s.enum) ? s.enum.map(String).join(' | ') : String(s.type ?? 'any')],
  )

export function assetsBoard(host: AssetsHost) {
  const board = h('div', { class: 'assets', hidden: true, role: 'dialog', 'aria-label': 'Assets' })
  for (const type of ['pointerdown', 'pointermove', 'mousedown', 'click', 'dragstart'])
    board.addEventListener(type, (event) => event.stopPropagation())
  let tab: 'components' | 'styles' = 'components'
  let catalog: Catalogued[] = []
  let screens: Screens = { pages: [] }
  let query = ''
  let detail: Catalogued | null = null
  const watched = new IntersectionObserver((entries) => {
    for (const e of entries)
      if (e.isIntersecting) {
        watched.unobserve(e.target)
        void fill(e.target as HTMLIFrameElement)
      }
  })

  const fill = async (frame: HTMLIFrameElement) => {
    const id = frame.dataset.id ?? ''
    const use = frame.dataset.use ?? '{}'
    const out = await json<{ ok: boolean; html: string; problems: string[] }>(
      `/_hozu/dev/component?id=${encodeURIComponent(id)}&use=${encodeURIComponent(use)}`,
    )
    if (!out?.ok) {
      frame.replaceWith(
        h('div', { class: 'tile-problem' }, [out?.problems.join('; ') || 'Could not render this use']),
      )
      return
    }
    const links = host
      .stylesheets()
      .map((href) => `<link rel="stylesheet" href="${href.replace(/"/g, '&quot;')}">`)
      .join('')
    frame.addEventListener('load', () => {
      const body = frame.contentDocument?.body
      if (body) frame.style.height = `${Math.min(320, Math.max(72, body.scrollHeight))}px`
    })
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${links}<style>html,body{margin:0;background:transparent}body{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:16px;min-height:72px;box-sizing:border-box}</style></head><body>${out.html}</body></html>`
  }

  const frameFor = (c: Catalogued, t: Tile) => {
    const frame = h('iframe', {
      class: 'tile-frame',
      sandbox: 'allow-same-origin',
      title: `${c.id} · ${t.label}`,
      'data-id': c.id,
      'data-use': JSON.stringify(t.use),
    }) as HTMLIFrameElement
    watched.observe(frame)
    return frame
  }

  const pagesOf = (c: Catalogued) => [
    ...new Map(c.uses.flatMap((u) => u.pages).map((p) => [p.route, p])).values(),
  ]
  const where = (c: Catalogued) => {
    const pages = pagesOf(c)
    return pages.length
      ? pages.map((p) => h('span', { class: 'chip' }, [p.path]))
      : [h('span', { class: 'hint-text' }, ['Not used on a page yet'])]
  }

  const cards = new Map<string, HTMLElement>()
  const card = (c: Catalogued) => {
    const kept = cards.get(c.id)
    if (kept) return kept
    const made = cardOf(c)
    cards.set(c.id, made)
    return made
  }
  const cardOf = (c: Catalogued) =>
    h('section', { class: 'asset', 'data-component': c.id }, [
      h('div', { class: 'asset-head' }, [
        h(
          'button',
          {
            class: 'asset-name',
            type: 'button',
            onclick: () => {
              detail = c
              void render()
            },
          },
          [h('b', {}, [c.name]), host.plain ? '' : h('code', {}, [` ${c.id}`])],
        ),
        h('span', { class: 'asset-uses' }, [
          `${c.places} ${c.places === 1 ? 'place' : 'places'}`,
          ` · ${pagesOf(c).length} ${pagesOf(c).length === 1 ? 'page' : 'pages'}`,
          c.client ? ' · runs in the browser (shown as its server render)' : '',
        ]),
      ]),
      h(
        'div',
        { class: 'tiles' },
        tilesOf(c).map((t) =>
          h('figure', { class: t.preview ? 'tile preview' : 'tile' }, [
            frameFor(c, t),
            h('figcaption', {}, [t.preview ? `★ ${t.label}` : t.label]),
          ]),
        ),
      ),
    ])

  const detailView = (c: Catalogued) => {
    const note = h('textarea', {
      rows: '3',
      placeholder: c.uses.length ? `What should change in every ${c.name}?` : 'Not used on a page yet',
      'aria-label': `Change the main component ${c.name}`,
      disabled: c.uses.length === 0,
      oninput: (e) => {
        const add = (e.target as HTMLElement).parentElement?.querySelector<HTMLButtonElement>('[data-add]')
        if (add) add.disabled = !(e.target as HTMLTextAreaElement).value.trim()
      },
    }) as HTMLTextAreaElement
    return h('aside', { class: 'asset-detail' }, [
      h(
        'button',
        {
          class: 'link',
          type: 'button',
          onclick: () => {
            detail = null
            void render()
          },
        },
        ['← All assets'],
      ),
      h('h2', {}, [c.name]),
      h('p', { class: 'hint-text' }, [
        `${c.owner.kind === 'kit' ? 'Kit' : 'Feature'} ${c.owner.id}`,
        c.location ? ` · ${c.location.file}:${c.location.line}` : '',
      ]),
      h('div', { class: 'label' }, ['Variants']),
      ...(Object.keys(c.variants).length
        ? Object.entries(c.variants).map(([k, v]) => h('p', {}, [h('b', {}, [k]), `: ${v.join(', ')}`]))
        : [h('p', { class: 'hint-text' }, ['None'])]),
      h('div', { class: 'label' }, ['Properties']),
      ...(schemaRows(c.props).length
        ? schemaRows(c.props).map(([k, t]) => h('p', {}, [h('code', {}, [k!]), ` ${t}`]))
        : [h('p', { class: 'hint-text' }, ['None'])]),
      c.slots.length ? h('p', {}, [h('b', {}, ['Slots']), `: ${c.slots.join(', ')}`]) : null,
      h('div', { class: 'label' }, ['Where used']),
      h('div', { class: 'chips' }, where(c)),
      c.uses.length
        ? h('button', { class: 'act', type: 'button', onclick: () => host.show(c) }, ['Show the instances'])
        : null,
      h('div', { class: 'label' }, ['Change the main component']),
      note,
      h(
        'button',
        {
          class: 'primary',
          type: 'button',
          disabled: true,
          'data-add': true,
          onclick: () => {
            if (note.value.trim()) host.change(c, note.value.trim())
          },
        },
        ['Add to the request'],
      ),
    ])
  }

  const styles = async () => {
    const t = await host.theme()
    if (!t) return h('p', { class: 'hint-text' }, ['No theme found'])
    const own = t.own.length ? t.own : Object.keys(t.colors).slice(0, 16)
    const sorted = (table: Record<string, number>) => Object.entries(table).sort((a, b) => a[1] - b[1])
    return h('div', { class: 'styles' }, [
      h('div', { class: 'label' }, ['Colours']),
      h(
        'div',
        { class: 'swatches' },
        own.map((name) => {
          const sw = h('span', { class: 'big-swatch' })
          sw.style.background = t.colors[name] ?? ''
          return h('figure', { class: 'colour' }, [
            sw,
            h('figcaption', {}, [h('b', {}, [name]), ` ${t.colors[name]}`]),
          ])
        }),
      ),
      h('div', { class: 'label' }, ['Text sizes']),
      h(
        'div',
        { class: 'type-rows' },
        sorted(t.text).map(([name, px]) => {
          const sample = h('span', { class: 'type-sample' }, ['Aa'])
          sample.style.fontSize = `${Math.min(px, 64)}px`
          return h('div', { class: 'type-row' }, [sample, h('code', {}, [`${name} · ${px}px`])])
        }),
      ),
      h('div', { class: 'label' }, ['Corner radius']),
      h(
        'div',
        { class: 'swatches' },
        sorted(t.radius).map(([name, px]) => {
          const box = h('span', { class: 'radius-box' })
          box.style.borderRadius = `${px}px`
          return h('figure', { class: 'colour' }, [box, h('figcaption', {}, [`${name} · ${px}px`])])
        }),
      ),
      h('div', { class: 'label' }, ['Shadows']),
      h(
        'div',
        { class: 'swatches' },
        Object.entries(t.shadow).map(([name, value]) => {
          const box = h('span', { class: 'shadow-box' })
          box.style.boxShadow = value
          return h('figure', { class: 'colour' }, [box, h('figcaption', {}, [name])])
        }),
      ),
      h('p', { class: 'hint-text' }, [`Spacing unit ${t.spacing}px: p-4 is ${t.spacing * 4}px.`]),
    ])
  }

  const screensView = () =>
    screens.pages.some((p) => p.previews.length)
      ? h('div', { class: 'screens' }, [
          h('div', { class: 'label' }, ['Screens']),
          ...screens.pages.flatMap((p) =>
            p.previews.map((s) =>
              h('div', { class: 'screen' }, [
                h('code', {}, [p.path]),
                h('b', {}, [s.name]),
                p.path.includes(':')
                  ? h('span', { class: 'hint-text' }, ['open the page, then Layers → Previews'])
                  : h(
                      'button',
                      { class: 'act', type: 'button', onclick: () => host.screen(p.route, p.path, s.name) },
                      ['Open'],
                    ),
              ]),
            ),
          ),
        ])
      : null

  const listBody = () => {
    const q = query.trim().toLowerCase()
    const shown = catalog.filter((c) => !q || c.id.toLowerCase().includes(q))
    const owners = [...new Set(shown.map((c) => c.owner.id))]
    return h('div', { class: 'assets-body' }, [
      ...owners.map((o) =>
        h('div', { class: 'owner' }, [
          h('div', { class: 'label' }, [`${o} · ${shown.filter((c) => c.owner.id === o).length}`]),
          ...shown.filter((c) => c.owner.id === o).map(card),
        ]),
      ),
      shown.length ? null : h('p', { class: 'hint-text' }, ['No components match']),
      q ? null : screensView(),
    ])
  }
  const search = h('input', {
    type: 'search',
    class: 'outcome',
    placeholder: 'Find a component…',
    'aria-label': 'Find a component',
    oninput: (e) => {
      query = (e.target as HTMLInputElement).value
      board.querySelector(':scope > .assets-body')?.replaceWith(listBody())
    },
  }) as HTMLInputElement

  const render = async () => {
    search.value = query
    const head = h('header', { class: 'assets-head' }, [
      h('b', {}, ['Assets']),
      h('div', { class: 'seg' }, [
        h(
          'button',
          {
            class: 'mode',
            type: 'button',
            'aria-pressed': String(tab === 'components'),
            onclick: () => {
              tab = 'components'
              void render()
            },
          },
          ['Components'],
        ),
        h(
          'button',
          {
            class: 'mode',
            type: 'button',
            'aria-pressed': String(tab === 'styles'),
            onclick: () => {
              tab = 'styles'
              void render()
            },
          },
          ['Styles'],
        ),
      ]),
      tab === 'components' && !detail ? search : null,
      h('button', { class: 'act', type: 'button', onclick: () => close() }, ['Close']),
    ])
    if (tab === 'styles') {
      board.replaceChildren(head, h('div', { class: 'assets-body' }, [await styles()]))
      return
    }
    if (detail) {
      board.replaceChildren(
        head,
        h('div', { class: 'assets-body detail' }, [
          h('div', { class: 'assets-main' }, [card(detail)]),
          detailView(detail),
        ]),
      )
      return
    }
    board.replaceChildren(head, listBody())
  }

  const open = async () => {
    board.hidden = false
    board.replaceChildren(h('p', { class: 'hint-text' }, ['Loading the components…']))
    catalog = (await json<Catalogued[]>('/_hozu/dev/components')) ?? []
    cards.clear()
    screens = (await json<Screens>('/_hozu/dev/previews')) ?? { pages: [] }
    await render()
  }
  const close = () => {
    board.hidden = true
    detail = null
  }
  return {
    board,
    open,
    close,
    isOpen: () => !board.hidden,
    catalog: () => json<Catalogued[]>('/_hozu/dev/components'),
  }
}
