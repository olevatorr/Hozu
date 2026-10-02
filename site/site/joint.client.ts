import { implement } from '@hozu/core/component'
import {
  AmbientLight,
  type AnimationAction,
  AnimationMixer,
  Color,
  DataTexture,
  DirectionalLight,
  FrontSide,
  Group,
  LoopOnce,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  Scene,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Joint } from './joint.ts'

const tones = new DataTexture(new Uint8Array([60, 150, 255]), 3, 1, RedFormat)
tones.minFilter = tones.magFilter = NearestFilter
tones.needsUpdate = true

export default implement<typeof Joint>(({ el, props, signal }) => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  const poster = el.querySelector('img')
  let renderer: WebGLRenderer | null = null
  let frame = 0
  let split = props.split
  const disposables: { dispose(): void }[] = []
  const label = (s: boolean) =>
    s
      ? 'The joint split apart: the pegs are out and the posts slid off'
      : 'The joint holds: both pegs lock the tenons'
  let pose: (next: boolean, animate: boolean) => void = () => {}
  let kick = () => {}

  const start = async () => {
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    const url = poster?.dataset.model
    if (!url) return
    const gltf = await new GLTFLoader().loadAsync(url)
    if (signal.aborted) return
    const source = gltf.cameras[0] as PerspectiveCamera
    source.updateWorldMatrix(true, false)
    const camera = new PerspectiveCamera(source.fov, 1, 0.1, 100)
    camera.matrixWorld.copy(source.matrixWorld)
    camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale)
    source.removeFromParent()

    const scene = new Scene()
    const pivot = new Group()
    pivot.add(gltf.scene)
    scene.add(pivot, new AmbientLight(0xffffff, 1.3))
    const sun = new DirectionalLight(0xffffff, 2.2)
    sun.position.set(-2.5, 5.5, 8)
    scene.add(sun)
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return
      const old = node.material as MeshToonMaterial
      const material: Material =
        old.name === 'ink'
          ? new MeshBasicMaterial({ color: 0x111010, side: FrontSide })
          : new MeshToonMaterial({ color: new Color().copy(old.color), gradientMap: tones })
      disposables.push(node.geometry, material, old)
      node.material = material
    })

    const mixer = new AnimationMixer(gltf.scene)
    const actions = new Map<string, AnimationAction>()
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip)
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = true
      actions.set(clip.name, action)
    }
    mixer.addEventListener('finished', () => {
      el.dataset.pose = split ? 'split' : 'joined'
    })
    pose = (next, animate) => {
      const action = actions.get(next ? 'split' : 'join')
      if (!action) return
      for (const other of actions.values()) if (other !== action) other.stop()
      action.reset().play()
      if (!animate) {
        action.time = action.getClip().duration
        mixer.update(0)
        el.dataset.pose = next ? 'split' : 'joined'
      }
      canvas.setAttribute('aria-label', label(next))
      kick()
    }

    const canvas = renderer.domElement
    canvas.setAttribute('role', 'img')
    canvas.classList.add('h-full', 'w-full')
    const size = () => {
      const width = el.clientWidth || 1
      renderer?.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer?.setSize(width, width, false)
    }
    size()
    const resize = new ResizeObserver(size)
    resize.observe(el)
    signal.addEventListener('abort', () => resize.disconnect())

    let tiltX = 0
    let tiltY = 0
    let aimX = 0
    let aimY = 0
    canvas.addEventListener(
      'pointermove',
      (event) => {
        const box = canvas.getBoundingClientRect()
        aimY = ((event.clientX - box.left) / box.width - 0.5) * 0.3
        aimX = ((event.clientY - box.top) / box.height - 0.5) * 0.16
        kick()
      },
      { signal },
    )
    canvas.addEventListener(
      'pointerleave',
      () => {
        aimX = aimY = 0
        kick()
      },
      { signal },
    )

    if (poster) poster.hidden = true
    el.append(canvas)
    pose(split, false)
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const ease = reduce ? 1 : Math.min(1, dt * 6)
      tiltX += (aimX - tiltX) * ease
      tiltY += (aimY - tiltY) * ease
      pivot.rotation.set(tiltX, tiltY, 0)
      mixer.update(dt)
      renderer?.render(scene, camera)
      const moving = Math.abs(aimX - tiltX) + Math.abs(aimY - tiltY) > 1e-4
      const playing = [...actions.values()].some((action) => action.isRunning())
      frame = moving || playing ? requestAnimationFrame(tick) : 0
    }
    kick = () => {
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    kick()
  }
  void start()

  return {
    update(next) {
      const changed = next.split !== split
      split = next.split
      if (changed) pose(split, !reduce)
    },
    destroy() {
      cancelAnimationFrame(frame)
      for (const item of disposables) item.dispose()
      renderer?.domElement.remove()
      renderer?.dispose()
      if (poster) poster.hidden = false
      delete el.dataset.pose
    },
  }
})
