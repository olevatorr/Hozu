// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { type Catalogued, lucideNames, partsOf } from '../src/overlay/assets.ts'
import { gestureGuard } from '../src/overlay/drop.ts'

const component = (id: string) => ({ id, name: id.split('.')[1] }) as Catalogued

describe('Assets: parts, icons and the end of a drag', () => {
  it('lists a parent’s parts by the kit catalog, only when both are in the app', () => {
    const catalog = ['ui.Table', 'ui.Tr', 'ui.Th', 'ui.Button', 'ui.NavLink'].map(component)
    const parts = partsOf(catalog, {
      kit: 'ui',
      version: '0.1.0',
      partial: false,
      available: [],
      parts: { Table: ['Tr', 'Th', 'Td'], NavBar: ['NavLink'] },
    })
    expect([...parts].map(([id, list]) => [id, list.map((c) => c.id)])).toEqual([
      ['ui.Table', ['ui.Tr', 'ui.Th']],
    ])
    expect(partsOf(catalog, { kit: null, version: null, partial: false, available: [] }).size).toBe(0)
  })

  it('reads a Lucide name as typed: kebab, camel or with spaces', () => {
    expect(lucideNames('arrow-up')).toEqual({ lucide: 'arrow-up', name: 'arrowUp' })
    expect(lucideNames(' alarmClock ')).toEqual({ lucide: 'alarm-clock', name: 'alarmClock' })
    expect(lucideNames('circle check 2')).toEqual({ lucide: 'circle-check-2', name: 'circleCheck2' })
    expect(lucideNames('<svg>')).toBeNull()
  })

  it('swallows the page’s mouse events from the drag to the click that ends it', () => {
    const guard = gestureGuard(() => [window])
    let clicks = 0
    const button = document.createElement('button')
    button.addEventListener('click', () => clicks++)
    document.body.append(button)
    guard.hold()
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(clicks).toBe(0)
    expect(guard.holding()).toBe(false)
    button.click()
    expect(clicks).toBe(1)
  })
})
