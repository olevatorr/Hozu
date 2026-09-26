import { implement } from '@hozu/core/widget'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three'
import type { Globe } from '../widgets.ts'

export default implement<typeof Globe>(({ el, props, signal }) => {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  el.replaceChildren(renderer.domElement)
  renderer.domElement.className = 'h-full w-full'
  const scene = new Scene()
  const camera = new PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.z = 3.2
  const count = 2400
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const t = i * Math.PI * (3 - Math.sqrt(5))
    positions.set([Math.cos(t) * r, y, Math.sin(t) * r], i * 3)
  }
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3))
  const color = new Color('#6366f1')
  const material = new PointsMaterial({ size: 0.018, color, blending: AdditiveBlending, transparent: true })
  const sphere = new Points(geometry, material)
  scene.add(sphere)
  let spin = props.spin
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const resize = () => {
    const { width, height } = el.getBoundingClientRect()
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(height, 1)
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(el)
  resize()
  const frame = () => {
    if (signal.aborted) return
    if (spin && !still) sphere.rotation.y += 0.003
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }
  frame()
  return {
    update(next) {
      spin = next.spin
    },
    destroy() {
      observer.disconnect()
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }
})
