# FIVERR BRIEF B — "Data × AI Collision"

## Landing Page — The Proof That Real Data Makes AI Better

**Project Title:** Design + Build Next.js Landing Page — AI Intelligence Platform (Dark, Cinematic, Data-Forward)

**Budget:** $200–300 | **Timeline:** 5–7 days

---

## The Concept

Most AI product landing pages look the same: gradient blob, generic headline, three feature cards. We're doing something different. Our platform synthesizes real market data — permits, home values, flood risk, job growth, commercial rents — into a structured "brain" that makes AI answers trustworthy and verifiable. The landing page should _show_ that story visually, not just describe it.

The central visual metaphor: **raw data enters chaos → structure forms → AI answers with evidence**. Every design decision reinforces this. Think Vercel's homepage level of polish, Linear's motion design sensibility, but for a data intelligence product.

---

## Page Architecture

### [HERO — Full Viewport]

Dark background (`#090b10` or equivalent near-black).

**Left side:** A "data stream" — raw numbers, coordinates, timestamps flowing upward in a monospace font, `opacity: 0.3`, fast scroll speed. Think The Matrix but cleaner. Real-looking data snippets: permit IDs, ZHVI values, flood zone codes, NNN rent figures.

**Right side:** A glassmorphism card (`backdrop-filter: blur(20px)`, `border: 1px solid rgba(255,255,255,0.08)`) showing the clean brain output:

```
Conclusion: Southwest Florida CRE is showing early
bifurcation between Naples and Lee County.

Confidence: 84%  ████████░░
Sources: 8 verified data pipelines
Updated: 4 hours ago
```

**Between them:** An animated SVG arrow/flow visual showing the transformation. `stroke-dashoffset` draw-in animation on page load.

**Headline above:** "Real data. Real answers. No hallucinations." in a bold display typeface (Clash Display, Syne, or similar editorial weight). Word-by-word Framer Motion stagger on load.

**Single CTA:** `Request Brain Access →`

---

### [TRUST BAR]

A horizontal ticker-style strip (CSS `animation: marquee linear infinite`) showing our live data sources:

`Zillow · Lee County Permits · FEMA NFIP · US Census CBP · FDOT AADT · Florida Realtors · ATTOM · Supabase`

Subtle separator dots between each. Fades at left/right edges with `mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent)`.

---

### [THE PROOF SECTION]

**Headline:** "Every answer is sourced. Every number is verified."

Three animated "proof cards" that flip on scroll-enter using CSS `rotateY` backface flip (3D card flip effect, 600ms, cubic-bezier ease):

- **Front:** "What enterprise data costs $50K/year for" → **Back:** Live corridor rent data table, real numbers
- **Front:** "What happens when AI guesses" → **Back:** Our confidence score with 8 source citations listed
- **Front:** "Legacy reports vs. live intelligence" → **Back:** Timestamp showing data freshness token `SWFL-7421-v5-20260522`

Cards use the same glassmorphism treatment as the hero card.

---

### [LIVE DATA MOMENT]

Full-bleed section. Dark background. Terminal/live feel.

A single Recharts `AreaChart` with:

- Cape Coral median home value over 24 months (Zillow ZHVI data — real numbers)
- A live-looking cursor blinking at the rightmost data point
- A small pulsing green dot: "Live · Updated 3 hours ago"
- Area fill: gradient from accent green (`#4ade80`) at base to transparent at top

Below the chart: "This data is already in the brain. Your next query will use it."

This is the "oh, this is actually real" moment for visitors. No fake charts. Real data, real shape.

---

### [HOW THE BRAIN WORKS]

A three-step horizontal stepper with animated SVG connector lines between steps:

1. **Ingest** — Animated icon of data flowing in from multiple pipes (Lottie or CSS animation)
2. **Synthesize** — Pulsing brain/network SVG node with radial gradient pulse (`@keyframes`)
3. **Answer** — Clean output card with confidence score, appearing with typewriter effect

SVG connector lines between steps animate with `stroke-dashoffset` on scroll-enter (GSAP ScrollTrigger). Each step card fades and translates up with `staggerChildren: 0.15`.

Short 2–3 line description below each step.

---

### [FINAL CTA]

Clean, minimal. Dark background, centered layout.

Large display headline (Framer Motion word stagger): "Your market. Synthesized. Trusted."

Email input with smooth focus ring animation (`outline` transition, ring expands on focus). Submit button with subtle glow pulse on hover (`box-shadow` keyframe). On click: small particle burst (tsParticles or CSS-only confetti).

---

## Design Direction

| Element          | Spec                                                  |
| ---------------- | ----------------------------------------------------- |
| Background       | `#090b10` near-black                                  |
| Primary accent   | `#4ade80` green — "data is live"                      |
| Secondary accent | `#818cf8` indigo — "intelligence/AI"                  |
| Text             | `#f1f5f9` near-white                                  |
| Display font     | Clash Display or Syne (bold, editorial)               |
| Body font        | Inter or Geist                                        |
| Data/numbers     | `font-mono`, slightly dimmed                          |
| Motion           | Ease-out, 0.4–0.8s durations, `staggerChildren: 0.08` |
| Glassmorphism    | Cards only — not overused                             |

**No stock photos. No generic UI screenshots floating in space. Only real data visualizations and purposeful abstract elements.**

---

## Tech Requirements

- Next.js 14+ (App Router), TypeScript, Tailwind CSS
- Framer Motion for all entrance animations and scroll-triggered reveals
- Recharts for the live data chart
- GSAP ScrollTrigger for the stepper connector line animations
- tsParticles or CSS for the CTA burst
- Single page (`/app/page.tsx` or `/app/landing/page.tsx`)
- No CMS — all content hardcoded for now
- Responsive: desktop-first, functional on tablet
- `prefers-reduced-motion` respected throughout

---

## Deliverables

- Complete landing page as a single Next.js page + supporting components in `/components/landing/`
- Tailwind config additions (colors, fonts) documented in a comment at top of the file
- Any new `package.json` dependencies listed separately
- Delivery: zip of page file + `/components/landing/` directory
- Do **not** send a full Next.js scaffold — we already have one

**See `brief-C-data-spec.md` for component interface requirements and data fixture schemas.**
