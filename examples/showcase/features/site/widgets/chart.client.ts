import { implement } from '@hozu/core/widget'
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import type { Chart as ChartWidget } from '../widgets.ts'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

export default implement<typeof ChartWidget>(({ el, props }) => {
  const canvas = document.createElement('canvas')
  el.replaceChildren(canvas)
  const color = getComputedStyle(el).color
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: props.labels,
      datasets: [{ label: props.label, data: props.values, backgroundColor: color, borderRadius: 6 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  })
  return {
    update(next) {
      chart.data.labels = next.labels
      chart.data.datasets[0]!.label = next.label
      chart.data.datasets[0]!.data = next.values
      chart.update()
    },
    destroy: () => chart.destroy(),
  }
})
