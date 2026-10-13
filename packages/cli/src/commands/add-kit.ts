import { parentPort, workerData } from 'node:worker_threads'
import { HozuCliError } from '../errors.ts'
import { load } from '../load.ts'
import { addKit } from './kits.ts'

const { config, cwd, id, sync, from } = workerData as {
  config: string | undefined
  cwd: string
  id: string | undefined
  sync: boolean
  from: string | undefined
}
try {
  parentPort!.postMessage({ out: await addKit(await load(config, cwd), cwd, id, sync, from) })
} catch (error) {
  parentPort!.postMessage({
    error:
      error instanceof HozuCliError
        ? error.toJSON().error
        : {
            code: 'config',
            message: error instanceof Error ? error.message : String(error),
            suggestions: [],
          },
  })
}
