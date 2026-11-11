// Game content tables: paints, glows, cars, upgrades, modes, daily twists, achievements.
import { SAVE } from './save.js';

/* ============================== content tables ============================== */
const PAINTS = [
  { name: 'Redline', c: 0xc40a22, m: 0.55, r: 0.26 },
  { name: 'Midnight', c: 0x0c1020, m: 0.7, r: 0.22 },
  { name: 'Arctic', c: 0xdfe4ec, m: 0.3, r: 0.3 },
  { name: 'Volt Yellow', c: 0xf0b800, m: 0.45, r: 0.28 },
  { name: 'Electric Blue', c: 0x0a45e0, m: 0.6, r: 0.24 },
  { name: 'Toxic', c: 0x2fd400, m: 0.45, r: 0.28, lvl: 5 },
  { name: 'Sunset', c: 0xff4a00, m: 0.5, r: 0.26, lvl: 8 },
  { name: 'Violet', c: 0x5a14e8, m: 0.65, r: 0.22, lvl: 11 },
  { name: 'Stealth Matte', c: 0x18181b, m: 0.2, r: 0.72, cc: 0.0, lvl: 14 },
  { name: 'Rose Gold', c: 0xe0a08c, m: 0.95, r: 0.22, crate: true },
  { name: 'Chrome', c: 0xe8e8e8, m: 1.0, r: 0.04, crate: true },
  { name: 'Gold Rush', c: 0xffb21f, m: 1.0, r: 0.14, crate: true },
  { name: 'Prism', c: 0x1e2cff, m: 0.8, r: 0.18, irid: 1, crate: true },
  { name: 'Neon Pulse', c: 0x08060c, m: 0.4, r: 0.3, em: 0xff1e78, lvl: 25 },
  { name: 'Cyan Ghost', c: 0x06202a, m: 0.5, r: 0.25, em: 0x00d8ff, crate: true },
  { name: 'Carbon', c: 0x121212, m: 0.35, r: 0.42, lvl: 18 },
];
const GLOWS = [null, 0xff1e4a, 0x00d8ff, 0x8a2bff, 0x22ff88, 0xffaa00, 0xffffff, 0xff00d0];
const GLOW_NAMES = ['Off', 'Red', 'Cyan', 'Purple', 'Green', 'Amber', 'White', 'Magenta'];

const CARS = [
  { id: 'volt', name: 'Volt GT', cls: 'Street', style: 'super', level: 1, price: 0, top: 290, accel: 21, handling: 2.05, drift: 1.0, boost: 3.4, paint: 0, desc: 'Balanced and forgiving. Learns you the ropes.' },
  { id: 'rook', name: 'Rook S', cls: 'Street', style: 'tuner', level: 2, price: 4000, top: 300, accel: 22, handling: 2.35, drift: 0.95, boost: 3.2, paint: 2, desc: 'Light hatch with razor turn-in.' },
  { id: 'brawler', name: 'Brawler V8', cls: 'Muscle', style: 'muscle', level: 4, price: 9000, top: 318, accel: 24, handling: 1.85, drift: 1.12, boost: 4.4, armor: 1, paint: 3, desc: 'Huge torque, long boost, built to take hits.' },
  { id: 'kaiju', name: 'Kaiju R', cls: 'Drift', style: 'drift', level: 6, price: 15000, top: 310, accel: 22, handling: 2.4, drift: 1.45, boost: 3.6, paint: 5, desc: 'Loose rear end. Drifts pay 30% more.' },
  { id: 'ion', name: 'Ion Arc', cls: 'Electric', style: 'ev', level: 9, price: 24000, top: 328, accel: 30, handling: 2.2, drift: 1.05, boost: 3.8, regen: true, paint: 2, desc: 'Instant torque. Boost slowly recharges itself.' },
  { id: 'spectre', name: 'Spectre', cls: 'Hyper', style: 'super2', level: 12, price: 38000, top: 348, accel: 26, handling: 2.25, drift: 1.15, boost: 4.0, paint: 1, desc: 'Wind-tunnel hypercar with a planted chassis.' },
  { id: 'nova', name: 'Nova X', cls: 'Hyper', style: 'hyper', level: 16, price: 60000, top: 372, accel: 27, handling: 2.15, drift: 1.1, boost: 4.2, paint: 6, desc: 'The fastest road car in the city.' },
  { id: 'phantom', name: 'Phantom LM', cls: 'Prototype', style: 'proto', level: 20, price: 95000, top: 398, accel: 31, handling: 2.45, drift: 1.2, boost: 4.6, paint: 7, desc: 'A race prototype that should not be on the street.' },
];
const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
const UPGRADES = [
  { key: 'engine', name: 'Engine', desc: '+top speed, +acceleration' },
  { key: 'nitro', name: 'Nitro', desc: '+boost tank, +boost power' },
  { key: 'grip', name: 'Grip', desc: '+handling, bigger wing' },
  { key: 'armor', name: 'Armor', desc: 'Smaller crash penalty. Lv 5: shield' },
];
function upgradeCost(car, lvl) { const tier = CARS.indexOf(car); return Math.round(((700 + tier * 450) * Math.pow(lvl + 1, 1.55)) / 50) * 50; }
function carState(id) {
  if (!SAVE.cars[id]) return null;
  const s = SAVE.cars[id];
  s.up = { engine: 0, nitro: 0, grip: 0, armor: 0, ...(s.up || {}) };
  if (!(s.paint >= 0 && s.paint < PAINTS.length)) s.paint = carById(id).paint;
  if (!(s.glow >= 0 && s.glow < GLOWS.length)) s.glow = 1;
  return s;
}
function carStats(id) {
  const c = carById(id), st = carState(id) || { up: { engine: 0, nitro: 0, grip: 0, armor: 0 } };
  const u = st.up;
  return {
    top: (c.top * (1 + u.engine * 0.035)) / 3.6,
    accel: c.accel * (1 + u.engine * 0.05),
    handling: c.handling * (1 + u.grip * 0.045),
    drift: c.drift,
    boostCap: c.boost + u.nitro * 0.45,
    boostPow: 1 + u.nitro * 0.05,
    armor: u.armor + (c.armor || 0),
    regen: !!c.regen,
    wing: u.grip,
  };
}
const xpNeed = (lvl) => Math.round(900 + 380 * Math.pow(lvl - 1, 1.32));

const MODES = {
  heat: { id: 'heat', name: 'Heat Run', desc: 'Beat the clock. Checkpoints add time. Traffic thickens the further you go.', lvl: 1, time: 60 },
  drift: { id: 'drift', name: 'Drift King', desc: '90 seconds on twisting roads. Drift points count triple.', lvl: 3, time: 90 },
  daily: { id: 'daily', name: 'Daily Run', desc: 'One road, one twist, the same for everyone today. Keep your streak alive.', lvl: 2, time: 75 },
  free: { id: 'free', name: 'Cruise', desc: 'No clock, light traffic. Drive the five districts at your own pace.', lvl: 1, time: 0 },
};
const DAILY_MODS = [
  { id: 'boost2', name: 'Double Boost', desc: 'Every stunt fills twice the boost.' },
  { id: 'rush', name: 'Rush Hour', desc: '60% more traffic, 50% more points.' },
  { id: 'lowg', name: 'Low Gravity', desc: 'Jumps float. Air points doubled.' },
  { id: 'ice', name: 'Black Ice', desc: 'Less grip, longer drifts.' },
  { id: 'gold', name: 'Gold Fever', desc: 'Golden cars everywhere.' },
  { id: 'hyper', name: 'Overclock', desc: '+15% top speed for every car.' },
];

const ACH = [
  { id: 'first', name: 'Ignition', desc: 'Finish your first run', cash: 500 },
  { id: 'k300', name: 'Triple Ton', desc: 'Hit 300 km/h', cash: 750 },
  { id: 'k400', name: 'Four Hundred Club', desc: 'Hit 400 km/h', cash: 2500 },
  { id: 'k500', name: 'Ludicrous', desc: 'Hit 500 km/h in Overdrive', cash: 4000 },
  { id: 'nm1', name: 'Close Call', desc: 'Pull off a near miss', cash: 300 },
  { id: 'nm100', name: 'Thread the Needle', desc: '100 near misses total', cash: 3000 },
  { id: 'razor10', name: 'Razor Edge', desc: '10 razor misses total', cash: 2000 },
  { id: 'x5', name: 'Combo Starter', desc: 'Reach a x5 chain', cash: 600 },
  { id: 'x10', name: 'Maxed Out', desc: 'Reach a x10 chain', cash: 2500 },
  { id: 'bank50', name: 'Big Banker', desc: 'Bank 50,000 in one chain', cash: 3000 },
  { id: 'drift5s', name: 'Endless Slide', desc: 'Hold one drift for 5 seconds', cash: 1500 },
  { id: 'drift10k', name: 'Sideways', desc: 'Drift 10 km total', cash: 3000 },
  { id: 'air2', name: 'Airborne', desc: 'Stay in the air for 2 seconds', cash: 1200 },
  { id: 'od1', name: 'Overdrive', desc: 'Trigger Overdrive', cash: 1500 },
  { id: 'td10', name: 'Wrecking Ball', desc: '10 takedowns total', cash: 2500 },
  { id: 'gold', name: 'Golden Ticket', desc: 'Smash a golden car', cash: 3000 },
  { id: 'tour', name: 'World Tour', desc: 'Reach all 5 districts in one run', cash: 5000 },
  { id: 's100k', name: 'Six Figures', desc: 'Score 100,000 in one run', cash: 2000 },
  { id: 's500k', name: 'Half a Million', desc: 'Score 500,000 in one run', cash: 6000 },
  { id: 's1m', name: 'Millionaire', desc: 'Score 1,000,000 in one run', cash: 12000 },
  { id: 'd100', name: 'Road Warrior', desc: 'Drive 100 km total', cash: 4000 },
  { id: 'lv10', name: 'Rising Star', desc: 'Reach driver level 10', cash: 5000 },
  { id: 'cars3', name: 'Collector', desc: 'Own 3 cars', cash: 3000 },
  { id: 'maxup', name: 'Fully Loaded', desc: 'Max out any upgrade', cash: 4000 },
  { id: 'streak3', name: 'Habit Forming', desc: 'Play the Daily Run 3 days in a row', cash: 3000 },
];

export { ACH, CARS, DAILY_MODS, GLOWS, GLOW_NAMES, MODES, PAINTS, UPGRADES, carById, carState, carStats, upgradeCost, xpNeed };
