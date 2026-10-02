import { createTV } from '@hozu/variants'

// hozu:variants-config site
const twMergeConfig = {
  extend: {
    theme: {
      animate: ['rise', 'ticker'],
      color: ['ember', 'green', 'ink', 'paper', 'red', 'sand'],
    },
    classGroups: {
      prose: ['prose'],
      'prose-2xl': ['prose-2xl'],
      'prose-amber': ['prose-amber'],
      'prose-base': ['prose-base'],
      'prose-blue': ['prose-blue'],
      'prose-cyan': ['prose-cyan'],
      'prose-emerald': ['prose-emerald'],
      'prose-fuchsia': ['prose-fuchsia'],
      'prose-gray': ['prose-gray'],
      'prose-green': ['prose-green'],
      'prose-indigo': ['prose-indigo'],
      'prose-invert': ['prose-invert'],
      'prose-lg': ['prose-lg'],
      'prose-lime': ['prose-lime'],
      'prose-neutral': ['prose-neutral'],
      'prose-orange': ['prose-orange'],
      'prose-pink': ['prose-pink'],
      'prose-purple': ['prose-purple'],
      'prose-red': ['prose-red'],
      'prose-rose': ['prose-rose'],
      'prose-sky': ['prose-sky'],
      'prose-slate': ['prose-slate'],
      'prose-sm': ['prose-sm'],
      'prose-stone': ['prose-stone'],
      'prose-teal': ['prose-teal'],
      'prose-violet': ['prose-violet'],
      'prose-xl': ['prose-xl'],
      'prose-yellow': ['prose-yellow'],
      'prose-zinc': ['prose-zinc'],
    },
  },
}
// /hozu:variants-config

export const tv = createTV({ twMergeConfig })
