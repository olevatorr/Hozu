import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { getTask, listTasks } from './features/tasks/model.ts'
import { Board, Detail, tasks } from './features/tasks/views.ts'
import { home, taskPage } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'Tasks', lang: 'en' },
  routes: { home, taskPage },
  pages: [
    ui.page(home, {
      views: [Board],
      head: { render: () => ({ title: 'Tasks', description: 'A small task board.' }) },
    }),
    ui.page(taskPage, {
      views: [Detail],
      head: {
        query: getTask,
        input: (params) => ({ id: params.id }),
        render: (t) => ({ title: t.title, description: t.title }),
      },
      entries: { query: listTasks, input: {}, params: (t) => ({ id: t.id }) },
    }),
  ],
  features: [tasks],
})
