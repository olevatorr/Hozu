import { implement } from '@hozu/core/component'
import type { CodeCopy } from './components.ts'

export default implement<typeof CodeCopy>(({ el, signal }) => {
  for (const pre of el.querySelectorAll('pre')) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.copy = ''
    button.textContent = 'Copy'
    button.setAttribute('aria-label', 'Copy code')
    button.addEventListener(
      'click',
      () => {
        const code = pre.querySelector('code') ?? pre
        const done = () => {
          button.textContent = 'Copied'
          setTimeout(() => {
            button.textContent = 'Copy'
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
    pre.dataset.copyable = ''
    pre.append(button)
  }
  return { destroy: () => el.querySelectorAll('[data-copy]').forEach((b) => b.remove()) }
})
