import { tagUseOf } from '../builders/tag.ts'
import type { TagExprIR } from '../ir/types.ts'
import { RecorderError } from '../model/expr.ts'
import { type At, at, type FeatureScope } from './scope.ts'

export function tagList(scope: FeatureScope, uses: unknown, p: At): TagExprIR[] {
  if (!Array.isArray(uses)) throw new RecorderError('Tag lists must be arrays: [myTag()]')
  return uses.map((u, i) => {
    const use = tagUseOf(u)
    if (!use) throw new RecorderError('Tag lists may only contain tag uses: [myTag()]')
    return {
      tag: scope.ref(use.tag, ['tag'], at(p, i)),
      param: use.param === null ? null : scope.value(use.param, at(p, i)),
    }
  })
}
