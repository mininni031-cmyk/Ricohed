// Anime face painter. Draws eyes / iris / highlights / brows / nose / mouth onto a canvas
// that is mapped onto the front of a 3D head (see character.js: FACE_PATCH).
// One canvas texture per expression; switching expression = swapping the material map.
import * as THREE from 'three';

// Angular extent of the face patch on the head sphere. Must match character.js.
export const FACE_PATCH = { a: 1.15, t0: 0.95, t1: 2.25, W: 512, H: 290 };

function P(phi, theta) {
  // phi: horizontal angle from face centre (- = viewer's left), theta: polar angle from top
  const { a, t0, t1, W, H } = FACE_PATCH;
  return [((phi + a) / (2 * a)) * W, ((theta - t0) / (t1 - t0)) * H];
}

export const EXPRESSIONS = ['normal', 'shoot', 'catch', 'save', 'conceded', 'blink'];

const EXPR = {
  //            lid: how far the upper lid comes down (0..1); brow: inner/outer offsets (px, + = down)
  normal:   { lid: 0.02, browIn: 0, browOut: 0, browTilt: 0, look: [0, 0], mouth: 'smile', blush: 0.55 },
  shoot:    { lid: 0.28, browIn: 10, browOut: -4, look: [0.08, -0.05], mouth: 'shout', blush: 0.35 },
  catch:    { lid: -0.04, browIn: -8, browOut: -6, look: [0, 0.05], mouth: 'o', blush: 0.45 },
  save:     { lid: 0.22, browIn: 13, browOut: -6, look: [0, 0], mouth: 'grit', blush: 0.3 },
  blink:    { lid: 0, browIn: 0, browOut: 0, browTilt: 0, look: [0, 0], mouth: 'smile', blush: 0.55, closed: true },
  conceded: { lid: 0.3, browIn: -11, browOut: 6, look: [0, 0.18], mouth: 'frown', blush: 0.7, sweat: true },
};

function eye(ctx, cx, cy, side, w, h, pal, e) {
  // side: -1 = viewer-left eye, +1 = viewer-right eye
  ctx.save();
  // Sclera shape (rounded, slightly tilted outward)
  const path = new Path2D();
  path.moveTo(cx - w / 2, cy - h * 0.05);
  path.bezierCurveTo(cx - w * 0.45, cy - h * 0.62, cx + w * 0.45, cy - h * 0.62, cx + w / 2, cy - h * 0.02);
  path.bezierCurveTo(cx + w * 0.42, cy + h * 0.52, cx - w * 0.42, cy + h * 0.52, cx - w / 2, cy - h * 0.05);
  ctx.fillStyle = '#ffffff';
  ctx.fill(path);
  ctx.clip(path);

  // Lid narrowing (expression)
  const lidY = cy - h * 0.55 + h * Math.max(0, e.lid) * 1.1;

  // Iris
  const ix = cx + e.look[0] * w, iy = cy + h * 0.06 + e.look[1] * h;
  const iw = w * 0.36, ih = h * 0.5;
  const g = ctx.createLinearGradient(ix, iy - ih, ix, iy + ih);
  g.addColorStop(0, pal.irisDark);
  g.addColorStop(0.45, pal.iris);
  g.addColorStop(1, pal.irisLight);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(ix, iy, iw, ih, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = pal.irisDark; ctx.stroke();
  // Pupil
  ctx.fillStyle = '#10142a';
  ctx.beginPath(); ctx.ellipse(ix, iy + ih * 0.05, iw * 0.42, ih * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  // Iris lower glow ring
  ctx.strokeStyle = pal.irisLight; ctx.globalAlpha = 0.7; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(ix, iy + ih * 0.25, iw * 0.65, ih * 0.45, 0, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.globalAlpha = 1;
  // Highlights
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(ix - iw * 0.38, iy - ih * 0.42, iw * 0.34, ih * 0.24, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(ix + iw * 0.4, iy + ih * 0.42, iw * 0.14, ih * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // Upper-lid shadow on the sclera
  ctx.fillStyle = 'rgba(70,80,140,0.28)';
  ctx.fillRect(cx - w, lidY - 2, w * 2, h * 0.22);
  // Lid cover (skin) when narrowed
  if (e.lid > 0) { ctx.fillStyle = pal.skin; ctx.fillRect(cx - w, cy - h, w * 2, lidY - (cy - h)); }
  ctx.restore();

  // Upper lash line: thick, with an outer wing
  ctx.save();
  ctx.strokeStyle = pal.lash; ctx.fillStyle = pal.lash; ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  const outer = side; // outer corner direction
  ctx.beginPath();
  const y0 = lidY + h * 0.08;
  ctx.moveTo(cx - outer * w * 0.55, y0 + h * 0.22);
  ctx.quadraticCurveTo(cx - outer * w * 0.1, y0 - h * 0.12, cx + outer * w * 0.55, y0 + h * 0.08);
  ctx.stroke();
  // Wing
  ctx.beginPath();
  ctx.moveTo(cx + outer * w * 0.42, y0 + h * 0.02);
  ctx.lineTo(cx + outer * w * 0.74, y0 - h * 0.06);
  ctx.lineTo(cx + outer * w * 0.5, y0 + h * 0.16);
  ctx.closePath(); ctx.fill();
  // Lower lash (thin, outer half)
  ctx.lineWidth = 2.5; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(cx + outer * w * 0.48, cy + h * 0.12);
  ctx.quadraticCurveTo(cx + outer * w * 0.15, cy + h * 0.44, cx - outer * w * 0.15, cy + h * 0.42);
  ctx.stroke();
  ctx.restore();
}

function brow(ctx, cx, cy, side, w, pal, e) {
  ctx.save();
  ctx.strokeStyle = pal.brow; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const inner = -side; // inner end points toward the nose
  const xi = cx + inner * w * 0.42, xo = cx - inner * w * 0.5;
  const yi = cy + e.browIn, yo = cy + 4 + e.browOut;
  ctx.beginPath(); ctx.moveTo(xi, yi);
  ctx.quadraticCurveTo((xi + xo) / 2, Math.min(yi, yo) - 7, xo, yo);
  ctx.stroke();
  ctx.restore();
}

function mouth(ctx, x, y, kind, pal) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.mouthLine; ctx.lineWidth = 4;
  switch (kind) {
    case 'smile':
      ctx.beginPath(); ctx.moveTo(x - 15, y - 2); ctx.quadraticCurveTo(x, y + 9, x + 15, y - 2); ctx.stroke();
      break;
    case 'shout': {
      ctx.fillStyle = pal.mouthIn;
      ctx.beginPath(); ctx.moveTo(x - 15, y - 5); ctx.quadraticCurveTo(x, y - 9, x + 15, y - 5);
      ctx.quadraticCurveTo(x + 8, y + 15, x, y + 15); ctx.quadraticCurveTo(x - 8, y + 15, x - 15, y - 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8fa6'; ctx.beginPath(); ctx.ellipse(x, y + 10, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'o':
      ctx.fillStyle = pal.mouthIn;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 7, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      break;
    case 'grit':
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x - 17, y - 4); ctx.lineTo(x + 17, y - 4); ctx.lineTo(x + 13, y + 8); ctx.lineTo(x - 13, y + 8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 15, y + 2); ctx.lineTo(x + 15, y + 2); ctx.stroke();
      break;
    case 'frown':
      ctx.beginPath(); ctx.moveTo(x - 14, y + 6); ctx.quadraticCurveTo(x - 7, y - 3, x, y + 3); ctx.quadraticCurveTo(x + 7, y - 3, x + 14, y + 6); ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Paints a face. Used for the 3D head textures and the HUD portrait. */
export function paintFace(ctx, pal, exprName, map = P, scale = 1) {
  const e = EXPR[exprName] || EXPR.normal;
  const s = scale;
  const eyeW = 70 * s, eyeH = 80 * s;
  const eyeT = 1.62, eyeP = 0.41;
  for (const side of [-1, 1]) {
    const [ex, ey] = map(side * eyeP, eyeT);
    // brows first (drawn above the eye)
    brow(ctx, ex, ey - eyeH * 0.82, side, eyeW, pal, e);
    if (e.closed) { // blink: closed-eye lash curve
      ctx.save(); ctx.strokeStyle = '#141a30'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - eyeW * 0.5, ey - eyeH * 0.02); ctx.quadraticCurveTo(ex, ey + eyeH * 0.22, ex + eyeW * 0.5, ey - eyeH * 0.04); ctx.stroke();
      ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(ex + side * eyeW * 0.5, ey - eyeH * 0.04); ctx.lineTo(ex + side * eyeW * 0.62, ey - eyeH * 0.14); ctx.stroke(); ctx.restore();
    } else eye(ctx, ex, ey, side, eyeW, eyeH, pal, e);
    // blush
    const [bx, by] = map(side * 0.55, 1.88);
    const rg = ctx.createRadialGradient(bx, by, 1, bx, by, 26 * s);
    rg.addColorStop(0, `rgba(255,120,150,${0.45 * e.blush})`); rg.addColorStop(1, 'rgba(255,120,150,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(bx, by, 28 * s, 16 * s, 0, 0, Math.PI * 2); ctx.fill();
    // blush hatching
    ctx.strokeStyle = `rgba(230,90,120,${0.5 * e.blush})`; ctx.lineWidth = 2 * s;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(bx + i * 8 * s - 3 * s, by + 4 * s); ctx.lineTo(bx + i * 8 * s + 3 * s, by - 4 * s); ctx.stroke(); }
  }
  // Nose: tiny shadow stroke
  const [nx, ny] = map(0.02, 1.86);
  ctx.strokeStyle = 'rgba(160,90,90,0.75)'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(nx + 2 * s, ny - 8 * s); ctx.lineTo(nx - 2 * s, ny + 2 * s); ctx.stroke();
  // Mouth
  const [mx, my] = map(0, 2.02);
  mouth(ctx, mx, my, e.mouth, pal);
  if (e.sweat) {
    const [sx, sy] = map(0.78, 1.42);
    ctx.fillStyle = 'rgba(150,220,255,0.95)'; ctx.strokeStyle = '#3a78b8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy - 16); ctx.quadraticCurveTo(sx + 11, sy + 4, sx, sy + 8); ctx.quadraticCurveTo(sx - 11, sy + 4, sx, sy - 16); ctx.fill(); ctx.stroke();
  }
}

/** Returns { normal: Texture, shoot: Texture, ... } for one character palette. */
export function makeFaceTextures(pal) {
  const out = {};
  const { W, H } = FACE_PATCH;
  for (const ex of EXPRESSIONS) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    paintFace(ctx, pal, ex);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    out[ex] = t;
  }
  return out;
}

/** 2D portrait for the HUD (flat anime bust: hair + face). Returns a data URL. */
export function portraitDataURL(pal, hair = '#1b2140', hairHi = '#3a4a8a', size = 160) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 160;
  ctx.fillStyle = '#0b1830'; ctx.fillRect(0, 0, size, size);
  const bg = ctx.createLinearGradient(0, 0, size, size); bg.addColorStop(0, 'rgba(53,232,255,0.35)'); bg.addColorStop(1, 'rgba(10,20,50,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
  // neck + collar
  ctx.fillStyle = pal.skin; ctx.fillRect(66 * s, 112 * s, 28 * s, 30 * s);
  ctx.fillStyle = '#121a2c'; ctx.beginPath(); ctx.moveTo(20 * s, 160 * s); ctx.lineTo(48 * s, 128 * s); ctx.lineTo(112 * s, 128 * s); ctx.lineTo(140 * s, 160 * s); ctx.fill();
  ctx.fillStyle = '#35e8ff'; ctx.fillRect(48 * s, 128 * s, 64 * s, 5 * s);
  // back hair
  ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(80 * s, 70 * s, 54 * s, 58 * s, 0, 0, Math.PI * 2); ctx.fill();
  // face
  ctx.fillStyle = pal.skin;
  ctx.beginPath(); ctx.moveTo(36 * s, 62 * s); ctx.quadraticCurveTo(36 * s, 104 * s, 80 * s, 124 * s); ctx.quadraticCurveTo(124 * s, 104 * s, 124 * s, 62 * s);
  ctx.quadraticCurveTo(80 * s, 20 * s, 36 * s, 62 * s); ctx.fill();
  ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2.5 * s; ctx.stroke();
  // features: map angular coords into the portrait face
  const map = (phi, theta) => [80 * s + phi * 58 * s, 86 * s + (theta - 1.6) * 52 * s];
  paintFace(ctx, pal, 'normal', map, 0.36 * s);
  // bangs
  ctx.fillStyle = hair; ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(28 * s, 70 * s);
  const tips = [[40, 84], [52, 64], [62, 86], [74, 62], [86, 84], [98, 64], [108, 82], [122, 70]];
  ctx.quadraticCurveTo(40 * s, 14 * s, 82 * s, 14 * s); ctx.quadraticCurveTo(128 * s, 16 * s, 132 * s, 70 * s);
  for (let i = tips.length - 1; i >= 0; i--) ctx.lineTo(tips[i][0] * s, tips[i][1] * s);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = hairHi; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(80 * s, 60 * s, 40 * s, 1.15 * Math.PI, 1.6 * Math.PI); ctx.stroke();
  return c.toDataURL();
}
