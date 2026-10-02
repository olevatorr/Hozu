# The 3D joint: implementation plan

**Goal:** replace the CSS joint with a Blender-made H in three.js, as in `site/DESIGN.md` "The 3D joint".

**Spec:** `site/DESIGN.md`. **Executor:** inline in the owner's session, then a fresh review through Orca.

## Global constraints
- **Toolchain:** Blender 5.2.2 (`blender -b`) and Node 22.22.1; `three` at an exact version in `site/package.json`
  only.
- **Rendering:** no `style`; the server render is the poster `<img>` with width and height.
- **Checks:** the site checks of `site/PLAN.md` stay green after every task, plus `verify:browser`.

## Tasks
1. **Model.**
   - Write `site/3d/joint.py`:
     - the square H: two posts, a beam with through tenons, and two pegs;
     - flat paper and sand materials, red pegs;
     - inverted-hull outline shells with an `ink` material and backface culling;
     - NLA tracks `split` and `join` on posts and pegs.
   - Export `site/assets/joint.glb` (glTF binary, modifiers applied, NLA tracks as clips) and
     `site/assets/joint-poster.webp` (joined, Freestyle outline, 900 × 900).
   - Test first: verify reads the GLB JSON chunk and asserts the animations `split` and `join` and the nodes
     `beam`, `post-l`, `post-r`, `peg-l`, `peg-r`.
2. **Component.**
   - Write `site/site/joint.ts` with `Joint`: a client component, `load: 'visible'`, props `{ split, model, poster }`,
     and a render of the poster `<img>`.
   - Write `site/site/joint.client.ts`:
     - three.js, `GLTFLoader` and `AnimationMixer`;
     - toon materials, and `ink` in front-side black;
     - an idle turn, drag to rotate, and the clip on `update`;
     - `data-pose` set after a clip ends;
     - under reduced motion, the end pose without the idle turn;
     - `destroy` disposes the renderer.
   - The home view uses `Joint` with `split: ctx.broken`. Delete the CSS `Joint3D`.
3. **Guards.**
   - In verify: the joint's bundle is at most 180 KB gzip, and no page other than `index.html` references it.
   - In `verify:browser`:
     - `site.Joint` is mounted with one canvas;
     - AI CHANGE gives `data-pose="split"` and APPLY FIX gives `joined`;
     - console errors 0;
     - with JS off, the poster `<img>` is shown and there is no canvas.
   - Break each guard once.
4. **Showcase.** Below the playground, the `Joint` declaration and an excerpt of its client module, read at startup
   like the `Button` source.
5. **Finish.** A fresh Orca review, a fix pass with RED → GREEN, the owner's visual check in Chrome, and a merge into
   local `main` (no push).
