// The endless road path: curves, hills, jumps, boost pads, gates and tunnels.
import { clamp, fbm1, hash1, lerp, noise1, sstep } from './util.js';
import { BIOMES, CHUNK, GATE_SPACING, STEP } from './districts.js';

/* ============================== road path ============================== */
class Track {
  constructor(o = {}) {
    this.seed = o.seed ?? 1; this.start = o.start ?? 0; this.dlen = o.dlen ?? 3000; this.trans = 420;
    this.curvMul = o.curvMul ?? 1; this.jumpMul = o.jumpMul ?? 1; this.padMul = o.padMul ?? 1;
    this.px = [0]; this.pz = [0]; this.th = [0]; this.k = [0]; this.h = [];
    this.h.push(this.height(0));
    this.ensure(2400);
  }
  biomeAt(s) {
    const d = Math.max(0, s) / this.dlen, i = Math.floor(d), f = (d - i) * this.dlen;
    return { a: (this.start + i) % 5, b: (this.start + i + 1) % 5, t: sstep(this.dlen - this.trans, this.dlen, f), idx: i };
  }
  weights(s, out) { out.fill(0); const { a, b, t } = this.biomeAt(s); out[a] += 1 - t; out[b] += t; return out; }
  bp(s, key) { const { a, b, t } = this.biomeAt(s); return lerp(BIOMES[a][key], BIOMES[b][key], t); }
  jumpS(cell) {
    if (cell < 2) return null;
    const js = cell * 600 + 300;
    const g = js % GATE_SPACING; if (g < 420 || g > GATE_SPACING - 380) return null;
    const p = this.bp(js, 'jump') * this.jumpMul;
    return hash1(cell, this.seed + 41) < p ? js : null;
  }
  jumpOffset(s) {
    const js = this.jumpS(Math.floor(s / 600)); if (js === null) return 0;
    const u = s - js;
    if (u < -90 || u > 260) return 0;
    if (u <= 0) { const t = (u + 90) / 90; return 6.5 * t * t; }
    if (u <= 40) return lerp(6.5, -2.5, sstep(0, 40, u));
    return lerp(-2.5, 0, sstep(40, 260, u));
  }
  jumpZone(s) {
    let z = 0;
    for (const c of [Math.floor(s / 600) - 1, Math.floor(s / 600), Math.floor(s / 600) + 1]) {
      const js = this.jumpS(c); if (js === null) continue;
      z = Math.max(z, sstep(js - 420, js - 260, s) * (1 - sstep(js + 300, js + 460, s)));
    }
    return z;
  }
  curv(s) {
    if (s < 260) return 0;
    const amp = this.bp(s, 'curv') * this.curvMul * sstep(260, 600, s);
    let k = amp * (fbm1(s / 640, this.seed, 3) * 1.15 + noise1(s / 210, this.seed + 5) * 0.4);
    const gz = (s % GATE_SPACING); const gateCalm = 1 - (sstep(GATE_SPACING - 120, GATE_SPACING - 40, gz) + (1 - sstep(40, 120, gz))) * 0.85;
    return k * (1 - this.jumpZone(s)) * clamp(gateCalm, 0.15, 1);
  }
  height(s) {
    const d = Math.max(0, s) / this.dlen, i = Math.floor(d), f = (d - i) * this.dlen;
    const a = (this.start + i) % 5, b = (this.start + i + 1) % 5;
    const te = sstep(this.dlen - 900, this.dlen + 0, f);
    const base = lerp(BIOMES[a].elev, BIOMES[b].elev, te);
    const hills = this.bp(s, 'hills') * fbm1(s / 820, this.seed + 11, 2) * sstep(0, 400, s);
    return base + hills + this.jumpOffset(s);
  }
  ensure(sMax) {
    let n = this.px.length;
    while ((n - 1) * STEP < sMax) {
      const s = (n - 1) * STEP;
      const k = this.curv(s + STEP * 0.5);
      const th = this.th[n - 1] + k * STEP, thm = (this.th[n - 1] + th) * 0.5;
      this.px.push(this.px[n - 1] + Math.cos(thm) * STEP);
      this.pz.push(this.pz[n - 1] + Math.sin(thm) * STEP);
      this.th.push(th); this.k.push(this.curv(s + STEP)); this.h.push(this.height(s + STEP));
      n++;
    }
  }
  frame(s, o) {
    s = Math.max(0, s);
    const f = s / STEP; let i = Math.floor(f);
    if (i >= this.px.length - 2) { this.ensure(s + 600); }
    const t = f - i;
    o.x = lerp(this.px[i], this.px[i + 1], t); o.z = lerp(this.pz[i], this.pz[i + 1], t);
    o.th = lerp(this.th[i], this.th[i + 1], t); o.k = lerp(this.k[i], this.k[i + 1], t);
    o.y = lerp(this.h[i], this.h[i + 1], t);
    o.slope = (this.h[i + 1] - this.h[i]) / STEP;
    o.bank = clamp(o.k * 26, -0.11, 0.11);
    o.tx = Math.cos(o.th); o.tz = Math.sin(o.th); o.rx = -o.tz; o.rz = o.tx;
    return o;
  }
  gateAt(n) { return n * GATE_SPACING; }
  pads(s0, s1) {
    const out = [];
    for (let c = Math.floor(s0 / 380); c <= Math.floor(s1 / 380); c++) {
      if (c < 2) continue;
      if (hash1(c, this.seed + 61) > 0.72 * this.padMul) continue;
      const s = c * 380 + 60 + hash1(c, this.seed + 62) * 240;
      if (s < s0 || s >= s1) continue;
      const g = s % GATE_SPACING; if (g < 80 || g > GATE_SPACING - 80) continue;
      out.push({ s, lane: Math.floor(hash1(c, this.seed + 63) * 4) });
    }
    // a pad on the run-up to every jump, centre lanes
    for (let c = Math.floor(s0 / 600); c <= Math.floor(s1 / 600); c++) {
      const js = this.jumpS(c); if (js === null) continue;
      const s = js - 150; if (s >= s0 && s < s1) out.push({ s, lane: 1 + Math.floor(hash1(c, this.seed + 64) * 2) });
    }
    return out;
  }
  isTunnel(k) {
    const s0 = k * CHUNK, s1 = s0 + CHUNK;
    const A = this.biomeAt(s0), B = this.biomeAt(s1);
    if (BIOMES[A.a].id !== 'neon' || A.t > 0 || B.t > 0 || A.idx !== B.idx) return false;
    if (s0 < 500) return false;
    const g0 = Math.floor((s0 - 60) / GATE_SPACING), g1 = Math.floor((s1 + 60) / GATE_SPACING); if (g0 !== g1) return false;
    for (let s = s0 - 200; s <= s1 + 200; s += 50) if (this.jumpOffset(s) !== 0) return false;
    const r = hash1(Math.floor(k / 2), this.seed + 77);
    return r < 0.22;
  }
}

export { Track };
