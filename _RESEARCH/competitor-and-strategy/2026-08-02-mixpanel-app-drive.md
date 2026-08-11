# Mixpanel in-app drive — data intake, chart building, AI (08/02/2026)

Source: live Chrome drive of the operator's free-trial project
(`mixpanel.com/project/4049952`, "PatentPending", 0 events) plus the shared B2B/SaaS demo
project (`project/3409416`). All findings are from rendered app screens this session — this is
the drive the 08/02 industry scan couldn't do headless (Mixpanel was a JS-shell dead end there).
Provenance homepage: https://mixpanel.com

## 1. Data intake — the part they do unusually well

Three front doors, presented as one Set Up Guide (4 steps: Get Started → Connect Data →
Verify Connection → Explore Your Data):

1. **"Use your Coding Agent" (Beta) — the standout.** They hand you a one-line prompt +
   project token and a HOSTED SKILL FILE:
   `https://storage.googleapis.com/cdn-mxpnl-com/libs/mixpanel-skill/skill.md`
   Verbatim prompt shown in-app: "Set up Mixpanel tracking in this project. My project token
   is <token>. Use the Mixpanel setup skill: <skill url>." Supported agents named in-app:
   Claude Code, Cursor, ChatGPT Codex, Replit. The agent instruments YOUR codebase; you
   return to the guide's "Verify Connection" step which watches for the first live event.
   Intake = a skill.md + a token + a verify loop. No form-filling, no docs-reading.
2. **Quick Start** — guided SDK setup (labeled "Most Popular").
3. **"I already collect data in a tool"** — Segment (labeled Popular), BigQuery, Snowflake,
   RudderStack, Redshift, More Options, or raw HTTP APIs.

Other intake notes:
- Free plan: 1M monthly events. "Unlimited seats" for invites — "Invite an engineer" is a
  first-class onboarding card (delegate setup to whoever owns the codebase).
- **Mixpanel MCP** promoted on the home screen: connect Claude/ChatGPT/Gemini/Cursor/Notion,
  "ask product questions, create dashboards, explore Session Replays, update Lexicon." Enabled
  at Organization Settings level. They treat MCP as an intake AND consumption surface.

## 2. Data model + governance (Lexicon)

- Model: events + user profiles + group (Company) analytics. Virtual events ($session_start/
  $session_end) exist out of the box.
- **Lexicon** = one data dictionary page: Tracked Data (Events, Event Properties, Profile
  Properties), Saved Definitions (Cohorts, Custom Events, Custom Event/Profile Properties,
  Lookup Tables, Metrics, Behaviors), Data Governance (Data Drop and Deletion), Import
  Schema / Export.
- Each event row shows a **"30 day queries" count** — governance ranked by actual consumption.
- Corner widget: "Powered by Mixpanel AI — Everything looks clean — View Details" — an ongoing
  AI hygiene audit of the tracking schema (dupe detection etc.).

## 3. Chart building

One editor shell for everything; report types are tabs INSIDE the editor: **Insights, Funnels,
Flows, Retention**. Layout: right panel = query (Metrics / Filter / Breakdown, + Query/Chart/
Annotations tabs), top-left = date presets (Today/Yesterday/7D/30D/3M/6M/12M/Custom) + Exclude
+ Compare, top-right = granularity (Month…) + viz picker.

- **Chart types: exactly nine.** Line, Stacked Line, Column, Stacked Column, Bar, Stacked Bar,
  Pie, Table, Metric (big number) — plus Funnel Steps / Retention Curve locked to their report
  types. Deliberately small palette; the variety comes from the query, not the chart zoo.
- Metric definition: "Total Profiles" or "Aggregate Property" → aggregation over a property.
  Aggregations: Sum, Average, Median, Distinct Count, Percentile, Min, Max.
- Chart always ships with a synced data table underneath (per-period values + Average col).
- Formula metrics (combine metrics with math), time-comparison overlays (WoW/MoM/YoY),
  cohort/property breakdowns — all confirmed via agent self-description.
- Saved metrics go to a project **Metric Library** for reuse.
- Funnels empty state: "Select two funnel steps to get started" + links to Funnels Basics and
  Example Funnels Reports — education embedded at the point of emptiness.

## 4. Boards (dashboards)

- Boards interleave **narrative prose sections with chart cards** — the demo "SaaS Business
  KPIs" board reads like a memo with live charts in it (section headers, explanations of WHY
  each metric matters, numbered questions the charts answer).
- Board-level time range + filters apply across all cards ("Default" preset per board).
- **"Use this Board"** button on demo boards = template adoption onto your own data; the demo
  entry flow is "Select Sample Dataset" with 7 verticals (AI, B2B/SaaS, E-Commerce, Finance,
  Healthcare, Media, Social).
- Cards: big-number KPI, stacked composition, trend lines; click any card → full editor.
- Subscribe (email digests of a board), Share, favorites on every board.

## 5. AI ("Mixpanel Agent")

Sidebar-level chat surface with conversation history; also docks as a right-side panel that
persists across app pages. Suggestion chips: "What can you help me with?", "Generate a report
for me", "What should I look into today?" Shows its reasoning while thinking (leaked internal
tool name: `getBusinessContext`). Self-described capability list (captured verbatim in-app):

- Analytics: create Insights/Funnels/Retention/Flows charts, formula metrics, breakdowns,
  time comparisons.
- Boards: create multi-card dashboards WITH narrative text, edit them, summarize a board.
- Exploration: search events/properties/metrics/dashboards; **"analyze the current page"** —
  interpret the chart on screen, explain trends, flag anomalies; query saved board cards.
- Cohorts: create from natural-language trait/behavior descriptions.
- Session replays: filter/sort them, and SUMMARIZE what happened in a replay.
- Data governance: find duplicate events/properties in Lexicon, merge variants
  (add_to_cart / Add to Cart).
- Custom properties: create formula-derived properties.
- Metric library: save metrics for reuse.
- Product help grounded in their docs.
- **Business Context memory**: org- or project-level saved context (KPIs, terminology, goals)
  that persists across conversations.

Footer: "Mixpanel Agent can make mistakes. Please double check responses."
Demo project blocks the agent (redirects away) — it only runs on projects you own.

## 6. Other surfaces (observed, not driven)

- Discover: search across all saved artifacts; type filter enumerates the full object
  taxonomy: Boards, Insights, Funnels, Flows, Retention, Heatmaps, Heatmap Collections,
  Playlists, Metric Trees, **Automations**, **Impact**. Plus "Suggested Creators" (teammates
  whose boards you might follow).
- **Metric Tree (new)**: infinite dot-grid canvas; node palette = Metric (live value, "As of
  Now" selector), Strategy, Note, Text, Media; templates "KPI Tree" and "North Star
  Framework" each with a **"Build with AI"** button that scaffolds the tree.
- Session Replay: first-class sidebar item even on an empty trial project.
- Destinations: outbound export of cohorts/data to other tools.

## 7. What fits us (assessment, for the operator conversation)

1. **Skill-file intake is the steal of the day.** We already live in the Claude-agent world;
   publishing a hosted "connect your data to SWFL Data Gulf" skill.md + a per-user token +
   a verify-first-event loop is exactly shaped for our user-data→email pipe (08/02 scratchpad
   thread). The intake product is a markdown file, not a UI.
2. **Verify Connection as a step, not a hope** — the guide sits and waits for the first real
   event and won't call setup done until it lands. Same philosophy as our checks ledger,
   applied to customer onboarding.
3. **Boards = narrative + charts** is our deliverable model validated: their best demo board
   is literally prose sections explaining stakes, with live charts interleaved — what our
   email/PDF deliverables already do. Their "Use this Board" template-adoption button maps to
   our skeleton/recipe registry.
4. **Small chart palette, rich query** — nine chart types total. Vindicates our bar/table-first
   stance (FOCUS rule 4); nobody misses the chart zoo.
5. **Agent patterns worth copying**: "analyze the current page" (context-aware, not blank-box),
   business-context memory at org level, agent-as-governance (dedupe/merge suggestions), and
   suggestion chips that are verbs ("Generate a report", "What should I look into today?").
6. **MCP as a product surface** — they market "use us from Claude/ChatGPT/Notion" on the home
   screen. We already have /api/mcp; the gap is packaging/promotion, not tech.
7. **Usage-ranked governance** ("30 day queries" per event) — cheap, honest signal we could
   put on /ops for roots/brains: which concepts are actually consumed.

## 8. The skill.md itself (crawl4ai fetch, 08/02/2026) — how the intake skill is built

Fetched live: `https://storage.googleapis.com/cdn-mxpnl-com/libs/mixpanel-skill/skill.md`.
It is NOT a code template — frontmatter name `mixpanel-first-implementation`, and the body
opens with "CRITICAL — DO NOT WRITE ANY CODE YET. This skill is a guided conversation, not a
build template." Structure worth copying:

- **Four modes, asked first**: Quick Start (first events in one session), Full Implementation
  (8 phases: Discovery → Analytics Strategy → Project Setup → Data Model → Tracking Plan →
  Implementation → Identity → Governance), Add Tracking, Implementation Audit — with explicit
  mode-switching rules (e.g. Quick Start escalates to Full if consent/CDP complexity appears).
- **Five mandatory inputs before any code**: mode, platform (wrong SDK = full rewrite), CDP
  usage (Segment present → direct SDK install is WRONG), EU/California users (pre-consent
  events = compliance violation requiring deletion), and the customer's "Value Moment" (the
  one action that matters). "If you do not have explicit answers, ASK. Do not assume."
- Layered docs: skill.md is the conversation spine; SDK snippets and vertical event examples
  live in a separate `reference.md` read on demand; plus an `agents.md.template` resource.
- Verification is IN the skill: Quick Start's flow ends at "Live View verification" — same
  verify-first-event gate as the web UI.

This is our failure-modes-at-design-time rule (RULE 3.5) shipped as a customer-facing intake
product: the skill encodes every known way an implementation breaks and forces the questions
that prevent them, before code.

## Dead ends / limits this session

- Could not test the agent actually BUILDING a chart end-to-end: trial project has no events,
  and the shared demo project disables the agent. Re-test once any real events flow into the
  trial project.
- Heatmaps, Automations, Impact, Session Replay not driven (empty project); taxonomy captured
  only.
