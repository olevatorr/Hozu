import {
  apply,
  declaration,
  type Edit,
  keyName,
  lineOf,
  type Node,
  type Note,
  parse,
  property,
  type Rewrite,
  walk,
} from './migrate-ast.ts'

const SUGGEST: [RegExp, string][] = [
  [/forbidden|denied|notallowed|admin/i, '403'],
  [/gone|deleted|removed|archived|expired/i, '410'],
  [/unauthori[sz]ed|unauthenticated|signedout|signin|login|session/i, 'a sign-in route'],
]

export function suggestion(error: string): string | null {
  for (const [re, status] of SUGGEST) if (re.test(error)) return status
  return null
}

/** Adds `text` as the last property of an object literal, matching its layout. */
export function insertProperty(source: string, obj: Node, text: string): Edit {
  const last = obj.properties[obj.properties.length - 1]
  if (!last) return [obj.start + 1, obj.end - 1, ` ${text} `]
  const after = source.slice(last.end).match(/^\s*,/)
  const multiline = source.slice(obj.start, obj.end).includes('\n')
  const lineStart = source.lastIndexOf('\n', last.start) + 1
  const indent = source.slice(lineStart, last.start).match(/^\s*/)![0]
  if (!multiline) return [last.end, last.end, `, ${text}`]
  if (after) {
    const at = last.end + after[0].length
    return [at, at, `\n${indent}${text},`]
  }
  return [last.end, last.end, `,\n${indent}${text}`]
}

export function errorsOf(file: string, program: Node, query: Node): string[] | null {
  const decl = declaration(file, program, query)
  if (decl?.init.type !== 'CallExpression') return null
  const options = decl.init.arguments[0]
  const errors = property(options, 'errors')
  if (!errors) return options?.type === 'ObjectExpression' ? [] : null
  if (errors.value.type !== 'ObjectExpression') return null
  const names = errors.value.properties.map(keyName)
  return names.includes(null) ? null : (names as string[])
}

/** `head.redirects` → `head.failed`, exhaustive; an unmapped error gets 404, the 0.7 status (ADR 0043 D). */
export function migrateHead(source: string, file: string): Rewrite {
  if (!/\bhead\s*:/.test(source)) return { code: source, notes: [] }
  const program = parse(source)
  const notes: Note[] = []
  const edits: Edit[] = []
  walk(program, (n) => {
    if (n.type !== 'Property' || keyName(n) !== 'head' || n.value.type !== 'ObjectExpression') return
    const head = n.value
    const query = property(head, 'query')
    const redirects = property(head, 'redirects')
    if ((!query && !redirects) || property(head, 'failed')) return
    const line = lineOf(source, head.start)
    const mapped: [string, string][] = []
    if (redirects) {
      if (redirects.value.type !== 'ObjectExpression') {
        notes.push({
          file,
          line,
          rule: 'head',
          message: 'head.redirects is not an object literal: write head.failed by hand',
          see: 'pages',
        })
        return
      }
      for (const p of redirects.value.properties) {
        const k = keyName(p)
        if (!k) continue
        mapped.push([source.slice(p.key.start, p.key.end), source.slice(p.value.start, p.value.end)])
      }
    }
    const errors = query ? errorsOf(file, program, query.value) : []
    if (errors === null) {
      notes.push({
        file,
        line,
        rule: 'head',
        message: `cannot read the errors of the head query ${source.slice(query!.value.start, query!.value.end)}: map each one in head.failed (HZ051 lists them)`,
        see: 'pages',
      })
      if (redirects) edits.push([redirects.key.start, redirects.key.end, 'failed'])
      return
    }
    const names = new Set(mapped.map(([k]) => k.replace(/^['"]|['"]$/g, '')))
    const filled = errors.filter((e) => !names.has(e))
    for (const e of filled) {
      const hint = suggestion(e)
      notes.push({
        file,
        line,
        rule: 'head',
        message: hint
          ? `head.failed ${e}: 404 filled (the 0.7 status); the name suggests ${hint}`
          : `head.failed ${e}: 404 filled (the 0.7 status)`,
        see: 'pages',
        behaviour: false,
      })
    }
    const entries = [...mapped.map(([k, v]) => `${k}: ${v}`), ...filled.map((e) => `${e}: 404`)]
    const text = `failed: { ${entries.join(', ')} }`
    if (entries.length)
      notes.push({
        file,
        line,
        rule: 'head',
        message: `head.${redirects ? 'redirects' : 'failed'} → ${text}`,
        see: 'pages',
      })
    if (redirects) {
      if (entries.length) edits.push([redirects.start, redirects.end, text])
      else {
        const props = head.properties
        const i = props.indexOf(redirects)
        edits.push(
          i > 0
            ? [props[i - 1].end, redirects.end, '']
            : [redirects.start, props[1]?.start ?? redirects.end, ''],
        )
      }
    } else if (entries.length) edits.push(insertProperty(source, head, text))
  })
  return { code: apply(source, edits), notes }
}
