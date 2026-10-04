import { buildProject } from '@hozu/core/ir'
import { createDataRuntime } from '@hozu/data'
import { compileMachine, init, transition } from '@hozu/machine'
import { appOptionsOf, createHandler } from '@hozu/runtime-server'
import { describe, expect, it } from 'vitest'
import bookmarkResolversApp from '../../../examples/bookmarks/app.ts'
import bookmarks from '../../../examples/bookmarks/hozu.config.ts'
import cartResolversApp from '../../../examples/cart/app.ts'
import cart from '../../../examples/cart/hozu.config.ts'
import taskResolversApp from '../../../examples/trial-tasks/app.ts'
import tasks from '../../../examples/trial-tasks/hozu.config.ts'

const bookmarkResolvers = () => appOptionsOf(bookmarkResolversApp)!.resolvers
const cartResolvers = () => appOptionsOf(cartResolversApp)!.resolvers
const taskResolvers = () => appOptionsOf(taskResolversApp)!.resolvers

const cartBuild = buildProject(cart, { sources: false })
const session = () => ({ userId: 'ada' })

describe('typed environment (ADR 0019)', () => {
  it('shows public values, lowered for islands, and never leaks server values', async () => {
    const handler = createHandler({
      build: cartBuild,
      resolvers: cartResolvers(),
      session,
      env: { STOCK_LIMIT: '987654', SUPPORT_EMAIL: 'team@example.com' },
    })
    const html = await (await handler.fetch(new Request('https://cart.example/'))).text()
    const payload = /id="hozu-payload">(.*?)<\/script>/.exec(html)![1]!
    expect(payload).toContain('{"literal":"team@example.com"}')
    expect(payload).not.toContain('"ref":"env"')
    expect(html).not.toContain('987654')
  })

  it('applies defaults, coerces and fails at startup on invalid values', async () => {
    const data = createDataRuntime({
      build: cartBuild,
      resolvers: cartResolvers(),
      env: { STOCK_LIMIT: '1' },
    })
    const { addItem } = await import('../../../examples/cart/features/cart/effects.ts')
    expect(await data.mutate(addItem, { sku: 'mug', qty: 2 }, { userId: 'a' })).toMatchObject({
      ok: false,
      error: 'OutOfStock',
      data: { available: 1 },
    })
    expect(() =>
      createHandler({ build: cartBuild, resolvers: cartResolvers(), env: { SUPPORT_EMAIL: 'nope' } }),
    ).toThrow(/Invalid public environment: SUPPORT_EMAIL/)
    expect(() =>
      createDataRuntime({ build: cartBuild, resolvers: cartResolvers(), env: { STOCK_LIMIT: 'x' } }),
    ).toThrow(/Invalid server environment: STOCK_LIMIT/)
  })

  it('treats a variable set to the empty string as unset, so its default applies (ADR 0056 A3)', async () => {
    const handler = createHandler({
      build: cartBuild,
      resolvers: cartResolvers(),
      session,
      env: { STOCK_LIMIT: '', SUPPORT_EMAIL: '' },
    })
    expect((await handler.fetch(new Request('https://cart.example/'))).status).toBe(200)
  })
})

describe('field-level invalid input (ADR 0019)', () => {
  it('turns a schema failure into Invalid with every input field, invalid or not', async () => {
    const build = buildProject(bookmarks, { sources: false })
    const data = createDataRuntime({ build, resolvers: bookmarkResolvers() })
    const { addBookmark } = await import('../../../examples/bookmarks/features/bookmarks/model.ts')
    expect(await data.mutate(addBookmark, { title: 'x', kind: 'article' })).toMatchObject({
      ok: false,
      error: 'Invalid',
      data: { fields: { title: 'Use at least 2 characters', kind: null } },
    })
  })

  it('lets resolvers return Invalid and fills the missing fields', async () => {
    const build = buildProject(tasks, { sources: false })
    const data = createDataRuntime({ build, resolvers: taskResolvers() })
    const { addTask } = await import('../../../examples/trial-tasks/features/tasks/effects.ts')
    expect(await data.mutate(addTask, { title: '  ab ', priority: 'low' })).toMatchObject({
      ok: false,
      error: 'Invalid',
      data: {
        message: 'Title must be 3–80 characters',
        fields: { title: 'Title must be 3–80 characters', priority: null },
      },
    })
  })

  it('falls back to Unexpected in a machine that does not name Invalid', () => {
    const machine = compileMachine(cartBuild.ir.features.cart!, cartBuild.bindings.fns)
    const adding = transition(machine, init(machine).snapshot, {
      type: 'event',
      event: 'cart.AddItem',
      payload: { sku: 'mug', qty: 1 },
    })
    const entry = adding.snapshot.entry
    const failed = transition(machine, adding.snapshot, {
      type: 'failed',
      entry,
      error: 'Invalid',
      data: { message: 'qty: Too small', fields: { sku: null, qty: 'Too small' } },
    })
    expect(failed.taken).toBeTruthy()
    expect(failed.snapshot.state).toBe('error')
    expect(failed.snapshot.context).toMatchObject({ error: 'qty: Too small' })
  })

  it('re-renders a native form post with the field message', async () => {
    const build = buildProject(bookmarks, { sources: false })
    const handler = createHandler({ build, resolvers: bookmarkResolvers() })
    const home = await (await handler.fetch(new Request('https://b.example/'))).text()
    const action = /<form[^>]* action="([^"]+)"/.exec(home)![1]!.replace(/&amp;/g, '&')
    const posted = await handler.fetch(
      new Request(`https://b.example${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'title=x&kind=article',
      }),
    )
    expect(posted.status).toBe(400)
    const html = (await posted.text()).replace(/<!--[^>]*-->/g, '')
    expect(html).toMatch(/<p[^>]*id="title-error"[^>]*>Use at least 2 characters<\/p>/)
    expect(html).toContain('aria-invalid="true"')
  })
})
