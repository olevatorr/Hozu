import {
  type ClassValue,
  createTV as createBase,
  type TVCompoundSlots,
  type TVCompoundVariants,
  type TVConfig,
  type TVDefaultVariants,
  type TVReturnType,
  type TVReturnTypeLike,
  type TVVariants,
  tv as tvBase,
} from 'tailwind-variants'

type Slots = Record<string, ClassValue> | undefined

interface Recorded {
  readonly hozu?: 'tv'
}

/** tailwind-variants' `TV`, with an intersection result: TS skips a generic call that returns a plain function type while it infers `ui.component`, so inline `styles: tv({…})` would be typed after the render. */
export type TV = <
  V extends TVVariants<S, B, EV>,
  CV extends TVCompoundVariants<V, S, B, EV, ES>,
  DV extends TVDefaultVariants<V, S, EV, ES>,
  B extends ClassValue = undefined,
  S extends Slots = undefined,
  E extends TVReturnTypeLike<any, any> = TVReturnTypeLike<V, S>,
  EV extends TVVariants<ES, B, E['variants'], ES> = E['variants'],
  ES extends Slots = E['slots'] extends Slots ? E['slots'] : undefined,
>(
  options: {
    extend?: E
    base?: B
    slots?: S
    variants?: V
    compoundVariants?: CV
    compoundSlots?: TVCompoundSlots<V, S, B>
    defaultVariants?: DV
  },
  settings?: TVConfig,
) => TVReturnType<V, S, B, EV, ES, E> & Recorded

export const createTV = (settings: TVConfig): TV => createBase(settings) as TV
export const tv: TV = tvBase as TV
