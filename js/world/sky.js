// Sky dome shader and the distant mountain/city rings.
import * as THREE from 'three';
import { TAU, V3, mulberry32 } from '../util.js';

/* ============================== sky + rings ============================== */
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FRAG = `
uniform vec3 uTop, uHor, uBottom, uSunDir, uSunCol, uCloudCol; uniform float uSunSize, uStars, uClouds, uTime;
varying vec3 vDir;
float hh(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); float a=hh(vec3(i,1.)), b=hh(vec3(i+vec2(1,0),1.)), c=hh(vec3(i+vec2(0,1),1.)), d=hh(vec3(i+1.,1.)); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=n2(p)*a; p*=2.03; a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.42));
  col = mix(col, uBottom, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.45 + pow(sd, 600.0) * 1.2);
  col += uSunCol * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, sd) * 7.0;
  if (uStars > 0.0) {
    vec3 p = d * 360.0; vec3 c = floor(p); float hs = hh(c);
    float st = step(0.9965, hs) * smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.42, 0.5, length(fract(p) - 0.5)));
    col += vec3(0.9, 0.92, 1.0) * st * uStars * (0.55 + 0.45 * sin(uTime * 2.0 + hs * 90.0)) * 2.2;
  }
  if (uClouds > 0.0) {
    vec2 cp = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.004, 0.0);
    float cl = fbm(cp);
    float m = smoothstep(0.48, 0.78, cl) * smoothstep(-0.02, 0.18, h) * (1.0 - smoothstep(0.5, 0.95, h));
    vec3 cc = uCloudCol * (0.7 + 0.5 * cl) + uSunCol * pow(sd, 8.0) * 0.35;
    col = mix(col, cc, m * uClouds);
  }
  gl_FragColor = vec4(col, 1.0);
}`;
function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uSunDir: { value: V3() },
      uSunCol: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() }, uSunSize: { value: 0.002 }, uStars: { value: 0 }, uClouds: { value: 0 }, uTime: { value: 0 } },
  });
}
function applySky(mat, p) {
  const u = mat.uniforms;
  u.uTop.value.setRGB(...p.top); u.uHor.value.setRGB(...p.hor); u.uBottom.value.setRGB(...p.bottom);
  u.uSunDir.value.set(...p.sunDir).normalize(); u.uSunCol.value.setRGB(...p.sunCol); u.uCloudCol.value.setRGB(...p.cloudCol);
  u.uSunSize.value = p.sunSize; u.uStars.value = p.stars; u.uClouds.value = p.clouds;
}

const RING_VERT = `attribute float aTop; attribute float aH; uniform float uScale, uDrop; varying float vH; varying vec2 vW;
void main(){ vec3 p = position; float hgt = aH * uScale; p.y = mix(-260.0, hgt, aTop) - uDrop; vH = aTop * (hgt / max(uScale * 420.0, 1.0)); vW = vec2(uv.x, p.y);
  vec4 q = projectionMatrix * modelViewMatrix * vec4(p, 1.0); gl_Position = q; }`;
const RING_FRAG = `uniform vec3 uLow, uHigh, uHaze; uniform float uHazeAmt, uSnow, uWin, uVis; varying float vH; varying vec2 vW;
float bh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main(){ vec3 c = mix(uLow, uHigh, clamp(vH, 0.0, 1.0));
  c = mix(c, vec3(0.92, 0.95, 1.0), uSnow * smoothstep(0.55, 0.7, vH));
  if (uWin > 0.5) { vec2 g = vec2(vW.x * 900.0, vW.y / 4.0); vec2 cell = floor(g); vec2 f = fract(g);
    float w = step(0.3, f.x) * step(f.x, 0.7) * step(0.3, f.y) * step(f.y, 0.75) * step(0.62, bh(cell)) * step(2.0, vW.y);
    c += w * mix(vec3(1.0, 0.6, 0.3), vec3(0.4, 0.75, 1.0), step(0.75, bh(cell + 3.1))) * 0.7 * uVis; }
  c = mix(c, uHaze, uHazeAmt * (1.0 - clamp(vH, 0.0, 1.0) * 0.45));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function ringGeometry(R, N, heightFn, stepped) {
  const pos = [], uv = [], top = [], hh = [], idx = [];
  let v = 0;
  const pushCol = (a, H) => {
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    pos.push(x, 0, z, x, 0, z); uv.push(a / TAU, 0, a / TAU, 1); top.push(0, 1); hh.push(H, H);
    if (v > 0) { const b = v - 2; idx.push(b, b + 1, v, b + 1, v + 1, v); }
    v += 2;
  };
  if (!stepped) { for (let i = 0; i <= N; i++) { const a = (i / N) * TAU; pushCol(a, heightFn(a)); } }
  else {
    let a = 0; const rnd = mulberry32(5);
    let first = true;
    while (a < TAU) {
      const w = (0.006 + rnd() * 0.02); const H = heightFn(a, rnd);
      const a1 = Math.min(TAU, a + w);
      // each block: vertical edge then flat top
      if (!first) { pushCol(a, H); } else { pushCol(a, H); first = false; }
      pushCol(a1, H); a = a1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  g.setIndex(idx);
  return g;
}
function makeRingMaterial(win) {
  return new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, fog: false, depthWrite: true,
    uniforms: { uLow: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uHazeAmt: { value: 0.6 },
      uSnow: { value: 0 }, uWin: { value: win ? 1 : 0 }, uVis: { value: 1 }, uScale: { value: 1 }, uDrop: { value: 0 } } });
}

export { applySky, makeRingMaterial, makeSkyMaterial, ringGeometry };
