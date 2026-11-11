// Boot: renderer, post-processing, game loop, keyboard handling and dynamic resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { $ } from './util.js';
import { SAVE, persist } from './save.js';
import { resolveQuality } from './quality.js';
import { World } from './world/world.js';
import { makeFinalShader } from './post.js';
import { AUDIO } from './audio.js';
import { INPUT, KEYMAP, pollInput } from './input.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { SHOWROOM } from './showroom.js';

/* ============================== boot ============================== */
(async function main() {
  const bar = $('boot-bar'), msg = $('boot-msg');
  const progress = async (p, m) => { bar.style.width = `${p}%`; if (m) msg.textContent = m; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); };
  await progress(5, 'Warming up the engine');
  // the sign and banner textures are drawn with the display fonts, so wait for them briefly
  try { await Promise.race([Promise.all([document.fonts.load('600 100px "Teko"'), document.fonts.load('600 30px "Chakra Petch"')]), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* fonts optional */ }
  let Q = resolveQuality();
  const canvas = $('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (e) {
    msg.textContent = 'This browser could not start WebGL. Try Chrome, Edge or Safari with hardware acceleration turned on.'; bar.style.background = '#ff2d55'; return;
  }
  const isWebGL2 = renderer.capabilities.isWebGL2;
  if (!isWebGL2) Q = { ...Q, msaa: 0 };
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = Q.shadows > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const baseDpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  let dynScale = 1;
  renderer.setPixelRatio(baseDpr);
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.15, 7000);
  scene.add(camera);

  await progress(15, 'Paving the roads');
  const world = new World(renderer, scene, Q);
  await progress(45, 'Lighting five districts');

  const rt = new THREE.WebGLRenderTarget(innerWidth * baseDpr, innerHeight * baseDpr, { type: THREE.HalfFloatType, samples: Q.msaa || 0 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
  let bloom = null;
  if (Q.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.35, 1.0); composer.addPass(bloom);
    // guard the bloom chain against HDR overflow (Inf/NaN from tiny glossy highlights)
    const hp = bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = min(texel.rgb, vec3(40.0)); if (any(isnan(texel.rgb))) texel.rgb = vec3(0.0);');
    hp.needsUpdate = true; }
  const final = new ShaderPass(makeFinalShader(Q.blur)); composer.addPass(final);
  composer.addPass(new OutputPass());

  SHOWROOM.init(renderer);
  await progress(60, 'Rolling out the cars');
  const game = new Game({ renderer, scene, camera, world, Q, post: { final, bloom }, ui: UI });
  UI.init(game);
  await progress(72, 'Filling the streets');
  game.startAttract();
  game.state = 'boot';
  await progress(85, 'Compiling shaders');
  world.ocean.visible = true; world.snow.visible = true; world.city.visible = true; game.gold.visible = true;
  world.prewarm(camera);
  try { renderer.compile(scene, camera); } catch (e) { /* ignore */ }
  game.frame(1 / 60);
  composer.render();
  await progress(100, 'Ready');

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(baseDpr * dynScale);
    renderer.setSize(w, h, false); composer.setPixelRatio(baseDpr * dynScale); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    SHOWROOM.camera.aspect = w / h; SHOWROOM.camera.updateProjectionMatrix();
    const s = (h * baseDpr * dynScale) / 1.4;
    game.smoke.mat.uniforms.uScale.value = s; game.sparks.mat.uniforms.uScale.value = s;
  };
  window.addEventListener('resize', resize); resize();

  // ---- start gate: audio needs a gesture ----
  $('boot-load').hidden = true; $('boot-press').hidden = false;
  let started = false;
  const start = () => {
    if (started) return; started = true;
    AUDIO.init(); AUDIO.resume();
    game.state = 'attract';
    UI.toMenu();
  };
  $('scr-boot').addEventListener('pointerdown', start);
  window.addEventListener('keydown', (e) => { if (!started) { start(); e.preventDefault(); } }, { once: false });

  // ---- keyboard ----
  window.addEventListener('keydown', (e) => {
    if (!started) return;
    AUDIO.resume();
    const k = KEYMAP[e.code];
    const playing = ['race', 'countdown'].includes(game.state);
    if (k && (playing || game.state === 'paused')) { INPUT.k[k] = 1; e.preventDefault(); }
    if (playing && e.code === 'KeyC') { game.camMode = (game.camMode + 1) % 3; SAVE.settings.cam = game.camMode; persist(); }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (playing) UI.pause(); else if (game.state === 'paused' && UI.cur === 'scr-pause') UI.resume();
      else if (UI.cur && !['scr-menu', 'scr-boot', 'scr-pause', 'scr-results'].includes(UI.cur)) { AUDIO.uiBack(); UI.back(); }
    }
    if (game.state === 'results' && UI.cur === 'scr-results' && (e.code === 'Enter' || e.code === 'KeyR') && $('scr-crate').hidden) { e.preventDefault(); UI.startRun(game.mode); }
    if (e.code === 'Space' && !playing && document.activeElement?.tagName !== 'BUTTON') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) INPUT.k[k] = 0; });
  window.addEventListener('blur', () => { INPUT.k = {}; if (['race', 'countdown'].includes(game.state)) UI.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && ['race', 'countdown'].includes(game.state)) UI.pause(); });
  window.addEventListener('pad-start', () => { if (['race', 'countdown'].includes(game.state)) UI.pause(); else if (game.state === 'paused') UI.resume(); });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- loop ----
  let last = performance.now(), slow = 0, fast = 0;
  const loop = (now) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    pollInput();
    if (game.state === 'garage') {
      SHOWROOM.update(dt, renderer);
      renderPass.scene = SHOWROOM.scene; renderPass.camera = SHOWROOM.camera;
      const u = final.uniforms; u.uBlur.value = 0; u.uAberr.value = 0.4; u.uOD.value = 0; u.uDamage.value = 0; u.uFlash.value = 0; u.uSunVis.value = 0; u.uSat.value = 1.05; u.uTint.value.setRGB(1, 1, 1); u.uHeat.value = 0; u.uVig.value = 0.5;
      renderer.toneMappingExposure = 1.0; if (bloom) bloom.strength = 0.32;
      AUDIO.silenceEngine();
    } else {
      renderPass.scene = scene; renderPass.camera = camera;
      game.frame(dt);
    }
    composer.render();
    // dynamic resolution keeps the frame rate up on slower devices
    if (dt > 1 / 45) slow += dt; else slow = Math.max(0, slow - dt * 0.5);
    if (dt < 1 / 57) fast += dt; else fast = 0;
    if (slow > 1.5 && dynScale > 0.55) { dynScale = Math.max(0.55, dynScale - 0.1); slow = 0; resize(); }
    else if (slow > 4 && dynScale <= 0.55 && SAVE.settings.quality === 'auto' && Q.name !== 'low' && !SAVE.settings.autoCap) {
      // still too slow at the lowest resolution: remember a lighter preset for the next launch
      SAVE.settings.autoCap = Q.name === 'ultra' ? 'high' : Q.name === 'high' ? 'medium' : 'low'; persist(); slow = 0;
      if (!$('hud').hidden) UI.toast('Graphics', 'Your device is struggling. Lighter graphics will load next time.');
    }
    if (fast > 6 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); fast = 0; resize(); }
  };
  requestAnimationFrame(loop);
  window.__game = game; window.__input = INPUT; window.__save = () => SAVE; window.__show = SHOWROOM; window.__post = { bloom, final, composer, renderer };
})();
