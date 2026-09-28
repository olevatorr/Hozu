import { contract, feature, ui } from '@hozu/core'
import { home } from '../../routes.ts'
import {
  byDistrict,
  districts,
  idsOf,
  listStations,
  nextStop,
  PickDistrict,
  Search,
  Select,
  StartTour,
  StopTour,
  selected,
  stationsMachine,
  stationsTag,
  ToggleFavorite,
  toggleFavorite,
  total,
  visible,
} from './model.ts'
import { Counter, DistrictChart, FadeIn, Globe, StationMap } from './widgets.ts'

export const Explorer = ui.view({
  machine: stationsMachine,
  route: home,
  render: ({ ctx, search, when }) =>
    ui.main({ class: 'mx-auto max-w-6xl space-y-6 px-4 py-8' }, [
      ui.h1({ class: 'text-3xl font-bold' }, ['City bikes']),
      ui.query(
        listStations,
        {},
        {
          ready: (all) => {
            const q = ctx.live ? ctx.q : search.q
            const district = ctx.live ? ctx.district : search.district
            const list = visible({ stations: all, q, district })
            const rows = byDistrict({ stations: all, q, district })
            return ui.div({ class: 'space-y-6' }, [
              ui.form({ method: 'get', class: 'flex flex-wrap gap-3' }, [
                ui.input({
                  type: 'search',
                  name: 'q',
                  'aria-label': 'Search',
                  placeholder: 'Search stations',
                  value: q,
                  class: 'flex-1 rounded border px-3 py-2',
                  on: { input: ui.send(Search, { text: ui.dom.value }) },
                }),
                ui.select(
                  {
                    name: 'district',
                    'aria-label': 'District',
                    class: 'rounded border px-3 py-2',
                    on: { change: ui.send(PickDistrict, { district: ui.dom.value }) },
                  },
                  [
                    ui.option({ value: '', selected: district === '' }, ['All districts']),
                    ui.each(districts({ stations: all }), null, (d) =>
                      ui.option({ value: d, selected: d === district }, [d]),
                    ),
                  ],
                ),
                when(
                  ['touring'],
                  [
                    ui.button(
                      {
                        type: 'button',
                        class: 'rounded border px-3 py-2',
                        on: { click: ui.send(StopTour, {}) },
                      },
                      ['Stop tour'],
                    ),
                  ],
                ),
                when(
                  ['idle', 'favoriting'],
                  [
                    ui.button(
                      {
                        type: 'button',
                        class: 'rounded bg-indigo-600 px-3 py-2 text-white',
                        on: { click: ui.send(StartTour, { ids: idsOf({ stations: list }) }) },
                      },
                      ['Start tour'],
                    ),
                  ],
                ),
              ]),
              ui.p({ class: 'text-lg font-semibold' }, [
                'Available bikes: ',
                ui.use(Counter, { props: { value: total({ stations: all, q, district }) }, on: {} }, [
                  total({ stations: all, q, district }),
                ]),
              ]),
              ui.div({ class: 'grid gap-6 lg:grid-cols-2' }, [
                ui.ul({ 'aria-label': 'Stations', class: 'divide-y rounded border' }, [
                  ui.each(list, 'id', (s) =>
                    ui.li({ class: 'flex items-center gap-3 px-3 py-2' }, [
                      ui.button(
                        {
                          type: 'button',
                          class: 'font-medium underline',
                          on: { click: ui.send(Select, { id: s.id }) },
                        },
                        [s.name],
                      ),
                      ui.span({ class: 'text-sm text-slate-500' }, [s.district]),
                      ui.span({ class: 'ml-auto text-sm' }, [`${s.bikes} bikes`]),
                      ui.form({ on: { submit: ui.send(ToggleFavorite, { id: ui.dom.form('id') }) } }, [
                        ui.input({ type: 'hidden', name: 'id', value: s.id }),
                        ui.button(
                          {
                            type: 'submit',
                            class: 'rounded border px-2 text-sm',
                            'aria-pressed': s.favorite,
                          },
                          [s.favorite ? 'Unfavorite' : 'Favorite'],
                        ),
                      ]),
                    ]),
                  ),
                ]),
                ui.div(
                  { role: 'region', 'aria-label': 'Map', class: 'h-80 overflow-hidden rounded border' },
                  [
                    ui.use(
                      StationMap,
                      {
                        props: { points: list, selected: ctx.selected },
                        on: { select: (d) => ui.send(Select, { id: d.id }) },
                        class: 'h-80 w-full',
                      },
                      [],
                    ),
                  ],
                ),
              ]),
              ui.each(selected({ stations: all, id: ctx.selected }), 'id', (s) =>
                ui.use(FadeIn, { props: { key: s.id }, on: {} }, [
                  ui.section(
                    { role: 'region', 'aria-label': 'Station details', class: 'rounded border p-4' },
                    [
                      ui.h2({ class: 'text-xl font-semibold' }, [s.name]),
                      ui.p({}, [`Bikes: ${s.bikes}`]),
                      ui.p({}, [`Docks: ${s.docks}`]),
                    ],
                  ),
                ]),
              ),
              ui.div({ class: 'grid gap-6 lg:grid-cols-2' }, [
                ui.div({ class: 'space-y-3' }, [
                  ui.use(DistrictChart, { props: { rows }, on: {}, class: 'h-64' }, []),
                  ui.table({ class: 'w-full text-sm' }, [
                    ui.caption({ class: 'text-left font-medium' }, ['Bikes by district']),
                    ui.tbody({}, [
                      ui.each(rows, 'district', (r) =>
                        ui.tr({}, [
                          ui.th({ scope: 'row', class: 'text-left' }, [r.district]),
                          ui.td({}, [r.bikes]),
                        ]),
                      ),
                    ]),
                  ]),
                ]),
                ui.div({ role: 'region', 'aria-label': 'Globe', class: 'flex justify-center' }, [
                  ui.use(Globe, { props: { points: list }, on: {}, class: 'h-72 w-72' }, []),
                ]),
              ]),
            ])
          },
          failed: { Unexpected: () => ui.p({ role: 'alert' }, ['Stations are unavailable.']) },
        },
      ),
    ]),
})

export const startsTour = contract(stationsMachine, {
  given: { state: 'idle' },
  when: [{ send: StartTour, payload: { ids: ['s4', 's1'] } }],
  expect: { state: 'touring', changes: { tour: ['s4', 's1'], selected: 's4' } },
})

export const tourAdvancesAndWraps = contract(stationsMachine, {
  given: {
    state: 'touring',
    context: { live: false, q: '', district: '', selected: 's1', tour: ['s4', 's1'], target: '' },
  },
  when: [{ elapse: 1500 }],
  expect: { state: 'touring', changes: { selected: 's4' } },
})

export const stations = feature({
  id: 'stations',
  intent: { summary: 'Bike stations on a list, a map, a chart and a globe, with favourites and a tour' },
  declarations: {
    Search,
    PickDistrict,
    Select,
    ToggleFavorite,
    StartTour,
    StopTour,
    stationsTag,
    listStations,
    toggleFavorite,
    visible,
    total,
    byDistrict,
    districts,
    selected,
    nextStop,
    idsOf,
    stationsMachine,
    Explorer,
    StationMap,
    DistrictChart,
    Counter,
    FadeIn,
    Globe,
    startsTour,
    tourAdvancesAndWraps,
  },
})
