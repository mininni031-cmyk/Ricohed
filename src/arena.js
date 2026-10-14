// ArenaScene (v2.6): a world-fixed game-festival STADIUM (stands, roof, lights, jumbotron, LED walls)
// around a ROOM that turns during the ARENA GRAVITY SHIFT. Everything inside the room (its 4
// floor-able faces, glass sides, 8 goal mouths, fixed trick panels, half-line curtains) lives in
// `this.room`, positioned at the room centre and rotated by the gravity system's room angle.
// Static geometry is merged per material (few draw calls).
import {ellipseRingGeometry} from './goal-geometry.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG, PANELS, TEAM, ROOM } from './config.js';
import { toon, glowMat, canvasTexture } from './toon.js';
import { paintFace } from './faces.js';
import { bakeRigid } from './bake.js';
import { PALETTES } from './character.js';

// Stadium bowl (world): the turning room sweeps a circle of radius L*sqrt(2) = 15.6 m in x/y,
// so the end stands start beyond 16 m; the side stands sit outside the room's z extent.
const HX = 16, HZ = ROOM.W + 0.6, STAND_Y = 2;
const L = ROOM.L, W = ROOM.W, RC = ROOM.CENTER_Y;
const CY = ROOM.CEILING_Y, ROOM_HEIGHT = L + CY, WALL_MID_Y = (CY - L) / 2;

class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, pos, rot = null, scale = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(rot instanceof THREE.Euler ? rot : new THREE.Euler(...rot));
    m.compose(new THREE.Vector3(...pos), q, scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  box(w, h, d, mat, pos, rot) { this.add(new THREE.BoxGeometry(w, h, d), mat, pos, rot); }
  build(parent) {
    for (const [mat, list] of this.groups) {
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

function hexPattern(ctx, w, h, size, color, lw) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  const hw = size * Math.sqrt(3);
  for (let row = -1; row < h / (size * 1.5) + 1; row++) {
    for (let col = -1; col < w / hw + 1; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * size * 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        const x = cx + Math.cos(a) * size, y = cy + Math.sin(a) * size;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    }
  }
}

function logoText(ctx, text, x, y, size, fill = '#ffffff', glow = '#35e8ff', italic = true) {
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = glow; ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
  ctx.shadowBlur = 0; ctx.lineWidth = Math.max(2, size * 0.03); ctx.strokeStyle = glow; ctx.strokeText(text, x, y);
  ctx.restore();
}

function ricochetLogo(ctx, cx, cy, size) {
  // Stylised wordmark: sheared caps with a cyan/pink slash
  ctx.save();
  ctx.translate(cx, cy); ctx.transform(1, 0, -0.22, 1, 0, 0);
  const g = ctx.createLinearGradient(-size * 3, 0, size * 3, 0);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e8fbff'); g.addColorStop(1, '#ffd2ec');
  ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = '#35e8ff'; ctx.shadowBlur = size * 0.3;
  ctx.fillStyle = g; ctx.fillText('RICOCHET', 0, 0);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#0a1028'; ctx.lineWidth = size * 0.035; ctx.strokeText('RICOCHET', 0, 0);
  // slashes
  ctx.fillStyle = '#35e8ff';
  ctx.beginPath(); ctx.moveTo(-size * 2.9, size * 0.55); ctx.lineTo(size * 0.6, size * 0.42); ctx.lineTo(size * 0.5, size * 0.52); ctx.lineTo(-size * 2.95, size * 0.62); ctx.fill();
  ctx.fillStyle = '#ff4fa3';
  ctx.beginPath(); ctx.moveTo(size * 0.7, size * 0.42); ctx.lineTo(size * 2.9, size * 0.38); ctx.lineTo(size * 2.85, size * 0.46); ctx.lineTo(size * 0.62, size * 0.52); ctx.fill();
  ctx.restore();
}

export function drawLogoCanvas(w = 1024, h = 256, bg = true) {
  return canvasTexture(w, h, (ctx) => {
    if (bg) { ctx.fillStyle = '#060b1c'; ctx.fillRect(0, 0, w, h); }
    ricochetLogo(ctx, w / 2, h / 2, h * 0.42);
  });
}

function teamBanner(team) {
  const isC = team === 'cyan', col = isC ? '#35e8ff' : '#ff4fa3';
  return canvasTexture(512, 1024, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0f26'); g.addColorStop(1, isC ? '#06324a' : '#3d0a2c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.25; hexPattern(ctx, w, h, 28, col, 2); ctx.globalAlpha = 1;
    // Big anime bust (original character art drawn procedurally)
    ctx.save(); ctx.translate(w / 2, 420); ctx.scale(2.6, 2.6); ctx.translate(-80, -80);
    const pal = isC ? PALETTES.keeperCyan : PALETTES.cpu;
    const hair = isC ? '#dfe7f2' : '#2b1838', hairHi = isC ? '#ffffff' : '#ff6fb5';
    ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(80, 72, 56, 62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.skin; ctx.beginPath(); ctx.moveTo(36, 62); ctx.quadraticCurveTo(36, 104, 80, 124); ctx.quadraticCurveTo(124, 104, 124, 62); ctx.quadraticCurveTo(80, 20, 36, 62); ctx.fill();
    ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2.5; ctx.stroke();
    paintFace(ctx, pal, isC ? 'save' : 'shoot', (phi, theta) => [80 + phi * 58, 86 + (theta - 1.6) * 52], 0.36);
    ctx.fillStyle = hair; ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(26, 74); ctx.quadraticCurveTo(36, 8, 82, 10); ctx.quadraticCurveTo(130, 12, 134, 74);
    for (const [x, y] of [[120, 66], [110, 82], [98, 62], [86, 86], [74, 60], [62, 84], [50, 62], [40, 82]]) ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = hairHi; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(80, 58, 42, 1.15 * Math.PI, 1.6 * Math.PI); ctx.stroke();
    // collar
    ctx.fillStyle = '#121a2c'; ctx.beginPath(); ctx.moveTo(14, 170); ctx.lineTo(50, 128); ctx.lineTo(110, 128); ctx.lineTo(146, 170); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(50, 128, 60, 5);
    ctx.restore();
    // slanted stripes + text
    ctx.fillStyle = col; ctx.globalAlpha = 0.8;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, 760 + i * 26); ctx.lineTo(w, 700 + i * 26); ctx.lineTo(w, 712 + i * 26); ctx.lineTo(0, 772 + i * 26); ctx.fill(); }
    ctx.globalAlpha = 1;
    logoText(ctx, 'TEAM', w / 2, 850, 110, '#ffffff', col);
    logoText(ctx, isC ? 'CYAN' : 'PINK', w / 2, 960, 130, col, '#ffffff');
  });
}

function festBanner(color) {
  return canvasTexture(256, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#0b0e2a'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, color + '55'); g.addColorStop(1, '#0b0e2a00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
    // star burst
    ctx.save(); ctx.translate(w / 2, 120); ctx.fillStyle = color;
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 22 : 60; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); ctx.restore();
    logoText(ctx, 'GAME', w / 2, 290, 78, '#ffffff', color, false);
    logoText(ctx, 'FEST', w / 2, 375, 78, '#ffffff', color, false);
    ctx.font = 'bold 44px "Arial Black", system-ui'; ctx.fillStyle = '#d8e8ff'; ctx.textAlign = 'center';
    ['PLAY', 'FLY', 'RICOCHET', 'TOGETHER'].forEach((t, i) => { ctx.font = `bold ${t.length > 5 ? 34 : 44}px "Arial Black", system-ui`; ctx.fillText(t, w / 2, 520 + i * 70); });
  });
}

function adBoardTexture() {
  const t = canvasTexture(2048, 128, (ctx, w, h) => {
    ctx.fillStyle = '#050a1a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      const x = i * 512;
      const g = ctx.createLinearGradient(x, 0, x + 512, 0); g.addColorStop(0, '#0a2f5a'); g.addColorStop(1, '#3a0b3e');
      ctx.fillStyle = g; ctx.fillRect(x + 4, 6, 504, h - 12);
      if (i % 2 === 0) ricochetLogo(ctx, x + 256, h / 2, 54);
      else {
        ctx.fillStyle = i === 1 ? '#35e8ff' : '#ff4fa3';
        for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(x + 40 + k * 76, 20); ctx.lineTo(x + 80 + k * 76, h / 2); ctx.lineTo(x + 40 + k * 76, h - 20); ctx.lineTo(x + 60 + k * 76, h - 20); ctx.lineTo(x + 100 + k * 76, h / 2); ctx.lineTo(x + 60 + k * 76, 20); ctx.fill(); }
      }
    }
  }, { repeat: [1, 1] });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}


// Face table for the turning room (outward normals). Each can become the floor.
const RFACES = [
  { key: '+x', n: new THREE.Vector3(1, 0, 0) }, { key: '-x', n: new THREE.Vector3(-1, 0, 0) },
  { key: '+y', n: new THREE.Vector3(0, 1, 0) }, { key: '-y', n: new THREE.Vector3(0, -1, 0) },
];
const _m4 = new THREE.Matrix4();
/** Orient an object so its local +z points along `n` and local +y along `up`. */
function orient(obj, n, up) { const x = new THREE.Vector3().crossVectors(up, n).normalize(); _m4.makeBasis(x, up, n); obj.quaternion.setFromRotationMatrix(_m4); }

export class ArenaScene {
  constructor(scene, quality = 'high') {
    this.scene = scene; this.quality = quality;
    this.anim = { spots: [], beams: [], goalRings: {}, panels: [], adBoards: [], lightsTeam: [], mouths: [] };
    this.root = new THREE.Group(); scene.add(this.root);          // stadium (world-fixed)
    this.room = new THREE.Group(); this.room.position.set(0, RC, 0); scene.add(this.room); // turning room
    this.buildLights();
    this.buildStadiumFloor();
    this.buildStands();
    this.buildRoof();
    this.buildBanners();
    this.buildRoomFaces();
    this.buildRoomFrame();
    this.buildGoals();
    this.buildPanels();
    this.buildHalfLine();
  }

  // ------------------------------------------------------------------ stadium (world)
  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x9fd8ff, 0x2a1640, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(6, 50, 12); s.add(key);
    const fillC = new THREE.DirectionalLight(0x35e8ff, 0.8); fillC.position.set(-30, 20, -5); s.add(fillC);
    const fillP = new THREE.DirectionalLight(0xff4fa3, 0.7); fillP.position.set(30, 20, 5); s.add(fillP);
    this.anim.lightsTeam.push(fillC, fillP);
    const nSpots = this.quality === 'low' ? 2 : 4;
    const spotDefs = [[-12, 0x35e8ff, -1], [12, 0xff4fa3, 1], [-12, 0x35e8ff, 1], [12, 0xff4fa3, -1]];
    for (let i = 0; i < nSpots; i++) {
      const [x, c, zs] = spotDefs[i];
      const sp = new THREE.SpotLight(c, 420, 90, 0.36, 0.6, 1.4);
      sp.position.set(x, 44, zs * 18);
      sp.target.position.set(x * 0.3, RC, 0); s.add(sp, sp.target);
      this.anim.spots.push({ light: sp, base: 420, phase: i * 1.7, x });
    }
    const beamGeo = new THREE.ConeGeometry(3, 34, 20, 1, true); beamGeo.translate(0, -17, 0);
    const beamMatC = new THREE.MeshBasicMaterial({ color: 0x35e8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beamMatP = beamMatC.clone(); beamMatP.color.set(0xff4fa3);
    const beamMatW = beamMatC.clone(); beamMatW.color.set(0xbfe8ff); beamMatW.opacity = 0.035;
    for (const [x, y, z, m] of [[-24, 42, -24, beamMatC], [24, 42, -24, beamMatP], [-24, 42, 24, beamMatC], [24, 42, 24, beamMatP], [-8, 43, -28, beamMatW], [8, 43, 28, beamMatW], [-36, 40, 0, beamMatC], [36, 40, 0, beamMatP]]) {
      const b = new THREE.Mesh(beamGeo, m); b.position.set(x, y, z);
      b.rotation.set((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
      this.root.add(b); this.anim.beams.push({ mesh: b, phase: Math.random() * 6, bx: b.rotation.x, bz: b.rotation.z });
    }
  }

  buildStadiumFloor() {
    const B = new Batcher();
    B.box(140, 0.4, 120, toon(0x0b1024, 0x0a0f2a, 0.3), [0, -0.2, 0]);
    // glowing ring under the room (shows the rotation axis footprint)
    const ringC = glowMat(0x35e8ff, 0.6, true);
    B.build(this.root);
    const ring = new THREE.Mesh(new THREE.RingGeometry(15.4, 15.8, 96), ringC); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; this.root.add(ring);
    // rotation axle housings on both glass sides (the room turns around the z axis)
    for (const s of [-1, 1]) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 32), toon(0x1a2238, 0x101830, 0.3)); hub.rotation.x = Math.PI / 2; hub.position.set(0, RC, s * (W + 1.4)); this.root.add(hub);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.08, 8, 48), glowMat(s < 0 ? 0x35e8ff : 0xff4fa3)); glow.position.set(0, RC, s * (W + 0.8)); this.root.add(glow);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.0, RC, 1.0), toon(0x141a30, 0x0a0f22, 0.3)); arm.position.set(0, RC / 2, s * (W + 1.4)); this.root.add(arm);
    }
  }

  buildStands() {
    // Rectangular bowl of three tiers. Seat placement data goes to the crowd module.
    const B = new Batcher();
    const concrete = toon(0x1a2140, 0x0d1230, 0.25);
    const seatsA = toon(0x23305a, 0x141c40, 0.2);
    const wall = toon(0x10162e, 0x0a0e22, 0.35);
    const fasciaC = glowMat(0x35e8ff), fasciaP = glowMat(0xff4fa3), fasciaW = glowMat(0x9fd8ff);
    this.seats = [];
    const tiers = [
      { d0: 3.2, rows: 10, rise: 0.6, depth: 0.95, y0: STAND_Y + 0.6 },
      { d0: 13.0, rows: 8, rise: 0.8, depth: 0.95, y0: STAND_Y + 11.5 },
      { d0: 21.0, rows: 8, rise: 0.9, depth: 0.95, y0: STAND_Y + 22.0 },
    ];
    const sides = [
      { axis: 'z', sign: -1, len: HX * 2 + 6, team: (x) => x < 0 ? 'cyan' : 'pink' },
      { axis: 'z', sign: 1, len: HX * 2 + 6, team: (x) => x < 0 ? 'cyan' : 'pink' },
      { axis: 'x', sign: -1, len: HZ * 2 + 4, team: () => 'cyan' },
      { axis: 'x', sign: 1, len: HZ * 2 + 4, team: () => 'pink' },
    ];
    for (const s of sides) {
      const half = s.axis === 'z' ? HZ : HX;
      const yaw = s.axis === 'z' ? (s.sign < 0 ? 0 : Math.PI) : (s.sign < 0 ? Math.PI / 2 : -Math.PI / 2);
      tiers.forEach((t, ti) => {
        const len = s.len + ti * 8;
        for (let r = 0; r < t.rows; r++) {
          const d = half + t.d0 + r * t.depth, y = t.y0 + r * t.rise;
          const pos = s.axis === 'z' ? [0, y - 0.2, s.sign * d] : [s.sign * d, y - 0.2, 0];
          const dims = s.axis === 'z' ? [len, 0.4, t.depth] : [t.depth, 0.4, len];
          B.box(...dims, r % 2 ? seatsA : concrete, pos);
          const fillH = y - 0.4 - (ti === 0 ? 0 : t.y0 - 1.5);
          if (fillH > 0.1) {
            const fp = s.axis === 'z' ? [0, y - 0.4 - fillH / 2, s.sign * d] : [s.sign * d, y - 0.4 - fillH / 2, 0];
            const fd = s.axis === 'z' ? [len, fillH, t.depth] : [t.depth, fillH, len];
            B.box(...fd, concrete, fp);
          }
          const step = 0.62;
          for (let k = -len / 2 + 0.6; k < len / 2 - 0.6; k += step) {
            if (Math.random() < 0.07) continue;
            const jitter = (Math.random() - 0.5) * 0.12;
            const p = s.axis === 'z' ? { x: k + jitter, y, z: s.sign * d } : { x: s.sign * d, y, z: k + jitter };
            p.yaw = yaw; p.team = Math.random() < 0.8 ? s.team(p.x) : (s.team(p.x) === 'cyan' ? 'pink' : 'cyan');
            p.tier = ti;
            this.seats.push(p);
          }
        }
        const fd = half + t.d0 - 0.55, fy = t.y0 - 0.2;
        const fasc = s.axis === 'z' ? [len, 0.35, 0.12] : [0.12, 0.35, len];
        const fpos = s.axis === 'z' ? [0, fy, s.sign * fd] : [s.sign * fd, fy, 0];
        const fm = s.axis === 'z' ? (ti % 2 ? fasciaP : fasciaC) : (s.sign < 0 ? fasciaC : fasciaP);
        B.box(...fasc, ti === 2 ? fasciaW : fm, fpos);
        if (ti > 0) {
          const sd = half + t.d0 - 0.9, slabW = 2.2;
          const sp = s.axis === 'z' ? [0, t.y0 - 0.8, s.sign * (sd + slabW / 2)] : [s.sign * (sd + slabW / 2), t.y0 - 0.8, 0];
          const sdim = s.axis === 'z' ? [len, 0.7, slabW] : [slabW, 0.7, len];
          B.box(...sdim, wall, sp);
          const lp = s.axis === 'z' ? [0, t.y0 - 1.0, s.sign * (sd - 0.05)] : [s.sign * (sd - 0.05), t.y0 - 1.0, 0];
          const ldim = s.axis === 'z' ? [len, 0.18, 0.06] : [0.06, 0.18, len];
          B.box(...ldim, ti === 1 ? fasciaW : fm, lp);
        }
      });
      const bd = half + 30;
      const bp = s.axis === 'z' ? [0, 22, s.sign * bd] : [s.sign * bd, 22, 0];
      const bdim = s.axis === 'z' ? [s.len + 40, 46, 1] : [1, 46, s.len + 40];
      B.box(...bdim, wall, bp);
    }
    B.build(this.root);
  }

  buildRoof() {
    const B = new Batcher();
    const steel = toon(0x2a3352, 0x111830, 0.3);
    const y = 45;
    for (let x = -36; x <= 36; x += 6) {
      B.box(0.5, 0.5, 70, steel, [x, y, 0]); B.box(0.25, 0.25, 70, steel, [x, y - 2.2, 0]);
      for (let z = -34; z <= 34; z += 4) B.box(0.12, 2.4, 0.12, steel, [x, y - 1.1, z], [0.6, 0, 0]);
    }
    for (let z = -30; z <= 30; z += 10) B.box(76, 0.4, 0.4, steel, [0, y, z]);
    const lamp = glowMat(0xffffff), lampC = glowMat(0x7ff0ff), lampP = glowMat(0xff9fd0);
    for (let x = -30; x <= 30; x += 6) for (const z of [-24, 24]) {
      B.box(0.6, 0.4, 0.6, steel, [x, y - 2.6, z]);
      B.box(0.36, 0.1, 0.36, (x / 6) % 2 ? lampC : lampP, [x, y - 2.85, z]);
    }
    for (let x = -24; x <= 24; x += 8) B.box(0.3, 0.1, 0.3, lamp, [x, y - 2.85, 0]);
    B.box(140, 1, 120, toon(0x070a18, 0x05081a, 0.4), [0, y + 6, 0]);
    const cubeC = toon(0x35e8ff, 0x35e8ff, 0.8), cubeP = toon(0xff4fa3, 0xff4fa3, 0.8);
    for (const [x, z] of [[-24, -16], [24, 16], [-24, 16], [24, -16]]) {
      B.box(0.06, 8, 0.06, steel, [x, y - 6.5, z]);
      B.box(1.2, 1.2, 1.2, x < 0 ? cubeC : cubeP, [x, y - 11, z], [0.3, 0.6, 0.2]);
    }
    B.build(this.root);
    this.buildJumbotron(y);
  }

  buildJumbotron(roofY) {
    const g = new THREE.Group(); g.position.set(0, 36.5, 0); this.root.add(g); // above the room's swept circle (top 31.6)
    this.jumbo = { group: g, faces: [], tex: [] };
    const Wd = 11, H = 5.2, D = 8.4;
    const mk = (w, h) => {
      const t = canvasTexture(1024, Math.round(1024 * h / w), () => {});
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
      this.jumbo.tex.push(t); return m;
    };
    const f1 = mk(Wd, H); f1.position.z = D / 2 + 0.01; g.add(f1);
    const f2 = mk(Wd, H); f2.position.z = -D / 2 - 0.01; f2.rotation.y = Math.PI; g.add(f2);
    const f3 = mk(D, H); f3.position.x = Wd / 2 + 0.01; f3.rotation.y = Math.PI / 2; g.add(f3);
    const f4 = mk(D, H); f4.position.x = -Wd / 2 - 0.01; f4.rotation.y = -Math.PI / 2; g.add(f4);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(Wd, H, D), toon(0x0d1226, 0x070a1c, 0.3)));
    const under = mk(Wd, D); under.rotation.x = Math.PI / 2; under.position.y = -H / 2 - 0.35; g.add(under);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.6, 0.7, D + 0.6), toon(0x141a33, 0x0, 0)); lip.position.y = -H / 2; g.add(lip);
    for (const [yy, c] of [[H / 2 + 0.15, 0x35e8ff], [-H / 2 - 0.4, 0xff4fa3]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.8, 0.14, D + 0.8), glowMat(c)); r.position.y = yy; g.add(r);
    }
    for (const [x, z] of [[-4, -3], [4, -3], [-4, 3], [4, 3]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, roofY - 36.5 - H / 2, 4), toon(0x30384c));
      c.position.set(x, (roofY - 36.5) / 2 + H / 4, z); g.add(c);
    }
    this.jumboState = null;
  }

  /** Redraw the jumbotron when the state changes (not every frame). */
  updateJumbotron(st) {
    const key = `${st.cyan}|${st.pink}|${st.time}|${st.banner}|${st.bannerColor}|${st.paused}|${st.shift || ''}`;
    if (key === this.jumboState) return;
    this.jumboState = key;
    for (const t of this.jumbo.tex) {
      const c = t.userData.canvas, ctx = t.userData.ctx, w = c.width, h = c.height;
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#071030'); g.addColorStop(1, '#14082e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.18; hexPattern(ctx, w, h, 22, '#5fbfff', 1.5); ctx.globalAlpha = 1;
      if (st.banner) {
        ctx.fillStyle = st.bannerColor; ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
        logoText(ctx, st.banner, w / 2, h * 0.42, Math.min(h * 0.32, w / (st.banner.length * 0.62)), '#ffffff', st.bannerColor);
        ctx.font = `900 ${h * 0.16}px "Arial Black", system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        ctx.fillText(`${st.cyan} - ${st.pink}`, w / 2, h * 0.78);
      } else {
        ricochetLogo(ctx, w / 2, h * 0.24, h * 0.17);
        const y = h * 0.62, bw = w * 0.3;
        ctx.fillStyle = '#0c3a5a'; ctx.fillRect(w * 0.05, y - h * 0.16, bw, h * 0.32);
        ctx.fillStyle = '#5a0c3a'; ctx.fillRect(w * 0.65, y - h * 0.16, bw, h * 0.32);
        ctx.fillStyle = '#35e8ff'; ctx.fillRect(w * 0.05, y + h * 0.14, bw, h * 0.03);
        ctx.fillStyle = '#ff4fa3'; ctx.fillRect(w * 0.65, y + h * 0.14, bw, h * 0.03);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${h * 0.09}px "Arial Black", system-ui`; ctx.fillStyle = '#9ff6ff';
        ctx.fillText('TEAM CYAN', w * 0.2, y - h * 0.07); ctx.fillStyle = '#ffb1da'; ctx.fillText('TEAM PINK', w * 0.8, y - h * 0.07);
        ctx.font = `900 ${h * 0.17}px "Arial Black", system-ui`; ctx.fillStyle = '#ffffff';
        ctx.fillText(String(st.cyan), w * 0.2, y + h * 0.05); ctx.fillText(String(st.pink), w * 0.8, y + h * 0.05);
        ctx.font = `900 ${h * 0.16}px "Arial Black", system-ui`; ctx.fillText(st.time, w / 2, y - h * 0.02);
        ctx.font = `bold ${h * 0.06}px system-ui`; ctx.fillStyle = '#b8c8ff'; ctx.fillText(st.paused ? 'PAUSED' : (st.shift || 'LIVE  1v1'), w / 2, y + h * 0.12);
      }
      t.needsUpdate = true;
    }
  }

  buildBanners() {
    const cyanTex = teamBanner('cyan'), pinkTex = teamBanner('pink');
    const mkPanel = (tex, w, h, pos, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.position.set(...pos); m.rotation.y = ry; this.root.add(m);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, h + 0.6), toon(0x0c1022, 0x05081a, 0.4));
      frame.position.copy(m.position); frame.rotation.y = ry; frame.translateZ(-0.05); this.root.add(frame);
      return m;
    };
    // TEAM CYAN is always on the left (-x), TEAM PINK on the right (+x), whatever the floor is
    mkPanel(cyanTex, 8, 16, [-26, 26, -HZ - 29.4], 0);
    mkPanel(pinkTex, 8, 16, [26, 26, -HZ - 29.4], 0);
    mkPanel(cyanTex, 8, 16, [-26, 26, HZ + 29.4], Math.PI);
    mkPanel(pinkTex, 8, 16, [26, 26, HZ + 29.4], Math.PI);
    mkPanel(cyanTex, 7, 14, [-HX - 29.4, 27, -10], Math.PI / 2);
    mkPanel(cyanTex, 7, 14, [-HX - 29.4, 27, 10], Math.PI / 2);
    mkPanel(pinkTex, 7, 14, [HX + 29.4, 27, -10], -Math.PI / 2);
    mkPanel(pinkTex, 7, 14, [HX + 29.4, 27, 10], -Math.PI / 2);
    const fC = festBanner('#35e8ff'), fP = festBanner('#ff4fa3');
    const bm = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
    const mC = bm(fC), mP = bm(fP);
    for (const [x, z, ry, m] of [[-14, -24, 0, mC], [14, -24, 0, mP], [-14, 24, Math.PI, mC], [14, 24, Math.PI, mP], [-30, 0, Math.PI / 2, mC], [30, 0, -Math.PI / 2, mP]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 12.8), m); b.position.set(x, 33, z); b.rotation.y = ry; this.root.add(b);
    }
    const logo = drawLogoCanvas(1024, 256);
    const lm = new THREE.MeshBasicMaterial({ map: logo, toneMapped: false });
    for (const [x, z, ry] of [[0, -HZ - 12.4, 0], [0, HZ + 12.4, Math.PI]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), lm); b.position.set(x, STAND_Y + 10.2, z); b.rotation.y = ry; this.root.add(b);
    }
    for (const [x, ry] of [[-HX - 12.4, Math.PI / 2], [HX + 12.4, -Math.PI / 2]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), lm); b.position.set(x, STAND_Y + 10.2, 0); b.rotation.y = ry; this.root.add(b);
    }
  }

  // ------------------------------------------------------------------ the turning room (room coordinates)
  buildRoomFaces() {
    // Each of the 4 faces that can become the floor gets the same hex court texture, its middle
    // line = the half line when that face is the floor, goal-area arcs at both ends.
    const W2 = 2048, H2 = 1676; // texture 2L x 2W ratio = 22 : 18
    const tex = canvasTexture(W2, H2, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, W2, 0);
      g.addColorStop(0, '#0e2f66'); g.addColorStop(0.5, '#1b2a66'); g.addColorStop(1, '#2a1f62');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W2, H2);
      ctx.globalAlpha = 0.55; hexPattern(ctx, W2, H2, 34, '#3f7fd0', 2.2); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(80,170,255,0.10)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(200 + i * 300, 0); ctx.lineTo(320 + i * 300, 0); ctx.lineTo(120 + i * 300, H2); ctx.lineTo(0 + i * 300, H2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(220,250,255,0.9)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(W2 / 2, 0); ctx.lineTo(W2 / 2, H2); ctx.stroke();
      ctx.beginPath(); ctx.arc(W2 / 2, H2 / 2, 260, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.globalAlpha = 0.5; ricochetLogo(ctx, W2 / 2, H2 / 2, 86); ctx.restore();
      for (const x of [0, W2]) {
        ctx.strokeStyle = 'rgba(200,235,255,0.8)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(x, H2 / 2, 330, 0, Math.PI * 2); ctx.stroke();
        const rg = ctx.createRadialGradient(x, H2 / 2, 10, x, H2 / 2, 330); rg.addColorStop(0, 'rgba(160,220,255,0.30)'); rg.addColorStop(1, 'rgba(160,220,255,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, H2 / 2, 330, 0, Math.PI * 2); ctx.fill();
      }
      for (const [dir, col] of [[-1, 'rgba(160,230,255,0.28)'], [1, 'rgba(160,230,255,0.28)']]) {
        ctx.fillStyle = col;
        for (let k = 0; k < 3; k++) { const x = W2 / 2 + dir * (430 + k * 90); ctx.beginPath(); ctx.moveTo(x, H2 / 2 - 90); ctx.lineTo(x + dir * 60, H2 / 2); ctx.lineTo(x, H2 / 2 + 90); ctx.lineTo(x + dir * 30, H2 / 2 + 90); ctx.lineTo(x + dir * 90, H2 / 2); ctx.lineTo(x + dir * 30, H2 / 2 - 90); ctx.fill(); }
      }
    });
    tex.anisotropy = 8;
    const mat = new THREE.MeshToonMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.45, gradientMap: toon(0xffffff).gradientMap, side: THREE.DoubleSide });
    this.faceMeshes = {};
    for (const f of RFACES) {
      const isSide = Math.abs(f.n.x) > 0.5;
      const geo = new THREE.PlaneGeometry(isSide ? ROOM_HEIGHT : 2 * L, 2 * W);
      const m = new THREE.Mesh(geo, mat);
      // plane faces the room centre (its +z = inward); its x axis runs "along" the face in the x/y plane
      const inward = f.n.clone().negate();
      const along = new THREE.Vector3(f.n.y, -f.n.x, 0); // perpendicular to n in x/y (right-handed with z and inward)
      _m4.makeBasis(along, new THREE.Vector3(0, 0, 1), inward); m.quaternion.setFromRotationMatrix(_m4);
      m.position.copy(f.n).multiplyScalar(L);
      if (isSide) m.position.y = WALL_MID_Y;
      else if (f.n.y > 0) m.position.y = CY;
      this.room.add(m); this.faceMeshes[f.key] = m;
    }
  }

  buildRoomFrame() {
    const B = new Batcher();
    const post = toon(0x202a44, 0x101a33, 0.25);
    const edgeW = glowMat(0xbfe9ff), edgeC = glowMat(0x48f0ff), edgeP = glowMat(0xff5fb0);
    // glass on the two z faces (the rotation axis passes through them; the crowd watches through them)
    const glass = new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide });
    for (const z of [-W, W]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, ROOM_HEIGHT), glass); g.position.z = z; g.position.y = WALL_MID_Y; g.renderOrder = 5; this.room.add(g); }
    // edges: 4 long edges along z + square rims around both glass faces
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      B.box(0.22, 0.22, 2 * W, post, [sx * L, sy > 0 ? CY : -L, 0]);
      B.box(0.07, 0.07, 2 * W, edgeW, [sx * (L - 0.14), sy > 0 ? CY - 0.14 : -L + 0.14, 0]);
    }
    for (const z of [-W, W]) {
      B.box(2 * L, 0.2, 0.2, post, [0, CY, z]); B.box(2 * L, 0.2, 0.2, post, [0, -L, z]);
      B.box(0.2, ROOM_HEIGHT, 0.2, post, [L, WALL_MID_Y, z]); B.box(0.2, ROOM_HEIGHT, 0.2, post, [-L, WALL_MID_Y, z]);
      B.box(2 * L, 0.06, 0.06, edgeC, [0, CY - 0.12, z * 0.995]); B.box(2 * L, 0.06, 0.06, edgeP, [0, -L + 0.12, z * 0.995]);
      B.box(0.06, ROOM_HEIGHT, 0.06, edgeP, [L - 0.12, WALL_MID_Y, z * 0.995]); B.box(0.06, ROOM_HEIGHT, 0.06, edgeC, [-L + 0.12, WALL_MID_Y, z * 0.995]);
      // posts on the glass (every 5.5 m)
      for (let k = -L + 5.5; k < L; k += 5.5) { B.box(0.1, ROOM_HEIGHT, 0.1, post, [k, WALL_MID_Y, z]); if (k < CY) B.box(2 * L, 0.1, 0.1, post, [0, k, z]); }
    }
    B.build(this.room);
    // ad boards along the long edges of every face (read as the "boards" of whatever is the floor)
    const ad = adBoardTexture(); this.anim.adBoards.push(ad);
    const adMat = new THREE.MeshBasicMaterial({ map: ad, toneMapped: false, side: THREE.DoubleSide });
    for (const f of RFACES) for (const z of [-W + 0.02, W - 0.02]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(f.n.x) > 0.5 ? ROOM_HEIGHT - 1 : 2 * L - 1, 0.7), adMat);
      const sx = z < 0 ? 1 : -1;
      const along = new THREE.Vector3(-f.n.y, f.n.x, 0).multiplyScalar(sx);
      m.position.copy(f.n).multiplyScalar(L - 0.45); if (Math.abs(f.n.x) > 0.5) m.position.y = WALL_MID_Y; else if (f.n.y > 0) m.position.y = CY - 0.45; m.position.z = z;
      _m4.makeBasis(along, f.n.clone().negate(), new THREE.Vector3(0, 0, sx)); m.quaternion.setFromRotationMatrix(_m4);
      this.room.add(m);
    }
  }

  buildGoals() {
    // 8 mouths (4 faces x 2 slots). Mesh = ring (radius GOAL_VISUAL_RADIUS, tube GOAL_RING_TUBE) whose inner edge
    // is the scoring edge, a white scoring line, a net (active) / shutter (inactive) and a frame.
    const { GOAL_VISUAL_RADIUS: RV, GOAL_RING_TUBE: TUBE, GOAL_SCORE_RADIUS: RS, GOAL_Y } = CONFIG;
    const netTex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.clip();
      const rg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); rg.addColorStop(0, 'rgba(255,255,255,0.05)'); rg.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h); hexPattern(ctx, w, h, 18, 'rgba(255,255,255,0.95)', 3); ctx.restore();
    });
    const shutTex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#0a0e1e'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(140,160,200,0.35)'; ctx.lineWidth = 6;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); ctx.stroke(); }
      ctx.fillStyle = '#7d89a8'; ctx.font = 'bold 54px "Arial Black", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('CLOSED', w / 2, h / 2);
    });
    for (const f of RFACES) for (const s of RFACES) {
      if (Math.abs(f.n.dot(s.n)) > 0.5) continue;
      const g = new THREE.Group();
      g.position.copy(f.n).multiplyScalar(L - 0.01).addScaledVector(s.n, L - GOAL_Y);
      orient(g, f.n.clone().negate(), s.n.clone().negate()); // +z into the room, +y = up for that floor
      this.room.add(g);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x3a4460, toneMapped: false });
      const ring = new THREE.Mesh(ellipseRingGeometry(CONFIG.GOAL_A,CONFIG.GOAL_B,TUBE,TUBE), ringMat); g.add(ring);
      ring.userData.goalRing = { id: `${f.key}|${s.key}`, ringRadius: RV, tube: TUBE, opening: CONFIG.GOAL_A, a: CONFIG.GOAL_A, b: CONFIG.GOAL_B };
      const edge = new THREE.Mesh(ellipseRingGeometry(CONFIG.GOAL_A-.03,CONFIG.GOAL_B-.03,.03), glowMat(0xffffff)); g.add(edge);
      const netMat = new THREE.MeshBasicMaterial({ map: netTex, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
      const net = new THREE.Mesh(new THREE.CircleGeometry(RS, 48), netMat); net.scale.y = CONFIG.GOAL_B / CONFIG.GOAL_A; net.position.z = 0.03; g.add(net);
      const shut = new THREE.Mesh(new THREE.CircleGeometry(RS, 48), new THREE.MeshBasicMaterial({ map: shutTex, toneMapped: false })); shut.scale.y = CONFIG.GOAL_B / CONFIG.GOAL_A; shut.position.z = 0.02; g.add(shut);
      // frame (posts + bar) and a floor strip in front of the mouth
      const B = new Batcher(); const dark = toon(0x141a2e, 0x0a1022, 0.25);
      const W2 = RV + 0.75, top = CONFIG.GOAL_B + TUBE + 0.5;
      B.box(0.5, GOAL_Y + top, 0.3, dark, [-W2, (GOAL_Y + top) / 2 - GOAL_Y, 0.15]); B.box(0.5, GOAL_Y + top, 0.3, dark, [W2, (GOAL_Y + top) / 2 - GOAL_Y, 0.15]);
      B.box(W2 * 2 + 0.5, 0.5, 0.3, dark, [0, top, 0.15]);
      B.build(g);
      const frameGlowMat = new THREE.MeshBasicMaterial({ color: 0x3a4460, toneMapped: false });
      for (const [w, h, x, y] of [[0.06, GOAL_Y + top - 0.3, -W2 + 0.26, (GOAL_Y + top) / 2 - GOAL_Y - 0.15], [0.06, GOAL_Y + top - 0.3, W2 - 0.26, (GOAL_Y + top) / 2 - GOAL_Y - 0.15], [W2 * 2 - 0.5, 0.06, 0, top - 0.26]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frameGlowMat); b.position.set(x, y, 0.32); g.add(b);
      }
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(RV * 2 + 0.5, 0.25), new THREE.MeshBasicMaterial({ color: 0x3a4460, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      strip.rotation.x = -Math.PI / 2; strip.position.set(0, -GOAL_Y + 0.03, 0.2); g.add(strip);
      this.anim.mouths.push({ id: `${f.key}|${s.key}`, group: g, ringMat, netMat, net, shut, frameGlowMat, strip, team: null, flash: 0 });
    }
  }

  /** Light the active pair in team colours; the other six are closed. */
  setActiveGoals(active) {
    for (const m of this.anim.mouths) {
      const team = active && active.cyan && active.cyan.id === m.id ? 'cyan' : active && active.pink && active.pink.id === m.id ? 'pink' : null;
      m.team = team;
      const col = team ? TEAM[team].main : 0x3a4460;
      m.ringMat.color.set(col); m.netMat.color.set(col); m.frameGlowMat.color.set(col); m.strip.material.color.set(col);
      m.net.visible = !!team; m.shut.visible = !team; m.strip.visible = !!team;
      m.group.visible = !!team || this.showInactiveGoals !== false;
      m.base = new THREE.Color(col);
    }
    this.anim.goalRings = {};
    for (const m of this.anim.mouths) if (m.team) this.anim.goalRings[m.team] = m;
  }

  buildPanels() {
    const chevTex = (team) => canvasTexture(512, 512, (ctx, w, h) => {
      const col = team === 'cyan' ? '53,232,255' : '255,79,163';
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, `rgba(${col},0.42)`); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, `rgba(${col},0.32)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6;
      for (let i = -4; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 90, h); ctx.lineTo(i * 90 + h * 0.6, 0); ctx.stroke(); }
      hexPattern(ctx, w, h, 40, `rgba(${col},0.35)`, 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, w - 14, h - 14);
    });
    const texC = chevTex('cyan'), texP = chevTex('pink');
    const D2R = Math.PI / 180;
    for (const p of PANELS) {
      const g = new THREE.Group();
      g.position.set(...p.pos);
      g.rotation.set((p.tiltX || 0) * D2R, (p.rotY || 0) * D2R, (p.rotZ || 0) * D2R, 'YXZ');
      const [sx, sy, sz] = p.size;
      const mat = new THREE.MeshBasicMaterial({ map: p.team === 'cyan' ? texC : texP, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const face = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); face.userData.keep = true; face.renderOrder = 6; g.add(face);
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)), new THREE.LineBasicMaterial({ color: p.team === 'cyan' ? 0x8ff8ff : 0xffa0d4, toneMapped: false })));
      const bar = glowMat(TEAM[p.team].main);
      for (const yy of [-sy / 2, sy / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.08, 0.07, sz + 0.06), bar); b.position.y = yy; g.add(b); }
      for (const xx of [-sx / 2, sx / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, sy, sz + 0.06), bar); b.position.x = xx; g.add(b); }
      bakeRigid(g);
      this.room.add(g);
      g.userData.panelId = p.id;
      this.anim.panels.push({ id: p.id, mat, flash: 0, group: g });
    }
  }

  // Half-line curtains: x = 0 (when the floor is +-y) and y = 0 (when the floor is +-x).
  buildHalfLine() {
    const mk = () => new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uHitCol: { value: new THREE.Color(1, 1, 1) }, uHitP: { value: new THREE.Vector3() }, uFloor: { value: new THREE.Vector3(0, -1, 0) }, uL: { value: L } },
      vertexShader: `varying vec2 vUv; varying vec3 vL; void main(){ vUv=uv; vL=position; vec4 w=modelMatrix*vec4(position,1.0); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime,uHit,uL; uniform vec3 uHitCol,uHitP,uFloor; varying vec2 vUv; varying vec3 vL;
        void main(){
          float h = uL - dot(vL, uFloor);                    // height above the current floor
          float base = exp(-h*1.1)*0.75 + 0.05;
          float scan = smoothstep(0.92,1.0,fract(h*0.9 - uTime*0.6))*0.12;
          float grid = step(0.94,fract(h*1.2))*0.08;
          float hit = uHit * exp(-pow(distance(vL,uHitP)*0.7,2.0));
          vec3 col = mix(vec3(0.85,0.97,1.0), uHitCol, clamp(hit*1.5,0.0,1.0));
          gl_FragColor = vec4(col, (base + scan + grid) + hit*0.55);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    // plane x = 0: spans y and z  |  plane y = 0: spans x and z (local positions passed as vL)
    const gx = new THREE.PlaneGeometry(2 * W, ROOM_HEIGHT); gx.rotateY(Math.PI / 2); gx.translate(0, WALL_MID_Y, 0); // in y/z
    const gy = new THREE.PlaneGeometry(2 * L, 2 * W); gy.rotateX(Math.PI / 2); // in x/z
    const mx = mk(), my = mk();
    this.halfLines = { x: new THREE.Mesh(gx, mx), y: new THREE.Mesh(gy, my) };
    for (const m of Object.values(this.halfLines)) { m.renderOrder = 6; this.room.add(m); }
    this.halfLine = null;
  }
  /** Show the curtain perpendicular to the team axis (dir), or none. floorDir: outward normal of the floor. */
  setHalfLine(dir, floorDir, visible) {
    const useX = dir && Math.abs(dir.x) > 0.5;
    this.halfLines.x.visible = !!visible && useX; this.halfLines.y.visible = !!visible && !useX && !!dir;
    this.halfLine = visible ? (useX ? this.halfLines.x : this.halfLines.y) : null;
    for (const m of Object.values(this.halfLines)) m.material.uniforms.uFloor.value.copy(floorDir);
  }
  /** Feedback when a body presses against the half line (room-local point). */
  touchHalfLine(team, p) { if (!this.halfLine) return; const u = this.halfLine.material.uniforms; u.uHit.value = 1; u.uHitP.value.copy(p); u.uHitCol.value.set(team === 'cyan' ? 0x9ff6ff : 0xff9fd0); }

  /** Room attitude (from the gravity system). */
  setRoomQuat(q) { this.room.quaternion.copy(q); }

  flashGoal(team) { const r = this.anim.goalRings[team]; if (r) r.flash = 1; }
  flashPanel(id) { const p = this.anim.panels.find(p => p.id === id); if (p) p.flash = 1; }

  update(dt, t, hype, teamFlash) {
    for (const s of this.anim.spots) {
      s.phase += dt * (0.5 + hype * 0.6);
      s.light.target.position.set(Math.sin(s.phase) * 9 + s.x * 0.3, RC - 8, Math.cos(s.phase * 1.3) * 6);
      s.light.intensity = s.base * (0.75 + 0.25 * Math.sin(s.phase * 2.3) + hype * 0.8);
    }
    for (const b of this.anim.beams) {
      b.phase += dt * (0.4 + hype * 0.8);
      b.mesh.rotation.x = b.bx + Math.sin(b.phase) * 0.25; b.mesh.rotation.z = b.bz + Math.cos(b.phase * 0.8) * 0.25;
      b.mesh.material.opacity = 0.04 + hype * 0.05;
    }
    for (const tex of this.anim.adBoards) tex.offset.x = (tex.offset.x + dt * 0.04) % 1;
    for (const m of this.anim.mouths) {
      if (!m.team) continue;
      m.flash = Math.max(0, m.flash - dt * 0.8);
      const pulse = 0.85 + 0.15 * Math.sin(t * 4);
      m.ringMat.color.copy(m.base).multiplyScalar(pulse + m.flash * 1.6);
      m.netMat.opacity = 0.55 + m.flash * 0.45;
    }
    for (const p of this.anim.panels) { p.flash = Math.max(0, p.flash - dt * 3); p.mat.opacity = 0.8 + p.flash * 0.2; p.mat.color.setScalar(1 + p.flash * 1.5); }
    for (const m of Object.values(this.halfLines)) { const u = m.material.uniforms; u.uTime.value = t; u.uHit.value = Math.max(0, u.uHit.value - dt * 3); }
    const [fc, fp] = this.anim.lightsTeam;
    fc.intensity = 0.8 + (teamFlash.cyan || 0) * 3; fp.intensity = 0.7 + (teamFlash.pink || 0) * 3;
  }
}
