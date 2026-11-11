// Achievement checks.
import { SAVE } from './save.js';
import { ACH } from './content.js';

/* ============================== achievements ============================== */
function checkAchievements(R) {
  const S = SAVE.stats, got = [];
  const test = {
    first: S.runs >= 1, k300: S.topKmh >= 300, k400: S.topKmh >= 400, k500: S.topKmh >= 500, nm1: S.nearMiss >= 1, nm100: S.nearMiss >= 100, razor10: S.razor >= 10,
    x5: S.maxMult >= 5, x10: S.maxMult >= 10, bank50: S.bestChain >= 50000, drift5s: S.driftMax >= 5, drift10k: S.driftDist >= 10000, air2: S.airMax >= 2,
    od1: S.od >= 1, td10: S.takedowns >= 10, gold: S.jackpots >= 1, tour: S.districts >= 5, s100k: S.bestScore >= 100000, s500k: S.bestScore >= 500000,
    s1m: S.bestScore >= 1000000, d100: S.dist >= 100000, lv10: SAVE.level >= 10, cars3: Object.keys(SAVE.cars).length >= 3,
    maxup: Object.values(SAVE.cars).some((c) => Object.values(c.up).some((v) => v >= 5)), streak3: SAVE.streak.days >= 3,
  };
  for (const a of ACH) if (!SAVE.ach[a.id] && test[a.id]) { SAVE.ach[a.id] = Date.now(); SAVE.cash += a.cash; got.push(a); }
  return got;
}

export { checkAchievements };
