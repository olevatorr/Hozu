import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import typescript from 'highlight.js/lib/languages/typescript'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
const languages: Record<string, string> = {
  ts: 'typescript',
  js: 'typescript',
  typescript: 'typescript',
  javascript: 'typescript',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  css: 'css',
  json: 'json',
}
const decode = (value: string) =>
  value.replace(
    /&(amp|lt|gt|quot|#39);/g,
    (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]!,
  )
export const highlight = (html: string) =>
  html.replace(
    /<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_, language: string | undefined, code: string) => {
      const name = language && languages[language]
      const body = name ? hljs.highlight(decode(code), { language: name, ignoreIllegals: true }).value : code
      return `<figure data-code><figcaption>${name ?? 'Plain text'}</figcaption><pre tabindex="0" aria-label="Code example"><code>${body}</code></pre></figure>`
    },
  )
