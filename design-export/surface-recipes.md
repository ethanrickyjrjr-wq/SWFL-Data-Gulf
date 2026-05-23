# Surface Recipes

Beat-by-beat animation sequence per surface. Treat as constraints.

---

## Surface A — Report Page (default view)

Structured: hero verdict → metrics table → drivers → caveats → freshness token.

**Animation budget:** Moderate.

**Sequence (on first arrival only):**

1. **Hero verdict** (direction word: "bullish" / "bearish" / "mixed" / "neutral"): spring reveal with subtle vertical rise, 700-900ms, settles cleanly. Direction color is set instantly — only the form springs in.
2. **Headline conclusion sentence:** fade + 4px upward translate, 500ms, starts at +300ms after the verdict begins.
3. **Metrics table rows:** staggered fade+rise, 60-80ms between rows, each row 400ms. Begins at +600ms.
4. **Number values in the table:** count up from 0 to final value as the row reveals. 800ms count, ease-out quint. Show units throughout.
5. **Drivers section:** fades in as a block, 500ms. No per-item stagger.
6. **Caveats:** fade in last, 400ms, slightly reduced opacity (this is a "yes but" — visually secondary).
7. **Freshness token:** appears instantly, no animation. It's a proof element.

**Then stillness.** Nothing pulses, nothing loops.

---

## Surface B — Report Page (executive glance / Tier 1)

2-5 sentence summary. User wants the answer in 3 seconds.

**Animation budget:** Minimal.

**Sequence:**

1. **Verdict word:** spring reveal, 600ms.
2. **The 2-5 sentences:** fade in as a single block, 400ms. No per-sentence staggering.
3. **Source-link chips at the bottom:** fade in last, 300ms.

Done in under 1.2 seconds.

---

## Surface C — Raw Audit (Tier 3)

Full citation table. People are verifying numbers.

**Animation budget:** Near-zero.

**Sequence:**

1. **Whole audit block:** single fade-in, 300ms.
2. **No per-row animation.** Ever.
3. **Filter / sort interactions:** instant.
4. **Hover on a row:** background tint shifts in 120ms. That's the only motion.

---

## Surface D — Landing Page (marketing)

First-impression page. Stop people mid-scroll.

**Animation budget:** High.

**Sequence (GSAP master timeline):**

1. **Hero headline:** character-level stagger reveal, 800ms total, 18ms per char, ease-out quint. One headline only.
2. **Hero supporting line:** fade in at +400ms after headline begins, 500ms.
3. **Install command block:** rises in with scale 0.96→1 + fade, 600ms spring. Begins at +900ms.
4. **Copy button:** on click — 150ms "pressed" scale (1→0.96→1) + checkmark crossfade.
5. **Scroll sections:** scroll-triggered fade + 12px rise, 600ms, when 70% into viewport.

**The install command is the climax.** Everything builds toward "copy this and you're in."

---

## Charts and data visuals

### Scatter plot
- Axes draw first (200ms line-draw)
- Bubbles animate from origin to position (400ms stagger, spring physics)
- On hover: bubble pulses (scale 1→1.08→1, 200ms) + tooltip fades in (120ms)

### Verdict bars
- Bars fill left to right, staggered 80ms between bars, 600ms each, ease-out cubic
- Color is set instantly per direction — no gradient animation

### Metric cards (hero numbers)
- Count up from 0 on load, 800ms, ease-out quint
- Three.js depth layer: subtle parallax on mouse move (translate Z, not XY pan)

### Report load sequence (master timeline)
- Chart axes draw: 0ms–200ms
- Scatter bubbles drop in: 200ms–600ms (staggered)
- Metric cards count up: starts at 200ms simultaneously
- Verdict bars fill: 600ms–1200ms
- Total assembly: ~2 seconds

---

## Cross-cutting: scroll behavior

- Reveals **fire once.** Do not re-trigger on scroll-up.
- Group reveals into 3-5 sections. Don't reveal every paragraph individually.

---

## Empty, loading, and error states

### Loading
- Render a **skeleton matching the final layout.** Same row count, same card dimensions.
- Skeleton color: slate surface at 50% opacity. **No shimmer loop.**
- No spinners. Anywhere.

### Empty
- Be specific: "No multifamily transactions in Cape Coral Tier-A this quarter (n=0)."
- Never write "No data."

### Error
- Plain English. No error codes, no "500," no "fetch error."
- Per-metric failure: render the label, an em-dash for value, "Couldn't reach {source}."
- **No animation on any error state.**

### Stale
- Render normally.
- Single line in `--neutral-gold` above the conclusion: "This report is {N} days past its expected refresh."
- Don't block the report.
