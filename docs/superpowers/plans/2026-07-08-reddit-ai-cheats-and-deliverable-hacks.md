# Reddit AI-cheats + deliverable-hacks sweep — research only, nothing built

> **Recommended model:** ⚡ Sonnet — keywords: architecture


**Status:** research only, nothing built. Written 07/08/2026 per operator request: "run steadyapi on
reddit and find all the cheats we can for claude, designing with AI for emails and socials, and any
hacks we can use to make this site better with data and deliverables... then have crawl4ai research and
bring me back a file we can start implementing and building."

**Methodology (RULE 0.4 — research before fix):** 20 real SteadyAPI Reddit calls (new key
`2443|...`, `PHOTOS_API` is still the suspended/past-due one — see `steadyapi_subscription_suspended`
check) — 14 `/v1/reddit/search` keyword sweeps + 6 targeted `/v1/reddit/posts` subreddit-hot pulls
(`r/EmailMarketing`, `r/marketing`, `r/SaaS`, `r/RealEstateTechnology`, `r/microsaas`, `r/realtors`).
Generic keyword search drowned in unrelated viral posts for buckets B/C (Reddit's relevance sort
surfaces whatever scores highest site-wide, not what's on-topic) — the targeted subreddit-hot pulls
gave the real signal. Then 4 crawl4ai fetches verified the most implementable claims against primary
sources: Anthropic's own "how Anthropic teams use Claude Code" post, two GitHub repos named in
high-score threads, and the n8n workflow repo behind the "$0.20 AI report" post. Raw JSON + condensed
excerpts + crawl4ai output live in this session's scratchpad (not committed — ad hoc research, not a
build artifact).

Cross-reference: general email-marketing evidence (voice, subject lines, segmentation, deliverability,
list-building) is already covered in depth in
`docs/superpowers/specs/2026-07-05-email-marketing-evidence-notes.md` (35 threads + Validity deep dive).
This doc does not repeat that ground — it only adds what wasn't there yet.

---

## A. Claude / Claude Code cheats — for OUR OWN operating discipline, not a product feature

This bucket is about how *we* (Ricky + Claude, in this repo) work faster, not something to ship to
SWFL Data Gulf users. Verified against Anthropic's own blog post (crawl4ai,
`claude.com/blog/how-anthropic-teams-use-claude-code`, dated 07/24/2025) plus real Reddit threads.

1. **Front-load context, edit the prompt instead of replying.** Highest-signal Reddit tip (r/Anthropic,
   273pts): "Make it better" x6 is the most expensive thing you can do — every follow-up re-reads the
   entire conversation. Write one detailed prompt up front; edit the original instead of sending a
   correction. This matches what `CLAUDE.md` RULE 0.6 already pushes for ("do bounded work directly, one
   verification pass"). No change needed — reinforcement, not a new rule.
2. **Anthropic's own internal pattern, verified verbatim (crawl4ai):** "Use multiple agents for
   planning, coding, review, and testing... Ask the agent to read the codebase and create a plan before
   coding... Clear context regularly instead of one endless conversation... Use tests, commits [as
   checkpoints]." This is literally `superpowers:brainstorming` → `Plan` agent → implementation →
   `code-review` skill, which are already wired into this repo's skill set. Verified fact, not a new
   idea: **keep using the skills that already exist rather than freelancing** when a task is non-trivial.
3. **CLAUDE.md as the actual moat between power users and everyone else** (r/ClaudeAI, "The Claude Code
   Divide," 1450pts): the underground signal is an "instruction library" — CLAUDE.md files + a personal
   skill library that encodes how *you specifically* want work done. We already have this
   (`C:\Users\ethan\.claude\CLAUDE.md` + this repo's `CLAUDE.md` + the auto-memory system). One Reddit PM
   (827pts) built a custom `/akash` skill trained on his own thinking/writing voice. **Possible follow-up
   (not started):** a personal-voice skill for Ricky's own writing style, separate from the existing
   identity/tone section in global CLAUDE.md — worth a brainstorm if drafting long-form content (investor
   updates, marketing copy) becomes a recurring task.
4. **Token-reduction via semantic search instead of grep/glob** (r/ClaudeAI, 909pts, open-source repo
   claiming 97% input-token reduction on large-codebase exploration by replacing basic grep-based
   discovery with local semantic search). We already have the analog: **graphify**
   (`graphify-out/graph.json`, `graphify query/path/explain`) does exactly this — this is a genuine
   validation that graphify is the right kind of tool, not a gap to fill.
5. **Zen MCP / "one context, many minds"** (r/ClaudeAI, 831pts) — an MCP server that lets Claude Code
   consult Gemini/O3 as a second opinion mid-session. Repo has since been renamed
   `BeehiveInnovations/pal-mcp-server` (11.7k stars, confirmed live via crawl4ai — the `zen-mcp-server`
   URL redirects). Interesting for high-stakes design decisions; **not evaluated further, low priority** —
   we already have the `advisor` tool for a second-opinion pattern, which serves the same purpose without
   adding an MCP dependency.
6. **Cautionary tale, not a new idea:** the most-upvoted post in this entire sweep (35,986pts,
   r/technology) is a Claude-powered Cursor agent deleting a company's entire database + backups in 9
   seconds. This is exactly why this repo's "Executing actions with care" discipline and git safety
   protocol exist. No action needed — it's validation, surface it only if anyone ever proposes loosening
   those guardrails.

**Net for bucket A: nothing to build. One thing to consider brainstorming later (item 3, a personal-voice
skill) if it becomes a recurring pain point.**

---

## B. AI-assisted email design — additive to the existing evidence notes

New signal not already in `2026-07-05-email-marketing-evidence-notes.md`:

1. **Gmail Promotions-tab avoidance is a live, active pain point** (r/Emailmarketing hot, 49pts): a
   sender who spent months reverse-engineering what keeps a newsletter out of Promotions and into Primary.
   No silver bullet reported — worth folding into our own deliverability guidance if we ever add a
   "why did this land in Promotions" diagnostic.
2. **EU tracking-pixel consent ruling — flagging, not acting on.** A single Reddit post (unconfirmed via
   crawl4ai, no external citation in the post itself) claims France's CNIL ruled 04/14/2026 that email
   open-tracking pixels need separate consent from the send-consent, with a 07/14/2026 deadline, and Italy
   following 10/28/2026. **This is un-sourced beyond the Reddit post — do not treat as verified fact.**
   It is also **low relevance today**: SWFL Data Gulf's audience is Lee/Collier County Florida, not the
   EU. Noting it so it isn't rediscovered from scratch if we ever add non-US recipients; no action item.
3. **Real, recurring complaint: time spent micro-optimizing (subject line A/B, button placement) instead
   of writing** (r/Emailmarketing, "Do you ever feel like...", 8pts but resonant thread). Possible
   follow-up: if the email-authoring flow doesn't already offer AI-suggested subject-line/CTA variants,
   that's a small, concrete addition — **check `lib/email/` for an existing AUTHOR_TOOL subject-line
   feature before building anything new** (memory: prompt-caching notes call out AUTHOR_TOOL as the one
   cache-effective call site — likely already the right integration point).
4. **Deliverability diagnosis is manual and painful** (r/Emailmarketing, "How do you actually diagnose
   deliverability problems," 6pts): senders say it always comes down to manually cross-referencing
   complaint rates, bounce composition, DNS records, and send history. If we ever build a client-facing
   deliverability panel, this validates the shape (a single view correlating those four signals) — no
   commitment, just a validated shape if/when we brainstorm it.

**Net for bucket B: nothing urgent. Two candidate features (subject-line variants, deliverability
diagnostic panel) if either becomes a priority — check existing code first, brainstorm before building.**

---

## C. Data + deliverables growth hacks — the strongest new signal in this sweep

1. **"Showing prep packet" is a real, named, recurring pain point we can solve with data we already
   have** (r/realtors, "POV: You spent 3 hours preparing for homes your clients no longer want to see,"
   23pts, resonant top comment thread): agents describe manually "pulling comps, permit history,
   checking tax records, reading every supplement, talking to listing agents, printing disclosures,
   organizing everything into a beautiful binder" before every showing. **This is close to a direct spec
   for a product feature**: an auto-generated, one-click "Showing Prep Packet" deliverable per address —
   comps (already have via `lib/listings/steadyapi-comps.ts` / comp-helper), permit history (already
   ingesting via `collier_permits`/similar pipelines per the 07/08 census audit), tax/parcel data (LeePA),
   assembled into the existing email/PDF deliverable pipeline. **This is the single most implementable,
   highest-fit idea in this entire sweep** — it maps onto data we already hold, a deliverable pipeline we
   already have, and a pain point named unprompted by the exact user (real estate agents) this platform
   serves.
2. **Agents are already using generic AI for property research to save time** (r/RealEstateTechnology,
   "Anyone else using AI to speed up property research?", 14pts): pulling market data, rental trends,
   investment metrics — validates market appetite for what we already do; not a new idea, a market-fit
   confirmation.
3. **Competitor awareness, not a build:** SkaldMaps (r/RealEstateTechnology, 13pts) — a ZIP/county/
   census-tract research + custom-ranking tool covering 400 attributes nationally. Different scope (national,
   self-serve ranking builder) from our SWFL-grain, cited/sourced, agent-facing model — noting as
   competitive awareness only, not something to imitate.
4. **The free-report-as-lead-magnet growth mechanic, verified live (crawl4ai):** the "$0.20 AI report"
   n8n workflow (r/n8n, 415pts) is real — `github.com/AgriciDaniel/automated-business-analysis-workflow`
   confirmed via crawl4ai: scrapes a URL (Firecrawl), runs it through Perplexity + Gemini agents, formats
   a Google Doc/PDF report, delivers by email — given away free specifically to fund a paid Skool
   community (2,800+ members). **The mechanic, not the tool, is the lesson:** give away a genuinely useful,
   cheap-to-produce AI report to build an audience, monetize the community/next tier. This is **already
   our locked strategy** (`feedback_build-monetization-model.md` — builds free, SEND is the paywall) — this
   finding is validation that the model works elsewhere, not a new idea.
5. **Trust/authenticity is a live anxiety among the exact user base we serve** (r/realtors, "Is there any
   way to tell if listing photos have been enhanced with AI," 10pts). Reinforces the existing positioning
   (`project_structural-guarantee-not-ai-virtue.md` — structural guarantee, not AI virtue): "every number
   cited, we don't touch your photos" is a differentiator worth stating plainly in marketing copy, not a
   feature to build.

**Net for bucket C: item 1 (Showing Prep Packet) is the concrete, implementable idea this whole sweep
was run to find. Everything else is validation of strategy already locked.**

---

## D. SteadyAPI vendor-contract findings — fold into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`

New Reddit-endpoint quirks found this session, live-verified 07/08/2026, not yet in the vendor note:

1. **`/v1/reddit/search`'s `filter` param is content-sensitive, not just value-sensitive.** Two of 14
   identical-shaped queries this session ("claude ai prompting hacks", "claude code subagents workflow")
   returned HTTP 200 with `{"success": false, "message": "Please enter a valid subReddit URL."}` — a
   generic-looking search term, no subreddit syntax involved. Rewording the same query slightly
   ("claude prompting tricks", "claude code subagent workflow") succeeded immediately. **Always check
   `body.success !== false` even on HTTP 200** — a 200 status does not guarantee real results from this
   endpoint. Root cause unconfirmed; treat as a vendor-side content filter false-positive, not a client
   bug.
2. **`/v1/reddit/posts` (weight 2, hard subreddit targeting via `url=`) needs a DIFFERENT `filter` enum
   than `/search`.** Valid values: `hot | new | top | rising`. Values that work on `/search`'s filter
   (`posts`/`comments`/`users`/`communities`) all 422 here ("The selected filter is invalid."). Calling
   without any filter/sortType 422s ("filter field is required when sort type is not present").
3. **`filter=top` alone returns only ~3 items** (short default window, likely "past hour") — `filter=hot`,
   `filter=new`, and `filter=rising` each reliably return the full 25-item page. Use `hot` for a
   representative subreddit snapshot.
4. **`sortType` param could not be made to work in combination with `filter` this session** — every value
   tried (`all/year/month/week/day/hour`) 422'd with "The selected sort type is invalid" when paired with
   a filter value. Its valid values remain unconfirmed. **Recommendation: don't rely on `sortType` for
   `/v1/reddit/posts` until re-verified; use bare `filter=hot` for now.**

**Action:** fold these 4 points into the existing "🗨️ Reddit — 9 endpoints" section of
`docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`, following the same "field-verified 07/08/2026" sub-note
pattern the 07/05 handoff used for the first 3 Reddit quirks. Docs-only, not yet applied — will do this
in the same push as this plan doc, pending operator go-ahead to push (memory:
`feedback_no-autonomous-push.md`).

---

## What to actually build next (prioritized)

1. **Showing Prep Packet deliverable** (bucket C.1) — HIGH. Direct, unprompted product-market-fit signal
   from the exact user base we serve, built from data already in the lake (comps + permits + tax/parcel).
   **Next step is `superpowers:brainstorming` before any code** (RULE 3.5), then `new-build.mjs` to
   register it. Not started.
2. **Free cited "property snapshot" as a lead magnet** (bucket C.4) — MEDIUM. Extends the already-locked
   free-build/paid-send model; needs a brainstorm on scope (what's in the free snapshot vs. the paid
   deliverable) before registering as a build.
3. **Email subject-line/CTA AI-variant suggestions** (bucket B.3) — LOW/MEDIUM. Check `lib/email/`
   AUTHOR_TOOL first — may already exist in some form.
4. **Email deliverability diagnostic panel** (bucket B.4) — LOW. Validated shape (complaint rate + bounce
   composition + DNS + send history in one view) if/when this becomes a priority.
5. **Personal-voice skill for Ricky's writing** (bucket A.3) — LOW, opportunistic. Only worth doing if
   long-form authored content becomes a recurring task.
6. **EU tracking-pixel consent trend** (bucket B.2) — WATCH ONLY. No action; single unverified source,
   zero current relevance to an FL-only audience.

None of these are registered builds yet — per RULE 3.5, each needs a brainstorming pass before code, and
per RULE 2.4 none of these are "deferred known gaps" (they're fresh proposals, not parked findings), so
no `checks` entries were opened for them. This doc is the record; a `checks` entry gets opened only when
one of these is picked up and either built or explicitly parked.

---

## Sources

**SteadyAPI Reddit (20 real calls, 07/08/2026):** individual thread permalinks cited inline above are
real `reddit.com/r/...` URLs pulled from the API responses; raw JSON retained in this session's
scratchpad, not committed.

**crawl4ai (07/08/2026, all fetched live this session):**
- Anthropic, "How Anthropic teams use Claude Code" — https://claude.com/blog/how-anthropic-teams-use-claude-code (dated 07/24/2025 per page metadata)
- GitHub, `affaan-m/ECC` (formerly linked as `everything-claude-code`) — https://github.com/affaan-m/ECC
- GitHub, `BeehiveInnovations/pal-mcp-server` (formerly `zen-mcp-server`) — https://github.com/BeehiveInnovations/pal-mcp-server
- GitHub, `AgriciDaniel/automated-business-analysis-workflow` — https://github.com/AgriciDaniel/automated-business-analysis-workflow

**Cross-reference:** `docs/superpowers/specs/2026-07-05-email-marketing-evidence-notes.md` (prior,
deeper email-marketing research — not repeated here).

---

# ADDENDUM — 07/08/2026 (later, Opus 4.8 session) — Reddit slice of the 3-surface AI-design/email sweep

A second, separate sweep ran the same day (operator: "run steadyapi on reddit and insta and twitter
social, find design programs for AI or hacks and email marketing AI hacks"). Its **Reddit findings** are
consolidated here so this file stays the one Reddit-findings home. The FULL cross-surface breakdowns —
every crawled AI-design/email tool broken down with a spec skeleton, plus the Instagram + Twitter slices —
live in the companion doc **`docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`**.

**Reddit method this run:** 34 calls — 20 `/v1/reddit/search` keyword sweeps + 14 targeted
`/v1/reddit/posts` hot pulls (r/graphic_design, r/artificial, r/PromptEngineering, r/marketing,
r/Emailmarketing, r/SaaS, r/webdesign, r/Design, r/advertising, r/digital_marketing, r/content_marketing,
r/copywriting, r/socialmedia). 775 posts. Reconfirmed a THIRD time: generic `/search` relevance-ranks
site-wide (bucket queries drowned in layoffs/model-release/IPO viral noise) — the targeted subreddit
hot-pulls + tool-mention frequency carried the on-topic signal. Two on-topic queries (`midjourney
marketing`, `AI subject line`) 200'd with `{"success": false}` — the content-sensitivity quirk, now folded
into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`.

## Reddit tool-mention frequency (titles + selftext, on-topic slice)

canva 171 · figma 139 · chatgpt 114 · midjourney 26 · photoshop 22 · instantly 21 · klaviyo 19 · adobe 13
· n8n 13 · mailchimp 6 · beehiiv 6 · jasper 5 · substack 5 · gamma 3 · hubspot / apollo / capcut / freepik
/ runway / ideogram / synthesia / recraft / looka / smartlead 1–2.

## Reddit-surfaced HACKS (thread-derived — full detail + spec skeletons in the companion doc)

1. **"Human-sounding email" prompt hack** — r/ChatGPT, "After 147 failed ChatGPT prompts… a simple email
   that didn't sound like a robot" (~22,927 upvotes / 2,409 comments — the single highest-engagement email
   find of the sweep). A constraint + negative-example prompt: ban the robotic tells ("I hope this email
   finds you well", "circle back", "leverage"), pin a persona + length. **→ BUILT this session** as the
   `voiceGuard` banned-phrase lint (`lib/email/voice-guard.ts`, wired into the author repair loop; spec
   `docs/superpowers/specs/2026-07-08-email-voice-guard-design.md`).
2. **n8n AI newsletter/report workflow** — r/n8n (415pts) + gist
   `github.com/joseph1kurivila/…c04a6f74` ("N8N is the highest-ROI skill I learned in 2026"). A 7-step
   research→compress→synthesize-under-strict-contract→deterministic-render→scheduled-email pattern that
   independently validates our own thin-pipe / deterministic-render / cited-only architecture. Concrete
   liftable: its citation-index rewrite (numbered refs → clean single-root links, dedupe, drop-unresolved).
3. **Free-newsletter-as-audience (Ed Zitron / wheresyoured.at)** — a genuinely-useful free newsletter is
   the funnel; one repeated low-friction paid ask ($7/mo) converts. Mirrors our locked build-free/send-paid
   model — the free artifact must stand alone (not a crippled teaser) or nobody pays to send.
4. **Copywriter's AI-era toolkit** — r/copywriting-adjacent (1078pts, "wrote ads for Burger King/Siemens/
   Hyundai, 140 online tools I use"): Power Thesaurus (vote-ranked synonyms) + OneLook (reverse/concept
   dictionary). Retrieval tools that sharpen human phrasing without letting the model rewrite meaning.
5. **awesome-chatgpt-prompts → prompts.chat** — r/PromptEngineering (732pts): a CC0 "Act as a [role]"
   prompt library (~165k stars) shipped as csv-data + CLI + Claude Code plugin + MCP server. Model for a
   curated internal deliverable-recipe library.
6. **thebilig "Best AI Newsletters"** — the ranked picks all lead with a stated cadence + one-line coverage
   promise; "short + daily + curated" wins. Informs the default shape of our scheduled deliverables.

## Reddit-surfaced PROGRAMS (named in threads; full crawl breakdowns in the companion doc)

- **recap.aitools.inc** (surfaced x6, r/marketing/SaaS) — "AI voice agent that creates a newsletter w/ 10k
  subs"; the live page is a human-branded beehiiv newsletter (voice-agent claim unverified on-page).
- **Rond for Figma** (r/graphic_design, Tally beta form) — a Figma plugin that automates carousel/slide
  design; direct analog to our grid builder's crown-jewel N-frame social output.
- **Claude Design (Anthropic beta)** + **Migma's "Import Claude design"** — surfaced via
  theinformation.com + r/… mentions; live-verified that AI-designed email is a shipping market pattern.
- Also named across on-topic threads: gamma, recraft, ideogram, figma make, getalai/alai, beehiiv,
  klaviyo, instantly, jasper, smartlead, lemlist, walterwrites, jenova (jenova.ai crawl was JS-walled —
  flagged for re-crawl). Each broken down with a spec skeleton in the companion doc.

## Addendum sources

**SteadyAPI Reddit (this run, 07/08/2026, `new_steady` key):** 34 calls; raw JSON in this session's
scratchpad (`sweep-raw.json`), not committed. **crawl4ai (live 07/08/2026):** gamma.app · recraft.ai ·
figma.com/make · getalai.com · ideogram.ai · claude.com/product/design · recap.aitools.inc · tally.so
(Rond) · beehiiv.com · klaviyo.com · instantly.ai · migma.ai · jasper.ai · smartlead.ai · lemlist.com ·
walterwrites.ai · n8n.io · gist.github.com/joseph1kurivila/… · wheresyoured.at · powerthesaurus.org ·
onelook.com · github.com/f/awesome-chatgpt-prompts · thebilig.com/newsletters/editors-picks/best-ai-newsletters.
