import { part, ui } from '@hozu/core'
import { CodeBlock } from '../../site/code-block.ts'

export const articleBody = part((article: { html: string; hasCode: boolean }) =>
  article.hasCode ? ui.use(CodeBlock, {}, [ui.html(article.html)]) : ui.html(article.html),
)
