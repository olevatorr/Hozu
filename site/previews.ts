import { previews } from '@hozu/core/preview'
import { getRelease, listTrials } from './features/content/model.ts'
import { home, trials } from './routes.ts'
import { Button } from './site/button.ts'
import { CatchCard } from './site/catch-card.ts'
import { ReceiptLine } from './site/receipt.ts'
import { SpeedTable } from './site/speed-table.ts'
import { Steps } from './site/steps.ts'

const trial = (n: number, title: string) => ({
  slug: `${String(n).padStart(4, '0')}-preview`,
  title,
  description: 'A trial written for the preview.',
  order: n,
})

export default previews((p) => [
  p.component(Button, 'Long label', {
    props: { href: '/' },
    children: 'Read every chapter of the guide before you start →',
  }),
  p.component(CatchCard, 'Long story', {
    props: {
      code: 'HZ049',
      name: 'user-data-cached',
      story: 'Your notes, on someone else’s screen, after a cache warmed up on another visit.',
      message: 'scope: "user" data reaches a cacheable region',
      fix: 'use freshness "request" or "live"',
    },
  }),
  p.component(ReceiptLine, 'Long value', {
    props: { claim: 'js', label: 'Client JS on the notes list', value: '24.0 KB vs 233.9 KB', href: '/' },
  }),
  p.component(SpeedTable, 'One framework', {
    props: {
      caption: 'One row only',
      rows: [
        {
          id: 'hozu',
          framework: 'Hozu 0.17.0',
          versions: 'adapter-node',
          requests: '16,870',
          js: '8.1 KB',
          interactive: '54 ms',
        },
      ],
    },
  }),
  p.component(Steps, 'Five steps', {
    props: {
      items: [1, 2, 3, 4, 5].map((n) => ({
        id: String(n),
        title: `${n} · Step`,
        body: 'One short sentence about it.',
      })),
    },
  }),
  p.page(trials, 'No trials yet', [p.data(listTrials, [])]),
  p.page(trials, 'Thirty trials', [
    p.data(
      listTrials,
      Array.from({ length: 30 }, (_, i) =>
        trial(30 - i, `Trial ${30 - i}: a long title that has to wrap on a phone`),
      ),
    ),
  ]),
  p.page(trials, 'Trials failed to load', [p.fail(listTrials, 'Unexpected')]),
  p.page(home, 'Version 1.0.0', [p.data(getRelease, { version: '1.0.0' })]),
])
