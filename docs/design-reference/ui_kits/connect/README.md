# SWFL Data Gulf — `/connect` Landing UI Kit

Hi-fi recreation of the `/connect` marketing landing page — where a
new user arrives to install SWFL Data Gulf into their AI.

## Files

| File           | Role                                                                        |
| -------------- | --------------------------------------------------------------------------- |
| `index.html`   | Mount point — wires React + Babel.                                          |
| `connect.jsx`  | `Nav`, `InstallBlock` (with Claude / Cursor / ChatGPT tabs), `SampleReportTease`, `Waitlist`, `Footer`, `App`. |
| `connect.css`  | Page-specific layout, install-block chrome, tease frame, waitlist form, motion keyframes. |

## What's interactive

- **Install tabs** — Claude / Cursor / ChatGPT swap the command inline.
- **Copy button** — copies the active command, swaps to a `Copied ✓`
  state for 1500ms (mirrors the spec in `06-voice-and-microcopy.md`).
- **Waitlist** — accepts an email, swaps to `On the list ✓`.
- **Sample report tease** — links visually to the master report; the
  conclusion sentence and the three top metrics are live from the
  canonical fixture.

## Motion budget

This surface is **Context 3 — full send.** Hero eyebrow, headline, sub
copy, and install block enter in a 4-stage timeline:

1. `cn-anim-1` — eyebrow + headline, 700ms `outQuint`.
2. `cn-anim-2` — sub copy, 600ms at +380ms.
3. `cn-anim-3` — install block springs in at +720ms.
4. `cn-anim-4` — sample report tease at +1100ms.

`prefers-reduced-motion: reduce` disables everything.

## Open it

`ui_kits/connect/index.html`.
