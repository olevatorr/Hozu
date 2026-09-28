import { implement } from '@hozu/core/widget'
import { BarController, BarElement, CategoryScale, Chart, LinearScale } from 'chart.js'
import type { DistrictChart } from './widgets.ts'

Chart.register(BarController, BarElement, CategoryScale, LinearScale)

export default implement<typeof DistrictChart>(({ el, props }) => {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('role', 'img')
  canvas.setAttribute('aria-label', 'Bikes by district')
  el.append(canvas)
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: props.rows.map((r) => r.district),
      datasets: [{ label: 'Bikes', data: props.rows.map((r) => r.bikes), backgroundColor: '#4f46e5' }],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
    },
  })
  return {
    update(next) {
      chart.data.labels = next.rows.map((r) => r.district)
      chart.data.datasets[0]!.data = next.rows.map((r) => r.bikes)
      chart.update()
    },
    destroy: () => chart.destroy(),
  }
})
