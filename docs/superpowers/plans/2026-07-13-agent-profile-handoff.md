# HANDOFF — The Agent Profile, pieces 2-UI and 3

**Written 07/13/2026.** Everything here was verified against running code and a live
database on that date. Where something is unverified, it says so.

**Spec:** `docs/superpowers/specs/2026-07-13-agent-profile-design.md` — read it first.
**Check:** `agent_profile_live_verify`.

**Who this is for:** whoever picks this up cold. Piece 1 and the engine of piece 2 are
**DONE AND COMMITTED** (`f1d9de8c`). What remains is the UI and the growth loop.

---

## What the operator actually asked for

> *"all this intelligence needs to be built into their brand bio with the help of our ai"*
>
> *"add sections for the agent to be able to work on this with AI that saves and grows as
> we learn more or more information is needed. **Like you save information about me.**"*

That last sentence is the whole design. It is not a form. It is a **memory** — facts about
the agent, each with a source, that **accumulate** and that the AI **asks to fill** when a
deliverable needs something we don't hold.

---

## What is ALREADY BUILT (do not rebuild it)

### The database — applied and verified live

`migrations/20260713_agent_profile.sql` (already run; column + table confirmed present,
both CHECK constraints active, RLS on).

- **`user_brand_profiles.agent_bio`** — the bio TEMPLATE. It did not exist. The Brand
  panel had a textarea, it mapped to an `AGENT_BIO` token, `apply-brand` rendered it onto
  the agent card — and **there was no column and no API field, so the save dropped it.**
- **`agent_profile_facts`** — one fact, one row, one source:
  `user_id · key · value · source · source_detail · captured_at · superseded_by`
  - `source` is `NOT NULL` + `CHECK IN ('agent_stated','agent_upload','web_cited')`.
    **A fact with no provenance CANNOT BE WRITTEN.** That is deliberate: it makes an
    invented credential structurally impossible rather than merely discouraged.
  - `web_cited` rows must carry `source_detail` (the URL) or the insert fails.
  - Corrections are **append-only** (`superseded_by`), never destructive rewrites.
  - Unique index on `(user_id, key) WHERE superseded_by IS NULL` — one LIVE fact per key.

### The API

`app/api/user/brand/route.ts` — `agent_bio` added to `AGENT_FIELDS`. `BASE_SELECT` derives
from it, so the read came along free. **It persists now.**

### The token resolver — `lib/brand/bio-tokens.ts` (39 tests, green)

- `TOKENS` — a **CLOSED** set: `farm.home_value` · `farm.yoy` · `farm.dom` · `farm.active`.
- `resolveBio(template, scope)` → `{ text, citations, dropped }`.
- `resolveDocBio(doc, scope)` → resolves the agent-card bio **on the built document**.
  Already wired into `authorDoc` (`lib/email/build-doc.ts`), so **all 12 recipes get it**.
- Resolves against `loadMarketFigures` — the **same** feed the email body uses. No second
  data path, so a bio can never disagree with the email it rides in.

**The rules it enforces, and why:**

1. **Resolve at BUILD, never at SAVE.** A market figure frozen into saved text is *a lie
   with a delay*: "$339,699" is true today, false by winter, and it would rot inside the
   signature block of every email the agent sends, under their name. Nobody ever goes back
   and edits a bio.
2. **An unresolvable token drops its WHOLE SENTENCE**, at a boundary. Dropping only the
   token would leave *"The typical home here runs , over the past year."*
3. **An invented token can never become a number** — it resolves to nothing and its clause
   is dropped. This is the structural guard against a fabricated credential.

---

## PIECE 2-UI — "Your story": the AI drafter

**Where:** a new section in `components/brand/BrandingBlock.tsx`, beside the existing bio
textarea (which is at ~line 201 and currently saves to nowhere useful without the drafter).

**What it does:**

1. The agent talks to the AI in plain language ("I've been doing this 8 years, mostly
   waterfront in Cape Coral, got into it after buying my own first place on a canal").
2. The AI **saves each fact** to `agent_profile_facts` with `source: 'agent_stated'` and
   the agent's **own words, verbatim** — never a paraphrase. The moment we store a
   paraphrase we lose the ability to prove what they actually said.
3. The AI **drafts the bio TEMPLATE** from those saved facts + the closed token set.
4. The agent edits and saves. The saved text contains **tokens**, not numbers.

**What the drafter may draw on — and NOTHING else:**

- saved `agent_profile_facts` (lane 2 — the agent's own words);
- the closed `TOKENS` set (lane 1 — our data, resolved late and cited).

**What it may NEVER do:**

- **Invent a credential.** No tenure, no volume, no awards, no ranking, no "top 1%".
  **WE HOLD ZERO FACTS ABOUT AN AGENT AS A PERSON.** This is the same class of failure
  that shipped four falsehoods on 07/13 — and **not one of them contained an invented
  number**. What was invented was the CLAIM. **A credential is a claim.**
- **Assert a comparison, trajectory, count or sequence it was not handed.**
  `lib/deliverable/claims.ts` applies to a bio exactly as to a deliverable. Print
  `CLAIM_PROHIBITION` into the drafter's system prompt and run `auditClaims` on the draft.
- **Write a selling claim of its own** ("the agent you can trust", "unmatched service").

**FAIL CLOSED.** A draft that violates the gate is **not shown**. The AI asks a better
question instead. A bio we cannot source is a bio the agent writes themselves.

**Validate before save:** `tokensAreKnown(template)` must be true. An unknown token is a
bug, not a runtime surprise.

**Do NOT resolve tokens in the editor's saved value.** Show a resolved *preview* if you
like (call `resolveBio`), but **save the template**. Saving a resolved number re-creates
the staleness bug in the one place nobody will ever look again.

---

## PIECE 3 — The growth loop (this is the part the operator actually asked for)

**The problem it solves:** today a gap opens a popup and is then **FORGOTTEN**. The agent
is asked for their headshot, they skip it, and we never ask again — and no deliverable ever
knows what it was missing.

**The loop:**

1. **A build needs a fact we don't hold.** Every recipe already declares this —
   `Recipe.needs` in `lib/deliverable/recipes.ts` (`agent_name`, `photo_url`, `brokerage`,
   `business_address`). Agent Launch wants an origin story. Agent Brand Intro wants a
   headshot. A listing email wants a specialty.
2. **RECORD the gap** against the profile — do not merely surface it once and drop it.
   (`brandGaps()` in `lib/showcase/recipe.ts` already COMPUTES the gap; nothing persists it.)
3. **The Brand panel shows an honest short list** — *"Three things would make your emails
   stronger"* — and **each one names the deliverable that wanted it**, so the ask has a
   reason instead of being a nag.
4. **The AI asks conversationally**, the agent answers in their own words, and the answer
   is **saved as a fact** with `source: 'agent_stated'`.
5. **Next build, it is already there.** The profile is richer than it was yesterday.

That is the difference between a text box and a thing that learns.

---

## Definition of done (do not claim done without these)

- An agent types a bio and it **survives a page reload**. *(It did not, before f1d9de8c.)*
- The AI drafts a bio carrying a real, **cited** market figure with an as-of date.
- The **saved row** contains a **token**, not a frozen number — **prove it by reading the
  row**, not by reading the code.
- The **sent** email carries the **resolved** figure and its citation lands in the source
  list — **prove it with `renderEmailDocHtml`**, not by reading the code.
- **THE ACCEPTANCE TEST:** move the underlying lake data, rebuild, and the sent bio changes
  **with no edit by the agent**. Everything else is plumbing.
  (`lib/brand/bio-tokens.test.ts` already proves this at the unit level. Prove it end to
  end through `authorDoc`.)
- No credential appears that the agent did not state — `auditClaims` green on the draft.
- The old placeholder bio appears in **no** rendered artifact, canvas or email.

---

## Landmines

- **THE AI SKIPS BRAND BLOCKS BY DESIGN.** Whatever is defaulted into a brand block ships
  to a recipient **verbatim**. That is exactly how the lorem bio ("A short bio that builds
  trust with your readers") reached a **sent** email under an agent's own name.
  **NEVER default an instruction into a brand block.**
- **A resolved number in a SAVED bio is the staleness bug, re-introduced.** Resolve late.
- **`user_brand_profiles` is not in the generated Supabase types.** Reads of the new column
  are untyped — see `verification/supabase-untyped-allowlist.json` and the KNOWN-DEBT
  convention (`lib/desk/loaders.ts` is the reference pattern).
- **The canvas lies about the email.** Three render engines disagree. Verify the SENT
  artifact, always.
- **`lint-staged` silently drops staged-MODIFIED files** — stash-isolate before committing.
