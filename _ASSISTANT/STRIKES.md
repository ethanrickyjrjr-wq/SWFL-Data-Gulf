# STRIKE REGISTRY — RULE 2 §0b's counter (built 08/10/2026, backfilled same day)

This file is HOW a session knows it's the third time. Every scratchpad entry that matches an
existing shape adds a `- strike:` line under it (date + five words); a new failure shape gets a
`## shape:` header. The SessionStart scratchpad printer counts these lines and prints every shape
at 2+ strikes whose guard line still says OWED. **At 3 strikes, writing another scratchpad entry
is banned as the response — that session builds the mechanism and flips the guard line.**

Format contract (the printer parses this, keep it):
`## shape: <slug>` then one `guard: <OWED | BUILT <what, date>>` line, then `- strike:` lines.

## shape: decree-in-prose-code-never-walked-it
guard: BUILT — Gate 17 strikes-guard (08/10/2026, .claude/hooks/lib/strikes-guard{,.test}.mjs): a shape at 3+ strikes whose guard is OWED with no open-check key BLOCKS EVERY PUSH until the mechanism ships or is tracked — recurrence can no longer age in markdown, which is this shape's failure mode. Built the same night the operator asked "what is the fucking point of updating strikes if no one does anything." Tonight's instance also shipped its own specific guard: lane-3b spec-gap trigger + 3 red-first tests (recipes/shared.ts).
- strike: 08/06 fontFamily unguarded while the doc said typography decided
- strike: 08/05 §1.16 prose-width rule written, "no lint enforces this yet"
- strike: 08/10 0.7a ladder decreed 08/06, resolved-subject builds never walked to the paid rung until caught live (baths "+ Add" on Dennis Dr)

## shape: green-locally-red-in-ci-mock-leak
guard: BUILT 08/11/2026 — `lib/testing/mock-restore-ratchet.test.ts`, a shrink-only ratchet in the plain `bun test` run: any test file calling `mock.module()` on an in-repo specifier without an `afterAll` restore fails CI unless it is on the frozen 45-file whitelist; fixed/deleted files must come OFF the list. Check test_mock_leak_restore_lint closed same day. The 45 whitelisted offenders still owe the per-file snapshot-restore sweep — but no NEW leaker can land, and the list can only shrink.
- strike: 07/?? "kill a global test-mock leak" (73952249)
- strike: 08/?? export-route tier mock hijacked segments/preview — 5 red runs
- strike: 08/11 segments mock reached usage.test.ts 110 files later — 12 red runs
- strike: 08/11 agent-build route.test.ts default-docs mock → frozen-occurrence red 11+ CI runs, green locally (Linux vs Windows file order); leaker fixed with snapshot-restore + guard built (this line)
- strike: 08/11 nightly-chain.yml `listings:` job deleted, its trailing `secrets: inherit` left orphaned (cb803b1c) → GitHub rejects the file, 2 runs with ZERO jobs. PyYAML parses it fine (glues the orphan onto `guard:`), so a local yaml check is green while the real gate is red. SAME MECHANISM, NEW SURFACE: the BUILT guard above only covers test-mock leaks; nothing validates workflow YAML against the real parser. Guard owed: actionlint over changed `.github/workflows/*.yml` in the existing pre-push gate.

## shape: fixed-but-not-live
guard: BUILT — pre-push Gate 15 capture-freshness (08/10/2026): email-surface code can't push without a re-baked capture
- strike: 07/20 same surface fixed five times, never driven live
- strike: 08/06 font looks different again after "fix"
- strike: 08/09 coming soon BACK to the trailer after fix
- strike: 08/10 just-sold "fixed" but STILL THE SAME on site
- strike: 08/10 code fix ≠ live until rebake (capture lag class)

## shape: didnt-read-what-we-hold
guard: BUILT — four-lane gate (07/22/2026) + RULE 0.95 + what-do-we-have skill (08/05/2026)
- strike: 07/22 answered data question without the four searches
- strike: 08/05 nearly rebuilt P7/P9 docs that existed
- strike: 08/06 "no font research" while it sat on disk
- strike: 08/06 "did you even look anything up"
- strike: 08/09 "which fucking playbook are you looking at"
- strike: 08/10 paid $0.05 re-proving §3.3.1 R1 before reading it
- strike: 08/11 ASKED THE OPERATOR a question our own crawl4ai research had answered HOURS EARLIER,
  same day, same file: _RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md
  §4.1 ("it must be allowed to return NO DIRECTION") + §6 ("a slope whose CI includes zero returns no
  direction ... the gradeable count FALLS ... that is the correct outcome"). NOTE THE GUARD GAP: the
  four-lane gate PASSED — all four lanes were searched — because it fires before ANSWERING a data
  question, and nothing fires before ASKING the operator one. Asking him what we already hold is the
  same failure wearing a question mark, and it costs him more than a wrong answer does.
- strike: 08/11 "we have fucking graphify in this repo and swfldatagulf-ops" — framed a vendor
  email around their signup funnel; never checked the sibling ops repo (it renders the graph at
  app/graph/page.tsx off a published brain-graph.json) before talking about what we'd "get"

## shape: tool-wired-but-never-called
guard: OWED — a UserPromptSubmit classifier that detects a structural-code question ("where is X handled", "what depends on", "who calls", "what breaks if", "blast radius") and injects the literal ToolSearch + `mcp__graphify-local__query_graph` call line. Root cause is mechanical, not attitudinal: every `mcp__graphify*` tool is DEFERRED (name-only, needs a ToolSearch round-trip) while Grep/Glob/Read are pre-loaded, so the default reach is always the loaded tool. Distinct from didnt-read-what-we-hold — that shape's four-lane gate PASSES here, because a grep satisfies its CODE lane. Needs operator sign-off (fires every prompt, every session — RULE 11 + RULE 3 C2). Check open: graphify_first_reach_hook
- strike: 08/11 answered "where is session refresh handled, and what depends on it" with 6 greps/reads, one day after both graphify MCP servers were added to .mcp.json on his decree; graph held a 4th refresh root (lib/project/refresh-on-access.ts) the grep pattern never matched

## shape: stale-source-served-silently
guard: OWED — fleet-wide source-staleness tripwire; pattern exists on redfin_swfl only (ed0b2efd 07/17/2026); check open: stale_source_tripwire_fleet
- strike: 07/22 deed fetch was manual, "WHY IS THIS MANUAL"
- strike: 07/22 records request drafted-never-filed for 11 days
- strike: 08/06 crons red for weeks, nobody looked
- strike: 08/10 desk chart from May — vendor froze file, runs stayed green
- strike: 08/10 121 baked narratives, some 4 weeks stale, served as current

## shape: paid-before-free
guard: BUILT — RULE 0.7a ladder (08/06/2026) + spend switch OFF-by-default + $3 process budget + Gate 15's cousin check-no-new-paid-surface
- strike: 08/04 $14.08 in one afternoon of acceptance renders
- strike: 08/06 proposed buying a photo we hold on 99.6% of solds
- strike: 08/06 "we don't go paid on every fucking email"
- strike: 08/10 address-targeted call before reading the actor law

## shape: leaked-internals-into-output
guard: BUILT — artifact-level scaffolding guard (08/09/2026) + narrator drop logging + voice guard
- strike: 08/09 gap-instruction sentence shipped in an email body
- strike: 08/10 narrator altered the agent-written description
- strike: 08/10 "the 2 declared leftovers — stop leaving trails"

## shape: built-dark-no-consumer
guard: BUILT — dark-roots SessionStart printer (08/10/2026): print-scratchpad.mjs renderDarkRoots scans cadence_registry for consuming_pack: none and prints the dark list red every session
- strike: 07/22 lake comp feed 20205251 zero consumers
- strike: 07/22 community_profiles pipeline built, never registered/wired
- strike: 07/22 marketbeat 261 rows ingested, all dropped dark
- strike: 08/03 cre_figures consumer deferred into a YAML comment
- strike: 08/10 "how the fuck are these not wired"

## shape: distance-speak-not-person-speak
guard: BUILT — MAX_SPOKEN_DISTANCES=2 structural cap + communityHasGolf in-gate suppression at neighborhoodAmenitiesSourceLine, test-enforced (08/10/2026); humanDistance banding (08/10/2026); playbook §1.9
- strike: 08/06 "no one says a golf course .57 miles away"
- strike: 08/10 "0.57 miles" grocery — quarters and halves decree
- strike: 08/10 three mileage clauses in a row + golf-community told golf is 3/4 mi away

## shape: analysis-without-the-ask
guard: OWED — an answer to "what is going on" must END with the decision needed and the named next action, not with findings
- strike: 08/11 persistence finding — three answers (surfaces, live counts, catalog lanes), operator had to shout "SO WHAT DO WE FUCKING NEED" to get the one sentence

## shape: partial-reported-as-whole
guard: BUILT — RULE 0.8 count-and-prove (07/30/2026) + RULE 0.85 fix-don't-file (08/06/2026)
- strike: 07/30 "all four lanes on the record" — one never opened
- strike: 07/30 research "filed" with no index line
- strike: 08/09 "§2.7 written this session" — false on disk
