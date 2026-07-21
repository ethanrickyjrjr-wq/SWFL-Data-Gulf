# HANDOFF 07/21/2026 — what needs fixing

Two unrelated tracks: the **egress burner** (answered, action owed) and the **email/demo surface**
(six defects the operator hit tonight). Written by the session that ran the storage request log.

Claims are labeled per the speaking gate in `_ASSISTANT/HANDOFF-EGRESS-20260721.md`:
**(A)** = a tool printed it · **(B)** = I concluded it.

Full evidence for everything here lives in `_ASSISTANT/SCRATCHPAD.md` items 20-26.

---

## TRACK 1 — EGRESS: the burner is named. Do not run the 20-agent fan-out.

`_ASSISTANT/HANDOFF-EGRESS-20260721.md` (parallel session, uncommitted at time of writing) ends on
one open question: *"which bucket do those 30,393 requests hit, and who issues them? … That is the
first thing to run. It likely ends the investigation."* It was right. Running it ended it.

**(A) `mcp__supabase__get_logs` service `storage`.** Every request in the returned window — ~100
across ~370 seconds — carries one user-agent: `duckdb/v1.5.4(windows_amd64) node-neo-api`. Not the
website, not a GHA cron (those are linux). **`windows_amd64` is Ricky's own machine.** Traffic spans
both `lake-tier1` and `raw-tabular-cold`.

**(A) Same object, repeatedly, seconds apart** — `HEAD` then 4-5× `GET 206`.
`raw-tabular-cold/leepa/just_value/2026-06-15.csv.gz` = 5 GETs in 28 seconds.

**(A) One burst pulls multiple dated snapshots of the same dataset** — `fema/nfip_claims` for
07/15, 07/14 and 06/13; `fdot_aadt` for 07/15, 07/03 and 06/15.

**(A) Three processes alive right now**, from `Get-CimInstance Win32_Process`, all identical:
`bun tools/lake-mcp-server.mts` — PIDs 54044 (01:46), 59824 (01:49), 40916 (02:29).

**(A) Mechanism, from `tools/lake-mcp-server.mts`:** `tier1ListReader` (lines 176-189) builds each
view over an explicit list of **every inventoried file** in the dataset (assembled line 368), and
emits `read_csv_auto([...], union_by_name=true)`.

**(B) Why that bills ~300 GB/day:** cold datasets are `.csv.gz`; gzip is not seekable, so no range
read, no column pruning, no predicate pushdown. Every query downloads every snapshot in full, and
`union_by_name=true` forces reading each file's header. Nothing caches between queries. The shape
this predicts is exactly what (A) shows.

**This kills the "storage is ruled out / re-enable the lake MCP" paragraph** in the other handoff
(it is already fenced there as wrong, but the re-enable advice is still on the page — **do not
re-enable it**). Its `last_accessed_at` misread is why the lake looked innocent: that column is not
maintained on download, so the storage REQUEST LOG is the only surface that shows reads.

### ⚠️ The disable already in the tree does not disable anything
`.mcp.json` renames the key to `lake_DISABLED_EGRESS_BURN_20260721`. In Claude Code the mcpServers
KEY is only the server's name — the entry still runs `bun tools/lake-mcp-server.mts`, its tools just
reappear under a new prefix. It deters the model from calling it; it does not stop the server, and
it did not stop the three live processes. **It is also uncommitted**, which is why two days of
"fixes" left no trace in `git log` and day three restarted from zero.

Same failure as SCRATCHPAD item 12, verbatim there: *"the harness reported two background runs as
killed/stopped and the bun processes SURVIVED."* Killing the config does not kill the process.

**(B) Why three days of fixing changed nothing:** the burner is a dev tool — it runs while someone
is working, which is when the fixing happened. Plus egress is a cumulative counter that cannot go
down before the cycle resets, so no correct fix could ever have looked like it worked.

### Action owed (operator's call — one is a process kill)
1. Kill PIDs 54044 / 59824 / 40916. Nothing else stops the live burn.
2. Actually disable it — comment out or delete the entry, do NOT rename — **and commit that**.
3. Before it returns: it must not read whole `.csv.gz` snapshots per query. Convert cold CSV to
   parquet, or scope views to the latest snapshot, or cache locally. **Not designed yet.**
4. **Unresolved, do not lose:** `refinery/sources/duckdb-source.mts` is the same S3 mechanism used
   by the build pipeline (~10 packs). All observed traffic was `windows_amd64`, so if refinery
   builds run locally they burn the same way. No linux agent appeared in this window. **Not
   investigated — check before declaring the class fixed.**

---

## TRACK 2 — EMAIL + DEMO SURFACE: six defects from tonight

Screenshots and operator quotes in SCRATCHPAD items 20-25, plus a correction block that re-points
two of them. **Read the correction** — the first pass got two wrong.

**(A) Two of the five screenshots are the Lab EDIT CANVAS, not a received email.** `FooterBlock.tsx:60`
renders the `"Postal address (CAN-SPAM)"` placeholder only when `props.address || scope`;
`ButtonBlock.tsx:19` returns null for an unlabeled button when `!scope`. So a visible placeholder
means edit mode. This matters — it changes two of the six fixes below.

### 1. `/demo` — every number is a static fixture
`app/demo/page.tsx` imports four JSON fixtures. Its own line-16 comment: *"Static fixture data — swap
these imports for live fetch() calls when the Fiverr components are wired to the real API."* Never
happened. Shows "Confidence: 84% · 05/22/2026" — a frozen two-month-old token — on a public page.
Prior operator ruling (06/20/2026) was keep standalone, footer-listed, revisit later. **Decision
owed: kill, wire live, or park.**

### 2. CAN-SPAM nag renders to the recipient
`FooterBlock.tsx:77` prints *"Physical mailing address required (CAN-SPAM) — add one in Branding"*
in sent output. That is an instruction to Ricky, shown to a buyer. The nag already exists correctly
in-product at `EmailLabGridShell.tsx:1715`. Move it there and/or a send-time gate; out of rendered
HTML.

### 3. The address is empty in the first place — SCRATCHPAD item 15, product half still open
`applyBrand` has **no server-side caller** — only two React client components. Any send path not
going through the Lab canvas in a browser ships house defaults and an empty footer address, which is
what triggers #2. Fixed in the simulator only on 07/20 and explicitly flagged "NOT fixed in the
product." **This is the root of #2 and of the empty footer in #6's screenshot.**

### 4. Equation footnotes — TWO producers still live (not three; item 22 overcounted)
- `compsFootnote` (`market-comps.ts:264`) — `"*$/Sq Ft = price ÷ listed sq ft."` **still emits**
- `just-sold.ts:280-282` — both ÷ sentences, **still emits**, matches the screenshot exactly
- `priceStripFootnote` (`price-reduced.ts:277-279`) — the 07/20 fix DID work here; it now emits only
  the previous-price sentence. **That screenshot predates the fix.**
- `provenanceFootnote` (`back-on-market.ts:105`) — a SOURCE CITATION, not an equation. **Do not kill.**

Also: `lib/email/CLAUDE.md` was written 07/20 telling us to KEEP just-sold's note as "non-obvious."
The operator read it in an inbox and rejected it. **That carve-out is dead — rewrite that file and
`docs/standards/emails.md` in the same pass or it grows back.**

### 5. Market-comps ships with ONE comp — not root-caused
The chart plots the subject property and an area-median line. Zero comparable sales. Operator's
requirement: nearby sales, last 6 months. Needs the database. **Note that email was built during the
outage window** — rule out an empty result caused by the throttle before blaming the query.

### 6. Button: label won't save, and every CTA goes to the same place
- **(A)** `listing-flyer.ts:204` sets `ctaUrl: facts.sourceUrl`, handed to every lifecycle recipe's
  button via `lifecycle-chrome.ts:290`. So Coming Soon / New Listing / Price Reduced / Under
  Contract / Just Sold all point at the same listing URL regardless of what the button says. The
  screenshot shows a button reading "What's My Home Worth?" — a seller ask — linking to the listing.
- The "Button" label: **(A)** it's an edit-canvas placeholder, so the real defect is that editing
  the label doesn't persist — a save-path bug, **not** `ButtonBlock`. Reproduce live; do not
  screenshot-judge it (SCRATCHPAD item 0).

---

## CHECKS OWED — the ledger is DOWN, nothing could be opened
`node scripts/check.mjs open` returns `PGRST002` (same outage). `check.mjs list` returns empty for
the same reason, so **the session-start check list is currently blind, not clean.**

Open these the moment REST is back:
`lake_mcp_egress_burn` · `demo_page_stale_fixtures` · `email_footer_internal_copy_to_recipient` ·
`applybrand_no_server_side_caller` · `equation_footnotes_all_recipes` · `market_comps_only_one_comp` ·
`email_button_label_not_saving` · `email_cta_same_url_every_stage`

Until then SCRATCHPAD items 20-26 and this file are the only record.
