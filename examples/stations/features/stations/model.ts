import { event, fn, invoke, machine, mutation, on, query, tag, ui } from '@hozu/core'
import { z } from 'zod'
import { home } from '../../routes.ts'

export const Station = z.object({
  id: z.string(),
  name: z.string(),
  district: z.string(),
  lat: z.number(),
  lng: z.number(),
  bikes: z.number(),
  docks: z.number(),
  favorite: z.boolean(),
})
const Stations = z.array(Station)
const Filter = z.object({ stations: Stations, q: z.string(), district: z.string() })

export const Search = event({ payload: z.object({ text: z.string() }) })
export const PickDistrict = event({ payload: z.object({ district: z.string() }) })
export const Select = event({ payload: z.object({ id: z.string() }) })
export const ToggleFavorite = event({ payload: z.object({ id: z.string() }) })
export const StartTour = event({ payload: z.object({ ids: z.array(z.string()) }) })
export const StopTour = event({ payload: z.object({}) })

export const stationsTag = tag({ param: null })
export const listStations = query({
  input: z.object({}),
  output: Stations,
  scope: 'public',
  freshness: 'static',
  tags: () => [stationsTag()],
  runs: 'server',
})
export const toggleFavorite = mutation({
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string(), favorite: z.boolean() }),
  invalidates: () => [stationsTag()],
  runs: 'server',
  access: 'anyone',
})

const matches = (s: { name: string; district: string }, q: string, district: string) =>
  s.name.toLowerCase().includes(q.trim().toLowerCase()) && (district === '' || s.district === district)

export const visible = fn({
  input: Filter,
  output: Stations,
  impl: ({ stations, q, district }) =>
    stations
      .filter((s) => matches(s, q, district))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)),
})
export const total = fn({
  input: Filter,
  output: z.number(),
  impl: ({ stations, q, district }) =>
    stations.filter((s) => matches(s, q, district)).reduce((sum, s) => sum + s.bikes, 0),
})
export const byDistrict = fn({
  input: Filter,
  output: z.array(z.object({ district: z.string(), bikes: z.number() })),
  impl: ({ stations, q, district }) => {
    const sums = new Map<string, number>()
    for (const s of stations)
      if (matches(s, q, district)) sums.set(s.district, (sums.get(s.district) ?? 0) + s.bikes)
    return [...sums]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, bikes]) => ({ district: name, bikes }))
  },
})
export const districts = fn({
  input: z.object({ stations: Stations }),
  output: z.array(z.string()),
  impl: ({ stations }) => [...new Set(stations.map((s) => s.district))].sort(),
})
export const selected = fn({
  input: z.object({ stations: Stations, id: z.string() }),
  output: Stations,
  impl: ({ stations, id }) => stations.filter((s) => s.id === id),
})
export const nextStop = fn({
  input: z.object({ ids: z.array(z.string()), current: z.string() }),
  output: z.string(),
  impl: ({ ids, current }) => ids[(ids.indexOf(current) + 1) % ids.length] ?? '',
})

export const stationsMachine = machine({
  context: z.object({
    q: z.string(),
    district: z.string(),
    selected: z.string(),
    tour: z.array(z.string()),
    target: z.string(),
  }),
  initialContext: { q: '', district: '', selected: '', tour: [], target: '' },
  initial: 'idle',
  on: ({ ctx }) => [
    on(Search, {
      target: 'idle',
      assign: (e) => {
        ctx.q = e.text
      },
      replace: () => ui.link(home, null, { q: ctx.q, district: ctx.district }),
    }),
    on(PickDistrict, {
      target: 'idle',
      assign: (e) => {
        ctx.district = e.district
      },
      replace: () => ui.link(home, null, { q: ctx.q, district: ctx.district }),
    }),
    on(Select, {
      assign: (e) => {
        ctx.selected = e.id
      },
    }),
    on(ToggleFavorite, {
      target: 'favoriting',
      assign: (e) => {
        ctx.target = e.id
      },
    }),
  ],
  states: ({ ctx }) => ({
    idle: {
      on: [
        on(StartTour, {
          target: 'touring',
          guard: (e) => e.ids.length > 0,
          assign: (e) => {
            ctx.tour = e.ids
            ctx.selected = e.ids[0] ?? ''
          },
        }),
      ],
    },
    touring: {
      after: [
        {
          ms: 1500,
          target: 'touring',
          assign: () => {
            ctx.selected = nextStop({ ids: ctx.tour, current: ctx.selected })
          },
        },
      ],
      on: [on(StopTour, { target: 'idle' })],
    },
    favoriting: {
      invoke: invoke(toggleFavorite, {
        input: { id: ctx.target },
        done: 'idle',
        failed: { Unexpected: 'idle' },
      }),
    },
  }),
})
export const idsOf = fn({
  input: z.object({ stations: Stations }),
  output: z.array(z.string()),
  impl: ({ stations }) => stations.map((s) => s.id),
})
