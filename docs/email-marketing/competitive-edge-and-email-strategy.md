# Competitive Edge & Email Strategy

**Source:** Fable 5 research session, 2026-06-11 (raw transcript: `research/2026-06-11-fable-competitive-research.txt`).
Competitor prices pulled via Firecrawl with source URLs preserved. Feature/route claims spot-checked
against production + this repo on 2026-06-11 — what's confirmed is marked; treat prices as directional
internal ammo, not gospel (several are Reddit-sourced).

> **Copy rule (non-negotiable):** name **categories, not products**, in any outward email. The product
> names and prices below are **internal ammunition only**. Emails say "what a CRE data terminal costs
> per seat," never "CoStar." (Matches the standing no-competitor-trash-talk rule.)

---

## 1. Confirmed today (verified against prod + repo)

| Claim | Status | Evidence |
|---|---|---|
| `/ask` 404s in prod, yet test email + samples deep-link to `/ask?q=…` | **CONFIRMED** | no `app/ask` route exists; HEAD `/ask`→404 |
| Live fallbacks for the dead links exist | **CONFIRMED** | `app/r/zip-report/[zip]`, `app/r/[slug]`, `app/demo` all live (`/demo`→200) |
| Resend quota shows `daily:1 / monthly:19` | **needs dashboard check FIRST** | the test-send headers; won't survive even a 20-person list |
| Presentation Engine (PDF hero example) is local-only | **CONFIRMED** | Phase 4/5 are the 2 unpushed commits; live round-trip never run |
| Paid gate / checkout ($39–79) does not exist | **CONFIRMED** | open `smallest_paid_path` check; MCP `auth.ts` is a no-op stub |
| Flood-dollar AAL per ZIP (33931 ~$30,075/yr vs 33908 ~$10,510) | consistent w/ our data | matches verified sample numbers |

---

## 2. Fold into the CURRENT plan (tactical — this round)

1. **`/ask` is the funnel landing pad, not decoration.** Track 2 stays. **Add an interim:** until `/ask`
   ships, point every email prompt at `/r/zip-report/[zip]` and `/r/[slug]` (both live, both reachable) so
   **no email ever ships a 404 click.** Swap to `/ask?q=…` the moment it's live.
2. **Elevate the Resend-quota check to FIRST in Track 3** — before *any* send, even to yourself or a tiny
   list. If the account is truly capped at 1/day it blocks everything; verify the dashboard before scheduling.
3. **Don't promise the PDF / Presentation Engine in email copy** until it's pushed + browser-verified
   (it's local-only). The "one sentence → branded PDF" hook is real but not yet live to a stranger.
4. **Bake the category-not-product rule into the template + EMAIL.md copy guidance** so it can't drift.

## 3. Next steps AFTER the current email pipeline finishes

> These three (signup capture, paid gate, the post-click experience) are now the **conversion funnel**, owned by `docs/superpowers/specs/2026-06-11-conversion-funnel-design.md` — not this email folder. `/ask` has since shipped (live in prod). Listed here only so the email roadmap knows what it hands off to.

- **Subscriber list / signup capture** — there is no list or signup source today; `build-digest.mts` sends
  to one hardcoded address. The funnel ("get them to try → buy") has no top yet. This is the real
  prerequisite for broad send, separate from Resend domain verification.
- **Paid gate ($39–79, MCP auth stub)** — funnel emails build the list now; *conversion* emails need checkout.
- **`/ask` front-end wrap** — Fable says the converse API, grounding, and `/api/meter` already exist; the
  gap is the page. Verify that in-session before scoping the build.

---

## 4. The differentiators — internal copy ammo (LIVE unless tagged)

Lead line: *one sentence produces a finished, cited, branded artifact from data that's scattered across
5+ subscriptions everywhere else.*

1. **It lives inside their AI — one line, no Zapier.** `claude mcp add … /api/mcp`. (LIVE)
2. **One sentence → a finished, branded client deliverable** (Presentation Engine → `/p/[id]` → PDF,
   save-as-template, one-command re-run). (**BUILT, awaiting push + verify**)
3. **Flood risk in dollars, per ZIP** — the single "can't get this anywhere" item; dollar AAL is
   enterprise-only elsewhere. (LIVE)
4. **Cross-domain synthesis in one answer** — housing capped by flood; corridor = permits+traffic+rents;
   franchise survival by sector. Pair two verticals per email so it reads as a pattern, not a flood gimmick. (LIVE)
5. **Numbers that can't be invented — and prove it** — freshness token + `/r/source/[table]` + `[INFERENCE]`
   tags. "Click any number, see the source." Structural, not a promise. (LIVE)
6. **A direction call with a falsifier** — master's IF/THEN + what would prove it wrong. Becomes the
   scored-history moat. (LIVE)
7. **Corridor-grain narrative at consumer price** — weekly corridor pulse + daily city voices. (LIVE)
8. **Drill to the actual row** — master routes to the upstream brain; ZIP drill returns the real record. (LIVE)

**The steps hook (concrete):** DIY = MLS → export → clean → upload to ChatGPT → prompt (now uncited) →
screenshot → Canva → brand → export ≈ 45–90 min, 4 tools. Ours = one sentence → link → print ≈ 2 min,
every figure carrying its source + as-of date. *"What took your afternoon now takes one sentence."*

## 5. Competitor pricing — INTERNAL ONLY (categories in copy, never names)

| Category (what we say in copy) | Real price (internal) | Source | Source quality |
|---|---|---|---|
| CRE data terminal | ~$500–$2,145/user/mo; contracts $3k–$23k | Vendr; r/CRE | vendor + reddit |
| Foot-traffic intel | $12k–$50k/yr | PassBy; reddit | blog + reddit (soft) |
| Weekly white-label ZIP reports | **$29/mo, 5 ZIPs** | altosresearch.com/pricing | authoritative |
| CMA / listing decks | from $49/mo | SoftwareAdvice | aggregator |
| STR data | ~$15–34/mo entry (annual fine print) | airdna.co/pricing | authoritative |
| Raw property data | Navigator $499/yr; bulk API $10k+/mo | attomdata.com; reddit | vendor + reddit |
| Dollar flood risk | consumer = free scores; **dollar AAL = enterprise only** | riskfactor.com | authoritative |
| Workflow plumbing | $29.99 Pro / $103.50 Team /mo | zapier.com/pricing | authoritative |
| Their AI alone | ~$20–30/mo, zero local data, invents numbers | openai.com/pricing | authoritative |

**DIY stack to approximate us** ≈ MLS dues + $49 + $29 + $30 + $30 + $20 ≈ **$160+/mo, five logins** —
still no flood dollars, no permits, no corridor calls, no citations. The **$39–79 anchor sits under that
with one front door.**

> **Honesty flag:** the white-label weekly digest at **$29/mo is the nearest real competitor for the digest
> itself.** Our edge over it is **breadth** (flood/permits/CRE/tourism) + the **ask-the-AI loop** +
> **source citations** — **not price.** Lead with those, never with "cheaper."

## 6. Future email strategy (roadmap — NOT this round)

- **One unique section / unique analysis per email** — daily = precise to the persona's need; weekly/biweekly
  = "look what we can also do."
- **Funnel:** interested → try (ask-the-AI page) → buyer → daily use. Each email ≥ 2 prompt deep-links.
- **Monthly falsifier-scorecard email** — "last month we said IF X THEN Y; here's how it resolved." Content
  no competitor can copy.
- **Cadence × persona × 2-prompts matrix** (starter content calendar):

  | Cadence | Persona | The two prompts |
  |---|---|---|
  | Daily | Residential agent | "What changed in 33908 this week?" · "Make me a client-ready one-pager for 33919" |
  | Daily | CRE broker | "What's asking rent doing on the Naples corridors?" · "Which Lee corridor has the most permit activity right now?" |
  | Weekly | Investor / buyer | "Is Fort Myers Beach a good buy right now?" · "Compare yearly flood cost: 33931 vs 33908" |
  | Weekly | Business owner | "How are franchise restaurants surviving in Lee County?" · "What does tourism tax say about season strength?" |
  | Bi-weekly | Contractor / dev | "Where is residential permit velocity highest?" · "What's in the construction-notices pipeline?" |
  | Monthly | Everyone | "What's the SWFL direction call — and what would prove it wrong?" · "How did last month's call resolve?" |

- **Later (not soon):** user edits their own email templates by *asking* their AI (ties to the
  Projects/templates engine); auto-replies to reader questions; `/api/meter` engagement emails
  ("you've asked N questions this month"); free `/embed/cards/*` given to local bloggers as distribution.
