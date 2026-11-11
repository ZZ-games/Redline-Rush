# Redline Rush

A neon 3D arcade racer. Weave through traffic at 400 km/h across five districts, chain near misses,
drifts and jumps, fill your boost and unleash Overdrive.

**Play:** https://zz-games.github.io/Redline-Rush/

## Controls

| Key | Action |
|---|---|
| W / ↑ | Gas |
| S / ↓ | Brake |
| A D / ← → | Steer |
| Shift | Drift |
| Space | Boost (with 3 charges: Overdrive) |
| C | Change camera |
| Esc / P | Pause |

Touch buttons appear on touch screens, and gamepads work too.

## Modes

- **Heat Run:** beat the clock; checkpoints add time and traffic thickens.
- **Drift King:** 90 seconds on twisting roads; drift points count triple.
- **Daily Run:** one road and one twist, the same for everyone today.
- **Cruise:** no clock, light traffic.

## Garage

8 cars, 4 upgrades each (engine, nitro, grip, armour), 16 paints and underglow colours, 25 achievements.

## On iPad

Open the link in Safari, then Share → **Add to Home Screen**. It opens full screen and works offline.

## Development

No build step. Serve the folder and open it:

```
npm run serve     # http://localhost:8000
npm install       # once, for the test
npm test          # boots the game in headless Chrome and drives test races
```

See `CLAUDE.md` for the file map and how the code fits together.
