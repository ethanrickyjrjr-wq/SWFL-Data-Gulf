# P9 — Discoverability Wiring (PLAN, do NOT apply)

**Goal:** make a cold Claude hit `docs/standards/data-roots.md` FIRST for any data question or
build. Operator's rage: *"every fucking Claude knows where to check first."*

**Nothing below is applied.** These are exact, ready-to-paste edits with grounded anchors. Every
edit is a **process pointer** ("open this file first"), never a normative `X IS the authority`
claim — so no `[NEEDS-SIGN-OFF]` tag is required on any of them (verified against the constraint:
authority ratification is a separate C1/C2 operator sign-off; pointing at where the intended root
is catalogued does not ratify a concept→table mapping).

**The two levers that actually answer the rage** (highest salience, ranked):
1. **FOCUS hook (Edit 3)** — injects on EVERY prompt. Strictly stronger than anything that fires
   once. This is the lever.
2. **CLAUDE.md RULE-block + Reference-index row (Edits 1–2)** — read top-to-bottom by a cold
   session; a scannable header is what a header-scanning Claude retrieves 50 turns later.

Memory (Edit 4) reinforces at session start; kickoff (Edit 5) is **already covered** by open checks
— no code change recommended.

---

## Grounding — the real mechanisms (probed live 2026-07-18)

| Surface | File | How it fires | Verified |
|---|---|---|---|
| FOCUS gist | `_ASSISTANT/RULES.md` (live source) → falls back to `DEFAULT_RULES` in `.claude/hooks/inject-focus.mjs` (L47–54) | UserPromptSubmit hook, **every prompt**, `additionalContext` | `inject-focus.mjs` L58–67 `loadRules`: operator file WINS when present; DEFAULT_RULES is fallback only |
| CLAUDE.md RULE stack | `CLAUDE.md` RULE 0 / 0.4 / 0.5 / 0.6 / 0.7 (L3, 15, 49, 57, 68) | injected canon, read top-down | grepped L49 `# RULE 0.5`, L57 `# RULE 0.6` |
| Reference index | `CLAUDE.md` L246 header, table L248–261 | canon | Read L246–261 |
| Memory index | `~/.claude/projects/C--Users-ethan-dev-brain-platform/memory/MEMORY.md` | loaded wholesale at session start | Read L1–20, section headers L5/12/28/35/44/51/58/63/79/91/102 |
| SessionStart kickoff | `.claude/hooks/print-kickoff.mjs` → `scripts/session-kickoff.mjs` | prints Last-ship / **Open checks** / Records / Build-queue / flappers / brief / TODAY.md | Read both; live-status board by design |

**Test invariant checked:** `.claude/hooks/inject-focus.test.mjs` does NOT require DEFAULT_RULES to
be byte-identical to RULES.md. It only asserts DEFAULT_RULES *contains* marker strings (`MM/DD/YYYY`,
`ZIP-level`, `plain text`, `invent`, `chart` — L46–52) and that `buildAdditionalContext(DEFAULT_RULES)`
stays < 4000 chars (L78–81) and the JSON < 10k (L96). Adding one ~230-char line keeps both far under.
So: **the RULES.md edit is the only one that changes live behavior; the DEFAULT_RULES mirror is
optional hygiene, not test-gated.**

**"front-matter" clarification:** `data-roots.md` has NO YAML front-matter — it opens with
`# Data Roots — THE one place` and its catalog rules (L1–14). "Read the front-matter first" = read
that **opening section**. All pointers below say "top section" to be unambiguous.

---

## EDIT 1 — CLAUDE.md Reference-index table row (the pointer line)

**File:** `C:\Users\ethan\dev\brain-platform\CLAUDE.md`
**Anchor:** table header at L248–249 (`| Topic | File |` / `|---|---|`); first data row L250 is
`| **Data & Build Bible** | ... |`.
**Action:** INSERT a new row as the **first data row**, immediately after the `|---|---|` separator
(L249), before the "Data & Build Bible" row.

```markdown
| **★ Data roots — CHECK FIRST** | `docs/standards/data-roots.md` — the ONE catalog of which table/root feeds each number; any data question or build starts here (one root per concept) |
```

**Why:** the pointer line the task asked for; placed FIRST so a table/header scan hits it before the
Bible. `CHECK FIRST` = *where to look* (process pointer), not "the live source of truth for every
number" — avoids overclaiming a still-consolidating catalog. `one root per concept` quotes
data-roots.md's own L4.

---

## EDIT 2 — CLAUDE.md dedicated RULE-style callout (new block RULE 0.55)

**File:** `C:\Users\ethan\dev\brain-platform\CLAUDE.md`
**Anchor:** RULE 0.5 block ends at L55 (`---`) then blank L56; RULE 0.6 starts L57 (`# RULE 0.6`).
**Action:** INSERT a new block between L56 (blank) and L57.

> Decision: a **dedicated scannable header**, not a sentence appended into RULE 0.5's body. A cold
> Claude scanning headers retrieves a header; a line buried mid-paragraph gets skimmed. Sorts between
> 0.5 and 0.6 per the repo's decimal-rule convention. Cross-references RULE 0.5 so they read as
> siblings (it IS "probe code first" applied to data).

```markdown
# RULE 0.55 — DATA ROOTS: ONE CATALOG, LOOK THERE FIRST

**Any question or build that reads a SWFL number starts at `docs/standards/data-roots.md`.** It is
the ONE catalog of which table/root feeds each concept — open its top section BEFORE you wire a
consumer or answer a data question. One root per concept per cadence; if the root isn't listed you
ADD a root, you do NOT add a second table. This is RULE 0.5 (probe code first) applied to data: the
catalog is the first file to open. Consolidation is in progress — each root carries a 🔴/🟡/🟢 status
marker; treat a 🔴 not-built root as *the intended home*, never as a served number, and never DELETE
a duplicate table until its replacement runs, every consumer repoints, and the operator signs off
(RULE 1).

---
```

**Why the parenthetical guard:** data-roots.md is mid-consolidation (its own status legend, L43:
🔴 not built · 🟡 chosen-not-repointed · 🟢 live). Without the guard a cold Claude could treat a 🔴
root as gospel. The deletion clause restates RULE 1 (operator-gated) so the callout can't be read as
license to drop tables. Phrasing stays a process pointer → no authority ratification, no sign-off tag.

---

## EDIT 3 — FOCUS hook gist (the every-prompt line) — TWO files, keep in sync

### 3a — PRIMARY (LIVE, changes injected context): `_ASSISTANT/RULES.md`

**File:** `C:\Users\ethan\dev\brain-platform\_ASSISTANT\RULES.md`
**Anchor:** file currently ends with rule `7.` on L8 (L9 blank). Append a rule `8.`

```
8. For any SWFL number, which table/root feeds it is catalogued in one place — docs/standards/data-roots.md; open its top section before wiring a consumer or answering a data question. One root per concept; an unbuilt root is the intended home, not a served value.
```

**Why this is THE load-bearing edit:** `inject-focus.mjs` `loadRules` (L58–67) reads
`_ASSISTANT/RULES.md` and it **wins at runtime** — this line ships into `additionalContext` on
every prompt. **Factual-reminder phrasing**, not imperative — the hook's own comment (L16–17, L46)
says imperative phrasing trips prompt-injection defenses and gets surfaced to the user. Matches the
tone of rules 1–7.

### 3b — MIRROR (hygiene only, NOT test-gated, does NOT change live behavior while RULES.md exists): `inject-focus.mjs`

**File:** `C:\Users\ethan\dev\brain-platform\.claude\hooks\inject-focus.mjs`
**Anchor:** `DEFAULT_RULES` template literal, rule `7.` on L53 (closing backtick + `;` on L54).
**Action:** append the identical rule `8.` after L53, before the closing backtick.

```
7. Probe our code first (RULE 0.5), research the outside answer with crawl4ai not memory (RULE 0.4). If unsure, use /advisor — never guess.
8. For any SWFL number, which table/root feeds it is catalogued in one place — docs/standards/data-roots.md; open its top section before wiring a consumer or answering a data question. One root per concept; an unbuilt root is the intended home, not a served value.`;
```

**Safety vs the test:** DEFAULT_RULES today ≈ 1.2k chars; +~230 chars → `buildAdditionalContext`
stays far under the 4000-char assert (`inject-focus.test.mjs` L78–81) and the JSON under 10k (L96).
The marker-string asserts (L46–52) are untouched. No test change needed. **This mirror only matters
if `_ASSISTANT/RULES.md` is ever absent/blank** — update it purely so the two copies don't drift.

---

## EDIT 4 — Memory: new project memory + MEMORY.md pointer line

### 4a — NEW memory file

**Path:** `C:\Users\ethan\.claude\projects\C--Users-ethan-dev-brain-platform\memory\project_data-roots-catalog-check-first.md`
**Format:** modeled on the existing `project_parcel-data-authority-verified-2026-07-18.md` (YAML
front-matter `name`/`description`/`metadata`, then body). **Does NOT enshrine any concept→table
authority mapping** — it describes the catalog + its one-root rule, cites parcel row/col counts as
verified facts (not authority claims), and frames the target explicitly as recommendations pending
operator sign-off.

```markdown
---
name: project_data-roots-catalog-check-first
description: "docs/standards/data-roots.md is THE catalog of which table/root feeds each number — the first file to open for any SWFL data question or build. Ends the 'which table do I wire / is this a duplicate' loop."
metadata:
  node_type: memory
  type: project
  modified: 2026-07-18
---

There is ONE catalog of which table/root feeds every SWFL number: `docs/standards/data-roots.md`
(built 07/18/2026, ~1600 lines, 8-batch route-tracer fan-out + 3-Sonnet verify). Open its **top
section FIRST** for any question or build that reads a number — before grepping the lake, before
wiring a consumer, before answering. It exists so a cold session stops re-deriving "which of the N
tables is the real one."

The rule the catalog enforces (its own opening lines): a consumer (brain / chart / page / email)
reads ONLY a listed root, never a raw base table; ONE root per concept per cadence; if the root
isn't listed you ADD a root, you do NOT add a second table; when a number is wrong there is exactly
one place to fix it.

STATUS — the catalog is mid-consolidation, NOT yet ratified. Each root carries a marker:
🔴 not built · 🟡 root chosen but consumers not repointed / duplicates not deleted · 🟢 live, all
consumers on it, duplicates deleted. Treat a 🔴/🟡 root as the INTENDED home, not a served value.
The concept→table recommendations in the companion `docs/standards/data-authority-map.md` are
explicitly "recommendations, not ratified" — they need operator C1/C2 sign-off before any
"X IS the authority" claim, and no duplicate table is deleted until its replacement runs, every
consumer repoints, and the operator signs off (RULE 1).

Redundancy poster child (row/col counts verified live 07/18, not memory): parcels are ingested up to
4× off the same FDOR Statewide Parcel FeatureServer — `collier_parcels` (290,973 rows / 104 cols,
comprehensive), `leepa_parcels` (548,798 / 19, Lee Property Appraiser — a DIFFERENT source,
valuation+sale only), `parcel_subdivision` (604,362 / 28, FDOR homes-only; its one distinctive col is
subdivision_name), and `lee_parcels` (does not exist yet — FDOR ingest in flight; its OUT_FIELDS are
byte-identical to collier_parcels, so on landing it = the full 104-col Collier-shape table). Open
checks track the consolidation: `lee_parcels_leepa_redundant_into_properties_lee`,
`collier_parcels_parcel_subdivision_redundant_scrape`, `data_authority_single_source_registry`.

Related: [[project_parcel-data-authority-verified-2026-07-18]] (the parcel-table detail) ·
[[feedback_full-scope-first-census-before-ingest]] · [[feedback_shared-concept-one-authority]] ·
[[project_citation-renderer-single-root]].
```

> Note on `modified`: the existing parcel memory uses a full ISO timestamp
> (`2026-07-18T19:19:51.365Z`). Use whatever the memory-writer tool stamps; the date-only value above
> is a placeholder — if the memory system requires the ISO form, let it set it.

### 4b — MEMORY.md pointer line

**File:** `C:\Users\ethan\.claude\projects\C--Users-ethan-dev-brain-platform\memory\MEMORY.md`
**Anchor:** `## Data / ingest / pack landmines` header at L63; current first bullet is L65
(Factuality CI gate).
**Action:** INSERT a new **first bullet** immediately after the L63 header, before the L65 bullet —
as the umbrella parent over the individual authority notes in that section.

```markdown
- **[Data roots — ONE catalog, CHECK FIRST](project_data-roots-catalog-check-first.md)** — `docs/standards/data-roots.md` is the first file to open for any data question/build (which table/root feeds each number; one root per concept). Umbrella over every authority note below. Mid-consolidation — roots carry 🔴/🟡/🟢 status; the concept→table map is recommendations pending operator sign-off.
```

**Why this section:** co-locates with the existing parcel-authority note already in this section
(`[Parcel data authority map — VERIFIED LIVE 07/18](project_parcel-data-authority-verified-2026-07-18.md)`)
as its umbrella parent — where a data question conceptually lands. MEMORY.md loads wholesale at
session start, so it surfaces then regardless of section.

---

## EDIT 5 — SessionStart kickoff: should it surface data-roots.md?

**Recommendation: NO — do not hardcode a static pointer into `scripts/session-kickoff.mjs`.** Leave
it unchanged. Grounded reasons:

1. **The kickoff is a LIVE-STATUS board by design.** `session-kickoff.mjs` prints only changing
   state — last-ship, open checks, records reqs, build queue, flappers, morning brief; even TODAY.md
   is *pointed at*, not inlined (L317, L31–40). A permanent static pointer would be the one non-status
   line and would read as stale noise once consolidation lands.
2. **The FOCUS hook already does better.** Edit 3 injects the same pointer on EVERY prompt
   (UserPromptSubmit) — strictly stronger than a once-at-session-start line. The rage ("every Claude
   knows to check first") is answered by the every-turn injection, not by a start banner.
3. **The consolidation is ALREADY surfacing at session start through the existing mechanism.** The
   kickoff's "Open checks" line (`getOpenChecks`, L73–94; printed L325) prints open `checks`, and
   **three consolidation checks are already open and name the catalog** — verified live via
   `node scripts/check.mjs list` on 07/18:
   - `lee_parcels_leepa_redundant_into_properties_lee` — label literally reads *"Surfaced 07/18/2026
     building the data-roots catalog (docs/standards/data-roots.md); this is the redundancy poster
     child for the whole consolidation."*
   - `collier_parcels_parcel_subdivision_redundant_scrape`
   - `data_authority_single_source_registry` — *"Reference + recommended canonicals:
     docs/standards/data-authority-map.md (needs operator sign-off to become normative)."*

   So the transient "we're consolidating — use the catalog" signal is **already at session start with
   zero new code**, and it self-clears when those checks close. That is the idiomatic, self-expiring
   route (RULE 2: obligations live in `checks`, not as static markers).

**No new check needs opening** — the three above already cover it. If a *permanent* start-of-session
banner is ever demanded over this recommendation, the ONLY clean insertion is a single static line
appended to the kickoff **banner text** (`session-kickoff.mjs` ~L321–323, the `KICKOFF — …` header
block), NEVER inside the live-data section — but I recommend against it for the staleness reason in
point 1.

---

## Apply order (when the operator green-lights)

1. Edit 1 + Edit 2 (CLAUDE.md) — one file, two inserts.
2. Edit 3a (`_ASSISTANT/RULES.md`) — the live behavior change. Then Edit 3b (`inject-focus.mjs`
   mirror) in the same commit; run `node .claude/hooks/inject-focus.test.mjs` to confirm green.
3. Edit 4a (new memory file) + Edit 4b (MEMORY.md pointer) — via the memory-writer tool so `modified`
   is stamped correctly.
4. Edit 5 — no action (leave kickoff as-is).

**Commit note:** these are docs/hooks/memory only → RULE 1 "just push" class, but this is a plan;
apply only on operator go. `_ASSISTANT/RULES.md` + `.claude/hooks/inject-focus.mjs` are repo files
(RULES.md is operator-editable canon) — stage them explicitly, never `git add -A` (RULE 1.5).

---

## Constraint compliance

- **No repo file edited.** Plan only; every edit is quoted text, not applied. ✓
- **No DROP/DELETE/TRUNCATE authored.** Deletion is only ever *described* as operator-gated (RULE 1),
  and both the RULE 0.55 callout and the memory stub restate that gate. ✓
- **No normative "X IS the authority" claim.** Every pointer is a *process* pointer ("open this to
  find the intended root"); the memory stub frames concept→table mappings as recommendations pending
  C1/C2 sign-off. Therefore **no `[NEEDS-SIGN-OFF]` tag is required** (there is no authority assertion
  to ratify). ✓
- **No invention.** Every claim cites a live source: data-roots.md line numbers (L4 one-root rule,
  L43 status legend), hook `file:line` (inject-focus.mjs L58–67, test L78–96), the CLAUDE.md/MEMORY.md
  anchors read this session, parcel row/col counts from the shared ground truth (mirrored in the
  existing parcel memory), and the three check labels from a live `check.mjs list`. ✓
- **Wrote only to the assigned scratchpad path.** ✓
