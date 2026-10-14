# RICOCHET v2.6 — Keeper #1 (TEAM PINK goalkeeper) built procedurally in Blender (bpy 5.x).
# Output: keeper_pink.glb (rigged, A-pose rest), keeper_pink.blend, 4 turnaround renders.
# Run:  bpyenv/bin/python build_keeper.py [outdir]
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix, Euler

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
S = bpy.context.scene
COL = bpy.context.collection

# ---------------------------------------------------------------- palette (sRGB -> linear)
def lin(c):
    return tuple(((x / 255.0) / 12.92 if (x / 255.0) <= 0.04045 else (((x / 255.0) + 0.055) / 1.055) ** 2.4) for x in c)
PAL = {
    'skin': (255, 228, 212), 'suit': (30, 34, 66), 'suit2': (52, 58, 104), 'pink': (255, 79, 163), 'pinkD': (214, 31, 120),
    'white': (244, 246, 255), 'gold': (255, 210, 90), 'hair': (58, 44, 102), 'hairHi': (120, 92, 190), 'iris': (226, 40, 140),
    'irisD': (120, 12, 70), 'pupil': (30, 8, 30), 'lash': (34, 22, 44), 'mouth': (150, 50, 70), 'line': (20, 16, 40),
    'glow': (255, 120, 200), 'sclera': (255, 255, 255), 'blush': (255, 150, 170),
}

# ---------------------------------------------------------------- toon material (same idea as the game's toon shader)
MATS = {}
def toon(name, key, shadow=(0.70, 0.62, 0.80), thresh=0.42, emit=False, rim=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    base = lin(PAL[key]) if isinstance(key, str) else key
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    if emit:
        em.inputs[0].default_value = (*base, 1); em.inputs[1].default_value = 1.0
        nt.links.new(em.outputs[0], out.inputs[0])
    else:
        d = nt.nodes.new('ShaderNodeBsdfDiffuse'); s2r = nt.nodes.new('ShaderNodeShaderToRGB')
        bw = nt.nodes.new('ShaderNodeRGBToBW')
        ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
        e0, e1 = ramp.color_ramp.elements
        e0.color = (*[b * s for b, s in zip(base, shadow)], 1); e1.position = thresh; e1.color = (*base, 1)
        nt.links.new(d.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs[0], bw.inputs[0]); nt.links.new(bw.outputs[0], ramp.inputs[0])
        col = ramp.outputs[0]
        if rim > 0:
            lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs[0].default_value = 0.18
            r2 = nt.nodes.new('ShaderNodeValToRGB'); r2.color_ramp.interpolation = 'CONSTANT'; r2.color_ramp.elements[0].color = (0, 0, 0, 1)
            r2.color_ramp.elements[1].position = 0.6; r2.color_ramp.elements[1].color = (rim, rim, rim, 1)
            nt.links.new(lw.outputs['Facing'], r2.inputs[0])
            add = nt.nodes.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'; add.inputs[0].default_value = 1
            nt.links.new(col, add.inputs[6]); nt.links.new(r2.outputs[0], add.inputs[7]); col = add.outputs[2]
        nt.links.new(col, em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    # glTF export reads Principled; keep a hidden principled base colour for the exporter
    m.diffuse_color = (*base, 1)
    MATS[name] = m
    return m

def outline_mat():
    if 'outline' in MATS: return MATS['outline']
    m = bpy.data.materials.new('outline'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (*lin(PAL['line']), 1)
    nt.links.new(em.outputs[0], out.inputs[0]); m.use_backface_culling = True
    MATS['outline'] = m; return m

def outline(obj, t=0.0045):
    obj.data.materials.append(outline_mat())
    mod = obj.modifiers.new('outline', 'SOLIDIFY'); mod.thickness = t; mod.offset = 1; mod.use_flip_normals = True
    mod.material_offset = len(obj.data.materials) - 1; mod.use_rim = False

def link(obj):
    COL.objects.link(obj); return obj

def mesh_obj(name, bm, mat=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me))
    if mat: o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o

def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev); o.modifiers.clear(); old = o.data; o.data = me; bpy.data.meshes.remove(old)

def smooth(o):
    for p in o.data.polygons: p.use_smooth = True

# ---------------------------------------------------------------- body (skin modifier skeleton)
J = {  # joint positions (x right, -y front, z up), metres. A-pose.
    'pelvis': (0, 0.0, 0.97), 'waist': (0, 0.0, 1.10), 'chest': (0, 0.0, 1.27), 'neck0': (0, 0.012, 1.41), 'neck1': (0, 0.01, 1.50),
    'hipL': (0.088, 0, 0.93), 'kneeL': (0.098, -0.012, 0.52), 'ankleL': (0.104, 0.012, 0.085), 'toeL': (0.108, -0.115, 0.03),
    'shL': (0.165, 0.008, 1.385), 'elL': (0.305, 0.03, 1.165), 'wrL': (0.415, 0.01, 0.965),
}
for k in list(J):
    if k.endswith('L'): J[k[:-1] + 'R'] = (-J[k][0], J[k][1], J[k][2])
order = ['pelvis', 'waist', 'chest', 'neck0', 'neck1', 'hipL', 'kneeL', 'ankleL', 'toeL', 'hipR', 'kneeR', 'ankleR', 'toeR', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR']
R = {  # skin radii (x, y)
    'pelvis': (0.135, 0.098), 'waist': (0.108, 0.080), 'chest': (0.135, 0.092), 'neck0': (0.050, 0.050), 'neck1': (0.042, 0.042),
    'hipL': (0.082, 0.082), 'kneeL': (0.055, 0.058), 'ankleL': (0.036, 0.040), 'toeL': (0.036, 0.030),
    'shL': (0.052, 0.052), 'elL': (0.036, 0.036), 'wrL': (0.028, 0.026),
}
for k in list(R):
    if k.endswith('L'): R[k[:-1] + 'R'] = R[k]
edges = [('pelvis', 'waist'), ('waist', 'chest'), ('chest', 'neck0'), ('neck0', 'neck1'), ('pelvis', 'hipL'), ('hipL', 'kneeL'), ('kneeL', 'ankleL'), ('ankleL', 'toeL'),
         ('pelvis', 'hipR'), ('hipR', 'kneeR'), ('kneeR', 'ankleR'), ('ankleR', 'toeR'), ('chest', 'shL'), ('shL', 'elL'), ('elL', 'wrL'), ('chest', 'shR'), ('shR', 'elR'), ('elR', 'wrR')]
idx = {k: i for i, k in enumerate(order)}
me = bpy.data.meshes.new('body'); me.from_pydata([J[k] for k in order], [(idx[a], idx[b]) for a, b in edges], [])
body = link(bpy.data.objects.new('Body', me))
sk = body.modifiers.new('skin', 'SKIN'); sk.use_smooth_shade = True; sk.branch_smoothing = 0.6
if len(me.skin_vertices) == 0: me.skin_vertices.new()
for k, i in idx.items():
    sv = me.skin_vertices[0].data[i]; sv.radius = R[k]
me.skin_vertices[0].data[idx['pelvis']].use_root = True
sub = body.modifiers.new('sub', 'SUBSURF'); sub.levels = 2; sub.render_levels = 2
apply_mods(body); smooth(body)
# sculpt-ish tweaks: slight bust + glutes, slimmer waist profile
for v in body.data.vertices:
    p = v.co
    if 1.19 < p.z < 1.33 and p.y < -0.03 and abs(p.x) < 0.11:  # chest volume
        t = math.sin((p.z - 1.19) / 0.14 * math.pi) * (1 - abs(abs(p.x) - 0.055) / 0.055 * 0.6)
        p.y -= 0.018 * max(0, t)
    if 0.88 < p.z < 1.0 and p.y > 0.03 and abs(p.x) < 0.13:
        p.y += 0.012 * math.sin((p.z - 0.88) / 0.12 * math.pi)
body.data.materials.append(toon('suit', 'suit', rim=0.10))
body.data.update()

# ray cast helper on the body
def ray(o, origin, direction):
    mw = o.matrix_world; inv = mw.inverted()
    ok, loc, nrm, _ = o.ray_cast(inv @ Vector(origin), (inv.to_3x3() @ Vector(direction)).normalized())
    return (mw @ loc, (mw.to_3x3() @ nrm).normalized()) if ok else (None, None)

# armour pieces cut from the body surface (they follow it exactly), solidified
def piece(name, mat, pred, thick, offset=0.0035):
    bm = bmesh.new(); bm.from_mesh(body.data)
    kill = [f for f in bm.faces if not pred(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    for v in bm.verts: v.co += v.normal * offset
    o = mesh_obj(name, bm, mat)
    so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
    bv = o.modifiers.new('bev', 'BEVEL'); bv.width = 0.003; bv.segments = 2; bv.limit_method = 'ANGLE'
    apply_mods(o); smooth(o)
    return o

P, Wt, G, Pd = toon('pink', 'pink', rim=0.12), toon('white', 'white', shadow=(0.78, 0.80, 0.92), rim=0.08), toon('gold', 'gold'), toon('pinkD', 'pinkD')
S2 = toon('suit2', 'suit2')
def d2(c, a, b):  # distance from point c to segment a-b
    a, b = Vector(a), Vector(b); ab = b - a; t = max(0, min(1, (c - a).dot(ab) / ab.length_squared)); return (c - (a + ab * t)).length, t
parts = []
parts.append(piece('ChestPlate', P, lambda c: 1.15 < c.z < 1.37 and c.y < -0.025 and abs(c.x) < 0.125, 0.014))
parts.append(piece('BackPlate', S2, lambda c: 1.13 < c.z < 1.37 and c.y > 0.03 and abs(c.x) < 0.11, 0.012))
parts.append(piece('Collar', Wt, lambda c: 1.385 < c.z < 1.455, 0.010))
parts.append(piece('Belt', Wt, lambda c: 1.0 < c.z < 1.05 and abs(c.x) < 0.16, 0.009))
parts.append(piece('HipGuard', P, lambda c: 0.80 < c.z < 0.985 and abs(c.x) > 0.105 and abs(c.y) < 0.075, 0.010))
for s in (1, -1):
    sh = Vector((0.165 * s, 0.008, 1.385))
    parts.append(piece('Shoulder' + ('L' if s > 0 else 'R'), Wt, lambda c, sh=sh: (c - sh).length < 0.082 and c.z > 1.33 and abs(c.x) > 0.12, 0.020))
    kn = Vector((0.098 * s, -0.012, 0.52))
    parts.append(piece('Knee' + ('L' if s > 0 else 'R'), Wt, lambda c, kn=kn: (c - kn).length < 0.068 and c.y < -0.0, 0.016))
    parts.append(piece('Shin' + ('L' if s > 0 else 'R'), P, lambda c, s=s: 0.13 < c.z < 0.44 and c.y < -0.005 and c.x * s > 0, 0.012))
    parts.append(piece('Boot' + ('L' if s > 0 else 'R'), Wt, lambda c, s=s: c.z < 0.135 and c.x * s > 0, 0.011))
    el, wr = J['el' + ('L' if s > 0 else 'R')], J['wr' + ('L' if s > 0 else 'R')]
    parts.append(piece('Bracer' + ('L' if s > 0 else 'R'), P, lambda c, el=el, wr=wr: (lambda d: d[0] < 0.06 and 0.35 < d[1] < 0.92)(d2(c, el, wr)), 0.010))

# boot soles (pink) and chest number
for s in (1, -1):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * 0.085, v.co.y * 0.20, v.co.z * 0.022))
    o = mesh_obj('Sole' + ('L' if s > 0 else 'R'), bm, Pd); o.location = (0.106 * s, -0.04, 0.012)
    bv = o.modifiers.new('bev', 'BEVEL'); bv.width = 0.01; bv.segments = 3; apply_mods(o); smooth(o); parts.append(o)

loc, n = ray(body, (0, -0.5, 1.255), (0, 1, 0))
txt = bpy.data.curves.new('num', 'FONT'); txt.body = '01'; txt.size = 0.07; txt.extrude = 0.002; txt.align_x = 'CENTER'; txt.align_y = 'CENTER'
num = link(bpy.data.objects.new('Number', txt)); num.data.materials.append(toon('whiteFlat', 'white', shadow=(0.85, 0.86, 0.95)))
num.location = loc + Vector((0, -0.024, 0)); num.rotation_euler = (math.radians(90), 0, 0)
bpy.context.view_layer.objects.active = num; num.select_set(True); bpy.ops.object.convert(target='MESH'); num.select_set(False)
parts.append(num)

# glowing core in the chest plate
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=6, radius=0.022)
core = mesh_obj('Core', bm, toon('glow', 'glow', emit=True)); core.rotation_euler = (math.radians(90), 0, 0)
loc2, _ = ray(body, (0, -0.5, 1.335), (0, 1, 0)); core.location = loc2 + Vector((0, -0.0185, 0)); parts.append(core)

# ---------------------------------------------------------------- keeper gloves (big padded mitts)
def glove(s):
    side = 'L' if s > 0 else 'R'
    el, wr = Vector(J['el' + side]), Vector(J['wr' + side])
    d = (wr - el).normalized()
    bm = bmesh.new()
    # palm block (mitten)
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * 0.095, v.co.y * 0.050, v.co.z * 0.135))
    for v in bm.verts:
        if v.co.z < 0: v.co.x *= 0.92
    pm = mesh_obj('Glove' + side, bm, P)
    bv = pm.modifiers.new('bev', 'BEVEL'); bv.width = 0.03; bv.segments = 5
    sb = pm.modifiers.new('sub', 'SUBSURF'); sb.levels = 2; apply_mods(pm)
    # cuff (white) + back pad (white) + thumb
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.045, radius2=0.041, depth=0.05)
    cuff = mesh_obj('Cuff' + side, bm, Wt); cuff.location = (0, 0, 0.088)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * 0.072, v.co.y * 0.016, v.co.z * 0.09))
    pad = mesh_obj('Pad' + side, bm, Wt); pad.location = (0, 0.031, 0.005)
    b2 = pad.modifiers.new('bev', 'BEVEL'); b2.width = 0.007; b2.segments = 3; apply_mods(pad)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((v.co.x * 0.03, v.co.y * 0.032, v.co.z * 0.07))
    th = mesh_obj('Thumb' + side, bm, P); th.location = (0.055 * -s, -0.012, 0.02); th.rotation_euler = (0, math.radians(-28 * s), 0)
    b3 = th.modifiers.new('bev', 'BEVEL'); b3.width = 0.012; b3.segments = 3; apply_mods(th)
    grooves = []
    for gx in (-0.024, 0.0, 0.024):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts: v.co = Vector((v.co.x * 0.0035, v.co.y * 0.103, v.co.z * 0.05))
        gr = mesh_obj('Groove' + side, bm, toon('groove', 'pinkD')); gr.location = (gx, -0.004, -0.04); grooves.append(gr)
    for o in (cuff, pad, th, *grooves):
        o.parent = pm
    # orient: glove local +z = toward the elbow (wrist up), palm faces inward
    up = -d; side_v = Vector((0, -1, 0)).cross(up).normalized(); fwd = up.cross(side_v)
    M = Matrix((side_v, fwd, up)).transposed().to_4x4(); M.translation = wr + d * 0.065
    pm.matrix_world = M
    # pink-glow seam
    return [pm, cuff, pad, th, *grooves]
gloves = glove(1) + glove(-1)

# ---------------------------------------------------------------- head
HC = Vector((0, 0.004, 1.600))
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1)
for v in bm.verts:
    x, y, z = v.co
    x *= 0.097; y *= 0.104; z *= 0.117
    if z < -0.015:  # jaw: narrow toward a small anime chin, pulled slightly forward
        t = min(1, (-0.015 - z) / 0.10)
        x *= 1 - 0.42 * t * t
        y *= 1 - 0.28 * t
        if y < 0: y -= 0.012 * t
        z -= 0.006 * t
    if z > 0.02:  # fuller cranium at the back
        if y > 0: y *= 1.06
    v.co = Vector((x, y, z)) + HC
head = mesh_obj('Head', bm, toon('skin', 'skin', shadow=(0.93, 0.76, 0.78), thresh=0.40, rim=0.06))

# ears (small, mostly under hair / headset)
for s in (1, -1):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1)
    for v in bm.verts: v.co = Vector((v.co.x * 0.012, v.co.y * 0.022, v.co.z * 0.03))
    e = mesh_obj('Ear' + ('L' if s > 0 else 'R'), bm, MATS['skin']); e.location = HC + Vector((0.094 * s, 0.012, -0.018)); parts.append(e)

# face decals (flat shapes projected onto the face, layered)
def decal(name, pts2d, z0, mat, layer, x0=0.0, tilt=0.0, cyclic=True):
    """pts2d: list of (x, z) offsets around (x0, z0); placed on the head surface along -y."""
    bm = bmesh.new()
    vs = [bm.verts.new((x0 + px * math.cos(tilt) - pz * math.sin(tilt), -0.3, HC.z + z0 + px * math.sin(tilt) + pz * math.cos(tilt))) for px, pz in pts2d]
    if cyclic:
        f = bm.faces.new(vs); bmesh.ops.triangulate(bm, faces=[f])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    o = mesh_obj(name, bm, mat)
    sw = o.modifiers.new('wrap', 'SHRINKWRAP'); sw.target = head; sw.wrap_method = 'PROJECT'; sw.use_project_y = True; sw.use_negative_direction = True; sw.use_positive_direction = True
    sw.offset = 0.0008 + layer * 0.0007
    apply_mods(o)
    for p in o.data.polygons: p.use_smooth = False
    return o

def ellipse(rx, rz, n=28, squash_top=0.0):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        x, z = rx * math.cos(a), rz * math.sin(a)
        if z > 0: z *= 1 - squash_top * (1 - abs(math.cos(a)))
        pts.append((x, z))
    return pts

def arc(cx, cz, rx, rz, a0, a1, w0, w1, n=18):
    """thick arc ribbon (lash / brow / mouth): inner + outer edge, width tapers w0 -> mid -> w1"""
    outer, inner = [], []
    for i in range(n + 1):
        t = i / n; a = a0 + (a1 - a0) * t
        w = (w0 * (1 - t) + w1 * t) * (0.6 + 0.8 * math.sin(math.pi * t) ** 0.5)
        outer.append((cx + (rx + w / 2) * math.cos(a), cz + (rz + w / 2) * math.sin(a)))
        inner.append((cx + (rx - w / 2) * math.cos(a), cz + (rz - w / 2) * math.sin(a)))
    return outer + inner[::-1]

face = []
EZ = -0.010; EX = 0.040
for s in (1, -1):
    sd = 'L' if s > 0 else 'R'; tilt = math.radians(-6 * s)
    face.append(decal('Sclera' + sd, ellipse(0.0215, 0.0255, squash_top=0.25), EZ, toon('sclera', 'sclera', shadow=(0.86, 0.86, 0.95)), 0, EX * s, tilt))
    face.append(decal('Iris' + sd, ellipse(0.0150, 0.0215), EZ - 0.002, toon('iris', 'iris', shadow=(0.85, 0.8, 0.9)), 1, EX * s - 0.0015 * s, tilt))
    face.append(decal('IrisD' + sd, [(x, z * 0.55 + 0.009) for x, z in ellipse(0.0135, 0.016)], EZ - 0.002, toon('irisD', 'irisD', emit=True), 2, EX * s - 0.0015 * s, tilt))
    face.append(decal('Pupil' + sd, ellipse(0.0058, 0.0095), EZ - 0.002, toon('pupil', 'pupil', emit=True), 3, EX * s - 0.0015 * s, tilt))
    face.append(decal('Hi1' + sd, ellipse(0.0042, 0.0050), EZ + 0.0065, toon('hi', 'sclera', emit=True), 4, EX * s + 0.0045 * s, tilt))
    face.append(decal('Hi2' + sd, ellipse(0.0022, 0.0022), EZ - 0.010, toon('hi', 'sclera', emit=True), 4, EX * s - 0.006 * s, tilt))
    # upper lash: thick, with a flick at the outer corner
    lash = arc(0, 0, 0.0235, 0.0265, math.radians(12 if s > 0 else 168), math.radians(168 if s > 0 else 12), 0.0045, 0.0075)
    face.append(decal('Lash' + sd, lash, EZ + 0.0015, toon('lash', 'lash', emit=True), 5, EX * s, tilt))
    face.append(decal('Flick' + sd, [(0.020 * s, 0.006), (0.031 * s, 0.012), (0.027 * s, 0.001)], EZ, MATS['lash'], 5, EX * s, tilt))
    face.append(decal('Lower' + sd, arc(0, 0.004, 0.019, 0.026, math.radians(-150), math.radians(-30), 0.0012, 0.0012), EZ, toon('lashL', (0.35, 0.18, 0.28), emit=True), 5, EX * s, tilt))
    face.append(decal('Brow' + sd, arc(0, -0.05, 0.022, 0.07, math.radians(118 if s > 0 else 62), math.radians(62 if s > 0 else 118), 0.0018, 0.0032), 0.037, toon('brow', 'hair', emit=True), 1, EX * s + 0.002 * s, tilt))
    face.append(decal('Blush' + sd, [(-0.008 + i * 0.006, 0.0) for i in range(0)] or ellipse(0.0125, 0.0045), -0.040, toon('blush', 'blush', shadow=(1, 1, 1)), 0, 0.050 * s, tilt))
face.append(decal('Mouth', arc(0, 0.012, 0.011, 0.012, math.radians(-120), math.radians(-60), 0.0016, 0.0016), -0.072, toon('mouth', 'mouth', emit=True), 1))
face.append(decal('Nose', [(-0.0016, 0.0), (0.0016, 0.0), (0.0, 0.004)], -0.042, toon('nose', (0.78, 0.48, 0.45), emit=True), 1))

# ---------------------------------------------------------------- hair
HAIR = toon('hair', 'hair', shadow=(0.62, 0.58, 0.82), thresh=0.40, rim=0.12)
HAIR_T = toon('hairTip', 'pink', rim=0.1)
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1)
for v in bm.verts:
    x, y, z = v.co; v.co = Vector((x * 0.1075, y * 0.1145, z * 0.1255)) + HC + Vector((0, 0.008, 0.012))
kill = [v for v in bm.verts if (v.co.y < HC.y - 0.045 and v.co.z < HC.z + 0.072) or (v.co.z < HC.z - 0.085)
        or (abs(v.co.x) > 0.05 and v.co.y < HC.y + 0.015 and v.co.z < HC.z - 0.03)]
bmesh.ops.delete(bm, geom=kill, context='VERTS')
cap = mesh_obj('HairCap', bm, HAIR)
so = cap.modifiers.new('thick', 'SOLIDIFY'); so.thickness = 0.008; so.offset = 1; apply_mods(cap)

# ribbon profile for strands (flat lens shape)
prof = bpy.data.curves.new('prof', 'CURVE'); prof.dimensions = '2D'
sp = prof.splines.new('POLY'); pts = [(math.cos(a) * 1.0, math.sin(a) * 0.42) for a in [i * 2 * math.pi / 12 for i in range(12)]]
sp.points.add(len(pts) - 1)
for i, (x, y) in enumerate(pts): sp.points[i].co = (x, y, 0, 1)
sp.use_cyclic_u = True
profObj = link(bpy.data.objects.new('prof', prof))

def strand(name, pts, w, mat=HAIR, twist=0.0, tipmat=None):
    """pts: list of (x,y,z) control points; width w (m) tapering to a point."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_mode = 'OBJECT'; cu.bevel_object = profObj; cu.use_fill_caps = True
    cu.resolution_u = 10; cu.twist_mode = 'MINIMUM'
    spn = cu.splines.new('NURBS'); spn.points.add(len(pts) - 1); spn.use_endpoint_u = True; spn.order_u = min(4, len(pts))
    n = len(pts)
    for i, p in enumerate(pts):
        t = i / (n - 1)
        spn.points[i].co = (*p, 1); spn.points[i].radius = w * (1 - t) ** 0.85 + 0.0004
        spn.points[i].tilt = twist * t
    o = link(bpy.data.objects.new(name, cu)); o.data.materials.append(mat)
    bpy.context.view_layer.objects.active = o
    for ob in bpy.context.selected_objects: ob.select_set(False)
    o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    smooth(o)
    return o

hair = [cap]
hz = HC.z
# bangs (front fringe): from the hairline over the forehead, pointed tips, slight swoop to the right
for i, (x0, ln, sw) in enumerate([(-0.078, 0.07, 0.008), (-0.058, 0.09, 0.010), (-0.036, 0.10, 0.012), (-0.014, 0.088, 0.016), (0.008, 0.106, 0.020), (0.030, 0.094, 0.018), (0.052, 0.084, 0.014), (0.072, 0.07, 0.010)]):
    top = (x0 * 0.6, -0.055, hz + 0.118)
    mid = (x0 * 0.95 + sw * 0.3, -0.116, hz + 0.070)
    tip = (x0 * 1.05 + sw, -0.112, hz + 0.105 - ln)
    hair.append(strand(f'Bang{i}', [top, mid, ((mid[0] + tip[0]) / 2, -0.118, (mid[2] + tip[2]) / 2), tip], 0.026, twist=0.0))
# side locks framing the face (long, to the jaw), pink tips
for s in (1, -1):
    for j, (dx, ln) in enumerate([(0.0, 0.155), (0.012, 0.125)]):
        x = (0.088 + dx) * s
        hair.append(strand(f'Side{s}{j}', [(x * 0.8, -0.03, hz + 0.10), (x * 1.05, -0.07, hz + 0.03), (x * 0.98, -0.072, hz - 0.05), (x * 0.86, -0.06, hz + 0.10 - ln)], 0.022))
    # back/side layers over the ears
    for j, (yy, ln) in enumerate([(0.03, 0.13), (0.07, 0.12)]):
        x = 0.1 * s
        hair.append(strand(f'Back{s}{j}', [(x * 0.7, yy, hz + 0.11), (x * 1.08, yy + 0.01, hz + 0.02), (x * 1.0, yy + 0.02, hz - 0.06), (x * 0.9, yy + 0.02, hz + 0.11 - ln - 0.02)], 0.03))
# nape fringe
for j, x in enumerate([-0.05, -0.017, 0.017, 0.05]):
    hair.append(strand(f'Nape{j}', [(x, 0.10, hz + 0.04), (x * 1.1, 0.118, hz - 0.03), (x * 1.15, 0.105, hz - 0.095)], 0.026))
# high ponytail with pink tips
tail = strand('Ponytail', [(0, 0.105, hz + 0.075), (0, 0.175, hz + 0.065), (0.01, 0.215, hz - 0.03), (0.02, 0.205, hz - 0.17), (0.035, 0.17, hz - 0.29)], 0.058, twist=0.6)
tail2 = strand('Ponytail2', [(0.0, 0.10, hz + 0.06), (-0.015, 0.16, hz + 0.04), (-0.03, 0.19, hz - 0.06), (-0.03, 0.17, hz - 0.2)], 0.04)
tip1 = strand('PonyTip', [(0.027, 0.19, hz - 0.21), (0.035, 0.17, hz - 0.29), (0.04, 0.155, hz - 0.33)], 0.022, mat=HAIR_T)
hair += [tail, tail2, tip1]
hair.append(strand('Ahoge', [(0.0, -0.01, hz + 0.125), (0.01, -0.02, hz + 0.17), (0.035, 0.0, hz + 0.19), (0.05, 0.03, hz + 0.165)], 0.012))
# hair tie
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.026, radius2=0.026, depth=0.022)
tie = mesh_obj('HairTie', bm, P); tie.location = (0, 0.112, hz + 0.073); tie.rotation_euler = (math.radians(80), 0, 0); hair.append(tie)

# headset: ear pods with a glowing ring + mic boom (team comms)
for s in (1, -1):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.031, radius2=0.027, depth=0.022)
    pod = mesh_obj('Pod' + ('L' if s > 0 else 'R'), bm, Wt); pod.location = HC + Vector((0.104 * s, 0.012, -0.012)); pod.rotation_euler = (0, math.radians(90 * s), 0)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.018, radius2=0.018, depth=0.004)
    ring = mesh_obj('PodGlow' + ('L' if s > 0 else 'R'), bm, MATS['glow']); ring.location = HC + Vector((0.117 * s, 0.012, -0.012)); ring.rotation_euler = (0, math.radians(90 * s), 0)
    hair += [pod, ring]
mic = strand('Mic', [(0.112, 0.0, hz - 0.03), (0.105, -0.05, hz - 0.06), (0.06, -0.085, hz - 0.075)], 0.006, mat=Wt)
hair.append(mic)

# ---------------------------------------------------------------- outlines
for o in [body] + parts + [head] + hair + gloves:
    if o.type == 'MESH' and o.name not in ('Number', 'Core') and not o.name.startswith('PodGlow'):
        outline(o, 0.0055 if o in (body, head) else 0.004)
bpy.data.objects.remove(profObj)

# ---------------------------------------------------------------- armature (rest = this A-pose)
arm_data = bpy.data.armatures.new('KeeperRig'); rig = link(bpy.data.objects.new('KeeperRig', arm_data))
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name, h, t, parent=None):
    b = arm_data.edit_bones.new(name); b.head = Vector(h); b.tail = Vector(t)
    if parent: b.parent = arm_data.edit_bones[parent]; b.use_connect = False
    return b
bone('hips', J['pelvis'], J['waist'])
bone('spine', J['waist'], J['chest'], 'hips')
bone('chest', J['chest'], J['neck0'], 'spine')
bone('neck', J['neck0'], J['neck1'], 'chest')
bone('head', J['neck1'], (0, 0.0, 1.74), 'neck')
for s in 'LR':
    bone('shoulder.' + s, J['chest'] if False else (0.05 * (1 if s == 'L' else -1), 0.0, 1.37), J['sh' + s], 'chest')
    bone('upper_arm.' + s, J['sh' + s], J['el' + s], 'shoulder.' + s)
    bone('forearm.' + s, J['el' + s], J['wr' + s], 'upper_arm.' + s)
    w = Vector(J['wr' + s]); e = Vector(J['el' + s]); bone('hand.' + s, w, w + (w - e).normalized() * 0.13, 'forearm.' + s)
    bone('thigh.' + s, J['hip' + s], J['knee' + s], 'hips')
    bone('shin.' + s, J['knee' + s], J['ankle' + s], 'thigh.' + s)
    bone('foot.' + s, J['ankle' + s], J['toe' + s], 'shin.' + s)
bpy.ops.object.mode_set(mode='OBJECT')

def rig_auto(objs):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
def rig_rigid(objs, bname):
    bpy.context.view_layer.update()
    mws = {o.name: o.matrix_world.copy() for o in objs}
    for o in objs:
        mw = mws[o.name]; o.parent = rig; o.matrix_world = mw
        vg = o.vertex_groups.new(name=bname); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        m = o.modifiers.new('rig', 'ARMATURE'); m.object = rig
        # keep the outline solidify after the armature
        mods = o.modifiers
        if 'outline' in mods: bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_move_to_index(modifier='rig', index=0)
rig_auto([body] + [p for p in parts if p.name not in ('Number', 'Core') and not p.name.startswith('Ear')])
rig_rigid([num, core], 'chest')
rig_rigid([head] + face + hair + [p for p in parts if p.name.startswith('Ear')], 'head')
bpy.context.view_layer.update()
rig_rigid(gloves[:len(gloves)//2], 'hand.L'); rig_rigid(gloves[len(gloves)//2:], 'hand.R')
# make sure the armature modifier comes before the outline everywhere
for o in bpy.data.objects:
    if o.type == 'MESH' and 'outline' in o.modifiers:
        names = [m.name for m in o.modifiers]
        arm = [m for m in o.modifiers if m.type == 'ARMATURE']
        if arm:
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_move_to_index(modifier=arm[0].name, index=0)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'keeper_pink.blend'))
print('BUILD OK', len(bpy.data.objects), 'objects', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'), 'faces')
