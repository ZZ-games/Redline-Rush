// Save data: defaults, loading, merging and persisting to localStorage.

/* ============================== save data ============================== */
const SAVE_KEY = 'redline-rush-save-v1';
const Store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
};
const DEFAULT_SETTINGS = {
  quality: 'auto', master: 0.8, music: 0.55, sfx: 0.85, shake: true, calm: false,
  units: 'kmh', touch: 'auto', autoGas: true, assist: 0.55, cam: 0,
};
function newSave() {
  return {
    v: 1, cash: 1500, xp: 0, level: 1, car: 'volt',
    cars: { volt: { up: { engine: 0, nitro: 0, grip: 0, armor: 0 }, paint: 0, glow: 1 } },
    paints: [0, 1, 2, 3, 4], glows: [0, 1, 2],
    best: { heat: 0, drift: 0, free: 0 },
    daily: { date: '', best: 0 },
    streak: { last: '', days: 0 },
    stats: { runs: 0, dist: 0, nearMiss: 0, razor: 0, driftDist: 0, takedowns: 0, topKmh: 0, maxMult: 0,
      od: 0, jackpots: 0, bestChain: 0, airMax: 0, driftMax: 0, bestScore: 0, districts: 0 },
    ach: {}, settings: { ...DEFAULT_SETTINGS }, crates: 0,
  };
}
function deepMerge(base, over) {
  for (const k in over) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) deepMerge(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}
function loadSave() {
  const raw = Store.get(SAVE_KEY);
  if (!raw) return newSave();
  try { return deepMerge(newSave(), JSON.parse(raw)); } catch (e) { return newSave(); }
}
let SAVE = loadSave();
function persist() { Store.set(SAVE_KEY, JSON.stringify(SAVE)); }
function resetSave() { const keep = SAVE.settings; SAVE = newSave(); SAVE.settings = keep; } // keeps settings, wipes progress
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export { SAVE, persist, resetSave, todayKey };
