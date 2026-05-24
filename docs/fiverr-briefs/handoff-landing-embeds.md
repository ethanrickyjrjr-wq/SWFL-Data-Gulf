# Designer Handoff — SWFL Data Gulf Landing

**Owner of this doc:** Ricky / Brain Platform
**For:** Framer designer
**Status:** All Next.js routes below are live. Paste the iframe URLs into Framer as Embed blocks.

---

## What you (designer) build

The Framer canvas. Hero, data river, scene transitions, copy layout, terminal UI, map embed, origin story, motion. **All visual design and motion is yours.**

## What we (Brain Platform) provide

Three iframe URLs. You drop them into Framer Embed blocks. They render against `#0A1419` so they blend into a dark Framer canvas. No padding, no extra chrome — your section frame is the chrome.

| Slot                            | iframe URL                                                   | Size         | Notes                                                     |
| ------------------------------- | ------------------------------------------------------------ | ------------ | --------------------------------------------------------- |
| Scene 3 — Charts                | `https://brain-platform-amber.vercel.app/embed/charts`       | 100% × 720px | Two charts side-by-side; reflows to stacked under 960px   |
| Scene 7 — Footer freshness card | `https://brain-platform-amber.vercel.app/embed/footer-token` | 100% × 180px | Live freshness token + confidence gauge from master brain |
| Scene 7 — Waitlist form         | `https://brain-platform-amber.vercel.app/embed/waitlist`     | 100% × 120px | Email capture → Supabase                                  |

```html
<!-- Drop into a Framer Embed block -->
<iframe
  src="https://brain-platform-amber.vercel.app/embed/charts"
  style="border:0;width:100%;height:720px;background:#0A1419"
  loading="lazy"
></iframe>
```

---

## Color tokens (use these exact hexes)

| Token            | Hex       | Where it lives                 |
| ---------------- | --------- | ------------------------------ |
| `gulf-midnight`  | `#0A1419` | Page body, hero                |
| `gulf-deep`      | `#0F1D24` | Section backgrounds            |
| `gulf-slate`     | `#152832` | Cards                          |
| `gulf-slate-hi`  | `#1C3340` | Hovered / elevated cards       |
| `gulf-haze`      | `#22414F` | Borders, dividers              |
| `gulf-teal`      | `#3DC9C0` | Primary CTA, links, brand glow |
| `gulf-teal-dim`  | `#2A8C85` | Secondary borders              |
| `neutral-gold`   | `#D4B370` | Neutral metrics, accents       |
| `mangrove`       | `#5BC97A` | Bullish signal                 |
| `sunset-coral`   | `#E08158` | Bearish / stale signal         |
| `text-primary`   | `#F0EDE6` | Headlines, metric values       |
| `text-secondary` | `#B8B4A8` | Body copy                      |
| `text-tertiary`  | `#807E76` | Captions, source labels        |

**CTA button:** background `rgba(61,201,192,0.12)`, border `1px solid #3DC9C0`, text `#3DC9C0`. Hover background `rgba(61,201,192,0.22)`.

---

## Copy (final — do not edit)

### Hero

- **Headline:** Real data. Real answers. No hallucinations.
- **Subhead:** Southwest Florida intelligence, synthesized from 8 verified data pipelines and piped straight into Claude.
- **CTA:** Request Brain Access →

### Scene 4 terminal (hardcoded — decision locked)

```
$ curl "https://brain-platform-amber.vercel.app/api/b/master?view=speak&tier=2"

> Southwest Florida CRE shows early bifurcation: Naples
  asking rents pushing $60/sqft NNN while Lee submarkets
  hold $25–35. Permit saturation in N. Naples is rising
  faster than absorption.

  Confidence: 78%  ████████░░
  Sources: 8 verified pipelines
  Freshness: SWFL-7421-v8-20260523
```

### Scene 7 final CTA

- **Headline:** Your market. Synthesized. Trusted.
- **Subhead:** Get notified when Brains opens to the public.

---

## Revision policy (in chat before milestone 1)

- **Included:** 2 revision rounds per scene
- **After:** $25/hr for additional revisions
- **Definition of "scene":** any of Scenes 1–7 listed in the meeting plan

## Milestones

| #   | Deliverable                               | Payment |
| --- | ----------------------------------------- | ------- |
| 1   | Scenes 1–2 (hero + data river) for review | $100    |
| 2   | Scenes 3–5 with iframe embeds wired       | $150    |
| 3   | Scenes 6–7                                | $100    |
| 4   | Revision round + publish                  | $50     |

**Daily checkpoint:** end-of-day Loom or screenshot of where you are. Async, no call needed.

---

## What you do NOT build

- The two chart components (we already have them — they live inside `/embed/charts`)
- The waitlist backend (we have it)
- The freshness token logic (live from our API)
- Anything that hits a database
