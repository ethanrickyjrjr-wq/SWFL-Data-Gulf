# HANDOFF — Campaign automation follow-ups (email ↔ social ↔ MLS)

Session of 07/06/2026: built the full 9-campaign email/social/MLS trigger map, shipped one email
recipe, brainstormed and spec'd the first of three follow-on sub-projects. This file is the
punch list for whoever picks this up next — nothing here is started unless marked otherwise.

## Where everything lives

- `docs/superpowers/specs/2026-07-06-email-campaign-playbooks.md` — the prose research, 9
  campaigns, every claim sourced live via crawl4ai.
- `docs/superpowers/specs/2026-07-06-email-campaign-flow-graph.yaml` — the same map as
  machine-readable nodes/edges.
- Visual map (clickable, redeployed 3x this session): https://claude.ai/code/artifact/4ca5091e-a538-41fb-a929-721ac1afbb89
- `docs/superpowers/specs/2026-07-06-link-click-routing-design.md` — brainstormed + approved
  design for sub-project 1 (below). **Spec done, nothing built yet.**

## Shipped this session

- `showing-confirmation` email recipe (`lib/email/author-recipes.ts`, commit `951c24e1`) —
  distilled from a real BEE-free template. Tested, live-verified in the grid builder.

## Immediate small fix (no research needed, do this first)

`showing-confirmation`'s recipe prose doesn't yet forbid the AI substituting a chart for the
photo+map pair, and doesn't yet require the maps-deep-link button the operator explicitly asked
for ("time, place, clickable address that opens Apple Maps or Google"). Observed live in the grid
builder: a test build put a market chart next to the confirmation instead. Fix the recipe text,
not the block renderer.

## Three follow-on sub-projects (decomposed during brainstorming, in dependency order)

**1. Per-link click routing — SPEC DONE, not built.** See the design doc above. Next step is
`superpowers:writing-plans` against that spec, then implementation. Nothing else in this list
should get built ahead of this one without a reason — it's the foundation the flow graph's
branching edges assume exists.

**2. PLATFORM_ARC auto-advance off real MLS events — spec not started.** `lib/email/sequence/
types.ts`'s five arc steps (`coming-soon`, `new-listing`, `market-comps`, `under-contract`, `sold`)
are advanced only by an agent manually calling `markBuilt`/`markScheduled`/`markSent`
(`lib/email/sequence/state.ts`). `ingest/pipelines/listing_lifecycle/transitions.py` already emits
the exact event rows (`from_state`/`to_state`/`price_delta`) that should drive `new-listing`,
`under-contract`, and `sold` automatically — this is the SAME gap identified independently two
ways this session (once via crawl4ai research into real estate CRMs, once via a GetResponse
feature comparison the operator brought). `market-comps` has no corresponding MLS event; needs a
second trigger type (N days after the previous step sent). Doesn't depend on sub-project 1.

**3. Attribution windows — spec not started, depends on #1.** Last-click-with-time-window
crediting (a competitor ESP's shipped mechanic: link click opens an attribution window, default
5 days, a new click resets it, only one window per contact, only completed transactions count)
applied to `SequenceStep` so the arc UI can show "Market Comps drove N inquiries" instead of just
send-status. Cannot start meaningfully until #1's per-link routing exists.

## Product/UX decisions made, nothing built

- **Command center**: recommended as a tab inside the existing `/project/[id]` shell (email-lab,
  social-lab, project-aware AI already live there) — not a new top-level page.
- **Calendar connection**: OAuth (Google/Outlook/Exchange, Calendly's model) before any "Schedule a
  showing" button goes live for an agent; honest fallback to "reply with what works" when not
  connected — never a fake time slot. This is the real prerequisite for `showing-confirmation-
  booking` in the flow graph to work with real data instead of placeholders.
- **Website narrative**: show outcome moments (a showing confirms itself, a lead doesn't go cold),
  not the flow graph itself — the graph is our build tool, not the pitch.
- **Notification design**: a daily/per-event digest, not a ping per node firing. The graph already
  marks which nodes are human-only (`mls-manual-task`, `create-call-task-1/2`) vs. routine
  auto-sends — that split is the actual lever for what interrupts vs. what waits for the digest.

## Landmines for next session

- **The NotebookLM notebook at notebooklm.google.com/notebook/b2b81937-d0e0-4bc4-88f7-a180b6a69945
  is NOT independent validation.** Its "Real Estate Lead Conversion and Nurture Workflows" source
  and the "Technical Manual" generated from it are built from OUR OWN flow-graph/artifact content
  (verbatim node names, verbatim citations like "calendly.com/features, fetched 07/06/2026"). Asking
  it "are we missing anything" just reflects our own work back. The notebook's other 10 sources
  (SWFL market-data articles) are genuinely independent but cover a different topic (market
  conditions, not lead-conversion workflow).
- **A parallel session was active concurrently** — 3 commits landed on local `main` that aren't
  from this session (`06ba2e1f` FDOR page-size fix, `45d3267e` email-lab place-resolution fix,
  `6e5d7d5c` communities cursor-nudge fix), plus uncommitted working-tree edits on
  `lib/email/build-doc.ts` and `lib/email/place-from-prompt.ts` at push time. Check `git log` and
  `git status` before assuming a clean tree.
