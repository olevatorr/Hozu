import { project, ui } from '@hozu/core'
import { zodAdapter } from '@hozu/schema-zod'
import { getTask, listTasks } from './features/tasks/model.ts'
import { TaskDetail, TasksBoard, tasks } from './features/tasks/views.ts'
import { home, taskPage } from './routes.ts'

export default project({
  schema: zodAdapter,
  styles: new URL('./app.css', import.meta.url),
  site: { url: 'http://localhost:3000', name: 'h1', lang: 'en' },
  routes: { home, taskPage },
  pages: [
    ui.page(taskPage, {
      views: [TaskDetail],
      head: {
        query: getTask,
        input: (params) => ({ id: params.id }),
        render: (item) => ({ title: item.title }),
      },
      entries: { query: listTasks, input: {}, params: (item) => ({ id: item.id }) },
    }),
    ui.page(home, { views: [TasksBoard], head: { render: () => ({ title: 'Tasks' }) } }),
  ],
  features: [tasks],
})
