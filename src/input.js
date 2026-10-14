// Input: keyboard + mouse (pointer lock with drag-look fallback) + touch (stick, look area, buttons).
// Produces a per-frame snapshot plus one-shot "pressed" events consumed by the game.

export class Input {
  constructor(canvas, isTouch) {
    this.canvas = canvas; this.isTouch = isTouch;
    this.keys = new Set();
    this.stick = { x: 0, y: 0 };
    this.lookDX = 0; this.lookDY = 0;
    this.pressed = new Set();
    this.locked = false; this.lockFailed = false;
    this.sensitivity = 0.0024; this.touchSens = 0.0055;
    this.enabled = false;
    this.listeners = [];
    this.onLockChange = null; this.onPauseKey = null; this.onFirstGesture = null; this.onSkip = null;
    this.bind();
  }
  on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); this.listeners.push([target, ev, fn, opt]); }
  press(name) { if (this.enabled) this.pressed.add(name); }
  consume(name) { const had = this.pressed.has(name); this.pressed.delete(name); return had; }
  clearPresses() { this.pressed.clear(); }

  bind() {
    const gesture = () => this.onFirstGesture && this.onFirstGesture();
    this.on(document, 'keydown', (e) => {
      gesture();
      if (e.code === 'Escape') { if (this.onPauseKey) this.onPauseKey(); return; }
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.press('chargeStart');
      if (e.code === 'KeyZ') this.press('curveLeft');
      if (e.code === 'KeyX') this.press('curveRight');
      if (e.code === 'KeyC') this.press('curveStraight');
      if (e.code === 'Space') this.press('jump');
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.press('dash');
      if (e.code === 'KeyE') this.press('curveCycle');
      if (e.code === 'KeyF') this.press('catch'); // keyboard alternative
      if ((e.code === 'Enter' || e.code === 'Tab') && this.onSkip) { e.preventDefault(); this.onSkip(); }
      if (e.code === 'KeyP') { if (this.onPauseKey) this.onPauseKey(); }
    });
    this.on(document, 'keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyQ') this.press('chargeRelease'); });
    this.on(window, 'blur', () => { this.press('chargeCancel'); this.keys.clear(); this.stick.x = this.stick.y = 0; });
    this.on(document, 'mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.lockFailed) { this.lookDX += e.movementX || 0; this.lookDY += e.movementY || 0; }
    });
    this.on(this.canvas, 'mousedown', (e) => {
      gesture();
      if (this.isTouch || !this.enabled) return;
      if (!this.locked && !this.lockFailed) {
        // First click (re)acquires the mouse lock and is not treated as a shot (same as v2.3.2)
        this.requestLock();
        return;
      }
      if (e.button === 0) this.press('shoot');
      if (e.button === 2) this.press('catch');
    });
    this.on(this.canvas, 'contextmenu', (e) => e.preventDefault());
    this.on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) { this.everLocked = true; this.lockFailed = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    // If pointer lock is unavailable (some embeds), fall back to free mouse-look over the canvas
    this.on(document, 'pointerlockerror', () => this.lockError());
    this.bindTouch(gesture);
  }

  requestLock() {
    if (this.isTouch || this.locked) return;
    try {
      if (!this.canvas.requestPointerLock) { this.lockFailed = true; return; }
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => this.lockError());
    } catch (e) { this.lockFailed = true; }
  }
  lockError() {
    this.locked = false; this.lockRejects = (this.lockRejects || 0) + 1;
    // Only fall back to free look if the lock has never worked here (e.g. sandboxed embeds)
    if (!this.everLocked && this.lockRejects >= 2) this.lockFailed = true;
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  bindTouch(gesture) {
    const stick = document.getElementById('stick'), nub = document.getElementById('nub');
    let sid = null;
    const move = (e) => {
      const r = stick.getBoundingClientRect();
      let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.max(1, Math.hypot(x, y)); x /= l; y /= l;
      this.stick.x = x; this.stick.y = y;
      nub.style.transform = `translate(${x * 34}px,${y * 34}px)`;
    };
    const end = (e) => { if (e.pointerId !== sid) return; sid = null; this.stick.x = this.stick.y = 0; nub.style.transform = ''; };
    this.on(stick, 'pointerdown', (e) => { gesture(); e.preventDefault(); sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (err) { /* synthetic or already released pointer */ } move(e); });
    this.on(stick, 'pointermove', (e) => { if (e.pointerId === sid) move(e); });
    this.on(stick, 'pointerup', end); this.on(stick, 'pointercancel', end);

    // Look: drag anywhere on the right part of the screen (not on buttons)
    let lid = null, lx = 0, ly = 0;
    this.on(this.canvas, 'pointerdown', (e) => {
      if (e.pointerType !== 'touch' && !this.isTouch) return;
      gesture();
      if (e.clientX < innerWidth * 0.33) return;
      lid = e.pointerId; lx = e.clientX; ly = e.clientY;
    });
    this.on(this.canvas, 'pointermove', (e) => {
      if (lid !== e.pointerId || !this.enabled) return;
      this.lookDX += (e.clientX - lx) * (this.touchSens / this.sensitivity); this.lookDY += (e.clientY - ly) * (this.touchSens / this.sensitivity);
      lx = e.clientX; ly = e.clientY;
    });
    const lend = (e) => { if (lid === e.pointerId) lid = null; };
    this.on(this.canvas, 'pointerup', lend); this.on(this.canvas, 'pointercancel', lend);

    const btn = (id, name) => {
      const el = document.getElementById(id); if (!el) return;
      this.on(el, 'pointerdown', (e) => { gesture(); e.preventDefault(); e.stopPropagation(); el.classList.add('down'); this.press(name); });
      const up = () => el.classList.remove('down');
      this.on(el, 'pointerup', up); this.on(el, 'pointercancel', up); this.on(el, 'pointerleave', up);
    };
    btn('tCurve', 'curveCycle');
    const charge = document.getElementById('tCharge');
    if (charge) {
      this.on(charge, 'pointerdown', e => { gesture(); e.preventDefault(); e.stopPropagation(); charge.setPointerCapture(e.pointerId); this.press('chargeStart'); });
      this.on(charge, 'pointerup', e => { e.preventDefault(); this.press('chargeRelease'); });
      this.on(charge, 'pointercancel', () => this.press('chargeCancel'));
    }
    btn('tShoot', 'shoot'); btn('tCatch', 'catch'); btn('tDash', 'dash'); btn('tJump', 'jump');
  }

  /** Movement axes: x = strafe right, y = forward */
  axes() {
    let x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.stick.x;
    let y = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - this.stick.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  takeLook() { const d = { x: this.lookDX, y: this.lookDY }; this.lookDX = 0; this.lookDY = 0; return d; }
}
