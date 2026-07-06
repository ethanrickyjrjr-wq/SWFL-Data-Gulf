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

## Immediate small fix — PARTLY DONE (07/06/2026)

`showing-confirmation`'s recipe prose didn't forbid the AI substituting a chart for the photo+map
pair. **FIXED** (`lib/email/author-recipes.ts`): the two-cell row now MUST be two `image` blocks
and NEVER a chart/`signal`/`stats`/`metric-card`. Recipe test green; behavioral proof is a live AI
author run (paid — operator-run).

**Correction on the maps-deep-link half:** it is NOT a recipe-text fix. `lib/email/author-doc.ts`
(≈L488) is explicit — the model writes `button_label` ONLY; **URLs are never authored (moat rule
2)**, and there is no author-writable link field for images/list rows. Image/list `link_url` is
ENGINE-injected (see `linkUrl: photo.linkUrl` / `chart.linkUrl` in author-doc.ts). So the tappable
"clickable address that opens Apple Maps or Google" must be applied by the build engine — inject a
maps deep link (`https://www.google.com/maps/search/?api=1&query=<url-encoded address>`) onto the
map `image` block's `linkUrl` (and the place list-row's `linkUrl`) from the confirmed listing
address, the same way `inject-photo.ts` injects the photo. The recipe now tells the author the map's
directions link is engine-applied and to never fake a URL. **Open task** — see sub-project 2b below;
needs to know how the map image arrives (user upload vs. a generated static map) before wiring.

## Three follow-on sub-projects (decomposed during brainstorming, in dependency order)

**1. Per-link click routing — BUILT + LIVE (07/06/2026, commit `9fbaf95e`).** As-built differs from
the original spec (which was bound to the not-yet-built flow-graph model); corrections folded into
`docs/superpowers/specs/2026-07-06-link-click-routing-design.md`. Targets the live outreach drip:
`lib/email/tracked-links/{token,wrap,redirect}.ts`, `app/api/r/[token]/route.ts`, `link_events`
table (LIVE), wired into `scripts/email/outreach-drip-run.mts`. Check `link_click_routing_live_verify`
open (operator-run live send). Demo/campaign runners are a one-line follow-on.

**2b. Maps deep-link injection (spun out of the "immediate small fix").** Engine-inject a maps
directions `linkUrl` onto the `showing-confirmation` map image + place row from the confirmed
address (moat rule 2: engine authors the URL, model never does). Blocked on how the map image
arrives — user upload vs. a generated static map (the project has Mapbox; a static-map render keyed
on the address is the likely path). Bounded once that's decided.

**2. PLATFORM_ARC auto-advance off real MLS events — SPEC + PLAN DONE (07/06/2026), nothing
built yet.** Design: `docs/superpowers/specs/2026-07-06-platform-arc-auto-advance-nudges-design.md`.
Implementation plan: `docs/superpowers/plans/2026-07-06-platform-arc-auto-advance-nudges.md`. Locked
nudge-only (never auto-build/schedule/send), a dedicated `lifecycle_nudges` table, market-comps
anchored strictly on `new-listing`'s `sent_at` (+14 days). Check `platform_arc_nudges_live_verify`.
A fourth follow-on sub-project spun out of this brainstorm — **Property Watch** (radius-based
nearby-market tracking for ANY address, not just an armed arc) — is explicitly NOT part of this
spec; see `docs/handoff/2026-07-06-property-watch-handoff.md` (not started, needs its own
brainstorm).

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
