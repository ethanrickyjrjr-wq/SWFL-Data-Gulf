# Phase F Handoff — User-Data Collision, Confidence, Sticky Confirm

> **Read this top to bottom before writing any Phase F code.** It is the single source of truth
> so every session builds F the same way. Companion docs: `01-significance-gate-findings-and-decisions.md`
> (the why + locked decisions D1–D10) and `02-significance-gate-build-scope-and-plan.md` (the
> full phase plan). This doc expands **Phase F only** into buildable detail.
> Author: opus session 2026-06-19. Status: **spec/handoff — NOT started. Brainstorm first (RULE 3.5).**

---

## 0. One-paragraph summary

A user files their own numbers (typed metrics, or numbers inside an uploaded PDF/file). Sometimes
their number disagrees with our lake number. Phase F decides **when** to surface that, **how**
(show our confidence, never correct or overwrite), and **what happens after** (confirm once →
stop nagging → their number is the working value until a genuinely new number arrives). It is the
product-safety layer on top of the certainty gate that's already built.

**The prime directive (operator, 20-yr broker):** *"We don't want AI disconfirming a user's
inputed data or being told what the number actually is. We don't want to fight a professional."*
We **flag with confidence**, we **never override**.

---

## 1. What is ALREADY built (don't rebuild — verified on the working tree 2026-06-19)

| Piece | State | File |
| --- | --- | --- |
| Gate 1 A1 — kill label fallback (no `metric_slug` → silent) | ✅ done | `lib/signals/brain-snapshot.ts` |
| Gate 1 A2 — **strict** scope match (zip→own zip; non-zip→headline; no/partial scope→silent; never the project zip) | ✅ done | `lib/signals/brain-snapshot.ts` |
| Gate 1 A3 — kind guard (percent/dollar/numeric must match) | ✅ done | `lib/signals/change-evaluator.ts` (`inferValueKind`) |
| B1 — registry carries `category`/`z_flag_threshold`/`max_stale_days` (12 slugs) | ✅ groundwork, **INERT** | `lib/signals/types.ts`, `ingest/significance-registry.yaml` |
| C1 — single-change nudge shows `Label: filed X → delta. Want to refresh?` | ✅ partial (delta, not full both-scenarios) | `app/project/[id]/ProjectWorkspace.tsx` |
| E1 — generic "fresh figures" noise row removed | ✅ done | `app/project/[id]/ProjectWorkspace.tsx` |

Gates green at handoff: **41/41 signals tests, 0 tsc errors, eslint clean.** Uncommitted on the
working tree (do not co-mingle with the operator's unrelated `geo_utils.py` / `lee_permits` /
`zip-*` edits when committing).

**Still NOT built (Phase F depends on / coexists with):** B2 noise floor, C2 consequence math,
Phase D ops-log + crawl4ai confirm. F can ship the lifecycle without B2/C2/D, but the crawl4ai
confirm step (F's "want me to check?") IS Phase D — coordinate.

---

## 2. The model everyone must share (locked — see findings doc D6–D10)

### Two jobs, one root, one gate
- **Job A — "our data moved"** (`lib/project/change-detection.ts`, has a daily GHA cron): *we*
  updated → notify / refresh. **Not Phase F.**
- **Job B — "the user's number collides with ours"** (`lib/signals/brain-snapshot.ts` +
  `change-evaluator.ts`): the user's filed number disagrees with our current number. **This is
  Phase F's engine.**
- They stay **separate functions**, but share: **Gate 1 (same exact data, or silent)** and the
  **`data_readiness_alerts` root** on /ops. Do not merge them; do not fork a third.

### The four behavioral rules (D7–D10) — build to these exactly
- **D7 — Show confidence, never override.** Surface: *"our sources put this at X; your filed Y is
  N% off."* Never state "the real number," never overwrite the user's value, never block.
- **D8 — Confirm once = stop popping.** When the user confirms their number is intentional, the
  alert never fires again **for that value**. Sticky.
- **D9 — Their number is the working value** until a genuinely new number arrives — produced by
  **us** (our metric updates) **or them** (re-upload / new typed value / future connector). Then
  re-evaluate.
- **D10 — A user file is a FROZEN snapshot.** We cannot refresh their side (confirmed: uploads are
  static objects, `ConnectMcpBlock` is outbound-only). Until an inbound connector exists, the UI
  must say so plainly so the user isn't surprised when our side moves and theirs doesn't.

---

## 3. ✅ RESOLVED — how user-file numbers become comparable (operator brainstorm, 2026-06-19)

**The problem (probed + confirmed):** a number buried in a user's uploaded PDF is invisible to the
collision engine today. Uploaded files are `kind: "file"` items; at upload, Claude vision distills
the PDF into `extracted_text` (free *prose*) + `extraction_status` (`lib/project/items.ts`). The
engine `computeSignificantChanges` only iterates `kind === "metric"` (`brain-snapshot.ts`) — it never
reads `file.extracted_text`, which has no `metric_slug` / `scope_kind` / structured value, i.e. none
of the inputs Gate 1 requires.

**The decision — staged (b), NOT raw (b):** ship structured-metrics-first, then add an
AI-proposes / user-confirms import that turns file numbers into structured metrics *without bypassing
Gate 1*. Four locked rules:

**(1) Two jobs the file blurs together — keep them apart.**
- **HOLD** = "include all their data on our end." Their addresses, extra columns, raw figures become
  *their reference data* — stored and usable in their deliverable. No Gate 1, no collision.
- **COLLIDE** = Gate 1 pop. ONLY the narrow subset of columns that map to one of *our* slugs at a
  grain we hold. **Most of a file is HOLD, not COLLIDE** — never try to collide the whole spreadsheet.

**(2) Vision is the structuring tool — second output shape, same call.**
- `app/api/projects/[id]/extract-pdf/route.ts` already runs the PDF through Claude vision (Haiku 4.5).
  Today it emits *prose* (`extracted_text`) — perfect for HOLD / email drafting; keep it.
- v1.5 adds a **structured pass**: vision returns per-column
  `{column_label, sample_values, proposed_slug, proposed_scope, confidence, source_quote}`. Vision
  reads the actual table (headers, `$`, `%`, layout) so it proposes identity better than a text
  parser — and because it read the document, it can always **quote the document back** (see rule 3).

**(3) Propose, never override — for metric identity AND scope.**
- AI's column→slug guess is a **proposal to the user, never an auto-assigned identity.** On confirm,
  the column gets a real `{metric_slug, scope_kind, scope_value}` and Gate 1 runs on it exactly like a
  typed metric. AI-matching *manufactures* Gate 1's inputs with a human in the loop; it never bypasses
  the gate. Unknown / low-confidence → **ask** (upgrades Gate 1's "uncertain → silent" to
  "uncertain → ask" for a freshly-handed file). "AI has a pretty solid idea" ≠ "AI may auto-confirm."
- Same pattern for a scope dispute. User: "this is 33901." We never say "you're wrong" — we say
  *"the document you uploaded reads 33908; want me to update the address on this file to 33901 and
  remember it for future uploads?"* We quote **their own document** as the evidence, never assert a
  number at a professional.

**(4) Confirmed mappings are per-project USER DATA — never system vocab.**
- A confirmed "their column X = our slug Y", or an "address → ZIP" correction, lives in **project
  scope** (a small `project_metric_aliases` / address-alias map, or `projects.ui_state`). It must
  **NEVER** go into `refinery/vocab/brain-vocabulary.json` slug_index / `corridor-aliases.mts` — that
  is the moat's *global* semantic ledger, gated by the vocab-coverage pre-push hooks; one user's
  spreadsheet header polluting it is a real violation. One confirm per column/address per project,
  then sticky forever.

**Grain stance (operator decree, 2026-06-19):** we accept user info as correct and resolve
**address → ZIP**, then serve/collide at **ZIP** — the address is only the input that finds the ZIP;
nothing finer is ever invented (moat intact). Address→ZIP machinery shipped 2026-06-19
(`coord_to_zip` / `resolveZipFromCoords` / `fixtures/swfl-zip-centroids.json`); when the ZIP is in the
address string we just lift it out, no geocode needed. Address-*grain holding* (RealCast etc.) is a
future epic, **not** a v1 blocker.

---

## 4. Build spec — Phase F (v1 structured-first; see §3 for the v1.5 vision-import upgrade)

### F1 — Collision surface: show confidence, never override (D7)
- When Job B (`computeSignificantChanges`) returns a change that **passed Gate 1**, render it as a
  **confidence statement**, not a correction:
  > "Our sources put **{label}** at **{current_value}** ({freshness_token}). Your filed
  > **{previous_value}** is **{delta}** off. Your number stays as-is — want me to confirm the
  > current figure?"
- Never: "the correct value is…", auto-replace, or a hard block. The user's value is never mutated
  by us.
- Lives where C1 already renders (the nudge block in `ProjectWorkspace.tsx`), or a per-item badge.

### F2 — Confirm once = stop popping (D8)
- A "That's intentional / keep mine" control persists a **sticky confirmation keyed to the exact
  filed value**. Future runs suppress the alert while the filed value is unchanged.
- **Storage (decide in brainstorm):** the existing `projects.ui_state` jsonb (`patchUiState`,
  already used for `last_freshness_token_seen` + `mcp_dismissed_count`) is the cheapest home — e.g.
  `ui_state.confirmed_values: { [itemId]: filedValue }`. Alternative: a `user_action='confirmed'`
  row in `data_readiness_alerts` (see Phase D / §5). Prefer `ui_state` for the suppression flag;
  ALSO log to `data_readiness_alerts` for ops/promotion evidence.

### F3 — Sticky working value (D9)
- After confirm, the user's number is rendered/used as the working value everywhere downstream
  (deliverables, email). No drift, no silent swap.

### F4 — Re-evaluate ONLY on a genuinely new number (D9)
- Clear the sticky confirmation + re-run Gate 1 → Gate 2 when **any** of:
  - the user re-files / edits the value (new typed value),
  - the user re-uploads a file,
  - (future) a connector pull supplies a new number,
  - **our** metric value changes materially (Job A already detects "our data moved").
- Keying the sticky state to the **filed value string** gives most of this for free: a new filed
  value ≠ the confirmed value → not suppressed → re-evaluated.

### F5 — Frozen-snapshot honesty (D10)
- On `kind: "file"` items (and any confirmed value), the UI states plainly: *"This is the number
  you filed on {date}; we can't refresh it automatically."* Removes the "why didn't it update"
  surprise. This is the v1 answer to the missing inbound connector.

### F6 — Optional confirm-on-yes (this is Phase D; wire if D is ready)
- If the user says "yes, confirm it," fire **crawl4ai** (the ONLY crawl tool — never Firecrawl) to
  fetch the live number, **on a GitHub Actions cron job pattern** (not Vercel, not an agent — see
  findings doc §6 / ops decision), and write the result to `data_readiness_alerts`. Phase 1: user
  still confirms any change. Phase 2 (after a watch window of clean confirms): promote to
  auto-correct per slug (`auto_correct: true`, default false).

---

## 5. Data + storage map (what to touch, what NOT to)

| Need | Use | Notes |
| --- | --- | --- |
| Suppress-after-confirm flag | `projects.ui_state` jsonb via `patchUiState` | Already the home for dismissal/seen state. Cheapest. |
| Ops evidence (every collision + confirm + crawl result) | **extend** `data_readiness_alerts` | Already on /ops. Add: `gate_reason`, `surface` (`'in_project'｜'email'`), `user_action` (`'confirmed'｜'dismissed'｜'ignored'`), `crawl_confirmed_value`. **No new table.** |
| Comparable user metric | existing `kind:"metric"` item (value + `metric_slug` + `scope_*`) | Gate 1 already enforces same-exact-data on these. |
| User PDF number | `kind:"file"` `extracted_text` | NOT comparable today — see §3. v1 = render + D10 disclaimer only. |
| Cron for crawl confirm | **GitHub Actions** (`bun scripts/…mts` like `project-feed-change-detection-daily.yml`) | NOT Vercel (no `vercel.json`), NOT an always-on agent. |

---

## 6. Hard constraints (non-negotiable — violating any = a rebuild)

1. **Never override / disconfirm / overwrite a user's filed number.** Flag with confidence; the
   user decides. (Memory: `feedback_client-data-not-police`.)
2. **Gate 1 first, always.** No collision is surfaced unless it passed the same-exact-data gate
   (exact slug + matched scope + same kind). Uncertain → silent. Do not loosen A2 to "fire on more."
3. **crawl4ai only** for any live confirm. Never Firecrawl (not installed; operator decree).
4. **Brainstorm before building** (RULE 3.5). This doc is the brief, not the authorization.
5. **No autonomous push / PR / branch.** Commit on `main` with explicit paths; the operator pushes.
6. **Don't co-mingle commits** with the operator's unrelated working-tree edits.
7. **Pre-push gates** — touching `change-evaluator.ts`/`brain-snapshot.ts`/the registry needs the
   signals tests green; touching `refinery/packs/**` or vocab triggers the vocab + pack gates.

---

## 7. Definition of done (Phase F, v1 structured-first)

- [ ] A Gate-1-passing collision renders as a **confidence statement**, never a correction, never a
      block, never a mutation of the user's value.
- [ ] "Keep mine / intentional" persists a sticky confirm; the same filed value never re-alerts.
- [ ] The confirmed user value is the working value downstream until a new number (ours or theirs).
- [ ] Editing / re-filing / re-uploading clears the sticky confirm and re-evaluates.
- [ ] `kind:"file"` items show the frozen-snapshot disclaimer (D10).
- [ ] Every collision + user action logged to `data_readiness_alerts` (ops evidence on /ops).
- [ ] (If D ready) "yes, confirm" runs crawl4ai on a GHA cron and records the result.
- [ ] Signals tests green, 0 tsc errors, eslint clean. New unit tests cover: confidence-not-
      correction copy, sticky suppression, re-eval on value change.

---

## 8. Open questions for the brainstorm (answer these, then build)

1. **§3 decision:** ✅ RESOLVED 2026-06-19 — staged (b): structured-first v1, then a vision
   structured-extraction pass that proposes `{slug, scope, value}` for user confirm (v1.5). See §3.
2. Sticky-confirm home: `ui_state` jsonb vs `data_readiness_alerts` row vs both. (Recommend
   `ui_state` for the flag + `data_readiness_alerts` for evidence.)
3. Surface shape: reuse the C1 nudge block, or a per-item badge/inline confidence chip?
4. Does F6 (crawl confirm) ship with F, or after Phase D lands the ops-log columns + GHA cron?
5. Phase-1 → Phase-2 auto-correct promotion bar (findings doc Q4): exact counts/window before any
   slug flips to `auto_correct: true`.
