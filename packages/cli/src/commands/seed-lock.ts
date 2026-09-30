import { parentPort, workerData } from 'node:worker_threads'
import { load } from '../load.ts'
import { seedLock } from './validate.ts'

const { config, cwd, features } = workerData as {
  config: string | undefined
  cwd: string
  features: string[]
}
parentPort!.postMessage(seedLock(await load(config, cwd), features))
