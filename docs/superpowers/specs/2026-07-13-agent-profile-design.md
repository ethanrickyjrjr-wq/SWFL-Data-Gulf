# The Agent Profile — a bio our AI writes, that cites live data, and that grows

**Date:** 2026-07-13. Everything here was verified against running code on that date.
Where something is unverified, it says so.

**Operator, verbatim:** *"all this intelligence needs to be built into their brand bio
with the help of our ai"* … *"add sections for the agent to be able to work on this with
AI that saves and grows as we learn more or more information is needed. Like you save
information about me."*

---

## Problem

`agent_bio` **is a phantom field.** Verified 07/13/2026:

- `components/brand/BrandingBlock.tsx:201` — a bio textarea exists and is editable.
- `lib/email/brand/branding-to-tokens.ts:69` — it maps to an `AGENT_BIO` token.
- `lib/email/brand/apply-brand.ts:42` — that token lands on the agent card's `bio`.
- **`app/api/user/brand/route.ts` — `agent_bio` appears NOWHERE.** Not in `AGENT_FIELDS`,
  not in any allowlist, not in the select.
- **No `docs/sql/*user_brand*` migration ever created an `agent_bio` column.**

So an agent types their bio, it renders on the canvas, and the save **silently drops it**.
"Type it once — we'll remember" is false for the bio, specifically.

Worse: until 07/13 the *default* bio was a lorem instruction — *"A short bio that builds
trust with your readers"* — and because **the AI deliberately skips brand blocks**, nothing
ever overwrote it. That sentence was verified rendering into a **sent** New Listing email,
under the agent's own name. The default is now `""` (the block already omits an empty bio on
the sendable paths), which closes the leak but leaves a blank.

A blank is honest and useless. This spec makes it authored.

---

## Goal

The bio is written **with our AI**, from the agent's own words plus our real market
intelligence — and it **updates itself** as the data moves. The profile behind it
**accumulates**: when a deliverable needs a fact we don't hold, the AI asks, and the answer
is saved for next time.

---

## The constraint that shapes everything

**WE HOLD ZERO FACTS ABOUT THE AGENT AS A PERSON.** Not their tenure, not their volume, not
their awards, not their specialty. So the AI may **never** write:

> "With 15 years serving Southwest Florida and over 200 homes closed, Marisol is a top-1%
> producer…"

Every clause of that is invented. This is the same failure that cost 07/13: four of seven
deliverables shipped a falsehood, and **not one of them contained an invented number** — what
was invented was the *claim*. A credential is a claim.

**But the agent knows all of it.** So we ask them, and we save what they say. A bio is a
**LANE-2 artifact**: the agent's own words, made durable — plus LANE-1 market data, which we
do hold, and which we cite.

---

## What we're building

### 1. The two lanes a bio is made of

- **Lane 2 — the agent's own words.** "I got into this after buying my first place on a
  canal." Never goes stale. **Saved verbatim** — the STORED ledger row, so we can always
  prove what the agent actually said. That is a provenance rule for `agent_profile_facts`,
  not a style rule for the bio itself: the DRAFTED/rendered bio is free to rewrite,
  restructure, and dress the same fact in better prose. Storing verbatim and writing
  verbatim are two different rules — corrected 07/16/2026 after this got conflated.
- **Lane 1 — our market data.** Cape Coral's typical home value: $339,699. **Goes stale in
  months.** Saved as a **live token**, resolved at build.

**A bio with a frozen number is a lie with a delay.** So a market figure is *never* saved into
the bio text.

**Saved:**

```
I farm Cape Coral — I bought my own first place on a canal here, which is how I
learned what the water actually does to a price. The typical home here runs
{{farm.home_value}}, {{farm.yoy}} over the past year. I send my sphere the
numbers, not the hype.
```

**Sent today:** "…The typical home here runs **$339,699**, **down 7.3%** over the past
year…" — with *Zillow Home Value Index, as of 05/31/2026* in the source list.

**Sent in six months:** the same sentence, a different true number. **The bio updates
itself.** That is the flywheel applied to the one piece of copy every email carries.

### 2. The store — `agent_profile_facts`, one fact per row, with provenance

Modeled on the memory system the operator pointed at. One fact, one row, one source. Never a
blob.

| Column | Notes |
|---|---|
| `user_id` | owner |
| `key` | stable slug — `origin_story`, `specialty`, `farm_area`, `years_active`, `credential` |
| `value` | **the agent's own words**, verbatim. Never AI-rewritten in storage. |
| `source` | `agent_stated` · `agent_upload` · `web_cited` — **the only three legal values** |
| `source_detail` | for `web_cited`: the URL. For `agent_upload`: the doc. |
| `captured_at` | when we learned it |
| `superseded_by` | append-only correction, never a destructive rewrite |

`source` is load-bearing. **A fact with no source cannot exist** — which makes an invented
credential structurally impossible rather than merely discouraged.

Plus `user_brand_profiles.agent_bio` (the composed **template**, tokens and all): the column,
the API `AGENT_FIELDS` allowlist entry, and the `BASE_SELECT` — the three places it is missing
today.

### 3. The token resolver — ONE root

`lib/brand/bio-tokens.ts`. Tokens resolve against the **existing** figure feed
(`loadMarketFigures` — the same producer the email body already uses). No second data path.

| Token | Resolves to |
|---|---|
| `{{farm.home_value}}` | the farm area's typical home value |
| `{{farm.yoy}}` | "down 7.3%" / "up 2.1%" |
| `{{farm.dom}}` | days on market |
| `{{farm.active}}` | active inventory |

Rules, each already paid for:

1. **Resolve at BUILD time, never at save time.** Saving a resolved number re-creates the
   staleness bug.
2. **The citation travels with the figure** into the deliverable's source list (the citation
   renderer already has ONE root — use it).
3. **Unresolved → drop the clause** at a sentence boundary. Never a stray token, never a
   half-sentence, never a stale figure.
4. **The token set is CLOSED.** An invented token is a build error, not a runtime surprise.

### 4. The AI that writes it

A "Your story" section in the Brand panel. The AI interviews, drafts, saves.

**May draw on:** saved `agent_profile_facts` (lane 2, the agent's real words) + the closed
token set (lane 1) + **web-researched, cited local color** (lane 3 — area history, what a
neighborhood is known for, the kind of buyer a specialty serves). Corrected 07/16/2026: this
used to say "nothing else," excluding lane 3 entirely. It shouldn't have — a bio painting a
real picture of the agent's farm area is exactly what lane-3 research is for, same as any
other cited web fact in this product.

**Is expected to, not just permitted to:** rewrite the agent's own words into better prose,
add adjectives, warmth, personality, structure, and favorable framing. **This is the job, not
a risk to contain.** The same synthesis license the platform already gives every market
narrator over a real number (Brain Factory rule 2 — deterministic math, narrative prose)
applies here: the FACT is locked, the TELLING of it is the AI's. A flat, unadorned restatement
of raw facts is not a success case — a well-told, flattering, and true bio is. Corrected
07/16/2026 — this section previously read as banning rewriting; it never should have.

**May never:** invent a credential, tenure, volume, award, or ranking the agent did not state;
or assert a **comparison**, **trajectory**, **count**, **sequence**, or **motive** it was not
handed — `lib/deliverable/claims.ts` applies to a bio exactly as to a deliverable
(`CLAIM_PROHIBITION` goes into its system prompt, reused as-is). If the agent said they closed
one sale, the AI may call it "a hard-won first close" — it may never imply a track record, a
count, or a ranking beyond what was said. The line is invented FACTS, never invented TONE.

**Always editable.** Every draft is shown to the agent to accept, edit, regenerate, or revert
in full — nothing the AI writes ships without the agent seeing it first.

**Fail-closed:** a draft that violates the claim gate is **not shown**. The AI asks a better
question instead.

### 5. How it GROWS

The profile is not a form. It **accumulates, and asks for what it needs, when it needs it.**

Every recipe already declares what it leans on (`Recipe.needs`, `lib/deliverable/recipes.ts`).
Today a gap opens a popup and is then **forgotten**. It should be **remembered**.

1. A build needs a fact we don't hold (Agent Launch wants an origin story; Agent Brand Intro
   wants a headshot; a listing email wants a specialty).
2. The gap is **recorded** against the profile — not surfaced once and dropped.
3. The Brand panel shows an honest short list: *"Three things would make your emails
   stronger"* — each naming the deliverable that wanted it, so the ask has a reason.
4. The AI asks conversationally; the agent answers in their own words; the answer is **saved**
   with `source: agent_stated`.
5. Next build, it is already there. **The profile is richer than it was yesterday.**

That is the difference between a text box and a thing that learns.

---

## Build order

- **Piece 1 — Make it real.** The `agent_bio` column, the API allowlist entry, the
  `agent_profile_facts` table. Without this nothing persists — today's bug.
- **Piece 2 — Author + resolve.** Token resolver, AI drafter, claim gate wired in. The bio
  starts citing live data and self-refreshing.
- **Piece 3 — The growth loop.** Gap capture, the ask list, save-back.

1 and 2 ship together (a bio that persists and refreshes is useful alone). 3 follows and
depends on them being real.

---

## Definition of done

- An agent types a bio and it **survives a page reload** (it does not today).
- The AI drafts a bio carrying a real, **cited** market figure with an as-of date.
- The **saved row** contains a **token**, not a frozen number — proven by reading the row.
- The **sent** email carries the **resolved** figure and its citation — proven by
  `renderEmailDocHtml`, not by reading code.
- **Moving the underlying data changes the sent bio with no edit by the agent.** This is the
  acceptance test that matters; the rest is plumbing.
- No credential appears that the agent did not state — `claims.ts` green.
- The placeholder bio appears in **no** rendered artifact, canvas or email.

---

## Landmines

- **The table isn't in the generated Supabase types.** A new column means an untyped read
  unless types are regenerated — see `verification/supabase-untyped-allowlist.json` and the
  KNOWN-DEBT convention.
- **The AI skips brand blocks by design.** Anything defaulted into a brand block ships to a
  recipient verbatim. That is how the lorem bio escaped. **Never default an instruction into a
  brand block.**
- **A resolved number in a SAVED bio is the staleness bug, re-introduced.** Resolve late.
- **The canvas lies about the email.** Three render engines. Verify the sent artifact.
