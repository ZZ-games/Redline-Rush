// Procedural canvas textures: asphalt, glow, detail, signs, banners, chevrons, plates.
import * as THREE from 'three';
import { clamp, mulberry32, noise2 } from './util.js';

/* ============================== procedural textures ============================== */
const ROAD_W = 19.2;           // textured road ribbon width (m), includes shoulders
const ROAD_HALF = ROAD_W / 2;  // 9.6
const EDGE = 7.0;              // edge line offset
const LANES = [-5.25, -1.75, 1.75, 5.25];
const TEX_V_LEN = 18;          // metres covered by one texture repeat along the road

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function asphaltTextures(maxAniso) {
  const W = 512, H = 1024;
  const c = makeCanvas(W, H), g = c.getContext('2d');
  const pxm = W / ROAD_W, pvm = H / TEX_V_LEN;
  const X = (m) => (m + ROAD_HALF) * pxm;
  // base asphalt
  g.fillStyle = '#3a3a40'; g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const rnd = mulberry32(7);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const m = x / pxm - ROAD_HALF;
    let v = 58 + (rnd() - 0.5) * 34 + noise2(x / 22, y / 22, 3) * 8 + noise2(x / 90, y / 140, 9) * 7;
    const shoulder = Math.abs(m) > EDGE + 0.2 ? 1 : 0;
    v += shoulder * (6 + noise2(x / 6, y / 6, 2) * 6);
    // worn tyre paths: darker bands in each lane
    for (const L of LANES) { const dd = Math.abs(Math.abs(m - L) - 0.8); v -= Math.exp(-dd * dd * 6) * 9; }
    if (rnd() < 0.004) v += 50;
    d[i] = v; d[i + 1] = v; d[i + 2] = v + 3; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // tar seams
  g.strokeStyle = 'rgba(15,15,18,0.55)'; g.lineWidth = 2;
  for (let k = 0; k < 5; k++) { g.beginPath(); let x = rnd() * W; g.moveTo(x, 0); for (let y = 0; y < H; y += 40) { x += (rnd() - 0.5) * 18; g.lineTo(x, y); } g.stroke(); }
  // paint lines
  const paint = (x0, x1, y0, y1) => { g.fillStyle = 'rgba(240,240,235,0.94)'; g.fillRect(X(x0), y0, X(x1) - X(x0), y1 - y0); };
  paint(-EDGE - 0.08, -EDGE + 0.08, 0, H); paint(EDGE - 0.08, EDGE + 0.08, 0, H);
  for (const lx of [-3.5, 0, 3.5]) paint(lx - 0.07, lx + 0.07, 0, 6 * pvm);
  // rumble strips on shoulders
  g.fillStyle = 'rgba(210,210,205,0.55)';
  for (let y = 0; y < H; y += pvm * 0.9) { g.fillRect(X(-EDGE - 0.9), y, 0.5 * pxm, pvm * 0.35); g.fillRect(X(EDGE + 0.4), y, 0.5 * pxm, pvm * 0.35); }
  // grime on paint
  const im2 = g.getImageData(0, 0, W, H), d2 = im2.data;
  for (let i = 0; i < d2.length; i += 4) { const n = (rnd() - 0.5) * 22; d2[i] += n; d2[i + 1] += n; d2[i + 2] += n; }
  g.putImageData(im2, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAniso; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;

  // roughness map: paint is smoother; asphalt rough; random wet patches
  const rc = makeCanvas(256, 512), rg = rc.getContext('2d');
  const ri = rg.createImageData(256, 512), rd = ri.data;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    let v = 200 + noise2(x / 18, y / 18, 5) * 40 + (rnd() - 0.5) * 30;
    v -= Math.max(0, noise2(x / 60, y / 90, 13)) * 90; // puddles
    rd[i] = v; rd[i + 1] = v; rd[i + 2] = v; rd[i + 3] = 255;
  }
  rg.putImageData(ri, 0, 0);
  const rough = new THREE.CanvasTexture(rc); rough.wrapS = THREE.ClampToEdgeWrapping; rough.wrapT = THREE.RepeatWrapping; rough.anisotropy = maxAniso;

  // normal map from fine noise
  const nc = makeCanvas(256, 256), ng = nc.getContext('2d');
  const ni = ng.createImageData(256, 256), nd = ni.data;
  const hgt = new Float32Array(256 * 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) hgt[y * 256 + x] = rnd() * 0.6 + noise2(x / 4, y / 4, 21) * 0.4;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const hx = hgt[y * 256 + ((x + 1) & 255)] - hgt[y * 256 + ((x + 255) & 255)];
    const hy = hgt[((y + 1) & 255) * 256 + x] - hgt[((y + 255) & 255) * 256 + x];
    nd[i] = 128 - hx * 70; nd[i + 1] = 128 - hy * 70; nd[i + 2] = 255; nd[i + 3] = 255;
  }
  ng.putImageData(ni, 0, 0);
  const normal = new THREE.CanvasTexture(nc); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.anisotropy = maxAniso;
  return { map, rough, normal };
}

function glowTexture(size = 128, falloff = 2.2) {
  const c = makeCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.pow(clamp(1 - r, 0, 1), falloff);
    const i = (y * size + x) * 4; d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function detailTexture(maxAniso) {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data; const rnd = mulberry32(99);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const tx = x / S * 8, ty = y / S * 8;
    // tileable-ish by wrapping coordinates through sin
    let v = 200 + (noise2(tx * 2, ty * 2, 4) * 26 + noise2(tx * 6, ty * 6, 8) * 14) + (rnd() - 0.5) * 30;
    const i = (y * S + x) * 4; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
}

const SIGN_WORDS = [
  ['REDLINE', '#ff2d55'], ['NOVA', '#29e3ff'], ['24H', '#ffc23d'], ['KAIJU', '#ff4fd8'],
  ['VOLT', '#7dff4f'], ['RAMEN', '#ff6a2d'], ['ARCADE', '#b26bff'], ['HYPER', '#29e3ff'],
];
function signAtlas() {
  const W = 1024, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const cw = W / 2, ch = H / 4;
  SIGN_WORDS.forEach(([word, col], i) => {
    const x = (i % 2) * cw, y = Math.floor(i / 2) * ch;
    g.save();
    g.fillStyle = '#05030a'; g.fillRect(x + 6, y + 6, cw - 12, ch - 12);
    g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 24; g.strokeRect(x + 18, y + 18, cw - 36, ch - 36);
    g.font = `700 ${word.length > 5 ? 96 : 120}px "Teko", "Chakra Petch", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = col; g.shadowBlur = 30; g.fillText(word, x + cw / 2, y + ch / 2 + 8);
    g.fillStyle = '#fff'; g.shadowBlur = 8; g.globalAlpha = 0.55; g.fillText(word, x + cw / 2, y + ch / 2 + 8);
    g.restore();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function bannerTexture(title, sub, color) {
  const W = 1024, H = 192, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#07060d'; g.fillRect(0, 0, W, H);
  g.fillStyle = color; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  // chevrons
  g.globalAlpha = 0.35; g.fillStyle = color;
  for (let i = 0; i < 6; i++) { const x = 30 + i * 26; g.beginPath(); g.moveTo(x, 50); g.lineTo(x + 16, 96); g.lineTo(x, 142); g.lineTo(x + 10, 142); g.lineTo(x + 26, 96); g.lineTo(x + 10, 50); g.fill(); }
  for (let i = 0; i < 6; i++) { const x = W - 56 - i * 26; g.beginPath(); g.moveTo(x + 26, 50); g.lineTo(x + 10, 96); g.lineTo(x + 26, 142); g.lineTo(x + 16, 142); g.lineTo(x, 96); g.lineTo(x + 16, 50); g.fill(); }
  g.globalAlpha = 1;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 104px "Teko", Impact, sans-serif'; g.fillStyle = '#ffffff'; g.shadowColor = color; g.shadowBlur = 26;
  g.fillText(title, W / 2, sub ? 88 : 100);
  if (sub) { g.font = '600 34px "Chakra Petch", sans-serif'; g.shadowBlur = 0; g.fillStyle = color; g.fillText(sub, W / 2, 150); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function chevronTexture() {
  const W = 128, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    const y = 30 + i * 72;
    g.beginPath(); g.moveTo(10, y + 50); g.lineTo(64, y); g.lineTo(118, y + 50); g.lineTo(118, y + 74); g.lineTo(64, y + 24); g.lineTo(10, y + 74); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; return t;
}

function plateTexture(text) {
  const c = makeCanvas(256, 64), g = c.getContext('2d');
  g.fillStyle = '#e9ecf2'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111'; g.font = '700 44px "Chakra Petch", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export { LANES, ROAD_HALF, ROAD_W, TEX_V_LEN, asphaltTextures, bannerTexture, chevronTexture, detailTexture, glowTexture, plateTexture, signAtlas };
