import { ui } from '@tenon/core'
import { listPosts } from '../posts/effects.ts'
import { savedPosts } from './effects.ts'
import { Save, savedMachine, Unsave } from './machine.ts'
import { text } from './messages.ts'

export const ReadingList = ui.view({
  machine: savedMachine,
  render: ({ ctx, when }) =>
    ui.aside({ class: 'reading-list mx-auto mt-8 max-w-2xl' }, [
      ui.h2({ class: 'text-lg font-semibold' }, [text.heading]),
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
                              [text.save],
                            ),
                            ui.button(
                              {
                                type: 'button',
                                class:
                                  'rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-800',
                                on: { click: ui.send(Unsave, { slug: post.slug }) },
                              },
                              [text.remove],
                            ),
                          ],
                        ),
                      ]),
                    ),
                    ui.li({}, [text.count({ count: slugs.length })]),
                  ]),
                pending: null,
                failed: { Unexpected: () => ui.p({}, [text.postsUnavailable]) },
              },
            ),
          pending: ui.p({}, [text.loading]),
          failed: { Unexpected: () => ui.p({ role: 'alert' }, [text.unavailable]) },
        },
      ),
      when(['saving', 'removing'], [ui.p({ 'aria-live': 'polite' }, [text.saving])]),
      ui.p({ role: 'alert' }, [ctx.error]),
    ]),
})
