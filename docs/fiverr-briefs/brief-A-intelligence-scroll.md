# FIVERR BRIEF A — Three-Page Vision + The Intelligence Scroll

## Full brief for the scrollytelling page + concept direction for all three pages

**Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
**Total budget across all three pages:** $600–700
**See `brief-B-landing-page.md` for the landing page brief (separate posting)**
**See `brief-C-data-spec.md` for component interface and data fixture requirements**

---

## THE VISION — Read This First

Before you look at wireframes, read this. This is what we're building and why it matters.

---

Most people don't know what they're missing. They ask an AI a question about a market, a location, a business decision — and they get a confident answer that was assembled from training data two years old, from sources the AI can't name, with no way to verify a single number. It feels like information. It isn't. It's a very expensive guess.

We fix that.

Our platform pulls structured, verified, live market data — home values by ZIP code, commercial rents by corridor, building permits by month, flood risk by parcel, job growth by industry, freight flow by route — and feeds it directly into AI before the question is answered. The AI doesn't guess. It reads. It cites. It tells you exactly what data it used and when that data was last updated.

**Eight data pipelines. One sentence. Full citations. In seconds.**

That's the gap we close. And it changes the quality of every decision made by every person who uses it:

- The investor who almost bought in a ZIP code with 4.2% flood-driven NOI drag — and didn't, because we told her
- The franchise buyer who needed to know if the territory was saturated before signing a 10-year commitment
- The insurance agent writing a commercial policy on a corridor she'd never visited, using verified NNN rents and permit z-scores
- The small business owner who needed foot traffic, competition density, and demographic fit before signing a lease
- The broker who needed a market comp at 9pm before a 10am client call — and got it in 30 seconds
- The city planner modeling permit trends without a data team or a six-figure software subscription
- The financial advisor benchmarking a local REIT against verified absorption rates and cap rate trends
- The restaurant operator who needed to know if the neighborhood could support a third Mexican food concept
- The healthcare administrator doing site selection for a clinic using population density and income distribution
- The researcher fact-checking a developer's market claims with independent, cited, structured data

These are not edge cases. These are the every-week decisions that get made on instinct, rumor, or a broker's pitch deck — because the real data was locked inside a $50,000/year enterprise subscription that none of these people could afford.

We built the platform that unlocks it. Now we need pages that show people what that actually feels like.

---

### What the pages need to make someone feel:

**"I didn't know data could look like this."**
Not a dashboard. Not a spreadsheet with a skin. Something that earns a second look, that makes you want to scroll further, that shows data as a living, breathing layer of intelligence rather than a table with filters.

**"This is built for people like me."**
Not built for Wall Street. Not built for a Fortune 500 research team. Built for the person who has to make a real decision this week with imperfect information, and wants to close that gap without spending $50K.

**"I trust this."**
Every number has a source. Every claim has a timestamp. The AI isn't guessing — it's reading verified, structured data and showing its work. That's what makes it different from every other AI product.

**"I need this for work."**
The output looks like something you'd put in a deck, send in an email, hand to a client, or use to anchor a meeting. Not a raw data dump — a polished, organized intelligence output that fits into how real professionals work.

---

### Key phrases to use in the design:

> "Eight sources. One answer. Full citations."
> "AI that shows its work."
> "The data was always out there. Now it talks."
> "Real data makes AI real."
> "Structured intelligence. Not a guess."
> "What enterprise research teams do in two weeks. In thirty seconds."
> "Your questions stay yours."
> "Confidence: 84% — here's why."

---

## THE THREE PAGES

| Page       | Name                    | Focus                                              | Budget      |
| ---------- | ----------------------- | -------------------------------------------------- | ----------- |
| **Page 1** | The Intelligence Scroll | Full scrollytelling data story                     | $300–400    |
| **Page 2** | The Answer Room         | Claude + data in action, persona-driven demo       | $200–250    |
| **Page 3** | Landing Page            | Conversion, first impression, the collision moment | See Brief B |

---

---

# PAGE 1 — "The Intelligence Scroll"

## Full-Page Scrollytelling Data Experience

**Budget:** $300–400 | **Timeline:** 7–10 days

---

## What We're Building

A full-page, scroll-driven visual experience that tells the story of our data intelligence platform. Think New York Times data journalism meets Bloomberg Terminal — but faster, darker, and more cinematic. Every scroll step reveals a new layer of real market data through smooth transitions, entrance animations, and interactive charts. This is a single `/demo` or `/how-it-works` page, not a generic dashboard.

You build against static JSON fixtures we provide. We wire the live API after delivery.

---

## Sections (Top to Bottom Scroll Journey)

### [HERO — Full Viewport]

A dark, cinematic hero section. Background: a particle field (`tsParticles` or `react-three-fiber` with instanced meshes) where ~500 particles slowly converge from chaos into a structured lattice — raw data becoming intelligence. Kinetic typography: headline animates word by word using GSAP `SplitText` or Framer Motion `stagger`. Subtitle fades in after. Single CTA button. No clutter.

Headline: **"Real data makes AI real."**
Sub: Eight live data pipelines. One verified answer. Full citations.

### [SECTION 2 — Animated Stat Counter Block]

Scroll-triggered (GSAP `ScrollTrigger`). Five stat tiles slide in from alternating sides with spring physics. Numbers count up with `countUp.js` or a custom RAF loop:

- `26` Commercial corridors tracked
- `17,000,000` sq ft analyzed
- `8` Verified data sources per answer
- `68` SWFL ZIP codes with live home value data
- `89,492` Flood risk records

Each stat has a subtle SVG icon with a single-loop Lottie animation on entry.

### [SECTION 3 — The Live Choropleth Map]

Full-bleed Mapbox GL JS map, dark basemap (`mapbox://styles/mapbox/dark-v11`), Lee County + Collier County. On scroll-enter: ZIP polygons fade in, color-coded by ZHVI home value (real Zillow data — 68 ZIPs). Hover tooltip: ZIP, median value, YoY change %. Map gently pans/zooms on a 60s loop. Legend slides up from the bottom. A callout floats above the map: _"Every ZIP. Updated monthly. Cited automatically."_

### [SECTION 4 — Corridor NNN Asking Rent Chart]

Apache ECharts (`echarts-for-react`) horizontal bar chart. 26 SWFL commercial corridors ranked by NNN asking rent ($/sqft). Bars animate left-to-right on scroll-enter, staggered 30ms per bar using ECharts `animationDelay`. Color gradient: cool blue (low) → warm amber (high). Clicking a bar flips a card showing corridor detail. Sub-headline: _"What a CRE broker charges $500 for. In the sidebar."_

### [SECTION 5 — The Brain Pipeline Animation]

Three-column layout animating in sequence on scroll:

- **Left:** 6 data source cards (Zillow, Lee County Permits, FEMA NFIP, Census CBP, FDOT AADT, ATTOM) — each with a micro animated data stream (SVG animated dashes flowing rightward, `stroke-dasharray` + `stroke-dashoffset`)
- **Center:** A pulsing brain node — SVG neural-net or radial gradient pulse (`@keyframes`). Caption: _"Synthesis happening."_
- **Right:** The clean output card — `Conclusion`, `Confidence: 84%`, `Key Metrics` — typing in with a typewriter effect (custom React hook, character-by-character)

Flow lines left → center → right animate with `stroke-dashoffset` draw-in technique.

### [SECTION 6 — Animated Area Chart: ZHVI Trend]

Nivo `ResponsiveAreaBump` or Recharts `AreaChart`. Cape Coral + Fort Myers + Naples median home value, 36 months of real Zillow data. Lines animate in from left using Framer Motion `pathLength` on SVG paths. Area fill: SVG `linearGradient`. Draggable time-range slider (`react-slider`) — chart transitions in 300ms on drag. Caption: _"26 years of data. Ask about any of it."_

### [SECTION 7 — Permit Saturation Heatmap]

Grid-based heatmap (Nivo `HeatMap` or D3) — 26 corridors × 12 months of building permit z-scores. Diverging color scale centered at 0: blue = below baseline, red = above. Cells animate in with staggered Framer Motion `variants + staggerChildren`. Hover tooltip: saturation index + month + plain-English label ("Elevated activity"). Caption: _"One number that tells you if a market is overheating."_

### [SECTION 8 — The User Parade]

A horizontal auto-scrolling carousel of use-case cards (CSS marquee or Swiper.js). Each card shows a different persona and the question they asked:

> **Maria, Independent Investor** — _"Is 33914 a good buy right now?"_
> Brain answer: Flood-adjusted cap rate 5.8%. Permit saturation 0.62. ZHVI trend: +0.8% YoY.

> **Daniel, Franchise Buyer** — _"Is the Airport-Pulling corridor oversaturated for fast casual?"_
> Brain answer: 3 competing concepts within 0.4mi. Corridor foot traffic index: 74th percentile.

> **Ana, Commercial Broker** — _"What's the NNN asking rent on Pine Ridge Road?"_
> Brain answer: $60.84/sqft. 12-month trend: up 4.1%. Vacancy: 4.9%.

> **James, Insurance Agent** — _"What's the flood exposure on a NNN strip center at US-41 and Gladiolus?"_
> Brain answer: Zone AE. AAL $14,200/yr. Insurance as % of typical NOI: 4.2%.

Cards are not animated aggressively — gentle horizontal scroll, subtle entrance fade. The data in the cards is real.

### [SECTION 9 — CTA / Close]

Dark background, centered. Word-by-word Framer Motion stagger headline: _"Your market. Synthesized. Trusted."_ Email capture with smooth focus-ring animation. Button: particle burst on click (tsParticles or canvas). Secondary line: _"No enterprise contract. No $50K subscription. No guessing."_

---

## Animation Libraries

| Library                                  | Use                                                 |
| ---------------------------------------- | --------------------------------------------------- |
| **GSAP + ScrollTrigger**                 | Scroll-driven sequences, timeline orchestration     |
| **Framer Motion**                        | Component entrance/exit, stagger, layout animations |
| **Apache ECharts (`echarts-for-react`)** | Corridor bar chart                                  |
| **Nivo**                                 | Heatmap, area chart                                 |
| **Mapbox GL JS**                         | Choropleth map (we provide API key)                 |
| **tsParticles** or `@react-three/fiber`  | Hero particle field                                 |
| **Lottie (`lottie-react`)**              | Stat icon micro-animations                          |
| **countUp.js**                           | Animated stat counters                              |
| **Swiper.js**                            | User parade carousel                                |
| SVG `stroke-dashoffset`                  | Pipeline flow lines                                 |

**Performance:** 60fps hard requirement. `IntersectionObserver` or GSAP `ScrollTrigger lazy: true` for off-screen animation deferral. All animations respect `prefers-reduced-motion`.

---

## Deliverables

- All components in `/components/viz/` as individual `.tsx` files
- Composable into `/app/demo/page.tsx` (we wire that)
- Tailwind only — no inline styles except GSAP transforms
- Desktop-first, functional on tablet
- Zip delivery: `/components/viz/` + packages delta + README

---

---

# PAGE 2 — "The Answer Room"

## Claude + Real Data, In Action — Product Demo Page

**Budget:** $200–250 | **Timeline:** 5–7 days

---

## The Concept

This page shows the product working. Not a feature list. Not a marketing headline. The actual moment where someone types a real question, the data assembles visibly, and a verified answer appears with sources.

The central visual: a split-screen demo interface. Left side: a conversation panel (styled like a terminal or clean chat UI). Right side: a live "data assembly" visualization — nodes lighting up as each data source is consulted, a confidence meter filling, then the final answer card appearing.

This is the page that makes a skeptic become a believer. It answers the unspoken question: _"Yeah, but does it actually know anything real?"_

---

## Sections

### [HERO]

Dark background. Split-screen layout. Left: the chat/question interface. Right: the data network visualization.

**Left panel:** A blinking cursor in a clean input field. Headline above it (small, monospace): `ask about any market in southwest florida`. The cursor blinks for 1.5 seconds, then text types itself in: _"Is the Cape Coral market softening?"_

**Right panel:** A network graph (D3 force-directed or react-flow) showing 8 data source nodes (Zillow, Redfin, Lee County Permits, FEMA NFIP, Census CBP, FDOT AADT, ATTOM, Florida Realtors). At rest: nodes pulse gently, dim. On question submit: nodes light up in sequence as they're "consulted" — each glows bright, a data particle travels from node to center, then the center brain node pulses and the answer card appears on the left.

This entire sequence is animated: GSAP timeline, 2.5 seconds total, no rushing.

**The answer appears:** A clean card with:

```
Cape Coral — Market Signal: Softening

Median ZHVI: $388,000 (-0.4% MoM)
Days to Pending: 47 (+12 vs 12-month avg)
Inventory: +18% YoY
Flood-Adj. NOI Drag: 4.2%

Confidence: 79%
Sources: Zillow ZHVI (ZIP 33914, Apr 2026) ·
         Redfin Market Tracker (Lee County, Apr 2026) ·
         FEMA NFIP (Zone AE, AAL $14,200)
```

Below the answer: a small timestamp: _"Assembled in 1.4 seconds from 3 verified sources."_

### [SECTION 2 — Three Questions, Three Worlds]

Three full-width panels, one per persona, stacked vertically. Each panel has the same split-screen demo layout but with a different user and question. They auto-play on scroll-enter — each demo runs its 2.5s sequence when the section comes into view.

**Panel A — The Investor**
Question: _"What's the flood-adjusted cap rate on a strip center in 33914?"_
Answer shows: Cap rate calculation, FEMA AAL data, insurance % of NOI, confidence score.
Label: `Maria · Independent Investor · Fort Myers, FL`

**Panel B — The Small Business Owner**
Question: _"Can the Pine Ridge corridor support another fitness studio?"_
Answer shows: Corridor vacancy %, existing fitness concepts within 0.5mi, median household income, foot traffic index percentile.
Label: `Daniel · Fitness Studio Owner · Naples, FL`

**Panel C — The Broker**
Question: _"Give me a 90-second market brief on Airport-Pulling for a 10am client call."_
Answer shows: NNN asking rent, vacancy trend, permit activity z-score, 12-month absorption, confidence.
Label: `Ana · Commercial Broker · Naples, FL`

### [SECTION 3 — What Makes It Different]

Three side-by-side cards with a before/after flip animation (CSS `rotateY` on hover/scroll):

**Card 1:**
Front: _"AI without data"_
Back: A blurred, vague paragraph full of hedge words — "generally speaking," "typically," "may vary." Confidence: ???

Front: _"AI with our data"_
Back: The clean answer card with real numbers, citations, timestamp. Confidence: 84%.

**Card 2:**
Front: _"Enterprise research"_ — Cost: $50,000/yr. Turnaround: 2 weeks. Format: PDF.
Back: _"Brain output"_ — Cost: fraction. Turnaround: 30 seconds. Format: answers your question.

**Card 3:**
Front: _"Your data stays yours"_
Back: Short paragraph on privacy — questions are not stored, not used for training, not shared. Your strategy is yours.

### [SECTION 4 — The Speed Proof]

An animated timer that counts up alongside a "traditional research" process:

```
0:00 — Question asked
0:01 — Zillow ZHVI data loaded (68 ZIPs)
0:02 — Redfin market tracker loaded (58 ZIPs)
0:03 — Lee County permits loaded (14 months)
0:04 — FEMA NFIP flood records loaded (89,492 records)
1.4s — Answer assembled, cited, delivered

Traditional alternative: 3–14 business days
```

Each line appears as a `stroke-dashoffset` tick mark with a timestamp counter. The "Traditional alternative" line appears last, in a dimmer color, with a subtle strikethrough animation.

### [SECTION 5 — CTA]

Same treatment as Page 1 CTA. Headline: _"Ask it anything. It knows."_ Email + button.

---

## Design Direction

Same dark palette as Page 1. The chat/demo interface should feel like a premium developer tool — not a consumer chatbot. Think Linear, Vercel, or Raycast's UI aesthetic: tight spacing, monospace accents, precise interactions.

The network graph on the right should feel like a live system diagram, not a decorative element. Each node label names the real data source. Lighting up should feel meaningful, not decorative.

---

## Libraries for This Page

- **D3 force-directed graph** or **React Flow** for the data network visualization
- **GSAP timeline** for the orchestrated demo sequence
- **Framer Motion** for panel entrances and card flips
- **Recharts** or static SVG for the speed proof timeline
- **Custom React hook** for the typewriter question effect

---

## Deliverables

- Components in `/components/answer-room/`
- Demo sequence must work as a pure animation (no live API calls) — driven by fixture data
- The auto-play on scroll-enter must be triggerable manually as well (for accessibility)
- Zip delivery: `/components/answer-room/` + packages delta + README

**See `brief-C-data-spec.md` for fixture schemas and component interface requirements.**

---

---

## SHARED NOTES FOR ALL THREE PAGES

### What "beautiful, organized, and ready for work" means to us

The output of our platform — the answers, the charts, the metric cards — needs to look like something a professional would put in a deck, paste into an email, or hand to a client. Not raw. Not academic. Not a dashboard screenshot. The visual language should communicate: _this is actionable intelligence, not data for data's sake._

Every chart should have:

- A plain-English headline above it (not a variable name)
- A source citation below it (one line, small, monospace: "Source: Zillow ZHVI · Lee County · April 2026")
- A "what this means" sub-label where appropriate (e.g., "Above-average permit activity — watch for oversaturation")

### Color system across all pages

| Role                            | Token           | Hex                      |
| ------------------------------- | --------------- | ------------------------ |
| Background                      | `bg-base`       | `#090b10`                |
| Surface (cards)                 | `bg-surface`    | `#111318`                |
| Border                          | `border-subtle` | `rgba(255,255,255,0.06)` |
| Accent green (live/good)        | `accent-green`  | `#4ade80`                |
| Accent indigo (AI/intelligence) | `accent-indigo` | `#818cf8`                |
| Accent amber (elevated/watch)   | `accent-amber`  | `#fbbf24`                |
| Accent red (risk/flag)          | `accent-red`    | `#f87171`                |
| Text primary                    | `text-primary`  | `#f1f5f9`                |
| Text dim                        | `text-dim`      | `#64748b`                |
| Monospace data                  | `text-mono`     | `font-mono, #94a3b8`     |

These should go in `tailwind.config.ts` as custom tokens so every component uses them consistently.
