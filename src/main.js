// Entry point. Errors during boot are shown on screen instead of failing silently.
import * as THREE from 'three';
import { Game } from './game.js';
import { segmentHitsOBB } from './physics.js';
import { CONFIG, CATCH, CPU_CATCH, CPU_PRESETS, PANELS, AIR_SHOT_SPREAD, GRAVITY_SHIFT, WALL_KICK, ROOM } from './config.js';
import { evalCatch } from './catch.js';

function showError(msg) {
  let el = document.getElementById('fatal');
  if (!el) { el = document.createElement('div'); el.id = 'fatal'; el.style.cssText = 'position:fixed;left:10px;bottom:10px;right:10px;z-index:99;background:#300a18;color:#fff;border:1px solid #ff4fa3;padding:10px;font:12px monospace;white-space:pre-wrap'; document.body.appendChild(el); }
  el.textContent = 'RICOCHET error: ' + msg;
}
window.addEventListener('error', (e) => showError(e.message || String(e)));

function boot() {
  const test = /[?&]test=1/.test(location.search);
  const debug = /[?&]debug=1/.test(location.search);
  try {
    const game = new Game({ test, debug });
    window.RICOCHET = { version: CONFIG.VERSION, config: CONFIG, CATCH, CPU_PRESETS, GRAVITY_SHIFT };
    if (test) window.__RICO = { game, THREE, CONFIG, PANELS, CATCH, CPU_CATCH, CPU_PRESETS, GRAVITY_SHIFT, WALL_KICK, ROOM, evalCatch, segHit: segmentHitsOBB, SPREAD: AIR_SHOT_SPREAD };
  } catch (e) {
    console.error(e);
    showError(e && e.stack ? e.stack : String(e));
    const b = document.getElementById('boot'); if (b) b.textContent = 'RICOCHET failed to start (WebGL required)';
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
