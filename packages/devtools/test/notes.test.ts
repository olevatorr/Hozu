// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { pickTarget } from '../src/overlay/notes.ts'

describe('the element a note frames (ADR 0056 D, 0.16 review)', () => {
  it('with --in, the target inside the list row whose text holds it, like browse', () => {
    document.body.innerHTML = `<ul>
      <li><span>Call   Bob</span><button data-hz="n.Board/item/2">Delete</button></li>
      <li><b>Buy</b> <i>Milk</i><button data-hz="n.Board/item/2">Delete</button></li>
    </ul>`
    const [, second] = document.querySelectorAll('button')
    expect(pickTarget(document, 'n.Board/item/2', 'buy milk')).toBe(second)
    expect(pickTarget(document, 'n.Board/item/2', null)).toBe(document.querySelector('button'))
    expect(pickTarget(document, 'n.Board/item/2', 'Pears')).toBeNull()
  })
})
