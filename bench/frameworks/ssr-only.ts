import { buildProject } from '@hozu/core/ir'
import { createDataRuntime } from '@hozu/data'
import { renderToString } from '@hozu/runtime-server'
import { benchProject, benchResolvers } from './apps/hozu.ts'

const build = buildProject(benchProject, { sources: false })
const data = createDataRuntime({ build, resolvers: benchResolvers })
const render = () =>
  renderToString({
    build,
    data,
    route: 'home',
    assets: { client: '/hozu/app.js', fns: null, styles: null, preload: [], widgets: {} },
  })
for (let i = 0; i < 500; i++) await render()
const rounds: number[] = []
for (let r = 0; r < 5; r++) {
  const t = performance.now()
  let n = 0
  while (performance.now() - t < 500) {
    await render()
    n++
  }
  rounds.push((n / (performance.now() - t)) * 1000)
}
console.log(
  'hozu SSR renders/s',
  Math.round(rounds.sort((a, b) => a - b)[2]!),
  'html bytes',
  (await render()).html.length,
)
