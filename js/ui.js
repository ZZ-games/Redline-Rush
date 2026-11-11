// All menus and screens: main menu, modes, garage, career, settings, pause, results, crates.
import { $, clamp, fmt, mulberry32 } from './util.js';
import { SAVE, persist, resetSave, todayKey } from './save.js';
import { ACH, CARS, DAILY_MODS, GLOWS, GLOW_NAMES, MODES, PAINTS, UPGRADES, carById, carState, carStats, upgradeCost, xpNeed } from './content.js';
import { IS_TOUCH } from './quality.js';
import { BIOMES, GATE_SPACING } from './districts.js';
import { AUDIO } from './audio.js';
import { INPUT } from './input.js';
import { CHAIN_TIME, TIERS } from './game.js';
import { checkAchievements } from './achievements.js';
import { SHOWROOM } from './showroom.js';

/* ============================== UI ============================== */
const SCREENS = ['scr-boot', 'scr-menu', 'scr-modes', 'scr-garage', 'scr-career', 'scr-settings', 'scr-pause', 'scr-results'];
const speedUnit = () => (SAVE.settings.units === 'mph' ? { k: 2.23694, u: 'MPH' } : { k: 3.6, u: 'KM/H' });
const money = (n) => `$${fmt(n)}`;

const UI = {
  game: null, cur: null, stack: [], last: {}, garageSel: null,
  init(game) {
    this.game = game;
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { AUDIO.uiBack(); this.back(); }));
    $('menu-nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; AUDIO.ui(); this.go(b.dataset.go); });
    $('btn-pause').addEventListener('click', () => this.pause());
    document.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { AUDIO.ui(); this.pauseAction(b.dataset.p); }));
    this.bindTouch();
  },
  show(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
    this.cur = id;
    const f = $(id)?.querySelector('button, [tabindex]'); if (f && !IS_TOUCH) setTimeout(() => f.focus({ preventScroll: true }), 30);
  },
  hideAll() { for (const s of SCREENS) $(s).hidden = true; this.cur = null; },
  go(where) {
    if (where === 'modes') { this.stack.push('scr-menu'); this.renderModes(); this.show('scr-modes'); }
    else if (where === 'garage') { this.stack.push('scr-menu'); this.openGarage(); }
    else if (where === 'career') { this.stack.push('scr-menu'); this.renderCareer(); this.show('scr-career'); }
    else if (where === 'settings') { this.stack.push(this.cur); this.renderSettings(); this.show('scr-settings'); }
  },
  back() {
    const prev = this.stack.pop() || 'scr-menu';
    if (this.cur === 'scr-garage') this.closeGarage();
    if (prev === 'scr-pause') { this.show('scr-pause'); return; }
    if (prev === 'scr-results') { this.show('scr-results'); return; }
    this.toMenu();
  },
  toMenu() {
    $('hud').hidden = true;
    if (this.game.state !== 'attract') this.game.startAttract();
    this.renderMenu(); this.show('scr-menu'); this.stack = [];
  },
  renderMenu() {
    const lv = SAVE.level, need = xpNeed(lv);
    const nextCar = CARS.find((c) => c.level > lv);
    $('driver-card').innerHTML = `
      <div class="row"><div><div class="lbl">Driver level</div><div class="lv num">${lv}</div></div><div style="text-align:right"><div class="lbl">Cash</div><div class="cash num">${money(SAVE.cash)}</div></div></div>
      <div class="xpbar"><i style="width:${(SAVE.xp / need) * 100}%"></i></div>
      <div class="row"><span class="lbl num">${fmt(SAVE.xp)} / ${fmt(need)} XP</span>${SAVE.crates ? `<span class="lbl" style="color:var(--gold)">${SAVE.crates} crate${SAVE.crates > 1 ? 's' : ''} ready</span>` : ''}</div>
      ${nextCar ? `<div class="next">Level ${nextCar.level} unlocks ${nextCar.name}</div>` : ''}`;
    $('menu-hint').innerHTML = IS_TOUCH ? 'Hold the arrows to steer, tap DRIFT while turning to slide, and BOOST when the bar is full. The gas is automatic.'
      : 'Near-miss traffic, drift and catch air to build a chain up to x10. Every stunt fills boost. Fill it three times in one chain to unlock Overdrive.';
  },
  renderModes() {
    const box = $('mode-list'); box.innerHTML = '';
    const mods = DAILY_MODS[mulberry32(parseInt(todayKey().replace(/-/g, ''), 10) + 3)() * DAILY_MODS.length | 0];
    for (const m of Object.values(MODES)) {
      const locked = SAVE.level < m.lvl;
      const best = m.id === 'daily' ? (SAVE.daily.date === todayKey() ? SAVE.daily.best : 0) : SAVE.best[m.id] || 0;
      const b = document.createElement('button'); b.className = 'mode' + (locked ? ' locked' : '');
      b.innerHTML = `<span class="stripe"></span>${m.id === 'daily' ? `<span class="badge">${mods.name}</span>` : ''}
        <span class="n">${m.name}</span><span class="d">${m.desc}${m.id === 'daily' ? `<br><b style="color:var(--text)">Today: ${mods.desc}</b>` : ''}</span>
        <span class="meta"><span>${locked ? `Unlocks at level ${m.lvl}` : m.time ? `${m.time} sec clock` : 'No clock'}</span><span>${m.id === 'daily' ? `Streak ${SAVE.streak.days}` : ''}</span></span>
        <span class="meta"><span>Best</span><b class="num">${fmt(best)}</b></span>`;
      b.addEventListener('click', () => { if (locked) { AUDIO.uiBack(); return; } AUDIO.ui(); this.startRun(m.id); });
      box.appendChild(b);
    }
  },
  startRun(id) {
    this.lastMode = id; this.hideAll(); this.stack = [];
    $('hud').hidden = false;
    this.game.startRun(id);
  },
  onRunStart(g) {
    this.last = {};
    $('h-pops').innerHTML = ''; $('h-big').innerHTML = '';
    $('h-timer').parentElement.style.visibility = g.modeDef.time ? 'visible' : 'hidden';
    const best = g.mode === 'daily' ? (SAVE.daily.date === todayKey() ? SAVE.daily.best : 0) : SAVE.best[g.mode] || 0;
    $('h-best').textContent = `Best ${fmt(best)}`;
    const touch = SAVE.settings.touch === 'on' || (SAVE.settings.touch === 'auto' && IS_TOUCH);
    $('touch').hidden = !touch; document.body.classList.toggle('touch', touch); INPUT.usingTouch = touch;
    const hint = $('h-hint'); hint.style.opacity = 1; clearTimeout(this._hintT); this._hintT = setTimeout(() => (hint.style.opacity = 0), 9000);
    this.odCharge(0);
    if (g.mod) { const d = DAILY_MODS.find((x) => x.id === g.mod); setTimeout(() => this.big(d.name, 'cyan', d.desc), 200); }
  },

  /* ---------- HUD ---------- */
  set(id, v) { if (this.last[id] !== v) { this.last[id] = v; $(id).textContent = v; } },
  hud(g) {
    const P = g.p, R = g.run, U = speedUnit();
    if (!R) return;
    this.set('h-score', fmt(R.score));
    const ch = g.chain;
    const chainOn = ch.pts > 0 || P.drifting;
    if (this.last.chainOn !== chainOn) { this.last.chainOn = chainOn; $('h-chain').style.opacity = chainOn ? 1 : 0; }
    this.set('h-mult', `x${ch.mult}`);
    this.set('h-chainpts', `+${fmt(ch.pts + (P.drifting ? P.driftPts * ch.mult : 0))}`);
    const ring = Math.round((1 - clamp(ch.timer / CHAIN_TIME, 0, 1)) * 62.8);
    if (this.last.ring !== ring) { this.last.ring = ring; $('h-ring').setAttribute('stroke-dashoffset', ring); }
    if (g.modeDef.time) {
      const t = R.time; this.set('h-timer', t >= 10 ? t.toFixed(0) : t.toFixed(1));
      const warn = t < 10; if (this.last.warn !== warn) { this.last.warn = warn; $('h-timer').classList.toggle('warn', warn); }
    }
    const nextGate = (Math.floor(P.s / GATE_SPACING) + 1) * GATE_SPACING;
    const T = g.world.track; const isD = nextGate % T.dlen === 0;
    this.set('h-cp', `${isD ? BIOMES[T.biomeAt(nextGate + 1).a].name : 'Checkpoint'} in ${((nextGate - P.s) / 1000).toFixed(1)} km`);
    const bi = T.biomeAt(P.s); const B = BIOMES[bi.t > 0.5 ? bi.b : bi.a];
    this.set('h-district', B.name);
    const spd = Math.round(P.v * U.k); this.set('h-speed', String(spd)); this.set('h-unit', U.u);
    this.set('h-gear', String(P.gear));
    const arc = Math.round(260 * (1 - clamp((P.v * 3.6) / 420, 0, 1)));
    if (this.last.arc !== arc) { this.last.arc = arc; $('h-arc').setAttribute('stroke-dashoffset', arc); }
    let tier = 0; for (let i = TIERS.length - 1; i >= 0; i--) if (P.v * 3.6 >= TIERS[i].k) { tier = i; break; }
    this.set('h-tier', P.od > 0 ? 'OVERDRIVE' : TIERS[tier].name);
    const bw = `${Math.round(P.boost * 100)}%`; if (this.last.bw !== bw) { this.last.bw = bw; $('h-boost').style.width = bw; }
    const bcls = P.od > 0 ? 'boost-bar od' : P.boost >= 0.999 ? 'boost-bar full' : 'boost-bar';
    if (this.last.bcls !== bcls) { this.last.bcls = bcls; $('h-boostbar').className = bcls; }
    const lv = `LV ${SAVE.level}`; this.set('h-lvl', lv);
    const xpw = `${Math.round(clamp((SAVE.xp + R.score / 18) / xpNeed(SAVE.level), 0, 1) * 100)}%`;
    if (this.last.xpw !== xpw) { this.last.xpw = xpw; $('h-xp').style.width = xpw; }
    const left = Math.max(0, xpNeed(SAVE.level) - SAVE.xp - R.score / 18);
    const nextCar = CARS.find((c) => c.level === SAVE.level + 1);
    this.set('h-unlock', left > 0 ? `${fmt(left)} XP to level ${SAVE.level + 1}${nextCar ? ' · ' + nextCar.name : ''}` : 'Level up at the finish');
    const edge = P.od > 0 ? 0.8 : 0; if (this.last.edge !== edge) { this.last.edge = edge; $('fx-edge').style.opacity = edge; }
    $('fx-flash').style.opacity = SAVE.settings.calm ? 0 : g.flash * 0.35;
  },
  pop(label, pts, color = 'white') {
    const box = $('h-pops');
    const d = document.createElement('div'); d.className = `pop ${color}`;
    d.innerHTML = `${label}${pts ? `<small class="num">${pts > 0 ? '+' : ''}${fmt(pts)}</small>` : ''}`;
    box.appendChild(d); while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => d.remove(), 1500);
  },
  big(text, color = 'red', sub = '') {
    const box = $('h-big');
    let dc = '';
    if (color === 'district') { const b = BIOMES.find((x) => x.name === text); dc = b ? b.accent : '#fff'; }
    box.innerHTML = `<div><span class="t ${color}" style="--dc:${dc}">${text}</span>${sub ? `<span class="s" style="color:${dc || 'var(--text)'}">${sub}</span>` : ''}</div>`;
  },
  count(t) { $('h-count').innerHTML = `<span>${t}</span>`; },
  tier(name) { this.big(name, 'cyan', 'SPEED BONUS'); },
  odCharge(n) {
    const el = $('h-od'); [...el.children].forEach((b, i) => b.classList.toggle('on', i < n));
    el.classList.toggle('ready', n >= 3);
  },
  toast(title, text) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<div><b>${title}</b><span>${text}</span></div>`; $('h-toasts').appendChild(t); setTimeout(() => t.remove(), 3700);
  },

  /* ---------- pause ---------- */
  pause() {
    const g = this.game; if (!['race', 'countdown'].includes(g.state)) return;
    this.prevState = g.state; g.state = 'paused';
    $('pause-sub').textContent = `${MODES[g.mode].name}${g.mod ? ' · ' + DAILY_MODS.find((x) => x.id === g.mod).name : ''}`;
    $('p-finish').hidden = g.mode !== 'free';
    this.show('scr-pause'); AUDIO.silenceEngine();
  },
  resume() { const g = this.game; if (g.state !== 'paused') return; g.state = this.prevState || 'race'; this.hideAll(); },
  pauseAction(a) {
    const g = this.game;
    if (a === 'resume') this.resume();
    else if (a === 'restart') { this.hideAll(); g.state = 'race'; this.startRun(g.mode); }
    else if (a === 'finish') { this.hideAll(); g.state = 'race'; g.endRun('RUN COMPLETE'); }
    else if (a === 'settings') { this.stack.push('scr-pause'); this.renderSettings(); this.show('scr-settings'); }
    else if (a === 'quit') { this.hideAll(); g.state = 'race'; g.run = null; this.toMenu(); }
  },

  /* ---------- results ---------- */
  showResults(g, res) {
    const R = g.run, U = speedUnit();
    $('hud').hidden = true;
    const near = this.closeGoals(R);
    const lvlHtml = res.levels.length ? `<div class="levelup">Level ${res.levels[res.levels.length - 1].level}!</div><div class="items">${res.levels.flatMap((l) => [`$${fmt(l.cash)} level bonus`, ...l.items]).map((x) => `<div>${x}</div>`).join('')}</div>` : '';
    const achHtml = res.ach.length ? `<div class="card"><div class="sub">Badges earned</div><div class="items">${res.ach.map((a) => `<div>${a.name} · ${money(a.cash)}</div>`).join('')}</div></div>` : '';
    $('res-body').innerHTML = `
      <div class="head"><div><div class="reason">${res.reason}</div><div class="total num" id="res-total">0</div></div>${res.best ? '<div class="newbest">New best</div>' : ''}</div>
      <div class="card"><div class="sub">${MODES[g.mode].name}${g.mod ? ' · ' + DAILY_MODS.find((x) => x.id === g.mod).name : ''}</div>
        <div class="rows">
          <div><span>Distance</span><b>${res.distKm.toFixed(2)} km</b></div>
          <div><span>Top speed</span><b>${Math.round(R.topKmh / 3.6 * U.k)} ${U.u.toLowerCase()}</b></div>
          <div><span>Near misses</span><b>${R.nearMiss}${R.razor ? ` (${R.razor} razor)` : ''}</b></div>
          <div><span>Best chain</span><b>${fmt(R.bestChain)} · x${R.maxMult}</b></div>
          <div><span>Longest drift</span><b>${R.driftMax.toFixed(1)} s</b></div>
          <div><span>Biggest air</span><b>${R.airMax.toFixed(1)} s</b></div>
          <div><span>Takedowns</span><b>${R.takedowns}</b></div>
          <div><span>Districts</span><b>${R.districts.size} of 5</b></div>
          <div><span>Checkpoints</span><b>${R.gates}</b></div>
        </div></div>
      <div style="display:grid;gap:16px;align-content:start">
        <div class="card"><div class="sub">Rewards</div>
          <div class="reward"><span class="lbl">Cash</span><span class="big2 gold num">+${money(res.cash)}</span></div>
          <div class="reward"><span class="lbl">XP</span><span class="big2 cyan num">+${fmt(res.xp)}</span></div>
          <div class="xpbar" style="width:100%;height:7px"><i id="res-xp" style="width:${(res.before.xp / xpNeed(res.before.level)) * 100}%;transition:width 1.2s ease-out"></i></div>
          ${lvlHtml}
        </div>
        ${achHtml}
        <div class="card"><div class="sub">You're close to</div><div class="close">${near.map((n) => `<div class="g"><div style="display:flex;justify-content:space-between"><span>${n.t}</span><span class="lbl">${n.r}</span></div><div class="bar"><i style="width:${Math.round(n.p * 100)}%"></i></div></div>`).join('')}</div></div>
      </div>
      <div class="actions">
        <button class="btn" id="res-again">Race again${IS_TOUCH ? '' : ' (Enter)'}</button>
        ${SAVE.crates ? `<button class="btn gold" id="res-crate">Open crate (${SAVE.crates})</button>` : ''}
        <button class="btn ghost" id="res-garage">Garage</button>
        <button class="btn ghost" id="res-menu">Menu</button>
      </div>`;
    this.show('scr-results');
    // count-up
    const el = $('res-total'), target = Math.round(R.score), t0 = performance.now();
    const tick = (now) => { const k = clamp((now - t0) / 1300, 0, 1); el.textContent = fmt(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); else AUDIO.bank(); };
    requestAnimationFrame(tick);
    let ci = 0; const coinT = setInterval(() => { AUDIO.coin(ci++); if (ci > 8) clearInterval(coinT); }, 120);
    setTimeout(() => { const x = $('res-xp'); if (x) x.style.width = `${(SAVE.xp / xpNeed(SAVE.level)) * 100}%`; if (res.levels.length) AUDIO.levelUp(); }, 400);
    res.ach.forEach((a, i) => setTimeout(() => this.toast('Badge earned', `${a.name} · ${money(a.cash)}`), 600 + i * 900));
    $('res-again').onclick = () => { AUDIO.ui(); this.startRun(g.mode); };
    $('res-garage').onclick = () => { AUDIO.ui(); this.stack = ['scr-menu']; g.startAttract(); this.openGarage(); };
    $('res-menu').onclick = () => { AUDIO.uiBack(); this.toMenu(); };
    if ($('res-crate')) $('res-crate').onclick = () => this.openCrate(() => this.showResults(g, res));
  },
  closeGoals(R) {
    const out = [];
    out.push({ t: `Level ${SAVE.level + 1}`, r: `${fmt(xpNeed(SAVE.level) - SAVE.xp)} XP to go`, p: SAVE.xp / xpNeed(SAVE.level) });
    const nextCar = CARS.find((c) => !SAVE.cars[c.id] && SAVE.level >= c.level) || CARS.find((c) => !SAVE.cars[c.id]);
    if (nextCar) out.push({ t: nextCar.name, r: SAVE.level < nextCar.level ? `Level ${nextCar.level}` : SAVE.cash >= nextCar.price ? 'Ready to buy' : `${money(nextCar.price - SAVE.cash)} more`, p: SAVE.level < nextCar.level ? SAVE.level / nextCar.level : clamp(SAVE.cash / nextCar.price, 0, 1) });
    const S = SAVE.stats;
    const prog = {
      nm100: [S.nearMiss, 100], razor10: [S.razor, 10], x10: [S.maxMult, 10], drift10k: [S.driftDist, 10000], td10: [S.takedowns, 10], d100: [S.dist, 100000],
      s100k: [S.bestScore, 100000], s500k: [S.bestScore, 500000], s1m: [S.bestScore, 1000000], tour: [S.districts, 5], k300: [S.topKmh, 300], k400: [S.topKmh, 400],
    };
    const cands = ACH.filter((a) => !SAVE.ach[a.id] && prog[a.id]).map((a) => ({ a, p: clamp(prog[a.id][0] / prog[a.id][1], 0, 0.99) })).sort((x, y) => y.p - x.p);
    if (cands[0]) out.push({ t: cands[0].a.name, r: cands[0].a.desc, p: cands[0].p });
    return out.slice(0, 3);
  },
  openCrate(after) {
    if (SAVE.crates <= 0) return;
    SAVE.crates--;
    const r = Math.random(); let prize;
    const lockedPaints = PAINTS.map((p, i) => i).filter((i) => PAINTS[i].crate && !SAVE.paints.includes(i));
    const lockedGlows = GLOWS.map((g, i) => i).filter((i) => i > 0 && !SAVE.glows.includes(i));
    if (r < 0.3 && lockedPaints.length) { const i = lockedPaints[(Math.random() * lockedPaints.length) | 0]; SAVE.paints.push(i); prize = { k: 'Rare paint', v: PAINTS[i].name }; }
    else if (r < 0.55 && lockedGlows.length) { const i = lockedGlows[(Math.random() * lockedGlows.length) | 0]; SAVE.glows.push(i); prize = { k: 'Underglow', v: GLOW_NAMES[i] }; }
    else { const c = 1000 + Math.round(Math.random() * 8) * 500; SAVE.cash += c; prize = { k: 'Cash', v: money(c) }; }
    persist();
    const el = $('scr-crate'); el.hidden = false;
    el.innerHTML = '<div><div class="box"></div><div class="prize">Opening</div></div>';
    let n = 0; const t = setInterval(() => { AUDIO.coin(n++); }, 90);
    setTimeout(() => {
      clearInterval(t); AUDIO.levelUp();
      el.innerHTML = `<div><div class="box" style="animation:none;opacity:.25"></div><div class="prize"><small>${prize.k}</small>${prize.v}</div><button class="btn" style="margin-top:26px" id="crate-ok">Collect</button></div>`;
      $('crate-ok').onclick = () => { el.hidden = true; AUDIO.ui(); after && after(); };
      $('crate-ok').focus();
    }, 1400);
  },

  /* ---------- career ---------- */
  renderCareer() {
    const S = SAVE.stats, got = ACH.filter((a) => SAVE.ach[a.id]).length;
    const U = speedUnit();
    $('career-body').innerHTML = `
      <div class="card"><div class="sub">Driver</div><div class="statgrid">
        <div><b class="num">${SAVE.level}</b><span>Level</span></div><div><b class="num">${money(SAVE.cash)}</b><span>Cash</span></div>
        <div><b class="num">${fmt(S.bestScore)}</b><span>Best score</span></div><div><b class="num">${S.runs}</b><span>Runs</span></div>
        <div><b class="num">${(S.dist / 1000).toFixed(1)} km</b><span>Driven</span></div><div><b class="num">${Math.round(S.topKmh / 3.6 * U.k)}</b><span>Top ${U.u.toLowerCase()}</span></div>
        <div><b class="num">${fmt(S.nearMiss)}</b><span>Near misses</span></div><div><b class="num">${(S.driftDist / 1000).toFixed(1)} km</b><span>Drifted</span></div>
        <div><b class="num">${fmt(S.takedowns)}</b><span>Takedowns</span></div><div><b class="num">${fmt(S.bestChain)}</b><span>Best chain</span></div>
      </div>${SAVE.crates ? `<button class="btn gold" id="c-crate">Open crate (${SAVE.crates})</button>` : ''}</div>
      <div class="card"><div class="sub">Badges · ${got} of ${ACH.length}</div><div class="achs">${ACH.map((a) => `<div class="ach ${SAVE.ach[a.id] ? 'got' : ''}"><i class="ic"></i><div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div><span class="ac num">${money(a.cash)}</span></div>`).join('')}</div></div>`;
    if ($('c-crate')) $('c-crate').onclick = () => this.openCrate(() => this.renderCareer());
  },

  /* ---------- settings ---------- */
  renderSettings() {
    const s = SAVE.settings;
    const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const tog = (key) => `<button class="toggle ${s[key] ? 'on' : ''}" data-tog="${key}" aria-pressed="${!!s[key]}" aria-label="${key}"></button>`;
    const rng = (key, min, max, step) => `<input type="range" id="set-${key}" data-rng="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}">`;
    $('settings-body').innerHTML = `
      <h3>Settings</h3>
      <div class="setrow"><div>Graphics<small>Auto picks for your device. Changes apply after reload.</small></div>${seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High'], ['ultra', 'Ultra']])}</div>
      <div class="setrow" id="set-reload" hidden><div><small>Reload the game to switch graphics now. Your progress is saved.</small></div><button class="btn small" id="set-reload-btn">Reload</button></div>
      <div class="setrow"><div>Master volume</div>${rng('master', 0, 1, 0.05)}</div>
      <div class="setrow"><div>Music</div>${rng('music', 0, 1, 0.05)}</div>
      <div class="setrow"><div>Effects</div>${rng('sfx', 0, 1, 0.05)}</div>
      <div class="setrow"><div>Steering assist<small>Pulls the car straight when you let go</small></div>${rng('assist', 0, 1, 0.05)}</div>
      <div class="setrow"><div>Speed units</div>${seg('units', [['kmh', 'km/h'], ['mph', 'mph']])}</div>
      <div class="setrow"><div>Camera</div>${seg('cam', [[0, 'Chase'], [1, 'Far'], [2, 'Hood']])}</div>
      <div class="setrow"><div>Touch controls</div>${seg('touch', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']])}</div>
      <div class="setrow"><div>Auto gas on touch</div>${tog('autoGas')}</div>
      <div class="setrow"><div>Camera shake</div>${tog('shake')}</div>
      <div class="setrow"><div>Reduce flashing<small>Softer flashes and fewer slow-motion pulses</small></div>${tog('calm')}</div>
      <div class="setrow"><div>Reset progress<small>Erases cars, cash and badges on this device</small></div><button class="btn ghost small" id="set-reset">Reset</button></div>
      <button class="btn" data-back-set>Done</button>`;
    const body = $('settings-body');
    body.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const k = g.dataset.seg; let v = b.dataset.v; if (k === 'cam') v = Number(v);
      s[k] = v; g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); persist(); AUDIO.ui();
      if (k === 'cam') this.game.camMode = v;
      if (k === 'quality') { delete s.autoCap; persist(); const n = $('set-reload'); if (n) n.hidden = false; }
    }));
    body.querySelectorAll('[data-tog]').forEach((t) => t.addEventListener('click', () => { const k = t.dataset.tog; s[k] = !s[k]; t.classList.toggle('on', s[k]); t.setAttribute('aria-pressed', s[k]); persist(); AUDIO.ui(); }));
    body.querySelectorAll('[data-rng]').forEach((r) => r.addEventListener('input', () => { s[r.dataset.rng] = parseFloat(r.value); AUDIO.applyVolumes(); persist(); }));
    $('set-reload-btn').onclick = () => { persist(); location.reload(); };
    $('set-reset').onclick = () => {
      const b = $('set-reset');
      if (b.dataset.armed) { resetSave(); persist(); this.game.setCar(SAVE.car); b.textContent = 'Done'; delete b.dataset.armed; }
      else { b.dataset.armed = '1'; b.textContent = 'Tap to confirm'; }
    };
    body.querySelector('[data-back-set]').onclick = () => { AUDIO.ui(); this.back(); };
  },

  /* ---------- garage ---------- */
  openGarage() {
    this.game.state = 'garage'; this.garageSel = SAVE.car;
    $('hud').hidden = true;
    SHOWROOM.enter(this.garageSel);
    this.renderGarage(); this.show('scr-garage');
  },
  closeGarage() { SHOWROOM.exit(); this.game.setCar(SAVE.car); this.game.state = 'attract'; },
  renderGarage() {
    const sel = this.garageSel, def = carById(sel), owned = !!SAVE.cars[sel], cs = carState(sel);
    $('g-cash').textContent = money(SAVE.cash);
    $('g-list').innerHTML = CARS.map((c) => {
      const o = !!SAVE.cars[c.id]; const lock = SAVE.level < c.level;
      const st = SAVE.car === c.id ? '<span class="cs cur">Driving</span>' : o ? '<span class="cs own">Owned</span>' : lock ? `<span class="cs">Lv ${c.level}</span>` : `<span class="cs">${money(c.price)}</span>`;
      return `<button data-car="${c.id}" class="${c.id === sel ? 'sel' : ''}"><span class="cn">${c.name}</span>${st}<span class="cc">${c.cls}</span></button>`;
    }).join('');
    $('g-list').querySelectorAll('[data-car]').forEach((b) => b.addEventListener('click', () => { AUDIO.ui(); this.garageSel = b.dataset.car; SHOWROOM.show(this.garageSel); this.renderGarage(); }));
    const base = carStats(sel);
    const raw = { top: def.top, accel: def.accel, handling: def.handling, boost: def.boost };
    const maxs = { top: 420, accel: 34, handling: 2.8, boost: 7 };
    const statRow = (name, key, cur, unitTxt) => `<div class="stat"><span style="text-align:left;color:var(--mute)">${name}</span><div class="bar"><u style="width:${(cur / maxs[key]) * 100}%"></u><i style="width:${(raw[key] / maxs[key]) * 100}%"></i></div><span>${unitTxt}</span></div>`;
    const U = speedUnit();
    let action = '';
    if (SAVE.car === sel) action = '<button class="btn ghost" disabled>Driving this car</button>';
    else if (owned) action = '<button class="btn" id="g-act">Drive this car</button>';
    else if (SAVE.level < def.level) action = `<button class="btn" disabled>Unlocks at level ${def.level}</button>`;
    else action = `<button class="btn ${SAVE.cash >= def.price ? 'gold' : ''}" id="g-act" ${SAVE.cash >= def.price ? '' : 'disabled'}>Buy ${money(def.price)}</button>`;
    const ups = owned ? UPGRADES.map((u) => {
      const lvl = cs.up[u.key], cost = upgradeCost(def, lvl), max = lvl >= 5;
      return `<div class="upg"><div><div class="un">${u.name}</div><div class="ud">${u.desc}</div><div class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn small ${SAVE.cash >= cost && !max ? '' : 'ghost'}" data-up="${u.key}" ${max || SAVE.cash < cost ? 'disabled' : ''}>${max ? 'Max' : money(cost)}</button></div>`;
    }).join('') : '<p>Buy this car to upgrade it.</p>';
    const paints = PAINTS.map((p, i) => { const have = SAVE.paints.includes(i); const c = '#' + p.c.toString(16).padStart(6, '0'); const ring = p.em ? `box-shadow: inset 0 0 0 4px #${p.em.toString(16).padStart(6, '0')}` : ''; return `<button class="sw ${have ? '' : 'lock'} ${cs && cs.paint === i ? 'sel' : ''}" data-paint="${i}" title="${p.name}${have ? '' : p.lvl ? ` · level ${p.lvl}` : ' · crate'}" aria-label="${p.name}" style="background:${p.m >= 0.95 ? `linear-gradient(135deg, ${c}, #fff 45%, ${c})` : c};${ring}"></button>`; }).join('');
    const glows = GLOWS.map((g, i) => { const have = SAVE.glows.includes(i); const c = g ? '#' + g.toString(16).padStart(6, '0') : 'transparent'; return `<button class="sw ${have ? '' : 'lock'} ${cs && cs.glow === i ? 'sel' : ''}" data-glow="${i}" title="${GLOW_NAMES[i]}" aria-label="Underglow ${GLOW_NAMES[i]}" style="background:${c};${g ? `box-shadow:0 0 12px ${c}` : 'border-style:dashed'}"></button>`; }).join('');
    $('g-info').innerHTML = `
      <div class="card"><div class="sub">${def.cls}</div><h3>${def.name}</h3><p>${def.desc}</p>
        ${statRow('Top speed', 'top', base.top * 3.6, `${Math.round(base.top * U.k)}`)}
        ${statRow('Accel', 'accel', base.accel, base.accel.toFixed(0))}
        ${statRow('Handling', 'handling', base.handling, base.handling.toFixed(2))}
        ${statRow('Boost', 'boost', base.boostCap, `${base.boostCap.toFixed(1)}s`)}
        ${action}</div>
      ${owned ? `<div class="card"><div class="sub">Upgrades</div>${ups}</div>
      <div class="card"><div class="sub">Paint · <span class="swl" id="g-pn">${PAINTS[cs.paint].name}</span></div><div class="swatches">${paints}</div>
        <div class="sub" style="margin-top:6px">Underglow</div><div class="swatches">${glows}</div></div>` : `<div class="card"><div class="sub">Upgrades</div>${ups}</div>`}`;
    const act = $('g-act');
    if (act) act.onclick = () => {
      if (!owned) { if (SAVE.cash < def.price) return; SAVE.cash -= def.price; SAVE.cars[sel] = { up: { engine: 0, nitro: 0, grip: 0, armor: 0 }, paint: def.paint, glow: 1 }; AUDIO.levelUp(); checkAchievements({}); }
      else AUDIO.ui();
      SAVE.car = sel; persist(); this.renderGarage(); SHOWROOM.show(sel);
    };
    $('g-info').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.up, lvl = cs.up[k], cost = upgradeCost(def, lvl); if (SAVE.cash < cost || lvl >= 5) return;
      SAVE.cash -= cost; cs.up[k]++; persist(); AUDIO.coin(lvl); AUDIO.boostOn(); checkAchievements({});
      if (k === 'grip') SHOWROOM.show(sel); else SHOWROOM.pulse();
      this.renderGarage();
    }));
    $('g-info').querySelectorAll('[data-paint]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.paint; if (!SAVE.paints.includes(i)) { AUDIO.uiBack(); return; } cs.paint = i; persist(); AUDIO.ui(); SHOWROOM.paint(i); this.renderGarage(); }));
    $('g-info').querySelectorAll('[data-glow]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.glow; if (!SAVE.glows.includes(i)) { AUDIO.uiBack(); return; } cs.glow = i; persist(); AUDIO.ui(); SHOWROOM.glow(i); this.renderGarage(); }));
  },

  /* ---------- touch ---------- */
  bindTouch() {
    const map = new Map();
    const set = (el, on) => { INPUT.t[el.dataset.k] = on ? 1 : 0; el.classList.toggle('on', on); };
    document.querySelectorAll('.tbtn').forEach((el) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); map.set(e.pointerId, el); set(el, true); INPUT.usingTouch = true; });
      const up = (e) => { const t = map.get(e.pointerId); if (t) { set(t, false); map.delete(e.pointerId); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    });
  },
};

export { UI };
