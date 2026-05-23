# Quick Reference

Keep this open while building. Every value here is canonical.

---

## The universal rule

**Animation reveals data, it does not gate it.** The number is in the DOM from
page load; motion is the flourish on top. If forced to choose between "show
the number now" and "perform a reveal," show the number now.

---

## Motion budgets by surface

| Surface                        | Budget                   |
| ------------------------------ | ------------------------ |
| Report page (default view)     | Moderate — full send     |
| Report page (executive glance) | Minimal (block reveals)  |
| Report page (audit/citations)  | Near-zero (single fade)  |
| Landing page                   | High — full send         |

---

## Default timings (±20% OK)

| Element                   | Duration             | Feel                           |
| ------------------------- | -------------------- | ------------------------------ |
| Hero verdict spring       | 700–900ms            | Spring: stiffness 90, damping 14 |
| Metric row stagger        | 60–80ms gap, 400ms   | fade + 4px rise                |
| Number count-up           | 800ms                | ease-out quint                 |
| Chart path draw           | 800–1200ms           | ease-out quart                 |
| Bar grow (verdict bars)   | 500ms, 40ms stagger  | ease-out cubic                 |
| Section reveal on scroll  | 500–700ms            | ease-out cubic                 |
| Hover affordance          | 120–180ms            | ease-out quad                  |
| Tab crossfade             | 250ms total          | crossfade                      |

---

## Color tokens

### Surfaces
| Token             | Hex       |
| ----------------- | --------- |
| `--gulf-midnight` | `#0A1419` |
| `--gulf-deep`     | `#0F1D24` |
| `--gulf-slate`    | `#152832` |
| `--gulf-slate-hi` | `#1C3340` |
| `--gulf-haze`     | `#22414F` |

### Accents
| Token             | Hex       | Role                    |
| ----------------- | --------- | ----------------------- |
| `--gulf-teal`     | `#3DC9C0` | Primary accent / CTAs   |
| `--gulf-teal-dim` | `#2A8C85` | Source links            |
| `--mangrove`      | `#5BC97A` | Bullish                 |
| `--mangrove-dim`  | `#3D8A52` | Bullish (muted bg)      |
| `--sunset-coral`  | `#E08158` | Bearish                 |
| `--coral-dim`     | `#A45A3D` | Bearish (muted bg)      |
| `--neutral-gold`  | `#D4B370` | Mixed / neutral / stale |

### Text
| Token              | Hex       |
| ------------------ | --------- |
| `--text-primary`   | `#F0EDE6` |
| `--text-secondary` | `#B8B4A8` |
| `--text-tertiary`  | `#807E76` |
| `--text-on-accent` | `#0A1419` |

---

## Direction → color (set instantly, never animated)

```
bullish  → #5BC97A  (--mangrove)
bearish  → #E08158  (--sunset-coral)
mixed    → #D4B370  (--neutral-gold)
neutral  → #B8B4A8  (--text-secondary)
```

---

## Type scale

| Role                       | Size      | Weight | Notes               |
| -------------------------- | --------- | ------ | ------------------- |
| Landing hero               | clamp(3rem, 6vw, 5rem) | 600 | tracking -2%   |
| Verdict word (report H1)   | 2.75rem   | 600    | lowercase, -2% tracking |
| Section H2                 | 1.75rem   | 500    |                     |
| Metric value (big number)  | 2.25rem   | 600    | tabular nums        |
| Metric label               | 0.875rem  | 500    | uppercase, +0.06em  |
| Body                       | 1rem      | 400    | line-height 1.55    |
| Freshness / source URL     | 0.75rem   | 500    | monospace           |

---

## Animations toggle (required)

```js
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const userPref = localStorage.getItem("swfl.animations") ?? "on";
const ANIMATE = userPref === "on" && !prefersReducedMotion;

const duration = (ms) => (ANIMATE ? ms : 0);
const delay    = (ms) => (ANIMATE ? ms : 0);
```

---

## Veto list

- Numbers in citation/audit tables
- Source links
- Freshness token
- Loading spinners (skeletons only)
- Direction color transitions
- Bounce / elastic / cute overshoots
- Looping idle motion
- Any animation on error states

---

## When in doubt

**Cut the animation.**
