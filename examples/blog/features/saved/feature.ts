import { feature } from '@hozu/core'
import { posts } from '../posts/feature.ts'
import { refusesWhenFull, removeFails, removesPost, saveFails, savesPost } from './contracts.ts'
import { savedPosts, savedTag, savePost, unsavePost } from './effects.ts'
import { Save, savedMachine, Unsave } from './machine.ts'
import { text } from './messages.ts'
import { ReadingList } from './views.ts'

export const saved = feature({
  id: 'saved',
  intent: {
    summary: 'Signed-in reading list: save and remove posts.',
    invariants: ['Reading lists are private to each user', 'At most 20 saved posts'],
  },
  styles: [new URL('./saved.css', import.meta.url)],
  imports: [posts],
  declarations: [
    {
      savedTag,
      Save,
      Unsave,
      savedPosts,
      savePost,
      unsavePost,
      ReadingList,
      savesPost,
      refusesWhenFull,
      saveFails,
      removesPost,
      removeFails,
      savedMachine,
      text,
    },
  ],
})
