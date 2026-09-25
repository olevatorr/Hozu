import { project, ui } from '@tenon/core'
import { zodAdapter } from '@tenon/schema-zod'
import { getTask, listTasks } from './features/tasks/effects.ts'
import { tasks } from './features/tasks/feature.ts'
import { Board, Detail } from './features/tasks/views.ts'
import { home, taskPage } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  notFound: null,
  session: null,
  site: { url: 'http://localhost:3000', name: 'Tasks', lang: 'en', icon: null, themeColor: null },
  routes: { home, taskPage },
  pages: [
    ui.page(home, {
      views: [Board],
      assert: null,
      head: {
        redirects: null,
        query: null,
        input: null,
        render: () => ({
          title: 'Tasks',
          description: 'A small server-rendered task board.',
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: null,
    }),
    ui.page(taskPage, {
      views: [Detail],
      assert: null,
      head: {
        redirects: null,
        query: getTask,
        input: (params) => ({ id: params.id }),
        render: (task) => ({
          title: task.title,
          description: task.title,
          type: 'website',
          image: null,
          published: null,
          noindex: false,
        }),
      },
      entries: { query: listTasks, input: {}, params: (task) => ({ id: task.id }) },
    }),
  ],
  features: [tasks],
})
