# Email creation on OTHER people's data — competitor scan (07/30/2026)

Question behind it (operator, 07/30/2026): drop the dependence on our own lake and become an email
creation company that runs on whatever a user hands us. One orchestrator that knows message-fit and
composition; craft (chart, photo, prose) lives below it. "Emails are easy — making them look good
with numbers and charts and photos is a little more difficult." Can we actually do it well?

Method: RULE 0.4 — read `_RESEARCH/INDEX.md` first (two prior files applied, cited below), then
crawl4ai live. crawl4ai only, no Firecrawl, no memory. Captures in the session scratchpad
(`.../scratchpad/crawl/*.md`), never committed.

---

## 1. Beefree SDK — the embeddable email builder, and the only real agentic contract found

Source: https://developers.beefree.io/build-with-ai ·
https://docs.beefree.io/beefree-sdk/mcp-server/getting-started ·
https://docs.beefree.io/beefree-sdk/mcp-server/mcp-server-tools-and-capabilities (all fetched
07/30/2026). Beefree sells its editor as an SDK other SaaS embed; it is the closest thing to a
reference implementation of "agent drives an email builder."

**MCP Server is in open beta. The v1 endpoint is deprecated and dies September 1, 2026** (verbatim
from the getting-started page) — worth knowing before anyone integrates against a stale example.

The tool surface, verbatim tool names:

- Structure/layout: `beefree_add_section`, `beefree_delete_element`, `beefree_update_section_style`,
  `beefree_update_column_style`, `beefree_get_content_hierarchy`, `beefree_get_element_details`,
  `beefree_set_email_metadata`, `beefree_set_email_default_styles`
- Content blocks: `beefree_add_title`, `beefree_add_paragraph`, `beefree_add_list`,
  `beefree_add_image`, `beefree_add_icon`, `beefree_add_button`, `beefree_add_social`,
  `beefree_add_menu`, `beefree_add_spacer`, `beefree_add_divider`, `beefree_add_table` — "each with
  corresponding update tools"
- Validation/QA (Checker): `beefree_check_template`, `beefree_check_section` — checks accessibility,
  missing alt text, colour contrast, broken links, "other best practice violations"
- External: `beefree_search_stock_images` (Pexels API)
- Selection context: the `onSelectElement` callback fires with `{type: "module"|"row", uuid}` and
  the docs say that is "meant to be forwarded to your AI Agent" so it can act on what the user
  currently has selected.

Their stated architecture, verbatim: the MCP server "acts as the 'Hands' and 'Manual'", the AI agent
"acts as the 'Brain': it knows what the user wants and which tools to call."

**Two findings that matter more than the tool list:**

1. **The industry answer is ONE agent with a wide flat toolbelt, not N specialist agents.** The
   specialization lives in the TOOLS, not in separate models. That independently confirms the
   operator's own 07/30 correction — the orchestrator does not need to know how to build a chart or
   place a photo, only what fits and what the message is.
2. **There is NO data tool anywhere in that surface.** No CSV, no spreadsheet, no figure binding, no
   chart. `beefree_add_table` is a layout table; images come from Pexels stock. The most advanced
   agentic email builder shipping today has zero provenance surface. Nothing in it can say where a
   number came from, because nothing in it handles numbers.

## 2. beehiiv — per-section AI blocks already ship, scoped to copy only

Source: https://www.beehiiv.com/features/artificial-intelligence (fetched 07/30/2026). Their stated
flow, verbatim steps: "Add an AI block to your newsletter" → "Insert an AI block and enter a prompt
describing the content you want to generate" → "Define structure and intent" → generate → refine →
publish. Capabilities listed: Writing Assistant, Spell Check, Smart Editor (simplify/shorten/extend),
Change Tone, Translate, Create Images. They also ship a beehiiv MCP, pitched at audience data for
strategy, not at composing the issue.

So **the per-section-agent idea is not novel — it is live** — but it is a copy assistant per block.
No figures, no chart, no cross-section coherence, no provenance. Confirms the shape has product
validation, and confirms where the ceiling is.

## 3. Stripo — copy-level AI, plus a brand kit

Source: https://stripo.email/ (fetched 07/30/2026). AI Email Assistant, AI subject-line generator,
an "AI-powered" template category, brand-kit generator. Same tier as beehiiv: writing help inside an
editor. No data lane found.

## 4. Gamma — the closest structural analog, and the real competitive threat

Source: https://gamma.app/docs (fetched 07/30/2026; the root domain sits behind a Cloudflare
challenge that crawl4ai does not clear — use the docs path). Verbatim: Gamma "turns a prompt, an
outline, or a file you already have into polished presentations, fully responsive websites, beautiful
documents, on-brand graphics, and engaging social media content"; "over 100 million people use it to
turn a prompt, an outline, or an existing document into full presentations, with copy, layout,
images, and charts already in place." Import existing content, import your brand or use 100+ themes,
per-element AI editing, export to PowerPoint/PDF/Google Slides, 60+ languages.

**They already do file → designed artifact with charts.** They are not in email, and nothing in
their material claims a number traces back to a source cell. That is the gap, and it is a narrow one
— narrow enough that it is the thing to build first, not later.

## 4b. HOW GAMMA ACTUALLY DOES IT — verbatim from their API contract (07/30/2026)

Operator: "we found gamma a while ago / how do they do it?" Our prior pass
(`docs/superpowers/plans/2026-07-08-ai-design-and-email-marketing-hacks-sweep.md`, crawled
07/08/2026) was marketing-level only — features, 100+ themes, export formats, "50+ million users."
The mechanics are in their developer docs, which they publish machine-readable at
**https://developers.gamma.app/llms-full.txt** (272 KB, 4,463 lines — fetched 07/30/2026, includes
the full OpenAPI schema inline). Every claim below is from that file.

**One text field in, whole artifact out.** `POST /v1.0/generations`, async, poll
`GET /v1.0/generations/{id}` every 5s. `inputText` max 400,000 chars (~100k token limit, "may be
lower... if your use case requires extra reasoning"). Their guidance: input can be "as little as a
few words that describe the topic" or "pages of messy notes or highly structured, detailed text."
NO per-section API, no per-block tool, no agent-per-card. One string.

**`textMode` enum — `condense` | `generate` | `preserve`.** This is the "say exactly what they say"
requirement shipped as one parameter. Verbatim on preserve: "Gamma will retain the exact text in
`inputText`, sometimes structuring it where it makes sense to do so, eg, adding headings to sections.
(If you do not want any modifications at all, you can specify this in the `additionalInstructions`
parameter.)" And: "When using `textMode: \"preserve\"`, text generation options like `amount`, `tone`,
and `audience` are ignored since your original text is being preserved."

**Content ⟂ design, totally.** `themeId` (from `GET /v1.0/themes`) carries colors, fonts, logo;
generated content is theme-blind. The design is APPLIED, not generated. Biggest copyable lesson.

**Sectioning is a delimiter.** `cardSplit: auto | inputTextBreaks`; `inputTextBreaks` means literal
`\n---\n` in the text. `numCards` 1–75 (plan-dependent).

**`pages[]` IS the orchestrator artifact — first-class, up to 50 pages.** Each entry takes its own
`inputText` (required), `textMode`, `format`, `numCards`, `title`, `path`, `additionalInstructions`,
`textOptions`, `imageOptions`; file-level options (theme, sharing, folders, card dimensions, export,
publish) apply across all. So composition is decided ABOVE the generator and handed down as data —
the brief-then-generate shape, exposed as a parameter.

**`additionalInstructions` is a SEPARATE 5,000-char field** distinct from content. Steering lives
apart from material. (We fold everything into one prompt today.)

**Images need no agent.** `imageOptions.source` enum: `aiGenerated`, `giphy`, `noImages`, `pexels`,
`pictographic`, `placeholder`, `themeAccent`, `webAllImages`, `webFreeToUse`,
`webFreeToUseCommercially`. `imageOptions.model` exposes 40+ named models (dall-e-3, flux-1/2 family,
flux-kontext, gemini-2.5/3/3.1 image, gpt-image-1/2, ideogram-v3, imagen-3/4, leonardo, luma photon/
ray, recraft-v3/v4, veo-3.1). User images: paste URLs inline in `inputText` at the desired position,
set `source: noImages` to suppress generated ones.

**Other surface:** `format` = document|presentation|social|webpage · `textOptions.amount` =
brief|medium|detailed|extensive · 60+ language codes · `cardOptions.dimensions` (16x9, 1x1, 4x5,
9x16, a4, letter, fluid, pageless) · 6-position `headerFooter` · `exportAs` pdf|pptx|png ·
`sharingOptions` · per-card engagement analytics. Credits: 1–3/card ("varies by the text generation
model Gamma selects internally"), images 2–15 standard / 20–33 advanced / 34–75 premium / 30–125
ultra. Their example: 20-card doc + 15 premium images ≈ 320–1,070 credits. API keys need Pro/Ultra/
Teams/Business; the ChatGPT + Claude connectors work on all plans (Gamma MCP, OAuth + Dynamic Client
Registration).

### THE CHART FINDING — their charts are PROMPTED, not bound (verbatim)

From `/guides/charts-and-structured-content`:

- "Generation is non-deterministic — results may vary across runs, even with identical inputs."
- "There are no API parameters to directly control chart type, styling, or data formatting, but you
  can steer the output through your prompts."
- "Charts are prompted through `inputText` and `additionalInstructions`, not through dedicated API
  parameters."
- "Test a few runs. Since output varies, run a few generations to see the range and refine your
  prompts accordingly."
- "**Keep data labels unambiguous. Labels that resemble numeric values (e.g. `$100` as a category
  name) may be interpreted as data.**"
- Their own remedy for consistency: build a template by hand, then use
  `POST /generations/from-template`.

So a language model reads the numbers out of prose and draws what it thinks it saw; a category label
can be consumed as a value; two identical runs can differ. Correct tradeoff for a general-purpose
deck tool, and a documented, load-bearing weakness.

**Our position, by contrast (RULE 0.5 anchors, already recorded below):** `pickFramesForData` selects
the chart type from DATA SHAPE against a ladder verified 1:1 vs Atlassian + FT Visual Vocabulary;
`bindFrameSpec` binds values deterministically, stamps `asOf`, carries `source.citation` verbatim, and
returns null rather than guessing. No LLM touches a number.

**One-line wedge: Gamma prompts charts. We bind them.**

### What to steal / what to skip

STEAL: `preserve`/`improve`/`condense` as a VISIBLE user mode, not a buried prompt · steering field
separated from content · themes as listable first-class objects · delimiter-based card split (dumbest
thing that works) · `pages[]` as the brief handed down · `noImages` + inline user image URLs ·
template-based generation as the answer to "make it come out the same every time" (which is the
operator's own save-the-structure instinct, vendor-confirmed).

SKIP (RULE 11 — not our volume): 40+ image models, 60+ languages, 50-page microsites, per-viewer
engagement analytics.

## 5. Datawrapper — the craft benchmark for charts, no document layer

Source: https://www.datawrapper.de/ (fetched 07/30/2026). "Design and publish high-quality data
visualizations with a single, powerful web app"; brandable themes. Data in → excellent chart out. No
writing, no document, no send.

---

## Market map (the actual conclusion)

- Email builders' AI = copy assistants. No data lane at all.
- Deck builders (Gamma) = file → designed artifact WITH charts. Not email, no provenance.
- Chart tools (Datawrapper, Flourish) = data → beautiful chart. No document, no writing, no send.

The unoccupied square is **a user's own file → a designed EMAIL where every number traces to their
cell and their prose is rewritten better in their voice**. Nobody scanned occupies it.

## What we already hold (RULE 0.5 code anchors, plus two prior research files)

- **The no-invention harness is already source-agnostic.** `authorSystem()` +
  `buildFigureMenu`/`renderFigureMenu` (`lib/email/author-doc.ts`) render an id-addressable DATA MENU;
  the model selects `[fN]` and the SYSTEM writes the value and that figure's own label. Today
  `fetchLakeParts()` fills the menu. A parsed upload filling it instead changes nothing downstream.
- **The chart engine is already deterministic and shape-keyed, not lake-keyed.** Per
  `_RESEARCH/deliverable-and-design/2026-07-01-taskC-charttype-verification.md`:
  `pickFramesForData` (`components/charts/registry/pick-frames.ts:74`) is a 5-priority
  data-shape → chart-type ladder verified 1:1 against Atlassian's chart-type guide and the FT Visual
  Vocabulary (date+numeric → line/area; 2+ numeric → scatter; percents ~1.0 → part-to-whole;
  single numeric → single value; 1 numeric per category → bar). `bindFrameSpec` pulls values, stamps
  `asOf`, carries `source.citation` verbatim, and returns null when it can't bind — no LLM touches a
  number. Known blocker recorded there: `registry.ts` imports React frame components as values, so
  the ladder transitively bundles React and can't be called server-side until `{fixtureOnly, accepts,
  label}` is extracted to a pure `frame-meta.ts`.
- **"Make it look good" is a schema problem, already researched.** Per
  `_RESEARCH/deliverable-and-design/2026-07-01-ai-deliverable-design-quality-research.md`: closed
  design-token enums instead of freeform style props, a fixed type scale, 8pt spacing with
  internal ≤ external, plus a deterministic post-generation validator. Beefree arrives at the same
  answer from the other direction by shipping `beefree_check_template`/`beefree_check_section` as
  agent-callable tools. Two independent sources, one conclusion: **the quality comes from a checker,
  not from a smarter writer.**

## THE UPLOAD LANE IS ALREADY BUILT AND PROVEN — TEXT ONLY (added 07/30/2026, four-lane sweep)

Found on the CODE + CATALOG lanes after the vendor scan; changes the verdict from "we could" to
"one lane already ships."

- `scripts/prove-upload-chart.mts` proves the UPLOAD-SCAN lane live. Its header states the contract:
  the composer scans the user's uploaded document for a needed figure BEFORE going to the web;
  `composeChartFromRequest(question, origin, { uploadsText })` charts the figure the model read from
  the document, "verified verbatim against the upload bytes (the moat)", footnoted "From your
  upload", exposing `composed.chart.options.uploadSources`. Proof also asserts no web search was
  needed and no deflection/leak in the spoken answer.
- Supporting surface, all present: `components/project/UploadDrop.tsx` (drag-and-drop UI),
  `lib/project/uploads-text.ts`, `lib/pdf/extract.ts`, `app/api/projects/[id]/extract-pdf/route.ts`,
  `lib/assistant/compose-chart.ts`.
- **The gap, exactly:** `package.json` contains NO `xlsx`, NO `papaparse`, NO `csv-parse`, NO
  `exceljs`. The upload lane is TEXT — a PDF is extracted to prose and a model reads a figure out of
  a sentence. A broker memo works; a spreadsheet has no parser at all. Tabular parse into the same
  figure shape the DATA MENU and `bindFrameSpec` already consume is the one missing feeder.
- **Catalog lane:** `docs/standards/data-roots.md` has NO root for user uploads — every concept in
  it is a lake concept. If uploads become the product, that root has to be added. The same doc
  records **72 proven-but-never-pulled ceilings** (07/22/2026) — LeePA layer 23's 108,881 rows with
  beds/baths/year-built, FDOT's 1,586 public layers where we read one, FRED county series, FEMA's
  real NFIP rates vs our static 0.3 guess. Relevant to "we'd drop a lot of the data we have": much
  of the lake was never wired to a consumer, so the pivot costs less than it appears to.

## Open, not answered by this scan

- File → cited figures is the un-scanned engineering: CSV/XLSX/PDF parse quality, and what a
  provenance string looks like when the source is a user's messy spreadsheet.
- Whether a separate voice/prose model earns its cost next to the orchestrator, or is just a
  different prompt on the same call. Not measured.
- Legal/positioning consequence of rendering a user's wrong number faithfully. The claim moves from
  "true" to "faithful to your source" and that has to be designed in, not bolted on.
