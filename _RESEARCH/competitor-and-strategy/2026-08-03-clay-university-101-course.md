# Clay University — "Clay 101: GTM Automation" full course sweep (08/03/2026)

Operator asked for the rest of the Clay 101 course (17 lessons, numbered 0–17 in the sidebar) after
lesson "FETE & Jigsaw" was already crawled separately. Swept via crawl4ai: lesson 0 + lessons 2–17,
16 pages, **16/16 succeeded, zero 404s/failures**. Source: `https://university.clay.com/lessons/*`.
Prior context: `2026-08-02-claydotcom-scan.md` (marketing site), `2026-08-02-claydotcom-app-drive.md`
(logged-in in-app drive — table-column primitive, waterfall/DAG/cost mechanics already documented
there in more depth than this course repeats).

**What this course actually is:** a beginner-facing tutorial for Clay's core loop (FETE: Find,
Enrich, Transform, Export), aimed at GTM/sales reps standing up B2B prospecting workflows. It is
mechanically thinner than the app-drive scan — no new primitives, mostly click-path instructions
plus a few genuinely reusable operating principles. Grouped below by FETE phase per the assignment;
non-FETE lessons (0, 2, 3, 17 — orientation/meta) folded into the relevant phase or called out
separately.

## Orientation / meta (lessons 0, 3, 17)

- **Lesson 0 (Get Started in Clay)** restates FETE as the one workflow every feature sits on top of
  ("ignore almost every button on the home screen"). Demo: Sculptor (Clay's AI copilot) turns a
  plain-English brief ("heads/directors/VPs of data science at NY software companies") into real
  filters — explicit instruction to **review each filter by hand before trusting the count**,
  "don't over-rely on Sculptor... confirm what it returns before you trust it." Same discipline as
  our own no-invention/verify-before-answer posture, applied to their NL-to-filter layer.
- **Lesson 3 (How to Experiment Inside of Clay)** — the one lesson with a real operating philosophy:
  *"Clay rewards experimentation over perfection."* Recommends a **10–15% credit R&D budget**
  reserved for testing new segments/messaging/signals (explicit analogy to Google's "20% time," own
  framing, not independently verified here), documented and shared as a "library of proven plays."
  Credit-optimization list: AI Formulas cost 0 credits, use the Metaprompter instead of burning
  credits on prompt iteration, bring-your-own API key claimed to **cut AI costs "up to 90%"**
  (Clay's own unverified figure — RULE 4 flag, not independently checked), conditional runs, use
  Sandbox mode for free drafting, and **start at 5 rows → 50 → 500** before scaling.
- **Lesson 17 (Where to Go Next)** — recap + course map (Clay 201, AI-Powered GTM Automation,
  Inbound/Outbound Automation, Limitless Research, CRM Enrichment) and community/cohort pointers.
  No new mechanics.

## FIND (lessons 4, 5, 6, 7 + use-case lesson 2)

- **Lesson 2 (Your First GTM Use Case)** — three worked examples (B2B outbound campaign, local-
  business/Google-Maps prospecting, deep-research personalization), all explicitly framed as "same
  FETE + Jigsaw, different inputs." Pure motivation/demo, no new mechanic.
- **Lesson 4 (Finding Companies)** — native Companies dataset = 100+ providers pre-merged. Filters:
  industry, headcount, location, keyword, founding date. Explicit caveat: this is a **snapshot of
  self-reported data**, not live — use Enrich actions for current data. Best practices: build small
  lists (1,000–3,000), test multiple ICP hypotheses as separate lists rather than one mega-list, use
  negative exclusions, and always capture domain/LinkedIn URL (the Jigsaw "corner pieces") because
  they gate every later enrichment.
- **Lesson 5 (Finding People)** — layers people search on top of a company table via "Find People at
  These Companies." Filters: title/function, seniority, experience tenure, location, certifications,
  language, education, exclusions. **Linked-table mechanic**: company and people tables are auto-
  related, so a company-level fact (e.g., recent funding news) is enriched **once** at the company
  row and inherited by every person at that company — avoids paying N times for the same fact across
  N contacts at one company.
- **Lesson 6 (Find Jobs — source vs. enrichment)** — two entry modes: Jobs-as-Source (cold-start job
  search, e.g., every open BDR role in the US) vs. Jobs-as-Enrichment (layer job-posting counts onto
  an existing qualified company list to score hiring velocity). Waterfall behind it: PredictLeads →
  Google Jobs → Clay's native jobs DB. Named API limitation: Google Jobs caps at **4 keywords per
  search** — a real, specific vendor constraint worth knowing if we ever touch that API ourselves.
  Also: "Clay doesn't yet have semantic search" for job titles — brute-force keyword permutations
  required.
- **Lesson 7 (Google Maps)** — targets businesses with strong physical presence but weak digital
  footprint (dentists, contractors, "mom and pop" shops) that standard B2B databases miss. Business-
  Type search preferred over free-text for consistency. Returns up to 1,000 results but populates
  **asynchronously** — explicit warning not to trust the initial count, let it finish. Filter 4+ star
  ratings for quality signal.

## ENRICH (lessons 8, 9, 10, 11)

- **Lesson 8 (Enrich intro)** — reframes enrichment as "you're not gathering data, you're buying
  competitive advantage." No new mechanic, just framing.
- **Lesson 9 (Enriching Company Data / waterfalls)** — concrete worked example: funding-stage
  waterfall tries IntelliSense (1 credit) → PitchBook (3 credits) → DealRoom (4 credits), stops at
  first hit, cheapest-first ordering pre-tuned by Clay from "hundreds of thousands of enrichments."
  Reorder is user-editable. **Always test on 10 rows via "Save & Run (10 Rows)" before scaling** —
  stated as the default workflow, not an edge-case tip.
- **Lesson 10 (Enriching People Data)** — work-email waterfall + validation. Default validator:
  ZeroBounce (swappable). Catch-all emails treated as **valid by default**; a toggle
  ("Only mark 'Safe to Send' as valid") excludes them for stricter deliverability. Failed lookups
  auto-refund credits. Best-input priority: company domain + personal social URL > full name +
  company name > full name + personal email (a fallback-input hierarchy, not just one required
  field). Validation sub-columns are hidden by default but inspectable — provenance-on-demand, not
  provenance-by-default.
- **Lesson 11 (Enriching with Claygent)** — names the real problem their whole AI layer solves: the
  **"last mile data problem."** Even a 120+-provider waterfall tops out around 80–95% coverage
  (Clay's own figure, unverified here) because genuinely niche facts (does this dentist offer
  Invisalign, did this founder speak on a panel last month) were never going to be in any vendor
  database. Claygent is positioned explicitly as the tool for exactly that gap — live web visit +
  extraction, not a static lookup. Prompt-writing guidance: write in second person ("Visit this
  company's homepage..."), give explicit fallback logic ("if no recent post, summarize the About
  section"), add token-saving instructions ("keep output under 50 words"). Cost tiers are literally
  1/2/3 credits mapped to simple/moderate/complex judgment calls, user-selected up front (already
  documented in more depth in the app-drive scan's "AI is caged, not trusted" section).

## TRANSFORM (lessons 12, 13)

- **Lesson 12 (Clean & Normalize)** — Clay's built-in normalizers (company name suffix stripping,
  whitespace, phone format, location format) are **free** specifically because they're deterministic
  string operations with no external API call — the credit model itself enforces the
  deterministic/generative split, it isn't just a style guideline.
- **Lesson 13 (AI Formulas)** — the deterministic half of Clay's "two ways to use AI" split (the
  other half, generative/Claygent, was covered in lesson 11). AI Formulas: zero credits, used for
  extraction/math/formatting where "you know exactly what result you want and apply the same logic
  to every row" — explicitly NOT for judgment calls. This is the same deterministic/generative
  boundary already noted in the app-drive scan (their Functions/waterfalls vs. Claygents), restated
  here as a formal decision rule: **if the task requires no judgment, it must not cost a credit.**

## EXPORT (lessons 14, 15, 16)

- **Lesson 14 (Export overview + CSV)** — decision framework offered for CSV vs. live integration:
  will the data change often, do you need real-time sync, who else needs access. **Export View**
  pattern: duplicate the working view, strip out intermediate/debug columns, export only the clean
  view — separates the working surface from the shipped surface as two saved views of the same
  table, not two separate objects. Also notes integration fields showing "run condition not met"
  export as blank, not as an error — a silent-gap behavior worth knowing if we ever consume a Clay
  export.
- **Lesson 15 (Google Sheets)** — three actions: Add Row, Lookup Row, Lookup-Add-or-Update Row
  (upsert). Paid-plan gated. Positioned as the "live sync" alternative to CSV's one-time dump.
- **Lesson 16 (CRM Export)** — the one lesson with a real discipline worth naming: **never insert
  before you look up.** Standard flow is Lookup Contact (by email — stated as the only reliable
  identifier, name-matching flagged as unreliable) → conditional "Create or Update Contact" gated to
  only fire when the lookup found no match. An AI Formula can additionally cross-check the looked-up
  contact's email domain against the target company's domain to catch false-positive name matches.
  This is dedupe-before-write as a first-class, two-step pattern, not an afterthought.

## VERDICT — what's stealable for brain-platform, what's not

**Stealable / already-confirmed (not new, but worth noting as independent convergence):**

1. **Deterministic-must-be-free, judgment-must-cost** (lessons 12–13) is the same rule as our
   "deterministic math, narrative prose" — Clay enforces it structurally via their credit meter,
   we enforce it via the brain-factory pipeline split (packs compute numbers in code, LLM only
   narrates). No action item, just confirms the design pattern is right, independently arrived at
   by both.
2. **Lookup-before-write / dedupe-before-insert** (lesson 16) is a pattern we should keep in mind
   for any future write path that could double-insert (e.g., if a Lab-built list ever pushes to an
   external CRM or contact store) — but we have **no current CRM-export surface**, so this is a
   principle to remember, not a build to schedule.
3. **Export View = a second saved view of the same table, not a separate object** (lesson 14) is a
   small, cheap idea that could inform how we shape any future CSV/export surface off our own
   tables (e.g., an /ops data dump) — strip working/debug columns via a view rather than a
   parallel pipeline. Speculative; no active export surface named to apply it to today.
4. **Explicit fallback-input hierarchy for enrichment** (lesson 10: domain+social > name+company >
   name+personal-email) is a reusable framing for our own four-lane sourcing docs — not a new
   lane, but a cleaner way to document *within-lane* priority when a lane itself has multiple
   possible identifiers. Documentation-quality idea only, not a code change.
5. **10–15% "R&D budget" carved out of the metered resource, explicitly earmarked for testing new
   ideas** (lesson 3) — we already track Anthropic spend via `project_anthropic-spend-guards`; the
   idea of formally reserving a slice of that budget for experimentation (new pack ideas, new
   ingest probes) rather than treating all spend as production-critical is a cheap, adoptable habit.
   Not currently formalized anywhere in our docs; flagging as a maybe, not proposing a build.

**NOT stealable — Clay-specific GTM/sales tooling with no analog here:**

- Company/people prospecting, Google Maps business search, jobs-as-source/enrichment (all of
  "Find") — we don't do outbound lead generation; our subject is SWFL public-record real estate
  data, not B2B contact acquisition. Zero overlap.
- CRM export integrations (HubSpot/Salesforce/Pipedrive/Close/Copper), Google Sheets live-sync
  actions — we have no CRM and no Sheets-sync surface. Nothing to wire.
- Email/phone waterfall enrichment, work-email validation (ZeroBounce) — we don't enrich or sell
  contact data; not our data grain.
- Claygent-as-last-mile-scraper for niche B2B facts (Invisalign, panel appearances) — the *shape*
  (waterfall + AI-scrape gap-filler) already matches our four-lane sourcing per the two prior Clay
  scans; this course adds no new mechanic beyond what's already logged there.

**Overall read:** this course is thinner than the two prior scans, mostly a beginner tutorial with
click-paths for a sales-prospecting workflow we don't run. The few genuinely reusable ideas
(deterministic/generative cost split, lookup-before-write, export-as-a-view, fallback-input
hierarchy, R&D budget carve-out) are all either things we already do in a different shape or small
documentation/process habits — none require code changes, and none of them are things Clay does
that we should now go build. The honest verdict is: nothing here changes brain-platform's
architecture or roadmap.
