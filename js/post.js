// Final post-processing shader (blur, aberration, grading, flashes).
import * as THREE from 'three';

/* ============================== final post pass ============================== */
function makeFinalShader(samples) {
  return {
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uBlur: { value: 0 }, uAberr: { value: 0 }, uVig: { value: 0.35 }, uGrain: { value: 0.025 },
      uSat: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uHeat: { value: 0 }, uOD: { value: 0 }, uFlash: { value: 0 }, uDamage: { value: 0 },
      uSunPos: { value: new THREE.Vector2(0.5, 0.5) }, uSunVis: { value: 0 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) }, uAspect: { value: 1.7 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `#define SAMPLES ${samples}
uniform sampler2D tDiffuse; uniform float uTime, uBlur, uAberr, uVig, uGrain, uSat, uHeat, uOD, uFlash, uDamage, uSunVis, uAspect; uniform vec3 uTint, uSunCol; uniform vec2 uSunPos;
varying vec2 vUv;
float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  uv.x += sin(uv.y * 90.0 + uTime * 7.0) * 0.0012 * uHeat * smoothstep(0.62, 0.38, uv.y) * smoothstep(0.1, 0.35, uv.y);
  vec2 c = uv - 0.5; float r = length(c * vec2(uAspect, 1.0)) / uAspect * 2.0;
  float amt = uBlur * smoothstep(0.12, 0.85, r);
  vec3 col = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    float sc = 1.0 - amt * t * 0.11;
    float w = 1.0 - t * 0.55;
    vec3 sm = min(texture2D(tDiffuse, 0.5 + c * sc).rgb, vec3(40.0)); if (any(isnan(sm))) sm = vec3(0.0);
    col += sm * w; ws += w;
  }
  col /= ws;
  float ca = uAberr * r * r * 0.0055;
  float cr = min(texture2D(tDiffuse, 0.5 + c * (1.0 + ca)).r, 40.0), cb = min(texture2D(tDiffuse, 0.5 + c * (1.0 - ca)).b, 40.0);
  if (!isnan(cr)) col.r = mix(col.r, cr, 0.85); if (!isnan(cb)) col.b = mix(col.b, cb, 0.85);
  // sun glare: soft bloom + anamorphic streak
  vec2 sd = (uv - uSunPos) * vec2(uAspect, 1.0);
  float sg = exp(-length(sd) * 3.2) * 0.35 + exp(-abs(sd.y) * 90.0) * exp(-abs(sd.x) * 1.6) * 0.6;
  col += uSunCol * sg * uSunVis;
  // overdrive grade
  col = mix(col, col * vec3(1.25, 0.75, 1.35) + vec3(0.02, 0.0, 0.04), uOD * 0.6);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat + uOD * 0.25);
  col *= uTint;
  col *= 1.0 - uVig * smoothstep(0.45, 1.3, r);
  col = mix(col, vec3(1.6, 0.05, 0.2) * l + vec3(0.06, 0.0, 0.01), uDamage * smoothstep(0.5, 1.25, r));
  col += vec3(uFlash);
  col += (hh(uv * 437.0 + fract(uTime)) - 0.5) * uGrain * (0.4 + l);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`,
  };
}

export { makeFinalShader };
