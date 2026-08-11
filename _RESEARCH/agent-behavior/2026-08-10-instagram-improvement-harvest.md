# Instagram + GitHub improvement harvest — first run (08/10/2026)

Operator decree: *"build an Instagram apify that finds skills to make us better at not sucking,
following rules, better UI, better at real estate knowledge, better at building autonomous
emails... make a few runs on what GitHub's or programs we can use. Spend less than 3 dollars."*

**Spend, vendor-billed (Apify `/v2/actor-runs`, summed): $0.49 across 10 runs.** Cap was $3.

## THE LANE THAT WORKS — and the one that doesn't (paid lesson, cheap this time)

- `apify/instagram-scraper` (the 358k-user flagship) **search lane is JUNK for hashtags**: 5 runs
  with `search:"#tag", searchType:"hashtag"` all returned one garbage Cyrillic hashtag entity or
  `no_items` — $0.01 total, but zero posts. Do not drive hashtag harvests through `search`.
- `apify/instagram-hashtag-scraper` (`reGe1ST3OBgYZSsZJ`, $0.0023/result BRONZE) **works
  first try**: `{hashtags:[...], resultsType:"posts", resultsLimit:N}` → 186 real posts with
  captions/likes/mentions in two runs. Saved as account task **`instagram-improvement-harvest`**
  (7 hashtags × 30 posts ≈ $0.48/run). Raw distill: scratchpad `ig_distill.json` (session-local);
  re-run the task for fresh bytes.

## WHAT INSTAGRAM ACTUALLY YIELDED (honest read: MODEST signal)

Tool mentions across 195 posts: Claude Code 18, ChatGPT 12, Figma 10, Cursor 6, Gemini 3,
Mailchimp 2, Bolt 2, Klaviyo 1, Lovable 1, Copilot 1. Takeaways worth acting on:
- **Prompt injection is the #1 agent attack** (top #claudecode post, @riccardo_belli_contarini):
  "60.8% of the time [the model] does what a WEB PAGE orders, not you." Relevant to every lane
  where our narrator reads scraped listing text — our verbatim-only description policy is the
  right guard; never soften it.
- **Real-estate content leverage** (@thekeysandcontent, #realtortips): "you don't need 5 content
  ideas, you need 1 listing" — turn one listing into a week of posts. This IS our email assembly
  line thesis; the social half (2 social keys in the registry) is the untapped mirror.
- **Amplifiles.ai** (#realestatemarketing): AI listing-video effects (house-drop, furniture
  reveal) — the class of competitor polishing listing media; worth a look for what sells.
- **UI posts** were portfolio pieces, not techniques — Instagram is the wrong lane for UI
  engineering; the design-skill repos below are the right one.

## THE GITHUB/PROGRAMS HARVEST (rag-web-browser, 2 runs — the strong lane)

Repo mention counts from crawled aggregator pages (travisvn/awesome-claude-skills,
ComposioHQ/awesome-claude-skills, awesome-skills.com, github.com/topics/claude-code-skills):
- **anthropics/skills** (54 mentions) — Anthropic's official skills repo. First stop.
- **alirezarezvani/claude-skills** (32) — curated production skill collection.
- **obra/superpowers** (19) — WE ALREADY RUN THIS. Validation, not news.
- **zilliztech/claude-context** (4) — semantic code search as MCP; candidate vs our graphify.
- **steipete/agent-rules** (4) — rule-following discipline patterns for agents (operator axis #1).
- **NeoLabHQ/context-engineering-kit** (4) — context discipline patterns.
- **dominikmartn/nothing-design-skill** (4) — opinionated UI design skill (axis: better UI).
- **AgriciDaniel/claude-seo** / **claude-ads** (4 each) — SEO/ads skills; marketing adjacents.
- **yusufkaraaslan/Skill_Seekers** (6), **mhattingpete/claude-skills-marketplace** (6),
  **michalparkola/tapestry-skills-for-claude-code** (4) — skill discovery/marketplaces.
- Directory hubs: **github.com/topics/claude-code-skills**, **awesome-skills.com**,
  **travisvn/awesome-claude-skills**, **ComposioHQ/awesome-claude-skills**.
- Real-estate-specific skills: **NONE found** in the ecosystem — our domain playbooks stay
  homegrown (docs/standards/* is the moat, nothing to import).

## ADDENDUM 08/10/2026 — steipete/agent-rules TRIALED (operator: "start with steipete")

Shallow-cloned (48 files) and read the four most-generic rules in full. **Verdict: DO NOT ADOPT
the repo — ONE kernel stolen.** Roughly half is Swift/macOS content (dead weight for a
Next.js/Python shop). The generic half is 2025-era prompt-command versions of machinery we
already run in hook-enforced (stronger) form: `five.mdc` (five-whys) ⊂ our `second-order` agent +
`superpowers:systematic-debugging`; `check.mdc` = prompt-suggested pre-push checks vs our
hook-ENFORCED gates ("a rule only in a doc is not a rule"); `context-prime.mdc` = what SessionStart
hooks already do mechanically; `commit.mdc`/`pr-review.mdc` redundant with RULE 1 + ecc reviewers.

**The keeper — `continuous-improvement.mdc`'s graduation trigger** ("code reviews repeatedly
mention the same feedback → create a rule"). Our loop captured lessons but never said WHEN a
repeat graduates into a mechanism — the gap behind "same surface fixed five times in a row" and
900+ open checks. **Adopted as RULE 2 §0b (CLAUDE.md): THIRD occurrence of the same gripe = build
the hook/lint/test that session; a third scratchpad entry is banned as the response.**

anthropics/skills remains the next repo to trial (operator's pick pending).

## NEXT (unspent budget headroom ~$2.50)

1. Operator picks any repos above to trial → vet ONE at a time against RULE 0.6 (no harness
   sprawl); steipete/agent-rules + anthropics/skills are the highest-fit for "following rules."
2. Re-run task `instagram-improvement-harvest` monthly (manual, ~$0.48) — not cron; no paid
   search in scheduled ingest (locked rule).
3. If Instagram stays low-signal after run 2, cut the hashtag list to #claudecode+#realtortips
   or kill the lane and keep the GitHub sweep only.
