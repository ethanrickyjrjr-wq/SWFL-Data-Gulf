# AI design programs + email-marketing AI hacks — 3-surface social sweep, crawled & broken down

> **Recommended model:** ⚡ Sonnet for any follow-up build. **Status:** RESEARCH ONLY — nothing built,
> nothing registered as a build, nothing pushed beyond this doc. Written 07/08/2026 per operator request:
> "run steadyapi on reddit and insta and twitter social, find design programs for AI or hacks and email
> marketing AI hacks, then send out crawl4ai on what is returned and break each one down so another
> claude can spec."

## Methodology (RULE 0.4 — research before build)

**Social sweep (SteadyAPI, all 3 surfaces, live 07/08/2026):**
- Key: the **`new_steady`** token in `.env.local` (the `PHOTOS_API` env/gh-secret is the *suspended* one —
  see the `steadyapi_subscription_suspended` check; every call on it 403s).
- **Reddit** — 34 calls (20 `/v1/reddit/search` keyword sweeps + 14 targeted `/v1/reddit/posts` hot pulls),
  775 posts. As on 07/05 and the earlier 07/08 run, generic `/search` relevance-ranks **site-wide**, so
  bucket queries drowned in viral noise (layoffs, Gemma 4, SpaceX). Real signal came from the targeted
  subreddit hot-pulls + tool-mention frequency + IG captions.
- **Instagram** — 17 `/v1/instagram/search` token queries, 336 posts. Confirmed IG needs **single tokens**
  (hashtag-style); multi-word phrases return `{"success": false}`. No external URLs in captions (link-in-bio),
  so IG is signal/engagement, not crawl fodder.
- **Twitter** — 12 terms × (Top, Latest). See vendor quirk below — `/v1/twitter/search` returns only an
  entity object, no tweet bodies; it surfaced 51 relevant accounts but no crawlable content.

**Tool-mention frequency (Reddit titles/selftext + IG captions, on-topic):** canva 171 · figma 139 ·
chatgpt 114 · midjourney 26 · photoshop 22 · instantly 21 · klaviyo 19 · adobe 13 · n8n 13 · mailchimp 6 ·
beehiiv 6 · jasper 5 · substack 5 · gamma 3 · hubspot/apollo/capcut/freepik/runway/ideogram/synthesia/
recraft/looka/smartlead 1–2.

**crawl4ai pass (RULE 0.4, live 07/08/2026):** ~24 distinct finds were crawled for primary-source detail
via 5 parallel research subagents (raw markdown stayed in their contexts; only distilled breakdowns kept —
proportion per RULE 0.6, this exceeded one context). Two finds were JS-walled and flagged for re-crawl
(Jenova, the authenticated `claude.ai/design` app entry — its capabilities were captured from the public
`claude.com/product/design` page instead).

**Cross-reference:** the earlier 07/08 Reddit-only sweep
(`2026-07-08-reddit-ai-cheats-and-deliverable-hacks.md`) and the 07/05 email-marketing evidence notes
(`2026-07-05-email-marketing-evidence-notes.md`) cover Claude-Code discipline + email deliverability/voice
ground; this doc does not repeat them — it adds the AI-design-program + AI-email-tool landscape.

---

## Strategic thread worth surfacing first

**"AI-designed email" is now a shipping, named market pattern — and Anthropic is in it.**
Two independent, live-verified facts from this sweep:
1. **Claude Design** is a real, live Anthropic **beta** product (verbatim: *"an Anthropic beta product that
   lets users collaborate with Claude to create on-brand visual work like designs, decks, and prototypes"*)
   whose named work types include **marketing collateral (landing pages, social assets, campaign visuals)**,
   with a design-system import + self-check-against-brand loop and connectors (Canva, Gamma, Adobe) that
   explicitly name shipping an **email campaign**.
2. **Migma** (a direct prompt-to-email builder competitor) already advertises **"Import Claude design"** as
   a first-class input path.

The load-bearing pattern for us is not "add an image model." It's **design-system-locked, on-brand output
with a pre-render brand check** (Claude Design, Jasper Brand IQ, Klaviyo Voice-and-tone all ship this) —
which is exactly the guarantee our grid/EmailDoc builder needs so every agent's deliverable stays on *their*
brand. That's the highest-leverage design finding in the sweep.

---

## Spec-priority ranking (for the next Claude to pick up — each needs its own brainstorm per RULE 3.5)

**Tier 1 — highest fit, smallest slice, maps onto surfaces we already own:**
1. **`voiceGuard` banned-phrase lint on email commentary** (Hack #1) — the 22.9k-upvote "sounds like a
   robot" pain, solved by a static banned-phrase array + post-gen lint mirroring `facts-only-lint`. No model
   change. Directly upgrades the New-Listing-pill commentary path.
2. **Per-agent Brand Voice / Voice-&-tone profile** (Jasper, Klaviyo, Lemlist all ship it) — a persisted
   `brandVoice` string injected into the AUTHOR_TOOL prompt so every build sounds like the agent. 3 presets
   before any custom-training UI.
3. **Subject-line variant chips** (Smartlead AI Subject Line Generator) — extend AUTHOR_TOOL to emit
   `subjectVariants: string[]` grounded in a cited data point, rendered as chips in the grid builder.
4. **Ideogram text-legible flyer graphic** (best-fit design tool) — `generateFlyerGraphic({headline, price,
   style, brandKit})` behind the existing spend guard, tagged as an AI asset (never a cited number). Legible
   text-in-image is the one thing generic models fail and a flyer needs.

**Tier 2 — strong fit, larger slice or needs a design decision:**
5. **Citation-index rewrite post-processor** (n8n workflow contract) — port "rewrite numbered refs → clean
   single-root citations, dedupe, drop-unresolved" into `lib/citations/`; enforces no-invented-source at render.
6. **Recurring "cadence + coverage-promise" deliverable template** (Beehiiv + thebilig editorial signals) —
   a scheduled SWFL recap that states its frequency + scope on the label; re-runs `build-doc` against the
   fresh master freshness_token before each send.
7. **Brand-kit pre-render check** (Claude Design / Jasper Brand IQ pattern) — a deterministic lint that flags
   off-palette colors/fonts in a composed EmailDoc before `gateNarrative`.
8. **Skeleton "Remix" gallery / start-from-template picker** (Migma remix library) — expose existing
   positioned skeletons as one-click clones pre-wired to a master-brain source.

**Tier 3 — reference / opportunistic / prereq:**
9. **`{{zip_market_snapshot}}` dynamic personalization token** (Lemlist Liquid Syntax) — cited, mergeable
   lake facts into commentary.
10. **`humanizePass` cadence rewrite** (Walter Writes) — phrasing-only, gated so it can't touch a number
    (guardrail conflict: their tool injects "minor errors" — we must not).
11. **Editable deck export (PPTX/HTML)** (Claude Design editable-handoff principle) — export decks editable,
    not flattened, so agents finish the draft elsewhere.
12. **Inline synonym popover** (Power Thesaurus / OneLook) — retrieval-only copy sharpening; suggests, never
    rewrites.
13. **Curated versioned prompt-recipe file** (awesome-chatgpt-prompts / prompts.chat csv-as-data) — wire the
    quick-start campaign buttons to a canonical recipe schema.
14. **Carousel deliverable type** (Rond for Figma) — ordered grid frames at platform carousel specs, AI
    writes only commentary.
15. **Free-build repeated soft-ask** (Ed Zitron model) — one low-friction "send for real" line on the free
    build preview; measure build→send-intent before any harder gate.
16. **Jenova re-crawl** — JS-walled; needs a headless render before it can be assessed. Not a build.

---

## New SteadyAPI vendor-contract findings (live-verified 07/08/2026) — pending fold into `docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md`

1. **Twitter `/v1/twitter/search` returns an ENTITY object, not tweets.** Body shape is
   `{ users, topics, events, lists }` regardless of a `type` param (`Top`/`Latest`/`tweets`/`People`/`Media`
   all yield the same entity object). It surfaces relevant *accounts* (51 this sweep) but zero tweet text/URLs.
   To get actual tweet content: resolve an account via `/v1/twitter/user` → numeric `user_id`, then
   `/v1/twitter/user/tweets`. The vendor note's "search users, tweets, topics" wording overstates what
   `/search` returns — it does not return tweet bodies.
2. **Instagram `/v1/instagram/search` is token-only for concept discovery.** Single hashtag-style tokens
   (`aimarketing`, `emaildesign`, `canva`) return 24 posts; multi-word phrases (`email marketing AI`) return
   HTTP 200 with `{"success": false}` and an empty body. Same "check `body.success !== false` even on 200"
   rule as Reddit. A few valid-looking tokens (`midjourney`, `designhacks`, `coldemail`) also returned
   empty — token-sensitivity, not a client bug.
3. **Reddit `/search` content-sensitivity reconfirmed** — 2 more on-topic queries this sweep
   (`midjourney marketing`, `AI subject line`) 200'd with `{"success": false, "message": "Please enter a
   valid subReddit URL."}` despite no subreddit syntax. Reword-and-retry works. (Already noted 07/08; this is
   a third independent reproduction.)

---

## Sources

**SteadyAPI (63 real calls, 07/08/2026, `new_steady` key):** raw JSON dumped to this session's scratchpad
(`sweep-raw.json`, not committed — `*crawl4ai*`-adjacent research artifact). Reddit thread permalinks + IG
post permalinks + Twitter account handles are real values pulled from the responses.

**crawl4ai (all live 07/08/2026):** gamma.app · recraft.ai · figma.com/make · getalai.com · ideogram.ai ·
claude.com/product/design · recap.aitools.inc · tally.so/r/ZjGgLV (Rond for Figma) · beehiiv.com ·
klaviyo.com · instantly.ai · migma.ai · jasper.ai · smartlead.ai · lemlist.com · walterwrites.ai · n8n.io ·
gist.github.com/joseph1kurivila/… · wheresyoured.at · powerthesaurus.org · onelook.com ·
github.com/f/awesome-chatgpt-prompts (→ prompts.chat) · thebilig.com/newsletters/editors-picks/best-ai-newsletters.
**Crawl-blocked (flagged for re-crawl):** jenova.ai (JS SPA) · claude.ai/design (authenticated app entry).

---

# Full breakdowns (one spec-ready block per distinct find)

<!-- BATCHES_BELOW -->

## Batch 2 — AI design: Anthropic vendor surface + newsletter/carousel automation

### Claude Design (Anthropic) — AI design app inside Claude: prompt → on-brand decks, prototypes, one-pagers, marketing collateral
- **Category:** AI design program (+ workflow — drives Claude Code handoff)
- **URL:** https://claude.com/product/design (product page) · app at https://claude.ai/design · **Crawl:** OK
- **VENDOR VERIFICATION (CLAUDE.md rule 1):** Live page CONFIRMS an Anthropic AI *design* product named **"Claude Design."** Verbatim from the page FAQ: *"Claude Design is an Anthropic beta product that lets users collaborate with Claude to create on-brand visual work like designs, decks, and prototypes. It's early, and we're shipping improvements often."* Tagline: *"Your idea, designed with Claude."* Real, live, beta — verified in-session, not memory.
- **What it does:**
  - Describe a prototype/deck/one-pager in chat; Claude builds a first draft you refine, or hand off to your tools / Claude Code. "You're the designer, from start to finish."
  - Six named work types: interactive Prototypes; Wireframes/mockups; Design explorations ("a dozen directions in minutes"); Pitch decks (export to PPTX); **Marketing collateral (landing pages, social assets, campaign visuals)**; Documents (resume/one-pager → PDF).
  - Builds in *your* design system: import components from a GitHub repo, design files, or local codebase; Claude checks output against your design system and self-corrects before you see it. Admin can lock one approved system org-wide.
  - Fine-grained editing: comment on any element, inline text edit, adjustment sliders for spacing/color, drag/resize/align.
- **Key features:** Import from codebase, web capture, or DOCX/PPTX/XLSX. Export to PPTX, PDF, or HTML; org-scoped share link; hand off to Claude Code via `/design-sync` and `/design`. Connectors (send work out): Adobe (Express / Experience Manager / Journey Optimizer), Base44, Canva, Gamma, Lovable, Miro, Replit, Vercel, Wix. The Adobe quote explicitly names turning a Claude Design idea into "a personalized, on-brand website or **email campaign** ready to deliver to customers."
- **Pricing/model:** Beta, included in **Claude Pro ($17/mo annual, $20 monthly), Max (from $100/mo), Team, Enterprise**. Off by default on Enterprise (admin-enabled). Shares usage limits with chat, Cowork, Claude Code. No separate design SKU.
- **Fit for SWFL Data Gulf deliverable builder:** Closest large-vendor analog to the money surface — prompt-to-on-brand-visual with a locked design system and export to PDF/PPTX/email connectors is exactly the deliverable-builder loop. The load-bearing lesson is the **design-system import + self-check-against-brand** pattern: Claude Design guarantees on-brand output by ingesting the user's real components and correcting before render, mapping directly onto the grid/EmailDoc builder's need to keep every deliverable on a client's brand. Its Adobe/Gamma "draft → done in one editable handoff" framing is the integration bar to match.
- **Spec skeleton (for a follow-up Claude):** Surface = `lib/deliverable` + the grid builder. First slice: a "brand kit" object (logo, palette, type, footer/CAN-SPAM block) that a build validates against before `gateNarrative`, mirroring Claude Design's pre-render brand check — a deterministic lint flagging off-palette colors/fonts in a composed EmailDoc, not an AI pass. Second slice (integration, not clone): a one-click "Open in Claude Design"/`/design` export of a built deliverable as HTML so a user can restyle, since Anthropic already ships the connector surface.

### The Recap AI (recap.aitools.inc) — daily AI-news email newsletter on beehiiv (NOT a design tool)
- **Category:** distribution/newsletter reference (surfaced under an "AI voice agent that creates a newsletter" claim)
- **URL:** https://recap.aitools.inc · **Crawl:** OK
- **What it does:**
  - Daily AI-news newsletter — "Need-to-know AI news, minus the fluff — served bite-size, every day." Human-branded (David Roberts), published on beehiiv.
  - Standard beehiiv publication: dated-issue archive, Subscribe/Login, RSS feed, social links.
  - The surfaced "AI voice agent that creates a newsletter with 10k subs" claim is NOT on the live page — treat the voice-agent framing as an unverified community claim, not a page fact.
- **Pricing/model:** Not stated (free subscribe; beehiiv-powered).
- **Fit for SWFL Data Gulf:** Low as a tool to integrate, but a strong reference for the *output* side: proof of the "one automated recurring email → audience" motion the scheduled-deliverable/SEND paywall targets. Validates the capture → distill → scheduled email pipeline the platform already runs via crawl4ai capture + Sonnet distill.
- **Spec skeleton:** No build; reference only. If pursued: a recurring "SWFL market recap" deliverable template in the scheduled-deliverable registry, populated from master's dossier + Pulse distill, behind the SEND paywall. Smallest slice: a cadence-registry entry for a recurring "SWFL Recap" EmailDoc pulling the freshest master brain summary — no new engine.

### Rond for Figma (Tally beta signup) — Figma plugin that automates carousel/slide design
- **Category:** AI design program (Figma plugin; captured via beta-access form)
- **URL:** https://tally.so/r/ZjGgLV · **Crawl:** OK (form content only)
- **What it does:**
  - Beta-access signup for a Figma plugin named **"Rond for Figma"** — "60 seconds. Get your plugin link by email. Beta testers get lifetime free access."
  - Aimed at carousel/slide creators: form asks carousel frequency, time-from-scratch (up to "More than 2 hours"), and "biggest pain when creating carousels today" — it automates carousel design to kill from-scratch time.
  - Founder: Lucas Mattos; link within 24h.
- **Key features:** Target audiences — "Social Media Expert, Designer, Content Creator/solopreneur." Value prop: time-compression on multi-slide carousel layout inside Figma.
- **Pricing/model:** Beta = lifetime free for testers; no general pricing.
- **Fit for SWFL Data Gulf:** Direct conceptual analog to the crown-jewel grid builder — a carousel is an N-slide social deliverable, exactly what the email/social grid produces. The pain it monetizes ("2+ hours designing a carousel from scratch") is the same wedge, for a real-estate data audience. SWFL's differentiator: slides filled with *cited lake data*, not generic content.
- **Spec skeleton:** Surface = grid builder + `lib/email/social/platforms.ts`. First slice: a "carousel" deliverable type = ordered array of grid frames sized to a platform's carousel spec (e.g., IG 1080×1350), each frame a coded block from master's dossier, AI writing only commentary (per the New-Listing-pill pattern). Smallest slice: define one carousel platform preset (frame size + slide-count bounds) and render a 3-slide "ZIP snapshot" carousel from existing brain output.

### Jenova (jenova.ai) — self-described "Best AI for Graphic Designers" — CRAWL BLOCKED
- **Category:** AI design program
- **URL:** https://www.jenova.ai · **Crawl:** blocked (JS-walled SPA; plain/UTF-8-to-file/`--wait`/alt-host attempts all returned only an unrendered app shell)
- **What it does:** Not verifiable from the live page. Only signal is the sweep framing — "Best AI for Graphic Designers" (June 2026). No capabilities confirmed.
- **Fit / spec:** Cannot assess responsibly. **Prereq, not a build:** re-crawl with a JS-rendering path (browser tool / headless with network-idle wait) or manual review before any analog decision. Do not spec against the tagline alone.

### Claude Design + NotebookLM → editable slides (claude.ai/design) — same Claude Design surface, reached as a workflow claim
- **Category:** AI design workflow/hack
- **URL:** https://claude.ai/design · **Crawl:** blocked (authenticated app entry, not a marketing page)
- **What it does:**
  - `claude.ai/design` is the live app entry for **Claude Design** (the "Start designing" button on claude.com/product/design links here). Capabilities documented on the product page above: prompt → editable draft → export PPTX/PDF/HTML or hand off.
  - The "Claude Design + NotebookLM → editable slides" claim is a **community workflow, not an Anthropic feature** — NotebookLM (Google) isn't mentioned on Anthropic's pages. Confirmed first-party: Claude Design produces *editable* decks with PPTX export + Gamma connector. The editable-slides half is real; the NotebookLM pairing is unverified.
- **Fit for SWFL Data Gulf:** The takeaway is the *editable-handoff* principle: the winning slide workflow isn't "AI makes a final PDF," it's "AI makes an editable deck that flows into a tool the user already edits in." SWFL PDF/deck deliverables should export editable (PPTX/HTML), not flattened, so an agent produces a data-backed draft and the realtor finishes it.
- **Spec skeleton:** Surface = `lib/deliverable` PDF/deck export. First slice: an editable-export path (PPTX or structured HTML) alongside the flattened PDF for deck-type deliverables. Smallest slice: emit one existing deck deliverable as `.pptx` with text/chart layers intact (not rasterized), proving the editable round-trip before wiring any third-party connector.

## Batch 1 — AI design programs (decks & visuals)

### Gamma — AI design for presentations, websites, docs, social & graphics from a prompt
- **Category:** AI design program
- **URL:** https://gamma.app  ·  **Crawl:** OK
- **What it does:**
  - Generates polished slide decks, documents (one-pagers to white papers), hosted websites, and platform-ready social content from an idea, outline, or pasted/imported existing content.
  - Has an "AI design agent" for custom, on-brand graphics (infographics to illustrations).
  - Offers a programmatic API to "automate creation, integrate with your tools, and scale your content."
- **Key features:** Start from idea/outline/imported content; "20+ AI models for highest-quality output"; import your brand or use 100+ themes; AI edit-in-a-click (smart layouts, rich content, translations, image generation/rework); real-time team collaboration; export as PPT, PDF, PNG, or Google Slides; publish as website/social post/link; engagement-metric tracking. Claims "50+ million users."
- **Pricing/model:** not stated on homepage (dedicated /pricing page exists, not crawled).
- **Fit for SWFL Data Gulf deliverable builder:** Gamma is the closest whole-product analog to our email/PDF/social deliverable surface — one prompt-to-branded-artifact engine spanning decks, docs, social, and export to PDF/PNG, with brand-theme import that mirrors our per-agent branding blocks. The API path is the most directly relevant: it proves the "programmatic build + brand injection + multi-format export" pattern we already run in `lib/deliverable`. Their theme/brand-import model is a template for how an agent's brand kit could drive every generated artifact.
- **Spec skeleton (for a follow-up Claude):** Touches `lib/deliverable/build.ts` and the design/canvas layer. Analog: a "one-prompt → branded multi-format deliverable" route where an agent's saved brand kit (logo, palette, fonts) auto-themes the generated email/PDF/social artifact, with PDF/PNG export already in our pipeline. Smallest first slice: a single server route that takes {prompt, brandKitId, format} and returns one themed artifact for one format (PDF), reusing the existing `gateNarrative` no-invention lint — no multi-format fan-out yet.

### Recraft — art-directed AI image/vector model for brand design with legible text-in-image
- **Category:** AI design program
- **URL:** https://www.recraft.ai  ·  **Crawl:** OK
- **What it does:**
  - "Tastefully crafted AI image models" that output art-directed, atmospheric, stylistically consistent images (current model: Recraft V4.1).
  - Emphasizes exceptional prompt understanding for complex scenes and "built-in aesthetic mastery" (art direction baked into every scene).
  - Produces photographic-looking images and expressive/colorful illustrations; positioned as "trusted by professional designers."
- **Key features:** Recraft V4.1 model; Recraft Studio (web app); AI models catalog; "Use cases" section; API ("Get API" / docs); iOS + Android apps; prompt-faithful complex-scene generation; multiple styles (photo, illustration, art-directed). (Vector + text-legibility are Recraft's known strengths but were not explicitly named in the crawled hero copy.)
- **Pricing/model:** not stated on homepage (dedicated /pricing and /enterprise pages exist, not crawled).
- **Fit for SWFL Data Gulf deliverable builder:** Recraft maps to the image-asset layer of our flyers and social graphics — where we need on-brand, legible, styled imagery rather than generic stock. Its API is the integration surface: an agent could request a brand-styled hero image or background for a listing flyer that stays consistent across a campaign. This complements (not replaces) our data/chart layer — it fills the "visual asset" lane of a deliverable.
- **Spec skeleton (for a follow-up Claude):** Touches the design/canvas and `lib/deliverable` asset-fetch path. Analog: a `fetchBrandImage({prompt, style, brandKit})` helper that returns a styled image block for the grid builder, provenance-tagged as an AI asset (never a cited data number). Smallest first slice: a single spike calling the Recraft API behind our existing Anthropic-style spend guard to generate one flyer background from a text prompt, dropped into one grid cell — no style-library or brand-consistency system yet.

### Figma Make — prompt-to-code/design; build and polish prototypes, jump between canvas and code
- **Category:** AI design program
- **URL:** https://www.figma.com/make/  ·  **Crawl:** OK
- **What it does:**
  - "Prompt to code anything you can imagine" — turns a prompt into working, code-backed prototypes you can ship.
  - Everything built is code-backed and visually editable, so users move fluidly between code and canvas.
  - Uses your design context (design systems, images, Figma frames, PDFs) to ground what it builds.
- **Key features:** Prompt hero with starter templates (onboarding flow, data dashboard, gradient gallery); "Make kits" + npm packages to add design-system context; attach Figma frames, PDFs, and more as context; copy Make files to the canvas for pixel polish; code-backed + visually editable output; "use Make locally to build in any codebase, then ship to production" (marked Coming soon). Part of broader Figma suite (also Figma Buzz — "on-brand assets at scale," Beta; Figma Slides; Figma Sites).
- **Pricing/model:** not stated on this page (Figma /pricing exists, not crawled).
- **Fit for SWFL Data Gulf deliverable builder:** Figma Make's pattern — prompt → editable, code-backed artifact you refine on a canvas — is the exact interaction model of our grid/canvas email builder, where AI drafts and the agent tweaks. Its "design context" concept (attach frames/PDFs/design system to ground generation) is a strong analog for feeding an agent's brand kit + a listing's data into the generator. Note Figma Buzz ("on-brand assets at scale") is the closer sibling to our social-graphic use case and worth a follow-up crawl.
- **Spec skeleton (for a follow-up Claude):** Touches the design/canvas (grid builder) and the AI-draft path in `lib/email`. Analog: a "draft-then-edit-on-canvas" loop where AI proposes a grid layout from {listing data + brand kit} and the agent edits cells directly, output staying structured (our block model) not flattened. Smallest first slice: wire an "AI draft this grid" button that takes a listing + brand kit and returns a populated but fully-editable grid layout using the existing block schema — one layout, no code-export, no kit library.

### Alai — on-brand AI presentation maker (also social posts, infographics)
- **Category:** AI design program
- **URL:** https://getalai.com  ·  **Crawl:** OK
- **What it does:**
  - AI presentation maker producing "on-brand AI design for presentations, social posts, infographics and more."
  - Emphasizes design logic/consistency across a deck and synthesizing the user's information into polished slides (testimonials stress "superior logic," first-iteration accuracy, consistency without a designer).
  - Has an API and a web app (app.getalai.com).
- **Key features:** On-brand deck generation; social posts + infographics; information synthesis into slides; brand consistency across a deck; API; enterprise/"designs at enterprise scale" contact path. Social proof: Y Combinator-backed, "#2 Product of the Day" on Product Hunt.
- **Pricing/model:** not stated on homepage (dedicated /pricing page exists, not crawled).
- **Fit for SWFL Data Gulf deliverable builder:** Alai's differentiator — brand-consistent output and synthesizing the user's raw information into a clean, logical layout — is exactly our challenge when turning lake data + a listing into an on-brand email or one-pager. It's a narrower Gamma; the "consistency across the artifact without a designer" promise is the value prop our grid builder already aims at. Less directly integrable (no standout API-asset use case), more useful as a design/UX reference for layout logic.
- **Spec skeleton (for a follow-up Claude):** Touches the design/canvas layout-logic layer. Analog: a "layout logic" pass that, given a variable amount of listing/market content, chooses a consistent slot arrangement across a multi-panel deliverable (so panel 2 and panel 5 look like one system). Smallest first slice: a deterministic layout-selector function that maps {content item count, content types} → one of N predefined on-brand grid templates, before any AI styling — pure routing, no generation.

### Ideogram — AI image generation built for legible text (posters, flyers, campaigns)
- **Category:** AI design program
- **URL:** https://ideogram.ai  ·  **Crawl:** OK
- **What it does:**
  - "Open image model at the forefront of design" focused on prompt fidelity, "crystal-clear type," and reliable post-generation editing (Ideogram 4.0; also 3.0 and Custom Image Models).
  - Built explicitly for work that "leaves the prompt box": posters, campaigns, print-on-demand, interface assets, brand worlds.
  - Lets you revise, sharpen, isolate, extend, and reshape images after generation.
- **Key features:** Prompt edit (change via plain language without rebuilding); **Layerize text** (turn typography into editable layers to restyle/reposition/refine — via /features/text-layers); Upscale; Remix; Magic fill (add/replace objects matching the scene); Background remover; Print on demand; Character consistency; Styles/style control; strong text rendering. Content types: General, Poster, Covers, Photography, Logo, Creative, Print on demand. Developer API with params like `render_text: true` and `style: "brand-grade"`; custom branded models + enterprise/production support for high-volume marketing systems.
- **Pricing/model:** not stated on homepage (has API + enterprise tiers referenced but no prices shown).
- **Fit for SWFL Data Gulf deliverable builder:** Ideogram is the single best-fit find for the listing-flyer use case: legible text-in-image is precisely what generic image models fail at, and a flyer needs the address, price, and "New Listing" pill rendered cleanly. Its API (`render_text: true`, `style: "brand-grade"`, custom branded models) is directly wireable into our flyer/social pipeline, and "Layerize text" means generated headline art could stay editable in our grid. This is the most concrete integration candidate of the five.
- **Spec skeleton (for a follow-up Claude):** Touches `lib/deliverable`/`lib/email` social+flyer asset path and the grid builder. Analog: a `generateFlyerGraphic({headline, price, style, brandKit})` helper calling the Ideogram API with `render_text:true` to produce a text-legible flyer background/hero, tagged as an AI asset (not a cited number). Smallest first slice: one API spike behind the spend guard that renders a single flyer hero with a real headline+price string and drops it into one grid cell — verify text legibility before building style presets or custom-model branding.

## Batch 3 — Email-marketing AI programs (platforms)

### Beehiiv — all-in-one newsletter/email publishing platform with built-in AI
- **Category:** email-marketing AI program
- **URL:** https://www.beehiiv.com  ·  **Crawl:** OK
- **What it does:**
  - "All-in-one platform that brings together newsletters, websites, and every tool you need to grow and earn" — newsletter builder that lets you "design and style your newsletter as you write," a no-code website builder, podcasts, and a native ad network.
  - Growth suite: Boosts, referral program, subscribe forms, pop-ups, magic links, recommendations network. Data suite: analytics ("3D analytics"), A/B testing, verified clicks, segmentation, surveys.
  - Monetization built in: ad network, paid subscriptions, direct sponsorships, digital products.
  - Email-focused only — explicitly "cannot send SMS natively" (API/webhooks to third parties instead).
- **AI features specifically:** A dedicated "beehiiv AI" feature area and "AI Website Builder" (included on the free Launch plan). Homepage names "AI-powered recommendations and segmentation." Max tier adds "AI Bot Control." Ships a "beehiiv MCP" (Read on free, Write on paid) — an MCP server for programmatic/agent access. Specific AI copy-gen/subject-line features named as a section but not detailed on the homepage.
- **Pricing/model:** Visible. Launch $0 (unlimited email sends, AI website builder, MCP read). Scale from $43/mo (email automations, surveys/polls, MCP write, 3 seats). Max from $96/mo (remove branding, audio newsletters, RSS-to-send, dynamic content, AI Bot Control). Enterprise = contact sales (100k+ subscribers).
- **Fit for SWFL Data Gulf:** Closest structural analog to our build→send pipeline — compose-in-place email editor + send engine + analytics, aimed at recurring publishing rather than one-offs. "Design as you write" + AI-website-builder maps to our grid builder; their MCP server (read/write to the newsletter) parallels our own MCP surface and suggests exposing the deliverable builder over MCP. Their monetization gate is on advanced features, not send — the opposite of our "SEND is the paywall," so a contrast reference, not a pricing model to copy.
- **Spec skeleton (for a follow-up Claude):** Surface: `lib/deliverable` schedule path + analytics. Analog = a recurring "newsletter cadence" wrapper over the existing single-build flow: let a real-estate user define a recurring SWFL email (e.g. weekly ZIP digest) once, then auto-populate each edition from fresh lake data at send time. Smallest first slice: add a `cadence` field to the saved deliverable + a scheduled job that re-runs `build-doc` against the current master brain freshness_token before each send, reusing the existing send/watermark gate. No new AI needed for v1 — reuse current commentary generation.

### Klaviyo — autonomous B2C CRM / AI email + SMS marketing platform
- **Category:** email-marketing AI program
- **URL:** https://www.klaviyo.com  ·  **Crawl:** OK
- **What it does:**
  - "The AI marketing & service platform for ambitious consumer brands" — omnichannel campaigns (email, SMS, WhatsApp, mobile push, RCS, social) plus 24/7 customer service, all "from a prompt."
  - Built on a customer-data platform (CDP): "all your customer data and channels in a single marketing platform," so every message "responds to what customers actually do — in real time."
  - Marketing automation flows with segmentation; analytics; reviews; 350+ integrations (Shopify, etc.). Powers 196,000+ brands.
  - Ships an MCP server + a Claude integration (klaviyo.com/integrate/claude).
- **AI features specifically:** Branded "Klaviyo AI (K:AI)." **Composer** (AI marketing agent — "with one prompt, Composer audits your flows, segments, and forms, and creates an entire on-brand campaign"); **Customer Agent** (24/7 AI service, "resolves 65% of questions autonomously," pre-trained on your brand); **Remix**; a free **Email subject line generator** and **AI prompt library**. Configurable brand "Voice and tone" setting conditions AI output.
- **Pricing/model:** Not stated on homepage (pricing behind /pricing; free sign-up + tiers scaling with contacts).
- **Fit for SWFL Data Gulf:** Strongest reference for our end-goal "build a whole campaign from a prompt" flow — Composer is essentially what our deliverable factory aspires to, ecommerce-grounded. Two transferable ideas: (1) a per-user "Voice and tone" brand profile conditioning AI commentary in every deliverable, and (2) an audit-then-build agent that inspects available data and proposes the highest-value email rather than waiting for a full prompt. Their CDP→real-time personalization is the analog of our four-lane lake-grounding.
- **Spec skeleton (for a follow-up Claude):** Surface: `lib/email` build-doc + AI commentary generator. Analog = a saved "Voice & tone" profile per agent (tone, signature phrases, disclaimers) injected into the commentary prompt. Smallest first slice: add a `brandVoice` string on the user/project record and thread it into the existing `gateNarrative`/commentary call as system context — no model change, no new endpoint. Follow-on: a "Composer-lite" that reads the current master dossier and suggests the single best SWFL email to build this week.

### Instantly — AI cold-email outreach + deliverability platform (B2B sales)
- **Category:** email-marketing AI program
- **URL:** https://instantly.ai  ·  **Crawl:** OK (homepage; some sections image-only)
- **What it does:**
  - "Find clients… Reach clients on autopilot" — B2B cold-email outreach engine: find leads, create AI sales agents, automate outreach & sales. Used by 50,000+ sales teams.
  - Bundles a B2B lead database + email verification + website-visitor identification; a CRM; and heavy deliverability infrastructure (email warmup, inbox placement, "AirMail," managed email accounts).
  - Campaign sending at scale across many domains/inboxes; revenue-focused analytics (Opportunities, Pipeline, Conversions, Revenue).
  - Positioned around deliverability as the core moat.
- **AI features specifically:** **Instantly AI / Co-pilot** — "find leads, emails, write copy and generate campaigns from start to finish automatically," including a "WARP Mode." **AI Sales Agent** + **AI Reply Agent** (autonomous outreach + reply handling). **AI Workflows/Automations** — auto-routes/tags/triggers next-step campaigns on lead visit/reply/booking. AI copy personalization at scale; AI recommendations that pause weak campaigns and scale strong ones.
- **Pricing/model:** Not stated (behind /pricing; free "Get Started," no card for signup).
- **Fit for SWFL Data Gulf:** The cold-outreach/deliverability end, not deliverable-design — but the most-mentioned email tool in the sweep (21x) because agents care intensely about inbox placement. Transferable pieces are on our SEND side: warmup/deliverability, per-inbox rotation, reply-triggered automations. Its "chat to AI → generate a whole campaign" co-pilot mirrors our address-bar-first vision applied to outreach. Least aligned on build/design; most aligned on send-reliability + campaign automation.
- **Spec skeleton (for a follow-up Claude):** Surface: send/schedule path (`lib/deliverable` send + provider integration). Analog = deliverability-aware sending: warmup state + send-rate throttling per connected inbox. Smallest first slice: add send-time deliverability hygiene to the existing send flow — per-domain rate caps + a pre-send checklist (SPF/DKIM/DMARC present, list-unsubscribe header) surfaced in the send modal. Follow-on: reply-triggered automation (a reply pauses the sequence / tags the contact).

### Migma (MigmaAI) — AI email campaign builder ("idea to inbox")
- **Category:** email-marketing AI program
- **URL:** https://migma.ai  ·  **Crawl:** OK
- **What it does:**
  - "Create emails worth opening — AI that writes, designs, and delivers campaigns that actually convert." Prompt-to-email: "describe your campaign; Migma builds the emails, flows, segments, and scheduling, all from a single click."
  - Visual no-code editor: "click any element to edit text, images, colors, and styles."
  - Send & track: "hit send, track opens, clicks, and conversions in real time. Migma learns what works and optimizes your next campaign automatically."
  - Import paths: from Figma, from a screenshot ("clone a screenshot"), from HTML, and "import Claude design." A "Remix / Browse Real Brand Emails" library lets you remix any email into your own, plus "track a competitor."
  - Positioned as one "unified canvas for product, marketing, and transactional email."
- **AI features specifically:** End-to-end generative: AI writes copy AND designs layout from a natural-language description in one click; AI-built flows, segments, scheduling; screenshot→email cloning; HTML/Figma/Claude-design import into an editable email; auto-optimization; a competitor-tracking / brand-email remix engine.
- **Pricing/model:** Not stated on homepage ("Get started free" + /pricing; free tier implied). Backed by EWOR; built in Stockholm & Barcelona.
- **Fit for SWFL Data Gulf:** The single closest analog to our exact product — a prompt-to-email builder with a visual grid/canvas editor, a send flow, and open/click tracking, for non-designers. "Idea to inbox in one click" + "click any element to edit" is almost precisely our grid builder + build/send pipeline. Two ideas worth stealing: (1) the **Remix / competitor-email library** (clone a real email into your own) maps to our skeleton/registry system; (2) multi-path import (screenshot/HTML/Figma) to seed a build. They advertise "Import Claude design," confirming Claude-generated email design is a live market pattern.
- **Spec skeleton (for a follow-up Claude):** Surface: `lib/email` grid builder + skeleton registry. Analog = a "Remix" gallery of pre-built SWFL deliverable skeletons (New Listing, ZIP digest, market update) a user can one-click clone then fill from the lake. Smallest first slice: expose the existing positioned skeletons as a pickable "start from a template" list in the grid builder entry, each pre-wired to a master-brain data source. Follow-on: screenshot→skeleton import that maps an uploaded email image onto the nearest registered skeleton.

## Batch 4 — Email copy AI programs + humanizing

### Jasper — enterprise AI marketing platform for on-brand content at scale
- **Category:** email-copy AI program (broader marketing-content AI; email is one use case)
- **URL:** https://www.jasper.ai · **Crawl:** OK
- **What it does:**
  - AI content platform for marketers spanning campaigns, personalization, SEO/GEO, multi-channel copy (Canvas free-form editor, Grid bulk-generation, Content Pipelines for repeatable workflows).
  - "Agents" execute end-to-end marketing workflows (research, optimization, translation); Jasper APIs + Jasper MCP expose generation programmatically.
  - "Jasper IQ" governance layer embeds context, rules, and brand logic into every generation.
- **AI/copy features specifically:** Brand Voice + Brand IQ (trains AI on your tone/style), Style Guide, Visual Guidelines, Knowledge-base grounding, Governance/compliance controls. Grid batch-generates many variants; Campaigns turns a brief into channel-ready content.
- **Pricing/model:** Per-seat "Pro" and "Business" tiers ("Includes 1 seat," Business = Pro + governance/enterprise); dollar figures render via JS and didn't appear in crawl — exact numbers not stated. Free trial + demo.
- **Fit for SWFL Data Gulf email authoring:** Jasper's "Brand Voice / Brand IQ" is the closest analog to what a branded listing/market email needs — a persisted voice profile that constrains AI commentary so every agent's email sounds like *them*. Grid (one brief → many on-brand variants) maps directly to generating subject-line/commentary variants for a single listing. The governance/knowledge-grounding layer mirrors our four-lane cite-or-don't-invent rule.
- **Spec skeleton (for a follow-up Claude):** Surface = `lib/email` AUTHOR_TOOL. Add a per-agent `brandVoice` object (tone words, banned phrases, signature style, sample sentences) persisted on the user profile and injected into the AUTHOR_TOOL system prompt. Smallest first slice: a single `voice_profile` string that prepends to the existing commentary prompt, with 3 preset voices (warm-local, data-analyst, luxury-concise) before any custom-training UI.

### Smartlead — cold-email-at-scale platform with deliverability infra + AI assistant
- **Category:** email-copy AI program (embedded in a cold-outreach/deliverability suite)
- **URL:** https://www.smartlead.ai · **Crawl:** OK
- **What it does:**
  - Cold email at scale: unlimited mailboxes, auto warm-up, SPF/DKIM/DMARC handling, sender rotation, dedicated-IP deliverability infra (SmartInfra/SmartDelivery).
  - "SmartAgents" AI GTM workforce (research leads, write personalized emails, update CRM, optimize deliverability); "SmartAssistant" cold-email AI; Master Inbox with an AI reply manager that classifies replies by intent.
- **AI/copy features specifically:** Standalone content tools — **AI Subject Line Generator**, **AI Subject Line Analyser**, **Email Copywriter**, Grammar Checker, Spam Checker, Email Signature Generator. SmartAgents write personalized emails; intelligent sequencing optimizes send times and loops objections into new outreach.
- **Pricing/model:** "Pro" plan **$59/month** (send + verified-prospect quotas); higher tiers exist. Free trial, no card mentioned.
- **Fit for SWFL Data Gulf email authoring:** The **AI Subject Line Generator + Analyser** pair is the single most directly liftable idea — generate N subject candidates and score each on predicted open-likelihood/spam-risk before the user picks. Their Email Copywriter validates "give me the body copy" as a discrete micro-feature. Deliverability infra is out of scope (we build/schedule, not cold-blast).
- **Spec skeleton (for a follow-up Claude):** Surface = subject-line variants in `lib/email` AUTHOR_TOOL. Analog = a `generateSubjectVariants(listing, marketFacts) -> {subject, rationale}[]` call returning 3-5 candidates, each with a one-line "why" grounded in a cited data point. Smallest first slice: extend the commentary AUTHOR_TOOL to also emit `subjectVariants: string[]` rendered as clickable chips in the grid builder — no scoring model yet.

### Lemlist — AI outbound platform for personalized multichannel outreach
- **Category:** email-copy AI program (AI personalization inside a multichannel sequencer)
- **URL:** https://www.lemlist.com · **Crawl:** OK
- **What it does:**
  - Multichannel outbound (email, LinkedIn, calls, WhatsApp, SMS) from one workflow + unified inbox; 650M+ lead database with enrichment/verification.
  - AI agents (lemAgent) research leads and personalize outreach using real context + intent signals; data-enrichment agents pull structured insights from LinkedIn/websites/CRM.
  - Intent-signal agents auto-add leads to campaigns with messaging personalized to the triggering moment.
- **AI/copy features specifically:** "Smart Messaging" AI personalization, lemAgent, AI web-search enrichment, AI account/contact research, AI reply-intent detection, AI-generated replies, Liquid Syntax dynamic variables, and an official **lemlist MCP + Claude Skills** integration.
- **Pricing/model:** Email plan from **$55/user/mo** (50,000 emails/mo), Multichannel from **$87/user/mo** (unlimited); credit system (1 credit = $0.01) meters AI/enrichment pay-per-success. 14-day free trial.
- **Fit for SWFL Data Gulf email authoring:** Lemlist's core thesis — inject *real, per-recipient context* so mass email still "feels 1:1" — is exactly our four-lane provenance applied to email: commentary should weave the recipient's ZIP/market facts as the personalization variable, not spray generic copy. Their Liquid-Syntax dynamic-variable pattern maps to templating live lake numbers into a listing email. Their MCP/Claude-Skills packaging signals that exposing our authoring as an MCP tool is a proven distribution move.
- **Spec skeleton (for a follow-up Claude):** Surface = `lib/email` AUTHOR_TOOL personalization. Analog = a `contextVariables` slot where the recipient's ZIP-level lake facts (median price, DOM, inventory) resolve and pass to the commentary prompt as cited, mergeable tokens. Smallest first slice: support one dynamic token (`{{zip_market_snapshot}}`) the AUTHOR_TOOL fills from an existing master/brain fetch and cites in the collapsed source list — reuse the existing citation renderer, no new UI.

### Walter Writes — AI "humanizer" + detector that rewrites AI drafts to read as human
- **Category:** AI humanizer
- **URL:** https://www.walterwrites.ai · **Crawl:** OK
- **What it does:**
  - Rewrites AI-generated drafts into natural, human-sounding text and scores authenticity with a built-in AI detector (pitched as "detection-proof").
  - Explicit **"Business & Email — Fix robotic AI tone fast"** track for outreach emails, updates, summaries, proposals.
  - Ecosystem: Humanizer API, Chrome extension, Zapier, a **Walter MCP connector for Claude**, and open-source Claude Skills.
- **AI/copy features specifically:** "Humanize" "adjusts word choice, sentence structure, and length to avoid common AI patterns... reduces repetition, introduces varied formatting, and incorporates contextual nuances, minor errors, or informal language." Also AI Paraphraser (tone control), Grammar Checker, Authenticity Score, resume rewriter.
- **Pricing/model:** Starter **$8/mo** (30k words, 750/request), Pro **$13/mo** (70k, 1,500/request), Elite **$26/mo** (200k, 2,000/request), Teams **$99/mo** (500k). Annual billing; free 300-word trial. MCP on all tiers.
- **Fit for SWFL Data Gulf email authoring:** Direct answer to the Reddit "sounds like a robot" complaint — a *post-processing pass* on AUTHOR_TOOL output that varies cadence/word-choice so branded emails don't read as templated AI. GUARDRAIL CONFLICT: Walter deliberately "incorporates minor errors" and mimics informality, which collides with our facts-only/no-invention rules — any analog must humanize *phrasing only*, never touch cited numbers. Value = a de-robotify style layer, not detector-evasion.
- **Spec skeleton (for a follow-up Claude):** Surface = a second-pass in `lib/email` AUTHOR_TOOL after commentary generation. Analog = a `humanizePass(commentary, brandVoice)` that rewrites for natural rhythm/varied sentence length while a lint re-verifies every number/citation survives unchanged (reuse `gateNarrative`). Smallest first slice: a prompt-only "vary the cadence, drop AI-tell phrases, keep every cited figure verbatim" rewrite step behind a toggle, gated by the existing no-invention lint — no external API, no detector.

## Batch 5 — Hacks / techniques (not products)

### 1. "Human-sounding email" prompt hack — a prompting pattern that strips the robotic register out of AI email copy
- **Category:** hack/technique
- **URL:** https://www.reddit.com/r/ChatGPT/ (thread "After 147 failed ChatGPT prompts... a simple email that didn't sound like a robot", ~22,927 upvotes / 2,409 comments) · **Crawl:** blocked (Reddit JS-walled; distilled from the sweep signal)
- **The technique / mechanic:**
  - Default LLM email output has a recognizable "robot register": over-formal openers ("I hope this email finds you well"), hedging, corporate filler, symmetrical paragraphs, a wrapped-up CTA. The hack is a prompt that explicitly *forbids* those tells and *pins a voice*.
  - Working prompt shape: assign a concrete persona + relationship ("you're emailing a busy colleague you know"), set constraints ("under 90 words, one idea, no greeting cliché, contractions on, one-sentence ask"), give a negative list ("never say 'I hope this finds you well', 'circle back', 'leverage', 'reach out'").
  - Often paired with a one-shot example of the sender's real voice so the model matches cadence.
  - It's a *constraint + negative-example* prompt, not a model change — leverage is in what you ban and the voice you anchor to.
- **Why it works:** LLMs regress to the safest/most common register unless constrained; the "robotic" feel is that mean. Banning specific high-frequency tells + anchoring to a named voice/length forces the model off the median. Brevity + one-idea constraints kill the symmetrical "AI paragraph" shape readers subconsciously flag.
- **Fit for SWFL Data Gulf:** Direct upgrade to the email AI's commentary/prose layer — the part that writes human sentences around the coded data grid (per the recent "New Listing pill" commit where AI writes only the commentary). A banned-phrase list + voice-anchor lives alongside our facts-only/no-smoothing lints and protects the build-free/send-paid value: a deliverable that sounds human is worth paying to send.
- **Spec skeleton (for a follow-up Claude):** Surface = `lib/email` / the narrative author (`gateNarrative` / commentary path). Build a `voiceGuard` prompt module: (a) static banned-phrase array, (b) length/one-idea constraint, (c) optional per-user voice sample. Smallest first slice: add the banned-phrase list + a post-generation lint flagging any banned phrase in email commentary (mirror the existing lint pattern) so it fails loud like `facts-only-lint` — no model swap, no new gate materialization.

### 2. n8n AI newsletter/report workflow — visual automation; a scheduled "research → format → email" report agent
- **Category:** hack/technique
- **URL:** https://n8n.io · https://gist.github.com/joseph1kurivila/c04a6f74139b31821d39bdeafe637bb0 · **Crawl:** OK (both)
- **The technique / mechanic:**
  - n8n = open-source (195.5k GitHub stars) visual workflow-automation platform — nodes on a canvas, 500+ integrations, self-hostable via Docker, JS/Python escape hatches, native AI-agent/RAG/MCP support.
  - The gist is a real workflow ("Competitor Monitoring (AI Agent With Tools)") whose 7-step shape IS the AI-newsletter pattern: (1) read targets from a Google Sheet → (2) per target, call Perplexity API for last-30-days findings → (3) filter each response to `content` + `citations` only (context compression) → (4) aggregate into one string → (5) LLM formats a report under a *strict output contract* (markdown-only, fixed headings, "No updates" fallback) → (6) deterministic markdown→HTML convert ("we don't need an LLM for this") → (7) send HTML email via Gmail on a `scheduleTrigger`.
  - The system prompt enforces a citation contract: rewrite Perplexity `[1]`/`[2]` numeric refs into inline markdown links using the `citations` array as a 1-based index, dedupe links, drop unresolved refs — no dangling or invented sources.
- **Why it works:** Separates the three jobs cleanly — *research* (Perplexity, cited), *synthesis* (LLM under a rigid contract), *rendering* (deterministic code) — so the LLM does only what it's good at and can't corrupt formatting or fabricate links. Context compression keeps token cost down; the strict contract makes output diff-stable and safe to send unattended on a cron.
- **Fit for SWFL Data Gulf:** Our own architecture validated by a stranger: thin-pipe, deterministic-math/narrative-prose, cited-only, cron-scheduled. Their "strict output contract + deterministic markdown→HTML + never invent a link" maps 1:1 onto our BrainOutput contract, four-lane citation rule, and pipeline-freshness cron wrappers. Their citation-index rewrite is a concrete pattern for our CitationList single-root renderer.
- **Spec skeleton (for a follow-up Claude):** Surface = scheduled-deliverable build/send path (`lib/deliverable/build.ts`, cadence_registry cron wrappers). Don't adopt n8n — adopt its contract. Smallest first slice: port the "citation-index rewrite + dedupe + drop-unresolved" rule as a reusable post-processor in `lib/citations/`, so any deliverable carrying numbered refs resolves them to clean single-root citations and silently omits any ref without a real URL (enforcing "no invented source" at render time).

### 3. Free-newsletter-as-audience model (Ed Zitron / Where's Your Ed At) — a genuinely-useful free newsletter is the funnel; money is adjacent
- **Category:** hack/technique
- **URL:** https://www.wheresyoured.at · **Crawl:** OK
- **The technique / mechanic:**
  - Two-tier cadence: long substantive **free** posts (24–43 min reads) interleaved with **premium/paid** posts (marked "paid").
  - Every free piece ends with the same soft conversion line: "If you liked this piece, you should subscribe to my premium newsletter. It's $70 a year, or $7 a month." Free work does the persuading; the ask is one sentence, repeated, never gated up front.
  - The free tier is not a teaser — it's fully valuable standalone (original reporting). That's what earns the subscribe.
  - Audience is cross-monetized off-newsletter (the "Better Offline" podcast) — newsletter is top of funnel, not the only revenue.
- **Why it works:** Give-first builds trust + reach (free posts get shared/ranked); a small low-friction paid ask ($7/mo) converts the fraction who want more. The free product must stand alone or the subscribe ask has no proof behind it — value is the conversion mechanism, not the CTA.
- **Fit for SWFL Data Gulf:** Mirror of our locked "build free / SEND is the paywall" model — the *build* is Zitron's free post (fully useful, watermark only), the *send* is his premium tier. His pattern says the free artifact must be genuinely valuable standalone (not a crippled teaser) or nobody pays to send, and a single repeated low-friction ask beats an up-front gate. Validates cross-surface monetization (email + PDF + social off one build).
- **Spec skeleton (for a follow-up Claude):** Surface = build→send funnel (arrival/destination lab-entry root + SEND paywall). Smallest first slice: add a single, repeated, low-friction "send this for real / upgrade to send" line on the finished free build preview (watermark stays), mirroring Zitron's one-sentence end-of-post ask — measure build-complete → send-intent conversion before adding any harder gate. Reuse the existing watermark/send boundary.

### 4. Copywriter's AI-era toolkit (Power Thesaurus + OneLook) — fast word-finding / reverse-dictionary tools that sharpen human phrasing
- **Category:** hack/technique
- **URL:** https://www.powerthesaurus.org · https://www.onelook.com · **Crawl:** OK (both)
- **The technique / mechanic:**
  - **Power Thesaurus:** crowd-ranked thesaurus — synonyms/antonyms ordered by community votes so the strongest alternative surfaces first. Free + PRO tier.
  - **OneLook:** meta-dictionary + *reverse dictionary / concept thesaurus* scanning ~16.97M entries across 805 dictionaries. Pattern + meaning search: `blue*` (starts with), `*bird` (ends with), `bl????rd` (wildcard length), `:snow` (concept-related), `bl*:snow` (starts-with AND meaning), `**winter**` (phrases containing), `expand:nasa` (acronym).
  - Both are *retrieval* tools, not generators — writer keeps authorial control, pulls the exact word/phrase/concept on demand.
- **Why it works:** Copywriters don't need AI to write the line — they need the one right word or a concept→word jump the brain can't retrieve on the spot. Vote-ranking + meaning/pattern queries collapse that lookup to seconds while leaving voice and judgment human. Augmentation, not automation — why pros trust it.
- **Fit for SWFL Data Gulf:** Maps to the deliverable-builder's copy-editing layer (email commentary + social captions). A concept→word / synonym-swap affordance ("make this headline punchier", "another word for X") gives retrieval-grade control without letting the model rewrite meaning, complementing the human-voice hack (#1). Reinforces augmentation over automation.
- **Spec skeleton (for a follow-up Claude):** Surface = the email/social copy editing UI (caption/headline fields). Smallest first slice: an inline "synonyms / stronger word" popover on selected text in a headline field, backed by a ranked synonym lookup. Retrieval only — it suggests, the operator picks, never rewrites the sentence. Later: a concept→word reverse-lookup like OneLook's `:meaning`.

### 5. awesome-chatgpt-prompts (now prompts.chat) — a large community-curated CC0 prompt library, role-based "Act as…" prompts
- **Category:** hack/technique
- **URL:** https://github.com/f/awesome-chatgpt-prompts (redirects to github.com/f/prompts.chat) · **Crawl:** OK
- **The technique / mechanic:**
  - Curated open collection of reusable prompts (~165k stars, 21.4k forks, 7,483 commits, still growing). Rebranded to **prompts.chat**, now a full app around the same data.
  - Structure: prompts live as data in `prompts.csv` / `PROMPTS.md` (CC0 public-domain), site code MIT. Each entry follows a consistent **"Act as a [role]"** pattern — persona + task + constraints the user pastes to prime the model.
  - Ships multiple consumption surfaces: web app, CLI (`npx prompts.chat`), a Claude Code plugin (`/plugin install prompts.chat`), and an **MCP server** (`https://prompts.chat/api/mcp`). Self-hostable (PostgreSQL/Neon, Docker) for a private branded library.
- **Why it works:** Good prompting is mostly reuse of proven patterns; a curated, versioned, voted library removes the blank-page problem and encodes what works. The rigid "Act as [role]" shape is a reliable priming device. CC0 data + MCP-addressable turns a doc into infrastructure other tools can query.
- **Fit for SWFL Data Gulf:** Model for a curated internal prompt/recipe library for our deliverable factory — quick-start campaign buttons + the deliverable-distiller already gesture at this. A versioned set of proven "author this kind of email/social" prompt templates, exposed to our AI author, would give operators a blank-page-free start. MCP-server angle lines up with our existing `/api/mcp` surface — recipes could be MCP-addressable.
- **Spec skeleton (for a follow-up Claude):** Surface = the deliverable recipe/registry layer. Smallest first slice: formalize a small versioned "prompt recipe" collection (persona + constraints + example) as committed data with one canonical schema, mirroring their csv-as-data pattern, and wire the quick-start campaign buttons to select from it. Don't build an app or MCP endpoint yet — start with the curated data file + a picker.

### 6. thebilig.com "Best AI Newsletters" — format/cadence signals from top-ranked AI newsletters
- **Category:** hack/technique
- **URL:** https://www.thebilig.com/newsletters/editors-picks/best-ai-newsletters · **Crawl:** OK
- **The technique / mechanic:**
  - Editorial ranking of AI newsletters, each tagged with publisher, cadence, and a one-line format promise. Recurring signals:
  - **Daily + concise** dominates the top: #1 TLDR AI ("daily… concise format for technical readers"), #2 The Rundown AI ("daily… short, accessible"), #4 There's An AI For That (daily). Short-and-daily is the winning default.
  - **Cadence is explicitly stated** on every entry: Daily, Weekly (AI Breakfast, Digital Native), Twice-a-week (Tech Decoded/BBC), Monthly (Guide to AI), Ad-hoc (How to AI).
  - **Coverage scoped to a promise**: each names exactly what it covers (product launches, research, ML/data-science, workplace applications). The pitch is "make sense of AI without chasing every update" — curation/compression as the value.
  - Bilig itself is a newsletter-reader app; the list is SEO/discovery content funneling to signup (free-list-as-funnel echoes #3).
- **Why it works:** Readers pick newsletters on two legible signals — *how often* (fits my inbox tolerance) and *how condensed* (respects my time). Naming cadence + a tight coverage promise sets expectation and reduces unsubscribes; "short + daily + curated" wins because it's the lowest-effort habit to sustain.
- **Fit for SWFL Data Gulf:** Directly informs the default shape of scheduled deliverables: pick a stated cadence (daily/weekly), keep each issue short and single-promise, lead with a legible coverage line ("SWFL Lee/Collier market moves, this week"). Our deliverables should wear their cadence + scope on the label the way these picks do — the expectation-setting that makes a recurring send worth subscribing to (and paying to send).
- **Spec skeleton (for a follow-up Claude):** Surface = scheduled-deliverable templates + the cadence picker. Smallest first slice: add a "cadence + one-line coverage promise" header field to the recurring-deliverable template (e.g. "Weekly · SWFL Lee & Collier listing moves"), rendered atop every issue. Pair with a short-form "concise/daily" template variant as the recommended default.
