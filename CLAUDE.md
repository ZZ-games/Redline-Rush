# Redline Rush: guide for Claude

A neon 3D arcade racer that runs in the browser (desktop, iPad with keyboard, touch, gamepad).
Plain HTML + ES modules + Three.js r169. **No build step, no bundler, no framework.**

## Rules

1. **One task per session.** Do the step you were asked for, nothing extra.
2. **Run `npm test` before you finish** and fix anything it reports. Never finish with a failing test.
3. **Refactors must not change behaviour.** If you are only moving, renaming or splitting code, the
   fingerprint check must still pass. If it fails, you changed behaviour by accident: find it.
4. **Gameplay changes will change the fingerprint.** That is expected. Check the screenshots in
   `test/shots/`, then run `npm run test:update` and say in your summary that you updated it.
5. **Keep the save compatible.** Never rename or remove fields in the save (`js/save.js`). Add new fields
   to `newSave()`; `deepMerge` fills them in for old saves. The localStorage key is `redline-rush-save-v1`.
6. **No network at runtime.** Everything the game loads lives in this repo (`lib/` holds Three.js and the
   fonts). Don't add CDN links.
7. **Only edit the files you need.** Read the file you are changing; don't load the whole project.
8. Lines are long and dense. Use search (grep) to find things rather than reading files top to bottom.

## Run it

```
npm run serve          # then open http://localhost:8000
npm install            # once, for the test (puppeteer-core); needs Chrome or Chromium installed
npm test
```

## File map

| File | What it holds |
|---|---|
| `index.html` | All screen markup (HUD, menus, garage, results). Loads `js/main.js`. |
| `css/style.css` | All styling. `css/fonts.css` loads the bundled Teko and Chakra Petch fonts. |
| `js/main.js` | Boot: renderer, post-processing chain, main loop, keyboard handling, dynamic resolution. |
| `js/game.js` | `Game` class: runs, fixed-step physics, drift, boost, Overdrive, chains, stunts, traffic AI, crashes, camera, HUD feed, rewards (`finalize`, `addXP`). Biggest file. |
| `js/ui.js` | `UI` object: every menu and screen, garage UI, settings, pause, results, crates, touch buttons. |
| `js/content.js` | Data tables: `PAINTS`, `GLOWS`, `CARS`, `UPGRADES`, `MODES`, `DAILY_MODS`, `ACH`, plus `carStats`, `upgradeCost`, `xpNeed`. **Most balance changes start here.** |
| `js/save.js` | Save defaults (`newSave`), load/merge, `persist()`, `resetSave()`, `todayKey()`. |
| `js/districts.js` | The five districts (`BIOMES`): sky, light, fog, curviness, hills, jumps, traffic density. |
| `js/track.js` | `Track`: the endless road (curves, hills, jumps, boost pads, checkpoints, tunnels). |
| `js/world/world.js` | `World`: terrain, road chunks, scenery, streaming, lights, district blending, `ORIGIN`. |
| `js/world/sky.js` | Sky dome shader and the distant mountain and city rings. |
| `js/world/scenery.js` | Scenery prototypes (palms, pines, cacti, rocks, poles) and building/sign materials. |
| `js/textures.js` | Procedural canvas textures. Also road constants: `ROAD_W`, `EDGE`, `LANES`. |
| `js/cars.js` | Player car models, paint, underglow, wing. |
| `js/traffic.js` | Traffic car geometry, types and colours. |
| `js/fx.js` | Particles, skid marks, light trails, speed lines. |
| `js/post.js` | Final post shader (motion blur, aberration, grading, flashes). |
| `js/audio.js` | `AUDIO`: synthesized engine, music and sound effects (no audio files). |
| `js/input.js` | `INPUT`, `KEYMAP`, `pollInput()` for keyboard, touch and gamepad. |
| `js/quality.js` | Graphics presets (`QUALITY`) and auto-detection. `IS_TOUCH`, `IS_MOBILE`. |
| `js/achievements.js` | `checkAchievements()`. |
| `js/showroom.js` | `SHOWROOM`: the 3D garage scene. |
| `js/util.js` | Math, noise, `$`, `fmt`, `mulberry32`. |
| `lib/` | Three.js r169 and needed addons, fonts. Don't edit. |
| `test/smoke.mjs` | The automated test. `test/fingerprint.json` is the behaviour baseline. |
| `sw.js` | Offline cache for the home-screen app. |

## Key concepts

- **Road coordinates.** The player lives in road space: `P.s` = metres along the road, `P.x` = metres
  sideways from the centre line (lanes at `LANES = [-5.25, -1.75, 1.75, 5.25]`). `track.frame(s, out)`
  converts to world position, heading, slope and bank. Traffic uses the same `s`/`x`.
- **Units.** Metres and seconds. Speeds are m/s internally (`P.v`); the HUD shows `P.v * 3.6` km/h.
- **Fixed step.** `Game.frame()` runs `Game.step(1/120)` in a loop. Put physics and rules in `step`,
  visuals in `renderVisuals` and the `place*`/`update*` methods.
- **Slow motion.** `addSlowmo(scale, seconds)` stacks; the lowest scale wins.
- **Floating origin.** `ORIGIN` shifts the world every ~1.2 km to keep numbers small. World positions in
  meshes are `trackPos - ORIGIN`.
- **Chunks.** The world streams in 160 m chunks (`CHUNK`) built by `World.buildChunk` and disposed behind.
- **Districts.** Every `dlen` metres (3,000 by default) the road blends into the next of the five
  `BIOMES`. Checkpoints sit every `GATE_SPACING` (1,500 m).
- **Scoring.** Stunts call `stunt(label, points, colour)`, which adds to the live chain. The chain banks
  after `CHAIN_TIME` seconds without a stunt and is lost on a crash. The multiplier caps at x10.
- **Boost and Overdrive.** Stunts fill `P.boost` (0..1). A full tank while a chain is alive adds an
  Overdrive charge; three charges plus Boost triggers 8 s of Overdrive.
- **Game states.** `boot`, `attract` (menu background, autopilot drives), `countdown`, `race`, `paused`,
  `finish`, `results`, `garage`.
- **Debug hooks.** `window.__game`, `window.__input`, `window.__save()`, `window.__show`, `window.__post`.
  The test drives the game through these. `game.autopilot()` returns steering that avoids traffic.

## Roadmap

Done: 1) moved out of the artifact with bundled libraries, 2) split into modules (behaviour identical).

Next steps, one per session:

3. Move tuning numbers (speeds, points, timers, prices) into a new `js/config.js`. Behaviour must stay
   identical, so the fingerprint must still pass.
4. First-run tutorial that introduces steering, boost, near misses, drift and chains one at a time.
5. Daily rewards: a 7-day calendar, 3 daily missions with an all-done bonus, a weekly 5-day goal.
   Change the Daily Run streak so a missed day pauses it instead of resetting it to 1.
6. Opt-in rewarded ads (second chance +time, double cash/XP on results, extra crate). All behind a
   "Watch ad" button the player presses; never interrupt a run. Placeholder screen until an AdSense
   H5 Games Ads ID is set.
7. Performance tuning on iPad.
