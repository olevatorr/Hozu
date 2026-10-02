# blender -b --python site/3d/joint.py -- site/assets
import bpy, math, sys
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
PX, POST, FRAMES = 1.4, 0.7, 24

def box(size, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o

def boolean(target, tool, op='DIFFERENCE'):
    m = target.modifiers.new('b', 'BOOLEAN'); m.object = tool; m.operation = op; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target; bpy.ops.object.modifier_apply(modifier='b')

def cylinder(x, z, depth, r=0.075):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=(x, 0, z), rotation=(math.pi / 2, 0, 0), vertices=16)
    return bpy.context.object

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def material(name, hexc, cull=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.use_backface_culling = cull
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(hexc), 1); b.inputs['Roughness'].default_value = 0.85
    return m

reach = PX + POST / 2 + 0.16
beam = box((2 * (PX - POST / 2), 0.6, 0.6), (0, 0, 0))
tenon = box((2 * reach, 0.3, 0.34), (0, 0, 0))
boolean(beam, tenon, 'UNION')
posts = []
for side, name in ((-1, 'post-l'), (1, 'post-r')):
    p = box((POST, POST, 3.0), (side * PX, 0, -0.6))
    boolean(p, tenon); p.name = name; posts.append(p)
bpy.data.objects.remove(tenon)
pegs = []
for side, name, post in ((-1, 'peg-l', posts[0]), (1, 'peg-r', posts[1])):
    hole = cylinder(side * PX, 0, 2.0)
    boolean(beam, hole); boolean(post, hole); bpy.data.objects.remove(hole)
    g = cylinder(side * PX, 0, 0.95); g.name = name; pegs.append(g)
beam.name = 'beam'

for o in [beam, *posts, *pegs]:
    m = o.modifiers.new('bevel', 'BEVEL'); m.width = 0.015; m.segments = 1; m.limit_method = 'ANGLE'
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='bevel')
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    o.data.materials.clear()

paper, sand, red = material('paper', '#f6f2ea'), material('sand', '#e4d8c3'), material('red', '#fb3a0e')
ink = material('ink', '#111010', cull=True)
beam.data.materials.append(paper)
for p in posts: p.data.materials.append(sand)
for g in pegs: g.data.materials.append(red)

for o in [beam, *posts, *pegs]:
    shell = o.copy(); shell.data = o.data.copy(); shell.name = f'{o.name}-ink'
    scene.collection.objects.link(shell)
    shell.data.materials.clear(); shell.data.materials.append(ink)
    d = o.dimensions; t = 0.022
    shell.parent = o; shell.location = (0, 0, 0); shell.rotation_euler = (0, 0, 0)
    shell.scale = tuple(1 + 2 * t / max(v, 1e-6) for v in d)
    bpy.context.view_layer.objects.active = shell
    for s in bpy.context.selected_objects: s.select_set(False)
    shell.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.flip_normals()
    bpy.ops.object.mode_set(mode='OBJECT')
    shell.hide_render = True

rest = {}

def track(obj, clip, start, end):
    obj.animation_data_create()
    obj.location, obj.rotation_euler = start
    obj.keyframe_insert('location', frame=1); obj.keyframe_insert('rotation_euler', frame=1)
    obj.location, obj.rotation_euler = end
    obj.keyframe_insert('location', frame=FRAMES); obj.keyframe_insert('rotation_euler', frame=FRAMES)
    action = obj.animation_data.action; action.name = f'{obj.name}-{clip}'
    t = obj.animation_data.nla_tracks.new(); t.name = clip
    t.strips.new(clip, 1, action)
    obj.animation_data.action = None

for side, p in zip((-1, 1), posts):
    joined = (p.location.copy(), p.rotation_euler.copy()); rest[p.name] = joined
    split = (p.location + Vector((side * 0.55, 0, 0)), (0, side * math.radians(4), 0))
    track(p, 'split', joined, split); track(p, 'join', split, joined)
    p.location, p.rotation_euler = joined
for side, g in zip((-1, 1), pegs):
    joined = (g.location.copy(), g.rotation_euler.copy()); rest[g.name] = joined
    split = (g.location + Vector((side * 0.55, -0.8, 0.4)), (math.pi / 2, 0, math.radians(25 * side)))
    track(g, 'split', joined, split); track(g, 'join', split, joined)
    g.location, g.rotation_euler = joined

world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#f1ede4'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(55), math.radians(-15), math.radians(30)))
bpy.context.object.data.energy = 1.7
bpy.ops.object.camera_add(location=(5.4, -6.6, 3.4)); cam = bpy.context.object; cam.name = 'camera'
cam.rotation_euler = (Vector((0, 0, -0.6)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 48
scene.camera = cam

bpy.ops.export_scene.gltf(
    filepath=f'{out}/joint.glb', export_format='GLB', export_apply=True, export_cameras=True,
    export_lights=False, export_animations=True, export_animation_mode='NLA_TRACKS', export_yup=True,
)

for o in scene.objects:
    if o.animation_data:
        for t in o.animation_data.nla_tracks: t.mute = True
for o in [*posts, *pegs]:
    o.location, o.rotation_euler = rest[o.name]
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = scene.render.resolution_y = 900
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.use_freestyle = True
fs = scene.view_layers[0].freestyle_settings
ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('ink')
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('ink')
ls.linestyle.thickness = 3.5; ls.linestyle.color = srgb('#111010')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
fs.crease_angle = math.radians(120)
scene.frame_set(1)
scene.render.image_settings.file_format = 'WEBP'; scene.render.image_settings.quality = 82
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filepath = f'{out}/joint-poster.webp'
bpy.ops.render.render(write_still=True)
