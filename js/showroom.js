// The 3D garage showroom scene.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { $ } from './util.js';
import { carById, carState } from './content.js';
import { buildCarModel, setWing } from './cars.js';
import { UI } from './ui.js';

/* ============================== showroom ============================== */
const SHOWROOM = {
  init(renderer) {
    const sc = (this.scene = new THREE.Scene());
    sc.background = new THREE.Color(0x060509); sc.fog = new THREE.Fog(0x060509, 13, 27);
    const pm = new THREE.PMREMGenerator(renderer);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    sc.environment = this.env; sc.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.32, metalness: 0.5, transparent: true, opacity: 0.86 }));
    floor.receiveShadow = true; sc.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.035, 8, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.45) }));
    ring.position.y = 0.02; sc.add(ring); this.ring = ring;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5.1, 0.02, 8, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 1.2, 2.0) }));
    ring2.position.y = 0.02; sc.add(ring2);
    // light bars overhead
    for (let i = -2; i <= 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(7, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.8) })); b.position.set(0, 6.2, i * 1.4); sc.add(b); }
    const key = new THREE.SpotLight(0xffffff, 70, 40, 0.6, 0.6, 1.5); key.position.set(3, 8, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; sc.add(key);
    const rimA = new THREE.PointLight(0xff2d55, 14, 20, 1.6); rimA.position.set(-5, 1.6, -3); sc.add(rimA);
    const rimB = new THREE.PointLight(0x29e3ff, 14, 20, 1.6); rimB.position.set(5, 1.6, -3); sc.add(rimB);
    sc.add(new THREE.HemisphereLight(0x8888aa, 0x111118, 0.4));
    this.yaw = 0.6; this.spin = 0.25; this.drag = null; this.pulseT = 0;
    const cv = $('gl');
    cv.addEventListener('pointerdown', (e) => { if (!this.active) return; this.drag = { x: e.clientX, yaw: this.yaw }; });
    window.addEventListener('pointermove', (e) => { if (this.drag) { this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.01; this.spin = 0; } });
    window.addEventListener('pointerup', () => { if (this.drag) { this.drag = null; this.spin = 0.15; } });
  },
  enter(id) { this.active = true; this.show(id); },
  exit() { this.active = false; this.clear(); },
  clear() {
    for (const m of [this.model, this.mirror]) if (m) { this.scene.remove(m); }
    if (this.model) this.model.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    this.model = this.mirror = null;
  },
  show(id) {
    this.clear();
    const cs = carState(id); const def = carById(id);
    this.model = buildCarModel(id, cs ? cs.paint : def.paint, cs ? cs.glow : 1);
    setWing(this.model, cs ? cs.up.grip : 0);
    this.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.model);
    this.mirror = this.model.clone(); this.mirror.scale.y = -1; this.scene.add(this.mirror);
    this.pulseT = 0.6;
  },
  paint() { this.show(UI.garageSel); },
  glow() { this.show(UI.garageSel); },
  pulse() { this.pulseT = 0.6; },
  update(dt, renderer) {
    this.yaw += this.spin * dt;
    if (this.debugCam) { const d = this.debugCam; this.camera.position.set(Math.cos(this.yaw) * d.r, d.h, Math.sin(this.yaw) * d.r); this.camera.lookAt(0, d.ly || 0.6, 0); return; }
    const narrow = innerWidth < 900;
    const aspect = innerWidth / innerHeight;
    const r = narrow ? (aspect < 0.8 ? 15 : 12.5) : 11.5, h = narrow ? 3.0 : 2.4;
    this.camera.position.set(Math.cos(this.yaw) * r, h, Math.sin(this.yaw) * r);
    this.camera.lookAt(0, narrow ? -0.6 : 0.45, 0);
    this.pulseT = Math.max(0, this.pulseT - dt);
    const s = 1 + this.pulseT * 3; this.ring.scale.set(s, 1, s); this.ring.material.color.setRGB(2.4 * (1 + this.pulseT * 2), 0.2, 0.45);
    if (this.model) {
      const u = this.model.userData;
      for (const w of u.wheels) if (w.front) w.steer.rotation.y = Math.sin(performance.now() / 1400) * 0.25;
      this.model.position.y = 0; this.mirror.position.y = 0;
    }
  },
};

export { SHOWROOM };
