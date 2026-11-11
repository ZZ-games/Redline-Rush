// The five districts (biomes): sky, light, fog, road and scenery parameters, plus blending.
import { lerp, lerp3 } from './util.js';

/* ============================== districts ============================== */
const STEP = 2;            // metres between centre-line samples
const CHUNK = 160;         // metres per streamed chunk
const SEA = -2.0;
const GATE_SPACING = 1500;
const srgb = (v) => Math.pow(v, 2.2);
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

const BIOMES = [
  { id: 'neon', name: 'NEON CITY', tag: 'DISTRICT 01', accent: '#ff2d8a',
    top: [0.006, 0.004, 0.02], hor: [0.16, 0.05, 0.26], bottom: [0.02, 0.01, 0.04], sunDir: nrm([-0.35, 0.42, -0.6]), sunCol: [0.4, 0.45, 1.0], sunSize: 0.0012,
    stars: 1, clouds: 0.35, cloudCol: [0.09, 0.03, 0.15], fog: [0.07, 0.025, 0.12], fogD: 0.0016,
    lightCol: [0.55, 0.6, 1.0], lightInt: 0.45, hemiSky: [0.35, 0.28, 0.85], hemiGnd: [0.1, 0.03, 0.12], hemiInt: 0.6,
    env: 0.9, exposure: 1.0, bloom: 0.55, night: 1, sat: 1.18, tint: [1.0, 0.95, 1.08], heat: 0, snow: 0,
    curv: 0.0040, hills: 3, elev: 0, roadRough: 0.62, roadEnv: 1.3, jump: 0.12, traffic: 1.25,
    mtnScale: 0.25, mtnLow: [0.02, 0.015, 0.04], mtnHigh: [0.05, 0.03, 0.09], mtnHaze: 0.55, mtnSnow: 0, city: 1 },
  { id: 'coast', name: 'SUNSET COAST', tag: 'DISTRICT 02', accent: '#ff8a2d',
    top: [0.07, 0.07, 0.24], hor: [1.15, 0.42, 0.16], bottom: [0.25, 0.1, 0.07], sunDir: nrm([0.62, 0.075, 0.78]), sunCol: [3.4, 1.35, 0.45], sunSize: 0.0035,
    stars: 0.08, clouds: 0.55, cloudCol: [0.9, 0.38, 0.32], fog: [0.7, 0.36, 0.24], fogD: 0.0010,
    lightCol: [1.0, 0.58, 0.32], lightInt: 3.1, hemiSky: [0.55, 0.42, 0.62], hemiGnd: [0.35, 0.18, 0.1], hemiInt: 0.85,
    env: 1.0, exposure: 0.95, bloom: 0.42, night: 0.35, sat: 1.12, tint: [1.05, 0.98, 0.94], heat: 0, snow: 0,
    curv: 0.0034, hills: 3.5, elev: 4.5, roadRough: 0.9, roadEnv: 1.0, jump: 0.28, traffic: 1.0,
    mtnScale: 0.55, mtnLow: [0.12, 0.05, 0.08], mtnHigh: [0.3, 0.12, 0.12], mtnHaze: 0.72, mtnSnow: 0, city: 0 },
  { id: 'canyon', name: 'RED CANYON', tag: 'DISTRICT 03', accent: '#ff5a2d',
    top: [0.06, 0.2, 0.62], hor: [0.62, 0.66, 0.78], bottom: [0.4, 0.25, 0.18], sunDir: nrm([0.45, 0.72, 0.3]), sunCol: [3.2, 2.7, 2.1], sunSize: 0.0028,
    stars: 0, clouds: 0.25, cloudCol: [1.0, 0.98, 0.96], fog: [0.62, 0.6, 0.64], fogD: 0.00075,
    lightCol: [1.0, 0.9, 0.78], lightInt: 3.6, hemiSky: [0.55, 0.65, 0.95], hemiGnd: [0.55, 0.25, 0.12], hemiInt: 0.95,
    env: 1.0, exposure: 0.88, bloom: 0.28, night: 0, sat: 1.1, tint: [1.04, 0.99, 0.95], heat: 0.25, snow: 0,
    curv: 0.0058, hills: 9, elev: 12, roadRough: 0.95, roadEnv: 0.9, jump: 0.45, traffic: 0.85,
    mtnScale: 0.75, mtnLow: [0.28, 0.1, 0.05], mtnHigh: [0.5, 0.22, 0.12], mtnHaze: 0.6, mtnSnow: 0, city: 0 },
  { id: 'snow', name: 'FROST PEAK', tag: 'DISTRICT 04', accent: '#7fd8ff',
    top: [0.16, 0.26, 0.45], hor: [0.68, 0.76, 0.88], bottom: [0.5, 0.55, 0.62], sunDir: nrm([-0.55, 0.22, 0.5]), sunCol: [2.2, 2.0, 2.2], sunSize: 0.002,
    stars: 0, clouds: 0.85, cloudCol: [0.78, 0.82, 0.9], fog: [0.66, 0.72, 0.82], fogD: 0.0014,
    lightCol: [0.85, 0.9, 1.0], lightInt: 1.9, hemiSky: [0.7, 0.8, 1.0], hemiGnd: [0.6, 0.66, 0.78], hemiInt: 1.05,
    env: 1.1, exposure: 0.9, bloom: 0.32, night: 0.2, sat: 0.92, tint: [0.95, 1.0, 1.08], heat: 0, snow: 1,
    curv: 0.0052, hills: 11, elev: 32, roadRough: 0.8, roadEnv: 1.0, jump: 0.3, traffic: 0.9,
    mtnScale: 1.45, mtnLow: [0.25, 0.3, 0.38], mtnHigh: [0.6, 0.66, 0.75], mtnHaze: 0.62, mtnSnow: 1, city: 0 },
  { id: 'desert', name: 'SALT DESERT', tag: 'DISTRICT 05', accent: '#ffc23d',
    top: [0.07, 0.24, 0.66], hor: [0.95, 0.78, 0.6], bottom: [0.6, 0.45, 0.32], sunDir: nrm([-0.2, 0.85, -0.35]), sunCol: [4.0, 3.4, 2.6], sunSize: 0.0026,
    stars: 0, clouds: 0.12, cloudCol: [1, 1, 1], fog: [0.86, 0.76, 0.64], fogD: 0.0007,
    lightCol: [1.0, 0.9, 0.74], lightInt: 4.0, hemiSky: [0.6, 0.62, 0.75], hemiGnd: [0.8, 0.6, 0.42], hemiInt: 0.85,
    env: 1.0, exposure: 0.8, bloom: 0.26, night: 0, sat: 1.06, tint: [1.07, 1.0, 0.9], heat: 1, snow: 0,
    curv: 0.003, hills: 4, elev: 2, roadRough: 0.95, roadEnv: 0.8, jump: 0.55, traffic: 0.95,
    mtnScale: 0.7, mtnLow: [0.45, 0.28, 0.2], mtnHigh: [0.62, 0.42, 0.3], mtnHaze: 0.75, mtnSnow: 0, city: 0 },
];
const BLEND_KEYS = ['top', 'hor', 'bottom', 'sunDir', 'sunCol', 'sunSize', 'stars', 'clouds', 'cloudCol', 'fog', 'fogD', 'lightCol', 'lightInt', 'hemiSky', 'hemiGnd', 'hemiInt',
  'env', 'exposure', 'bloom', 'night', 'sat', 'tint', 'heat', 'snow', 'roadRough', 'roadEnv', 'traffic', 'mtnScale', 'mtnLow', 'mtnHigh', 'mtnHaze', 'mtnSnow', 'city'];
function blendBiomes(a, b, t, out) {
  const A = BIOMES[a], B = BIOMES[b];
  for (const k of BLEND_KEYS) out[k] = Array.isArray(A[k]) ? lerp3(A[k], B[k], t) : lerp(A[k], B[k], t);
  return out;
}

export { BIOMES, CHUNK, GATE_SPACING, SEA, STEP, blendBiomes, srgb };
