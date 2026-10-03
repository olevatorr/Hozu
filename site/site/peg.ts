import { ui } from '@hozu/core'

type Mood = 'calm' | 'hello' | 'wait' | 'fits' | 'oops'

const art: Record<Mood, { file: string; width: number; height: number; alt: string }> = {
  calm: { file: 'peg', width: 150, height: 250, alt: 'Peg, the red peg that checks' },
  hello: { file: 'peg-hello-animated', width: 200, height: 250, alt: 'Peg, the red peg that checks, waving' },
  wait: { file: 'peg-wait-animated', width: 360, height: 460, alt: 'Peg holds up a sign: WAIT.' },
  fits: { file: 'peg-fits-animated', width: 360, height: 460, alt: 'Peg holds up a sign: FITS!' },
  oops: { file: 'peg-oops-animated', width: 360, height: 460, alt: 'Peg holds up a sign: OOPS!' },
}

export const peg = (mood: Mood, body: number, className: string, decorative = false) => {
  const scale = body / 250
  const { file, width, height, alt } = art[mood]
  return ui.img({
    src: ui.asset(new URL(`../assets/peg/${file}.svg`, import.meta.url)),
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    alt: decorative ? '' : alt,
    class: className,
  })
}
