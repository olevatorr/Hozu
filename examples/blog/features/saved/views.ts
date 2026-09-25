import { ui } from '@tenon/core'
import { listPosts } from '../posts/effects.ts'
import { savedPosts } from './effects.ts'
import { Save, savedMachine, Unsave } from './machine.ts'

export const ReadingList = ui.view({
  machine: savedMachine,
  route: null,
  render: ({ ctx, when }) =>
    ui.aside({ class: 'reading-list mx-auto mt-8 max-w-2xl' }, [
      ui.h2({ class: 'text-lg font-semibold' }, ['Your reading list']),
      ui.query(
        savedPosts,
        {},
        {
          ready: (slugs) =>
            ui.query(
              listPosts,
              {},
              {
                ready: (posts) =>
                  ui.ul({}, [
                    ui.each(posts, 'slug', (post) =>
                      ui.li({ class: 'flex items-center gap-2 py-1' }, [
                        ui.span({ class: 'flex-1' }, [post.title]),
                        when(
                          ['idle'],
                          [
                            ui.button(
                              {
                                type: 'button',
                                class:
                                  'rounded-md bg-brand-600 px-2 py-0.5 text-xs text-white hover:bg-brand-700',
                                on: { click: ui.send(Save, { slug: post.slug }) },
                              },
                              ['Save'],
                            ),
                            ui.button(
                              {
                                type: 'button',
                                class:
                                  'rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800',
                                on: { click: ui.send(Unsave, { slug: post.slug }) },
                              },
                              ['Remove'],
                            ),
                          ],
                        ),
                      ]),
                    ),
                    ui.li({}, ['Saved: ', slugs.length]),
                  ]),
                pending: null,
                failed: { Unexpected: () => ui.p({}, ['Posts unavailable']) },
              },
            ),
          pending: ui.p({}, ['Loading your list…']),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Could not load your list']) },
        },
      ),
      when(['saving', 'removing'], [ui.p({ 'aria-live': 'polite' }, ['Saving…'])]),
      ui.p({ role: 'alert' }, [ctx.error]),
    ]),
})
