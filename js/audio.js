// Synthesized engine, music and sound effects.
import { clamp } from './util.js';
import { SAVE } from './save.js';

/* ============================== audio ============================== */
class AudioEngine {
  constructor() { this.ready = false; this.intensity = 1; this.muffle = 0; this.step = 0; this.bar = 0; }
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicLP = ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 18000; this.musicLP.Q.value = 0.7;
    this.musicBus.connect(this.musicLP); this.musicLP.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    // noise buffer
    const len = ctx.sampleRate * 2, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    // delay for arps
    this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.36; this.fb = ctx.createGain(); this.fb.gain.value = 0.32;
    this.delayLP = ctx.createBiquadFilter(); this.delayLP.type = 'lowpass'; this.delayLP.frequency.value = 3200;
    this.delay.connect(this.delayLP); this.delayLP.connect(this.fb); this.fb.connect(this.delay); this.delayLP.connect(this.musicBus);
    // pad sidechain
    this.padBus = ctx.createGain(); this.padBus.connect(this.musicBus);
    this.buildEngine();
    this.applyVolumes();
    this.ready = true;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  applyVolumes() {
    if (!this.ctx) return;
    const s = SAVE.settings;
    this.master.gain.value = s.master * 0.9;
    this.musicBus.gain.value = s.music * 0.55;
    this.sfx.gain.value = s.sfx;
  }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  noise(loop = true) { const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = loop; return n; }

  /* ---------- engine ---------- */
  buildEngine() {
    const c = this.ctx;
    this.eng = {};
    const E = this.eng;
    E.out = c.createGain(); E.out.gain.value = 0; E.out.connect(this.sfx);
    E.lp = c.createBiquadFilter(); E.lp.type = 'lowpass'; E.lp.frequency.value = 900; E.lp.Q.value = 2.5;
    E.shaper = c.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); } E.shaper.curve = curve;
    E.pre = c.createGain(); E.pre.gain.value = 0.5;
    E.pre.connect(E.shaper); E.shaper.connect(E.lp); E.lp.connect(E.out);
    E.o1 = c.createOscillator(); E.o1.type = 'sawtooth';
    E.o2 = c.createOscillator(); E.o2.type = 'square';
    E.o3 = c.createOscillator(); E.o3.type = 'sawtooth';
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.32; g3.gain.value = 0.18;
    E.o1.connect(g1); E.o2.connect(g2); E.o3.connect(g3); g1.connect(E.pre); g2.connect(E.pre); g3.connect(E.pre);
    E.o1.start(); E.o2.start(); E.o3.start();
    // intake / roar noise
    E.n = this.noise(); E.nbp = c.createBiquadFilter(); E.nbp.type = 'bandpass'; E.nbp.Q.value = 1.4; E.ng = c.createGain(); E.ng.gain.value = 0;
    E.n.connect(E.nbp); E.nbp.connect(E.ng); E.ng.connect(E.out); E.n.start();
    // wind
    E.w = this.noise(); E.wlp = c.createBiquadFilter(); E.wlp.type = 'lowpass'; E.wlp.frequency.value = 400; E.wg = c.createGain(); E.wg.gain.value = 0;
    E.w.connect(E.wlp); E.wlp.connect(E.wg); E.wg.connect(this.sfx); E.w.start();
    // tyre squeal
    E.t = this.noise(); E.tbp = c.createBiquadFilter(); E.tbp.type = 'bandpass'; E.tbp.frequency.value = 1700; E.tbp.Q.value = 9; E.tg = c.createGain(); E.tg.gain.value = 0;
    E.t.connect(E.tbp); E.tbp.connect(E.tg); E.tg.connect(this.sfx); E.t.start();
    // boost whistle + rumble
    E.b = c.createOscillator(); E.b.type = 'sine'; E.b.frequency.value = 2600; E.bg = c.createGain(); E.bg.gain.value = 0; E.b.connect(E.bg); E.bg.connect(this.sfx); E.b.start();
    E.br = this.noise(); E.brlp = c.createBiquadFilter(); E.brlp.type = 'lowpass'; E.brlp.frequency.value = 220; E.brg = c.createGain(); E.brg.gain.value = 0;
    E.br.connect(E.brlp); E.brlp.connect(E.brg); E.brg.connect(this.sfx); E.br.start();
    // scrape
    E.sc = this.noise(); E.schp = c.createBiquadFilter(); E.schp.type = 'highpass'; E.schp.frequency.value = 2400; E.scg = c.createGain(); E.scg.gain.value = 0;
    E.sc.connect(E.schp); E.schp.connect(E.scg); E.scg.connect(this.sfx); E.sc.start();
  }
  engineUpdate(o) { // o: rpm(0-1), throttle, speed m/s, slip, boost, scrape, on
    if (!this.ready) return;
    const E = this.eng, t = this.ctx.currentTime, k = 0.06;
    const f = 34 + o.rpm * 190 + (o.boost ? 12 : 0);
    E.o1.frequency.setTargetAtTime(f, t, 0.03); E.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); E.o3.frequency.setTargetAtTime(f * 1.505, t, 0.03);
    E.lp.frequency.setTargetAtTime(380 + o.throttle * 1500 + o.rpm * 2200, t, k);
    E.out.gain.setTargetAtTime(o.on ? (0.14 + o.throttle * 0.13) : 0, t, 0.12);
    E.nbp.frequency.setTargetAtTime(500 + o.rpm * 1800, t, k); E.ng.gain.setTargetAtTime(o.on ? 0.03 + o.throttle * 0.06 : 0, t, k);
    const sp = clamp(o.speed / 110, 0, 1.3);
    E.wlp.frequency.setTargetAtTime(250 + sp * 1600, t, k); E.wg.gain.setTargetAtTime(o.on ? sp * sp * 0.22 : 0, t, 0.1);
    E.tg.gain.setTargetAtTime(o.on ? clamp(o.slip, 0, 1) * 0.12 : 0, t, 0.05); E.tbp.frequency.setTargetAtTime(1500 + o.slip * 600 + Math.sin(t * 30) * 80, t, 0.02);
    E.bg.gain.setTargetAtTime(o.on && o.boost ? 0.025 : 0, t, 0.08); E.b.frequency.setTargetAtTime(2200 + sp * 1600, t, 0.1);
    E.brg.gain.setTargetAtTime(o.on && o.boost ? 0.35 : 0, t, 0.08);
    E.scg.gain.setTargetAtTime(o.on ? clamp(o.scrape, 0, 1) * 0.16 : 0, t, 0.03);
    this.musicLP.frequency.setTargetAtTime(o.muffle ? 420 : 18000, t, o.muffle ? 0.05 : 0.6);
  }
  silenceEngine() { if (this.ready) this.engineUpdate({ rpm: 0, throttle: 0, speed: 0, slip: 0, boost: 0, scrape: 0, on: false, muffle: false }); }

  /* ---------- one-shots ---------- */
  env(g, t, a, peak, dec) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  burst({ type = 'bandpass', f0 = 1000, f1 = 1000, q = 1, dur = 0.3, vol = 0.3, pan = 0, attack = 0.005, dest } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, n = this.noise(false), fl = c.createBiquadFilter(), g = c.createGain();
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    let out = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    n.connect(fl); fl.connect(g); out.connect(dest || this.sfx);
    this.env(g, t, attack, vol, dur); n.start(t, Math.random()); n.stop(t + dur + 0.1);
  }
  tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.2, attack = 0.005, when = 0, dest } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(g); g.connect(dest || this.sfx); this.env(g, t, attack, vol, dur); o.start(t); o.stop(t + dur + attack + 0.05);
  }
  nearMiss(side, razor) { this.burst({ f0: 2600, f1: 380, q: 1.2, dur: 0.38, vol: razor ? 0.5 : 0.32, pan: side * 0.8 }); if (razor) this.tone({ type: 'triangle', f0: 1320, f1: 1980, dur: 0.12, vol: 0.06 }); }
  boostOn() { this.burst({ type: 'bandpass', f0: 300, f1: 3200, q: 0.8, dur: 0.45, vol: 0.35 }); this.tone({ type: 'sine', f0: 90, f1: 40, dur: 0.35, vol: 0.5 }); }
  pad() { this.burst({ f0: 400, f1: 4000, q: 1, dur: 0.3, vol: 0.3 }); this.tone({ type: 'square', f0: 660, f1: 1320, dur: 0.12, vol: 0.05 }); }
  crash() {
    this.burst({ type: 'lowpass', f0: 2500, f1: 120, q: 0.5, dur: 1.1, vol: 0.9 });
    this.tone({ type: 'sine', f0: 110, f1: 30, dur: 0.6, vol: 0.8 });
    for (let i = 0; i < 6; i++) setTimeout(() => this.burst({ type: 'highpass', f0: 5000 + Math.random() * 3000, f1: 4000, q: 2, dur: 0.12, vol: 0.18 }), 40 + i * 50 + Math.random() * 40);
  }
  land(h) { this.tone({ type: 'sine', f0: 70, f1: 35, dur: 0.25, vol: clamp(h, 0.2, 0.7) }); this.burst({ type: 'lowpass', f0: 800, f1: 200, dur: 0.2, vol: 0.2 }); }
  shift() { this.burst({ type: 'bandpass', f0: 900, f1: 600, q: 3, dur: 0.06, vol: 0.12 }); }
  pop() { this.burst({ type: 'bandpass', f0: 300, f1: 160, q: 2, dur: 0.07, vol: 0.4 }); }
  coin(n = 0) { const notes = [988, 1319, 1568, 1976]; this.tone({ type: 'square', f0: notes[n % 4], dur: 0.09, vol: 0.05 }); this.tone({ type: 'triangle', f0: notes[n % 4] * 2, dur: 0.12, vol: 0.04, when: 0.04 }); }
  ui() { this.tone({ type: 'triangle', f0: 880, f1: 1100, dur: 0.06, vol: 0.06 }); }
  uiBack() { this.tone({ type: 'triangle', f0: 600, f1: 420, dur: 0.07, vol: 0.06 }); }
  checkpoint() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'sawtooth', f0: f, dur: 0.18, vol: 0.07, when: i * 0.07 })); this.burst({ f0: 800, f1: 5000, dur: 0.5, vol: 0.18 }); }
  countdown(go) { this.tone({ type: 'square', f0: go ? 1046 : 523, dur: go ? 0.5 : 0.22, vol: 0.12 }); }
  overdrive() { this.burst({ type: 'bandpass', f0: 200, f1: 6000, q: 1.5, dur: 1.2, vol: 0.4 }); this.tone({ type: 'sawtooth', f0: 55, f1: 220, dur: 0.9, vol: 0.3 }); this.tone({ type: 'sine', f0: 60, f1: 30, dur: 1.2, vol: 0.6, when: 0.8 }); }
  levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.22, vol: 0.06, when: i * 0.09 })); }
  bank() { this.tone({ type: 'triangle', f0: 1568, dur: 0.1, vol: 0.07 }); this.tone({ type: 'triangle', f0: 2093, dur: 0.18, vol: 0.07, when: 0.08 }); }
  chainLost() { this.tone({ type: 'sawtooth', f0: 400, f1: 120, dur: 0.5, vol: 0.1 }); }
  takedown() { this.crashSmall(); this.tone({ type: 'square', f0: 220, f1: 880, dur: 0.25, vol: 0.08, when: 0.05 }); }
  crashSmall() { this.burst({ type: 'lowpass', f0: 2000, f1: 200, q: 0.6, dur: 0.5, vol: 0.55 }); this.tone({ type: 'sine', f0: 120, f1: 40, dur: 0.3, vol: 0.5 }); }

  /* ---------- music ---------- */
  setIntensity(v) { this.intensity = v; }
  schedule() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const spb = 60 / 126 / 4; // 16th note
    while (this.nextTime < this.ctx.currentTime + 0.12) { this.playStep(this.step, this.nextTime); this.nextTime += spb; this.step++; }
  }
  playStep(step, t) {
    const I = this.intensity, s = step % 16, barN = Math.floor(step / 16);
    const progA = [[45, 0], [41, 1], [48, 1], [43, 1]], progB = [[41, 1], [43, 1], [40, 0], [45, 0]];
    const prog = Math.floor(barN / 8) % 2 ? progB : progA;
    const [root, maj] = prog[barN % 4];
    const chord = [root, root + (maj ? 4 : 3), root + 7];
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const c = this.ctx, bus = this.musicBus;
    // kick
    if (I >= 1 && s % 4 === 0) {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      o.connect(g); g.connect(bus); this.env(g, t, 0.002, 0.9, 0.32); o.start(t); o.stop(t + 0.4);
      this.padBus.gain.cancelScheduledValues(t); this.padBus.gain.setValueAtTime(0.35, t); this.padBus.gain.linearRampToValueAtTime(1, t + 0.22);
    }
    // snare / clap
    if (I >= 2.5 && (s === 4 || s === 12)) {
      const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.9;
      n.connect(f); f.connect(g); g.connect(bus); this.env(g, t, 0.002, 0.42, 0.18); n.start(t, Math.random()); n.stop(t + 0.25);
      const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); o.connect(og); og.connect(bus); this.env(og, t, 0.002, 0.25, 0.09); o.start(t); o.stop(t + 0.15);
    }
    // hats
    if (I >= 2 && (s % 4 === 2 || (I >= 3.5 && s % 2 === 1))) {
      const n = this.noise(false), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'highpass'; f.frequency.value = 8000;
      n.connect(f); f.connect(g); g.connect(bus); this.env(g, t, 0.001, s % 4 === 2 ? 0.14 : 0.06, s % 4 === 2 && I >= 4 ? 0.12 : 0.035); n.start(t, Math.random()); n.stop(t + 0.15);
    }
    // bass: driving 8ths with octave bounce
    if (I >= 1.5 && s % 2 === 0) {
      const note = root - 12 + (s % 4 === 2 ? 12 : 0);
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mf(note);
      f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(260 + I * 180, t); f.frequency.exponentialRampToValueAtTime(140, t + 0.14);
      o.connect(f); f.connect(g); g.connect(bus); this.env(g, t, 0.004, 0.32, 0.16); o.start(t); o.stop(t + 0.22);
    }
    // pad: whole-bar chord
    if (s === 0) {
      for (const m of chord) for (const det of [-7, 7]) {
        const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mf(m + 12); o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 700 + I * 260; o.connect(f); f.connect(g); g.connect(this.padBus);
        const dur = 16 * 60 / 126 / 4;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.032, t + 0.35); g.gain.setValueAtTime(0.032, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
    // arpeggio
    if (I >= 3) {
      const seq = [0, 1, 2, 1, 0, 2, 1, 2]; const m = chord[seq[s % 8]] + 24 + (s >= 8 && I >= 4 ? 12 : 0);
      const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = mf(m);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      o.connect(f); f.connect(g); g.connect(bus); g.connect(this.delay); this.env(g, t, 0.003, 0.04, 0.1); o.start(t); o.stop(t + 0.16);
    }
    // lead on overdrive/high intensity
    if (I >= 4.5 && (s === 0 || s === 6 || s === 10)) {
      const mel = [76, 74, 72, 71, 72, 74, 76, 79]; const m = mel[(barN * 3 + Math.floor(s / 5)) % 8];
      const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = mf(m); o2.frequency.value = mf(m) * 1.005;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000; o.connect(f); o2.connect(f); f.connect(g); g.connect(bus); g.connect(this.delay);
      this.env(g, t, 0.01, 0.06, 0.32); o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.4);
    }
  }
}
const AUDIO = new AudioEngine();

export { AUDIO };
