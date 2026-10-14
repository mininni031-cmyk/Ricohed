// AudioManager: all sound is synthesised with Web Audio (no files to load).
// Separate buses for BGM, SFX and crowd, a compressor on the master, and ON/OFF toggles.
// The context is created/resumed only from a user gesture (autoplay policy).

export class AudioManager {
  constructor() {
    this.ctx = null; this.bgmOn = true; this.sfxOn = true;
    try { const s = JSON.parse(localStorage.getItem('ricochet.audio') || '{}'); if (s.bgm === false) this.bgmOn = false; if (s.sfx === false) this.sfxOn = false; } catch (e) { /* storage blocked */ }
    this.playing = false; this.nextBeat = 0; this.beat = 0; this.bpm = 128; this.crowdLevel = 0.15;
  }
  save() { try { localStorage.setItem('ricochet.audio', JSON.stringify({ bgm: this.bgmOn, sfx: this.sfxOn })); } catch (e) { /* ignore */ } }

  /** Call from a user gesture. Safe to call many times. */
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!this.ctx) {
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master.connect(comp).connect(ctx.destination);
      this.bgm = ctx.createGain(); this.bgm.gain.value = this.bgmOn ? 0.32 : 0; this.bgm.connect(this.master);
      this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
      this.crowdBus = ctx.createGain(); this.crowdBus.gain.value = this.sfxOn ? 1 : 0; this.crowdBus.connect(this.master);
      // shared noise buffer
      const len = ctx.sampleRate * 2; this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startCrowd();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setBgm(on) { this.bgmOn = on; this.save(); if (this.bgm) this.bgm.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.05); }
  setSfx(on) { this.sfxOn = on; this.save(); if (this.sfx) { this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); this.crowdBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); } }
  startMusic() { if (!this.ctx) return; this.playing = true; this.nextBeat = this.ctx.currentTime + 0.1; this.beat = 0; }
  stopMusic() { this.playing = false; }
  pause() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---------- primitives
  osc(type, f0, f1, t, dur, vol, bus, filter = null) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) { const f = c.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.f; f.Q.value = filter.q || 0.7; g.connect(f); node = f; }
    node.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(t, dur, vol, bus, type = 'highpass', f = 1000, f1 = null, q = 0.8) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---------- crowd ambience (continuous filtered noise, swells with hype)
  startCrowd() {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.crowdGain = c.createGain(); this.crowdGain.gain.value = 0;
    s.connect(bp).connect(lp).connect(this.crowdGain).connect(this.crowdBus); s.start();
    this.crowdFilter = bp;
  }
  setCrowd(level) {
    if (!this.ctx || !this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.setTargetAtTime(0.03 + level * 0.16, t, 0.25);
    this.crowdFilter.frequency.setTargetAtTime(600 + level * 900, t, 0.3);
  }
  roar(amount = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.noise(t, 2.2 * amount, 0.22 * amount, this.crowdBus, 'bandpass', 800, 1400, 0.5);
    for (let i = 0; i < 6; i++) this.osc('sawtooth', 300 + Math.random() * 300, 380 + Math.random() * 400, t + Math.random() * 0.3, 0.6 + Math.random() * 0.6, 0.012 * amount, this.crowdBus, { type: 'lowpass', f: 1400 });
  }
  ooh() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noise(t, 1.0, 0.12, this.crowdBus, 'bandpass', 500, 380, 1.2); this.osc('sine', 320, 260, t, 0.9, 0.03, this.crowdBus); }

  // ---------- SFX
  play(name, p = {}) {
    if (!this.ctx || !this.sfxOn) return;
    const t = this.ctx.currentTime, b = this.sfx;
    switch (name) {
      case 'start': // rising arpeggio + whistle
        [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.09, 0.22, 0.09, b));
        this.osc('sine', 2400, 2600, t + 0.4, 0.5, 0.05, b); this.osc('sine', 2600, 2500, t + 0.4, 0.5, 0.04, b);
        break;
      case 'throw':
        this.noise(t, 0.22, 0.16, b, 'bandpass', 600, 3200, 1.5);
        this.osc('triangle', 420, 880, t, 0.12, 0.08, b);
        this.osc('sine', 60, 40, t, 0.12, 0.12, b);
        break;
      case 'bounce': { // metallic ping, pitch rises with bounce count
        const k = Math.min(3, p.count || 1), f = 900 * Math.pow(1.26, k - 1);
        this.osc('square', f, f * 0.98, t, 0.09, 0.05, b, { type: 'bandpass', f: f * 1.5, q: 3 });
        this.osc('sine', f * 2.01, f * 2, t, 0.25, 0.05, b);
        this.osc('sine', f * 2.76, f * 2.75, t, 0.18, 0.025, b);
        this.noise(t, 0.05, 0.08, b, 'highpass', 3000);
        break;
      }
      case 'rim': this.osc('square', 520, 500, t, 0.25, 0.06, b, { type: 'bandpass', f: 900, q: 6 }); this.osc('sine', 1300, 1290, t, 0.5, 0.04, b); break;
      case 'thud': this.osc('sine', 140, 70, t, 0.12, 0.08, b); break;
      case 'catch':
        this.osc('sine', 150, 80, t, 0.1, 0.16, b); this.noise(t, 0.06, 0.1, b, 'lowpass', 1200);
        this.osc('triangle', 880, 880, t + 0.03, 0.12, 0.06, b); this.osc('triangle', 1320, 1320, t + 0.08, 0.16, 0.05, b);
        break;
      case 'catchMiss': this.osc('triangle', 400, 300, t, 0.1, 0.04, b); break;
      case 'pickup': this.osc('sine', 660, 990, t, 0.1, 0.06, b); break;
      case 'dash': this.noise(t, 0.28, 0.2, b, 'bandpass', 2400, 400, 1.2); this.osc('sawtooth', 140, 70, t, 0.2, 0.05, b, { type: 'lowpass', f: 800 }); break;
      case 'wallkick': this.osc('square', 180, 90, t, 0.09, 0.05, b, { type: 'lowpass', f: 1200 }); this.noise(t, 0.12, 0.09, b, 'bandpass', 1800, 300, 2); this.osc('sine', 520, 1040, t + 0.03, 0.12, 0.04, b); break;
      case 'jump': this.osc('sine', p.second ? 420 : 260, p.second ? 880 : 520, t, 0.14, 0.05, b); this.noise(t, 0.1, 0.04, b, 'highpass', 2000); break;
      case 'land': this.osc('sine', 110, 60, t, 0.1, 0.08 * (p.strength || 1), b); break;
      case 'ceiling': this.osc('square', 300, 200, t, 0.08, 0.04, b, { type: 'lowpass', f: 900 }); break;
      case 'save':
        this.osc('sine', 120, 50, t, 0.25, 0.25, b); this.noise(t, 0.18, 0.2, b, 'lowpass', 2500, 400);
        this.osc('square', 330, 330, t + 0.02, 0.1, 0.05, b); this.osc('square', 220, 220, t + 0.1, 0.16, 0.05, b);
        this.ooh();
        break;
      case 'goal': {
        // stadium horn chord + sparkle + crowd roar
        for (const f of [261.6, 329.6, 392, 523.3]) this.osc('sawtooth', f, f, t, 1.4, 0.035, b, { type: 'lowpass', f: 2200 });
        [784, 988, 1175, 1568].forEach((f, i) => this.osc('triangle', f, f, t + 0.15 + i * 0.07, 0.3, 0.05, b));
        this.osc('sine', 80, 40, t, 0.5, 0.25, b);
        this.roar(1);
        break;
      }
      case 'concede': for (const [f, d] of [[392, 0], [330, 0.15], [262, 0.3]]) this.osc('triangle', f, f * 0.97, t + d, 0.25, 0.06, b); this.ooh(); break;
      case 'end':
        this.osc('square', 220, 220, t, 0.9, 0.06, b, { type: 'lowpass', f: 1200 });
        this.osc('square', 277, 277, t, 0.9, 0.05, b, { type: 'lowpass', f: 1200 });
        [523, 659, 784].forEach((f, i) => this.osc('triangle', f, f, t + 1 + i * 0.12, 0.6, 0.06, b));
        this.roar(0.8);
        break;
      case 'shift': this.osc('sawtooth', 70, 140, t, 1.6, 0.06, b, { type: 'lowpass', f: 600 }); this.noise(t, 1.8, 0.06, b, 'bandpass', 300, 1600, 0.8); this.osc('sine', 220, 330, t + 0.2, 1.2, 0.03, b); break;
      case 'newfloor': this.osc('sine', 90, 50, t, 0.3, 0.12, b); for (const [f, d] of [[523, 0], [784, 0.08], [1047, 0.16]]) this.osc('triangle', f, f, t + d, 0.18, 0.05, b); break;
      case 'ui': this.osc('triangle', 880, 880, t, 0.06, 0.04, b); break;
      case 'tick': this.osc('square', 1500, 1500, t, 0.04, 0.03, b); break;
    }
  }

  // ---------- BGM: 128 BPM synth-pop loop (kick, hats, bass, arp, chords)
  update() {
    if (!this.ctx || !this.playing) return;
    const c = this.ctx, spb = 60 / this.bpm / 4; // 16th notes
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    const bassN = [45, 41, 36, 43];
    const m2f = n => 440 * Math.pow(2, (n - 69) / 12);
    while (this.nextBeat < c.currentTime + 0.25) {
      const t = this.nextBeat, s = this.beat % 64, bar = Math.floor(s / 16), step = s % 16;
      const ch = chords[bar], bus = this.bgm;
      if (step % 4 === 0) { this.osc('sine', 150, 45, t, 0.22, 0.5, bus); }
      if (step % 4 === 2) this.noise(t, 0.05, 0.12, bus, 'highpass', 7000);
      if (step === 4 || step === 12) { this.noise(t, 0.16, 0.18, bus, 'bandpass', 1800, 1200, 0.8); this.osc('triangle', 220, 180, t, 0.1, 0.08, bus); }
      if (step % 2 === 0) this.osc('sawtooth', m2f(bassN[bar] + (step % 8 === 6 ? 12 : 0)), m2f(bassN[bar]), t, spb * 1.8, 0.07, bus, { type: 'lowpass', f: 600 });
      const arp = ch[(step + Math.floor(step / 4)) % 3] + 12 + (step % 8 === 7 ? 12 : 0);
      this.osc('square', m2f(arp), m2f(arp), t, spb * 0.9, 0.022, bus, { type: 'lowpass', f: 2600 });
      if (step === 0) for (const n of ch) this.osc('triangle', m2f(n), m2f(n), t, spb * 15, 0.02, bus, { type: 'lowpass', f: 1600 });
      this.nextBeat += spb; this.beat++;
    }
  }
}
