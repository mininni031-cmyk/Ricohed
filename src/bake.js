// Draw-call reduction: inside every rigid group, merge the direct Mesh children.
// Opaque toon parts that share the same ramp are merged into ONE mesh with vertex colours;
// other materials are merged per material instance. Must run before addOutlines().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const vcMatCache = new Map();
function vertexColorToon(gradientMap) {
  if (vcMatCache.has(gradientMap)) return vcMatCache.get(gradientMap);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap });
  vcMatCache.set(gradientMap, m);
  return m;
}

function prepGeo(mesh, color) {
  let g = mesh.geometry.clone();
  mesh.updateMatrix();
  g.applyMatrix4(mesh.matrix);
  if (!g.index) g = g; // keep as-is
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (color) {
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  return g.index ? g.toNonIndexed() : g;
}

export function bakeRigid(root) {
  const groups = [];
  root.traverse(o => { if (!o.isMesh) groups.push(o); });
  for (const grp of groups) {
    const meshes = grp.children.filter(c => c.isMesh && !c.userData.keep && c.children.length === 0);
    if (meshes.length < 2) continue;
    const buckets = new Map();
    for (const m of meshes) {
      const mat = m.material;
      const toonOpaque = mat.isMeshToonMaterial && !mat.transparent && !mat.map && !Array.isArray(mat);
      const key = (toonOpaque ? 'toon:' + mat.gradientMap.uuid : 'mat:' + mat.uuid) + (m.userData.noOutline ? ':no' : '');
      if (!buckets.has(key)) buckets.set(key, { toonOpaque, mat, list: [], noOutline: !!m.userData.noOutline, renderOrder: m.renderOrder });
      buckets.get(key).list.push(m);
    }
    for (const b of buckets.values()) {
      if (b.list.length < 2 && !b.toonOpaque) continue;
      const geos = b.list.map(m => {
        let col = null;
        if (b.toonOpaque) {
          col = m.material.color.clone();
          // fold emissive into the base colour (keeps glowing accents bright)
          col.add(m.material.emissive.clone().multiplyScalar(m.material.emissiveIntensity * 0.8));
        }
        return prepGeo(m, col);
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.toonOpaque ? vertexColorToon(b.mat.gradientMap) : b.mat);
      mesh.userData.noOutline = b.noOutline; mesh.renderOrder = b.renderOrder;
      for (const m of b.list) grp.remove(m);
      grp.add(mesh);
    }
  }
}
