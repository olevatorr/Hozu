import type { AgentNote } from '../notes.ts'
import { h } from './dom.ts'

export interface AgentHost {
  doc: () => Document
  win: () => Window
  developer: () => boolean
  show: () => void
  closeButton: (onclick: () => void) => HTMLElement
  close: () => void
  changed: () => void
}

const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}…` : text)

/** The notes the agent shows the person with `hozu show` (ADR 0056 D): numbered frames and a panel. */
export function agentNotes(host: AgentHost) {
  let notes: AgentNote[] = []
  let current = 0
  const layer = h('div')

  const elementFor = (n: AgentNote | undefined): Element | null =>
    !n || n.id.startsWith('page:') ? null : host.doc().querySelector(`[data-hz="${CSS.escape(n.id)}"]`)

  function draw() {
    layer.replaceChildren(
      ...notes.map((n, i) =>
        h('div', { class: i === current ? 'note-box current' : 'note-box', hidden: true }, [
          h(
            'button',
            {
              class: 'note-tag',
              type: 'button',
              title: n.text,
              onclick: () => {
                go(i)
                host.show()
              },
            },
            [h('b', {}, [String(n.n)]), ` ${short(n.text)}`],
          ),
        ]),
      ),
    )
  }

  async function refresh() {
    try {
      const response = await fetch('/_hozu/dev/notes')
      notes = response.ok ? ((await response.json()) as AgentNote[]) : []
    } catch {
      notes = []
    }
    current = Math.min(current, Math.max(0, notes.length - 1))
    draw()
    host.changed()
  }

  function frame() {
    notes.forEach((n, i) => {
      const box = layer.children[i] as HTMLElement | undefined
      if (!box) return
      const r = elementFor(n)?.getBoundingClientRect()
      if (!r || (r.width === 0 && r.height === 0)) {
        box.hidden = true
        return
      }
      box.hidden = false
      box.style.left = `${r.left - 3}px`
      box.style.top = `${r.top - 3}px`
      box.style.width = `${r.width + 6}px`
      box.style.height = `${r.height + 6}px`
      box.classList.toggle('below', r.top < 32)
    })
  }

  function go(i: number) {
    current = i
    draw()
    elementFor(notes[i])?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    host.changed()
  }

  function render(panel: HTMLElement) {
    panel.hidden = false
    const note = notes[current]
    const head = h('div', { class: 'head' }, [
      h('div', { class: 'kicker' }, ['From your agent']),
      h('h2', { class: 'title' }, [note ? `Note ${current + 1} of ${notes.length}` : 'No notes']),
      host.closeButton(host.close),
    ])
    if (!note)
      return panel.replaceChildren(
        head,
        h('div', { class: 'empty' }, [
          h('b', {}, ['Nothing to show. ']),
          'Your agent points at parts of the page with hozu show, and they appear here.',
        ]),
      )
    const shown = elementFor(note) !== null
    const result = h('div', { class: 'status', role: 'status' })
    const reply = h('textarea', {
      'aria-label': 'Reply to your agent',
      placeholder: 'Reply to your agent. For example: “Good, but make it red”',
    }) as HTMLTextAreaElement
    const step = (label: string, to: number) =>
      h('button', { type: 'button', disabled: to < 0 || to >= notes.length, onclick: () => go(to) }, [label])
    const sections: (HTMLElement | null)[] = [
      head,
      h('div', { class: 'sec' }, [
        h('p', { class: 'plain note-text' }, [note.text]),
        h('div', { class: 'row' }, [h('b', {}, ['On ']), note.label]),
        host.developer() && note.at ? h('div', { class: 'row' }, [h('b', {}, ['Source ']), note.at]) : null,
        note.id.startsWith('page:') || shown
          ? null
          : h('div', { class: 'hint-text' }, [
              'Not on this page. ',
              note.path ? h('a', { href: note.path }, [`Open ${note.path}`]) : '',
            ]),
        h('div', { class: 'actions' }, [step('← Back', current - 1), step('Next →', current + 1)]),
      ]),
      h('div', { class: 'sec' }, [
        h('div', { class: 'label' }, ['Reply']),
        reply,
        h('div', { class: 'actions' }, [
          h(
            'button',
            {
              class: 'primary',
              type: 'button',
              onclick: async () => {
                if (!reply.value.trim()) return reply.focus()
                const response = await fetch(`/_hozu/dev/notes/${note.n}/reply`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ reply: reply.value }),
                })
                const body = (await response.json()) as { number?: string; error?: string }
                result.className = response.ok ? 'status ok' : 'status err'
                result.replaceChildren(
                  response.ok
                    ? `Sent as request ${body.number}. Your agent reads it with hozu requests.`
                    : `Not sent: ${body.error}`,
                )
                if (response.ok) reply.value = ''
              },
            },
            ['Send reply'],
          ),
          h(
            'button',
            {
              class: 'danger',
              type: 'button',
              title: 'Remove this note from the page',
              onclick: async () => {
                await fetch(`/_hozu/dev/notes/${note.n}`, { method: 'DELETE' })
                await refresh()
              },
            },
            ['Done'],
          ),
        ]),
        result,
      ]),
      notes.length > 1
        ? h('div', { class: 'sec' }, [
            h('div', { class: 'label' }, ['All notes']),
            ...notes.map((n, i) =>
              h(
                'button',
                {
                  class: 'link note-item',
                  type: 'button',
                  'aria-current': String(i === current),
                  onclick: () => go(i),
                },
                [`${n.n} · ${short(n.text)}`],
              ),
            ),
          ])
        : null,
    ]
    panel.replaceChildren(...sections.filter((x): x is HTMLElement => x !== null))
  }

  addEventListener('hozu:notes', () => void refresh())
  void refresh()

  return { layer, frame, render, count: () => notes.length, focus: () => go(current) }
}
