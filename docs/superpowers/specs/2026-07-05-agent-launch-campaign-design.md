# Agent Launch quick-start campaign

**Date:** 2026-07-05 · **Check:** `agent_launch_campaign_live_verify` · **Build 1 of 3**
(Build 2 = campaign results strip, Build 3 = sphere list-builder — registered separately when picked up.)

Evidence base: `docs/superpowers/specs/2026-07-05-email-marketing-evidence-notes.md` (3-round crawl4ai
sweep 07/05/2026: 60+ vendor/case-study sources, 35 Reddit practitioner threads, Validity deep dive).
Every design move below cites its evidence line there.

## Problem

All three quick-start campaigns assume the agent has a listing or wants a digest. A brand-new agent —
zero listings, zero list — has no button. Four of five researched sources converge on the same
listing-less traction loop (weekly sphere market email + home-value hook), and every piece of it runs
on data we already hold. This is also the priced-out wedge audience we target.

## Goal

One click gives a day-one agent their launch: an announcement email introducing them to their sphere
(seeded into the Build box), then a nudge to schedule the recurring weekly sphere market update.
Two artifacts, zero new send machinery.

## Decisions (operator-ratified in-session 07/05/2026)

1. **Shape:** seed + schedule combo. Button seeds the announcement; a post-build chip seeds the
   weekly recipe, whose prompt asks for the schedule (existing AI command route + recurring scheduler,
   the Market Pulse path). NOT a finite-sequence engine.
2. **Showcase:** full demo arc (4 slides), fictional persona.
3. **Weekly spine:** national-vs-local contrast ("the headlines say X, your area says Y") + one honest
   read + reply-REVIEW home-value ask.
4. **CTA:** reply-keyword ("reply with your address and the word REVIEW"). Replies land via the
   existing reply sensor (resolves agent + contact, alerts the agent) — no new infrastructure, and
   replies are one of the strongest sender-reputation signals (Validity, notes §11).
5. **Contacts:** build, never buy/provide. Purchased lists convert at 1–3%, decay in a quarter, and
   their bounces damage OUR shared verified domain (notes §6, §9). This build ships the sphere-
   inventory teaching in the showcase; the guided wizard is Build 3.
6. **Recipes must be Sonnet-proof:** block-explicit, ordered, one job per block, zero digits in
   recipe text, every number via `value_figure` id-selection.

## What we're building

### 1. Registry (lib/showcase/registry.ts)

- New `Showcase` id `agent-launch`, `surfaces: ["email"]`. Persona: **Marisol Vega — Gulfline Realty ·
  Bonita Springs** (fictional; disclosure line like the three live showcases; her portrait is a
  professional half-body cutout, AI-generated, disclosed). Accent: deep palm green (distinct from the
  gold/teal/burnt-orange of the existing three).
- `campaign`: key `"agent-launch"` (extend the key union), label "Agent Launch Campaign", blurb
  ~"Introduce yourself to your sphere with a real market insight — then a weekly update that sends
  itself.", status "live", surface "email", `seedRecipe` = announcement recipe (below).
- **`ShowcaseCampaign` gains optional `followUp?: { label: string; recipe: ShowcaseRecipe }`** —
  the ONLY type change. Filled here with the weekly recipe.
- `cadenceRefresh`: daily = live listing counts near the reader; weekly = the national-vs-local
  contrast figures; monthly = the area home-value trend.

### 2. Recipes (registry prompt strings — advisory, author may deviate)

**Announcement (seedRecipe):** "Build my agent-launch announcement email introducing me to my sphere —
open like a personal letter about why I got into real estate here, lead with one real market insight
about [[your city or ZIP]], a short numbered what-happens-next of what I'll send each week, and one
reply CTA. My photo sits beside the letter, not above it." `needs: [agent_name, photo_url, brokerage,
business_address]`. ("introducing" routes it onto the `agent-intro` author recipe — verified against
`detectRecipe`'s WELCOME_RE.)

**Weekly (followUp.recipe):** "Build a weekly sphere market update for [[your city or ZIP]] — one
national or Florida headline number set beside my own area's number, one honest read of the gap, and
end by inviting readers to reply with their address and the word REVIEW for their home's snapshot.
Schedule it every Tuesday morning." (Avoids "monthly/newsletter/digest" so it can't misroute onto the
newsletter recipe. Schedule ask flows through the existing command route → `computeNextRunAt`.)

### 3. agent-intro author recipe upgrade (lib/email/author-recipes.ts)

Rewrite the `agent-intro` prose to the evidence-fed, block-explicit target (keep the zero-digit
test-enforced constraint — leads are words, never numerals):

- An `image` block (photo role) BESIDE a `text` block (the letter opening) — a side-by-side row, the
  portrait as a full-height column, never a top banner (notes §2: removing the hero image won
  MailerLite's own tests; both operator reference templates use the side-column portrait).
- Letter voice: open with the referral-context honesty ("you're getting this because we know each
  other" — notes §1), a line or two of origin story, first-person, warm, short.
- ONE banded `hero` as the market-insight moment: kicker names the place, `value_figure` carries the
  id-selected figure, label is one honest line. This is the "clipped stat card" — the personal letter
  carrying one piece of hard evidence.
- A `list` block: what happens next, leads as words (First / Then / Every week), items phrased as
  reader benefits (notes §2: numbered next-steps beat static expectation lists; benefit-phrased).
- `agent-card` as the sign-off (bio reads as a signature); exactly ONE `button` (the reply CTA);
  a `text` P.S. as the soft second ask (forward/referral — the P.S. is among the most-read lines);
  `footer` always.
- Structural rules restated: single column of rows, pad airy, at most one image beyond the portrait,
  copy is always HTML text (never baked into an image), key message + the one ask in the first
  readable lines (Gmail AI summaries + clipping, notes §11).

### 4. Follow-up chip (components/email-lab/EmailLabGridShell.tsx)

When the Build box was seeded from a campaign whose `campaign.followUp` exists AND that build
completes, render a dismissible toolbar chip (sibling of the CAN-SPAM span, same styling family):
"Next: schedule your weekly sphere update →" — click seeds `followUp.recipe` via the same
`handleUseRecipe`. Session-scoped component state (which campaign seeded the box); no persistence.
Dismiss = gone for the session. No other placements this build.

### 5. Lab upgrades (the design must actually render — operator: "don't hold back")

- **L1 — Portrait treatment.** `agent-card`: kill the 50% circle avatar → rectangular editorial crop.
  New portrait-column rendering for photo `image` blocks in a side-by-side row (today's `agent-hero`
  is a 600×300 landscape cover crop — wrong shape for the half-body professional portraits agents
  actually have, often transparent PNGs; support the cutout-over-band look).
- **L2 — Reply CTA.** Engine-owned `mailto:` destination for buttons (reply-to address already rides
  every send): the author writes `button_label` only; a campaign/brand context supplies the mailto.
- **L3 — Stat-card moment.** Style the banded `hero` as the clipping: accent left border + a muted
  source line (the figure's source name, engine-written). If effort allows, alternatively let
  assembly map `value_figure` → `metric-card.metricValue`; pick ONE in the plan by cost.
- **L4 — Side-by-side proof.** Verify span 5+7 and 6+6 rows render as true columns in ALL THREE
  render engines (free flow, grid, PDF — they diverge; memory landmine) and stack on mobile. Fix
  where broken; this is load-bearing for the whole look.
- **L5 (optional, cut first) — Script display font** for the greeting moment, routed paid-only via
  `FONT_ROUTING` with an italic-serif email-safe fallback. Both operator reference templates lean on
  a script "Hello"; degrade gracefully or skip.

### 6. Send tagging (app/api/deliverables/[id]/blast/route.ts)

Add Resend tags to every blast send: campaign key (when the deliverable was campaign-seeded) +
deliverable id. Zero UI this build — Build 2 (results strip) reads the webhook events these tags
unlock, and data accrues from day one. Also apply the Validity minute-jitter flag here if trivial
(sends currently fire exactly on the hour; ~70% of volume hits the first 10 minutes — notes §11);
if not trivial, open a check instead.

### 7. Showcase demo assets (public/showcase/agent-launch/ + scripts/capture-showcase.mjs)

Four slides, built IN THE LAB (never hand-authored HTML — lab-built is the claim and the proof, per
the artifact-level verification rule), captured like the existing three showcases:
1. **The Letter** — the announcement email: portrait column + letter + palm-green stat clipping.
2. **Headlines vs Here** — the weekly email: two banded figures side by side + honest read + chart.
3. **The REVIEW Reply** — the reply ask and what the agent sends back (the area snapshot built in
   the lab) — the return-to-product loop made visible.
4. **Set It Once** — the schedule step (Market Pulse "ask" pattern) + the sphere-inventory teaching
   caption: the researched first-fifty checklist, "your list travels with you."
Every number in the demos is REAL (lake data or a named source), as-of date stated once, MM/DD/YYYY.
Receipts on slides cite the practice sources by name (e.g. segmented-send CTR case, welcome-series
open benchmarks) from the notes doc.

### 8. Design language (demo persona; user output inherits their own brand)

Paper white `#FBFAF7` / ink `#1A1E22` / palm green `#1F4D3A` accent / brass `#A98A4E` source-line
muted. Serif display (PLAYFAIR_SERIF) for the greeting; BOOK_SERIF letter body; system sans utility
for figures. Dark-mode counterparts via the existing on-dark helpers. One aesthetic risk, spent in
one place: the letter-plus-clipping identity — everything else stays quiet.

## What we are NOT building (this build)

- No results strip / stats UI (Build 2). No contacts wizard (Build 3). No new send machinery, no
  finite sequences. No purchased/provided contact lists — ever (locked). No new mandatory gates.
- COMING_TILES untouched. Social surface untouched (`buildWeek` unchanged).

## Testing

- `lib/campaigns.test.ts`: 4 live campaigns; agent-launch in the email row and hub; followUp present
  and well-formed; arc-parity guards untouched.
- `lib/showcase/registry.test.ts`: asset existence for the 4 new slides; recipe-on-buildable-slide
  rules; disclosure line present.
- `author-recipes` tests: detectRecipe routes the announcement prompt → agent-intro; recipe text
  still contains zero digits.
- New: followUp chip unit coverage (seed → build completes → chip; dismiss; non-campaign seed → no
  chip). Render tests for L1/L3/L4 where the block test harness allows.
- Gate 5 unaffected (no packs). Verify with `bunx next build`, not bare tsc.

## DONE WHEN

- The Email Lab and hub show the fourth live campaign button; clicking seeds the announcement recipe.
- Building it produces the reference look (portrait column, letter, stat clipping, list, one button)
  from Sonnet without hand-editing — proven by building the demo assets themselves in the lab.
- After the build, the chip seeds the weekly recipe; accepting its schedule creates the recurring
  Tuesday send (visible on /project).
- Blast sends carry campaign + deliverable tags (inspect one Resend payload).
- `agent_launch_campaign_live_verify` closes on live proof, operator-run.
