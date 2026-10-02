import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { tasks } from './features/tasks/feature.ts'
import { getTask, listTasks } from './features/tasks/model.ts'
import { Board, Detail } from './features/tasks/views.ts'
import { board, taskPage } from './routes.ts'
import { kit } from './ui/kit.ts'

export default project({
  schema: zodAdapter,
  app: new URL('./app.ts', import.meta.url),
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Studio', lang: 'en' },
  routes: { board, taskPage },
  kits: [kit],
  pages: [
    ui.page(board, {
      views: [Board],
      head: { render: () => ({ title: 'Team tasks', description: 'The sprint board.' }) },
    }),
    ui.page(taskPage, {
      views: [Detail],
      head: {
        query: getTask,
        input: (params) => ({ id: params.id }),
        failed: { NotFound: 404 },
        render: (t) => ({ title: t.title, description: `Owned by ${t.owner}` }),
      },
      entries: { query: listTasks, input: {}, params: (t) => ({ id: t.id }) },
    }),
  ],
  features: [tasks],
})
