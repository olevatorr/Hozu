import { implement } from '@hozu/core/component'
import * as THREE from 'three'
import type { Globe } from './components.ts'

export default implement<typeof Globe>(({ el, props, signal }) => {
  const size = Math.max(el.clientWidth, 240)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(size, size)
  el.append(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.z = 4
  const world = new THREE.Group()
  scene.add(world)
  world.add(
    new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), new THREE.MeshStandardMaterial({ color: 0x1e3a8a })),
  )
  world.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(1.002, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, wireframe: true }),
    ),
  )
  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const light = new THREE.DirectionalLight(0xffffff, 1.2)
  light.position.set(3, 2, 4)
  scene.add(light)
  const dots = new THREE.Group()
  world.add(dots)
  const draw = (next: typeof props) => {
    dots.clear()
    for (const p of next.points) {
      const phi = ((90 - p.lat) * Math.PI) / 180
      const theta = ((p.lng + 180) * Math.PI) / 180
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
      )
      dot.position.set(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
      dots.add(dot)
    }
  }
  draw(props)
  world.rotation.set(0.4, -2.1, 0)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let dragging: { x: number; y: number } | null = null
  renderer.domElement.addEventListener(
    'pointerdown',
    (e) => {
      dragging = { x: e.clientX, y: e.clientY }
    },
    { signal },
  )
  addEventListener(
    'pointerup',
    () => {
      dragging = null
    },
    { signal },
  )
  addEventListener(
    'pointermove',
    (e) => {
      if (!dragging) return
      world.rotation.y += (e.clientX - dragging.x) * 0.01
      world.rotation.x += (e.clientY - dragging.y) * 0.01
      dragging = { x: e.clientX, y: e.clientY }
    },
    { signal },
  )
  let frame = 0
  const tick = () => {
    if (!reduced && !dragging) world.rotation.y += 0.004
    renderer.render(scene, camera)
    frame = requestAnimationFrame(tick)
  }
  tick()
  return {
    update: draw,
    destroy() {
      cancelAnimationFrame(frame)
      renderer.dispose()
    },
  }
})
