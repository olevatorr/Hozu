import { resolvers } from '@tenon/data'
import { slides, stats } from './features/site/effects.ts'
import project from './tenon.config.ts'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const createResolvers = () =>
  resolvers(project, (implement) => [
    implement(slides, () =>
      ['Islands', 'Contracts', 'Motion', 'Widgets', 'Tailwind', 'Streaming'].map((title, i) => ({
        id: `s${i}`,
        title,
        body: `${title} without giving up verification.`,
        hue: 200 + i * 28,
      })),
    ),
    implement(stats, () => ({
      visits: { label: 'Visits', labels: days, values: [320, 410, 380, 520, 610, 450, 390] },
      signups: { label: 'Sign-ups', labels: days, values: [12, 18, 15, 26, 31, 22, 17] },
    })),
  ])
