# DELIVERABLE ENGINE — COMPLETE WIRING BLUEPRINT

> The whole flow mapped end to end, ONCE, so we stop missing wires.
> Goal: a user asks → an incredible, branded, charted, four-lane, any-level email/PDF/deliverable is built → previewed → scheduled → it self-updates with fresh data + AI commentary on every run. Build + schedule in 5 minutes.
> Every node has: current state (proven `file:line`), the single root to change, and a PROOF OF DONE — a runnable check whose OUTPUT proves the wire carries data. "Done" = the proof passes. Not "the build passes."
> Quality target: `docs/email-marketing/QUALITY-BAR-data-deliverables.md`. Proven problems + roots: `PROBLEMS-SCOPED-AGAINST-CODE.md`.

---

## THE END-TO-END FLOW (the spine — follow the data)

```
user prompt (Email Lab / Projects)
  → [N1] ONE engine assembles full context (any level, four lanes)
  → [N2] engine builds/patches the EmailDoc (reliable parse, strong model)
  → [N4] four-lane gap-fill on every blank (cited web / user, never invent, never blank)
  → [N3] real chart injected as a hosted image block (to the QUALITY-BAR spec)
  → [N5] brand applied (colors + logo + company name)
  → [render] EmailDoc → HTML  (EXISTS: /api/email-lab/render → EmailDocRenderer)
  → [N8] output conforms to the QUALITY-BAR (sections, hierarchy, analyst voice)
  → [N6] persist EmailDoc as a schedulable deliverable        ← THE MISSING WIRE
  → [N9] schedule it (build + recurring) from the UI in <5 min
  → [N7] each scheduled run re-pulls fresh data + regenerates commentary + chart
  → send via Resend (transactional / broadcast)
```

The renderer and the send infra both exist. **What does not exist is the wire from the built `EmailDoc` to the scheduler/send path** — `scripts/email/run-schedules.mts` has ZERO reference to `EmailDoc`; it sends grounded-report TEMPLATES only. So today an Email-Lab email cannot be scheduled or sent at all. That is the nightmare's root: the build and the send were never connected.

---

## NODES (each is a wire — current state → root → PROOF OF DONE)

### N1 — One engine / shared context (FOUNDATION)
- Now: email-lab is a SECOND context path — `app/api/email-lab/ai/route.ts:31` fetches `/api/b/master` over HTTP and `.slice(0,12000)`; every other AI surface uses the in-process `lib/fetch-brain.ts` (`fetchBrain`+`buildDossier`). A change to what the AI knows never reaches the builder.
- Root: `lib/fetch-brain.ts` is the shared sink; route email-lab's `fetchLakeContext` through it. The engine is `lib/assistant/engine.ts`; surface emphasis (projects vs design) is a parameter, not a separate brain.
- PROOF: for the same scope, email-lab and the conversation engine receive byte-identical dossier text (a test asserting equality), and the builder visibly uses a figure that only exists in the full dossier.

### N2 — Builder reliability + model (FOUNDATION)
- Now: `lib/email/doc/schema.ts:210,215` `z.strictObject` rejects any extra key the model returns → `/api/email-lab/ai` returns "try rephrasing" (`route.ts:156-161`). Model hardcoded `route.ts:14 = "claude-haiku-4-5"` for all callers.
- Root: flip both `z.strictObject`→`z.object` (strip mode; final `EmailDocSchema.safeParse` already strips); add a per-request model resolver (Haiku for interactive, Sonnet/Opus for quality builds) sourced from `refinery/agents/anthropic.mts`.
- PROOF: 20 varied real prompts → 0 "try rephrasing"; a quality build runs on Sonnet/Opus; the existing schema test suite stays green.

### N3 — Real chart, injected (parallel leaf)
- Now: `route.ts:96` tells the AI it "can't render a live chart"; `lib/email/chart-image.ts` is the pencil polyline (no gridlines/fill, `$1,285K`, ISO dates); `buildTrendChartUrl` has ZERO callers.
- Root: rewrite `chart-image.ts` to the QUALITY-BAR (gridlines, area fill, direct labels, projection band, `$M`, MM/DD/YYYY); new `lib/email/inject-chart.ts` pre-generates the PNG and inserts an image block before the AI patch (use `hostEmailPng`/`buildTrendChartUrl`, NOT the nonexistent `uploadChartPng`); delete the `route.ts:96` self-refusal.
- PROOF: a built email contains a hosted PNG chart that opens in a browser and matches the QUALITY-BAR checklist; currency ≥$1M shows `$M`, axis dates show MM/YYYY.

### N4 — Four-lane gap-fill (parallel leaf)
- Now: the prompt tells the model to source lanes 3/4 itself but nothing runs the cited fetch; `fillExternalPoint` (`lib/assistant/gap-fill.ts:216`, `web_search_20250305`) is wired into compose-chart, NOT the email builder.
- Root: new `lib/email/gap-fill-pass.ts` wraps `fillExternalPoint`, called after lake fetch / before the AI prompt.
- PROOF: a figure absent from the lake is filled from a cited web source (citation present) or marked `[Need:]`; it is NEVER blank and NEVER invented (assert the citation string is in the output).

### N5 — Brand everywhere (FOUNDATION)
- Now: `renderGroundedReport` is called WITHOUT brand at 3 production sites — `blast/route.ts:140`, `app/p/[id]/print/route.ts:59`, `app/p/[id]/page.tsx:449` — because `grounded-report.ts:60 brand?:` is optional. Fixtures carry brand as nested camelCase that `resolveUserBrand` can't read.
- Root: `grounded-report.ts:60` `brand?:`→`brand:` (compiler reds all 3 + tests in one sweep); add `normalizeFixtureBrand` (and carry fontFamily/textColor/backdrop + companyName, which the current `BrandTheme` drops).
- PROOF: the built email, PDF, and web preview each contain the brand hex colors + a logo URL that returns 200 (assert hex in HTML, GET logo == 200).

### N6 — EmailDoc → schedulable deliverable (THE MISSING WIRE, parallel leaf)
- Now: `run-schedules.mts` sends grounded-report templates; no path persists or schedules an `EmailDoc`. Email Lab and the scheduled-deliverable system are two disconnected worlds.
- Root: persist the built `EmailDoc` (a deliverable row / saved doc) and teach the schedule/send path to render+send an `EmailDoc` (via `/api/email-lab/render` → `EmailDocEmail`) alongside templates.
- PROOF: build in Email Lab → click schedule → a persisted row exists → the scheduled run renders THAT EmailDoc to HTML and sends it (show the row + the rendered HTML of the scheduled occurrence).

### N7 — Self-updating on schedule (parallel leaf)
- Now: the recurring path re-renders static content; it regenerates no fresh chart and no fresh commentary.
- Root: each scheduled run calls the engine (N1) to re-pull fresh data and regenerate the commentary + chart for that occurrence.
- PROOF: two runs over two different data snapshots produce different numbers, different commentary, and an updated chart (diff the two rendered HTMLs).

### N8 — Quality/design conformance (parallel leaf)
- Now: output is "average days on market + a pencil graph"; no section anatomy, no analyst voice.
- Root: `EmailDocRenderer.tsx` + the builder prompt conform to `QUALITY-BAR-data-deliverables.md` (7 sections, hierarchy, the analyst-voice formula).
- PROOF: a rendered email passes the QUALITY-BAR checklist (masthead+as-of, the Read, scorecard with deltas, charted trend + read, analyst commentary with an [INFERENCE]+falsifier, sources/footer).

### N9 — Build+schedule UX in 5 minutes (parallel leaf)
- Now: the Email Lab UI builds a doc; the send/schedule affordance to the N6 pipeline is the open piece.
- Root: a send/schedule control in `ProjectEmailLabClient.tsx` → the N6 persist+schedule pipeline.
- PROOF: a human goes prompt → built → scheduled in under 5 minutes (timed walk-through, screenshots).

### N10 — Kill ZIP-only framing (parallel leaf)
- Now: `app/page.tsx:9-10` "any Lee or Collier ZIP"; `docs/email-marketing/README.md` ZIP-first fixed digest.
- Root: reframe both to any-level (region/county/city/corridor/ZIP/parcel — whatever the ask needs).
- PROOF: no "ZIP-focused / per-ZIP / ZIP-level" in user-facing copy (grep clean); any-level wording confirmed.

---

## BUILD ORDER + FAN-OUT PROTOCOL (so 10 opuses don't become 10 fake "done"s)

**FOUNDATION first — sequential, shared files, proven before anything fans out:** N1 (engine root), N2 (schema + model), N5 (brand root). These touch shared roots; building leaves on top of an unbuilt foundation is how wires go missing. Land + PROVE these first.

**Then fan out the leaves — parallel, worktree-isolated** (each touches its own files): N3, N4, N6, N7, N8, N9, N10.

**Every fan-out agent obeys:**
1. TDD — a failing test/proof FIRST, then the wire, then green.
2. It returns its PROOF-OF-DONE artifact (the runnable output above), not "I wrote the code."
3. An adversarial verifier independently runs each proof and tries to break it — a wire is "done" only if the verifier reproduces the proof.
4. A completeness critic walks the end-to-end spine and flags ANY dangling wire.

**Final acceptance (the anti-fake-done gate):** one real prompt → a rendered, branded, charted, four-lane, any-level email → scheduled → its next occurrence regenerated with fresh data. Shown as actual rendered HTML, opened, numbers real and cited. Until that opens correctly, the engine is not done.
