# Handoff — `source_label_config_leak`: `"[config]"` leaking into customer-facing source labels

> **Recommended model:** ⚡ Sonnet — single-file render-layer fix + one upstream check.

**Date:** 2026-07-11
**Check:** `source_label_config_leak` (project `cre-swfl`, open)
**File:** `refinery/render/speaker.mts`
**Scope:** pre-existing bug, surfaced while verifying the desk-discovery GEO takeaway work (`f32e71b4`). NOT caused by that change — but that change's new `/r/*` takeaway now *amplifies* it (see "Why it got louder").

---

## Symptom (live, reproducible right now)

On `https://www.swfldatagulf.com/r/cre-swfl`, the literal string `[config]` ships to customers **41 times** — as a fake citation suffix:

```
curl -s https://www.swfldatagulf.com/r/cre-swfl | grep -o '\[config\]' | wc -l      # → 41
curl -s https://www.swfldatagulf.com/r/cre-swfl | grep -oE '[A-Za-z0-9 ]{3,40}\[config\]' | head
#  "SWFL Data Gulf [config]"      ← metrics-table source label
#  "per SWFL Data Gulf [config]"  ← the /r/* GEO takeaway sentence
```

Clean on other brains — `curl -s https://www.swfldatagulf.com/r/master | grep -c '\[config\]'` → **0**. So this is **cre-swfl-specific**: that brain's metric `source.citation` strings carry a snake_case token; `/r/master`'s don't.

This violates the consumption contract (rule 5: no internal IDs / machine tokens in customer output) and reads as a broken citation — the exact thing our "every number names a real source" promise can't afford.

---

## Root cause — one gate exists for caveats, none for source labels

`scrubCaveatTechnical` (`speaker.mts:~422`) redacts any word with an internal underscore to the literal token `[config]`:

```ts
.replace(/\b\w*[a-z0-9]_[a-z0-9]\w*\b/gi, "[config]")   // DFIRM_ID, chargeoff_pct, … → [config]
```

That token is meant to be a **tripwire, not shippable text**. Caveats honor that — `isDisplayableCaveat` (`speaker.mts:819`) drops anything still containing it after scrub:

```ts
// Anything that still contains a [config] token after scrubbing is machine-internal — suppress it.
if (scrubbed.includes("[config]")) return false;
```

But **`shortSourceLabel` (`speaker.mts:690-696`) has no equivalent gate.** It scrubs, trims, truncates, and ships whatever comes out — including a bare `[config]`:

```ts
function shortSourceLabel(citation: string): string {
  const head = citation.split(/\s+[—–]\s+|\s+via\s+|:\s|\s+\(/)[0].trim();
  const cleaned = scrubCaveatTechnical(head).replace(/\s{2,}/g, " ").trim();
  return cleaned.length > 72 ? cleaned.slice(0, 71).trimEnd() + "…" : cleaned;   // ← ships "SWFL Data Gulf [config]"
}
```

Called at `speaker.mts:844` (`sourceLabel: shortSourceLabel(m.source.citation)`) for every `DisplayMetric`. The asymmetry is the whole bug: the redaction placeholder is suppressed in one render path and passed through in the other.

## Why it got louder (not new, but now more visible)

The `/r/*` GEO takeaway shipped in `f32e71b4` builds its sentence from `leadMetric.sourceLabel` — the same `shortSourceLabel` output. So the leak, previously only in the metrics **table**, now also renders in the **takeaway line** (`"… per SWFL Data Gulf [config]."`). Same root cause, one more surface. Fixing `shortSourceLabel` fixes both at once.

---

## Fix — two layers, recommend both

**Layer 1 (durable, defense-in-depth — do this): gate the token in `shortSourceLabel`.**
A source label is a *name*, not prose — a redaction placeholder has no business appearing in it. After scrub, strip the `[config]` / `[internal]` / `[ref]` placeholder tokens and clean up any resulting dangling separators/whitespace. If stripping empties the label, fall back to a sensible default (the brand string, or `displayName(brainId)`). This protects **every** brain, not just cre-swfl, and mirrors the existing caveat gate. Add the failing test first (TDD): feed a citation whose head contains a snake_case token, assert the output carries no `[config]` and no trailing ` ` / dangling dash.

**Layer 2 (upstream, root of the token): why does cre-swfl's citation carry snake_case at all?**
`/r/master` is clean, cre-swfl is not — so cre-swfl's pack is emitting a `source.citation` with an internal identifier in it. Trace the actual `m.source.citation` values for cre-swfl (`refinery/packs/…` cre-swfl definition + its Stage-3/4 citation assembly) and decide whether the token belongs in the citation at all. If it's a real config artifact leaking into provenance, fix it at the source too — Layer 1 stops the *symptom* for all brains, Layer 2 removes *this* brain's cause. (cre-swfl already has special-casing on `/r/[slug]` via `parseMBCityLabel`/`isMBRollup` — its citation shape is known to be idiosyncratic.)

Do NOT "fix" this by weakening the `scrubCaveatTechnical` underscore rule — that regex is load-bearing for redacting real internal IDs out of caveats. The fix is at the consumers, not the scrubber.

---

## Verify (after the fix)

```bash
bun test refinery/render/speaker.test.mts        # new shortSourceLabel gate test green
bunx next build                                   # green
# local SSR:
bunx next start -p 3111 &  # then:
curl -s localhost:3111/r/cre-swfl | grep -c '\[config\]'   # → 0
```
Then after deploy, live: `curl -s https://www.swfldatagulf.com/r/cre-swfl | grep -c '\[config\]'` → **0**, and confirm the metrics table + takeaway both read `"SWFL Data Gulf"` with no suffix. Close `source_label_config_leak` with the live 0-count as evidence.

## Landmines
- Verify with `bunx next build`, not `npx tsc`.
- The takeaway line reuses `sourceLabel` — re-check both surfaces (table AND takeaway) after the fix, not just the table.
- Never push without explicit operator confirmation.
