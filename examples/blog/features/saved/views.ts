import { ui } from '@tenon/core'
import { listPosts } from '../posts/effects.ts'
import { savedPosts } from './effects.ts'
import { Save, savedMachine, Unsave } from './machine.ts'

export const ReadingList = ui.view({
  machine: savedMachine,
  route: null,
  render: ({ ctx, when }) =>
    ui.aside({ class: 'border p-4' }, [
      ui.h2({}, ['Your reading list']),
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
                      ui.li({}, [
                        post.title,
                        when(
                          ['idle'],
                          [
                            ui.button({ type: 'button', on: { click: ui.send(Save, { slug: post.slug }) } }, [
                              'Save',
                            ]),
                            ui.button(
                              { type: 'button', on: { click: ui.send(Unsave, { slug: post.slug }) } },
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
