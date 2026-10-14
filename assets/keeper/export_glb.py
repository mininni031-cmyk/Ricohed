# Exports keeper_pink.glb from the .blend: drops the render-only outline shells and converts the
# toon render materials to plain PBR (base colour) so any engine (and the game's own toon shader) can use them.
import bpy, sys, os
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
bpy.ops.wm.open_mainfile(filepath=args[0])
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for m in [m for m in o.modifiers if m.name == 'outline']: o.modifiers.remove(m)
    for i in reversed(range(len(o.data.materials))):
        if o.data.materials[i] and o.data.materials[i].name == 'outline': o.data.materials.pop(index=i)
for m in bpy.data.materials:
    if m.name == 'outline': continue
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = m.diffuse_color; p.inputs['Roughness'].default_value = 0.85; p.inputs['Metallic'].default_value = 0.0
    if m.name in ('glow', 'hi', 'pupil', 'irisD', 'lash', 'lashL', 'brow', 'mouth', 'nose'):
        p.inputs['Emission Color'].default_value = m.diffuse_color; p.inputs['Emission Strength'].default_value = 1.0
    nt.links.new(p.outputs[0], out.inputs[0])
bpy.ops.export_scene.gltf(filepath=args[1], export_format='GLB', export_apply=True, export_yup=True, export_skins=True, export_animations=False, export_lights=False, export_cameras=False)
print('EXPORTED', args[1], os.path.getsize(args[1]))
