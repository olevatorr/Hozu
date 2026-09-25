import { implement } from '@tenon/core/widget'
import type { Frame } from './meter.ts'

export default implement<typeof Frame>(({ el, props }) => {
  el.dataset.tone = props.tone
  return undefined
})
