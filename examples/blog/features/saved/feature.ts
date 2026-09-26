import { feature } from '@tenon/core'
import { posts } from '../posts/feature.ts'
import { refusesWhenFull, removeFails, removesPost, saveFails, savesPost } from './contracts.ts'
import { savedPosts, savedTag, savePost, unsavePost } from './effects.ts'
import { Save, savedMachine, Unsave } from './machine.ts'
import { text } from './messages.ts'
import { ReadingList } from './views.ts'

export const saved = feature({
  id: 'saved',
  styles: [new URL('./saved.css', import.meta.url)],
  messages: text,
  widgets: {},
  intent: {
    summary: 'Signed-in reading list: save and remove posts.',
    invariants: ['Reading lists are private to each user', 'At most 20 saved posts'],
  },
  imports: [posts],
  tags: { savedTag },
  events: { Save, Unsave },
  queries: { savedPosts },
  mutations: { savePost, unsavePost },
  fns: {},
  machine: savedMachine,
  views: { ReadingList },
  contracts: { savesPost, refusesWhenFull, saveFails, removesPost, removeFails },
  exports: { events: [], queries: [], mutations: [], tags: [], fns: [], views: [] },
})
