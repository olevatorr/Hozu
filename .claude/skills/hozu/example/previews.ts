import { previews } from '@hozu/core/preview'
import { listBookmarks } from './features/bookmarks/model.ts'
import { home } from './routes.ts'
import { Button } from './ui/button.ts'

export default previews((p) => [
  p.component(Button, 'Long label', {
    variant: { tone: 'primary' },
    children: 'Add it to the shared reading list',
  }),
  p.page(home, 'Empty list', [p.data(listBookmarks, [])]),
  p.page(home, 'List failed', [p.fail(listBookmarks, 'Unexpected')]),
])
