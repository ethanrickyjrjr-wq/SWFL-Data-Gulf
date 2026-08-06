/**
 * THE AGENT BRAND INTRO EMAIL, BUILT AGAINST THE REAL ACCOUNT — the §2.8 acceptance run.
 *
 *   bun --env-file=.env.local scripts/email/render-agent-brand-intro.mts ["<farm area>"]
 *   bun --env-file=.env.local scripts/email/render-agent-brand-intro.mts            (default: Fort Myers)
 *
 * Drives the REAL pipe — `buildAgentBrandIntro` → `applyBrand` → `renderEmailDocHtml` — off
 * the SAME `ethanrickyjrjr@gmail.com` account the other lifecycle acceptance scripts use
 * (`_harness.mts`'s `DEMO_BRAND_USER_ID` default). That account already carries a FULL brand
 * profile from the 08/05 Coming Soon walk — Marisa Delgado, Broker Associate · Fort Myers &
 * Estero, real bio/license/socials, and a real trimmed-transparent headshot in
 * `email-media/showcase-agents/marisa-delgado.png`. This script does NOT fill the brand; it
 * proves the recipe carries what's already there.
 *
 * NO ANCHOR LISTING IS NAMED ON PURPOSE. `agent-brand-intro`'s own header is explicit: we hold
 * no agent↔listing link (`listing_state.brokerage` is 100% null), so substituting a real house
 * as "Marisa's newest listing" would put a stranger's home under a fictional agent's name —
 * worse than the open slot. The anchor block stays open; that is the correct, honest render.
 *
 * FARM AREA: Fort Myers by default — one of the two cities her own bio already claims
 * ("between Fort Myers and Estero"). `resolveFarmArea`'s declared-span reader stops at "and",
 * so a two-city farm cue is not a shape this recipe resolves; one city is the honest input.
 */
import { buildAgentBrandIntro } from "../../lib/deliverable/recipes/agent-brand-intro";
import { createBlock, defaultDoc } from "../../lib/email/doc/default-docs";
import { applyBrand } from "../../lib/email/brand/apply-brand";
import type { RecipeBuildContext } from "../../lib/deliverable/recipes/index";
import {
  captureNarratorDrops,
  loadAccountBrand,
  printBottom,
  printBrandCarry,
  printProvenance,
  renderAndSave,
  reportAssertions,
  type Assertion,
  type ProvenanceRow,
} from "./_harness.mts";

const FARM_AREA = process.argv[2] ?? "Fort Myers";
const PROMPT =
  `Build an agent-introduction email for my farm area ${FARM_AREA} — a ZIP-by-ZIP asking-price ` +
  `chart from live listings, my name and headshot up front.`;

console.log(`\n  PROMPT: ${PROMPT}\n`);

// ── THE BRAND, OFF THE REAL ACCOUNT ──────────────────────────────────────────
const { brand: BRAND, profile: p } = await loadAccountBrand();
const narratorLog = captureNarratorDrops();

// THE CANVAS ARRIVES ALREADY BRANDED — and, for THIS recipe specifically, that must include an
// `agent-card` block BEFORE the build runs. `brandHeadshot`/`brandAgentName` (agent-brand-intro.ts)
// read the account's photo/name off `currentDoc` DURING the build, and `applyBrand` only ever
// overlays an EXISTING block's props — it never creates one. `skeleton-clean-white` (the doc
// `defaultDoc()` returns) carries no agent-card, so without seeding one here the up-front
// headshot and the "Meet your agent — <Name>" hero would both render as open slots even though
// the account is fully profiled — exactly what a real Email Lab canvas avoids because the UI's
// own "apply brand" action already stamps an agent-card before any recipe build runs.
const canvasWithAgentCard = {
  ...defaultDoc(),
  blocks: [...defaultDoc().blocks, createBlock("agent-card")],
};
const built = await buildAgentBrandIntro({
  prompt: PROMPT,
  currentDoc: applyBrand(canvasWithAgentCard, BRAND),
  facts: null,
  resolved: false,
  zip: undefined,
  voice: undefined,
} as RecipeBuildContext);

if (!built) {
  console.error("  buildAgentBrandIntro returned null — no doc to send.");
  process.exit(1);
}
const doc = applyBrand(built, BRAND);

// ── THE PROVENANCE TABLE ──────────────────────────────────────────────────────
const strings: string[] = [];
(function walk(v: unknown) {
  if (typeof v === "string") strings.push(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === "object") Object.values(v).forEach(walk);
})(doc.blocks);

// NO "Meet your agent" hero block anymore (08/06/2026 reorder: intro opens the email,
// the agent-card — name/photo/phone — closes it, same as every other lifecycle email).
// The farm area now surfaces first in the chart's own title, and the agent's name lives
// on the agent-card at the bottom of the doc.
const chartBlock = doc.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
const agentCardBlock = doc.blocks.find((b) => b.type === "agent-card");
const anchorHeroBlock = doc.blocks.find(
  (b) => b.type === "hero" && b.props.kicker === "My newest listing",
);
const areaRead = strings.find((s) => s.length > 80 && s.includes("Asking prices run from"));

const rows: ProvenanceRow[] = [
  [
    "Farm area (chart title)",
    chartBlock?.props.alt as string | undefined,
    "declared span → crosswalk (ZIP set)",
  ],
  [
    "Agent name (agent card, bottom)",
    agentCardBlock?.props.name as string | undefined,
    "brand profile, sticky",
  ],
  [
    "Chart",
    chartBlock?.props.url ? "rendered" : undefined,
    "live asking price per ZIP, data_lake.listing_active_stats",
  ],
  [
    "Chart read (paragraph)",
    areaRead ? `${areaRead.length} chars` : undefined,
    "claim-gated, code-computed facts only",
  ],
  [
    "Anchor listing",
    anchorHeroBlock ? String(anchorHeroBlock.props.value ?? "") : undefined,
    "NOT NAMED — open slot by design (no agent↔listing link)",
  ],
];
printProvenance(rows);
if (narratorLog.length) console.log(`\n  NARRATOR DROPPED: ${narratorLog.join(" | ")}`);

printBottom(doc);
printBrandCarry(p);

const { html } = await renderAndSave(doc, "agent-brand-intro-email.html");

// ── ASSERTIONS, AGAINST THE RENDERED BYTES ────────────────────────────────────
const HOUSE_PLACEHOLDER_BIO = "A short bio that builds trust with your readers.";
const bioSnippet = String(p.agent_bio ?? "").slice(0, 40);
// THE CITY-SENSITIVE TEXT ONLY — the chart title/alt and the CTA label (no hero anymore,
// 08/06/2026 reorder). Not the whole HTML: the agent's own bio legitimately names other
// cities she serves ("between Fort Myers and Estero" is Marisa's real authored text), and
// that is not the wrong-city bug this recipe's header describes — that bug was the
// CHART/CTA silently disagreeing with the agent's declared farm area.
const citySensitiveText = [
  chartBlock?.props.alt,
  doc.blocks.find((b) => b.type === "button")?.props.label,
]
  .filter((v): v is string => typeof v === "string")
  .join(" | ");
const swflCities = [
  "Cape Coral",
  "Fort Myers",
  "Naples",
  "Estero",
  "Bonita Springs",
  "Lehigh Acres",
];
const cityHits = swflCities
  .map((c) => [c, (citySensitiveText.match(new RegExp(c, "g")) ?? []).length] as const)
  .filter(([, n]) => n > 0);

const checks: Assertion[] = [
  {
    name: "real bio ships",
    pass: html.includes(bioSnippet) && !html.includes(HOUSE_PLACEHOLDER_BIO),
    detail: html.includes(HOUSE_PLACEHOLDER_BIO)
      ? "HOUSE INSTRUCTION TEXT LEAKED into the sent email"
      : html.includes(bioSnippet)
        ? "the account's real agent_bio is in the rendered HTML"
        : "neither the real bio nor the placeholder is present",
  },
  {
    name: "real headshot ships",
    pass: Boolean(p.photo_url) && html.includes(String(p.photo_url)),
    detail: p.photo_url ? `${String(p.photo_url).slice(0, 60)}…` : "no photo_url on the account",
  },
  {
    name: "agent name ships",
    pass: Boolean(p.agent_name) && html.includes(String(p.agent_name)),
    detail: String(p.agent_name ?? "(none)"),
  },
  {
    name: "hero/chart/CTA agree with the declared farm area",
    pass: cityHits.length > 0 && cityHits.every(([c]) => c === FARM_AREA),
    detail:
      cityHits.map(([c, n]) => `${c}×${n}`).join(", ") || "no SWFL city text in the hero/chart/CTA",
  },
  {
    name: "no empty image src shipped",
    pass: !/src=["']["']/.test(html),
    detail: /src=["']["']/.test(html) ? 'an <img> with src="" reached the sent HTML' : "clean",
  },
  {
    name: "under Gmail's ~102KB clip point",
    pass: Buffer.byteLength(html, "utf8") <= 102 * 1024,
    detail: `${Math.round(Buffer.byteLength(html, "utf8") / 1024)}KB`,
  },
];

reportAssertions("§2.8 AGENT BRAND INTRO — ACCEPTANCE", checks);
