import { fileURLToPath } from 'node:url'

export {
  type HozuRequest,
  type RequestItem,
  requestMarkdown,
  type Scope,
  scopesFor,
  titleOf,
} from './prompt.ts'
export {
  deleteRequest,
  finishRequest,
  listRequests,
  readRequest,
  type SavedRequest,
  saveRequest,
} from './requests.ts'

export { currentUtility, parseTheme, type StyleProp, type Theme, utilityFor } from './theme.ts'

export const devtoolsDir = fileURLToPath(new URL('./', import.meta.url))
export const devtoolsEntry = '/_hozu/devtools/overlay/index.js'
