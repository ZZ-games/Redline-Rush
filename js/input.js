// Keyboard, touch and gamepad input.
import { clamp } from './util.js';
import { SAVE } from './save.js';

/* ============================== input ============================== */
const INPUT = { k: {}, t: { left: 0, right: 0, gas: 0, brake: 0, drift: 0, boost: 0 }, steer: 0, gas: 0, brake: 0, drift: 0, boost: 0, usingTouch: false, pad: null };
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'drift', ShiftRight: 'drift', KeyK: 'drift', Space: 'boost', KeyJ: 'boost', KeyN: 'boost',
};
function pollInput() {
  const k = INPUT.k, t = INPUT.t;
  let steer = ((k.right || t.right) ? 1 : 0) - ((k.left || t.left) ? 1 : 0);
  let gas = k.gas || t.gas ? 1 : 0, brake = k.brake || t.brake ? 1 : 0, drift = k.drift || t.drift ? 1 : 0, boost = k.boost || t.boost ? 1 : 0;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = clamp(ax * 1.15, -1, 1);
    if (gp.buttons[14]?.pressed) steer = -1; if (gp.buttons[15]?.pressed) steer = 1;
    const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
    if (rt > 0.1) gas = Math.max(gas, rt); if (lt > 0.1) brake = Math.max(brake, lt);
    if (gp.buttons[0]?.pressed) boost = 1; if (gp.buttons[2]?.pressed || gp.buttons[5]?.pressed || gp.buttons[4]?.pressed) drift = 1;
    if (gp.buttons[9]?.pressed && !INPUT._startHeld) { INPUT._startHeld = true; window.dispatchEvent(new CustomEvent('pad-start')); }
    if (!gp.buttons[9]?.pressed) INPUT._startHeld = false;
    INPUT.pad = gp;
  }
  if (INPUT.usingTouch && SAVE.settings.autoGas) gas = brake ? 0 : 1;
  INPUT.steer = steer; INPUT.gas = gas; INPUT.brake = brake; INPUT.drift = drift; INPUT.boost = boost;
}

export { INPUT, KEYMAP, pollInput };
