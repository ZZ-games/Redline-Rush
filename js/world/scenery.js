// Scenery geometry prototypes (palms, pines, cacti, rocks, poles) and building/sign materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, V3, clamp, lerp3, noise2, sstep } from '../util.js';
import { srgb } from '../districts.js';

/* ============================== scenery prototypes ============================== */
function colorGeo(geo, fn) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const col = fn(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = srgb(col[0]); c[i * 3 + 1] = srgb(col[1]); c[i * 3 + 2] = srgb(col[2]); }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  return geo;
}
function frondGeometry(len, width, droop, segs = 7) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, x = t * len, y = -droop * t * t + 0.6 * t, w = width * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) * (1 - t * 0.4);
    pos.push(x, y, -w / 2, x, y + 0.08, 0, x, y, w / 2);
    if (i > 0) { const b = (i - 1) * 3, c = i * 3; idx.push(b, c, b + 1, c, c + 1, b + 1, b + 1, c + 1, b + 2, c + 1, c + 2, b + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function buildPrototypes() {
  const P = {};
  // palm
  {
    const curve = new THREE.CatmullRomCurve3([V3().set(0, 0, 0), V3().set(0.3, 3, 0), V3().set(1.0, 6.2, 0), V3().set(2.0, 8.8, 0)]);
    const trunk = colorGeo(new THREE.TubeGeometry(curve, 10, 0.24, 7, false), (x, y) => { const r = 0.5 + 0.5 * Math.sin(y * 9); return [0.32 + r * 0.08, 0.22 + r * 0.05, 0.14]; });
    const parts = [trunk];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + (i % 2) * 0.2;
      const f = frondGeometry(4.4 + (i % 3) * 0.5, 1.0, 2.6 + (i % 2), 7);
      f.rotateY(a); f.translate(2.0, 8.8, 0);
      parts.push(colorGeo(f, (x, y) => [0.12 + (y - 6) * 0.01, 0.3 + (y - 6) * 0.03, 0.07]));
    }
    P.palm = mergeGeometries(parts.map((g) => { g.deleteAttribute('normal'); return g; }));
    P.palm.computeVertexNormals();
  }
  // pine (snowy)
  {
    const parts = [colorGeo(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6).translate(0, 1.1, 0), () => [0.25, 0.17, 0.1])];
    const tiers = [[2.6, 3.6, 1.6], [2.1, 3.2, 3.6], [1.6, 2.8, 5.4], [1.05, 2.4, 7.0], [0.55, 1.8, 8.4]];
    for (const [r, h, y] of tiers) {
      const cg = new THREE.ConeGeometry(r, h, 8, 2).translate(0, y + h / 2 - 0.4, 0);
      parts.push(colorGeo(cg, (x, yy, z) => { const t = (yy - (y - 0.4)) / h; const sn = sstep(0.35, 0.8, t) * 0.75 + (Math.abs(x) + Math.abs(z) > r * 0.8 ? 0.2 : 0); return lerp3([0.06, 0.16, 0.09], [0.9, 0.93, 0.98], clamp(sn, 0, 1)); }));
    }
    P.pine = mergeGeometries(parts); P.pine.computeVertexNormals();
  }
  // cactus
  {
    const g = [new THREE.CylinderGeometry(0.34, 0.4, 5.2, 9).translate(0, 2.6, 0),
      new THREE.CylinderGeometry(0.22, 0.22, 1.3, 8).rotateZ(Math.PI / 2).translate(0.75, 2.1, 0), new THREE.CylinderGeometry(0.22, 0.24, 2.0, 8).translate(1.35, 3.0, 0),
      new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8).rotateZ(Math.PI / 2).translate(-0.6, 2.9, 0), new THREE.CylinderGeometry(0.2, 0.22, 1.6, 8).translate(-1.05, 3.6, 0),
      new THREE.SphereGeometry(0.34, 9, 6).translate(0, 5.2, 0), new THREE.SphereGeometry(0.22, 8, 5).translate(1.35, 4.0, 0), new THREE.SphereGeometry(0.2, 8, 5).translate(-1.05, 4.4, 0)];
    P.cactus = mergeGeometries(g.map((x) => colorGeo(x, (xx, yy) => [0.17 + Math.sin(xx * 30) * 0.02, 0.36 + yy * 0.01, 0.15])));
    P.cactus.computeVertexNormals();
  }
  // rock
  {
    const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 0.75 + 0.35 * noise2(x * 1.7 + z, y * 1.7, 3) + 0.12 * noise2(x * 5, z * 5 + y, 8); p.setXYZ(i, x * n, y * n * 0.75, z * n); }
    P.rock = g.toNonIndexed(); P.rock.computeVertexNormals();
  }
  // mesa / pillar
  {
    const g = new THREE.CylinderGeometry(1, 1.25, 1, 14, 10, false).translate(0, 0.5, 0); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x); const n = 0.82 + 0.25 * noise2(a * 2.2, y * 3, 6) + 0.08 * noise2(a * 9, y * 12, 2); if (y < 0.99) p.setXYZ(i, x * n, y, z * n); }
    P.mesa = colorGeo(g, (x, y) => { const b = 0.5 + 0.5 * Math.sin(y * 26 + Math.sin(y * 7) * 2); return lerp3([0.48, 0.17, 0.07], [0.74, 0.38, 0.18], b * 0.8 + (y > 0.98 ? 0.2 : 0)); });
    P.mesa.computeVertexNormals();
  }
  // arch
  {
    const g = new THREE.TorusGeometry(17.5, 3.6, 10, 34, Math.PI); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.18 * noise2(x * 0.25, y * 0.25 + z, 4); p.setXYZ(i, x * (0.96 + 0.04 * n), y * (0.96 + 0.04 * n), z * n); }
    P.arch = colorGeo(g, (x, y) => { const b = 0.5 + 0.5 * Math.sin(y * 1.4); return lerp3([0.5, 0.18, 0.07], [0.72, 0.36, 0.17], b); });
    P.arch.computeVertexNormals();
  }
  // street-light pole: local +X points toward the road
  {
    const g = [new THREE.CylinderGeometry(0.12, 0.17, 8.6, 8).translate(0, 4.3, 0), new THREE.BoxGeometry(2.9, 0.12, 0.14).translate(1.4, 8.5, 0), new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(0, 0.25, 0)];
    P.pole = mergeGeometries(g.map((x) => { x.deleteAttribute('uv'); return x; }));
    P.lampHead = new THREE.BoxGeometry(1.0, 0.14, 0.42).translate(2.6, 8.38, 0);
    P.pool = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  // power pole (desert / canyon)
  {
    const g = [new THREE.CylinderGeometry(0.16, 0.2, 11, 6).translate(0, 5.5, 0), new THREE.BoxGeometry(0.2, 0.2, 3.4).translate(0, 10.2, 0)];
    P.powerPole = mergeGeometries(g.map((x) => { x.deleteAttribute('uv'); return x; }));
  }
  P.post = new THREE.BoxGeometry(0.12, 0.85, 0.14).translate(0, 0.42, 0);
  P.building = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  P.sign = new THREE.PlaneGeometry(1, 1);
  P.tunnelLight = new THREE.BoxGeometry(2.2, 0.08, 0.4);
  P.reflector = new THREE.BoxGeometry(0.1, 1.0, 0.1).translate(0, 0.5, 0);
  return P;
}

function makeBuildingMaterial(winUniform) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.45 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWin = winUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBP;\nvarying vec3 vBN;\nvarying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vBP = (instanceMatrix * vec4(position, 1.0)).xyz; vBN = normalize(mat3(instanceMatrix) * normal); vSeed = instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.711;
#else
  vBP = position; vBN = normal; vSeed = 0.0;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBP;\nvarying vec3 vBN;\nvarying float vSeed;\nuniform float uWin;\nfloat bh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 an = abs(vBN);
  if (an.y < 0.5) {
    vec2 w = an.x > an.z ? vec2(vBP.z, vBP.y) : vec2(vBP.x, vBP.y);
    vec2 cs = vec2(2.4, 3.3);
    vec2 cell = floor(w / cs); vec2 f = fract(w / cs);
    float win = step(0.14, f.x) * step(f.x, 0.86) * step(0.2, f.y) * step(f.y, 0.8);
    float r = bh(cell + vec2(vSeed, vSeed * 1.7));
    float lit = step(0.55, r) * step(2.5, vBP.y);
    vec3 wc = mix(vec3(1.0, 0.6, 0.3), vec3(0.45, 0.75, 1.0), step(0.78, bh(cell * 1.31 + vSeed)));
    wc = mix(wc, vec3(1.0, 0.25, 0.75), step(0.94, bh(cell * 0.7 + vSeed * 3.1)));
    totalEmissiveRadiance += win * lit * wc * (0.25 + 0.9 * bh(cell + 7.0)) * uWin;
    diffuseColor.rgb *= mix(1.0, 0.3, win);
  }
}`);
  };
  return m;
}
function makeSignMaterial(atlas) {
  const m = new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(2.4, 2.4, 2.4), side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSign;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (uv + vec2(mod(aSign, 2.0), 3.0 - floor(aSign / 2.0))) * vec2(0.5, 0.25);\n#endif');
  };
  return m;
}

export { buildPrototypes, makeBuildingMaterial, makeSignMaterial };
