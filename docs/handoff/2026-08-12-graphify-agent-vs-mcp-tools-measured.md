# Handoff — graphify: the CHAT AGENT and the MCP TOOLS are different instruments, measured

**Date:** 08/12/2026 (Opus 5). **Repo:** brain-platform, `main`.
**Companion:** `docs/handoff/2026-08-12-graphify-hosted-reindex-and-trust-boundary.md` (same day, the
hosted-reindex probe + dashboard-narrative findings). **Prior:**
`docs/handoff/2026-08-12-graph-compartments-step2-negative-result.md`,
`_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md`.

Every number below came from a command run in-session. Nothing is inferred from vendor marketing.

---

## 0. Headline

**The graph index is exact when it answers and silent when it fails — it never over-reports. The
vendor's CHAT AGENT is a separate, worse instrument that states complete-sounding negatives over a
partial slice.** Grep was 4 for 4 on the same symbols and has still never missed.

Standing rule: **use the graph to find WHAT TO LOOK AT, never to conclude something is not there.
Then grep.**

---

## 1. The measurement — 4 symbols, 3 instruments

Each symbol checked with a tree-wide grep (worktree copies excluded), then `gx_callers` against the
hosted index (`ethanrickyjrjr-wq/SWFL-Data-Gulf`), then compared to what the chat agent had said.

    symbol                  grep   gx_callers   chat agent   verdict on the INDEX
    normalize_result_row      4        4            1         exact
    is_swfl_relevant          2        2          0, then 1   exact
    reportToEmailHtml         6        0            —         FALSE NEGATIVE
    OPS_TARGET (const)        1        0        (right, inferred)  FALSE NEGATIVE

Detail:

- **`normalize_result_row`** (`ingest/pipelines/swfl_search_demand/providers.py:69`) — index returned
  4 of 4, `truncated:false`: the production caller `parse_search_volume_response()` at
  `providers.py:97`, call site L113, confidence 1; plus three tests at L85/L96/L107, confidence 0.8.
- **`is_swfl_relevant`** (`ingest/pipelines/news_swfl/normalizer.py:22`) — index returned 2 of 2, both
  confidence 1: `normalize()` at `normalizer.py:42` (call site L57) and **`_extract_candidates()` at
  `fetcher.py:80` (call site L108) — a CROSS-FILE edge.** This kills the earlier guess that
  distance-between-files is the weak axis; it is not.
- **`reportToEmailHtml`** — `gx_callers` with `strict_calls:false` returns `n:0, truncated:false`
  while the tree carries six call sites in `lib/email/activation/render.test.ts` (L64, 69, 76, 84,
  110, 127). First measured 08/11/2026 and recorded in `.claude/hooks/check-four-searches.mjs`;
  **reproduced live 08/12/2026 at build `998f2531` / commit `2410f795`. Not stale.**
- **`OPS_TARGET`** (`scripts/graphify-publish.mjs:26`) — `gx_node` returns empty `callers` AND
  `callees`, only a `contains` edge from the file, while `writeFileSync(OPS_TARGET, ...)` sits at
  L193 of the same file. Module-level const; no call edge produced.

**The two failures are not one failure.** `OPS_TARGET` is a node-class gap (path/config constants).
`reportToEmailHtml` is a function with real call sites returning zero. Different causes, same
symptom, and neither is a freshness artifact — see §3.

---

## 2. The chat agent is a different instrument. Do not grade them together.

Asked the same symbols, the agent said "no callers" for `is_swfl_relevant` in one reply and "one
caller" in the next, against index truth of 2. It named one of `normalize_result_row`'s four,
dropping the production caller.

**It does not fabricate.** Every symbol, file and path it produced was real and correctly located —
`normalize_result_row` at `providers.py:69`, `ingest_redfin_city()` called by `main()`, and the
correct observation that `redfin_city_swfl` has no normalizer function at all (verified: its
transforms are `_row_from_cells`, `_coerce`, `_area_slug`, `dedupe_city_rows`).

**It overclaims.** It writes "no other caller appears" / "there are no callers" — sentences that read
as findings — over a retrieved slice, with the hedge buried in "within the retrieved context."

**Its positives are usable. Its negatives are worthless.** Never accept "nothing calls this,"
"nothing links these," or "no other consumer" from the chat.

Corrected in-session: an earlier claim in this session that the agent was "slot-filling the nearest
thing shaped like a normalizer" was WRONG and unverified. Checking the two pipeline directories
showed it had named the correct symbols. The failure is caller enumeration, not symbol lookup.

---

## 3. Freshness is ruled out as the explanation

- `scripts/graphify-publish.mjs` pushed blob `f9b851d5`, 8,341 bytes — **byte-identical** to the
  working tree (`git hash-object`). The extractor read L193 and produced no edge.
- The `reportToEmailHtml` zero reproduces at today's build, not an old one.
- The hosted index reindexed **twice during this session**: `2e0f6087` at ~11:53, then `2410f795`.
  Cadence is not ours and is not visible. Diff `commitSha` against `git log` before trusting.

---

## 4. Why the gate is shaped the way it is (already built — do not redesign)

`graphFirstGap` in `.claude/hooks/check-four-searches.mjs` landed 08/11/2026 in `3770c8a3`
("make graph-first an enforced requirement, not a doc line"), off the operator's
"ARE WE USING GRAPHIFY ON EVERY SESSSION OR NOT????????". Before it, RULE 0.5 said graph-first and
`laneFor` credited traversals — but the code lane was an OR, so a plain grep satisfied it equally.
**Crediting is not requiring.**

Two deliberate limits, both now independently justified by §1:

1. **Fires only on STRUCTURAL turns** (who calls / what reads / what breaks / is this dead), never on
   value lookups. RULE 11: a gate that fires on ordinary prose gets ignored on the turn that matters.
2. **Requires an ATTEMPT, never a non-empty result.** `reportToEmailHtml` is exactly why — a gate
   demanding results would wedge the session on the tool's own false negative.

The LIVE-lane fix (`d47be5d9`, 08/12/2026) is separate: reading the INSTALLED vendor surface counts
as LIVE; using that tool to search OUR tree is CODE.

---

## 5. The category error worth not repeating

`_RESEARCH/agent-behavior/2026-08-11-graphify-community-structure-crawl4ai-research.md` PART 4 says
it plainly: the standing critique of code graphs targets them as a **retrieval** mechanism (a grep
replacement). That is not what we want them for. The operator's ask is the graph as an
**architecture instrument** — compartments, over-routing, orphans, drift.

Most of this session was spent asking retrieval questions of an architecture instrument and then
grading it on retrieval. For finding a symbol or counting call sites, grep wins and is instant. The
graph earns its keep on the questions grep structurally cannot answer.

**Already paid for and never switched on:** graphify's memory half (`save-result` / `reflect` →
`LESSONS.md`), flagged in that same research.

---

## 6. Reproduce

```
grep -rn "<symbol>" --include=*.py --include=*.ts . | grep -v worktrees
```

Then the same symbol through the tools (deferred — load in ONE round-trip):

```
ToolSearch("select:mcp__graphify__gx_callers,mcp__graphify__gx_node,mcp__graphify__graph_stats")
```

`gx_callers(repository_id='ethanrickyjrjr-wq/SWFL-Data-Gulf', symbol='<symbol>', strict_calls=true)`

---

## 7. OWED — not done, nothing here is approved

1. **`docs/standards/graph-compartments.md` §6b still overclaims.** As written it generalizes the
   `OPS_TARGET` const gap into "the index undercounts edges," which §1 disproves for functions. The
   correction table in §1 above belongs in that file. **BLOCKED THIS SESSION:** the file was claimed
   by another active session at edit time and was not overridden. Check opened:
   `graph_compartments_6b_correction`.
2. **Root `CLAUDE.md` RULE 0.5** — the companion handoff's owed item 1 wants it amended to say the
   hosted index "returns exact resolved call edges." **That sentence must not ship alone.** §1 shows
   two false negatives out of four; the amendment and the never-trust-a-negative caveat land
   together or the rule gets more wrong than it is now.
3. **`.claude/worktrees/wf_*` — five full tree copies on disk right now** (`-101`, `-104`, `-76`,
   `-78`, `-84`), a different set than the three the companion handoff recorded, so whatever creates
   them is still running. Gitignored, so ripgrep-based `Grep` and the hosted index are clean, but a
   raw `grep -r` in a shell walks all five — one such command blew a 120-second timeout this session.
   **Not touched — needs an operator decision on whether they are safe to remove.**
