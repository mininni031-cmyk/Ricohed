# Renders the keeper model sheet: front, side, 45 deg, face close-up (+ optional keeper stance).
# Run: bpyenv/bin/python render_keeper.py <blend> <outdir> [scale] [views]
import bpy, math, sys, os
from mathutils import Vector, Euler
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
BLEND, OUT = args[0], args[1]
SCALE = float(args[2]) if len(args) > 2 else 1.0
VIEWS = args[3].split(',') if len(args) > 3 else ['front', 'side', 'q45', 'face']
bpy.ops.wm.open_mainfile(filepath=BLEND)
S = bpy.context.scene
S.render.engine = 'BLENDER_EEVEE'
S.view_settings.view_transform = 'Standard'; S.view_settings.look = 'None'
S.render.film_transparent = False
try: S.eevee.taa_render_samples = 16
except Exception: pass
w = bpy.data.worlds.new('w'); S.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.80, 0.84, 0.92, 1); bg.inputs[1].default_value = 0.55
# key light (toon terminator), from front-left-top
sun = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN')); S.collection.objects.link(sun)
sun.data.energy = 3.2; sun.rotation_euler = Euler((math.radians(52), math.radians(-18), math.radians(-28)))
sun.data.angle = math.radians(2)
# floor disc + team ring for the sheet
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.62, depth=0.012, location=(0, 0, -0.006))
fl = bpy.context.object; m = bpy.data.materials.new('floor'); m.use_nodes = True; nt = m.node_tree
p = nt.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (0.10, 0.12, 0.25, 1); p.inputs['Roughness'].default_value = 0.6; fl.data.materials.append(m)
bpy.ops.mesh.primitive_torus_add(major_radius=0.6, minor_radius=0.012, location=(0, 0, 0.004))
ri = bpy.context.object; m2 = bpy.data.materials.new('ring'); m2.use_nodes = True; e = m2.node_tree.nodes['Principled BSDF']
e.inputs['Emission Color'].default_value = (1.0, 0.08, 0.38, 1); e.inputs['Emission Strength'].default_value = 3.0; ri.data.materials.append(m2)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); S.collection.objects.link(cam); S.camera = cam

def shoot(name, yaw_deg, ortho=None, target=(0, 0, 0.9), dist=6.0, lens=85, res=(900, 1200), elev=4):
    S.render.resolution_x = int(res[0] * SCALE); S.render.resolution_y = int(res[1] * SCALE)
    t = Vector(target); a = math.radians(yaw_deg); el = math.radians(elev)
    pos = t + Vector((math.sin(a) * math.cos(el), -math.cos(a) * math.cos(el), math.sin(el))) * dist
    cam.location = pos
    d = (t - pos).normalized(); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    S.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True); print('RENDERED', name)

if 'front' in VIEWS: shoot('keeper_front', 0, ortho=2.05, target=(0, 0, 0.93))
if 'side' in VIEWS: shoot('keeper_side', 90, ortho=2.05, target=(0, 0, 0.93))
if 'q45' in VIEWS: shoot('keeper_45', 40, target=(0, 0, 0.92), dist=3.9, lens=50, elev=8)
if 'face' in VIEWS: shoot('keeper_face', 18, target=(0, -0.02, 1.6), dist=1.0, lens=85, res=(1000, 1000), elev=3)

if 'stance' in VIEWS:
    # in-game keeper stance (Y pose, knees bent) — just to show the rig deforms cleanly
    from mathutils import Matrix
    rig = bpy.data.objects['KeeperRig']; bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    def rot(bname, axis, deg):
        pb = rig.pose.bones[bname]; bpy.context.view_layer.update()
        h = pb.head.copy(); R = Matrix.Rotation(math.radians(deg), 4, axis)
        pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
        bpy.context.view_layer.update()
    rot('upper_arm.L', 'Y', -100); rot('upper_arm.R', 'Y', 100)
    rot('forearm.L', 'Y', -12); rot('forearm.R', 'Y', 12)
    rot('thigh.L', 'Y', -8); rot('thigh.R', 'Y', 8)
    rot('thigh.L', 'X', 14); rot('thigh.R', 'X', 14); rot('shin.L', 'X', -26); rot('shin.R', 'X', -26)
    rot('foot.L', 'X', 12); rot('foot.R', 'X', 12)
    rot('spine', 'X', 6); rot('head', 'X', -6)
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.location.z = -0.035
    shoot('keeper_stance', 22, target=(0, 0, 1.0), dist=4.3, lens=50, elev=6)
