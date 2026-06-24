# TASK 12 — AI route: content-patch mode   🔵 OPUS

**Wave:** 1 · **Depends on:** 00 · **Parallel-safe with:** 10, 11, 31, 32
**Owns (only edit these):**
- `app/api/email-lab/ai/route.ts`  *(modify existing)*

## Build
Move the AI from token-patches to a **text-only content patch** over the current `EmailDoc`. Spec → *AI + data contract*.
- Input: `{ prompt, doc, scope }`. Keep the existing `fetchLakeContext(scope)` (`/api/b/master?view=speak&tier=1`) **unchanged**.
- Output: `ContentPatchSchema`-validated `{ blockId → {…text props} }`. **Parse through zod — on failure return the unchanged doc + an error flag, never render garbage.**
- System prompt rules (verbatim intent): real numbers from LAKE DATA only — **never invent a SWFL number**; do not add/remove/reorder blocks or change types; **never emit `globalStyle` or `bgColor`** (colors/fonts are the user's brand settings); AI "reading/advice" goes into an existing `text`/`signal` block, `[INFERENCE]`-tagged with a falsifier when beyond cited facts.
- Model: keep `claude-haiku-4-5`. **Raise `max_tokens` off 1024** (verified 200K ctx / 64K out) — ~4–8K is plenty for a full fill.
- Keep the legacy `{ prompt, currentTokens }` branch working during transition.

## Acceptance
- `bun test` green. A test feeds a fake model reply that's malformed → route returns unchanged doc + error, no throw. A valid reply patches only the named blocks; `globalStyle` untouched even if the model emits one.

## Isolation
One route file. Imports schema from `lib/email/doc/schema.ts` (Task 00). Don't touch the render route (Task 21).
