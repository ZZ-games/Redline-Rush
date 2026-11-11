// The Game class: runs, physics step, chains, stunts, traffic, crashes, camera and HUD updates.
import * as THREE from 'three';
import { TAU, V3, clamp, damp, lerp, mulberry32, noise1, sstep } from './util.js';
import { SAVE, persist, todayKey } from './save.js';
import { CARS, DAILY_MODS, MODES, PAINTS, carById, carState, carStats, xpNeed } from './content.js';
import { LANES } from './textures.js';
import { BIOMES, GATE_SPACING } from './districts.js';
import { ORIGIN } from './world/world.js';
import { buildCarModel, setWing, sharedCarMaterials } from './cars.js';
import { TRAFFIC_COLORS, TRAFFIC_TYPES, buildTrafficGeos } from './traffic.js';
import { Particles, Skids, SpeedLines, Trail } from './fx.js';
import { AUDIO } from './audio.js';
import { INPUT } from './input.js';
import { checkAchievements } from './achievements.js';

/* ============================== game ============================== */
const CHAIN_TIME = 4.2;
const TIERS = [
  { k: 0, name: '', m: 1 }, { k: 200, name: 'FAST', m: 1.5 }, { k: 250, name: 'BLAZING', m: 2 }, { k: 300, name: 'HYPER', m: 3 },
  { k: 360, name: 'LIGHTSPEED', m: 4 }, { k: 440, name: 'LUDICROUS', m: 6 },
];
const PL = 4.5, PW = 1.95; // player collision box
const _F = {}, _F2 = {}, _v1 = V3(), _v2 = V3(), _v3 = V3(), _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _e1 = new THREE.Euler(), _col = new THREE.Color();

function roadBasis(F, heading, pitch, bank, R, U, Fw) {
  const cp = Math.cos(pitch);
  Fw.set(Math.cos(heading) * cp, Math.sin(pitch), Math.sin(heading) * cp);
  const R0 = _v3.set(-Math.sin(heading), 0, Math.cos(heading));
  const U0 = V3().crossVectors(R0, Fw).normalize();
  const cb = Math.cos(bank), sb = Math.sin(bank);
  R.copy(R0).multiplyScalar(cb).addScaledVector(U0, -sb);
  U.copy(U0).multiplyScalar(cb).addScaledVector(R0, sb);
}

class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // renderer, scene, camera, world, Q, post, ui
    this.state = 'boot';
    this.timeScale = 1; this.slowmo = []; this.acc = 0; this.realTime = 0;
    this.p = this.freshPlayer();
    this.traffic = []; this.wrecks = [];
    this.shakeAmp = 0; this.shakeT = 0; this.flash = 0; this.damage = 0;
    this.camYaw = 0; this.camOff = V3().set(0, 2, 7); this.camShot = 0; this.camShotT = 0; this.camMode = SAVE.settings.cam || 0;
    this.lookTarget = V3();
    // effects
    this.smoke = new Particles(this.scene, 900, false);
    this.sparks = new Particles(this.scene, 900, true);
    this.skids = new Skids(this.scene, 900);
    this.trails = [new Trail(this.scene), new Trail(this.scene)];
    this.speedLines = new SpeedLines(this.camera, 90);
    // contact shadow
    this.blobMat = new THREE.MeshBasicMaterial({ map: sharedCarMaterials().shadowTex, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4).rotateX(-Math.PI / 2), this.blobMat); this.blob.renderOrder = 1; this.scene.add(this.blob);
    // headlight
    this.head = new THREE.SpotLight(0xdde6ff, 0, 140, 0.52, 0.55, 1.6); this.head.castShadow = false;
    this.headTarget = new THREE.Object3D(); this.scene.add(this.head); this.scene.add(this.headTarget); this.head.target = this.headTarget;
    this.buildTrafficMeshes();
    this.model = null; this.setCar(SAVE.car);
  }
  freshPlayer() {
    return { s: 30, x: LANES[2], yaw: 0, v: 0, slip: 0, steer: 0, y: 0, vy: 0, air: false, airTime: 0, drifting: false, driftDir: 0, driftTime: 0, driftPts: 0,
      boost: 0.5, boosting: false, od: 0, odCharges: 0, odArmed: true, ghost: 0, crash: null, scrape: 0, draftT: 0, padT: 0, wheelSpin: 0, prevS: 30, gear: 1, rpm: 0,
      shield: false, lastBoost: false, throttle: 0, accelVis: 0, pitchVis: 0, launchY: 0 };
  }
  setCar(id) {
    if (this.model) { this.scene.remove(this.model); this.model.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
    const cs = carState(id) || { paint: carById(id).paint, glow: 1, up: { grip: 0 } };
    this.model = buildCarModel(id, cs.paint, cs.glow);
    setWing(this.model, cs.up.grip || 0);
    this.model.add(this.head); this.head.position.set(0, 0.8, -1.8);
    this.scene.add(this.model);
    this.stats = carStats(id);
    const st = this.model.userData.st;
    this.tailLocal = [V3().set(-st.L / 2 - 0.02, st.tail - 0.12, -st.W * 0.36), V3().set(-st.L / 2 - 0.02, st.tail - 0.12, st.W * 0.36)];
    this.rearLocal = [V3().set(st.rx, 0.05, -st.W / 2 + 0.2), V3().set(st.rx, 0.05, st.W / 2 - 0.2)];
    this.exhLocal = (this.model.userData.flames || []).map((f) => f.position.clone().add(V3().set(-0.1, 0, 0)));
  }
  buildTrafficMeshes() {
    this.tMeshes = TRAFFIC_TYPES.map((T) => {
      const g = buildTrafficGeos(T), N = 14;
      const paint = new THREE.InstancedMesh(g.paint, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 }), N);
      const dark = new THREE.InstancedMesh(g.dark, new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.7, roughness: 0.2 }), N);
      const lights = new THREE.InstancedMesh(g.lights, new THREE.MeshBasicMaterial({ vertexColors: true }), N);
      for (const m of [paint, dark, lights]) { m.frustumCulled = false; m.castShadow = this.Q.shadows > 0; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); }
      lights.castShadow = false;
      for (let i = 0; i < N; i++) paint.setColorAt(i, _col.set(0xffffff));
      return { T, paint, dark, lights, N };
    });
    // golden car
    const gg = buildTrafficGeos(TRAFFIC_TYPES[0]);
    this.goldMat = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 1, roughness: 0.16, emissive: 0x6a3a00, emissiveIntensity: 0.6 });
    this.gold = new THREE.Group();
    this.gold.add(new THREE.Mesh(gg.paint, this.goldMat), new THREE.Mesh(gg.dark, new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.7, roughness: 0.2 })), new THREE.Mesh(gg.lights, new THREE.MeshBasicMaterial({ vertexColors: true })));
    this.gold.visible = false; this.gold.traverse((o) => { o.castShadow = true; o.frustumCulled = false; }); this.scene.add(this.gold);
  }

  /* ---------------- runs ---------------- */
  trackOptsFor(mode, seed) {
    if (mode === 'drift') return { seed, start: 2, curvMul: 2.3, jumpMul: 0.2, padMul: 0.6 };
    if (mode === 'daily') { const r = mulberry32(seed); return { seed, start: Math.floor(r() * 5), curvMul: 1.0 + r() * 0.3, jumpMul: this.mod === 'lowg' ? 1.6 : 1, padMul: 1 }; }
    if (mode === 'attract') return { seed, start: 0, curvMul: 0.8, jumpMul: 0, padMul: 0 };
    return { seed, start: 0, curvMul: 1, jumpMul: 1, padMul: 1 };
  }
  setupWorld(mode, seed) {
    this.world.reset(this.trackOptsFor(mode, seed));
    ORIGIN.x = 0; ORIGIN.z = 0;
    this.traffic.length = 0; this.wrecks.length = 0;
    this.smoke.clear(); this.sparks.clear(); this.skids.clear(); this.trails.forEach((t) => t.clear());
    // build the first chunks synchronously
    for (let i = 0; i < 12; i++) this.world.stream(this.p.s, 3);
  }
  startAttract() {
    this.state = 'attract'; this.mode = 'attract'; this.mod = null;
    this.p = this.freshPlayer(); this.p.v = 52; this.p.s = 120;
    this.setupWorld('attract', 1 + Math.floor(Math.random() * 1000));
    this.spawnInitialTraffic(0.75);
    this.camShot = 0; this.camShotT = 0;
    AUDIO.setIntensity(1.5);
  }
  startRun(mode) {
    this.mode = mode; this.modeDef = MODES[mode];
    const seed = mode === 'daily' ? parseInt(todayKey().replace(/-/g, ''), 10) : 1 + Math.floor(Math.random() * 1e6);
    this.mod = null;
    if (mode === 'daily') this.mod = DAILY_MODS[mulberry32(seed + 3)() * DAILY_MODS.length | 0].id;
    this.stats = carStats(SAVE.car);
    if (this.mod === 'hyper') this.stats.top *= 1.15;
    this.p = this.freshPlayer();
    this.p.shield = this.stats.armor >= 5;
    this.setupWorld(mode, seed);
    this.spawnInitialTraffic(mode === 'free' ? 0.6 : 1);
    this.run = { score: 0, time: this.modeDef.time, dist: 0, gates: 0, districts: new Set([this.world.track.biomeAt(0).a]), nearMiss: 0, razor: 0, takedowns: 0,
      driftDist: 0, maxMult: 1, bestChain: 0, topKmh: 0, airMax: 0, driftMax: 0, od: 0, jackpots: 0, crashes: 0, tier: 0, ending: 0, warnT: 0, banked: 0 };
    this.chain = { mult: 1, pts: 0, timer: 0 };
    this.ptsMul = this.mod === 'rush' ? 1.5 : 1;
    this.state = 'countdown'; this.countT = 3.2; this.countShown = 4; this.perfectWindow = false;
    this.camYaw = this.world.track.th[0]; this.camOff.set(0, 2.2, 8);
    this.ui.onRunStart(this);
    AUDIO.setIntensity(1);
  }
  endRun(reason) {
    if (this.state !== 'race') return;
    this.bankChain(true);
    this.state = 'finish'; this.finishT = 1.6; this.finishReason = reason;
    this.addSlowmo(0.35, 1.2);
    this.ui.big(reason, 'red');
    AUDIO.setIntensity(1);
  }
  finalize() {
    const R = this.run, S = SAVE.stats;
    const distKm = R.dist / 1000;
    const cash = Math.round(R.score / 40 + R.gates * 150 + distKm * 60);
    const xp = Math.round(R.score / 18 + distKm * 140 + R.gates * 80);
    S.runs++; S.dist += R.dist; S.nearMiss += R.nearMiss; S.razor += R.razor; S.driftDist += R.driftDist; S.takedowns += R.takedowns;
    S.topKmh = Math.max(S.topKmh, R.topKmh); S.maxMult = Math.max(S.maxMult, R.maxMult); S.od += R.od; S.jackpots += R.jackpots;
    S.bestChain = Math.max(S.bestChain, R.bestChain); S.airMax = Math.max(S.airMax, R.airMax); S.driftMax = Math.max(S.driftMax, R.driftMax);
    S.bestScore = Math.max(S.bestScore, R.score); S.districts = Math.max(S.districts, R.districts.size);
    let best = false;
    if (this.mode === 'daily') {
      const tk = todayKey();
      if (SAVE.daily.date !== tk) { SAVE.daily = { date: tk, best: 0 }; }
      if (R.score > SAVE.daily.best) { SAVE.daily.best = R.score; best = true; }
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yk = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      if (SAVE.streak.last !== tk) { SAVE.streak.days = SAVE.streak.last === yk ? SAVE.streak.days + 1 : 1; SAVE.streak.last = tk; }
    } else if (R.score > (SAVE.best[this.mode] || 0)) { SAVE.best[this.mode] = Math.round(R.score); best = true; }
    const before = { level: SAVE.level, xp: SAVE.xp, cash: SAVE.cash };
    SAVE.cash += cash;
    const levels = this.addXP(xp);
    const ach = checkAchievements(R);
    persist();
    return { cash, xp, levels, best, ach, before, distKm, reason: this.finishReason };
  }
  addXP(xp) {
    SAVE.xp += xp; const gained = [];
    while (SAVE.level < 100 && SAVE.xp >= xpNeed(SAVE.level)) {
      SAVE.xp -= xpNeed(SAVE.level); SAVE.level++;
      const reward = { level: SAVE.level, cash: 250 * SAVE.level, items: [] };
      SAVE.cash += reward.cash;
      PAINTS.forEach((p, i) => { if (p.lvl === SAVE.level && !SAVE.paints.includes(i)) { SAVE.paints.push(i); reward.items.push(`Paint: ${p.name}`); } });
      CARS.forEach((c) => { if (c.level === SAVE.level) reward.items.push(`Car unlocked: ${c.name}`); });
      Object.values(MODES).forEach((m) => { if (m.lvl === SAVE.level) reward.items.push(`Mode unlocked: ${m.name}`); });
      if (SAVE.level % 3 === 0) { SAVE.crates++; reward.items.push('Mystery crate'); }
      gained.push(reward);
    }
    return gained;
  }

  /* ---------------- traffic ---------------- */
  spawnInitialTraffic(mul) {
    for (let s = this.p.s + 70; s < this.p.s + 900; s += 22 + Math.random() * 40) { if (Math.random() < 0.55 * mul) this.spawnCar(s); }
  }
  targetTraffic() {
    const base = this.mode === 'attract' ? 12 : this.mode === 'free' ? 11 : this.mode === 'drift' ? 7 : 13;
    const prog = this.run ? Math.min(14, (this.run.dist / 1000) * 1.6) : 0;
    const bio = this.world.params.traffic || 1;
    return Math.min(this.Q.traffic, Math.round((base + prog) * bio * (this.mod === 'rush' ? 1.6 : 1)));
  }
  spawnCar(s) {
    let ti = 0; const r = Math.random() * 18; let acc = 0;
    for (let i = 0; i < TRAFFIC_TYPES.length; i++) { acc += TRAFFIC_TYPES[i].w; if (r < acc) { ti = i; break; } }
    const T = TRAFFIC_TYPES[ti];
    const used = this.traffic.filter((c) => c.type === ti && !c.gold).length;
    if (used >= this.tMeshes[ti].N) return false;
    const lane = Math.floor(Math.random() * 4);
    for (const c of this.traffic) if (c.lane === lane && Math.abs(c.s - s) < 26 + (c.T.L + T.L)) return false;
    const goldChance = this.mod === 'gold' ? 0.08 : 0.012;
    const gold = !this.gold.userData.active && this.mode !== 'attract' && Math.random() < goldChance && ti === 0;
    if (gold) this.gold.userData.active = true;
    const v = (T.truck ? 19 : 22) + Math.random() * (T.truck ? 6 : 15);
    this.traffic.push({ type: ti, T, lane, s, x: LANES[lane], v, vT: v, color: TRAFFIC_COLORS[(Math.random() * TRAFFIC_COLORS.length) | 0], passed: false, gold, lcT: 3 + Math.random() * 10, yawV: 0 });
    return true;
  }
  updateTraffic(dt) {
    const P = this.p, need = this.targetTraffic();
    let tries = 0;
    while (this.traffic.length < need && tries++ < 3) this.spawnCar(P.s + Math.min(this.Q.draw * 0.75, 650) + Math.random() * 250);
    const od = P.od > 0;
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const c = this.traffic[i];
      // follow / lane change
      let ahead = null, gap = 1e9;
      for (const o of this.traffic) { if (o === c || o.lane !== c.lane) continue; const d = o.s - c.s; if (d > 0 && d < gap) { gap = d; ahead = o; } }
      let vT = c.vT * (od ? 0.55 : 1);
      if (ahead && gap < 34) vT = Math.min(vT, ahead.v - (34 - gap) * 0.25);
      c.v = damp(c.v, Math.max(8, vT), 1.5, dt);
      c.lcT -= dt;
      if (c.lcT < 0) {
        c.lcT = 4 + Math.random() * 10;
        const nl = c.lane + (Math.random() < 0.5 ? -1 : 1);
        if (nl >= 0 && nl < 4 && Math.abs(P.s - c.s) > 30 && !this.traffic.some((o) => o !== c && o.lane === nl && Math.abs(o.s - c.s) < 28)) c.lane = nl;
      }
      const tx = LANES[c.lane], ox = c.x;
      c.x = damp(c.x, tx, 1.1, dt);
      c.yawV = (c.x - ox) / Math.max(1, c.v * dt) ;
      c.s += c.v * dt;
      if (c.s < P.s - 90 || c.s > P.s + 1700) { if (c.gold) { this.gold.userData.active = false; } this.traffic.splice(i, 1); }
    }
  }
  wreckCar(c, impulseV, side) {
    this.traffic.splice(this.traffic.indexOf(c), 1);
    if (c.gold) this.gold.userData.active = false;
    this.wrecks.push({ type: c.type, T: c.T, s: c.s, x: c.x, h: 0, vs: impulseV * 0.85, vx: side * (6 + Math.random() * 8), vh: 7 + Math.random() * 6, q: new THREE.Quaternion(), w: V3().set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 9), t: 3.5, color: c.color, gold: c.gold });
  }
  updateWrecks(dt) {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t -= dt; if (w.t <= 0) { this.wrecks.splice(i, 1); continue; }
      w.vh -= 18 * dt; w.s += w.vs * dt; w.x += w.vx * dt; w.h += w.vh * dt;
      if (w.h < 0) { w.h = 0; w.vh = Math.abs(w.vh) * 0.32; w.vs *= 0.75; w.vx *= 0.7; w.w.multiplyScalar(0.7); }
      if (Math.abs(w.x) > 9) { w.x = Math.sign(w.x) * 9; w.vx *= -0.4; }
      w.vs *= Math.exp(-0.4 * dt);
      _q1.setFromAxisAngle(_v1.copy(w.w).normalize(), w.w.length() * dt); w.q.premultiply(_q1);
    }
  }

  /* ---------------- scoring ---------------- */
  stunt(label, base, color, bump = true) {
    if (!this.run) return 0;
    const mult = this.chain.mult;
    const pts = Math.round(base * mult * this.ptsMul);
    this.chain.pts += pts; this.chain.timer = CHAIN_TIME;
    if (bump) this.chain.mult = Math.min(10, mult + 1);
    this.run.maxMult = Math.max(this.run.maxMult, this.chain.mult);
    if (this.chain.mult === 5 && mult === 4) { this.ui.big('x5 CHAIN', 'cyan'); }
    if (this.chain.mult === 10 && mult === 9) { this.ui.big('MAX CHAIN x10', 'gold'); AUDIO.levelUp(); }
    this.ui.pop(label, pts, color);
    return pts;
  }
  bankChain(silent) {
    if (!this.run || this.chain.pts <= 0) { this.chain.mult = 1; this.chain.pts = 0; return; }
    const pts = Math.round(this.chain.pts);
    this.run.score += pts; this.run.banked += pts; this.run.bestChain = Math.max(this.run.bestChain, pts);
    if (!silent) { this.ui.pop('BANKED', pts, 'gold'); AUDIO.bank(); }
    this.chain.mult = 1; this.chain.pts = 0; this.chain.timer = 0;
  }
  loseChain() {
    if (this.chain.pts > 0) { this.ui.pop('CHAIN LOST', -Math.round(this.chain.pts), 'red'); AUDIO.chainLost(); }
    this.chain.mult = 1; this.chain.pts = 0; this.chain.timer = 0; this.p.odCharges = 0;
  }
  addBoost(a) { const P = this.p; P.boost = Math.min(1, P.boost + a * (this.mod === 'boost2' ? 2 : 1)); }
  addSlowmo(scale, dur) { if (SAVE.settings.calm && scale < 0.6 && dur < 0.5) return; this.slowmo.push({ scale, t: dur }); }
  shake(a) { if (SAVE.settings.shake) this.shakeAmp = Math.max(this.shakeAmp, a); }

  /* ---------------- player ---------------- */
  autopilot() {
    const P = this.p;
    // choose the lane with the most free road ahead
    let best = 0, bestGap = -1;
    for (let l = 0; l < 4; l++) {
      let gap = 400;
      for (const c of this.traffic) { if (Math.abs(c.x - LANES[l]) < 2.4) { const d = c.s - P.s; if (d > -6 && d < gap) gap = d; } }
      const bias = -Math.abs(LANES[l] - P.x) * 3;
      if (gap + bias > bestGap) { bestGap = gap + bias; best = l; }
    }
    this.apLane = best;
    const target = LANES[best];
    const T = this.world.track; T.frame(P.s + 25, _F2);
    const steer = clamp((target - P.x) * 0.12 - P.yaw * 2.4 + _F2.k * 140, -1, 1);
    return { steer, gas: P.v < 58 ? 1 : 0.35, brake: 0, drift: 0, boost: 0 };
  }
  step(h) {
    const P = this.p, T = this.world.track, st = this.stats;
    const auto = this.state === 'attract' || this.state === 'results' || this.state === 'finish';
    const inp = auto ? this.autopilot() : INPUT;
    const racing = this.state === 'race';
    const counting = this.state === 'countdown';
    if (P.crash) { this.stepCrash(h); this.updateTraffic(h); this.updateWrecks(h); return; }
    P.prevS = P.s;
    // ---- steering & throttle ----
    P.steer = damp(P.steer, inp.steer, inp.steer === 0 ? 9 : 6.5, h);
    let gas = counting ? 0 : inp.gas;
    P.throttle = damp(P.throttle, counting ? inp.gas : gas, 8, h);
    const od = P.od > 0;
    const boostHeld = racing && inp.boost;
    if (racing && boostHeld && !P.lastBoost && P.odCharges >= 3) this.triggerOverdrive();
    P.lastBoost = boostHeld;
    P.boosting = (boostHeld && P.boost > 0.005) || P.padT > 0 || od;
    let top = st.top;
    if (od) top = Math.max(top * 1.25, 139); else if (P.boosting) top *= 1.2 * st.boostPow;
    if (P.draftT > 0.8) top *= 1.04;
    const accel = st.accel * (P.boosting ? 1.7 : 1) * (od ? 1.8 : 1);
    const vPrev = P.v;
    if (!P.air) {
      if (gas > 0.05 || P.boosting) { const f = 1 - Math.pow(clamp(P.v / top, 0, 1.3), 2.4); P.v += accel * Math.max(gas, P.boosting ? 1 : 0) * f * h; }
      else P.v -= (2.5 + P.v * 0.018) * h;
      if (inp.brake) P.v -= 34 * h;
      if (P.v > top) P.v = damp(P.v, top, 0.8, h);
    }
    P.v = Math.max(0, P.v);
    P.accelVis = damp(P.accelVis, (P.v - vPrev) / h, 6, h);
    // boost meter
    if (P.boosting && !od && P.padT <= 0) P.boost = Math.max(0, P.boost - h / st.boostCap);
    if (P.padT > 0) P.padT -= h;
    if (st.regen && !P.boosting) P.boost = Math.min(1, P.boost + h * 0.025);
    if (P.boosting && !this._wasBoosting && !od) { AUDIO.boostOn(); this.shake(0.12); }
    this._wasBoosting = P.boosting;
    if (od) { P.od -= h; P.boost = 1; if (P.od <= 0) { this.ui.big('OVERDRIVE OVER', 'cyan'); P.boost = 0.4; } }
    // overdrive charge: a full tank while a chain is alive
    if (racing && !od) {
      if (P.boost >= 0.999 && P.odArmed && this.chain.mult >= 2 && P.odCharges < 3) { P.odCharges++; P.odArmed = false; this.ui.odCharge(P.odCharges); if (P.odCharges === 3) { this.ui.big('OVERDRIVE READY', 'magenta'); AUDIO.levelUp(); } }
      if (P.boost < 0.85) P.odArmed = true;
    }
    // ---- drift ----
    const ice = this.mod === 'ice';
    const wantDrift = inp.drift && Math.abs(P.steer) > 0.22 && P.v > 15 && !P.air && !counting;
    if (wantDrift && !P.drifting) { P.drifting = true; P.driftDir = Math.sign(P.steer); P.driftTime = 0; P.driftPts = 0; }
    if (P.drifting && (!inp.drift || P.v < 11 || P.air)) this.endDrift(true);
    let slipT = P.drifting ? clamp(P.driftDir * (0.34 + 0.3 * Math.abs(P.steer)) * st.drift * (ice ? 1.25 : 1) + P.steer * 0.1, -0.85, 0.85) : P.steer * 0.07 * clamp(P.v / 60, 0, 1);
    P.slip = damp(P.slip, slipT, P.drifting ? 4.5 : 7, h);
    const sf = clamp(P.v / 9, 0, 1) / (1 + P.v / 85);
    let yawRate = P.steer * st.handling * sf * (ice ? 0.8 : 1);
    if (P.drifting) yawRate = (P.driftDir * 0.36 + P.steer * 0.56) * st.handling * sf * st.drift;
    if (P.air) yawRate *= 0.12;
    P.yaw += yawRate * h;
    const assist = (auto ? 0.9 : SAVE.settings.assist) * (P.drifting ? 0.25 : 1) * (Math.abs(inp.steer) < 0.05 ? 1 : 0.3);
    P.yaw -= P.yaw * assist * 2.4 * h;
    P.yaw = clamp(P.yaw, -1.2, 1.2);
    if (P.drifting) {
      P.v -= P.v * 0.03 * h; P.driftTime += h;
      const pm = (this.mode === 'drift' ? 3 : 1) * (carById(SAVE.car).cls === 'Drift' ? 1.3 : 1);
      P.driftPts += h * 260 * (Math.abs(P.slip) / 0.5) * clamp(P.v / 40, 0.5, 2.2) * pm;
      if (racing) { this.addBoost(h * 0.16); this.chain.timer = Math.max(this.chain.timer, 1.4); this.run.driftDist += P.v * h; this.run.driftMax = Math.max(this.run.driftMax, P.driftTime); }
    }
    // ---- move along the road ----
    T.frame(P.s, _F);
    const ds = P.v * Math.cos(P.yaw) * h, dx = P.v * Math.sin(P.yaw) * h;
    P.s += ds; P.x += dx; P.yaw -= _F.k * ds;
    if (racing) this.run.dist += Math.max(0, ds);
    // ---- walls ----
    const lim = 8.7;
    P.scrape = Math.max(0, P.scrape - h);
    if (Math.abs(P.x) > lim) {
      const side = Math.sign(P.x); P.x = side * lim;
      const into = P.yaw * side;
      if (into > 0) {
        if (into > 0.55 && P.v > 32 && P.ghost <= 0 && !od && racing) { this.crash('wall'); return; }
        P.v *= 1 - clamp(into * 0.7, 0.02, 0.4); P.yaw = -side * Math.min(0.04, into * 0.3);
      }
      P.scrape = 0.12; this.shake(0.08);
      if (P.drifting) this.endDrift(false);
      if (Math.random() < 0.9) this.emitSparks(side, 3);
    }
    // ---- vertical ----
    T.frame(P.s, _F2);
    const roadY = _F2.y - Math.sin(_F2.bank) * P.x;
    const g = 9.8 * (this.mod === 'lowg' ? 0.55 : 1.3);
    if (P.air) {
      P.vy -= g * h; P.y += P.vy * h; P.airTime += h;
      if (P.y <= roadY) this.land(roadY, _F2.slope);
    } else {
      // keep last step's vertical motion; if the road drops away faster than gravity can follow, we fly
      const ballY = P.y + P.vy * h - 0.5 * g * h * h;
      if (ballY > roadY + 0.03 && P.v > 18 && P.vy > -2) { P.air = true; P.y = ballY; P.vy -= g * h; P.airTime = 0; P.launchY = roadY; if (P.drifting) this.endDrift(true); }
      else { P.vy = P.v * _F2.slope; P.y = roadY; }
    }
    if (P.ghost > 0) P.ghost -= h;
    if (!racing) { this.updateTraffic(h); this.updateWrecks(h); return; }
    // ---- pads & gates ----
    for (const pd of T.pads(P.prevS, P.s)) {
      if (Math.abs(P.x - LANES[pd.lane]) < 2.1) { this.addBoost(0.3); P.v += 9; P.padT = 1.3; AUDIO.pad(); this.stunt('BOOST PAD', 250, 'cyan'); this.shake(0.2); this.flash = 0.15; }
    }
    const gPrev = Math.floor(P.prevS / GATE_SPACING), gNow = Math.floor(P.s / GATE_SPACING);
    if (gNow > gPrev && gNow >= 1) this.passGate(gNow);
    // ---- traffic interaction ----
    this.updateTraffic(h);
    this.updateWrecks(h);
    this.trafficContacts(h);
    // ---- chain & score ----
    if (this.chain.pts > 0) { this.chain.timer -= h; if (this.chain.timer <= 0) this.bankChain(false); }
    const kmh = P.v * 3.6;
    let tier = 0; for (let i = TIERS.length - 1; i >= 0; i--) if (kmh >= TIERS[i].k) { tier = i; break; }
    if (tier > this.run.tier && tier >= 2) { this.ui.tier(TIERS[tier].name); AUDIO.levelUp(); this.shake(0.15); }
    this.run.tier = tier;
    if (kmh > 180) this.run.score += (kmh - 180) * 0.55 * TIERS[tier].m * h * this.ptsMul;
    this.run.topKmh = Math.max(this.run.topKmh, kmh);
    // ---- clock ----
    if (this.modeDef.time) {
      this.run.time -= h;
      if (this.run.time <= 10 && Math.floor(this.run.time) !== Math.floor(this.run.time + h) && this.run.time > 0) AUDIO.countdown(false);
      if (this.run.time <= 0) { this.run.time = 0; this.endRun(this.mode === 'drift' ? 'FINISH' : 'TIME UP'); }
    }
  }
  endDrift(award) {
    const P = this.p; if (!P.drifting) return;
    P.drifting = false;
    if (award && P.driftTime > 0.7 && this.run && this.state === 'race') {
      const label = P.driftTime > 4 ? 'MEGA DRIFT' : P.driftTime > 2.2 ? 'GREAT DRIFT' : 'DRIFT';
      this.stunt(`${label} ${P.driftTime.toFixed(1)}s`, P.driftPts, 'magenta');
      this.addBoost(0.12); P.v += 4 + P.driftTime * 2; // mini-turbo out of the drift
      if (P.driftTime > 1.5) { P.padT = Math.max(P.padT, 0.45); }
    }
    P.driftPts = 0; P.driftTime = 0;
  }
  land(roadY, slope) {
    const P = this.p;
    const impact = P.vy - P.v * slope;
    P.air = false; P.y = roadY; P.vy = P.v * slope;
    if (impact < -5) { this.shake(clamp(-impact * 0.03, 0.1, 0.5)); AUDIO.land(-impact / 20); for (let i = 0; i < 18; i++) this.emitSparks(i % 2 ? 1 : -1, 1, true); }
    if (this.run && this.state === 'race' && P.airTime > 0.45) {
      const lbl = P.airTime > 2 ? 'HUGE AIR' : P.airTime > 1.2 ? 'BIG AIR' : 'AIR';
      this.stunt(`${lbl} ${P.airTime.toFixed(1)}s`, 450 * P.airTime * (this.mod === 'lowg' ? 2 : 1), 'cyan');
      this.addBoost(0.12 * P.airTime);
      this.run.airMax = Math.max(this.run.airMax, P.airTime);
    }
    P.airTime = 0;
  }
  passGate(n) {
    const T = this.world.track; const gs = n * GATE_SPACING;
    const isDistrict = gs % T.dlen === 0;
    this.run.gates++;
    if (this.modeDef.time && this.mode !== 'drift') {
      const bonus = Math.max(9, 24 - this.run.gates * 1.2);
      this.run.time += bonus;
      this.ui.big(isDistrict ? BIOMES[T.biomeAt(gs + 1).a].name : 'CHECKPOINT', isDistrict ? 'district' : 'red', `+${bonus.toFixed(1)} SEC`);
    } else this.ui.big(isDistrict ? BIOMES[T.biomeAt(gs + 1).a].name : 'CHECKPOINT', isDistrict ? 'district' : 'red', isDistrict ? BIOMES[T.biomeAt(gs + 1).a].tag : '');
    if (isDistrict) this.run.districts.add(T.biomeAt(gs + 1).a);
    this.addBoost(0.25);
    AUDIO.checkpoint(); this.flash = 0.25;
    this.stunt('CHECKPOINT', 1000, 'gold', false);
  }
  trafficContacts(h) {
    const P = this.p, od = P.od > 0;
    for (const c of [...this.traffic]) {
      const ds = c.s - P.s, dx = c.x - P.x;
      const halfL = (c.T.L + PL) / 2, halfW = (c.T.W + PW) / 2;
      if (Math.abs(ds) < halfL * 0.92 && Math.abs(dx) < halfW * 0.86) {
        if (c.gold) { this.jackpot(c); continue; }
        if (od) { this.takedown(c); continue; }
        if (P.ghost > 0) continue;
        if (P.shield) { P.shield = false; P.ghost = 1.6; P.v *= 0.8; this.wreckCar(c, P.v, Math.sign(dx) || 1); this.ui.big('SHIELD BROKEN', 'cyan'); AUDIO.crashSmall(); this.shake(0.5); continue; }
        this.crash('traffic', c); return;
      }
      // draft
      if (ds > 4 && ds < 22 && Math.abs(dx) < 1.5) { P.draftT += h; if (P.draftT > 0.8) this.addBoost(h * 0.07); }
      // near miss: we just passed it
      if (!c.passed && ds < -halfL * 0.2 && ds > -halfL - 3) {
        c.passed = true;
        const gap = Math.abs(dx) - halfW;
        const rel = P.v - c.v;
        if (gap < 1.8 && rel > 6 && P.v > 24) {
          const razor = gap < 0.6;
          this.run.nearMiss++; if (razor) this.run.razor++;
          this.stunt(razor ? 'RAZOR MISS' : 'NEAR MISS', razor ? 1000 : 450, razor ? 'gold' : 'white');
          this.addBoost(razor ? 0.22 : 0.12);
          AUDIO.nearMiss(Math.sign(dx), razor); this.shake(razor ? 0.12 : 0.05);
          if (razor) this.addSlowmo(0.45, 0.22);
          if (P.draftT > 0.8) this.stunt('SLINGSHOT', 600, 'cyan');
        }
        P.draftT = 0;
      }
    }
  }
  takedown(c) {
    const P = this.p; this.wreckCar(c, P.v * 0.9, Math.sign(c.x - P.x) || 1);
    this.run.takedowns++; this.stunt('TAKEDOWN', 2000, 'red'); this.addSlowmo(0.4, 0.25);
    AUDIO.takedown(); this.shake(0.35); for (let i = 0; i < 26; i++) this.emitSparks(0, 1, true);
  }
  jackpot(c) {
    const P = this.p; this.wreckCar(c, P.v * 0.9, Math.sign(c.x - P.x) || 1);
    this.run.jackpots++; SAVE.cash += 1500;
    this.stunt('JACKPOT', 25000, 'gold'); this.ui.big('JACKPOT  +$1,500', 'gold'); this.addSlowmo(0.35, 0.4);
    AUDIO.takedown(); AUDIO.levelUp(); this.flash = 0.35;
    for (let i = 0; i < 70; i++) { const a = Math.random() * TAU; this.sparks.emit(this.carPos.x, this.carPos.y + 1, this.carPos.z, Math.cos(a) * 9, 4 + Math.random() * 9, Math.sin(a) * 9, 1.4, 0.5, 0, 3.5, 2.4, 0.4, 1, 0.8, 9); }
  }
  triggerOverdrive() {
    const P = this.p; P.od = 8; P.odCharges = 0; this.run.od++;
    this.ui.big('OVERDRIVE', 'magenta', 'SMASH EVERYTHING');
    AUDIO.overdrive(); this.shake(0.4); this.flash = 0.4; this.addSlowmo(0.3, 0.35);
    this.ui.odCharge(0);
  }
  crash(kind, car) {
    const P = this.p;
    if (P.drifting) { P.drifting = false; P.driftPts = 0; }
    this.loseChain();
    this.run.crashes++;
    const pen = Math.max(1, 4 - this.stats.armor * 0.6);
    if (this.modeDef.time && this.mode !== 'drift') { this.run.time = Math.max(0, this.run.time - pen); }
    if (car) this.wreckCar(car, P.v * 0.6, Math.sign(car.x - P.x) || 1);
    T_ = this.world.track; T_.frame(P.s, _F);
    const heading = _F.th + P.yaw + P.slip;
    P.crash = { t: 1.7, s: P.s, x: P.x, h: 0.0, vs: P.v * 0.55, vx: Math.sin(P.yaw) * P.v * 0.4 + (Math.random() - 0.5) * 10, vh: 6 + P.v * 0.06, q: new THREE.Quaternion(), w: V3().set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7), vBefore: P.v, heading };
    P.v = 0;
    this.addSlowmo(0.3, 1.0);
    this.damage = 1; this.shake(0.9); this.flash = 0.3;
    AUDIO.crash();
    this.ui.big('WRECKED', 'red', this.modeDef.time && this.mode !== 'drift' ? `-${pen.toFixed(1)} SEC` : '');
    for (let i = 0; i < 40; i++) this.emitSparks(0, 1, true);
    for (let i = 0; i < 20; i++) this.smoke.emit(this.carPos.x + (Math.random() - 0.5) * 2, this.carPos.y + 0.5, this.carPos.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 2.2, 1.5, 3, 0.18, 0.17, 0.18, 0.7, 1.2, -0.5);
  }
  stepCrash(h) {
    const P = this.p, C = P.crash;
    C.t -= h;
    C.vh -= 16 * h; C.s += C.vs * h; C.x += C.vx * h; C.h += C.vh * h;
    if (C.h < 0) { C.h = 0; C.vh = Math.abs(C.vh) * 0.3; C.vs *= 0.7; C.vx *= 0.6; C.w.multiplyScalar(0.6); }
    if (Math.abs(C.x) > 8.8) { C.x = Math.sign(C.x) * 8.8; C.vx *= -0.3; }
    _q1.setFromAxisAngle(_v1.copy(C.w).normalize(), C.w.length() * h); C.q.premultiply(_q1);
    if (C.t <= 0) this.respawn();
  }
  respawn() {
    const P = this.p, C = P.crash;
    P.s = C.s + 4;
    let best = LANES[0], bd = 1e9;
    for (const L of LANES) {
      const blocked = this.traffic.some((c) => Math.abs(c.x - L) < 2.6 && c.s > P.s - 12 && c.s < P.s + 70);
      const d = Math.abs(L - C.x) + (blocked ? 100 : 0);
      if (d < bd) { bd = d; best = L; }
    }
    P.x = best; P.yaw = 0; P.slip = 0; P.air = false; P.vy = 0; P.airTime = 0;
    P.v = Math.max(42, C.vBefore * (0.62 + this.stats.armor * 0.05));
    P.ghost = 2.2; P.crash = null; this.damage = 0.6;
    this.world.track.frame(P.s, _F); P.y = _F.y;
  }
  emitSparks(side, n, burst) {
    const cp = this.carPos; if (!cp) return;
    const T = this.world.track; T.frame(this.p.s, _F);
    for (let i = 0; i < n; i++) {
      const lat = side * PW * 0.5;
      const x = cp.x + _F.rx * lat + (Math.random() - 0.5) * (burst ? 2 : 0.6), z = cp.z + _F.rz * lat + (Math.random() - 0.5) * (burst ? 3 : 1.4);
      const vb = -this.p.v * (0.3 + Math.random() * 0.4);
      const a = Math.random() * TAU, sp = burst ? 4 + Math.random() * 10 : 2 + Math.random() * 5;
      this.sparks.emit(x, cp.y + 0.3, z, _F.tx * vb + Math.cos(a) * sp, 1 + Math.random() * (burst ? 7 : 3), _F.tz * vb + Math.sin(a) * sp, 0.3 + Math.random() * 0.5, 0.09 + Math.random() * 0.07, -0.05, 4, 1.8 + Math.random(), 0.5, 1, 1.5, 14);
    }
  }

  /* ---------------- per-frame ---------------- */
  frame(dtReal) {
    this.realTime += dtReal;
    // slow motion stack
    let ts = 1;
    for (let i = this.slowmo.length - 1; i >= 0; i--) { const s = this.slowmo[i]; s.t -= dtReal; if (s.t <= 0) this.slowmo.splice(i, 1); else ts = Math.min(ts, s.scale); }
    this.timeScale = damp(this.timeScale, ts, 14, dtReal);
    const dt = Math.min(dtReal, 0.05) * this.timeScale;
    if (this.state === 'paused' || this.state === 'garage' || this.state === 'boot') { this.renderVisuals(0, dtReal); return; }
    if (this.state === 'countdown') {
      this.countT -= dtReal;
      this.perfectHold = INPUT.gas ? (this.perfectHold || 0) + dtReal : 0;
      const n = Math.ceil(this.countT - 0.2);
      if (n !== this.countShown && n >= 0) { this.countShown = n; if (n > 0 && n <= 3) { this.ui.count(String(n)); AUDIO.countdown(false); } }
      this.perfectWindow = this.countT < 0.45 && this.countT > 0.05;
      if (this.countT <= 0.2) {
        this.state = 'race'; this.ui.count('GO'); AUDIO.countdown(true); AUDIO.setIntensity(2);
        const hold = this.perfectHold || 0;
        if (INPUT.gas && hold > 0 && hold < 0.65) { this.p.v = 30; this.addBoost(0.5); this.p.padT = 0.8; this.ui.big('PERFECT START', 'gold'); AUDIO.boostOn(); }
        else if (INPUT.gas) this.p.v = 10;
      }
    }
    if (this.state === 'finish') {
      this.finishT -= dtReal;
      if (this.finishT <= 0) { this.state = 'results'; const res = this.finalize(); this.ui.showResults(this, res); }
    }
    this.acc += dt; const H = 1 / 120; let n = 0;
    while (this.acc >= H && n < 10) { this.step(H); this.acc -= H; n++; }
    if (n >= 10) this.acc = 0;
    this.renderVisuals(dt, dtReal);
  }
  renderVisuals(dt, dtReal) {
    const P = this.p, T = this.world.track, W = this.world;
    if (!T) return;
    // floating origin
    T.frame(P.crash ? P.crash.s : P.s, _F);
    const ax = _F.x, az = _F.z;
    if (Math.abs(ax - ORIGIN.x) > 1200 || Math.abs(az - ORIGIN.z) > 1200) {
      const nx = Math.round(ax / 400) * 400, nz = Math.round(az / 400) * 400, dx = nx - ORIGIN.x, dz = nz - ORIGIN.z;
      ORIGIN.x = nx; ORIGIN.z = nz;
      this.camera.position.x -= dx; this.camera.position.z -= dz; this.lookTarget.x -= dx; this.lookTarget.z -= dz;
      this.smoke.shift(dx, dz); this.sparks.shift(dx, dz); this.skids.shift(dx, dz); this.trails.forEach((t) => t.shift(dx, dz));
      const sp = W.snow.geometry.attributes.position.array; for (let i = 0; i < sp.length; i += 3) { sp[i] -= dx; sp[i + 2] -= dz; }
    }
    W.stream(P.s, this.state === 'countdown' ? 3 : 1);
    this.placePlayer(dtReal);
    this.placeTraffic();
    this.updateCamera(dtReal);
    const p = W.update(dt, P.s, this.camera, this.carPos);
    this.updateEffects(dt, dtReal, p);
    this.updateAudio();
    this.updatePost(dtReal, p);
    if (this.state === 'race' || this.state === 'countdown' || this.state === 'finish') this.ui.hud(this);
  }
  placePlayer(dtReal) {
    const P = this.p, T = this.world.track, m = this.model, u = m.userData;
    const R = _v1, U = _v2, Fw = V3();
    let s = P.s, x = P.x;
    if (P.crash) { s = P.crash.s; x = P.crash.x; }
    T.frame(s, _F);
    const pos = (this.carPos = this.carPos || V3());
    const roadY = _F.y - Math.sin(_F.bank) * x;
    const y = P.crash ? roadY + P.crash.h : P.y;
    pos.set(_F.x + _F.rx * x - ORIGIN.x, y, _F.z + _F.rz * x - ORIGIN.z);
    const travel = _F.th + P.yaw;
    const heading = P.crash ? P.crash.heading : travel + P.slip;
    const pitchT = P.air ? Math.atan2(P.vy, Math.max(10, P.v)) * 0.8 : Math.atan(_F.slope);
    P.pitchVis = damp(P.pitchVis, pitchT, P.air ? 3 : 12, dtReal);
    roadBasis(_F, heading, P.pitchVis, P.air ? _F.bank * 0.5 : _F.bank, R, U, Fw);
    _m4.makeBasis(R, U, Fw.clone().negate()); m.quaternion.setFromRotationMatrix(_m4);
    if (P.crash) m.quaternion.premultiply(P.crash.q);
    m.position.copy(pos);
    this.carFwd = (this.carFwd || V3()).copy(Fw); this.carRight = (this.carRight || V3()).copy(R); this.carUp = (this.carUp || V3()).copy(U);
    this.travelDir = (this.travelDir || V3()).set(Math.cos(travel), 0, Math.sin(travel));
    // body roll / squat
    const sp = clamp(P.v / 80, 0, 1.2);
    u.body.rotation.x = damp(u.body.rotation.x, -P.steer * 0.035 * sp - P.slip * 0.12, 8, dtReal);
    u.body.rotation.z = damp(u.body.rotation.z, clamp(P.accelVis * 0.0025, -0.035, 0.035), 6, dtReal);
    // wheels
    P.wheelSpin -= (P.v / u.st.wr) * dtReal * this.timeScale;
    for (const w of u.wheels) { w.spin.rotation.z = P.wheelSpin; if (w.front) w.steer.rotation.y = -P.steer * 0.42 * (1 - sp * 0.55) + (P.drifting ? P.driftDir * 0.25 : 0); }
    // flames
    const fp = P.od > 0 ? 1.4 : P.boosting ? 1 : 0;
    const fl = sharedCarMaterials().flame; fl.uniforms.uTime.value = this.realTime; fl.uniforms.uPow.value = damp(fl.uniforms.uPow.value, fp, 12, dtReal);
    const nitro = carState(SAVE.car)?.up.nitro || 0;
    fl.uniforms.uHot.value.setRGB(...(P.od > 0 ? [1.0, 0.3, 1.0] : nitro >= 4 ? [0.7, 0.4, 1.0] : nitro >= 2 ? [0.4, 0.75, 1.0] : [1.0, 0.85, 0.4]));
    for (const f of u.flames) { const L = fp > 0 ? (0.9 + Math.random() * 0.5) * (1 + fp * 0.6) : 0.001; f.scale.set(L, 1 + fp * 0.3, 1 + fp * 0.3); }
    // brake lights
    const braking = !P.crash && INPUT.brake && this.state === 'race';
    u.tailMat.color.setRGB(braking ? 9 : 3.6, braking ? 0.3 : 0.1, braking ? 0.4 : 0.15);
    // ghost blink
    m.visible = !(P.ghost > 0 && Math.floor(this.realTime * 14) % 2 === 0 && !P.crash);
    // contact shadow
    const bh = P.crash ? P.crash.h : P.y - roadY;
    this.blob.position.set(pos.x, roadY + 0.03, pos.z); this.blob.rotation.set(0, -heading + Math.PI / 2, 0);
    this.blobMat.opacity = 0.8 * clamp(1 - bh / 6, 0, 1);
    const night = this.world.params.night || 0;
    this.head.intensity = night * 260; this.headTarget.position.copy(pos).addScaledVector(Fw, 30).add(V3().set(0, -2, 0));
  }
  placeTraffic() {
    const T = this.world.track, R = _v1, U = _v2, Fw = V3();
    const counts = this.tMeshes.map(() => 0);
    const put = (type, s, x, h, yawExtra, q, color) => {
      T.frame(s, _F);
      const roadY = _F.y - Math.sin(_F.bank) * x;
      roadBasis(_F, _F.th + yawExtra, Math.atan(_F.slope), _F.bank, R, U, Fw);
      _m4.makeBasis(R, U, Fw.negate());
      if (q) { _m4.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)); }
      _m4.setPosition(_F.x + _F.rx * x - ORIGIN.x, roadY + h, _F.z + _F.rz * x - ORIGIN.z);
      return _m4;
    };
    this.gold.visible = false;
    const allCars = [...this.traffic.map((c) => ({ c, w: null })), ...this.wrecks.map((w) => ({ c: w, w }))];
    for (const { c, w } of allCars) {
      const mtx = put(c.type, c.s, c.x, w ? w.h : 0, w ? 0 : Math.atan(c.yawV || 0), w ? w.q : null);
      if (c.gold) { this.gold.visible = true; this.gold.matrixAutoUpdate = false; this.gold.matrix.copy(mtx); this.gold.matrixWorldNeedsUpdate = true; continue; }
      const tm = this.tMeshes[c.type]; const i = counts[c.type]++;
      if (i >= tm.N) continue;
      tm.paint.setMatrixAt(i, mtx); tm.dark.setMatrixAt(i, mtx); tm.lights.setMatrixAt(i, mtx);
      tm.paint.setColorAt(i, _col.set(c.color));
    }
    this.tMeshes.forEach((tm, k) => {
      const n = Math.min(counts[k], tm.N);
      for (const m of [tm.paint, tm.dark, tm.lights]) { m.count = n; m.instanceMatrix.needsUpdate = true; }
      if (tm.paint.instanceColor) tm.paint.instanceColor.needsUpdate = true;
    });
  }
  updateCamera(dtReal) {
    const P = this.p, cam = this.camera, pos = this.carPos;
    const sp = clamp(P.v / 100, 0, 1.4);
    const boostK = P.boosting ? 1 : 0, odK = P.od > 0 ? 1 : 0;
    const travelHeading = Math.atan2(this.travelDir.z, this.travelDir.x);
    const auto = this.state === 'attract';
    let fovT = 64 + sp * 20 + boostK * 7 + odK * 10;
    if (P.crash) {
      // hold position, watch the wreck
      this.lookTarget.lerp(pos, 1 - Math.exp(-6 * dtReal));
      cam.position.lerp(_v3.copy(pos).addScaledVector(this.travelDir, -9).add(V3().set(0, 3.2, 0)), 1 - Math.exp(-1.2 * dtReal));
      cam.lookAt(this.lookTarget); fovT = 55;
    } else if (auto) {
      this.camShotT += dtReal;
      if (this.camShotT > 6.5) { this.camShotT = 0; this.camShot = (this.camShot + 1) % 5; }
      const F = this.travelDir, Rt = V3().set(-F.z, 0, F.x), up = V3().set(0, 1, 0);
      const t = this.camShotT;
      let cp, lt;
      switch (this.camShot) {
        case 0: cp = V3().copy(pos).addScaledVector(F, 7.5 - t * 0.5).addScaledVector(Rt, -3.2).addScaledVector(up, 0.7); lt = V3().copy(pos).addScaledVector(up, 0.6); fovT = 42; break;
        case 1: cp = V3().copy(pos).addScaledVector(Rt, 5.5).addScaledVector(F, 1.5 - t * 0.6).addScaledVector(up, 0.9); lt = V3().copy(pos).addScaledVector(up, 0.6); fovT = 38; break;
        case 2: cp = V3().copy(pos).addScaledVector(F, -8.5).addScaledVector(up, 2.6); lt = V3().copy(pos).addScaledVector(F, 8).addScaledVector(up, 1); fovT = 60; break;
        case 3: cp = V3().copy(pos).addScaledVector(F, -3.6).addScaledVector(Rt, 2.3).addScaledVector(up, 0.42); lt = V3().copy(pos).addScaledVector(F, 12).addScaledVector(up, 0.6); fovT = 58; break;
        default: cp = V3().copy(pos).addScaledVector(F, 14 - t * 2.5).addScaledVector(Rt, 6).addScaledVector(up, 4 + t * 0.4); lt = V3().copy(pos).addScaledVector(up, 0.5); fovT = 34; break;
      }
      cam.position.copy(cp); cam.lookAt(lt); this.lookTarget.copy(lt);
    } else {
      // chase rigs in car-relative space so the camera never lags at speed
      const mode = this.camMode;
      let dyaw = Math.atan2(Math.sin(travelHeading - this.camYaw), Math.cos(travelHeading - this.camYaw));
      this.camYaw = travelHeading - dyaw * Math.exp(-7 * dtReal);
      const swing = this.camYaw + P.slip * 0.3;
      const F = V3().set(Math.cos(swing), 0, Math.sin(swing)), Rt = V3().set(-F.z, 0, F.x);
      let dist, hgt, look;
      if (mode === 1) { dist = 9.5 + sp * 1.5; hgt = 3.4; look = 9; }
      else if (mode === 2) { dist = -0.4; hgt = 1.02; look = 25; }
      else { dist = 6.3 + sp * 1.5 + boostK * 0.6; hgt = 1.95 - sp * 0.2; look = 7 + sp * 7; }
      this.camOff.x = damp(this.camOff.x, -P.steer * 0.35 * sp, 4, dtReal);
      this.camOff.y = damp(this.camOff.y, hgt, 5, dtReal);
      this.camOff.z = damp(this.camOff.z, dist, 4, dtReal);
      const baseY = P.air ? lerp(pos.y, P.launchY, 0.35) : pos.y;
      const cp = V3().copy(pos).addScaledVector(F, -this.camOff.z).addScaledVector(Rt, this.camOff.x); cp.y = baseY + this.camOff.y + Math.max(0, (pos.y - baseY) * 0.4);
      if (mode === 2) cp.copy(pos).addScaledVector(this.carFwd, 0.35).addScaledVector(this.carUp, 1.02);
      const lt = V3().copy(pos).addScaledVector(F, look); lt.y = (mode === 2 ? pos.y + 0.9 : baseY + 0.95);
      cam.position.copy(cp);
      this.lookTarget.copy(lt);
      cam.lookAt(lt);
      cam.rotateZ(-P.steer * 0.025 * sp - P.slip * 0.04);
    }
    // shake
    this.shakeAmp = Math.max(0, this.shakeAmp - dtReal * 1.6);
    const base = SAVE.settings.shake ? (P.boosting ? 0.02 : 0) + (P.od > 0 ? 0.03 : 0) + sp * 0.006 + (P.scrape > 0 ? 0.05 : 0) : 0;
    const amp = this.shakeAmp + base;
    if (amp > 0 && !auto) {
      this.shakeT += dtReal * 40;
      cam.position.x += noise1(this.shakeT, 1) * amp; cam.position.y += noise1(this.shakeT, 2) * amp * 0.7; cam.position.z += noise1(this.shakeT, 3) * amp;
      cam.rotateZ(noise1(this.shakeT, 4) * amp * 0.05);
    }
    cam.fov = damp(cam.fov, fovT, 4, dtReal); cam.updateProjectionMatrix();
  }
  updateEffects(dt, dtReal, p) {
    const P = this.p, cp = this.carPos, m = this.model;
    this.smoke.update(dt); this.sparks.update(dt); this.skids.update(dtReal);
    if (!P.crash && cp) {
      m.updateMatrixWorld(true);
      const holder = m.userData.holder;
      // skid marks + smoke
      const heavyBrake = INPUT.brake && P.v > 25 && this.state === 'race';
      const sliding = (P.drifting && P.v > 12) || heavyBrake || Math.abs(P.slip) > 0.3;
      if (sliding && !P.air) {
        this._skAcc = (this._skAcc || 0) + P.v * dt;
        T_ = this.world.track; T_.frame(P.s, _F);
        for (const rl of this.rearLocal) {
          const wp = holder.localToWorld(_v3.copy(rl));
          if (this._skAcc > 0.7) this.skids.add(wp.x, wp.y, wp.z, _F.th + P.yaw + P.slip * 0.6, 1.0, P.drifting ? 1 : 0.6, _F.bank);
          if (Math.random() < 0.7 * (dt * 60)) {
            const bio = this.world.weights; const snowy = bio[3] > 0.5, dusty = bio[2] > 0.5 || bio[4] > 0.5;
            const col = snowy ? [0.85, 0.88, 0.95] : dusty ? [0.62, 0.42, 0.28] : [0.55, 0.55, 0.58];
            this.smoke.emit(wp.x, wp.y + 0.25, wp.z, -this.travelDir.x * P.v * 0.15 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), -this.travelDir.z * P.v * 0.15 + (Math.random() - 0.5) * 2, 1.3 + Math.random() * 0.8, 0.9, 3.4, col[0], col[1], col[2], 0.42, 1.6, -0.4);
          }
        }
        if (this._skAcc > 0.7) this._skAcc = 0;
      }
      // shoulder dust
      if (Math.abs(P.x) > 7.6 && P.v > 20 && !P.air && Math.random() < 0.6) {
        const bio = this.world.weights; const col = bio[3] > 0.5 ? [0.9, 0.92, 0.97] : bio[0] > 0.5 ? [0.3, 0.3, 0.34] : [0.6, 0.45, 0.32];
        const wp = holder.localToWorld(_v3.copy(this.rearLocal[P.x > 0 ? 1 : 0]));
        this.smoke.emit(wp.x, wp.y + 0.2, wp.z, (Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3, 1.0, 0.8, 3, col[0], col[1], col[2], 0.35, 1.4, -0.3);
      }
      // boost embers
      if (P.boosting && Math.random() < 0.8) {
        for (const el of this.exhLocal) {
          const wp = holder.localToWorld(_v3.copy(el));
          const od = P.od > 0;
          this.sparks.emit(wp.x, wp.y, wp.z, -this.carFwd.x * 6 + (Math.random() - 0.5) * 2, Math.random() * 1.5, -this.carFwd.z * 6 + (Math.random() - 0.5) * 2, 0.25, 0.14, -0.2, od ? 3 : 2.6, od ? 0.6 : 1.4, od ? 3.5 : 0.4, 0.9, 2, 0);
        }
      }
      // light trails
      const tOp = this.Q.trails ? clamp((P.v - 30) / 50, 0, 1) * (P.od > 0 ? 0.75 : P.boosting ? sstep(0.3, 1, p.night || 0) * 0.55 : 0) : 0;
      this.trails.forEach((t, i) => {
        const wp = holder.localToWorld(_v3.copy(this.tailLocal[i]));
        t.push(wp.x, wp.y, wp.z, this.realTime); t.mat.uniforms.uOp.value = tOp;
        t.mat.uniforms.uCol.value.setRGB(...(P.od > 0 ? [2.4, 0.2, 2.2] : [2.2, 0.08, 0.12]));
      });
      // golden car glitter
      if (this.gold.visible && Math.random() < 0.6) { const gp = V3().setFromMatrixPosition(this.gold.matrix); this.sparks.emit(gp.x + (Math.random() - 0.5) * 2, gp.y + 1 + Math.random(), gp.z + (Math.random() - 0.5) * 2, 0, 1, 0, 0.6, 0.18, 0, 3, 2.2, 0.6, 1, 1, 0); }
    }
    // speed lines
    const sl = clamp((P.v - 55) / 50, 0, 1) * (P.boosting ? 1.2 : 0.7) + (P.od > 0 ? 0.4 : 0);
    this.speedLines.update(dtReal, P.v * 1.1 + 20, this.state === 'attract' ? 0 : sl, P.od > 0 ? _col.setRGB(1.2, 0.4, 1.4) : _col.setRGB(1, 1, 1));
    this.flash = Math.max(0, this.flash - dtReal * 2.2);
    this.damage = Math.max(0, this.damage - dtReal * 0.8);
  }
  updateAudio() {
    const P = this.p;
    if (!AUDIO.ready) return;
    const kmh = P.v * 3.6;
    const gears = [0, 60, 110, 160, 215, 275, 345, 999];
    let g = 1; while (g < gears.length - 1 && kmh > gears[g]) g++;
    if (g > P.gear && this.state === 'race') { AUDIO.shift(); if (Math.random() < 0.5) AUDIO.pop(); }
    P.gear = g;
    const lo = gears[g - 1], hi = gears[g];
    const rpmT = P.air ? 1 : clamp((kmh - lo) / (hi - lo), 0, 1) * 0.78 + 0.2 + (this.state === 'countdown' ? INPUT.gas * 0.6 : 0);
    P.rpm = damp(P.rpm, clamp(rpmT, 0, 1), 10, 1 / 60);
    const on = ['race', 'countdown', 'finish', 'attract', 'results'].includes(this.state) && !P.crash;
    AUDIO.engineUpdate({ rpm: P.rpm, throttle: this.state === 'attract' || this.state === 'results' ? 0.3 : P.throttle, speed: P.v, slip: P.drifting ? 0.9 : Math.abs(P.slip) * 1.5, boost: P.boosting, scrape: P.scrape > 0 ? 1 : 0, on: on && this.state !== 'paused', muffle: !!P.crash || this.state === 'paused' });
    if (this.state === 'race') {
      let I = 2;
      if (this.chain.mult >= 4 || this.run.tier >= 3) I = 3;
      if (this.chain.mult >= 7 || this.run.tier >= 4) I = 4;
      if (P.od > 0) I = 5;
      AUDIO.setIntensity(I);
    }
  }
  updatePost(dtReal, p) {
    const P = this.p, u = this.post.final.uniforms, cam = this.camera;
    const sp = clamp((P.v - 40) / 90, 0, 1);
    const calm = SAVE.settings.calm;
    u.uTime.value = this.realTime;
    u.uBlur.value = damp(u.uBlur.value, this.state === 'attract' ? 0.15 : sp * 0.7 + (P.boosting ? 0.6 : 0) + (P.od > 0 ? 0.5 : 0), 5, dtReal);
    u.uAberr.value = damp(u.uAberr.value, sp * 1.2 + (P.boosting ? 1.5 : 0) + (P.od > 0 ? 2 : 0) + this.damage * 3, 5, dtReal);
    u.uSat.value = p.sat; u.uTint.value.setRGB(...p.tint); u.uHeat.value = p.heat;
    u.uOD.value = damp(u.uOD.value, P.od > 0 ? 1 : 0, 4, dtReal);
    u.uFlash.value = calm ? this.flash * 0.15 : this.flash * 0.5;
    u.uDamage.value = this.damage;
    u.uVig.value = 0.42 + sp * 0.2;
    this.renderer.toneMappingExposure = p.exposure;
    if (this.post.bloom) this.post.bloom.strength = p.bloom * (1 + (P.od > 0 ? 0.35 : 0));
    // sun glare
    const sd = _v3.set(...p.sunDir).normalize();
    const sw = V3().copy(cam.position).addScaledVector(sd, 3000).project(cam);
    const facing = V3().subVectors(V3().copy(cam.position).addScaledVector(sd, 10), cam.position).normalize().dot(cam.getWorldDirection(V3()));
    u.uSunPos.value.set(sw.x * 0.5 + 0.5, sw.y * 0.5 + 0.5);
    u.uSunVis.value = facing > 0 ? clamp(facing * 1.4 - 0.4, 0, 1) * clamp(1 - p.night * 1.5, 0, 1) * (sd.y < 0.6 ? 1 : 0.4) : 0;
    u.uSunCol.value.setRGB(p.sunCol[0] * 0.25, p.sunCol[1] * 0.25, p.sunCol[2] * 0.25);
    u.uAspect.value = cam.aspect;
  }
}
let T_ = null;

export { CHAIN_TIME, Game, TIERS };
