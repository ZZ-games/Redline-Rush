// Traffic car geometry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ============================== traffic ============================== */
const TRAFFIC_TYPES = [
  { id: 'sedan', L: 4.6, W: 1.84, h1: 0.72, h2: 0.56, cab: 0.48, cabX: -0.15, ride: 0.18, wr: 0.33, w: 6 },
  { id: 'hatch', L: 4.1, W: 1.78, h1: 0.74, h2: 0.6, cab: 0.56, cabX: -0.3, ride: 0.17, wr: 0.31, w: 4 },
  { id: 'suv', L: 4.85, W: 1.96, h1: 0.92, h2: 0.66, cab: 0.62, cabX: -0.32, ride: 0.26, wr: 0.38, w: 4 },
  { id: 'van', L: 5.3, W: 2.02, h1: 1.1, h2: 0.86, cab: 0.82, cabX: -0.4, ride: 0.24, wr: 0.36, w: 2 },
  { id: 'truck', L: 8.6, W: 2.45, h1: 1.2, h2: 1.5, cab: 0.72, cabX: -0.6, ride: 0.32, wr: 0.48, w: 2, truck: 1 },
];
function buildTrafficGeos(T) {
  const paint = [], dark = [], lights = [];
  const hl = T.L / 2;
  const lc = (g, c) => { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  if (T.truck) {
    // cab at the front, cargo box behind
    paint.push(new RoundedBoxGeometry(2.3, 2.3, T.W, 2, 0.12).translate(hl - 1.15, T.ride + 1.2, 0));
    dark.push(new RoundedBoxGeometry(0.1, 0.9, T.W * 0.86, 2, 0.04).translate(hl - 0.02, T.ride + 1.75, 0));
    paint.push(new RoundedBoxGeometry(6.0, 3.1, T.W, 2, 0.08).translate(-hl + 3.0, T.ride + 1.95, 0));
    dark.push(new THREE.BoxGeometry(T.L * 0.95, 0.35, T.W * 0.9).translate(0, T.ride + 0.2, 0));
  } else {
    paint.push(new RoundedBoxGeometry(T.L, T.h1, T.W, 3, 0.16).translate(0, T.ride + T.h1 / 2, 0));
    dark.push(new RoundedBoxGeometry(T.L * T.cab, T.h2, T.W * 0.86, 3, 0.14).translate(T.cabX, T.ride + T.h1 + T.h2 / 2 - 0.06, 0));
    paint.push(new RoundedBoxGeometry(T.L * T.cab * 0.84, 0.06, T.W * 0.8, 2, 0.03).translate(T.cabX, T.ride + T.h1 + T.h2 - 0.04, 0));
    dark.push(new THREE.BoxGeometry(T.L * 1.01, 0.16, T.W * 0.96).translate(0, T.ride + 0.1, 0));
  }
  for (const x of [hl - T.wr * 2.2, -hl + T.wr * 2.4]) for (const z of [-1, 1]) dark.push(new THREE.CylinderGeometry(T.wr, T.wr, 0.26, 16).rotateX(Math.PI / 2).translate(x, T.wr, z * (T.W / 2 - 0.12)));
  // lights: white front, red rear
  for (const z of [-1, 1]) {
    lights.push(lc(new THREE.BoxGeometry(0.06, 0.1, 0.34).translate(hl + 0.01, T.ride + (T.truck ? 0.6 : T.h1 * 0.62), z * (T.W / 2 - 0.3)), [4.0, 3.8, 3.2]));
    lights.push(lc(new THREE.BoxGeometry(0.06, T.truck ? 0.3 : 0.12, 0.3).translate(-hl - 0.01, T.ride + (T.truck ? 0.7 : T.h1 * 0.7), z * (T.W / 2 - 0.22)), [3.2, 0.06, 0.08]));
  }
  const fix = (arr) => { const g = mergeGeometries(arr.map((x) => { const y = x.index ? x.toNonIndexed() : x; if (y.attributes.uv) y.deleteAttribute('uv'); return y; })); g.rotateY(Math.PI / 2); g.computeBoundingSphere(); return g; };
  return { paint: fix(paint), dark: fix(dark), lights: fix(lights) };
}
const TRAFFIC_COLORS = [0xe8e8ea, 0x15171c, 0x8a9099, 0x3a4c6b, 0x7a1418, 0x24452f, 0xc9b28a, 0x5a5f66, 0xf2f2f2, 0x1d2a4a, 0x9c1f2b, 0xd0d4da];

export { TRAFFIC_COLORS, TRAFFIC_TYPES, buildTrafficGeos };
