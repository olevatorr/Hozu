import { resolvers } from '@hozu/data'
import { listStations, toggleFavorite } from './features/stations/model.ts'
import project from './hozu.config.ts'

const seed = [
  ['s1', 'Central Station', 'Central', 25.0478, 121.517, 12, 20],
  ['s2', 'City Hall', 'Xinyi', 25.0375, 121.5637, 3, 16],
  ['s3', 'Riverside Park', 'Datong', 25.0636, 121.509, 0, 12],
  ['s4', 'Night Market', 'Datong', 25.055, 121.5153, 7, 14],
  ['s5', 'Tech Park', 'Neihu', 25.0797, 121.5752, 15, 24],
  ['s6', 'Lakeside', 'Neihu', 25.084, 121.589, 5, 10],
  ['s7', 'Museum', 'Central', 25.0405, 121.519, 9, 18],
  ['s8', 'Tower Plaza', 'Xinyi', 25.0339, 121.5645, 11, 22],
] as const

export function createResolvers() {
  const stations = seed.map(([id, name, district, lat, lng, bikes, docks]) => ({
    id,
    name,
    district,
    lat,
    lng,
    bikes,
    docks,
  }))
  const favorites = new Set<string>()
  return resolvers(project, (implement) => [
    implement(listStations, () => stations.map((s) => ({ ...s, favorite: favorites.has(s.id) }))),
    implement(toggleFavorite, ({ id }) => {
      if (favorites.has(id)) favorites.delete(id)
      else favorites.add(id)
      return { id, favorite: favorites.has(id) }
    }),
  ])
}
