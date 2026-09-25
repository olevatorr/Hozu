export interface DomFields {
  value: string
  checked: boolean
  valueAsNumber: number | null
  files: { name: string; size: number; type: string }[]
  form: (name: string) => string
  key: string
  code: string
  repeat: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  clientX: number
  clientY: number
  offsetX: number
  offsetY: number
  pageX: number
  pageY: number
  button: number
  pointerType: string
  deltaX: number
  deltaY: number
  scrollTop: number
  scrollLeft: number
  scrollHeight: number
  scrollWidth: number
  clientHeight: number
  clientWidth: number
  open: boolean
  newState: string
  returnValue: string
  currentTime: number
  duration: number
  paused: boolean
  volume: number
  muted: boolean
}

export type DomField = keyof DomFields

const modifiers = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const
const pointer = [
  ...modifiers,
  'clientX',
  'clientY',
  'offsetX',
  'offsetY',
  'pageX',
  'pageY',
  'button',
] as const
const pointerEvents = [...pointer, 'pointerType'] as const
const input = ['value', 'checked', 'valueAsNumber', 'files'] as const
const key = [...modifiers, 'key', 'code', 'repeat', 'value'] as const
const scroll = [
  'scrollTop',
  'scrollLeft',
  'scrollHeight',
  'scrollWidth',
  'clientHeight',
  'clientWidth',
] as const
const media = ['currentTime', 'duration', 'paused', 'volume', 'muted'] as const
const toggle = ['open', 'newState'] as const
const none = [] as const

export const eventFields = {
  click: pointer,
  dblclick: pointer,
  contextmenu: pointer,
  auxclick: pointer,
  mousedown: pointer,
  mouseup: pointer,
  mousemove: pointer,
  mouseenter: pointer,
  mouseleave: pointer,
  mouseover: pointer,
  mouseout: pointer,
  pointerdown: pointerEvents,
  pointerup: pointerEvents,
  pointermove: pointerEvents,
  pointerenter: pointerEvents,
  pointerleave: pointerEvents,
  pointerover: pointerEvents,
  pointerout: pointerEvents,
  pointercancel: pointerEvents,
  wheel: [...pointer, 'deltaX', 'deltaY'],
  dragstart: pointer,
  drag: pointer,
  dragend: pointer,
  dragenter: pointer,
  dragover: pointer,
  dragleave: pointer,
  drop: [...pointer, 'files'],
  touchstart: modifiers,
  touchmove: modifiers,
  touchend: modifiers,
  touchcancel: modifiers,
  keydown: key,
  keyup: key,
  input,
  change: input,
  beforeinput: ['value'],
  select: ['value'],
  invalid: ['value'],
  reset: none,
  submit: ['form'],
  focus: ['value'],
  blur: ['value'],
  focusin: ['value'],
  focusout: ['value'],
  scroll,
  scrollend: scroll,
  toggle,
  beforetoggle: toggle,
  close: ['returnValue'],
  cancel: none,
  load: none,
  error: none,
  play: media,
  pause: media,
  ended: media,
  timeupdate: media,
  volumechange: media,
  loadedmetadata: media,
  seeking: media,
  seeked: media,
  animationstart: none,
  animationend: none,
  animationiteration: none,
  transitionstart: none,
  transitionend: none,
  copy: none,
  cut: none,
  paste: none,
} as const satisfies Record<string, readonly DomField[]>

export type DomEvent = keyof typeof eventFields

export const domEvents = Object.keys(eventFields) as DomEvent[]

export const passiveEvents: readonly DomEvent[] = [
  'scroll',
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
  'pointermove',
  'mousemove',
]
