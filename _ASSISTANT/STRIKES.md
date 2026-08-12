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
guard: BUILT 08/11/2026, WIDENED 08/12/2026 — `lib/testing/mock-restore-ratchet.test.ts`, a shrink-only ratchet in the plain `bun test` run: any test file calling `mock.module()` on ANY specifier — in-repo OR vendor — without an `afterAll` restore fails CI unless it is on the frozen 45-file whitelist; fixed/deleted files must come OFF the list. It shipped covering `@/` and relative specifiers only, and that hole let a `next/navigation` leak cost 6 red runs on 08/12 (strike below); the widening to any specifier added ZERO whitelist entries, measured, so the narrow scope had never been buying anything. Check test_mock_leak_restore_lint closed 08/11. The 45 whitelisted offenders still owe the per-file snapshot-restore sweep — but no NEW leaker can land, and the list can only shrink.
- strike: 07/?? "kill a global test-mock leak" (73952249)
- strike: 08/?? export-route tier mock hijacked segments/preview — 5 red runs
- strike: 08/11 segments mock reached usage.test.ts 110 files later — 12 red runs
- strike: 08/11 agent-build route.test.ts default-docs mock → frozen-occurrence red 11+ CI runs, green locally (Linux vs Windows file order); leaker fixed with snapshot-restore + guard built (this line)
- strike: 08/11 nightly-chain.yml `listings:` job deleted, its trailing `secrets: inherit` left orphaned (cb803b1c) → GitHub rejects the file, 2 runs with ZERO jobs. PyYAML parses it fine (glues the orphan onto `guard:`), so a local yaml check is green while the real gate is red. SAME MECHANISM, NEW SURFACE: the BUILT guard above only covers test-mock leaks; nothing validates workflow YAML against the real parser. Guard owed: actionlint over changed `.github/workflows/*.yml` in the existing pre-push gate.
- strike: 08/12 `app/contacts/page.test.tsx` (20a87820) did `mock.module("next/navigation", () => ({ redirect }))` — a factory REPLACES a module, so `notFound`/`useRouter`/`usePathname` stopped existing for every file that ran after it; 5 files died on `SyntaxError: Export named 'notFound' not found`, 6+ red CI runs. THE GUARD ABOVE WAS WATCHING AND MISSED IT: its regex read `["'](@\/|\.{1,2}\/)`, in-repo specifiers only, while the leak mechanism is identical for a vendor module. GUARD WIDENED SAME SESSION to `mock\.module\(\s*["']` (any specifier) — measured cost: ZERO new whitelist entries, because all 22 vendor-mocking files were already listed for an in-repo mock too. The narrow regex was never buying anything.

## shape: pushed-then-never-checked-the-run
guard: OWED — nothing tells a session its OWN push went red. The pre-push gate is thorough about what happens BEFORE the push (17 gates) and silent about what happens after, so a session's last act is `safe-push` and it never learns the result. Candidate mechanism: a Stop-hook / SessionStart line that resolves the latest CI run for `origin/main` and prints it red when it failed — the same treatment dark roots and strikes already get. Cheap, no new infrastructure (`gh run list --workflow=CI --limit 1`).
- strike: 08/12 CI's `build` job red on 6 consecutive runs, 15:58→17:14, across three concurrent sessions pushing all afternoon. Nobody looked. It took the operator saying "actually fucking look" for anyone to open the log — and the log named both causes in under two minutes (`collier-official-records-swfl` unrouted; the next/navigation mock leak). Not a hard diagnosis; an unread one. Note the asymmetry this shape lives in: SESSION_LOG, scratchpad, lockfile, vocab, secrets, ingest guards, pack tests, doc index and capture freshness all BLOCK a push, and the actual verdict on the push blocks nothing.

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
- strike: 08/11 quoted "listing_dom 54.2% floored, Collier 14.0%" off a 07/20 plan as a live constraint and built a product caution on it; live probe same day: 7.5% floored, Collier 93.6%. The backfill had landed weeks earlier. A doc's own "live probe" stamp is evidence of a measurement, never of the CURRENT value — re-measure before a number gates a decision

## shape: paid-before-free
guard: BUILT — RULE 0.7a ladder (08/06/2026) + spend switch OFF-by-default + $3 process budget + Gate 15's cousin check-no-new-paid-surface
- strike: 08/04 $14.08 in one afternoon of acceptance renders
- strike: 08/06 proposed buying a photo we hold on 99.6% of solds
- strike: 08/06 "we don't go paid on every fucking email"
- strike: 08/10 address-targeted call before reading the actor law
- strike: 08/12 reached for the already-authenticated Apify property gap-fill lane to run "research
  agent" crawl4ai+Reddit work never approved for it — guard covers new paid surfaces and the spend
  switch, not an existing authenticated surface used for an out-of-scope purpose. Account hit its
  monthly hard cap mid-run. Guard gap named in `docs/handoff/2026-08-12-apify-spend-incident-and-research-handoff.md`.

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

## shape: muzzled-ai-reasoning-refused-by-default
guard: OWED — the ban is on INVENTING/COMPUTING a number, never on REASONING over numbers we hold. A session that answers "why can't the AI just think about our data" by citing determinism as a principle has committed this. Deterministic-only is a per-surface COST choice and must be named as one.
- strike: 08/11 "Our AI is stupid... we could have ai telling an agent what their listing should do based on price and comps and time of year and everything we have data on"
- strike: 08/11 (same day) I wrote "the numbers are computed in code and the sentences are deterministic — that's the mechanism that makes it credible", quoting a v1 cost non-goal back to him as a law. Operator: "Have I not been saying this for 4 months????"

## shape: partial-reported-as-whole
guard: BUILT — RULE 0.8 count-and-prove (07/30/2026) + RULE 0.85 fix-don't-file (08/06/2026)
- strike: 07/30 "all four lanes on the record" — one never opened
- strike: 07/30 research "filed" with no index line
- strike: 08/09 "§2.7 written this session" — false on disk

## shape: narrated-a-cause-i-never-measured
guard: OWED — an actor, a duration, or a causal chain stated in an answer must come from a command in the transcript, exactly as RULE 0.8 §4 requires of completion claims. "A parallel session did X" and "N seconds later" are measurements, not connective tissue. If the actor was not identified, the sentence is "something pushed it and I have not identified what."
- strike: 08/12 (same session, 2nd) `list_repositories` came back empty and I told him picking the GitLab provider "appears to have re-scoped the workspace off the GitHub connection," then built a reconnect recommendation on it. The empty list was real and measured; the cause was not. It resolved on its own — the GitHub repo was listed again minutes later with a build already indexing. Transient state during reconnect, not a detach. The measured half was fine; the causal half should have been "the list is empty and I do not know why yet."
- strike: 08/12 told him a parallel session's push carried my commit "about thirty seconds" after committing. Never identified any actor; never measured the gap. Real gap from `git reflog show origin/main`: 11 seconds (commit 09:52:52, push 09:53:03). Quoted 09:48:16 and 09:52:52 in the same answer, which are 4m36s apart — the operator caught that "thirty seconds" reconciled with nothing. He had pushed 68a31d42 himself at 09:49:11 before opening the session, so the story also fingered him for something he did not do.

## shape: architecture-drift-no-detector
guard: OWED — nothing anywhere compares our DECLARED module boundaries (docs/section-map.md's 5 sections, the 8 area CLAUDE.md files) against how the code is ACTUALLY wired. The graph has held the answer since 06/2026 and no report reads it. Mechanism owed: a declared-vs-detected partition diff (purity / NMI) regenerated on every graph rebuild, so "we build different ways" becomes a number that moves instead of a thing he notices months later. Research: _RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md
- strike: 08/11 "I still find out we build different ways or have different ways of building so don't tell me we are doing all we can" — asking for compartments in graphify
