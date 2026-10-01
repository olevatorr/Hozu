import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { type JsonPatchOp, resolveSource, type SourceLoc, type ValueExpr } from '@hozu/core/ir'
import { verify } from '@hozu/validator'
import { load } from '../load.ts'
import { projectStyles } from '../styles.ts'
import {
  apply,
  type Edit,
  keyName,
  lineOf,
  type Node,
  type Note,
  parse,
  property,
  walk,
} from './migrate-ast.ts'

type J = any

export interface StyleFinding {
  code: string
  pointer: string
  message: string
  source: SourceLoc | null
  patch: JsonPatchOp[] | null
  node: { class: string | null; toggle: Record<string, ValueExpr> } | null
}

export interface StyleRun {
  skipped: string | null
  findings: StyleFinding[]
}

const CODES = new Set(['HZ072', 'HZ074', 'HZ079'])

const at = (ir: J, pointer: string): J =>
  pointer
    .slice(1)
    .split('/')
    .map((t) => t.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), ir)

const nodeOf = (pointer: string) => pointer.replace(/\/(class|toggle\/[^/]*)$/, '')

/** Runs in its own process: the 0.9 style rules on the upgraded app, before its sources are patched. */
export async function styleRun(config: string): Promise<StyleRun> {
  const loaded = await load(config, dirname(config))
  const build = loaded.build(false)
  const traced = loaded.build(true)
  const styles = await projectStyles(loaded.path, build)
  if (!styles) return { skipped: '@hozu/css is not installed in the app', findings: [] }
  const verified = verify(build.ir, {
    bindings: build.bindings,
    lock: null,
    accept: true,
    unknownClasses: styles.unknown,
    classes: styles.classes,
  })
  const findings: StyleFinding[] = []
  for (const d of verified.diagnostics) {
    if (!CODES.has(d.code)) continue
    const node = at(build.ir, nodeOf(d.location.pointer))
    findings.push({
      code: d.code,
      pointer: d.location.pointer,
      message: d.message,
      source: d.location.source ?? resolveSource(traced.sources, d.location.pointer),
      patch: d.fix?.patch ?? null,
      node:
        node && typeof node === 'object' ? { class: node.class ?? null, toggle: node.toggle ?? {} } : null,
    })
  }
  return { skipped: null, findings }
}

export function styleRunIsolated(config: string): StyleRun {
  const self = fileURLToPath(import.meta.url)
  const child = spawnSync(
    process.execPath,
    ['--no-warnings', join(dirname(self), `migrate-styles${extname(self)}`), config],
    { cwd: dirname(config), maxBuffer: 1 << 28, env: { ...process.env, NODE_OPTIONS: '' } },
  )
  try {
    return JSON.parse(child.stdout.toString()) as StyleRun
  } catch {
    return {
      skipped: `the style rules did not run: ${child.stderr.toString().split('\n').find(Boolean) ?? 'no output'}`,
      findings: [],
    }
  }
}

const tokens = (s: string | null) => (s ?? '').split(/\s+/).filter(Boolean)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const guardOf = (v: J): J => ('test' in v ? v.test : { op: 'fn', fn: '%truthy', arg: { object: { v } } })
const complement = (v: J): J => {
  const g = guardOf(v)
  if (g.op === 'not') return 'test' in v ? { test: g.arg } : v
  if (g.op === 'eq' || g.op === 'neq') return { test: { ...g, op: g.op === 'eq' ? 'neq' : 'eq' } }
  return { test: { op: 'not', arg: g } }
}

const FLIP: Record<string, string> = { '===': '!==', '!==': '===', '==': '!=', '!=': '==' }
const SIMPLE = new Set(['Identifier', 'MemberExpression', 'CallExpression', 'Literal'])

function complementText(source: string, n: Node): string {
  const text = source.slice(n.start, n.end)
  if (n.type === 'UnaryExpression' && n.operator === '!')
    return source.slice(n.argument.start, n.argument.end)
  if (n.type === 'BinaryExpression' && FLIP[n.operator]) {
    const op = source.slice(n.left.end, n.right.start)
    return `${source.slice(n.start, n.left.end)}${op.replace(n.operator, FLIP[n.operator]!)}${source.slice(n.right.start, n.end)}`
  }
  return SIMPLE.has(n.type) ? `!${text}` : `!(${text})`
}

const stringText = (n: Node | undefined): string | null =>
  n?.type === 'Literal' && typeof n.value === 'string'
    ? n.value
    : n?.type === 'TemplateLiteral' && n.expressions.length === 0
      ? n.quasis[0].value.cooked
      : null

const offsetOf = (source: string, line: number, column: number) => {
  let at = 0
  for (let i = 1; i < line; i++) at = source.indexOf('\n', at) + 1
  return at + Math.max(0, column - 1)
}

function callAt(program: Node, source: string, loc: SourceLoc, cls: string | null): Node | null {
  const offset = offsetOf(source, loc.line, loc.column)
  let best: Node | null = null
  walk(program, (n) => {
    if (n.type !== 'CallExpression' || n.arguments[0]?.type !== 'ObjectExpression') return
    if (n.start > offset || n.end < offset) return
    if (lineOf(source, n.callee.end) !== loc.line && lineOf(source, n.start) !== loc.line) return
    const c = stringText(property(n.arguments[0], 'class')?.value)
    if (cls !== null && (c === null || !same(tokens(c), tokens(cls)))) return
    if (!best || n.start >= best.start) best = n
  })
  return best
}

const keyText = (p: Node): string | null => keyName(p) ?? stringText(p.key)

/**
 * The HZ079 and HZ074 patches as source edits; HZ072 sites are printed, since their fix is an intent
 * decision (ADR 0045 L). Returns the IR patches it applied, for the comparison with the 0.8 IR.
 */
export function applyStyleFindings(
  files: Map<string, string>,
  findings: StyleFinding[],
): { files: Map<string, string>; notes: Note[]; patches: JsonPatchOp[] } {
  const notes: Note[] = []
  const patches: JsonPatchOp[] = []
  const edits = new Map<string, Map<string, Edit>>()
  const programs = new Map<string, Node>()
  const print = (f: StyleFinding, why: string) =>
    notes.push({
      file: f.source?.file ?? '',
      line: f.source?.line ?? 0,
      rule: 'print',
      message: `${f.code} ${f.message}: ${why}`,
      see: 'views',
      behaviour: true,
    })
  const real = (f: string) => {
    try {
      return realpathSync(f)
    } catch {
      return f
    }
  }
  const byReal = new Map([...files.keys()].map((f) => [real(f), f]))
  for (const found of findings) {
    const f = found.source
      ? {
          ...found,
          source: { ...found.source, file: byReal.get(real(found.source.file)) ?? found.source.file },
        }
      : found
    if (f.code === 'HZ072') {
      print(f, 'declare a variant, or append ! for a one-off (an intent decision)')
      continue
    }
    if (!f.patch || !f.node || !f.source || !files.has(f.source.file)) {
      if (f.code === 'HZ079' || f.code === 'HZ074') print(f, 'no patch applies; fix it by hand')
      continue
    }
    const file = f.source.file
    const source = files.get(file)!
    let program = programs.get(file)
    if (!program) {
      program = parse(source)
      programs.set(file, program)
    }
    const call = callAt(program, source, f.source, f.node.class)
    const options = call?.arguments[0]
    const local: Edit[] = []
    let ok = Boolean(options)
    for (const op of f.patch) {
      if (!ok) break
      const rest = op.path.slice(nodeOf(f.pointer).length)
      if (rest === '/class' && op.op === 'replace') {
        const prop = property(options, 'class')
        if (!prop || stringText(prop.value) === null) ok = false
        else if (op.value === null) {
          const next = options.properties[options.properties.indexOf(prop) + 1]
          local.push([prop.start, next ? next.start : prop.end, ''])
        } else {
          const quote = source[prop.value.start] === '`' ? '`' : source[prop.value.start]
          local.push([prop.value.start, prop.value.end, `${quote}${op.value}${quote}`])
        }
        continue
      }
      const m = /^\/toggle\/(.+)$/.exec(rest)
      const toggle = property(options, 'toggle')?.value
      if (!m || toggle?.type !== 'ObjectExpression') {
        ok = false
        continue
      }
      const name = m[1]!.replaceAll('~1', '/').replaceAll('~0', '~')
      const entry = (k: string) =>
        toggle.properties.find((p: Node) => {
          const t = keyText(p)
          return t !== null && same(tokens(t), tokens(k))
        })
      if (op.op === 'add' && f.code === 'HZ079') {
        const from = Object.keys(f.node.toggle).find((k) => same(complement(f.node!.toggle[k]), op.value))
        const prop = from ? entry(from) : undefined
        if (!prop) ok = false
        else {
          const quote = source[prop.key.start] === '"' ? '"' : "'"
          const indent = /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', prop.start - 1) + 1))![0]
          local.push([
            prop.end,
            prop.end,
            `,\n${indent}${quote}${name}${quote}: ${complementText(source, prop.value)}`,
          ])
        }
      } else if (op.op === 'add' && f.code === 'HZ074') {
        const was = Object.keys(f.node.toggle).find(
          (k) => same(f.node!.toggle[k], op.value) && !same(tokens(k), tokens(name)),
        )
        const prop = was ? entry(was) : undefined
        if (!prop) ok = false
        else {
          const quote = source[prop.key.start] === '"' ? '"' : "'"
          local.push([prop.key.start, prop.key.end, `${quote}${name}${quote}`])
        }
      } else if (op.op !== 'remove' || f.code !== 'HZ074') ok = false
    }
    if (!ok || !local.length) {
      print(f, 'the patch does not map to a class literal in the source; fix it by hand')
      continue
    }
    const list = edits.get(file) ?? new Map<string, Edit>()
    for (const e of local) list.set(e.join('\u0000'), e)
    edits.set(file, list)
    for (const op of f.patch) if (!patches.some((p) => same(p, op))) patches.push(op)
    notes.push({
      file,
      line: f.source.line,
      rule: 'styles',
      message: `${f.code}: ${f.message}`,
      see: 'views',
    })
  }
  const out = new Map<string, string>()
  for (const [file, list] of edits) out.set(file, apply(files.get(file)!, [...list.values()]))
  return { files: out, notes, patches }
}

/** Applies JSON patch operations to a copy of an IR. */
export function patchIr(input: J, ops: JsonPatchOp[]): J {
  const ir = JSON.parse(JSON.stringify(input))
  for (const op of ops) {
    const keys = op.path
      .slice(1)
      .split('/')
      .map((t) => t.replaceAll('~1', '/').replaceAll('~0', '~'))
    const last = keys.pop()!
    const parent = keys.reduce((v, k) => v?.[k], ir)
    if (!parent) continue
    if (op.op === 'remove') delete parent[last]
    else parent[last] = op.value
  }
  return ir
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await styleRun(process.argv[2]!).catch(
    (error: unknown): StyleRun => ({
      skipped: `the app did not load: ${error instanceof Error ? error.message : String(error)}`,
      findings: [],
    }),
  )
  process.stdout.write(JSON.stringify(result), () => process.exit(0))
}
