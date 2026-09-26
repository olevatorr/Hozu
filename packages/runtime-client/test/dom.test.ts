// @vitest-environment happy-dom
import { buildProject } from '@hozu/core/ir'
import { createDataRuntime, resolvers } from '@hozu/data'
import { type App, hydrate } from '@hozu/runtime-client'
import { renderToString } from '@hozu/runtime-server'
import { validate } from '@hozu/validator'
import { beforeEach, describe, expect, it } from 'vitest'
import project from './support/todo.ts'

const build = buildProject(project)
const data = createDataRuntime({ build, resolvers: resolvers(project, () => []) })

let app: App
let serverHtml = ''
let elements: Element[] = []
beforeEach(async () => {
  const { html } = await renderToString({ build, data, route: 'home' })
  serverHtml = html
  document.open()
  document.write(html.replace(/<script type="module"[^>]*><\/script>/, ''))
  document.close()
  elements = [...document.body.querySelectorAll('*')]
  app = (await hydrate(document, { loadFns: async () => build.bindings.fns as never })).get('todo')!
})

const shape = (n: Node): unknown =>
  n.nodeType === 1
    ? [
        (n as Element).localName,
        [...(n as Element).attributes].map((a) => `${a.name}=${a.value}`),
        [...n.childNodes].filter((c) => c.nodeType !== 3 || (c as Text).data !== '').map(shape),
      ]
    : [n.nodeType, (n as CharacterData).data]
const q = <T extends Element>(s: string) => document.querySelector(s) as T
const ids = () => [...document.querySelectorAll('li')].map((li) => li.getAttribute('data-id'))
const type = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('DOM vocabulary and adoption hydration', () => {
  it('validates clean and server-renders forms, svg, textarea and boolean attributes', () => {
    expect(build.diagnostics).toEqual([])
    expect(validate(build.ir, { sources: build.sources, bindings: build.bindings })).toEqual([])
    expect(serverHtml).toContain('<button type="submit" disabled>Add</button>')
    expect(serverHtml).toContain('<textarea name="notes"></textarea>')
    expect(serverHtml).toContain('aria-invalid="false"')
    expect(serverHtml).toContain(
      '<svg viewBox="0 0 10 10" width="10" height="10"><circle cx="5" cy="5" r="4" fill="red"></circle></svg>',
    )
    expect(q('circle').namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('adopts the server DOM without replacing nodes', () => {
    const parsed = document.createElement('div')
    parsed.innerHTML = serverHtml.slice(
      serverHtml.indexOf('<body>') + 6,
      serverHtml.indexOf('<script type="module"'),
    )
    const scripts = [...document.body.childNodes].filter((n) => n.nodeName !== 'SCRIPT')
    const after = [...document.body.querySelectorAll('*')]
    expect(after.length === elements.length && after.every((e, i) => e === elements[i])).toBe(true)
    expect(scripts.map(shape)).toEqual(
      [...parsed.childNodes].filter((n) => n.nodeName !== 'SCRIPT').map(shape),
    )
  })

  it('controlled inputs, guard-valued attributes and DOM fields', () => {
    const input = q<HTMLInputElement>('input[name="title"]')
    const submit = q<HTMLButtonElement>('button[type="submit"]')
    type(input, 'bad')
    expect(app.snapshot()?.context).toMatchObject({ draft: 'bad' })
    expect(submit.hasAttribute('disabled')).toBe(false)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('bad')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', shiftKey: true, bubbles: true }))
    expect(q('p').textContent).toBe('Last key: k')
  })

  it('submits form data and keyed lists add, remove and move nodes without recreating them', async () => {
    const [alpha, beta] = [...document.querySelectorAll('li')]
    type(q<HTMLInputElement>('input[name="title"]'), 'Gamma')
    q<HTMLFormElement>('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    expect(ids()).toEqual(['a', 'b', 'Gamma'])
    expect(q<HTMLInputElement>('input[name="title"]').value).toBe('')
    const reverse = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Reverse')!
    reverse.click()
    expect(ids()).toEqual(['Gamma', 'b', 'a'])
    const [, b2, a2] = [...document.querySelectorAll('li')]
    expect(a2).toBe(alpha)
    expect(b2).toBe(beta)
    ;(beta!.querySelector('button') as HTMLButtonElement).click()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))
    expect(ids()).toEqual(['Gamma', 'a'])
    expect(beta!.isConnected).toBe(false)
    expect(alpha!.isConnected).toBe(true)
  })
})

describe('motion', () => {
  const frames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))

  it('runs enter and leave classes on keyed items and removes leaving nodes after the transition', async () => {
    type(q<HTMLInputElement>('input[name="title"]'), 'Gamma')
    q<HTMLFormElement>('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    const gamma = q<HTMLLIElement>('li[data-id="Gamma"]')
    expect(gamma.className).toBe('list-enter-from list-enter-active')
    await frames()
    expect(gamma.className).toBe('')
    const alpha = q<HTMLLIElement>('li[data-id="a"]')
    ;(alpha.querySelector('button') as HTMLButtonElement).click()
    expect(alpha.isConnected).toBe(true)
    expect(alpha.className).toBe('list-leave-from list-leave-active')
    await frames()
    expect(alpha.isConnected).toBe(false)
    expect(ids()).toEqual(['b', 'Gamma'])
  })
})
