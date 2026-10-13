import type { DevComponent, DevIcons, IsolatedUse } from '@hozu/core/ir'
import { t } from '../messages.ts'
import type { Addition } from '../prompt.ts'
import type { Theme } from '../theme.ts'
import { h, read, write } from './dom.ts'
import type { Carried } from './drop.ts'

export type Example = NonNullable<Addition['example']>
export type ChosenIcon = NonNullable<Addition['icon']>

export interface Catalogued extends DevComponent {
  previews: { name: string; use: IsolatedUse }[]
  examples?: Example[]
}

export interface Official {
  kit: string | null
  version: string | null
  partial: boolean
  available: { name: string; file: string; installed: boolean }[]
  parts?: Record<string, string[]>
}

type Available = Official['available'][number]

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
  /** The part selected on the page, named for the person, or null. */
  selection(): Promise<string | null>
  /** Adds "place this component at the selected part" to the request (ADR 0089 P5). */
  place(add: Addition, note: string): void
  /** Opens a page preview: the page with its queries answered by `previews.ts`. */
  screen(route: string, path: string, name: string): void
  /** Follows a press on `handle` as a drag of the component onto the page. */
  drag(down: PointerEvent, handle: HTMLElement, carried: Carried, label: string): void
}

const dockKey = 'hozu-devtools:assets-docked'

/** `arrow-up` and `arrowUp` for what the person typed: Lucide's file name and the app's export name. */
export function lucideNames(typed: string): { lucide: string; name: string } | null {
  const lucide = typed
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(lucide)) return null
  return { lucide, name: lucide.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()) }
}

/** The components used only inside another, by the parent's id (the kit catalog's `parts`). */
export function partsOf(catalog: Catalogued[], official: Official): Map<string, Catalogued[]> {
  const out = new Map<string, Catalogued[]>()
  const kit = official.kit
  if (!kit) return out
  const byId = new Map(catalog.map((c) => [c.id, c]))
  for (const [parent, names] of Object.entries(official.parts ?? {})) {
    if (!byId.has(`${kit}.${parent}`)) continue
    const found = names.flatMap((n) => byId.get(`${kit}.${n}`) ?? [])
    if (found.length) out.set(`${kit}.${parent}`, found)
  }
  return out
}

const svgOf = (d: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d.replace(/[<>"&]/g, '')}"/></svg>`

export const dragLabel = (name: string, variant: Record<string, string>) =>
  [name, ...Object.entries(variant).map(([dim, value]) => `${dim}: ${value}`)].join(' · ')

interface Tile {
  label: string
  use: Partial<IsolatedUse>
  preview: boolean
  example?: Example
}

const json = async <T>(url: string): Promise<T | null> => {
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
  return res?.ok ? ((await res.json()) as T) : null
}

/** The default, each variant value on its own, then the named previews (ADR 0058 G). */
/** The text a component that takes children shows in a preview: a glyph for an icon-sized variant, else its name. */
export const placeholderFor = (name: string, variant: Record<string, string>) =>
  Object.values(variant).includes('icon') ? '★' : name

export function tilesOf(c: Catalogued): Tile[] {
  const children = (variant: Record<string, string>) =>
    c.children ? { children: placeholderFor(c.name, { ...c.defaults, ...variant }) } : {}
  const tiles: Tile[] = [
    ...(c.examples ?? []).map((example) => ({ label: example.name, use: {}, preview: false, example })),
    { label: t('assets.default'), use: { variant: {}, ...children({}) }, preview: false },
  ]
  for (const [dim, values] of Object.entries(c.variants))
    for (const value of values)
      if (value !== c.defaults[dim])
        tiles.push({
          label: `${dim}: ${value}`,
          use: { variant: { [dim]: value }, ...children({ [dim]: value }) },
          preview: false,
        })
  for (const p of c.previews)
    tiles.push({ label: p.name, use: { ...children(p.use.variant), ...p.use }, preview: true })
  return tiles
}

export const installCommand = (kit: string, name: string) =>
  `npx hozu add component ${kit} ${name} --from official`

const requiredProps = (props: Catalogued['props']) => {
  const fields = (props.properties ?? {}) as Record<string, { default?: unknown }>
  return ((props.required ?? []) as string[]).filter((k) => fields[k]?.default === undefined)
}

/** A part sized by container queries has no width of its own, so in a centred preview it shrinks to its padding: it and the top-level part holding it get room. */
export function roomForContainers(doc: Document) {
  const view = doc.defaultView
  if (!view) return
  for (const top of [...doc.body.children] as HTMLElement[]) {
    const containers = [top, ...top.querySelectorAll<HTMLElement>('*')].filter(
      (el) => view.getComputedStyle(el).containerType !== 'normal',
    )
    if (!containers.length) continue
    top.style.width = '100%'
    for (const el of containers) {
      el.style.flex = '1 1 200px'
      el.style.minWidth = '0'
    }
  }
}

const schemaRows = (props: Catalogued['props']) =>
  Object.entries((props.properties ?? {}) as Record<string, { type?: unknown; enum?: unknown[] }>).map(
    ([k, s]) => [k, Array.isArray(s.enum) ? s.enum.map(String).join(' | ') : String(s.type ?? 'any')],
  )

export function assetsBoard(host: AssetsHost) {
  const board = h('div', { class: 'assets', hidden: true, role: 'dialog', 'aria-label': t('assets.title') })
  let docked = read<boolean>(dockKey, true) !== false
  const setDocked = (value: boolean) => {
    docked = value
    board.classList.toggle('docked', docked)
    write(dockKey, docked)
    const toggle = board.querySelector('[data-dock]')
    if (toggle) toggle.textContent = t(docked ? 'assets.undock' : 'assets.dock')
  }
  board.classList.toggle('docked', docked)
  for (const type of ['pointerdown', 'pointermove', 'mousedown', 'click', 'dragstart'])
    board.addEventListener(type, (event) => event.stopPropagation())
  let tab: 'components' | 'styles' = 'components'
  let catalog: Catalogued[] = []
  let official: Official = { kit: null, version: null, partial: false, available: [], parts: {} }
  let icons: DevIcons = {}
  let parts = new Map<string, Catalogued[]>()
  const chosenIcons = new Map<string, ChosenIcon>()
  let pending: Available | null = null
  let selected: string | null = null
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
    const example = frame.dataset.example
    const out = await json<{ ok: boolean; html: string; problems: string[] }>(
      `/_hozu/dev/component?id=${encodeURIComponent(id)}&${
        example === undefined ? `use=${encodeURIComponent(use)}` : `example=${encodeURIComponent(example)}`
      }`,
    )
    if (!out?.ok) {
      frame.replaceWith(
        h('div', { class: 'tile-problem' }, [out?.problems.join('; ') || t('assets.renderFailed')]),
      )
      return
    }
    const links = host
      .stylesheets()
      .map((href) => `<link rel="stylesheet" href="${href.replace(/"/g, '&quot;')}">`)
      .join('')
    const fit = () => {
      const body = frame.contentDocument?.body
      if (body) frame.style.height = `${Math.min(320, Math.max(72, body.scrollHeight))}px`
    }
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument
      if (doc) {
        roomForContainers(doc)
        for (const dialog of doc.querySelectorAll<HTMLDialogElement>('body > dialog')) {
          dialog.setAttribute('open', '')
          dialog.style.position = 'static'
        }
      }
      const tile = frame.closest('.tile')
      if (doc && tile && doc.documentElement.scrollWidth > frame.clientWidth + 2) {
        tile.classList.add('wide')
        requestAnimationFrame(fit)
      }
      fit()
    })
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${links}<style>html,body{margin:0;background:transparent;overflow:hidden}body{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:16px;min-height:72px;box-sizing:border-box}</style></head><body>${out.html}</body></html>`
  }

  const withIcon = (id: string, use: Partial<IsolatedUse>): Partial<IsolatedUse> => {
    const picker = icons[id]
    const sample = picker?.icons.find((i) => i.d)
    const icon = chosenIcons.get(id) ?? (sample && picker ? { prop: picker.prop, d: sample.d } : undefined)
    return icon?.d ? { ...use, props: { ...use.props, [icon.prop]: icon.d } } : use
  }

  const frameFor = (c: Catalogued, tile: Tile) => {
    const frame = h('iframe', {
      class: 'tile-frame',
      sandbox: 'allow-same-origin',
      title: `${c.id} · ${tile.label}`,
      'data-id': c.id,
      'data-use': JSON.stringify(withIcon(c.id, tile.use)),
      'data-example': tile.example?.name,
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
      : [h('span', { class: 'hint-text' }, [t('assets.unused')])]
  }

  const cards = new Map<string, HTMLElement>()
  const card = (c: Catalogued) => {
    const kept = cards.get(c.id)
    if (kept) return kept
    const made = cardOf(c)
    cards.set(c.id, made)
    return made
  }
  const isOfficial = (c: Catalogued) => c.owner.kind === 'kit' && c.owner.id === official.kit
  const carriedOf = (c: Catalogued, variant: Record<string, string>, example?: Example): Carried => {
    const icon = example ? undefined : chosenIcons.get(c.id)
    return {
      component: c.id,
      variant,
      install: null,
      file: c.location?.file ?? null,
      props: requiredProps(c.props),
      children: Boolean(c.children),
      ...(example ? { example } : {}),
      ...(icon ? { icon } : {}),
    }
  }

  const choose = (c: Catalogued, icon: ChosenIcon) => {
    chosenIcons.set(c.id, icon)
    const el = cards.get(c.id)
    if (!el) return
    for (const cell of el.querySelectorAll<HTMLElement>('[data-icon]'))
      cell.setAttribute('aria-pressed', String(cell.dataset.icon === icon.name))
    const shown = el.querySelector('[data-icon-chosen]')
    if (shown)
      shown.textContent = icon.lucide
        ? t('assets.icons.missing', { name: icon.lucide, file: icon.file })
        : t('assets.icons.chosen', { name: icon.name })
    for (const frame of el.querySelectorAll<HTMLIFrameElement>('.tile:not(.example) .tile-frame')) {
      const use = JSON.parse(frame.dataset.use ?? '{}') as Partial<IsolatedUse>
      frame.dataset.use = JSON.stringify(withIcon(c.id, use))
      void fill(frame)
    }
  }

  const pickerOf = (c: Catalogued) => {
    const picker = icons[c.id]
    if (!picker) return null
    const home = picker.files.find((f) => f.includes('lucide')) ?? picker.files[0] ?? ''
    const cells = picker.icons.map((icon) => {
      const cell = h(
        'button',
        {
          class: 'icon-cell',
          type: 'button',
          title: `${icon.name} · ${icon.file}`,
          'data-icon': icon.name,
          'aria-pressed': String(chosenIcons.get(c.id)?.name === icon.name),
          onclick: () => choose(c, { prop: picker.prop, name: icon.name, file: icon.file, d: icon.d }),
          onpointerdown: (e) => {
            const pick: ChosenIcon = { prop: picker.prop, name: icon.name, file: icon.file, d: icon.d }
            host.drag(
              e as PointerEvent,
              e.currentTarget as HTMLElement,
              { ...carriedOf(c, {}), icon: pick },
              `${c.name} · ${icon.name}`,
            )
          },
        },
        [h('span', { class: 'icon-name' }, [icon.name])],
      )
      cell.insertAdjacentHTML('afterbegin', svgOf(icon.d))
      return cell
    })
    const find = h('input', {
      type: 'search',
      class: 'outcome',
      placeholder: t('assets.icons.find.placeholder'),
      'aria-label': t('assets.icons.find'),
      oninput: (e) => {
        const q = (e.target as HTMLInputElement).value.trim().toLowerCase()
        for (const cell of cells) cell.hidden = !!q && !(cell.dataset.icon ?? '').toLowerCase().includes(q)
      },
    })
    const other = h('input', {
      type: 'text',
      class: 'outcome',
      placeholder: t('assets.icons.other.placeholder'),
      'aria-label': t('assets.icons.other'),
      'data-icon-other': true,
    }) as HTMLInputElement
    const useOther = () => {
      const names = lucideNames(other.value)
      if (!names) return
      const found = picker.icons.find((i) => i.name === names.name)
      choose(
        c,
        found
          ? { prop: picker.prop, name: found.name, file: found.file, d: found.d }
          : { prop: picker.prop, name: names.name, file: home, lucide: names.lucide },
      )
    }
    other.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') useOther()
    })
    const now = chosenIcons.get(c.id)
    return h('div', { class: 'icon-picker', 'data-picker': c.id }, [
      h('div', { class: 'label' }, [t('assets.icons', { count: picker.icons.length })]),
      find,
      h('div', { class: 'icon-grid' }, cells),
      h('p', { class: 'hint-text', 'data-icon-chosen': true }, [
        now
          ? now.lucide
            ? t('assets.icons.missing', { name: now.lucide, file: now.file })
            : t('assets.icons.chosen', { name: now.name })
          : t('assets.icons.none'),
      ]),
      h('div', { class: 'icon-other' }, [
        other,
        h('button', { class: 'act', type: 'button', 'data-icon-use': true, onclick: useOther }, [
          t('assets.icons.use'),
        ]),
        h('a', { href: 'https://lucide.dev/icons', target: '_blank', rel: 'noopener', class: 'link' }, [
          t('assets.icons.browse'),
        ]),
      ]),
    ])
  }

  const partsLine = (c: Catalogued) => {
    const list = parts.get(c.id)
    if (!list) return null
    return h('p', { class: 'asset-parts', 'data-parts': c.id }, [
      `${t('assets.parts')} `,
      ...list.map((part) =>
        h(
          'button',
          {
            class: 'chip-button',
            type: 'button',
            'data-part': part.id,
            onclick: () => {
              detail = part
              pending = null
              void render()
            },
          },
          [part.name],
        ),
      ),
      ` ${t('assets.parts.inside', { name: c.name })}`,
    ])
  }

  const cardOf = (c: Catalogued) =>
    h('section', { class: isOfficial(c) ? 'asset official' : 'asset', 'data-component': c.id }, [
      h('div', { class: 'asset-head' }, [
        isOfficial(c) ? h('span', { class: 'chip' }, [t('assets.official.mark')]) : null,
        h(
          'button',
          {
            class: 'asset-name',
            type: 'button',
            onclick: () => {
              detail = c
              pending = null
              void render()
            },
          },
          [h('b', {}, [c.name]), host.plain ? '' : h('code', {}, [` ${c.id}`])],
        ),
        h('span', { class: 'asset-uses' }, [
          t(c.places === 1 ? 'assets.places.one' : 'assets.places.other', { count: c.places }),
          ` · ${t(pagesOf(c).length === 1 ? 'assets.pages.one' : 'assets.pages.other', { count: pagesOf(c).length })}`,
          c.client ? ` · ${t('assets.client')}` : '',
        ]),
      ]),
      h(
        'div',
        { class: 'tiles' },
        tilesOf(c).map((tile) =>
          h(
            'figure',
            {
              class: tile.example ? 'tile example' : tile.preview ? 'tile preview' : 'tile',
              title: t('assets.drag.title'),
              'data-drag': c.id,
              'data-tile': tile.label,
              'data-example': tile.example?.name,
              onpointerdown: (e) => {
                const variant = tile.use.variant ?? {}
                host.drag(
                  e as PointerEvent,
                  e.currentTarget as HTMLElement,
                  carriedOf(c, variant, tile.example),
                  tile.example ? `${c.name} · ${tile.example.name}` : dragLabel(c.name, variant),
                )
              },
            },
            [
              frameFor(c, tile),
              h('figcaption', {}, [
                tile.example
                  ? t('assets.example', { name: tile.label })
                  : tile.preview
                    ? `★ ${tile.label}`
                    : tile.label,
              ]),
            ],
          ),
        ),
      ),
      partsLine(c),
      pickerOf(c),
    ])

  const placeSection = (target: {
    id: string
    name: string
    variants: Record<string, string[]>
    defaults: Record<string, string>
    install: string | null
    file: string | null
    props?: string[]
    children?: boolean
  }) => {
    const chosen: Record<string, string> = {}
    const variant = () =>
      Object.fromEntries(Object.entries(chosen).filter(([dim, value]) => value !== target.defaults[dim]))
    const carried = (): Carried => {
      const icon = chosenIcons.get(target.id)
      return {
        component: target.id,
        variant: variant(),
        install: target.install,
        file: target.file,
        ...(target.props ? { props: target.props } : {}),
        ...(target.children !== undefined ? { children: target.children } : {}),
        ...(icon ? { icon } : {}),
      }
    }
    const selects = Object.entries(target.variants).map(([dim, values]) =>
      h('label', { class: 'place-variant' }, [
        `${dim} `,
        h(
          'select',
          {
            'data-dim': dim,
            onchange: (e) => {
              chosen[dim] = (e.target as HTMLSelectElement).value
            },
          },
          values.map((v) => h('option', { value: v, selected: v === target.defaults[dim] }, [v])),
        ),
      ]),
    )
    const handle = h(
      'div',
      {
        class: 'drag-handle',
        title: t('assets.drag.title'),
        'data-drag': target.id,
        onpointerdown: (e) =>
          host.drag(
            e as PointerEvent,
            e.currentTarget as HTMLElement,
            carried(),
            dragLabel(target.name, variant()),
          ),
      },
      [`⠿ ${t('assets.drag')}`],
    )
    if (!selected)
      return [
        h('div', { class: 'label' }, [t('assets.place')]),
        h('p', { class: 'hint-text', 'data-place-first': true }, [t('assets.place.first')]),
        h('p', { class: 'hint-text' }, [t('assets.place.drag')]),
        ...selects,
        handle,
      ]
    const note = h('textarea', {
      rows: '2',
      placeholder: t('assets.place.placeholder'),
      'aria-label': t('assets.place.aria'),
    }) as HTMLTextAreaElement
    return [
      h('div', { class: 'label' }, [t('assets.place')]),
      h('p', {}, [t('assets.place.at', { part: selected })]),
      ...selects,
      note,
      h(
        'div',
        { class: 'place-actions' },
        (['before', 'after', 'inside'] as const).map((position) =>
          h(
            'button',
            {
              class: 'act',
              type: 'button',
              'data-place': position,
              onclick: () => host.place({ ...carried(), position }, note.value.trim()),
            },
            [t(`assets.place.${position}`)],
          ),
        ),
      ),
      handle,
    ]
  }

  const back = () =>
    h(
      'button',
      {
        class: 'link',
        type: 'button',
        onclick: () => {
          detail = null
          pending = null
          void render()
        },
      },
      [t('assets.back')],
    )

  const pendingView = (a: Available) => {
    const kit = official.kit ?? 'ui'
    const install = installCommand(kit, a.name)
    return h('aside', { class: 'asset-detail' }, [
      back(),
      h('h2', {}, [a.name]),
      h('p', { class: 'hint-text' }, [t('assets.official.notInstalled', { file: `${kit}/${a.file}` })]),
      h('code', { class: 'command' }, [install]),
      ...placeSection({
        id: `${kit}.${a.name}`,
        name: a.name,
        variants: {},
        defaults: {},
        install,
        file: `${kit}/${a.file}`,
      }),
    ])
  }

  const detailView = (c: Catalogued) => {
    const note = h('textarea', {
      rows: '3',
      placeholder: t('assets.change.placeholder', { name: c.name }),
      'aria-label': t('assets.change.aria', { name: c.name }),
      oninput: (e) => {
        const add = (e.target as HTMLElement).parentElement?.querySelector<HTMLButtonElement>('[data-add]')
        if (add) add.disabled = !(e.target as HTMLTextAreaElement).value.trim()
      },
    }) as HTMLTextAreaElement
    return h('aside', { class: 'asset-detail' }, [
      back(),
      h('h2', {}, [c.name]),
      h('p', { class: 'hint-text' }, [
        t(c.owner.kind === 'kit' ? 'assets.owner.kit' : 'assets.owner.feature', { id: c.owner.id }),
        c.location ? ` · ${c.location.file}:${c.location.line}` : '',
      ]),
      h('div', { class: 'label' }, [t('assets.variants')]),
      ...(Object.keys(c.variants).length
        ? Object.entries(c.variants).map(([k, v]) => h('p', {}, [h('b', {}, [k]), `: ${v.join(', ')}`]))
        : [h('p', { class: 'hint-text' }, [t('assets.none')])]),
      h('div', { class: 'label' }, [t('assets.properties')]),
      ...(schemaRows(c.props).length
        ? schemaRows(c.props).map(([k, type]) => h('p', {}, [h('code', {}, [k!]), ` ${type}`]))
        : [h('p', { class: 'hint-text' }, [t('assets.none')])]),
      c.slots.length ? h('p', {}, [h('b', {}, [t('assets.slots')]), `: ${c.slots.join(', ')}`]) : null,
      h('div', { class: 'label' }, [t('assets.whereUsed')]),
      h('div', { class: 'chips' }, where(c)),
      c.uses.length
        ? h('button', { class: 'act', type: 'button', onclick: () => host.show(c) }, [t('assets.show')])
        : null,
      ...placeSection({
        id: c.id,
        name: c.name,
        variants: c.variants,
        defaults: c.defaults,
        install: null,
        file: c.location?.file ?? null,
        props: requiredProps(c.props),
        children: Boolean(c.children),
      }),
      h('div', { class: 'label' }, [t('assets.change')]),
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
        [t('assets.add')],
      ),
    ])
  }

  const styles = async () => {
    const theme = await host.theme()
    if (!theme) return h('p', { class: 'hint-text' }, [t('assets.noTheme')])
    const own = theme.own.length ? theme.own : Object.keys(theme.colors).slice(0, 16)
    const sorted = (table: Record<string, number>) => Object.entries(table).sort((a, b) => a[1] - b[1])
    return h('div', { class: 'styles' }, [
      h('div', { class: 'label' }, [t('assets.colours')]),
      h(
        'div',
        { class: 'swatches' },
        own.map((name) => {
          const sw = h('span', { class: 'big-swatch' })
          sw.style.background = theme.colors[name] ?? ''
          return h('figure', { class: 'colour' }, [
            sw,
            h('figcaption', {}, [h('b', {}, [name]), ` ${theme.colors[name]}`]),
          ])
        }),
      ),
      h('div', { class: 'label' }, [t('assets.textSizes')]),
      h(
        'div',
        { class: 'type-rows' },
        sorted(theme.text).map(([name, px]) => {
          const sample = h('span', { class: 'type-sample' }, ['Aa'])
          sample.style.fontSize = `${Math.min(px, 64)}px`
          return h('div', { class: 'type-row' }, [sample, h('code', {}, [`${name} · ${px}px`])])
        }),
      ),
      h('div', { class: 'label' }, [t('assets.radius')]),
      h(
        'div',
        { class: 'swatches' },
        sorted(theme.radius).map(([name, px]) => {
          const box = h('span', { class: 'radius-box' })
          box.style.borderRadius = `${px}px`
          return h('figure', { class: 'colour' }, [box, h('figcaption', {}, [`${name} · ${px}px`])])
        }),
      ),
      h('div', { class: 'label' }, [t('assets.shadows')]),
      h(
        'div',
        { class: 'swatches' },
        Object.entries(theme.shadow).map(([name, value]) => {
          const box = h('span', { class: 'shadow-box' })
          box.style.boxShadow = value
          return h('figure', { class: 'colour' }, [box, h('figcaption', {}, [name])])
        }),
      ),
      h('p', { class: 'hint-text' }, [t('assets.spacing', { unit: theme.spacing, p4: theme.spacing * 4 })]),
    ])
  }

  const screensView = () =>
    screens.pages.some((p) => p.previews.length)
      ? h('div', { class: 'screens' }, [
          h('div', { class: 'label' }, [t('assets.screens')]),
          ...screens.pages.flatMap((p) =>
            p.previews.map((s) =>
              h('div', { class: 'screen' }, [
                h('code', {}, [p.path]),
                h('b', {}, [s.name]),
                p.path.includes(':')
                  ? h('span', { class: 'hint-text' }, [t('assets.screen.hint')])
                  : h(
                      'button',
                      { class: 'act', type: 'button', onclick: () => host.screen(p.route, p.path, s.name) },
                      [t('assets.open')],
                    ),
              ]),
            ),
          ),
        ])
      : null

  const officialHead = () =>
    official.kit
      ? null
      : h('p', { class: 'hint-text official-none' }, [
          t('assets.official.none'),
          ' ',
          h('code', {}, ['npm install -D @hozu/ui-kit']),
          ' · ',
          h('code', {}, ['npx hozu add kit ui --from official']),
        ])

  const moreView = (q: string) => {
    const kit = official.kit
    if (!kit) return null
    const more = official.available.filter((a) => !a.installed && (!q || a.name.toLowerCase().includes(q)))
    if (!more.length) return null
    return h('div', { class: 'official-more' }, [
      h('div', { class: 'label' }, [t('assets.official.more', { count: more.length })]),
      ...more.map((a) =>
        h(
          'div',
          {
            class: 'screen',
            'data-available': a.name,
            'data-drag': `${kit}.${a.name}`,
            title: t('assets.drag.title'),
            onpointerdown: (e) =>
              host.drag(
                e as PointerEvent,
                e.currentTarget as HTMLElement,
                {
                  component: `${kit}.${a.name}`,
                  variant: {},
                  install: installCommand(kit, a.name),
                  file: `${kit}/${a.file}`,
                },
                a.name,
              ),
          },
          [
            h(
              'button',
              {
                class: 'asset-name',
                type: 'button',
                onclick: () => {
                  pending = a
                  detail = null
                  void render()
                },
              },
              [h('b', {}, [a.name])],
            ),
            h('code', {}, [`${kit}/${a.file}`]),
            h('code', { class: 'command' }, [installCommand(kit, a.name)]),
          ],
        ),
      ),
    ])
  }

  const listBody = () => {
    const q = query.trim().toLowerCase()
    const inside = new Set([...parts.values()].flat().map((c) => c.id))
    const matches = (c: Catalogued) =>
      !q ||
      c.id.toLowerCase().includes(q) ||
      (parts.get(c.id) ?? []).some((p) => p.id.toLowerCase().includes(q))
    const shown = catalog.filter((c) => !inside.has(c.id) && matches(c))
    const kit = official.kit
    const owners = [...new Set([...(kit ? [kit] : []), ...shown.map((c) => c.owner.id)])]
    const ownerLabel = (o: string) => {
      const count = shown.filter((c) => c.owner.id === o).length
      return o === kit
        ? `${t('assets.official.title')} · ${o} · ${count}${official.version ? ` · ${official.version}` : ''}`
        : `${o} · ${count}`
    }
    const more = moreView(q)
    return h('div', { class: 'assets-body' }, [
      officialHead(),
      ...owners.map((o) =>
        h('div', { class: o === kit ? 'owner official' : 'owner' }, [
          h('div', { class: 'label' }, [ownerLabel(o)]),
          ...shown.filter((c) => c.owner.id === o).map(card),
          o === kit ? more : null,
        ]),
      ),
      shown.length || more ? null : h('p', { class: 'hint-text' }, [t('assets.noMatch')]),
      q ? null : screensView(),
    ])
  }
  const search = h('input', {
    type: 'search',
    class: 'outcome',
    placeholder: t('assets.find.placeholder'),
    'aria-label': t('assets.find'),
    oninput: (e) => {
      query = (e.target as HTMLInputElement).value
      board.querySelector(':scope > .assets-body')?.replaceWith(listBody())
    },
  }) as HTMLInputElement

  const render = async () => {
    search.value = query
    const head = h('header', { class: 'assets-head' }, [
      h('b', {}, [t('assets.title')]),
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
          [t('assets.components')],
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
          [t('assets.styles')],
        ),
      ]),
      tab === 'components' && !detail && !pending ? search : null,
      h(
        'button',
        {
          class: 'act',
          type: 'button',
          'data-dock': true,
          title: t('assets.dock.title'),
          onclick: () => setDocked(!docked),
        },
        [t(docked ? 'assets.undock' : 'assets.dock')],
      ),
      h('button', { class: 'act', type: 'button', onclick: () => close() }, [t('common.close')]),
    ])
    if (tab === 'styles') {
      board.replaceChildren(head, h('div', { class: 'assets-body' }, [await styles()]))
      return
    }
    if (detail || pending) selected = await host.selection()
    if (pending) {
      board.replaceChildren(head, h('div', { class: 'assets-body detail' }, [h('div'), pendingView(pending)]))
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
    board.replaceChildren(h('p', { class: 'hint-text' }, [t('assets.loading')]))
    catalog = (await json<Catalogued[]>('/_hozu/dev/components')) ?? []
    official = (await json<Official>('/_hozu/dev/official')) ?? official
    icons = (await json<DevIcons>('/_hozu/dev/icons')) ?? {}
    parts = partsOf(catalog, official)
    cards.clear()
    screens = (await json<Screens>('/_hozu/dev/previews')) ?? { pages: [] }
    await render()
  }
  const close = () => {
    board.hidden = true
    detail = null
    pending = null
  }
  return {
    board,
    open,
    close,
    isOpen: () => !board.hidden,
    docked: () => docked,
    dock: () => setDocked(true),
    catalog: () => json<Catalogued[]>('/_hozu/dev/components'),
  }
}
