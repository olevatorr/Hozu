import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { htmlElementAttributes as html } from 'html-element-attributes'
import { svgElementAttributes as svg } from 'svg-element-attributes'

const out = fileURLToPath(new URL('../packages/core/src/ir/dom-data.ts', import.meta.url))
const propsOut = fileURLToPath(new URL('../packages/core/src/builders/dom-props.ts', import.meta.url))

export const htmlTags =
  `a abbr address area article aside audio b bdi bdo blockquote br button canvas caption cite
code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form
h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li main map mark menu meter nav noscript object ol
optgroup option output p picture pre progress q rp rt ruby s samp search section select small source span strong sub
summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr`.split(/\s+/)

export const svgTags = `svg animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend
feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight
feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset
fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject g image line linearGradient
marker mask metadata mpath path pattern polygon polyline radialGradient rect set stop switch symbol text textPath
tspan use view`.split(/\s+/)

const voids = 'area br col embed hr img input source track wbr'.split(' ')

const excluded = new Set(
  `class style nonce is slot part exportparts srcdoc align alink archive axis background bgcolor border cellpadding
cellspacing char charoff classid clear codebase codetype color compact declare face frameborder hspace link
longdesc marginheight marginwidth nohref noshade nowrap profile rev rules scheme scrolling standby summary valign
valuetype version vlink vspace datafld dataformatas datasrc language event alpha colorspace code about datatype
property resource typeof content rel externalResourcesRequired requiredFeatures requiredExtensions requiredFonts
requiredFormats focusable focusHighlight enable-background kerning glyph-orientation-horizontal
glyph-orientation-vertical clip color-profile baseProfile contentScriptType contentStyleType zoomAndPan version
xlink:href xlink:title xlink:show xlink:actuate xlink:type xlink:role xlink:arcrole xml:space xml:base xml:lang
externalresourcesrequired playbackorder timelinebegin snapshotTime`.split(/\s+/),
)
const keep = (a: string) => !excluded.has(a) && !a.startsWith('nav-') && !a.startsWith('on')

const globalHtml = [...html['*']!.filter(keep), 'role'].sort()
const presentation = [...svg['*']!.filter(keep), 'role'].sort()
const presentationSet = new Set(presentation)

const attrs: Record<string, string[]> = {}
for (const tag of htmlTags) attrs[tag] = (html[tag] ?? []).filter(keep).sort()
attrs.textarea = [...attrs.textarea!, 'value'].sort()
for (const tag of svgTags) {
  const own = (svg[tag] ?? []).filter((a) => keep(a) && !presentationSet.has(a))
  if (
    [
      'image',
      'use',
      'feImage',
      'textPath',
      'mpath',
      'pattern',
      'linearGradient',
      'radialGradient',
      'filter',
    ].includes(tag)
  )
    own.push('href')
  if (tag === 'svg') own.push('xmlns')
  attrs[tag] = [...new Set(own)].sort()
}

const referrer =
  'no-referrer no-referrer-when-downgrade origin origin-when-cross-origin same-origin strict-origin strict-origin-when-cross-origin unsafe-url'
const enctype = 'application/x-www-form-urlencoded multipart/form-data text/plain'
const enumerated: Record<string, string> = {
  '*.autocapitalize': 'off none on sentences words characters',
  '*.contenteditable': 'true false plaintext-only',
  '*.dir': 'ltr rtl auto',
  '*.draggable': 'true false',
  '*.enterkeyhint': 'enter done go next previous search send',
  '*.hidden': 'hidden until-found',
  '*.inputmode': 'none text decimal numeric tel search email url',
  '*.popover': 'auto manual hint',
  '*.spellcheck': 'true false',
  '*.translate': 'yes no',
  '*.crossorigin': 'anonymous use-credentials',
  '*.referrerpolicy': referrer,
  '*.fetchpriority': 'high low auto',
  '*.loading': 'eager lazy',
  'button.type': 'submit reset button',
  'button.formmethod': 'get post dialog',
  'button.formenctype': enctype,
  'button.popovertargetaction': 'toggle show hide',
  'button.command': 'show-modal close request-close show-popover hide-popover toggle-popover',
  'input.type':
    'button checkbox color date datetime-local email file hidden image month number password radio range reset search submit tel text time url week',
  'input.formmethod': 'get post dialog',
  'input.formenctype': enctype,
  'input.popovertargetaction': 'toggle show hide',
  'form.method': 'get post dialog',
  'form.enctype': enctype,
  'img.decoding': 'sync async auto',
  'ol.type': '1 a A i I',
  'th.scope': 'row col rowgroup colgroup',
  'track.kind': 'subtitles captions descriptions chapters metadata',
  'textarea.wrap': 'soft hard',
  'audio.preload': 'none metadata auto',
  'video.preload': 'none metadata auto',
  'area.shape': 'circle default poly rect',
}
const valuesOf = (tag: string, attr: string) => {
  const v = enumerated[`${tag}.${attr}`] ?? enumerated[`*.${attr}`]
  return v ? v.split(' ') : null
}
const enumsOf = (tag: string, names: string[]) =>
  Object.fromEntries(
    names
      .map((a) => [a, tag === '*' ? enumerated[`*.${a}`]?.split(' ') : valuesOf(tag, a)] as const)
      .filter(([, v]) => v),
  )
const attrValues = Object.fromEntries(
  [
    ['*', enumsOf('*', globalHtml)] as const,
    ...htmlTags.map((t) => [t, enumsOf(t, attrs[t]!)] as const),
  ].filter(([, v]) => Object.keys(v).length),
)

const list = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(', ')}]`
const body = `// Generated by scripts/gen-dom.ts from html-element-attributes and svg-element-attributes. Do not edit.
export const htmlTags = ${list(htmlTags)} as const
export const svgTags = ${list(svgTags)} as const
export const voidTags = ${list(voids)} as const
export const htmlGlobalAttrs = ${list(globalHtml)} as const
export const svgGlobalAttrs = ${list(presentation)} as const
export const tagAttrs = {
${[...htmlTags, ...svgTags].map((t) => `  ${/^[a-z][a-zA-Z0-9]*$/.test(t) ? t : `'${t}'`}: ${list(attrs[t]!)},`).join('\n')}
} as const
export const attrValues: Record<string, Record<string, readonly string[]>> = ${JSON.stringify(attrValues)}
`
writeFileSync(out, body)

const key = (a: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(a) ? a : `'${a}'`)
const customCommand = ['`--', '{string}`'].join('$')
const typeOf = (tag: string, a: string) => {
  const v = tag === '*' ? enumerated[`*.${a}`]?.split(' ') : valuesOf(tag, a)
  return v
    ? `E<${[...v.map((x) => `'${x}'`), ...(a === 'command' ? [customCommand] : [])].join(' | ')}>`
    : 'V'
}
const members = (xs: string[]) => xs.map((a) => `  ${key(a)}?: ${typeOf('*', a)}`).join('\n')
const props = `// Generated by scripts/gen-dom.ts. Do not edit.
type V = import('./ui.ts').AttrValue
type NV = Exclude<V, string>
type E<T extends string> = T | NV

export interface HtmlGlobalProps {
${members(globalHtml)}
}

export interface SvgGlobalProps {
${members(presentation)}
}

export interface TagProps {
${[...htmlTags, ...svgTags]
  .map(
    (t) =>
      `  ${key(t)}: ${svgTags.includes(t) ? 'SvgGlobalProps' : 'HtmlGlobalProps'}${attrs[t]!.length ? ` & {\n${attrs[t]!.map((a) => `    ${key(a)}?: ${svgTags.includes(t) ? 'V' : typeOf(t, a)}`).join('\n')}\n  }` : ''}`,
  )
  .join('\n')}
}
`
writeFileSync(propsOut, props)
