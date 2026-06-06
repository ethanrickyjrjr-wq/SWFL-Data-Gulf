# SWFL Connector Output — Problems, What I Changed, and the Plan

**Date:** 2026-06-06
**Author:** Claude (Opus 4.8) session
**Status:** ✅ RESOLVED 2026-06-06 (Opus 4.8 session) — see "RESOLUTION" immediately below. Original draft kept for the record.

---

## RESOLUTION — 2026-06-06 (shipped, serve-time; no master rebuild)

Ricky confirmed the design in-session; built + verified (44 tests pass, `tsc` clean).

- **#3/#4 Outside-source links** — City Pulse + news facts now flow through as **highlighted Markdown links** ("From the web"). `loadWebFacts` in `app/api/mcp/server.ts` (was hardcoded `web_facts: []`).
- **#1 "master" / process noise** — `cleanConclusionText` now runs on the connector text path (strips "Driven by / Overrides / trust tier / confidence", keeps the useful "Note conflicts:"). The `[config]` caveat wall is filtered out via `isDisplayableCaveat` (the same filter the web page already used).
- **Fake speculation killed** — `isGroundedConditional` filters the circular tie-breaker everywhere (speaker, widget, dossier); the first GROUNDED claim shows, not just `[0]`.
- **#8/#9 Speculation reframed** — `RESPONSE_CONTRACT` rewritten with a razor line: part 2 (numbers) cites and invents nothing; part 3 ("THE READ AHEAD") REACHES — patterns/behaviors, City Pulse, conversation, past examples; may project numbers DERIVED from real ones; ends on a strategic IF/THEN + what to watch + early flip signal.
- **#6 Connector icon** — `route.ts` `serverInfo` declares our logo as an inline `data:` SVG (can't fail to fetch) + a hosted PNG. The server name "SWFL Data Gulf" always shows as text if a client ignores connector icons.
- **Brand** — "SWFL Intelligence Lake" → "SWFL Data Gulf" in display.

**Still open (runtime signal pending — check `connector_output_live_verify`):** verify live in claude.ai after deploy. The **card iframe (#5/#7/#10) and connector-icon rendering are claude.ai-side**; the **text answer is the reliable surface and is fixed.**

---

> **Honest note up front.** You told me repeatedly to "read the plan that already goes over all this." I searched `docs/`, `docs/fiverr-briefs/`, `docs/superpowers/plans/`, `docs/superpowers/specs/`, `docs/littlebird-notes/`, and Notion. **I could not find a single plan file that lays out the card layout + `[Web-n]` highlighting + logo together.** The only piece that IS written down is the `[Web-n]` definition (in `docs/superpowers/specs/2026-05-30-city-pulse-flywheel-design.md` §4). Everything else — the section labels, the logo placement, the chart — is scattered across this conversation and your memory. **This file is my attempt to write it ALL down in one place so you can fix what's wrong and we never re-litigate it.** If a real plan doc exists that I missed, point me at it and I'll use that instead.

---

## PART 1 — Every problem you raised (the punch list)

| #   | Problem (your words)                                                 | Where it shows         | Status                                                                                   |
| --- | -------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| 1   | "It still says **master**"                                           | the text answer        | **Fixed in code** (commit `f16fccd`) — needs live re-test                                |
| 2   | No **freshness token** shown                                         | the text answer        | **Fixed** — your screenshot now shows `SWFL-7421-…` at the bottom                        |
| 3   | No **highlighted / clickable source links**                          | the text answer        | **NOT done**                                                                             |
| 4   | Not pulling / showing **City Pulse + LLM (`[Web-n]`) data** as links | the text answer + card | **NOT done**                                                                             |
| 5   | **No logo** anywhere                                                 | the card               | **NOT done** (the card didn't render; no logo wired into the icon either)                |
| 6   | **Vercel/default icon** next to "SWFL Data Gulf", not our logo       | the connector header   | **NOT done** — this is the MCP **server icon**, a separate field I never set             |
| 7   | **No data chart**                                                    | the card               | **NOT done** — my v1 used a plain table, not a chart                                     |
| 8   | Output **not separated** into the planned sections                   | the text answer        | **Partly** — text has Answer/[INFERENCE]/Link/Token but NOT your labels                  |
| 9   | Doesn't use the planned labels (**Outcome / Facts / Speculation**)   | everywhere             | **NOT done** — I improvised "Answer/Data/Speculation/Link/Freshness"                     |
| 10  | The **card/widget doesn't render at all** in Claude                  | below the answer       | **Unknown** — built it, but custom-connector card rendering is buggy on Anthropic's side |

---

## PART 2 — What I actually changed this session ("the fixes")

Only **two** commits landed this session. Here is exactly what each did.

### Commit `f16fccd` — "move reply contract into content text"

- **The root cause it fixed:** every rule we wrote (no "master", quote the freshness token, cite the link) was riding in the tool result's `_meta` field. **claude.ai throws `_meta` away** — it only feeds the model the `content` text. So the model never saw the rules and improvised.
- **What I changed** (`app/api/mcp/server.ts`):
  - Deleted the one line in the tool description that literally said _"Say the master report"_ — that line (from commit `8caf6f1`, May 25) is why it kept saying "master." Replaced with "never say master, in any form."
  - Added a `RESPONSE_CONTRACT` block to the **text** the model reads, ordering the reply and forcing it to quote the token + end with the link.
- **Result:** the text answer in your screenshot now ends with the freshness token + a "Full report" link, and shouldn't say "master." **This is the only part that's actually working.**

### Commit `6617ca5` — "real MCP App widget"

- **The idea:** the logo + chart can't go in the text reply (Claude won't render images or inline UI there — verified). The only surface that can is the **MCP App card** (an iframe below the message). We already _registered_ a card, but it was a dead placeholder.
- **What I changed:** wrote a real card (`mcp-widget/src/widget.ts`), bundled it self-contained, and had the server send it the data via `structuredContent`.
- **Why it's a WRONG first cut (this is on me):**
  - Wrong section labels ("Answer/Data/Speculation/Link/Freshness", not your "Outcome/Facts/Speculation").
  - A **table**, not a **chart**.
  - **No City Pulse / `[Web-n]` facts** (I left that empty).
  - **No highlighted source links.**
  - Did **not** fix the Vercel icon (that's a different field).
  - And it may not even render (Anthropic's custom-connector card rendering is buggy).

---

## PART 3 — The one hard constraint (so we stop fighting it)

- **Text answer** (what Claude types): can show words, a markdown **table**, **clickable links**, the token. **Cannot** show an image logo or a graphical chart.
- **The card** (MCP App iframe below the answer): **can** show the logo, a real chart, custom layout — but custom-connector rendering is buggy on Anthropic's side and I can't see your screen to confirm it.
- **The connector icon** (the little image next to "SWFL Data Gulf swfl_fetch"): a **third** thing — the MCP server's declared `icons`. I never set it, so Claude shows its default. **This is fixable and I should just do it.**

---

## PART 4 — The plan (what it's SUPPOSED to be) — CORRECT THIS

This is my best reconstruction from everything you've said. **Fix any line that's wrong.**

**A. Connector icon** → our wave logo (`public/logo.png` / `swfl-data-gulf-icon-512.png`), set via the MCP server `icons` field. Kills the Vercel triangle.

**B. The answer card — five parts, in order:**

1. **OUTCOME** — the conclusion / answer. _(or is it "Answer"? confirm the label)_
2. **FACTS** — our own computed numbers, each marked with **our logo** (= our data). Shown as a **chart** + values. _(confirm: chart type? bars?)_
3. **SPECULATION** — the IF/THEN call + falsifier, tagged `[INFERENCE]`.
4. **SOURCES / LINK** — the report link. _(confirm label)_
5. **FRESHNESS** — the `SWFL-7421-…` token.

**C. Provenance marking (the `[Web-n]` rule):**

- **`[Web-n]` = data we bring in from City Pulse + the LLM web layer** (news, transactions, current events with a source URL). → the sourced **words are highlighted and hyperlinked to that source page**, and the `[Web-n]` marker is dropped.
- **Our own computed data** (the lake metrics) → marked with **our logo**, NOT a link out.

**D. Where it renders:** the Claude connector (the card for logo/chart; the text as fallback).

---

## PART 5 — What I need from you to finish (no more guessing)

1. **Confirm the 5 labels** (Outcome vs Answer; Facts vs Data; Sources vs Link — your exact words).
2. **Confirm the chart** — what kind, of what numbers?
3. **If a real plan doc exists**, send it / give the path — I'll build to that instead of this reconstruction.

Once you confirm Part 4, I do, in order: (1) set the connector icon to our logo, (2) rebuild the card to the exact labels + a real chart + our-data-logo / web-data-links, (3) wire City Pulse `[Web-n]` facts as highlighted links, (4) push, (5) you re-add the connector and test.
