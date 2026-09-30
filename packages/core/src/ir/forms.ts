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
        (r.ref === 'dom' && (r.path[0] === 'form' || r.path[0] === 'formAll'))
      ),
  )

export const FORM_FIELD = '__hozu'

export interface FormEntries {
  first: Record<string, string>
  all: Record<string, string[]>
}

/** The one form decoder of client, native post, endpoint bodies and tools: values in tree order, files by name. */
export function formEntries(
  entries: Iterable<readonly [string, unknown]>,
  submitter?: readonly [string, string] | null,
): FormEntries {
  const first: Record<string, string> = Object.create(null)
  const all: Record<string, string[]> = Object.create(null)
  const add = (k: string, v: unknown) => {
    const s = typeof v === 'string' ? v : (v as File).name
    const list = all[k]
    if (list) list.push(s)
    else {
      all[k] = [s]
      first[k] = s
    }
  }
  for (const [k, v] of entries) add(k, v)
  if (submitter) add(...submitter)
  return { first, all }
}

/** The formRef a control's `form` attribute (or a form's `id`) names, inside ui.each too. */
export const formRefOf = (v: ValueExpr | undefined): string | null =>
  !v
    ? null
    : 'formRef' in v
      ? v.formRef
      : 'fn' in v && v.fn === '%concat' && 'object' in v.arg
        ? formRefOf(v.arg.object['0'])
        : null
