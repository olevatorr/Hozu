import { implement } from '@hozu/core/widget'
import L from 'leaflet'
import type { StationMap } from './widgets.ts'

export default implement<typeof StationMap>(({ el, props, emit }) => {
  const map = L.map(el, { zoomControl: true, attributionControl: false }).setView([25.055, 121.545], 12)
  const markers = new Map<string, L.Marker>()
  const draw = (next: typeof props) => {
    const wanted = new Set(next.points.map((p) => p.id))
    for (const [id, marker] of markers)
      if (!wanted.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    for (const p of next.points) {
      if (markers.has(p.id)) continue
      const marker = L.marker([p.lat, p.lng], {
        title: p.name,
        icon: L.divIcon({ className: 'station-pin' }),
      })
      marker.on('click', () => emit('select', { id: p.id }))
      marker.addTo(map)
      markers.set(p.id, marker)
    }
    for (const [id, marker] of markers)
      marker.getElement()?.setAttribute('data-selected', String(id === next.selected))
    const chosen = next.points.find((p) => p.id === next.selected)
    if (chosen) map.panTo([chosen.lat, chosen.lng])
  }
  draw(props)
  return { update: draw, destroy: () => map.remove() }
})
