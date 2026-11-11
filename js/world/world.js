// The world: terrain, road chunks, scenery placement, streaming, lighting and per-district blending.
import * as THREE from 'three';
import { TAU, V3, clamp, fbm2, hash1, lerp, lerp3, mulberry32, noise2, sstep } from '../util.js';
import { LANES, ROAD_HALF, ROAD_W, TEX_V_LEN, asphaltTextures, bannerTexture, chevronTexture, detailTexture, glowTexture, signAtlas } from '../textures.js';
import { BIOMES, CHUNK, GATE_SPACING, SEA, STEP, blendBiomes, srgb } from '../districts.js';
import { Track } from '../track.js';
import { applySky, makeRingMaterial, makeSkyMaterial, ringGeometry } from './sky.js';
import { buildPrototypes, makeBuildingMaterial, makeSignMaterial } from './scenery.js';

/* ============================== world ============================== */
const ORIGIN = { x: 0, z: 0 };
const _f = {}, _f2 = {};

class World {
  constructor(renderer, scene, Q) {
    this.renderer = renderer; this.scene = scene; this.Q = Q;
    this.chunks = new Map(); this.track = null; this.params = {}; this.time = 0;
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.tex = asphaltTextures(aniso);
    this.detail = detailTexture(aniso);
    this.glow = glowTexture(128, 2.0);
    this.atlas = signAtlas();
    this.chevron = chevronTexture();
    this.P = buildPrototypes();
    this.winU = { value: 1 };
    this.weights = new Float32Array(5);

    const M = (this.mat = {});
    M.road = new THREE.MeshStandardMaterial({ map: this.tex.map, roughnessMap: this.tex.rough, normalMap: this.tex.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 1, metalness: 0.0 });
    M.road.polygonOffset = true; M.road.polygonOffsetFactor = -1; M.road.polygonOffsetUnits = -1;
    M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.detail, roughness: 0.93, metalness: 0 });
    M.rail = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide });
    M.concrete = new THREE.MeshStandardMaterial({ color: 0x8d8b92, roughness: 0.85, metalness: 0.0 });
    M.neonL = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 0.25, 2.4) });
    M.neonR = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 4.2) });
    M.post = new THREE.MeshStandardMaterial({ color: 0x9a9da5, metalness: 0.6, roughness: 0.45 });
    M.pole = new THREE.MeshStandardMaterial({ color: 0x2a2c33, metalness: 0.7, roughness: 0.4 });
    M.lamp = new THREE.MeshBasicMaterial({ color: 0xffffff });
    M.pool = new THREE.MeshBasicMaterial({ map: this.glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    M.building = makeBuildingMaterial(this.winU);
    M.sign = makeSignMaterial(this.atlas);
    M.veg = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    M.rock = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true });
    M.mesa = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    M.tunnel = new THREE.MeshStandardMaterial({ color: 0x55545c, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
    M.tunnelLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8) });
    M.gate = new THREE.MeshStandardMaterial({ color: 0x15141c, metalness: 0.8, roughness: 0.3 });
    M.gateStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.0, 0.3, 0.6) });
    M.pad = new THREE.MeshBasicMaterial({ map: this.chevron, color: new THREE.Color(0.3, 2.4, 3.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    M.wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.9 });
    M.reflector = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0xff8800, emissiveIntensity: 0.6 });

    // sky
    this.skyMat = makeSkyMaterial();
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10; scene.add(this.sky);
    // rings
    this.mtnMat = makeRingMaterial(false);
    this.mtn = new THREE.Mesh(ringGeometry(3600, 420, (a) => { const x = Math.cos(a) * 3, z = Math.sin(a) * 3; return 120 + 300 * (fbm2(x + 10, z + 10, 3, 4) * 0.5 + 0.5) + 120 * Math.max(0, noise2(x * 3, z * 3, 9)); }), this.mtnMat);
    this.mtn.frustumCulled = false; this.mtn.renderOrder = -5; scene.add(this.mtn);
    this.cityMat = makeRingMaterial(true);
    this.city = new THREE.Mesh(ringGeometry(1900, 0, (a, rnd) => 30 + Math.pow(rnd(), 1.8) * 260, true), this.cityMat);
    this.city.frustumCulled = false; this.city.renderOrder = -4; scene.add(this.city);
    // ocean
    const wn = this.tex.normal.clone(); wn.repeat.set(220, 220); wn.wrapS = wn.wrapT = THREE.RepeatWrapping; this.waterNormal = wn;
    this.oceanMat = new THREE.MeshStandardMaterial({ color: 0x0b2a3a, roughness: 0.07, metalness: 0.15, normalMap: wn, normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.2 });
    this.ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), this.oceanMat);
    this.ocean.position.y = SEA; this.ocean.receiveShadow = false; scene.add(this.ocean);
    // snow
    {
      const N = 2600, g = new THREE.BufferGeometry(), p = new Float32Array(N * 3); const r = mulberry32(3);
      for (let i = 0; i < N; i++) { p[i * 3] = (r() - 0.5) * 120; p[i * 3 + 1] = r() * 50; p[i * 3 + 2] = (r() - 0.5) * 120; }
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, map: this.glow, transparent: true, depthWrite: false, opacity: 0.9, sizeAttenuation: true });
      this.snow = new THREE.Points(g, this.snowMat); this.snow.frustumCulled = false; scene.add(this.snow);
    }
    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = Q.shadows > 0;
    if (Q.shadows) {
      this.sun.shadow.mapSize.set(Q.shadows, Q.shadows);
      const c = this.sun.shadow.camera; c.left = -45; c.right = 45; c.top = 45; c.bottom = -45; c.near = 1; c.far = 260;
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    }
    scene.add(this.sun); scene.add(this.sun.target);
    this.lampLights = [];
    for (let i = 0; i < Q.lamps; i++) { const L = new THREE.PointLight(0xffffff, 0, 34, 1.7); scene.add(L); this.lampLights.push(L); }
    this.fog = new THREE.FogExp2(0x000000, 0.002); scene.fog = this.fog;
    this.buildEnvMaps();
  }

  buildEnvMaps() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envs = BIOMES.map((b, i) => {
      const es = new THREE.Scene();
      const m = makeSkyMaterial(); applySky(m, blendBiomes(i, i, 0, {})); m.uniforms.uStars.value = 0;
      es.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), m));
      if (b.id === 'neon') {
        const cols = [[6, 0.3, 3.5], [0.3, 3.5, 6], [6, 2, 0.3], [2.5, 0.5, 6]];
        for (let k = 0; k < 26; k++) {
          const a = (k / 26) * TAU, r = 60 + (k % 3) * 20; const c = cols[k % 4];
          const bx = new THREE.Mesh(new THREE.BoxGeometry(8 + (k % 4) * 4, 3 + (k % 5) * 3, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c) }));
          bx.position.set(Math.cos(a) * r, 6 + (k % 6) * 7, Math.sin(a) * r); bx.lookAt(0, bx.position.y, 0); es.add(bx);
        }
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050308 })); fl.position.y = -2; es.add(fl);
      } else {
        const gc = b.id === 'snow' ? [0.7, 0.74, 0.8] : b.id === 'coast' ? [0.18, 0.12, 0.12] : b.id === 'canyon' ? [0.3, 0.12, 0.06] : [0.55, 0.42, 0.3];
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(...gc) })); fl.position.y = -3; es.add(fl);
      }
      const rt = pm.fromScene(es, 0.02, 0.1, 1200);
      es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      return rt.texture;
    });
    pm.dispose();
  }

  reset(opts) {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    this.track = new Track(opts);
    this.lastEnv = -1;
  }

  /* ---- terrain helpers (shared by mesh + scenery placement) ---- */
  terrainY(s, x, roadY, w) {
    const d = Math.abs(x) - ROAD_HALF, side = x > 0 ? 1 : -1;
    const base = roadY - 0.12 - sstep(0, 3, d) * 0.4;
    let y = 0;
    for (let b = 0; b < 5; b++) {
      if (w[b] <= 0) continue;
      let v;
      switch (b) {
        case 0: v = roadY - 0.2 - sstep(0, 2, d) * 0.15; break;
        case 1: v = side > 0 ? lerp(base, SEA - 5, sstep(4, 70, d)) + noise2(s / 40, d / 30, 2) * 0.4 * sstep(0, 20, d)
          : base + sstep(6, 80, d) * (24 + 16 * noise2(s / 130, d / 90, 3)) + noise2(s / 25, d / 25, 4) * 2.2 * sstep(5, 30, d); break;
        case 2: v = base + sstep(9, 38, d) * (30 + 26 * fbm2(s / 95, d / 60, 5, 2)) + sstep(60, 260, d) * 26 + noise2(s / 11, d / 11, 2) * 1.6 * sstep(8, 22, d); break;
        case 3: v = base + sstep(7, 150, d) * (42 + 34 * fbm2(s / 210, d / 130, 7, 2)) + noise2(s / 28, d / 28, 1) * 2.4 * sstep(5, 30, d); break;
        default: v = base + sstep(8, 90, d) * (2.5 + 10 * (fbm2(s / 120, d / 95, 11, 2) * 0.5 + 0.5)); break;
      }
      // far field eases down so the edge of the terrain meets the horizon cleanly
      v = lerp(v, Math.min(v, roadY + 30), sstep(380, 620, d));
      y += v * w[b];
    }
    return y;
  }
  terrainColor(s, x, y, roadY, w, out) {
    const d = Math.abs(x) - ROAD_HALF, side = x > 0 ? 1 : -1;
    let r = 0, g = 0, b = 0;
    const n = noise2(s / 13, x / 13, 7) * 0.5 + 0.5, n2 = noise2(s / 70, x / 70, 9) * 0.5 + 0.5;
    for (let k = 0; k < 5; k++) {
      if (w[k] <= 0) continue;
      let c;
      switch (k) {
        case 0: c = d < 4 ? [0.16, 0.15, 0.19] : lerp3([0.05, 0.045, 0.07], [0.08, 0.06, 0.1], n); break;
        case 1: if (side > 0) { c = y < SEA + 0.6 ? [0.42, 0.34, 0.24] : lerp3([0.78, 0.64, 0.46], [0.86, 0.74, 0.55], n); if (d < 3) c = [0.4, 0.36, 0.3]; }
          else { const h = y - roadY; c = lerp3(lerp3([0.24, 0.32, 0.12], [0.33, 0.38, 0.16], n), lerp3([0.42, 0.34, 0.28], [0.55, 0.45, 0.36], n), sstep(4, 18, h) * 0.8 + n2 * 0.2); } break;
        case 2: { const band = 0.5 + 0.5 * Math.sin(y * 0.55 + n2 * 2.0); c = lerp3([0.46, 0.15, 0.06], [0.78, 0.4, 0.2], band * 0.75 + n * 0.25); if (d < 6) c = lerp3(c, [0.6, 0.36, 0.22], 0.6); break; }
        case 3: { const rock = sstep(0.62, 0.72, n2 * 0.7 + n * 0.3) * sstep(6, 20, d); c = lerp3(lerp3([0.86, 0.9, 0.96], [0.95, 0.97, 1.0], n), [0.32, 0.34, 0.38], rock); break; }
        default: c = d < 30 ? lerp3([0.86, 0.82, 0.74], [0.92, 0.9, 0.84], n) : lerp3([0.82, 0.58, 0.36], [0.9, 0.7, 0.46], n); break;
      }
      r += c[0] * w[k]; g += c[1] * w[k]; b += c[2] * w[k];
    }
    out[0] = srgb(r); out[1] = srgb(g); out[2] = srgb(b); return out;
  }

  /* ---- chunk construction ---- */
  buildChunk(k) {
    const T = this.track, Q = this.Q, M = this.mat, P = this.P;
    const s0 = k * CHUNK, j0 = s0 / STEP, rows = CHUNK / STEP + 1;
    T.ensure(s0 + CHUNK + 4);
    const ox = T.px[j0], oz = T.pz[j0];
    const group = new THREE.Group();
    const c = { k, s0, ox, oz, group, geos: [], tex: [], inst: [], lamps: [], tunnel: false };
    const rnd = mulberry32((k * 9301 + T.seed * 49297) | 0);
    const W = new Float32Array(5);
    const R = []; // per-row frames
    for (let i = 0; i < rows; i++) {
      const j = j0 + i, s = s0 + i * STEP, th = T.th[j];
      const bank = clamp(T.k[j] * 26, -0.11, 0.11);
      R.push({ s, x: T.px[j] - ox, z: T.pz[j] - oz, y: T.h[j], tx: Math.cos(th), tz: Math.sin(th), rx: -Math.sin(th), rz: Math.cos(th), sb: Math.sin(bank), w: Float32Array.from(T.weights(s, W)) });
    }
    const wMid = R[rows >> 1].w;
    const dom = wMid.indexOf(Math.max(...wMid));
    const biome = BIOMES[dom].id;
    const add = (mesh, cast = false, recv = false) => { mesh.castShadow = cast && Q.shadows > 0; mesh.receiveShadow = recv && Q.shadows > 0; group.add(mesh); return mesh; };
    const geo = (g) => { c.geos.push(g); return g; };

    // ---------- road ----------
    {
      const LX = [-ROAD_HALF, -ROAD_HALF / 2, 0, ROAD_HALF / 2, ROAD_HALF];
      const pos = [], uv = [], idx = [];
      const vOff = (s0 % (TEX_V_LEN * 8)) / TEX_V_LEN;
      for (let i = 0; i < rows; i++) {
        const r = R[i];
        for (let l = 0; l < LX.length; l++) {
          const x = LX[l];
          pos.push(r.x + r.rx * x, r.y - r.sb * x, r.z + r.rz * x);
          uv.push((x + ROAD_HALF) / ROAD_W, vOff + (i * STEP) / TEX_V_LEN);
        }
        if (i > 0) { const a = (i - 1) * 5, b = i * 5; for (let l = 0; l < 4; l++) idx.push(a + l, a + l + 1, b + l, b + l, a + l + 1, b + l + 1); }
      }
      const g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      add(new THREE.Mesh(g, M.road), false, true);
    }
    // ---------- terrain ----------
    {
      const D = [0, 1.2, 3.5, 7, 12, 19, 28, 40, 56, 78, 108, 150, 210, 300, 420, 620];
      const nd = D.length;
      const pos = [], col = [], uv = [], idx = []; const cc = [0, 0, 0];
      let rowsUsed = 0;
      for (let i = 0; i < rows; i += 2) {
        const r = R[i];
        for (let side = -1; side <= 1; side += 2) {
          for (let q = 0; q < nd; q++) {
            const x = side * (ROAD_HALF + D[q]);
            const y = q === 0 ? r.y - r.sb * x - 0.04 : this.terrainY(r.s, x, r.y - r.sb * Math.sign(x) * ROAD_HALF, r.w);
            pos.push(r.x + r.rx * x, y, r.z + r.rz * x);
            this.terrainColor(r.s, x, y, r.y, r.w, cc); col.push(cc[0], cc[1], cc[2]);
            uv.push(x / 9, (r.s % 512) / 9);
          }
        }
        if (rowsUsed > 0) {
          const per = nd * 2, a = (rowsUsed - 1) * per, b = rowsUsed * per;
          for (let side = 0; side < 2; side++) {
            const o = side * nd;
            for (let q = 0; q < nd - 1; q++) {
              const A = a + o + q, B = b + o + q;
              if (side === 0) idx.push(A, B, A + 1, B, B + 1, A + 1); else idx.push(A, A + 1, B, B, A + 1, B + 1);
            }
          }
        }
        rowsUsed++;
      }
      const g = geo(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      add(new THREE.Mesh(g, M.terrain), false, true);
    }
    const tunnel = biome === 'neon' && T.isTunnel(k);
    c.tunnel = tunnel;
    // ---------- barriers ----------
    const sweep = (profile, side, xBase, mat, cast) => {
      const pos = [], idx = []; const np = profile.length;
      for (let i = 0; i < rows; i++) {
        const r = R[i];
        for (const [px, py] of profile) { const x = side * (xBase + px); pos.push(r.x + r.rx * x, r.y - r.sb * x + py, r.z + r.rz * x); }
        if (i > 0) { const a = (i - 1) * np, b = i * np; for (let q = 0; q < np - 1; q++) { if (side > 0) idx.push(a + q, a + q + 1, b + q, b + q, a + q + 1, b + q + 1); else idx.push(a + q, b + q, a + q + 1, b + q, b + q + 1, a + q + 1); } }
      }
      const g = geo(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      return add(new THREE.Mesh(g, mat), cast, true);
    };
    const insts = {}; // proto key -> {mat, list:[[matrix, color]]}
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = V3(), _s = V3(), _e = new THREE.Euler();
    const place = (key, mat, i, x, yOff, scale, yaw, color, extra) => {
      const r = R[clamp(Math.round(i), 0, rows - 1)];
      const y = Math.abs(x) <= ROAD_HALF + 0.01 ? r.y - r.sb * x : this.terrainY(r.s, x, r.y - r.sb * Math.sign(x) * ROAD_HALF, r.w);
      _p.set(r.x + r.rx * x, y + yOff, r.z + r.rz * x);
      const heading = Math.atan2(r.tz, r.tx);
      _e.set(extra?.pitch || 0, -heading + (yaw || 0), extra?.roll || 0, 'YXZ'); _q.setFromEuler(_e);
      if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
      _m.compose(_p, _q, _s);
      (insts[key] = insts[key] || { mat, list: [], geo: extra?.geo }).list.push([_m.clone(), color, extra?.sign]);
      return y;
    };
    if (tunnel) {
      sweep([[0, 0], [0.9, 0], [0.9, 7.6], [-1.2, 7.6]], -1, 9.9, M.tunnel, true);
      sweep([[0, 0], [0.9, 0], [0.9, 7.6], [-1.2, 7.6]], 1, 9.9, M.tunnel, true);
      // ceiling
      {
        const pos = [], idx = [];
        for (let i = 0; i < rows; i++) { const r = R[i]; for (const x of [-11, 11]) pos.push(r.x + r.rx * x, r.y - r.sb * x + 7.6, r.z + r.rz * x); if (i > 0) { const a = (i - 1) * 2, b = i * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); } }
        const g = geo(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        add(new THREE.Mesh(g, M.tunnel), true, false);
      }
      for (let i = 1; i < rows; i += 4) { place('tl', M.tunnelLight, i, -5.2, 7.5, 1, 0); place('tl', M.tunnelLight, i, 5.2, 7.5, 1, 0); }
      sweep([[0, 0.9], [0, 1.05]], -1, 9.85, M.neonL, false);
      sweep([[0, 0.9], [0, 1.05]], 1, 9.85, M.neonR, false);
      // portals where the tunnel starts / ends
      for (const [kk, i, dir] of [[k - 1, 0, -1], [k + 1, rows - 1, 1]]) {
        if (T.isTunnel(kk)) continue;
        const r = R[i]; const heading = Math.atan2(r.tz, r.tx);
        for (const [x, cy, w, h] of [[-30.5, 10, 41, 22], [30.5, 10, 41, 22], [0, 15.6, 22, 16]]) {
          const b = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, 1.5)), M.tunnel);
          b.position.set(r.x + r.rx * x, r.y + cy, r.z + r.rz * x);
          b.rotation.y = -heading + Math.PI / 2; add(b, true, true);
        }
      }
    } else if (biome === 'neon') {
      const jersey = [[-0.32, 0], [-0.22, 0.28], [-0.12, 0.86], [0.12, 0.86], [0.22, 0.28], [0.32, 0]];
      sweep(jersey, -1, 9.95, M.concrete, true); sweep(jersey, 1, 9.95, M.concrete, true);
      sweep([[-0.06, 0.87], [0.06, 0.87]], -1, 9.95, M.neonL, false); sweep([[-0.06, 0.87], [0.06, 0.87]], 1, 9.95, M.neonR, false);
    } else {
      const rail = [[0, 0.46], [0, 0.78]];
      sweep(rail, -1, 9.85, M.rail, true); sweep(rail, 1, 9.85, M.rail, true);
      for (let i = 0; i < rows; i += 2) { place('post', M.post, i, -9.95, -0.05, 1, 0); place('post', M.post, i, 9.95, -0.05, 1, 0); }
    }

    // ---------- street lights ----------
    const night = BIOMES[dom].night;
    const lampCols = { neon: [[3.6, 0.7, 2.6], [0.6, 2.6, 3.8]], coast: [[3.6, 1.8, 0.6]], snow: [[2.6, 2.9, 3.6]], canyon: [], desert: [] }[biome];
    if (!tunnel && lampCols.length) {
      const spacing = biome === 'neon' ? 24 : 36;
      for (let i = (k % 2) * (spacing / STEP / 2); i < rows - 1; i += spacing / STEP) {
        const sides = biome === 'neon' ? [-1, 1] : [-1];
        sides.forEach((side, si) => {
          const lc = lampCols[(si + Math.floor(i)) % lampCols.length];
          const x = side * 10.9;
          place('pole', M.pole, i, x, 0, 1, side < 0 ? -Math.PI / 2 : Math.PI / 2);
          place('lamp', M.lamp, i, x, 0, 1, side < 0 ? -Math.PI / 2 : Math.PI / 2, lc);
          const r = R[Math.round(i)]; const lx = side * (10.9 - 2.6);
          place('pool', M.pool, i, lx * 0.92, 0.04, [13, 1, 9], 0, [lc[0] * 0.09 * night, lc[1] * 0.09 * night, lc[2] * 0.09 * night]);
          c.lamps.push({ x: r.x + r.rx * lx + ox, y: r.y + 8.0, z: r.z + r.rz * lx + oz, s: r.s, col: lc });
        });
      }
    }
    // ---------- per-district scenery ----------
    const dens = Q.density;
    const ri = () => rnd() * (rows - 1);
    const sideX = (d0, d1) => (rnd() < 0.5 ? -1 : 1) * (ROAD_HALF + d0 + rnd() * (d1 - d0));
    if (biome === 'neon') {
      // towers in two belts
      for (let n = 0; n < 22 * dens; n++) {
        const i = ri(), side = rnd() < 0.5 ? -1 : 1;
        const near = n < 12 * dens;
        const d = near ? 7 + rnd() * 22 : 40 + rnd() * 130;
        const w = 12 + rnd() * 22, h = near ? 18 + Math.pow(rnd(), 1.6) * 90 : 40 + Math.pow(rnd(), 1.3) * 200;
        const dep = 10 + rnd() * 22;
        const tint = 0.55 + rnd() * 0.5;
        place('bld', M.building, i, side * (ROAD_HALF + d + dep / 2), -1, [w, h, dep], (rnd() - 0.5) * 0.12, [tint * 0.18, tint * 0.17, tint * 0.24]);
        if (near && rnd() < 0.75) {
          const sw = 7 + rnd() * 5;
          place('sign', M.sign, i, side * (ROAD_HALF + d - 0.4), 8 + rnd() * Math.max(2, Math.min(40, h - 12)), [sw, sw * 0.5, 1], side < 0 ? -0.6 : Math.PI + 0.6, null, { sign: Math.floor(rnd() * 8) });
        }
      }
    } else if (biome === 'coast') {
      for (let n = 0; n < 16 * dens; n++) { const i = ri(); const x = rnd() < 0.62 ? -(ROAD_HALF + 4 + rnd() * 26) : ROAD_HALF + 3 + rnd() * 18; place('palm', M.veg, i, x, -0.2, 0.85 + rnd() * 0.5, rnd() * TAU); }
      for (let n = 0; n < 10 * dens; n++) { const i = ri(); const x = sideX(20, 200); const sc = 2 + rnd() * 6; place('rock', M.rock, i, x, -sc * 0.3, [sc * 1.4, sc, sc * 1.2], rnd() * TAU, [0.32, 0.26, 0.22]); }
    } else if (biome === 'canyon') {
      for (let n = 0; n < 8 * dens; n++) { const i = ri(); const x = sideX(70, 420); const r0 = 18 + rnd() * 40; place('mesa', M.mesa, i, x, -6, [r0, 50 + rnd() * 110, r0 * (0.7 + rnd() * 0.6)], rnd() * TAU); }
      for (let n = 0; n < 14 * dens; n++) { const i = ri(); const x = sideX(3, 50); const sc = 0.8 + rnd() * 3.5; place('rock', M.rock, i, x, -sc * 0.35, [sc * 1.3, sc, sc], rnd() * TAU, [0.55, 0.24, 0.12]); }
      if (hash1(k, T.seed + 91) < 0.18) place('arch', M.mesa, rows / 2, 0, -1.5, [1.1, 1.0, 1.0], -Math.PI / 2, null, { geo: P.arch });
      for (let i = 0; i < rows; i += 30) place('ppole', M.wood, i, -16, 0, 1, 0);
    } else if (biome === 'snow') {
      for (let n = 0; n < 46 * dens; n++) { const i = ri(); const x = sideX(3, 220); const sc = 0.8 + rnd() * 0.9; place('pine', M.veg, i, x, -0.3, sc, rnd() * TAU); }
      for (let n = 0; n < 8 * dens; n++) { const i = ri(); const x = sideX(6, 120); const sc = 1 + rnd() * 4; place('rock', M.rock, i, x, -sc * 0.3, [sc * 1.3, sc, sc], rnd() * TAU, [0.36, 0.38, 0.42]); }
    } else {
      for (let n = 0; n < 12 * dens; n++) { const i = ri(); const x = sideX(4, 90); place('cactus', M.veg, i, x, -0.1, 0.8 + rnd() * 0.7, rnd() * TAU); }
      for (let n = 0; n < 6 * dens; n++) { const i = ri(); const x = sideX(90, 480); const r0 = 14 + rnd() * 30; place('mesa', M.mesa, i, x, -4, [r0, 20 + rnd() * 60, r0], rnd() * TAU); }
      for (let n = 0; n < 8 * dens; n++) { const i = ri(); const x = sideX(4, 70); const sc = 0.6 + rnd() * 2; place('rock', M.rock, i, x, -sc * 0.3, [sc * 1.3, sc, sc], rnd() * TAU, [0.62, 0.48, 0.34]); }
      for (let i = 0; i < rows; i += 30) place('ppole', M.wood, i, 15, 0, 1, 0);
      for (let i = 0; i < rows; i += 12) { place('refl', M.reflector, i, -10.2, 0, 1, 0); place('refl', M.reflector, i, 10.2, 0, 1, 0); }
    }

    // ---------- instanced meshes ----------
    const geoFor = { tl: P.tunnelLight, post: P.post, pole: P.pole, lamp: P.lampHead, pool: P.pool, bld: P.building, palm: P.palm, rock: P.rock, mesa: P.mesa, pine: P.pine, cactus: P.cactus, ppole: P.powerPole, refl: P.reflector };
    for (const key in insts) {
      const it = insts[key]; const n = it.list.length;
      let g = it.geo || geoFor[key];
      if (key === 'sign') { g = geo(P.sign.clone()); g.setAttribute('aSign', new THREE.InstancedBufferAttribute(new Float32Array(it.list.map((e) => e[2] || 0)), 1)); }
      const im = new THREE.InstancedMesh(g, it.mat, n);
      const col = new THREE.Color();
      it.list.forEach(([m, cl], q) => { im.setMatrixAt(q, m); if (cl) { col.setRGB(cl[0], cl[1], cl[2]); im.setColorAt(q, col); } });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      const caster = Q.sceneryShadow && ['bld', 'palm', 'pine', 'cactus', 'rock', 'mesa', 'pole', 'ppole', 'arch', 'post'].includes(key);
      add(im, caster, ['bld', 'rock', 'mesa', 'arch'].includes(key));
      c.inst.push(im);
    }

    // ---------- gates ----------
    for (let gi = Math.ceil(s0 / GATE_SPACING); gi * GATE_SPACING < s0 + CHUNK; gi++) {
      if (gi < 1) continue;
      const gs = gi * GATE_SPACING; const i = Math.round((gs - s0) / STEP); const r = R[clamp(i, 0, rows - 1)];
      const heading = Math.atan2(r.tz, r.tx);
      const isDistrict = gs % this.track.dlen === 0;
      const bi = T.biomeAt(gs + 1).a; const B = BIOMES[bi];
      const color = isDistrict ? B.accent : '#ff2d55';
      const tex = bannerTexture(isDistrict ? B.name : 'CHECKPOINT', isDistrict ? B.tag : '+ TIME', color); c.tex.push(tex);
      const gg = new THREE.Group(); gg.position.set(r.x, r.y, r.z); gg.rotation.y = -heading + Math.PI / 2;
      // local frame: x lateral (left->right), z along travel (toward camera = -travel)
      const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), m); b.position.set(x, y, z); gg.add(b); b.castShadow = Q.shadows > 0; return b; };
      box(1.3, 10.5, 1.3, -10.9, 5.25, 0, M.gate); box(1.3, 10.5, 1.3, 10.9, 5.25, 0, M.gate);
      box(23.2, 1.8, 1.4, 0, 9.6, 0, M.gate);
      const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(4) }); c.tex.push(sm);
      box(0.18, 9.6, 0.2, -10.15, 4.8, -0.72, sm); box(0.18, 9.6, 0.2, 10.15, 4.8, -0.72, sm); box(20.4, 0.16, 0.2, 0, 8.6, -0.72, sm);
      const bm = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) }); c.tex.push(bm);
      // local +z points along travel, so the face the driver sees looks toward -z
      const banner = new THREE.Mesh(geo(new THREE.PlaneGeometry(17, 3.2)), bm); banner.position.set(0, 9.6, -0.72); banner.rotation.y = Math.PI; gg.add(banner);
      const back = banner.clone(); back.rotation.y = 0; back.position.z = 0.72; gg.add(back);
      group.add(gg);
    }
    // ---------- boost pads ----------
    for (const pd of T.pads(s0, s0 + CHUNK)) {
      const i = (pd.s - s0) / STEP; const r = R[clamp(Math.round(i), 0, rows - 1)]; const x = LANES[pd.lane];
      const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.8, 7).rotateX(-Math.PI / 2)), M.pad);
      m.position.set(r.x + r.rx * x, r.y - r.sb * x + 0.05, r.z + r.rz * x); m.rotation.set(0, -Math.atan2(r.tz, r.tx) - Math.PI / 2, -Math.asin(r.sb), 'YXZ');
      group.add(m);
    }
    this.scene.add(group);
    return c;
  }
  // build one chunk of every district (with a gate) so all shader variants compile during loading
  prewarm(camera) {
    const keep = this.track, made = [];
    for (let b = 0; b < 5; b++) {
      this.track = new Track({ seed: 11 + b, start: b });
      for (const k of [3, 9]) { const c = this.buildChunk(k); c.group.position.set(c.ox, 0, c.oz); made.push(c); }
    }
    try { this.renderer.compile(this.scene, camera); } catch (e) { /* ignore */ }
    for (const c of made) this.disposeChunk(c);
    this.track = keep;
  }
  disposeChunk(c) {
    this.scene.remove(c.group);
    for (const g of c.geos) g.dispose();
    for (const t of c.tex) t.dispose();
    for (const im of c.inst) im.dispose();
  }

  /* ---- per-frame ---- */
  stream(sCar, budget = 1) {
    const T = this.track, k0 = Math.floor((sCar - 180) / CHUNK), k1 = Math.floor((sCar + this.Q.draw) / CHUNK);
    T.ensure((k1 + 2) * CHUNK);
    for (const [k, c] of this.chunks) if (k < k0 - 1 || k > k1 + 1) { this.disposeChunk(c); this.chunks.delete(k); }
    let built = 0;
    for (let k = Math.max(0, k0); k <= k1 && built < budget; k++) {
      if (!this.chunks.has(k)) { this.chunks.set(k, this.buildChunk(k)); built++; }
    }
    for (const c of this.chunks.values()) c.group.position.set(c.ox - ORIGIN.x, 0, c.oz - ORIGIN.z);
  }
  update(dt, sCar, cam, carRender) {
    this.time += dt;
    const T = this.track, p = this.params;
    const { a, b, t } = T.biomeAt(sCar);
    blendBiomes(a, b, t, p);
    this.blend = { a, b, t };
    this.weights.fill(0); this.weights[a] += 1 - t; this.weights[b] += t;
    applySky(this.skyMat, p); this.skyMat.uniforms.uTime.value = this.time;
    this.sky.position.copy(cam.position);
    this.fog.color.setRGB(...p.fog); this.fog.density = p.fogD * (this.Q.draw < 900 ? 1.35 : 1);
    this.hemi.color.setRGB(...p.hemiSky); this.hemi.groundColor.setRGB(...p.hemiGnd); this.hemi.intensity = p.hemiInt;
    this.sun.color.setRGB(...p.lightCol); this.sun.intensity = p.lightInt;
    this.sun.target.position.copy(carRender);
    this.sun.position.set(carRender.x + p.sunDir[0] * 120, carRender.y + Math.max(0.25, p.sunDir[1]) * 120, carRender.z + p.sunDir[2] * 120);
    const envIdx = t < 0.5 ? a : b;
    if (envIdx !== this.lastEnv) { this.scene.environment = this.envs[envIdx]; this.lastEnv = envIdx; }
    this.scene.environmentIntensity = p.env;
    this.mat.road.roughness = p.roadRough; this.mat.road.envMapIntensity = p.roadEnv;
    this.winU.value = 0.12 + p.night * 0.8;
    // rings follow the camera
    this.mtn.position.set(cam.position.x, 0, cam.position.z);
    const mu = this.mtnMat.uniforms; mu.uLow.value.setRGB(...p.mtnLow); mu.uHigh.value.setRGB(...p.mtnHigh); mu.uHaze.value.setRGB(...p.hor); mu.uHazeAmt.value = p.mtnHaze; mu.uSnow.value = p.mtnSnow; mu.uScale.value = p.mtnScale;
    this.city.position.set(cam.position.x, 0, cam.position.z);
    const cu = this.cityMat.uniforms; cu.uLow.value.setRGB(0.012, 0.01, 0.025); cu.uHigh.value.setRGB(0.03, 0.02, 0.06); cu.uHaze.value.setRGB(...p.fog); cu.uHazeAmt.value = 0.35; cu.uVis.value = p.city; cu.uDrop.value = (1 - p.city) * 420;
    this.city.visible = p.city > 0.01;
    // ocean
    const coastW = this.weights[1];
    this.ocean.visible = coastW > 0.001;
    this.ocean.position.set(Math.round(cam.position.x), SEA, Math.round(cam.position.z));
    this.waterNormal.offset.set((this.time * 0.006) % 1, (this.time * 0.004) % 1);
    // snow
    this.snow.visible = p.snow > 0.02;
    if (this.snow.visible) {
      this.snowMat.opacity = p.snow * 0.9;
      const pa = this.snow.geometry.attributes.position, arr = pa.array, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * (3 + (i % 7) * 0.4); arr[i] += Math.sin(this.time + i) * dt * 0.6;
        if (arr[i] - cx > 60) arr[i] -= 120; else if (arr[i] - cx < -60) arr[i] += 120;
        if (arr[i + 2] - cz > 60) arr[i + 2] -= 120; else if (arr[i + 2] - cz < -60) arr[i + 2] += 120;
        if (arr[i + 1] - cy < -12) arr[i + 1] += 45; else if (arr[i + 1] - cy > 33) arr[i + 1] -= 45;
      }
      pa.needsUpdate = true;

    }
    this.mat.pad.map.offset.y = 1 - ((this.time * 1.6) % 1);
    // lamp lights pool
    if (this.lampLights.length) {
      const cand = [];
      for (const ch of this.chunks.values()) for (const L of ch.lamps) { const ds = L.s - sCar; if (ds > -15 && ds < 130) cand.push([ds, L]); }
      cand.sort((x, y) => x[0] - y[0]);
      const inten = p.night * 140;
      this.lampLights.forEach((Lt, i) => {
        const e = cand[i];
        if (!e || inten < 1) { Lt.intensity = 0; return; }
        Lt.position.set(e[1].x - ORIGIN.x, e[1].y, e[1].z - ORIGIN.z);
        Lt.color.setRGB(e[1].col[0] / 4, e[1].col[1] / 4, e[1].col[2] / 4);
        Lt.intensity = inten * (1 - sstep(90, 130, e[0]));
      });
    }
    return p;
  }
}

export { ORIGIN, World };
