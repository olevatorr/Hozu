import { anyRef } from './refs.ts'
import type { ValueExpr } from './types.ts'

export const formRunnable = (payload: ValueExpr): boolean =>
  !anyRef(
    payload,
    (r) =>
      !(
        r.ref === 'context' ||
        r.ref === 'params' ||
        r.ref === 'search' ||
        (r.ref === 'dom' && r.path[0] === 'form')
      ),
  )

export const FORM_FIELD = '__tenon'
