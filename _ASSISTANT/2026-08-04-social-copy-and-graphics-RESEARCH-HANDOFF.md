# HANDOFF (for Sonnet) — how to actually WRITE on social, and how to make posts people CLICK

**Status: RESEARCH TASK. No code. 08/04/2026.**
Operator decree, verbatim: *"WRITE A HANDOFF TO SONNET TO FIND HOW TO ACTUALLY WRITE ON SOCIAL
MEDIA AND HOW TO MAKE BETTER LOOKING POSTS AND CLICK GENERATING GRAPHICS."*

**You are researching, not building.** The output is a filed research doc + an indexed line + a
§0-style rules card the next social build reads BEFORE it types a word of copy. Same shape as
`docs/standards/emails.md` §0 "BEFORE YOU CODE A RECIPE" — go read that first to see what "done"
looks like.

---

## 1. WHY THIS EXISTS — we can now BUILD a post and still not know what to PUT IN IT

As of 08/03/2026 the mechanics are solved and proven live: render branded cards, composite an
auto-advancing carousel, publish to Bluesky, verify it. That is `lib/social/CLAUDE.md` §0.

**What is NOT solved: whether anything we post is any good.** The copy on the live post
(`New on the market — 2601 SW 37th Ter, Cape Coral. 3 bd · 2 ba · 1,983 sqft · Built 1992.
$385,000.`) was written from instinct alone. No hook research, no length target, no CTA theory, no
evidence that a spec dump is what makes a person tap. Email has a whole §0 card of per-type numbers
behind it. Social has **zero**.

Prior art already paid for and never finished — see §3. Read it before you crawl anything.

---

## 2. THE THREE QUESTIONS. Answer all three, separately.

### Q1 — HOW TO WRITE THE POST (copy)
- Hook construction: what makes the first line stop a scroll. Per-platform — a Bluesky
  300-grapheme post, a LinkedIn post, and an Instagram caption are not the same instrument.
- **Length, with real numbers per platform and per post type.** Email's §0 has this (50–125 words
  body, triggered > newsletter, drip halves after msg 2). Social has nothing. Get the equivalent.
- CTA: one or none? Link-in-post vs link-in-reply — a real, measurable question, since some
  platforms suppress reach on posts carrying outbound links. **Verify, don't assume.**
- Reading level, sentence length, emoji, hashtags (largely dead on some platforms, load-bearing on
  others — get the current answer, not the 2021 one).
- What NOT to do: the tells that make a post read as automated/AI. We publish as a real business.

### Q2 — WHAT MAKES A POST LOOK GOOD (graphics)
- Composition for a feed card viewed at ~390–430pt on glass. We already derived a 32px type floor
  at 1080 reference width (`lib/social/design/system.ts`) — **that floor is marked `[INFERENCE]`
  with an explicit falsifier written into the file. Try to falsify or confirm it.**
- Safe zones per platform/format — we have `lib/social/safe-zones.ts`; check it against current
  vendor specs, it may have drifted.
- Photo-plus-text cards specifically: scrim/overlay treatment, where text goes, how much text a
  card carries before it stops being glanceable.
- Carousel/slideshow pacing: how long a slide should hold. We chose **2.5s with 0.5s crossfades by
  taste, with no evidence.** Find the real answer.

### Q3 — WHAT MAKES PEOPLE CLICK (the one that pays)
- Which formats drive outbound CLICKS vs. which drive impressions. Not the same thing; we care
  about the first.
- Thumbnail / first-frame theory — the first slide is the whole ad.
- Whether a price, an address, or a question in the graphic changes click behavior.
- **Real-estate-specific if you can find it**, but do not force it — a general finding with a named
  source beats a real-estate blog with none.

---

## 3. READ OUR OWN RESEARCH FIRST — RULE 0.4, AND IT IS THE STEP THAT GETS SKIPPED

`_RESEARCH/` is **GITIGNORED**, so **Grep will NOT find it and a silent Grep is NOT evidence it is
absent.** Open by path with Read, or `rg --no-ignore`. Start at `_RESEARCH/INDEX.md`.

Known-relevant, already paid for:
- `_RESEARCH/email-and-social/` — the whole category, incl.
  `2026-08-03-email-length-and-per-type-benchmarks.md` (the email numbers; the social equivalent is
  exactly what is missing).
- `docs/handoff/2026-07-11-socials-design-elevation-brief.md` — **already carries a cited Buffer
  finding that carousels are the highest-engagement Instagram post type**, and calls for a
  repeatable slide shell. Queued since 07/11/2026; the 08/03 carousel is its first real instance.
  Do not re-derive what is already in here.
- `docs/handoff/2026-07-11-socials-round2-direction.md` — the still-queued items.
- `_RESEARCH/voice-and-positioning/` — our voice is already decided in here. Copy research must not
  contradict it. Note `lib/email/voice-guard.ts` is the enforcing root; the personal `ricky-voice`
  skill is a DIFFERENT, unrelated thing — never apply it to product copy.
- `lib/social-pulse/` — **we already track how posts perform** (mediaType 1 image / 2 video /
  8 carousel; `digest.ts` buckets by format). If real observed data is in there, **OUR OWN NUMBERS
  OUTRANK ANY BLOG.** Check it before citing an outside source.

Only when it is genuinely not there: **crawl4ai. NEVER Firecrawl.** `crawl4ai <url>`.

---

## 4. RULES THAT BIND THIS TASK

- **Every finding names a source with a URL and an as-of date (MM/DD/YYYY).** A number with no
  named source is the one hard block. Sources disagree → report "X verified, Y needs review". Never
  average them.
- **Platform claims drift and confident stale facts are everywhere.** Reach-suppression-on-links,
  hashtag value, and optimal length are the three most repeated stale claims on the internet.
  Prefer a vendor's own current docs, or a study with a stated method and date, over a listicle.
- **Cite the DATE of every study.** A 2022 engagement benchmark is not evidence about 2026.
- **Scope to platforms we can actually publish to.** The `Platform` union in `channels/index.ts` is
  the gate — 5 publishable, 8 displayable. Bluesky is the one proven end-to-end. Do not write a
  TikTok strategy we cannot execute.
- **Rule 11 applies:** we are not a brand with a content team. A recommendation requiring daily
  human copywriting is not usable. Bias toward what a generator can do repeatably.

---

## 5. WHAT "DONE" LOOKS LIKE — 4 parts, and report n of N

1. **The research doc** at `_RESEARCH/email-and-social/2026-08-04-social-copy-and-graphics.md` —
   the three questions answered, every claim sourced + dated.
2. **Its line added to `_RESEARCH/INDEX.md` in the SAME pass.** Unindexed research does not exist.
   This is the step skipped repeatedly (scratchpad 0ae) — do not skip it.
3. **A §0-style rules card** the next social build hits before writing copy. Numbers, not prose.
   Put it where a builder will actually land: a new `## §0.4 — WRITING THE POST` inside
   `lib/social/CLAUDE.md` §0 (already auto-loads on any `lib/social/` edit), or a
   `docs/standards/social.md` added to the root reference index if it outgrows that.
4. **A SESSION_LOG entry** with the evidence, so the next session inherits findings, not guesses.

**Report 4 of 4, or say which part is missing and why (RULE 0.8).** Partial is fine. Partial
reported as whole is the defect.

---

## 6. WHAT NOT TO DO

- Do not re-litigate the carousel MECHANICS. Solved, proven live, written down in
  `lib/social/CLAUDE.md` §0. You are working on what goes IN the post, not how it ships.
- Do not touch `lib/social/listing-carousel.ts`, `listing-card-render.ts`, or
  `channels/bluesky.ts`. Research task.
- Do not propose a new rendering engine, a new design system, or a second palette.
  `design/system.ts` and `lib/brand/tokens.ts` are the roots and they are correct.
- Do not answer from memory. That is how this session shipped a 2×2 grid and called it a carousel.

## 7. LEDGER
- Live proof the mechanics work: https://bsky.app/profile/swfldatagulf.com/post/3msa2byjyuz23
- The failure that produced §0 (grid, left up for comparison):
  https://bsky.app/profile/swfldatagulf.com/post/3ms7pytoefj23
- Open checks: `social_carousel_autoplay_signed_in`, `social_post_now_multi_image`,
  `social_render_engine_off_system`.
