// Graphics quality presets and automatic detection.
import { SAVE } from './save.js';

/* ============================== quality ============================== */
const IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
const IS_MOBILE = /iPad|iPhone|Android|Mobile/i.test(navigator.userAgent) || (IS_TOUCH && /Macintosh/.test(navigator.userAgent));
const QUALITY = {
  low: { dpr: 0.75, shadows: 0, bloom: false, blur: 4, draw: 760, traffic: 16, lamps: 0, msaa: 0, trails: false, sceneryShadow: false, density: 0.6 },
  medium: { dpr: 1.0, shadows: 1024, bloom: true, blur: 6, draw: 1000, traffic: 22, lamps: 3, msaa: 0, trails: true, sceneryShadow: false, density: 0.8 },
  high: { dpr: 1.5, shadows: 2048, bloom: true, blur: 8, draw: 1360, traffic: 28, lamps: 5, msaa: 4, trails: true, sceneryShadow: true, density: 1.0 },
  ultra: { dpr: 2.0, shadows: 4096, bloom: true, blur: 10, draw: 1700, traffic: 32, lamps: 6, msaa: 4, trails: true, sceneryShadow: true, density: 1.25 },
};
function gpuName() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const n = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : '';
    gl && gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(n || '');
  } catch (e) { return ''; }
}
function resolveQuality() {
  const q = SAVE.settings.quality;
  if (q !== 'auto' && QUALITY[q]) return { name: q, ...QUALITY[q] };
  const gpu = gpuName();
  let name = 'high';
  if (IS_MOBILE || /CrOS/.test(navigator.userAgent) || /Intel|Mali|Adreno|PowerVR|Apple GPU/i.test(gpu)) name = 'medium';
  if (/SwiftShader|llvmpipe|Software/i.test(gpu)) name = 'low';
  // if a previous session had to fall back, start there
  const order = ['low', 'medium', 'high', 'ultra'];
  const cap = SAVE.settings.autoCap;
  if (cap && order.indexOf(cap) < order.indexOf(name)) name = cap;
  return { name, gpu, ...QUALITY[name] };
}

export { IS_TOUCH, resolveQuality };
