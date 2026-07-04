# 21 — Unify the two contact stores (P6)

- **Status:** ⬜ Not started — **brainstorm/plan first (RULE 3.5)**
- **Owner:** needs plan → website-builder + deliverable-builder
- **Source:** autopsy §9.6

## What

`/contacts` writes `public.contacts`; the lab reads `email_contacts`. A user who finds `/contacts`
first builds an audience the recipe flow **can't send to.** Unify the two stores.

> Related open check at session start: "Reconcile email_contacts vs public.contacts two-lane + dedupe
> vCard parsers" (manual, due Jul 3) — this task IS that check; reference it, don't duplicate it.

## Why it's a plan, not a quick edit

Two data lanes + two vCard parsers + dedupe semantics + a live `/contacts` page and the lab audience
builder. Data-shape decision. Brainstorm + plan.

## Steps

1. `superpowers:brainstorming` — one store or a synced view? Which is canonical? Dedupe rule?
2. `node scripts/new-build.mjs <slug> "<label>"`.
3. Reconcile writers/readers so a contact added anywhere is sendable from the recipe flow.

## Done when (live proof)

- A contact added via `/contacts` appears as a sendable audience member in the lab recipe flow (live,
  end-to-end), and the duplicate-parser path is unified.

---
When done: flip Status to ✅ and `git mv` this file to `../Operation-July-DONE/`.
