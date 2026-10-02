import { fileURLToPath } from 'node:url'

export {
  type HozuRequest,
  type RequestItem,
  requestJson,
  requestMarkdown,
  type Scope,
  scopesFor,
  titleOf,
} from './prompt.ts'
export { finishRequest, listRequests, type SavedRequest, saveRequest } from './requests.ts'

export const devtoolsDir = fileURLToPath(new URL('./', import.meta.url))
export const devtoolsEntry = '/_hozu/devtools/overlay/index.js'
