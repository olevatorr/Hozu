import { canonicalStringify, type JsonSchema, type RemoteContract, type RemoteEffect } from '@hozu/core/ir'

const pascal = (text: string) => {
  const name = text
    .replace(/(^|[^A-Za-z0-9])([A-Za-z0-9])/g, (_, __, c: string) => c.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, '')
  return /^[0-9]/.test(name) ? `X${name}` : name || 'X'
}

const methodOf = (ref: string) => ref.split('.').map(pascal).join('')

interface Struct {
  name: string
  fields: string[][]
}

const isRef = (t: string) => /^(\[\]|map\[|\*|json\.)/.test(t)

/** Columns padded the way gofmt aligns consecutive struct fields. */
const aligned = (rows: string[][]) => {
  const widths: number[] = []
  for (const row of rows)
    row.slice(0, -1).forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)))
  return rows.map((row) =>
    `\t${row.map((cell, i) => (i < row.length - 1 ? cell.padEnd(widths[i]!) : cell)).join(' ')}`.trimEnd(),
  )
}

const render = (s: Struct) =>
  s.fields.length ? `type ${s.name} struct {\n${aligned(s.fields).join('\n')}\n}` : `type ${s.name} struct{}`

class Types {
  readonly structs: Struct[] = []
  readonly #byShape = new Map<string, string>()
  readonly #names = new Set<string>()

  constructor(reserved: string[]) {
    for (const r of reserved) this.#names.add(r)
  }

  /** The Go type of a schema; `name` is used when it needs a new struct and has no `title`. */
  type(schema: JsonSchema, name: string, root: JsonSchema = schema): string {
    const ref = schema.$ref
    if (typeof ref === 'string') {
      const key = ref.replace(/^#\/\$defs\//, '')
      const def = (root.$defs as Record<string, JsonSchema> | undefined)?.[key]
      return def ? this.type(def, pascal(key), root) : 'json.RawMessage'
    }
    const any = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined
    if (any) {
      const rest = any.filter((s) => s.type !== 'null')
      if (rest.length === 1) {
        const t = this.type(rest[0]!, name, root)
        return rest.length < any.length && !isRef(t) ? `*${t}` : t
      }
      return 'json.RawMessage'
    }
    const values = (schema.enum ?? (schema.const !== undefined ? [schema.const] : null)) as unknown[] | null
    if (values) return values.every((v) => typeof v === 'string') ? 'string' : 'json.RawMessage'
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
    const nullable = types.includes('null')
    const base = this.#base(
      types.find((t) => t !== 'null'),
      schema,
      name,
      root,
    )
    return nullable && !isRef(base) ? `*${base}` : base
  }

  #base(type: string | undefined, schema: JsonSchema, name: string, root: JsonSchema): string {
    switch (type) {
      case 'string':
        return 'string'
      case 'boolean':
        return 'bool'
      case 'integer':
        return 'int64'
      case 'number':
        return 'float64'
      case 'array':
        return schema.items
          ? `[]${this.type(schema.items as JsonSchema, `${name}Item`, root)}`
          : '[]json.RawMessage'
      case 'object': {
        const props = schema.properties as Record<string, JsonSchema> | undefined
        const extra = schema.additionalProperties
        if (!props && extra && typeof extra === 'object')
          return `map[string]${this.type(extra as JsonSchema, `${name}Value`, root)}`
        return this.struct(schema, name, root)
      }
      default:
        return 'json.RawMessage'
    }
  }

  struct(schema: JsonSchema, name: string, root: JsonSchema = schema, fixed = false): string {
    const { title, description: _, ...shape } = schema
    const props = Object.entries((schema.properties as Record<string, JsonSchema> | undefined) ?? {})
    if (!fixed && !props.length) return this.#empty()
    if (!fixed && typeof title === 'string')
      return this.#named(
        pascal(title),
        () => this.#fields(schema, pascal(title), root),
        canonicalStringify(shape),
      )
    return this.#add(name, (unique) => this.#fields(schema, unique, root))
  }

  #empty(): string {
    if (!this.structs.some((s) => s.name === 'Empty')) this.structs.push({ name: 'Empty', fields: [] })
    return 'Empty'
  }

  /** A titled shape is one Go type wherever it appears; the same title with another shape gets a number. */
  #named(name: string, fields: () => string[][], shape = '{}'): string {
    const key = `${name} ${shape}`
    const known = this.#byShape.get(key)
    if (known) return known
    const unique = this.#add(name, () => fields())
    this.#byShape.set(key, unique)
    return unique
  }

  #add(wanted: string, fields: (unique: string) => string[][]): string {
    let unique = wanted
    for (let n = 2; this.#names.has(unique); n++) unique = `${wanted}${n}`
    this.#names.add(unique)
    const struct: Struct = { name: unique, fields: [] }
    this.structs.push(struct)
    struct.fields = fields(unique)
    return unique
  }

  #fields(schema: JsonSchema, owner: string, root: JsonSchema): string[][] {
    const required = new Set((schema.required as string[] | undefined) ?? [])
    return Object.entries((schema.properties as Record<string, JsonSchema> | undefined) ?? {}).map(
      ([prop, s]) => {
        const t = this.type(s, `${owner}${pascal(prop)}`, root)
        const optional = !required.has(prop)
        const values = (s.enum ?? null) as unknown[] | null
        return [
          pascal(prop),
          `${optional && !isRef(t) ? '*' : ''}${t}`,
          `\`json:"${prop}${optional ? ',omitempty' : ''}"\``,
          ...(values ? [`// one of ${values.map((v) => JSON.stringify(v)).join(', ')}`] : []),
        ]
      },
    )
  }
}

const describe = (e: RemoteEffect, errors: string[]) => {
  const parts = [
    `${e.ref} (${e.kind}${e.session ? ', with the session' : ', no session: public data'})`,
    ...(errors.length ? [`errors: ${errors.join(', ')}`] : []),
    ...(e.invalid ? ['may return Invalid'] : []),
  ]
  return `\t// ${parts.join('; ')}`
}

/** The Go contract of one `remote()` group: types, the Resolvers interface and the HTTP handler (ADR 0068). */
const tidy = (go: string) => go.replace(/\n{3,}/g, '\n\n')

export function goContract(contract: RemoteContract, pkg: string): string {
  const types = new Types([
    'Invalid',
    'Ctx',
    'Options',
    'Resolvers',
    'Handler',
    'Fingerprint',
    'Empty',
    'Upload',
  ])
  const session = contract.session ? types.struct(contract.session, 'Session', contract.session, true) : null
  const errorTypes: string[] = []
  const methods = contract.effects.map((e) => {
    const base = methodOf(e.ref)
    const input = types.type(e.input, `${base}Input`)
    const output = types.type(e.output, `${base}Output`)
    const errors = Object.entries(e.errors).map(([name, schema]) => {
      const type = types.struct(schema, `${base}${pascal(name)}`, schema, true)
      errorTypes.push(
        `func (e ${type}) Error() string { return "${e.ref}: ${name}" }\nfunc (e ${type}) failure() (string, string, any) {\n\treturn "${e.ref}", "${name}", e\n}`,
      )
      return type
    })
    return { e, base, input, output, errors }
  })
  const sessionType = session ?? 'struct{}'
  return tidy(`// Code generated by hozu gen from the Hozu declarations. DO NOT EDIT.
// Change the declarations in TypeScript, then run hozu gen (ADR 0068).

package ${pkg}

import (
\t"context"
\t"crypto/subtle"
\t"encoding/json"
\t"errors"
\t"log"
\t"net/http"
\t"reflect"
)

// Fingerprint is the contract this file was generated from; every call carries it.
const Fingerprint = "${contract.fingerprint}"

${types.structs.map(render).join('\n\n')}

${errorTypes.join('\n\n')}

// Invalid is the framework error of mutations and endpoints: a message and one message per input field.
type Invalid struct {
\tMessage string            \`json:"message"\`
\tFields  map[string]string \`json:"fields"\`
}

func (e Invalid) Error() string                  { return "Invalid: " + e.Message }
func (e Invalid) failure() (string, string, any) { return "", "Invalid", e }

// Ctx is one call. Session is nil when the visitor is signed out or the effect reads no session. Preview is
// true in preview mode; Header holds an endpoint's request headers (no cookie).
type Ctx struct {
\tContext context.Context
\tSession *${sessionType}
\tPreview bool
\tHeader  http.Header
\tfiles   map[string]Upload
\tchanged bool
\tnext    *${sessionType}
}

// Upload is a file a form sent with the call; Data holds its bytes.
type Upload struct {
\tName string \`json:"name"\`
\tType string \`json:"type"\`
\tSize int64  \`json:"size"\`
\tData []byte \`json:"data"\`
}

// File returns the upload a form field's token names, or nil (mutations and endpoints only).
func (c *Ctx) File(token string) *Upload {
\tif f, ok := c.files[token]; ok {
\t\treturn &f
\t}
\treturn nil
}

// SetSession signs the visitor in as s (mutations and endpoints only).
func (c *Ctx) SetSession(s ${sessionType}) { c.changed, c.next = true, &s }

// SignOut ends the visitor's session (mutations and endpoints only).
func (c *Ctx) SignOut() { c.changed, c.next = true, nil }

// Resolvers implements the effects that app.ts lists in remote(). Return a declared error as the error value.
type Resolvers interface {
${methods.map((m) => `${describe(m.e, m.errors)}\n\t${m.base}(ctx *Ctx, in ${m.input}) (${m.output}, error)`).join('\n')}
}

// Options configures Handler. Secret (16 characters or more) must equal the x-hozu-secret header of every call:
// the handler trusts the session a call carries, so it answers only the Hozu server.
type Options struct {
\tSecret string
}

type failure interface {
\terror
\tfailure() (effect string, name string, data any)
}

type request struct {
${aligned([
  ['Effect', 'string', '`json:"effect"`'],
  ['Input', 'json.RawMessage', '`json:"input"`'],
  ['Session', `*${sessionType}`, '`json:"session"`'],
  ['Preview', 'bool', '`json:"preview"`'],
  ['Headers', 'map[string]string', '`json:"headers"`'],
  ['Files', 'map[string]Upload', '`json:"files"`'],
]).join('\n')}
}

func call[I any, O any](ctx *Ctx, raw json.RawMessage, f func(*Ctx, I) (O, error)) (any, error) {
\tvar in I
\tif err := json.Unmarshal(raw, &in); err != nil {
\t\treturn nil, err
\t}
\tout, err := f(ctx, in)
\treturn filled(out), err
}

// filled replaces nil slices and maps with empty ones, so a list answers [] and never null.
func filled(v any) any {
\trv := reflect.New(reflect.TypeOf(v)).Elem()
\trv.Set(reflect.ValueOf(v))
\tfill(rv)
\treturn rv.Interface()
}

func fill(v reflect.Value) {
\tswitch v.Kind() {
\tcase reflect.Slice:
\t\tif v.IsNil() && v.CanSet() {
\t\t\tv.Set(reflect.MakeSlice(v.Type(), 0, 0))
\t\t}
\t\tfor i := 0; i < v.Len(); i++ {
\t\t\tfill(v.Index(i))
\t\t}
\tcase reflect.Map:
\t\tif v.IsNil() && v.CanSet() {
\t\t\tv.Set(reflect.MakeMap(v.Type()))
\t\t}
\tcase reflect.Pointer:
\t\tif !v.IsNil() {
\t\t\tfill(v.Elem())
\t\t}
\tcase reflect.Struct:
\t\tfor i := 0; i < v.NumField(); i++ {
\t\t\tif v.Type().Field(i).IsExported() {
\t\t\t\tfill(v.Field(i))
\t\t\t}
\t\t}
\t}
}

// Handler answers the calls of the Hozu server: POST { effect, input, session } → { ok } | { fail } (+ session).
func Handler(r Resolvers, o Options) http.Handler {
\tif len(o.Secret) < 16 {
\t\tpanic("hozu: Options.Secret must hold the 16 or more characters of the app's remote() secret")
\t}
\treturn http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
\t\tif req.Method != http.MethodPost {
\t\t\thttp.Error(w, "POST only", http.StatusMethodNotAllowed)
\t\t\treturn
\t\t}
\t\tif subtle.ConstantTimeCompare([]byte(req.Header.Get("X-Hozu-Secret")), []byte(o.Secret)) != 1 {
\t\t\thttp.Error(w, "wrong x-hozu-secret", http.StatusUnauthorized)
\t\t\treturn
\t\t}
\t\tif got := req.Header.Get("X-Hozu-Fingerprint"); got != Fingerprint {
\t\t\thttp.Error(w, "contract "+got+" is not "+Fingerprint+": run hozu gen and rebuild", http.StatusConflict)
\t\t\treturn
\t\t}
\t\tvar body request
\t\tif err := json.NewDecoder(req.Body).Decode(&body); err != nil {
\t\t\thttp.Error(w, err.Error(), http.StatusBadRequest)
\t\t\treturn
\t\t}
\t\tctx := &Ctx{Context: req.Context(), Session: body.Session, Preview: body.Preview, Header: http.Header{}, files: body.Files}
\t\tfor k, v := range body.Headers {
\t\t\tctx.Header.Set(k, v)
\t\t}
\t\tvar out any
\t\tvar err error
\t\tswitch body.Effect {
${methods.map((m) => `\t\tcase "${m.e.ref}":\n\t\t\tout, err = call(ctx, body.Input, r.${m.base})`).join('\n')}
\t\tdefault:
\t\t\thttp.Error(w, "unknown effect "+body.Effect, http.StatusNotFound)
\t\t\treturn
\t\t}
\t\tres := map[string]any{}
\t\tvar f failure
\t\tswitch {
\t\tcase err == nil:
\t\t\tres["ok"] = out
\t\tcase errors.As(err, &f):
\t\t\teffect, name, data := f.failure()
\t\t\tif effect != "" && effect != body.Effect {
\t\t\t\tlog.Printf("hozu: %s returned %s, an error of %s", body.Effect, name, effect)
\t\t\t\thttp.Error(w, "undeclared error", http.StatusInternalServerError)
\t\t\t\treturn
\t\t\t}
\t\t\tres["fail"] = map[string]any{"name": name, "data": data}
\t\tdefault:
\t\t\tlog.Printf("hozu: %s: %v", body.Effect, err)
\t\t\thttp.Error(w, "resolver failed", http.StatusInternalServerError)
\t\t\treturn
\t\t}
\t\tif ctx.changed {
\t\t\tres["session"] = ctx.next
\t\t}
\t\tw.Header().Set("Content-Type", "application/json")
\t\tif err := json.NewEncoder(w).Encode(res); err != nil {
\t\t\tlog.Printf("hozu: %s: %v", body.Effect, err)
\t\t}
\t})
}
`)
}

/** The fingerprint a generated Go contract declares, or null when the text has none. */
export const goFingerprint = (text: string): string | null =>
  /^const Fingerprint = "([0-9a-f]+)"$/m.exec(text)?.[1] ?? null
