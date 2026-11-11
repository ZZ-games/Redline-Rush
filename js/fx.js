// Particles, skid marks, light trails and camera-space speed lines.
import * as THREE from 'three';
import { TAU, V3, mulberry32, sstep } from './util.js';

/* ============================== particles ============================== */
class Particles {
  constructor(scene, N, additive) {
    this.N = N; this.i = 0;
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.size = new Float32Array(N); this.alpha = new Float32Array(N);
    this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N); this.grow = new Float32Array(N);
    this.drag = new Float32Array(N); this.grav = new Float32Array(N); this.a0 = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = pow(clamp(1.0 - r, 0.0, 1.0), 1.5) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'}); }`,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, drag = 1, grav = 0) {
    const i = this.i; this.i = (this.i + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.a0[i] = alpha; this.alpha[i] = alpha;
    this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
  shift(dx, dz) { for (let i = 0; i < this.N; i++) { this.pos[i * 3] -= dx; this.pos[i * 3 + 2] -= dz; } }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

/* ============================== skid marks ============================== */
class Skids {
  constructor(scene, N = 900) {
    this.N = N; this.i = 0; this.age = new Float32Array(N).fill(99);
    const g = new THREE.PlaneGeometry(0.3, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.InstancedMesh(g, m, N); this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color(1, 1, 1); const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < N; k++) { this.mesh.setMatrixAt(k, z); this.mesh.setColorAt(k, c); }
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = V3(); this._p = V3(); this._c = new THREE.Color(); this._e = new THREE.Euler();
  }
  add(x, y, z, heading, len, strength = 1, bank = 0) {
    const k = this.i; this.i = (this.i + 1) % this.N;
    this._e.set(0, -heading - Math.PI / 2, -bank, 'YXZ'); this._q.setFromEuler(this._e);
    this._p.set(x, y + 0.03, z); this._s.set(1, 1, len);
    this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(k, this._m);
    this.age[k] = 0; this.str = this.str || new Float32Array(this.N); this.str[k] = strength;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    if (!this.str) return;
    for (let k = 0; k < this.N; k++) {
      if (this.age[k] > 40) continue;
      this.age[k] += dt;
      const v = 1 - 0.62 * this.str[k] * (1 - sstep(18, 40, this.age[k]));
      this._c.setRGB(v, v, v); this.mesh.setColorAt(k, this._c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  shift(dx, dz) {
    for (let k = 0; k < this.N; k++) { this.mesh.getMatrixAt(k, this._m); this._m.elements[12] -= dx; this._m.elements[14] -= dz; this.mesh.setMatrixAt(k, this._m); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let k = 0; k < this.N; k++) { this.mesh.setMatrixAt(k, z); this.age[k] = 99; } this.mesh.instanceMatrix.needsUpdate = true; }
}

/* ============================== light trails ============================== */
class Trail {
  constructor(scene, M = 30, width = 0.04, color = [2.2, 0.1, 0.14]) {
    this.M = M; this.w = width; this.pts = []; this.color = new THREE.Color(...color);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(M * 2 * 3); this.a = new Float32Array(M * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < M - 1; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); } g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: this.color }, uOp: { value: 0 } },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * uOp, 1.0); }' });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  push(x, y, z, now) {
    const last = this.pts[0];
    const d2 = last ? (x - last[0]) ** 2 + (y - last[1]) ** 2 + (z - last[2]) ** 2 : 0;
    if (d2 > 400) this.pts.length = 0;
    if (last && d2 < 0.36) { last[0] = x; last[1] = y; last[2] = z; last[3] = now; }
    else { this.pts.unshift([x, y, z, now]); if (this.pts.length > this.M) this.pts.pop(); }
    while (this.pts.length > 2 && now - this.pts[this.pts.length - 1][3] > 0.2) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < this.M; i++) {
      const p = this.pts[Math.min(i, n - 1)] || [x, y, z];
      const fade = i < n ? Math.pow(1 - i / this.M, 1.4) : 0;
      const w = this.w * (0.4 + 0.6 * fade);
      this.pos.set([p[0], p[1] - w, p[2], p[0], p[1] + w, p[2]], i * 6);
      this.a[i * 2] = fade; this.a[i * 2 + 1] = fade;
    }
    const at = this.mesh.geometry.attributes; at.position.needsUpdate = true; at.aA.needsUpdate = true;
  }
  shift(dx, dz) { for (const p of this.pts) { p[0] -= dx; p[2] -= dz; } }
  clear() { this.pts.length = 0; this.a.fill(0); this.mesh.geometry.attributes.aA.needsUpdate = true; }
}

/* ============================== speed lines (camera space) ============================== */
class SpeedLines {
  constructor(camera, N = 80) {
    this.N = N; this.data = [];
    const g = new THREE.PlaneGeometry(0.035, 1).rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.mesh = new THREE.InstancedMesh(g, this.mat, N); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    camera.add(this.mesh);
    const r = mulberry32(11);
    for (let i = 0; i < N; i++) this.data.push({ a: r() * TAU, r: 1.8 + r() * 6, z: -2 - r() * 50, len: 2 + r() * 6, rnd: r() });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = V3(); this._s = V3(); this._z = V3().set(0, 0, 1);
  }
  update(dt, speed, intensity, color) {
    this.mat.opacity = intensity * 0.5; this.mesh.visible = intensity > 0.01;
    if (color) this.mat.color.copy(color);
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.N; i++) {
      const d = this.data[i];
      d.z += speed * dt * (0.9 + d.rnd * 0.4);
      if (d.z > 1) { d.z = -40 - d.rnd * 20; d.a = Math.random() * TAU; d.r = 1.8 + Math.random() * 6; }
      this._q.setFromAxisAngle(this._z, d.a - Math.PI / 2);
      this._p.set(Math.cos(d.a) * d.r, Math.sin(d.a) * d.r * 0.7, d.z);
      this._s.set(1, 1, d.len * (0.4 + intensity));
      this._m.compose(this._p, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export { Particles, Skids, SpeedLines, Trail };
