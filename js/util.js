// Small math, noise and formatting helpers shared by every module.
import * as THREE from 'three';

/* ============================== utilities ============================== */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const TAU = Math.PI * 2;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const V3 = () => new THREE.Vector3();

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash1(n, seed = 0) {
  let x = Math.imul((n | 0) ^ Math.imul(seed | 0, 0x9E3779B1), 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  x = Math.imul(x ^ (seed | 0), 0x27d4eb2d); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i, seed), hash1(i + 1, seed), u) * 2 - 1;
}
function fbm1(x, seed = 0, oct = 3) {
  let a = 0.5, s = 0, n = 0;
  for (let o = 0; o < oct; o++) { s += noise1(x, seed + o * 17) * a; n += a; x *= 2.03; a *= 0.5; }
  return s / n;
}
function h2(ix, iy, seed) { return hash1((ix * 73856093) ^ (iy * 19349663), seed); }
function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(h2(ix, iy, seed), h2(ix + 1, iy, seed), ux), lerp(h2(ix, iy + 1, seed), h2(ix + 1, iy + 1, seed), ux), uy) * 2 - 1;
}
function fbm2(x, y, seed = 0, oct = 3) {
  let a = 0.5, s = 0, n = 0;
  for (let o = 0; o < oct; o++) { s += noise2(x, y, seed + o * 31) * a; n += a; x *= 2.07; y *= 2.07; a *= 0.5; }
  return s / n;
}
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export { $, TAU, V3, clamp, damp, fbm1, fbm2, fmt, hash1, lerp, lerp3, mulberry32, noise1, noise2, sstep };
