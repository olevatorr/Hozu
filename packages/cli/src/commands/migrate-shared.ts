import { dirname, resolve } from 'node:path'
import { callOf, importsFrom, lineOf, type Node, type Note, parse } from './migrate-ast.ts'

const featureOf = (file: string) => /[/\\]features[/\\]([^/\\]+)[/\\]/.exec(file)?.[1] ?? null

/** Parts imported by the views of two or more features: HZ080 candidates, printed, not rewritten (ADR 0045 L). */
export function sharedParts(files: Map<string, string>): Note[] {
  const programs = new Map<string, Node>()
  const parts = new Map<string, { file: string; name: string; line: number }>()
  for (const [file, source] of files) {
    let program: Node
    try {
      program = parse(source)
    } catch {
      continue
    }
    programs.set(file, program)
    const part = importsFrom(program, '@hozu/core').get('part')
    if (!part) continue
    for (const s of program.body) {
      if (s.type !== 'ExportNamedDeclaration' || s.declaration?.type !== 'VariableDeclaration') continue
      for (const d of s.declaration.declarations)
        if (d.id.type === 'Identifier' && callOf(d.init, null, part))
          parts.set(`${file}#${d.id.name}`, { file, name: d.id.name, line: lineOf(source, d.start) })
    }
  }
  if (!parts.size) return []
  const users = new Map<string, Set<string>>()
  for (const [file, program] of programs) {
    const feature = featureOf(file)
    if (!feature) continue
    for (const s of program.body) {
      if (s.type !== 'ImportDeclaration' || !String(s.source.value).startsWith('.')) continue
      const from = resolve(dirname(file), s.source.value)
      for (const x of s.specifiers) {
        if (x.type !== 'ImportSpecifier') continue
        const id = `${from}#${x.imported.name ?? x.imported.value}`
        if (!parts.has(id)) continue
        users.set(id, (users.get(id) ?? new Set()).add(feature))
      }
    }
  }
  const notes: Note[] = []
  for (const [id, features] of users) {
    if (features.size < 2) continue
    const p = parts.get(id)!
    notes.push({
      file: p.file,
      line: p.line,
      rule: 'print',
      message: `part ${p.name} is used by the features ${[...features].sort().join(', ')}: a view subtree shared by features is a ui.component in a kit (HZ080)`,
      see: 'views',
      behaviour: true,
    })
  }
  return notes
}
