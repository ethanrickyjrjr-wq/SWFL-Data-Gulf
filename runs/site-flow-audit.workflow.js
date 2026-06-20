export const meta = {
  name: "site-flow-audit",
  description:
    "Read-only audit of SWFL Data Gulf page connectivity, navigation flow, and create/post/email journeys + cited UX research, then synthesize a plan",
  phases: [
    { title: "Audit", detail: "parallel code-audit dimensions (read-only)" },
    {
      title: "Research",
      detail: "cited web research on data-site UX + self-serve marketing flows",
    },
    { title: "Synthesize", detail: "best answers + recommended sitemap + prioritized plan" },
  ],
};

// ---- Ground truth gathered inline before this workflow (do NOT re-derive; VERIFY + EXPAND) ----
const CONTEXT = `
REPO: brain-platform — Next.js App Router. Site live at https://www.swfldatagulf.com.
TASK FRAME (operator): audit page connectivity + navigation flow. READ-ONLY — DO NOT EDIT ANY FILE
("don't disturb any building, just report back"). PROBE FIRST (RULE 0.5): grep/glob/read the actual
code before asserting anything; graphify-out/graph.json exists if useful. Cite file:line for every claim.

ROUTE INVENTORY (app/**/page.tsx):
  / (home marketing)  /welcome  /demo  /ask  /charts  /map  /data-intel  /showcase
  /r  /r/[slug]  /r/search  /r/method/[metric]  /r/source/[table]  /r/cre-swfl/[corridor]  /r/zip-report/[zip]
  /project  /project/[id]  /p/[id]  /c/[id]  /d/[...slug]
  /claim  /login  /auth/auth-code-error  /billing  /contacts  /contacts/upload  /m/contacts/[token]
  /alerts  /alerts/[id]  /support  /privacy  /terms  /showcase
  /embed/charts  /embed/waitlist  /embed/cards/asking-rent  /embed/footer-token  /ops/data-inventory
LAYOUTS: app/layout.tsx (global; mounts GlobalNav + AppShell pill), app/project/layout.tsx (workspace shell with ProjectsRail).

NAV CHROME (already read):
  - components/nav/GlobalNav.tsx — the ONE global top bar, mounted in root layout, SELF-HIDDEN on
    "/", "/login", "/auth", "/embed/*", "/p/*". Tabs: Search→/r, Projects→/project, Charts→/charts.
    Account menu (logged in): My Projects→/project, Contacts→/contacts, Billing→/billing, Sign out.
    Logged out: "Log In" (modal) + "Get Access"→/#waitlist. NOTE: only 3 tabs; many pages absent.
  - components/landing/Header.tsx — fixed header rendered ONLY on home "/". Anchors #comparison/#install/#data,
    Log In modal, Get Access→#waitlist, "My Projects"→/project when logged in. Links to NO app surfaces.
  - components/landing/Footer.tsx — exists; verify WHERE it renders and what it links to.

LIVE CRAWL (crawl4ai, LOGGED-OUT, captured to runs/crawl-site-flow.json):
  - Home "/" rendered internal links: ONLY /privacy, /terms, and #anchors (+ /api/b/master fetch). It is an
    ISLAND — zero clickable path into /charts, /r, /welcome, /demo, /map, /ask, /data-intel, /showcase.
  - Every other PUBLIC page shows GlobalNav → can reach /r, /project, /charts only.
  - ORPHAN public pages (HTTP 200, exist, but in NO nav and reachable only by typing the URL or a stray in-page link):
    /map, /ask, /demo, /welcome, /data-intel, /showcase, /contacts (account-menu only), /claim, /alerts.
  - /showcase is the only page linking to /ask; /ask links to /r/master. AUTH-GATED 307→/login: /project, /alerts.
    /r/search → 307 (canonical search is /r).
`;

const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    area: { type: "string" },
    summary: {
      type: "string",
      description: "3-5 sentence plain-English verdict for this dimension",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string", description: "file:line or live URL/status proving it" },
          detail: { type: "string" },
        },
        required: ["title", "severity", "evidence", "detail"],
      },
    },
    orphan_pages: {
      type: "array",
      items: { type: "string" },
      description: "routes with no inbound nav/link (if relevant to this area)",
    },
    dead_links: {
      type: "array",
      items: { type: "string" },
      description: "links/buttons pointing to a nonexistent route or doing nothing",
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["area", "summary", "findings", "recommendations"],
};

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    topic: { type: "string" },
    summary: { type: "string" },
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          principle: { type: "string" },
          why: { type: "string" },
          source: { type: "string", description: "cited URL or named source" },
          apply_to_swfl: { type: "string", description: "how it maps onto this specific site" },
        },
        required: ["principle", "why", "source", "apply_to_swfl"],
      },
    },
    patterns: { type: "array", items: { type: "string" } },
  },
  required: ["topic", "summary", "insights"],
};

const SYNTH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string" },
    sitemap_recommendation: {
      type: "string",
      description:
        "the ideal nav/IA: what the primary nav should expose, and how home should funnel in",
    },
    top_problems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          problem: { type: "string" },
          impact: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["problem", "impact", "evidence"],
      },
    },
    ideal_flows: {
      type: "object",
      additionalProperties: false,
      properties: {
        get_around: { type: "string" },
        create: { type: "string" },
        post: { type: "string" },
        email: { type: "string" },
      },
      required: ["get_around", "create", "post", "email"],
    },
    plan: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phase: { type: "string" },
          change: { type: "string" },
          effort: { type: "string" },
          why: { type: "string" },
        },
        required: ["phase", "change", "effort", "why"],
      },
    },
  },
  required: ["verdict", "sitemap_recommendation", "top_problems", "ideal_flows", "plan"],
};

const READONLY = "STRICT READ-ONLY: do not edit, write, or create any file. Report only.";

const CODE_DIMENSIONS = [
  {
    key: "connectivity",
    label: "audit:connectivity-orphans",
    prompt: `You are auditing PAGE CONNECTIVITY for SWFL Data Gulf. ${READONLY}
${CONTEXT}
YOUR JOB: Build the real internal link graph from CODE and confirm/refute the orphan list above.
Steps: (1) enumerate every route under app/**/page.tsx (incl. dynamic). (2) grep ALL internal navigation across
app/** and components/**: \`Link href\`, \`<a href\`, \`router.push\`, \`redirect(\`, \`window.location\`, \`href:\` in config,
plus the nav chrome already named. (3) For each route, determine if ANY inbound link exists from persistent chrome
(GlobalNav/Header/Footer/ProjectsRail) or from another page's body. (4) Flag ORPHANS (no inbound link from chrome — only
reachable by typing the URL) and DEAD LINKS (point to a route that does not exist, or a button with no handler/href).
Cross-check against the live crawl reachability above. Give file:line evidence. Populate orphan_pages and dead_links precisely.`,
  },
  {
    key: "chrome",
    label: "audit:nav-chrome-coherence",
    prompt: `You are auditing NAVIGATION CHROME COHERENCE for SWFL Data Gulf. ${READONLY}
${CONTEXT}
YOUR JOB: Compare every persistent navigation surface and explain the incoherence a real user hits.
Read in full: components/nav/GlobalNav.tsx, components/landing/Header.tsx, components/landing/Footer.tsx, and the project
workspace chrome (app/project/layout.tsx + components under components/project/** or components/workspace/** — find them).
Answer: (a) What does each surface expose, logged-in vs logged-out? (b) Why is the home page an island (Header links to no
app surface)? Is that intentional (waitlist gate) or a gap? (c) Where do the two top bars (Header on /, GlobalNav elsewhere)
disagree — labels, destinations, missing tabs? (d) Is there any Footer on app pages, or only on home? (e) Does the
logged-in user ever get a coherent "home base"? Give file:line evidence and concrete inconsistencies.`,
  },
  {
    key: "create",
    label: "audit:create-journey",
    prompt: `You are auditing the CREATE journey (project + deliverable building) for SWFL Data Gulf. ${READONLY}
${CONTEXT}
YOUR JOB: Trace, in code, every way a user can START CREATING and whether the path is connected end-to-end.
Probe: app/welcome, app/claim, app/demo, app/project, app/project/[id], app/p/[id], and the workspace components
(ProjectWorkspace, ProjectsRail, BuildActions, ProjectSearch, DeliverableLanes — grep for them). Also the build APIs
(app/api/projects/[id]/build, swfl_project_build MCP). Map: entry point -> create project -> add data/items -> build
deliverable -> view (/p/[id]). Where are the SEAMS or DEAD-ENDS (e.g., can a logged-out visitor reach a "create"
affordance at all? is there a visible "New Project" button anywhere in chrome? does /welcome or /claim lead into the
workspace?). Reference the FINAL BOSS Piece 1/2 build state in SESSION_LOG/build-queue if relevant. file:line evidence.`,
  },
  {
    key: "post-email",
    label: "audit:post-and-email-journeys",
    prompt: `You are auditing the POST (social) and EMAIL journeys for SWFL Data Gulf. ${READONLY}
${CONTEXT}
YOUR JOB: Determine what a user can actually DO today to post to social and to send email, and how they'd reach it in the UI.
Probe: the social campaign builder (lib/social/**, SOCIAL BUILD/*, docs specs 2026-06-20-social-*), the email scheduler
(GO-LIVE/email-scheduler-*, lib/deliverable/*, email_schedules, app/api/.../email or digest), the contacts surface
(app/contacts, app/contacts/upload, app/m/contacts/[token]), and any "Emailing"/"Social" lane in the workspace.
Answer: (a) Is social posting LIVE or only planned (USER SIDE U1-U4)? (b) Is email sending live (digest cron / send)?
(c) From the running UI, how does a user navigate to post or email — is there any button/lane, or is it MCP-only / invisible?
(d) Dead-ends or missing entry points. file:line + spec evidence; distinguish SHIPPED vs PLANNED clearly.`,
  },
];

const RESEARCH_TOPICS = [
  {
    key: "attractive-data-sites",
    label: "research:what-makes-data-sites-attractive",
    prompt: `Research, with CITED sources, what makes DATA / market-intelligence websites attractive and sticky to users
(think: real-estate/market-data dashboards, civic-data explorers, analytics products). Cover: the "aha moment" / time-to-value,
instant-value-before-signup vs gated, search-first vs browse-first IA, data storytelling & visualization, trust/citation cues,
and what makes people return. Use WebSearch + WebFetch; cite real URLs. Then map each insight onto SWFL Data Gulf
(a SWFL Lee/Collier real-estate + flood + permits + economy intelligence site whose money path is: build a branded
marketing deliverable, then post/email it). Be concrete and opinionated.`,
  },
  {
    key: "nav-ia-best-practice",
    label: "research:nav-and-ia-best-practice",
    prompt: `Research, with CITED sources, current best practices for website NAVIGATION and INFORMATION ARCHITECTURE for a
product that is BOTH a marketing landing page AND a logged-in app (the "marketing site vs app are disconnected" problem).
Cover: how to connect a landing page to the app without hurting conversion, primary-nav item counts, persistent global nav,
breadcrumbs, the role of a footer sitemap, empty-vs-orphan pages, and signed-in vs signed-out nav. Cite NN/g, Baymard,
or equivalent. Map each onto SWFL Data Gulf where home is an island and the app nav exposes only 3 of ~12 public pages.`,
  },
  {
    key: "create-share-marketing",
    label: "research:self-serve-marketing-creation-flows",
    prompt: `Research, with CITED sources, what makes self-serve "create your own marketing" tools compelling and easy
(think Canva, Mailchimp, Beehiiv, Notion, Figma, social schedulers like Buffer/Hootsuite). Cover: onboarding & first-run,
template galleries, the create -> preview -> publish/share loop, connect-your-accounts (OAuth) UX, scheduling UX, and the
viral create->share->invite loop. Use WebSearch + WebFetch; cite real URLs. Map each onto SWFL Data Gulf, whose USER-side
flow is: pick a SWFL data topic -> build a branded single-visual/email deliverable -> connect socials -> schedule/post or
email to contacts. What would make that flow feel effortless and worth returning to?`,
  },
];

// ---------- Phase 1+2: audit dimensions + research, all independent -> barrier (synthesis needs all) ----------
phase("Audit");
log("Fanning out 4 read-only code-audit dimensions + 3 cited research lenses");

const auditThunks = CODE_DIMENSIONS.map(
  (d) => () =>
    agent(d.prompt, { label: d.label, phase: "Audit", schema: FINDINGS_SCHEMA }).then((r) => ({
      kind: "audit",
      key: d.key,
      data: r,
    })),
);
const researchThunks = RESEARCH_TOPICS.map(
  (t) => () =>
    agent(t.prompt, { label: t.label, phase: "Research", schema: RESEARCH_SCHEMA }).then((r) => ({
      kind: "research",
      key: t.key,
      data: r,
    })),
);

const all = (await parallel([...auditThunks, ...researchThunks])).filter(Boolean);
const audits = all.filter((x) => x.kind === "audit");
const research = all.filter((x) => x.kind === "research");
log(`Collected ${audits.length} audit dimensions + ${research.length} research lenses`);

// ---------- Phase 3: synthesis ----------
phase("Synthesize");
const synthPrompt = `You are the lead synthesizer. Below are structured findings from a read-only audit of SWFL Data Gulf's
page connectivity + navigation flow, plus cited UX research. Produce the BEST-ANSWERS report + a prioritized PLAN.
${READONLY} (this is a plan, not an implementation — propose, do not change code.)

Operator's actual questions to answer crisply:
  1. Are all pages connected correctly? Do buttons/links work? Do the ways around the site make sense?
  2. How SHOULD the site flow — what links should exist, how should a user easily get through: getting around,
     creating, posting, emailing?
  3. What do users find attractive about data sites + creating their own marketing — and how do we use that here?

Ground the plan in the evidence. Prioritize by impact/effort. Keep it concrete (name routes, nav items, components).
The biggest known problem: home "/" is an island and the global nav exposes only 3 of ~12 public pages.

AUDIT FINDINGS (JSON):
${JSON.stringify(audits, null, 1)}

RESEARCH FINDINGS (JSON):
${JSON.stringify(research, null, 1)}`;

const synth = await agent(synthPrompt, {
  label: "synthesize:report+plan",
  phase: "Synthesize",
  schema: SYNTH_SCHEMA,
  effort: "high",
});

return { audits, research, synth };
