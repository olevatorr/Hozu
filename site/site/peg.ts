import { ui } from '@hozu/core'

type Mood = 'calm' | 'happy' | 'wait' | 'fits' | 'oops'

const files: Record<Mood, string> = {
  calm: 'peg',
  happy: 'peg-happy-animated',
  wait: 'peg-wait',
  fits: 'peg-fits',
  oops: 'peg-oops',
}
const alts: Record<Mood, string> = {
  calm: 'Peg, the red peg that checks',
  happy: 'Peg, the red peg that checks, smiling',
  wait: 'Peg holds up a sign: WAIT.',
  fits: 'Peg holds up a sign: FITS!',
  oops: 'Peg holds up a sign: OOPS!',
}
const signed = (mood: Mood) => mood === 'wait' || mood === 'fits' || mood === 'oops'

export const peg = (mood: Mood, body: number, className: string, decorative = false) => {
  const scale = body / 250
  return ui.img({
    src: ui.asset(new URL(`../assets/peg/${files[mood]}.svg`, import.meta.url)),
    width: Math.round((signed(mood) ? 230 : 150) * scale),
    height: Math.round((signed(mood) ? 410 : 250) * scale),
    alt: decorative ? '' : alts[mood],
    class: className,
  })
}
