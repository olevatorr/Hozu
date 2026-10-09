import { implement } from '@hozu/core/component'
import type { CodeBlock } from './code-block.ts'

const words =
  document.documentElement.lang === 'zh-TW'
    ? { copy: '複製', copied: '已複製', label: '複製程式碼' }
    : { copy: 'Copy', copied: 'Copied', label: 'Copy code' }

export default implement<typeof CodeBlock>(({ el, signal }) => {
  for (const pre of el.querySelectorAll('pre')) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.copy = ''
    button.textContent = words.copy
    button.setAttribute('aria-label', words.label)
    button.addEventListener(
      'click',
      () => {
        const code = pre.querySelector('code') ?? pre
        const done = () => {
          button.textContent = words.copied
          setTimeout(() => {
            button.textContent = words.copy
          }, 2000)
        }
        if (navigator.clipboard) void navigator.clipboard.writeText(code.textContent ?? '').then(done)
        else {
          const range = document.createRange()
          range.selectNodeContents(code)
          getSelection()?.removeAllRanges()
          getSelection()?.addRange(range)
          if (document.execCommand('copy')) done()
        }
      },
      { signal },
    )
    const host = pre.closest('figure') ?? pre.parentElement ?? pre
    host.dataset.copyable = ''
    host.append(button)
  }
  return { destroy: () => el.querySelectorAll('[data-copy]').forEach((b) => b.remove()) }
})
