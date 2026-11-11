// Player car models, paint, glow and wing.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TAU, lerp, sstep } from './util.js';
import { GLOWS, PAINTS, carById } from './content.js';
import { glowTexture, plateTexture } from './textures.js';

/* ============================== player car models ============================== */
// Build frame: +X forward, +Y up, +Z right. The model root puts this frame inside a holder rotated so +X becomes -Z.
const STYLES = {
  super: { L: 4.55, W: 2.0, ride: 0.2, axle: 0.37, wr: 0.36, fx: 1.42, rx: -1.36, nose: 0.5, hood: 0.8, cowl: 0.6, belt: 0.88, deck: 0.94, tail: 0.9, roof: 1.19, roofF: -0.08, roofR: -0.82, cabRear: -1.46, cabW: 1.5, wing: 0.6, exh: 2, intake: 1, fin: 0, scoop: 0, rim: 0x2b2d33, cal: 0xe01b2e },
  tuner: { L: 4.2, W: 1.88, ride: 0.2, axle: 0.35, wr: 0.34, fx: 1.34, rx: -1.3, nose: 0.6, hood: 0.88, cowl: 0.62, belt: 0.98, deck: 1.0, tail: 1.06, roof: 1.38, roofF: -0.02, roofR: -1.38, cabRear: -1.86, cabW: 1.52, wing: 0.9, exh: 1, intake: 0, fin: 0, scoop: 0, rim: 0xc8c8cc, cal: 0xffc400 },
  muscle: { L: 4.85, W: 2.04, ride: 0.24, axle: 0.4, wr: 0.38, fx: 1.6, rx: -1.42, nose: 0.74, hood: 0.98, cowl: 0.32, belt: 1.0, deck: 1.02, tail: 1.0, roof: 1.33, roofF: -0.38, roofR: -1.12, cabRear: -1.62, cabW: 1.55, wing: 0.25, exh: 4, intake: 0, fin: 0, scoop: 1, rim: 0x18181b, cal: 0xd11a1a },
  drift: { L: 4.42, W: 1.94, ride: 0.18, axle: 0.35, wr: 0.35, fx: 1.4, rx: -1.32, nose: 0.55, hood: 0.84, cowl: 0.52, belt: 0.95, deck: 0.98, tail: 1.0, roof: 1.3, roofF: -0.12, roofR: -1.0, cabRear: -1.52, cabW: 1.5, wing: 1.5, exh: 1, intake: 1, fin: 0, scoop: 0, rim: 0xeeeeee, cal: 0x1fd1ff },
  ev: { L: 4.72, W: 2.0, ride: 0.21, axle: 0.37, wr: 0.37, fx: 1.48, rx: -1.42, nose: 0.6, hood: 0.84, cowl: 0.75, belt: 0.92, deck: 0.98, tail: 0.98, roof: 1.27, roofF: 0.05, roofR: -1.25, cabRear: -1.95, cabW: 1.56, wing: 0, exh: 0, intake: 0, fin: 0, scoop: 0, rim: 0xa9b0bb, cal: 0x2a7bff, ev: 1 },
  super2: { L: 4.62, W: 2.02, ride: 0.18, axle: 0.36, wr: 0.36, fx: 1.45, rx: -1.38, nose: 0.46, hood: 0.78, cowl: 0.68, belt: 0.86, deck: 0.92, tail: 0.9, roof: 1.15, roofF: -0.02, roofR: -0.85, cabRear: -1.5, cabW: 1.46, wing: 1.2, exh: 2, intake: 1, fin: 0, scoop: 0, rim: 0x111114, cal: 0xff8a00 },
  hyper: { L: 4.78, W: 2.06, ride: 0.17, axle: 0.36, wr: 0.37, fx: 1.5, rx: -1.42, nose: 0.42, hood: 0.74, cowl: 0.7, belt: 0.84, deck: 0.9, tail: 0.9, roof: 1.12, roofF: 0.02, roofR: -0.8, cabRear: -1.55, cabW: 1.42, wing: 1.6, exh: 2, intake: 1, fin: 1, scoop: 0, rim: 0x23252a, cal: 0x34ff9a },
  proto: { L: 4.95, W: 2.06, ride: 0.15, axle: 0.36, wr: 0.36, fx: 1.58, rx: -1.45, nose: 0.38, hood: 0.66, cowl: 0.85, belt: 0.78, deck: 0.92, tail: 0.95, roof: 1.08, roofF: 0.1, roofR: -0.62, cabRear: -1.25, cabW: 1.18, wing: 2.0, exh: 2, intake: 1, fin: 1, scoop: 0, rim: 0x101010, cal: 0xff2d55 },
};

const SHARED = {};
function sharedCarMaterials() {
  if (SHARED.ready) return SHARED;
  SHARED.glass = new THREE.MeshPhysicalMaterial({ color: 0x07090d, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  SHARED.trim = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, metalness: 0.4, roughness: 0.55 });
  SHARED.carbon = new THREE.MeshPhysicalMaterial({ color: 0x141416, metalness: 0.5, roughness: 0.32, clearcoat: 0.6 });
  SHARED.chrome = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.1 });
  SHARED.tire = new THREE.MeshStandardMaterial({ color: 0x121214, metalness: 0, roughness: 0.82 });
  SHARED.disc = new THREE.MeshStandardMaterial({ color: 0x6d6e72, metalness: 0.9, roughness: 0.35 });
  SHARED.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.7, 3.1) });
  SHARED.drl = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.2, 3.2) });
  SHARED.glowTex = glowTexture(128, 1.6);
  SHARED.shadowTex = glowTexture(128, 1.2);
  SHARED.flame = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPow: { value: 0 }, uHot: { value: new THREE.Color(0.4, 0.7, 1.0) }, uCool: { value: new THREE.Color(1.0, 0.35, 0.05) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uPow; uniform vec3 uHot, uCool; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x), mix(hh(i+vec2(0,1)),hh(i+1.),f.x), f.y); }
      void main(){ float t = vUv.y; float flick = n(vec2(vUv.x * 6.0, t * 7.0 - uTime * 28.0));
        float core = pow(1.0 - t, 1.6) * (0.55 + 0.45 * flick);
        vec3 col = mix(uCool, uHot, pow(1.0 - t, 3.0)) * core * 3.5 * uPow;
        gl_FragColor = vec4(col, core * uPow); }`,
  });
  SHARED.ready = true;
  return SHARED;
}

function makePaintMaterial(pi) {
  const P = PAINTS[pi] || PAINTS[0];
  const m = new THREE.MeshPhysicalMaterial({ color: P.c, metalness: P.m, roughness: P.r, clearcoat: P.cc === undefined ? 1 : P.cc, clearcoatRoughness: 0.06, envMapIntensity: 1.25 });
  if (P.irid) { m.iridescence = 1; m.iridescenceIOR = 1.6; m.iridescenceThicknessRange = [200, 900]; }
  if (P.em) { m.emissive = new THREE.Color(P.em); m.emissiveIntensity = 0.5; }
  return m;
}

function smoothify(g) {
  g.deleteAttribute('uv');
  return g;
}
function crease(g, a = 0.42) { g.deleteAttribute('normal'); const out = toCreasedNormals(g, a); return out; }

function bodyGeometry(st) {
  const hl = st.L / 2, by = st.ride, r = st.wr + 0.07, bev = 0.09;
  const s = new THREE.Shape();
  s.moveTo(-hl + 0.12, by + 0.08);
  s.lineTo(st.rx - r - 0.06, by);
  s.absarc(st.rx, st.axle + 0.02, r, Math.PI, 0, true);
  s.lineTo(st.rx + r + 0.06, by);
  s.lineTo(st.fx - r - 0.06, by);
  s.absarc(st.fx, st.axle + 0.02, r, Math.PI, 0, true);
  s.lineTo(st.fx + r + 0.06, by);
  s.lineTo(hl - 0.2, by + 0.02);
  s.lineTo(hl - 0.02, by + 0.14);
  s.splineThru([
    new THREE.Vector2(hl + 0.03, st.nose - 0.12), new THREE.Vector2(hl - 0.08, st.nose),
    new THREE.Vector2(hl - 0.6, lerp(st.nose, st.hood, 0.55)), new THREE.Vector2(st.cowl, st.hood),
    new THREE.Vector2(lerp(st.cowl, st.cabRear, 0.5), lerp(st.hood, st.belt, 0.6)), new THREE.Vector2(st.cabRear, st.belt),
    new THREE.Vector2(-hl + 0.42, st.deck), new THREE.Vector2(-hl + 0.04, st.tail),
  ]);
  s.lineTo(-hl - 0.02, st.tail - 0.24);
  s.lineTo(-hl + 0.02, by + 0.3);
  s.lineTo(-hl + 0.12, by + 0.08);
  const depth = st.W - bev * 2;
  let g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: 0.06, bevelSegments: 3, curveSegments: 18, steps: 2 });
  g.translate(0, 0, -depth / 2);
  g = smoothify(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i); let z = p.getZ(i);
    let f = 1;
    f *= 1 - 0.16 * sstep(st.belt - 0.28, st.belt + 0.1, y);
    f *= 1 - 0.2 * sstep(hl * 0.42, hl + 0.06, x) * (0.55 + 0.45 * sstep(by, st.nose, y));
    f *= 1 - 0.07 * sstep(-hl * 0.5, -hl - 0.02, x);
    const fl = Math.max(Math.exp(-(((x - st.fx) / 0.6) ** 2)), Math.exp(-(((x - st.rx) / 0.65) ** 2))) * (1 - sstep(by + 0.2, st.belt, y));
    f *= 1 + 0.04 * fl;
    const scallop = Math.exp(-(((y - (by + 0.36)) / 0.12) ** 2)) * sstep(st.rx + 0.5, st.rx + 0.9, x) * (1 - sstep(st.fx - 0.95, st.fx - 0.55, x));
    f *= 1 - 0.05 * scallop * (st.intake ? 1.6 : 0.6);
    p.setZ(i, z * f);
  }
  return crease(g, 0.42);
}
function cabinGeometry(st) {
  const s = new THREE.Shape(), b = 0.05;
  s.moveTo(st.cowl + 0.06, st.hood - 0.06);
  s.quadraticCurveTo(lerp(st.cowl, st.roofF, 0.55), lerp(st.hood, st.roof, 0.72), st.roofF, st.roof - 0.015);
  s.quadraticCurveTo(lerp(st.roofF, st.roofR, 0.5), st.roof + 0.03, st.roofR, st.roof - 0.02);
  s.quadraticCurveTo(lerp(st.roofR, st.cabRear, 0.5), lerp(st.roof, st.belt, 0.35), st.cabRear, st.belt - 0.03);
  s.lineTo(st.cabRear + 0.12, st.belt - 0.16);
  s.lineTo(st.cowl - 0.05, st.hood - 0.18);
  s.lineTo(st.cowl + 0.06, st.hood - 0.06);
  const depth = st.cabW - b * 2;
  let g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: b, bevelSize: 0.04, bevelSegments: 3, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  g = smoothify(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) * (1 - 0.22 * sstep(st.belt - 0.05, st.roof, y))); }
  return crease(g, 0.5);
}
function wheelParts(st, rear) {
  const r = st.wr, w = rear ? 0.36 : 0.31;
  const prof = [[r * 0.7, -w / 2], [r * 0.93, -w / 2], [r * 0.99, -w / 2 + 0.035], [r, -w * 0.28], [r, w * 0.28], [r * 0.99, w / 2 - 0.035], [r * 0.93, w / 2], [r * 0.7, w / 2]].map(([a, b]) => new THREE.Vector2(a, b));
  const tire = new THREE.LatheGeometry(prof, 32).rotateX(Math.PI / 2);
  const barrel = new THREE.CylinderGeometry(r * 0.71, r * 0.71, w * 0.92, 28, 1, true).rotateX(Math.PI / 2);
  const face = [];
  face.push(new THREE.CylinderGeometry(r * 0.71, r * 0.71, 0.03, 28).rotateX(Math.PI / 2).translate(0, 0, w * 0.32));
  const spokes = 5 + (rear ? 0 : 0);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    for (const off of [-0.11, 0.11]) {
      const sp = new THREE.BoxGeometry(r * 0.66, 0.045, 0.05).translate(r * 0.34, 0, 0).rotateZ(a + off);
      face.push(sp.translate(0, 0, w * 0.36));
    }
  }
  face.push(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 12).rotateX(Math.PI / 2).translate(0, 0, w * 0.38));
  const rimFace = mergeGeometries(face.map((g) => { g.deleteAttribute('uv'); return g; }));
  const disc = new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.035, 26).rotateX(Math.PI / 2).translate(0, 0, w * 0.14);
  const cal = new THREE.BoxGeometry(0.2, 0.13, 0.09).translate(-r * 0.4, r * 0.18, w * 0.2);
  return { tire, barrel, rimFace, disc, cal };
}

function buildCarModel(carId, paintIdx, glowIdx) {
  const def = carById(carId), st = STYLES[def.style];
  const S = sharedCarMaterials();
  const root = new THREE.Group(); root.name = 'car';
  const holder = new THREE.Group(); holder.rotation.y = Math.PI / 2; root.add(holder);
  const body = new THREE.Group(); holder.add(body);
  const paint = makePaintMaterial(paintIdx);
  const hl = st.L / 2;
  const mesh = (g, m, parent = body, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = false; parent.add(o); return o; };
  mesh(bodyGeometry(st), paint);
  mesh(cabinGeometry(st), S.glass);
  // roof panel in body colour
  const roofLen = Math.max(0.4, st.roofF - st.roofR - 0.1);
  const roof = new RoundedBoxGeometry(roofLen, 0.05, st.cabW * 0.66, 2, 0.02);
  mesh(roof.translate((st.roofF + st.roofR) / 2 - 0.02, st.roof + 0.025, 0), paint);
  // lower body: splitter, diffuser, skirts, underbody
  mesh(new THREE.BoxGeometry(st.L * 0.86, 0.06, st.W * 0.9).translate(0, st.ride + 0.05, 0), S.trim);
  mesh(new RoundedBoxGeometry(0.42, 0.04, st.W * 0.92, 2, 0.015).translate(hl - 0.08, st.ride + 0.04, 0), S.carbon);
  for (let i = -2; i <= 2; i++) mesh(new THREE.BoxGeometry(0.42, 0.16, 0.025).translate(-hl + 0.18, st.ride + 0.12, i * 0.22), S.carbon);
  mesh(new THREE.BoxGeometry(0.5, 0.06, st.W * 0.78).translate(-hl + 0.18, st.ride + 0.05, 0), S.carbon);
  for (const z of [-1, 1]) mesh(new RoundedBoxGeometry(st.fx - st.rx - st.wr * 2.3, 0.07, 0.07, 2, 0.02).translate((st.fx + st.rx) / 2, st.ride + 0.06, z * (st.W / 2 - 0.02)), S.carbon);
  // wheel tubs (hide see-through arches)
  for (const x of [st.fx, st.rx]) mesh(new THREE.BoxGeometry(st.wr * 2.3, st.wr * 1.4, st.W * 0.7).translate(x, st.axle + 0.1, 0), S.trim, body, false);
  // front grille / intakes
  mesh(new RoundedBoxGeometry(0.08, 0.14, st.W * 0.6, 2, 0.02).translate(hl - 0.04, st.ride + 0.2, 0), S.trim);
  for (const z of [-1, 1]) mesh(new RoundedBoxGeometry(0.06, 0.16, 0.36, 2, 0.02).translate(hl - 0.08, st.ride + 0.2, z * (st.W / 2 - 0.36)), S.trim);
  if (st.intake) for (const z of [-1, 1]) mesh(new RoundedBoxGeometry(0.55, 0.2, 0.06, 2, 0.02).translate(st.rx + 0.75, st.ride + 0.42, z * (st.W / 2 - 0.1)), S.trim);
  if (st.scoop) mesh(new RoundedBoxGeometry(0.7, 0.1, 0.5, 2, 0.04).translate(st.cowl + 0.65, st.hood + 0.02, 0), S.trim);
  // mirrors
  for (const z of [-1, 1]) {
    mesh(new RoundedBoxGeometry(0.16, 0.1, 0.2, 2, 0.03).translate(st.cowl - 0.12, st.belt + 0.1, z * (st.W / 2 + 0.02)), paint);
    mesh(new THREE.BoxGeometry(0.05, 0.03, 0.18).translate(st.cowl - 0.08, st.belt + 0.03, z * (st.W / 2 - 0.08)), S.trim);
  }
  // headlights
  const heads = new THREE.Group(); body.add(heads);
  for (const z of [-1, 1]) {
    const lg = new RoundedBoxGeometry(0.1, st.ev ? 0.035 : 0.055, st.ev ? st.W * 0.42 : 0.44, 2, 0.015);
    lg.rotateY(z * 0.28).translate(hl - 0.16 - (st.ev ? 0.04 : 0), st.nose - 0.02, z * (st.ev ? st.W * 0.22 : st.W / 2 - 0.36));
    mesh(lg, S.head, heads, false);
    mesh(new THREE.BoxGeometry(0.06, 0.02, 0.32).rotateY(z * 0.28).translate(hl - 0.1, st.ride + 0.3, z * (st.W / 2 - 0.4)), S.drl, heads, false);
  }
  // taillights
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.08, 0.12) });
  mesh(new RoundedBoxGeometry(0.06, 0.07, st.W * 0.8, 2, 0.02).translate(-hl - 0.1, st.tail - 0.1, 0), tailMat, body, false);
  for (const z of [-1, 1]) mesh(new RoundedBoxGeometry(0.07, 0.13, 0.3, 2, 0.02).translate(-hl - 0.09, st.tail - 0.17, z * (st.W / 2 - 0.3)), tailMat, body, false);
  // plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), new THREE.MeshStandardMaterial({ map: plateTexture(def.name.toUpperCase().slice(0, 8)), roughness: 0.5 }));
  plate.position.set(-hl - 0.03, st.ride + 0.38, 0); plate.rotation.y = -Math.PI / 2; body.add(plate);
  // wing
  const wingG = new THREE.Group(); body.add(wingG); wingG.userData.base = st.wing;
  if (st.wing > 0) {
    const ww = st.W * (st.wing > 1 ? 0.96 : 0.84), wh = 0.18 + st.wing * 0.12;
    const blade = new RoundedBoxGeometry(0.28 + st.wing * 0.06, 0.035, ww, 2, 0.015);
    mesh(blade.translate(-hl + 0.28, st.tail + wh, 0), st.wing > 1 ? S.carbon : paint, wingG);
    for (const z of [-1, 1]) {
      if (st.wing > 1) mesh(new THREE.BoxGeometry(0.34, 0.16, 0.025).translate(-hl + 0.28, st.tail + wh - 0.02, z * ww / 2), S.carbon, wingG);
      mesh(new THREE.BoxGeometry(0.08, wh, 0.035).translate(-hl + 0.34, st.tail + wh / 2, z * 0.42), S.carbon, wingG);
    }
  }
  if (st.fin) mesh(new THREE.BoxGeometry(1.0, 0.24, 0.025).translate(-hl + 0.7, st.deck + 0.12, 0), paint);
  // exhausts + flames
  const flames = [];
  const exPos = st.exh === 4 ? [-0.62, -0.44, 0.44, 0.62] : st.exh === 2 ? [-0.32, 0.32] : st.exh === 1 ? [0.0] : [];
  for (const z of exPos) {
    mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.18, 14).rotateZ(Math.PI / 2).translate(-hl - 0.02, st.ride + 0.2, z), S.chrome);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1, 12, 1, true).rotateZ(Math.PI / 2).translate(-0.5, 0, 0), S.flame);
    fl.position.set(-hl - 0.08, st.ride + 0.2, z); fl.scale.set(0.001, 1, 1); fl.frustumCulled = false; body.add(fl); flames.push(fl);
  }
  // wheels
  const wheels = [];
  const wmat = new THREE.MeshStandardMaterial({ color: st.rim, metalness: 0.95, roughness: 0.28 });
  const calMat = new THREE.MeshStandardMaterial({ color: st.cal, metalness: 0.3, roughness: 0.4 });
  for (const [x, rear] of [[st.fx, false], [st.rx, true]]) {
    const parts = wheelParts(st, rear);
    for (const z of [-1, 1]) {
      const steer = new THREE.Group(); steer.position.set(x, st.axle, z * (st.W / 2 - (rear ? 0.2 : 0.22))); holder.add(steer);
      const spin = new THREE.Group(); steer.add(spin);
      const flip = (g) => (z < 0 ? g.clone().rotateY(Math.PI) : g);
      mesh(flip(parts.tire), S.tire, spin); mesh(flip(parts.barrel), S.trim, spin, false); mesh(flip(parts.rimFace), wmat, spin);
      mesh(flip(parts.disc), S.disc, steer, false); mesh(flip(parts.cal), calMat, steer, false);
      wheels.push({ steer, spin, front: !rear });
    }
  }
  // underglow
  const glowMat = new THREE.MeshBasicMaterial({ map: S.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -6 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(st.L * 1.25, st.W * 2.1).rotateX(-Math.PI / 2), glowMat);
  glow.position.y = 0.04; holder.add(glow);
  root.userData = { def, st, holder, body, paint, wheels, flames, tailMat, glow, glowMat, heads, wingG, paintIdx, glowIdx };
  setGlow(root, glowIdx);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return root;
}
function setGlow(model, gi) {
  const u = model.userData; u.glowIdx = gi;
  const c = GLOWS[gi];
  u.glow.visible = !!c;
  if (c) u.glowMat.color.set(c).multiplyScalar(1.6);
}
function setPaint(model, pi) {
  const u = model.userData; const m = makePaintMaterial(pi);
  model.traverse((o) => { if (o.isMesh && o.material === u.paint) o.material = m; });
  u.paint.dispose(); u.paint = m; u.paintIdx = pi;
}
function setWing(model, gripLvl) {
  const u = model.userData; const s = 1 + gripLvl * 0.07;
  u.wingG.scale.set(1, s, 1);
}

export { buildCarModel, setWing, sharedCarMaterials };
