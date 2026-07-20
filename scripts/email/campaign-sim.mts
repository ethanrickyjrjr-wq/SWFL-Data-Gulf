#!/usr/bin/env bun
// scripts/email/campaign-sim.mts
//
// THE LISTING LIFECYCLE CAMPAIGN SIMULATOR — teaser → sold, on one real house,
// through the real builder, into a real inbox.
//
// Design + failure modes: docs/superpowers/specs/2026-07-20-campaign-sim-design.md
// Check: campaign_sim_live_verify
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────────
//
// Seven lifecycle recipes each have unit tests. Nothing had ever driven all seven AS
// ONE CAMPAIGN, on ONE house, through the real send path. Every defect in the email
// failure catalog (docs/standards/emails.md §7) was found in an INBOX, not in a test:
// empty skeletons that returned `applied: true`, a brand overlay clobbering the
// authored address, a Gmail-expanded accordion, two near-identical consecutive sends.
// A green suite proves each recipe does what it was told. It does not prove a
// subscriber walking Coming Soon → Sold gets seven correct, coherent, sibling emails.
//
// KEEP THIS SCRIPT. When emails break again, this is the reproduction.
//
// ── THE THREE INVENTED INPUTS, AND NOTHING ELSE ──────────────────────────────────
//
//   1. THE DESCRIPTION — no vendor sells MLS remarks (SteadyAPI's 18 endpoints carry
//      none; realtor.com blocks the page). Lane 2 is the agent's own pasted text, so
//      the sim pastes one, exactly as an agent would into the build box.
//   2. THE PRICE CUT — a live active listing will not cut its price on command.
//   3. THE CLOSE — nor will it close on command.
//
// Everything else is REAL and found by the builders themselves: the house, its photo,
// its specs, its comps, county inventory, area DOM, ZIP figures, every chart.
//
// ── WHY THE FAKES ENTER AT THE DATA BOUNDARY, NOT AT THE BUILDER ─────────────────
//
// This script calls `authorDoc` — the same function the Lab's Build box fires. It does
// NOT call recipe builders directly, and that is deliberate: the layer that broke twice
// lives inside authorDoc (07/13 prompt-regex dispatch killed 15 of 17 recipes; 07/19
// subject resolution shipped empty skeletons with a 200). A program that bypassed it
// would prove nothing about the thing that was just fixed.
//
// So the fakes go in UNDER authorDoc, via `mock.module`, in this process only — two
// mocks, both CALL-THROUGH-THEN-PATCH so real data still does all the work:
//
//   • @/lib/listings/resolve-subject → the real resolver runs (real lake row, real
//     photo, real specs); the current stage's price cut is layered onto its result.
//   • @/lib/assistant/comp-helper → the real compsForAddress runs (it finds its own
//     comps, per the operator's ask); on the sold stage ONLY, the subject's own row is
//     patched to a recorded sale. just-sold.ts documents that the subject's own row in
//     its own nearby-sold set is the ONLY honest source of a close — so it is the only
//     place a simulated one can enter.
//
// ZERO production files change. No prod file gains a fake-data injection port.
//
// ── USAGE ────────────────────────────────────────────────────────────────────────
//
//   bun scripts/email/campaign-sim.mts                      # DRY RUN — build all 7, write HTML, send nothing
//   bun scripts/email/campaign-sim.mts --send               # build + SEND, 20 min apart, in order (~2 hr)
//   bun scripts/email/campaign-sim.mts --send --spacing 45  # slower cadence
//   bun scripts/email/campaign-sim.mts --send --now         # back to back — build check only, NOT a schedule test
//
// ONE SENDER AT A TIME. The run holds a PID lock and re-reads its state before every
// send; a second process on the same run is refused. See THE CONCURRENCY LOCK below —
// three concurrent senders is how the operator received "Under Contract" three times.
//   bun scripts/email/campaign-sim.mts --only price-reduced # one stage (debugging)
//   bun scripts/email/campaign-sim.mts --send --resume <runId>   # pick up where a dead run stopped
//
// Output + state: runs/campaign-sim/<runId>/ (gitignored)

import { mock } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  applyEventsToFacts,
  closeInForce,
  type CampaignEvent,
} from "@/lib/deliverable/campaign-sim/events";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { RenderComp, CompResult } from "@/lib/assistant/comp-helper";

// ════════════════════════════════════════════════════════════════════════════════
// CONFIG — the campaign
// ════════════════════════════════════════════════════════════════════════════════

/** A REAL active Lee County listing, verified in data_lake.listing_dom on 07/20/2026:
 *  3 bed / 2 bath, 1,978 sq ft, $659,000, single-family, photo present, DOM not floored.
 *  Swap this for any active Lee/Collier address — everything below follows it. */
const SUBJECT_ADDRESS = "8348 Southwindbay Cir, Fort Myers, FL 33908";
const SUBJECT_ZIP = "33908";

/** LANE 2 — the agent's own listing copy. This is the ONE piece of prose in the whole
 *  run, and it is the input an agent supplies in real use. Every sentence here is a
 *  claim ABOUT THE FICTIONAL SELLER'S HOME, not about the market; the narrator's job is
 *  to tighten it, never to upgrade it. Keep it >150 chars and >1 sentence or
 *  listingDescriptionFromPrompt correctly refuses to treat it as a description. */
const DESCRIPTION = [
  "Set on a quiet cul-de-sac in a gated community, this three-bedroom home opens to a",
  "vaulted great room with sliders that pocket fully into the wall. The kitchen was taken",
  "down to the studs in 2023 — quartz counters, an induction range, and a walk-in pantry",
  "that actually fits a second refrigerator. The primary suite sits on its own wing with a",
  "zero-entry shower and dual closets. Out back, a screened lanai runs the width of the",
  "house and looks over a preserve, so there are no rear neighbors. Tile roof replaced in",
  "2022, impact windows throughout, and the whole-house generator conveys.",
].join(" ");

/** THE SIMULATED EVENTS. `fromStage` is the 0-based STAGE INDEX at which the event is in
 *  force and stays in force. This is the entire fake-data surface of the program. */
const RUN_DAY = new Date().toISOString().slice(0, 10);
const JOURNAL: CampaignEvent[] = [
  { kind: "price-cut", fromStage: 4, cutUsd: 24_000 }, // $659,000 → $635,000
  { kind: "sold", fromStage: 6, closeUsd: 628_500, closedOn: RUN_DAY },
];

interface StageSpec {
  /** The RECIPE KEY — the identity authorDoc dispatches on. Never a prompt string. */
  key: string;
  label: string;
  /** The email subject line. Written here, in the runner — never by a model. */
  subject: string;
  /** Substrings that MUST appear in the rendered HTML, or the stage FAILS LOUD and
   *  nothing is sent. This is the guard against authorDoc's generic-author fallback
   *  quietly shipping a grab-bag email under a lifecycle ribbon (failure mode #1). */
  mustContain: string[];
  /** Substrings that must NOT appear. The teaser's whole point is withholding the
   *  street address; if it leaks, the recipe is broken and the send is wrong. */
  mustNotContain?: string[];
}

const STREET = SUBJECT_ADDRESS.split(",")[0]!.trim(); // "8348 Southwindbay Cir"

/** THE CAMPAIGN, in order. Index === the `fromStage` the journal refers to. */
const STAGES: StageSpec[] = [
  {
    key: "coming-soon",
    label: "Coming Soon (teaser)",
    subject: "Something is coming to Fort Myers",
    mustContain: ["Coming Soon"],
    // THE TEASER MUST NOT LEAK THE ADDRESS — not in the hero, not in alt text, not
    // in a link. This is the recipe's entire reason to exist.
    mustNotContain: [STREET, "Southwindbay"],
  },
  {
    key: "new-listing",
    label: "New Listing (launch)",
    subject: `Just listed — ${STREET}, Fort Myers`,
    mustContain: ["New Listing", STREET, "$659,000"],
  },
  {
    key: "open-house",
    label: "Open House (invitation)",
    subject: `Open house — ${STREET}`,
    mustContain: ["Open House", STREET],
  },
  {
    key: "market-comps",
    label: "Market Comps (the price case)",
    subject: `What homes near ${STREET} are actually priced at`,
    mustContain: ["Market Comps", STREET],
  },
  {
    key: "price-reduced",
    label: "Price Improved (fake cut lands here)",
    subject: `Price improved — ${STREET}`,
    // The three numbers that must check each other: previous − cut = current.
    mustContain: ["Price Improved", "Price cut", "$24,000", "$635,000", "$659,000"],
  },
  {
    key: "under-contract",
    label: "Under Contract",
    subject: `Under contract — ${STREET}`,
    mustContain: ["Under Contract", STREET],
  },
  {
    key: "just-sold",
    label: "Just Sold (fake close lands here)",
    subject: `Sold — ${STREET}`,
    mustContain: ["Just Sold", "$628,500"],
  },
];

/** FAILURE MODE #3 — a simulator that can email a real person is a liability. Anything
 *  not on this list exits before Resend is even constructed. */
const ALLOWED_RECIPIENTS = new Set([
  "hello@swfldatagulf.com",
  "ethanrickyjrjr@gmail.com", // operator inbox
]);

const UID = "37cc6c49-4759-4e07-9686-0a8dcce1f8ff"; // operator
/** FAILURE MODE #2 — simulated listings never mingle with real deliverables. Every doc
 *  this program saves lands in ONE dedicated project, and its instruction is SIM-tagged. */
const SIM_PROJECT_ID = "campaign-sim";
const SIM_PROJECT_TITLE = "Campaign simulator (fake events — not a real listing)";

// BASE_URL and the engine-owned URL roots are resolved in the ARGS section below —
// both depend on flag parsing, and BASE_URL must NOT read NEXT_PUBLIC_SITE_URL.

// ════════════════════════════════════════════════════════════════════════════════
// ARGS
// ════════════════════════════════════════════════════════════════════════════════

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const SEND = has("--send");
const NO_WAIT = has("--now");
/** DEFAULT SPACING — 20 minutes (operator, 07/20/2026: "don't have to rush the sends.
 *  give it time in between sends. Just make sure the builder is building and sending on
 *  a schedule.").
 *
 *  The old 4-minute default existed so a demo fit in one sitting, and that was the wrong
 *  thing to optimize: the point of this program is proving the builder BUILDS AND SENDS
 *  ON A SCHEDULE, not that it can empty a queue quickly. A rushed cadence also makes the
 *  campaign read as a burst rather than a sequence, which is exactly what a subscriber
 *  would never receive. Do not compress this back for convenience — pass --spacing
 *  deliberately, or --now when you are only checking that the builds are sound. */
const SPACING_MIN = Number(valueOf("--spacing") ?? 20);
const ONLY = valueOf("--only");
const RESUME_ID = valueOf("--resume");
const RESEND_SENT = has("--resend");
const TO = valueOf("--to") ?? "hello@swfldatagulf.com";

/** THE PRODUCTION SITE, always — deliberately NOT `NEXT_PUBLIC_SITE_URL`.
 *
 *  That env var is `http://localhost:3000` in .env.local, and reading it put a localhost
 *  "View this report online" link inside an email addressed to a real inbox (caught on
 *  this program's first run, 07/20/2026 — the same trap `tmp-rainbow-recipe-send.mts`
 *  carries). A sent email's links must resolve for the RECIPIENT, never for the machine
 *  that built it. Override deliberately with --base. */
const BASE_URL = (valueOf("--base") ?? "https://www.swfldatagulf.com").replace(/\/$/, "");

if (!ALLOWED_RECIPIENTS.has(TO)) {
  console.error(
    `[sim] REFUSED: "${TO}" is not an allowed recipient.\n` +
      `      This program sends SIMULATED listing events. It may only reach:\n` +
      [...ALLOWED_RECIPIENTS].map((r) => `        · ${r}`).join("\n"),
  );
  process.exit(1);
}
if (!Number.isFinite(SPACING_MIN) || SPACING_MIN < 0) {
  console.error(`[sim] --spacing must be a non-negative number of minutes`);
  process.exit(1);
}

// ════════════════════════════════════════════════════════════════════════════════
// RUN STATE (failure mode #4 duplicate sends, #8 process death mid-campaign)
// ════════════════════════════════════════════════════════════════════════════════

interface StageState {
  key: string;
  deliverableId: string | null;
  builtAt: string | null;
  sentAt: string | null;
  resendId: string | null;
  error: string | null;
}
interface RunState {
  runId: string;
  address: string;
  startedAt: string;
  send: boolean;
  stages: StageState[];
}

const RUNS_DIR = path.join(process.cwd(), "runs", "campaign-sim");
const runId = RESUME_ID ?? `${RUN_DAY}-${Date.now().toString(36)}`;
const runDir = path.join(RUNS_DIR, runId);
const statePath = path.join(runDir, "state.json");

function loadState(): RunState {
  if (RESUME_ID && fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState;
  }
  if (RESUME_ID) {
    console.error(`[sim] --resume ${RESUME_ID}: no state at ${statePath}`);
    process.exit(1);
  }
  return {
    runId,
    address: SUBJECT_ADDRESS,
    startedAt: new Date().toISOString(),
    send: SEND,
    stages: STAGES.map((s) => ({
      key: s.key,
      deliverableId: null,
      builtAt: null,
      sentAt: null,
      resendId: null,
      error: null,
    })),
  };
}

const state = loadState();
fs.mkdirSync(runDir, { recursive: true });
const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

// ════════════════════════════════════════════════════════════════════════════════
// THE CONCURRENCY LOCK — failure mode #4, second edition.
//
// ── THE INCIDENT THAT FORCED THIS (07/20/2026) ──────────────────────────────────
//
// The operator received "Under Contract" THREE TIMES. The deliverable rows proved it:
// market-comps built at 19:55:48 AND 19:55:49, price-reduced twice at 20:00:01,
// under-contract at 20:04:12 AND 20:04:13 — two processes in lockstep one second
// apart, plus a third "resume" started at 20:06. Stages 4-7 each sent 3x.
//
// Root cause: the agent harness reported two background runs as "killed"/"stopped",
// but the bun processes SURVIVED and kept sending on their original 4-minute cadence.
// A resume was then started on top of two live senders.
//
// The state file could not save us, because the original guard only defended the
// SEQUENTIAL case: each process loaded state into memory ONCE at startup and never
// looked at the disk again, so all three believed stages 4-7 were unsent. A
// duplicate-send guard that is only read at startup is not a guard against
// concurrency — it is a guard against re-running a FINISHED campaign.
//
// TWO defenses now, because the first can be defeated by a stale lock and the second
// cannot:
//   1. THIS LOCK — refuse to start while another LIVE process holds the run.
//   2. RE-READ BEFORE EVERY SEND (see runStage) — the real net. Even if a lock is
//      bypassed, forced or stale, a stage another process already sent is skipped.
// ════════════════════════════════════════════════════════════════════════════════

const lockPath = path.join(runDir, "LOCK.json");

/** Is `pid` a live process? `kill(pid, 0)` signals nothing and throws when it is not.
 *  An indeterminate answer counts as ALIVE — refusing to start is recoverable in
 *  seconds (delete the lock); double-sending a campaign to a real inbox is not. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

if (fs.existsSync(lockPath)) {
  try {
    const held = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as {
      pid: number;
      startedAt: string;
      heartbeat: string;
    };
    if (held.pid !== process.pid && pidAlive(held.pid)) {
      console.error(
        `[sim] REFUSED — run "${runId}" is already being sent by a LIVE process.\n` +
          `      pid ${held.pid} · started ${held.startedAt} · last heartbeat ${held.heartbeat}\n` +
          `      Two senders on one run is how the operator got "Under Contract" three\n` +
          `      times on 07/20/2026. If you are certain that process is dead, delete:\n` +
          `        ${path.relative(process.cwd(), lockPath)}`,
      );
      process.exit(1);
    }
    console.log(`[sim] took over a STALE lock from dead pid ${held.pid}`);
  } catch {
    /* unreadable lock → treat as stale and overwrite */
  }
}

const writeLock = () =>
  fs.writeFileSync(
    lockPath,
    JSON.stringify(
      { pid: process.pid, startedAt: state.startedAt, heartbeat: new Date().toISOString() },
      null,
      2,
    ),
  );
writeLock();
// Release on ANY exit path so a finished run never blocks the next one.
process.on("exit", () => {
  try {
    const held = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid: number };
    if (held.pid === process.pid) fs.unlinkSync(lockPath);
  } catch {
    /* nothing to release */
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// THE MOCKS — installed ONCE, before any product module is imported.
//
// Behavior is a pure function of `currentStage`; the mocks are never toggled or
// re-installed mid-run (failure mode #11 — a stage-5 cut leaking backwards onto the
// stage-2 teaser). The real implementations are captured into local consts FIRST, so
// the call-through can never recurse into the mock.
// ════════════════════════════════════════════════════════════════════════════════

let currentStage = 0;
/** The subject's REAL resolved facts, captured on first resolve — the comp mock needs
 *  the house's real specs to build an honest subject row for the close. */
let baseFacts: ListingFacts | null = null;

const resolveMod = { ...(await import("@/lib/listings/resolve-subject")) };
const realResolveSubjectListing = resolveMod.resolveSubjectListing;
const realCanonStreet = resolveMod.canonStreet;

mock.module("@/lib/listings/resolve-subject", () => ({
  ...resolveMod,
  resolveSubjectListing: async (address: string, deps?: unknown) => {
    const hit = await realResolveSubjectListing(
      address,
      deps as Parameters<typeof realResolveSubjectListing>[1],
    );
    if (!hit) return hit;
    if (!baseFacts) baseFacts = { ...hit };
    // The ONLY patch: the price cut in force at this stage. Photo, specs, lot, year,
    // DOM, community stats — all the real resolver's own values, untouched.
    return applyEventsToFacts(hit, JOURNAL, currentStage);
  },
}));

const compMod = { ...(await import("@/lib/assistant/comp-helper")) };
const realCompsForAddress = compMod.compsForAddress;

mock.module("@/lib/assistant/comp-helper", () => ({
  ...compMod,
  compsForAddress: async (address: string, deps?: unknown) => {
    // REAL COMPS. "Let it find its own comps" — this call is untouched, so every comp
    // in every chart and list is a real nearby property from the live feed.
    const res: CompResult = await realCompsForAddress(
      address,
      deps as Parameters<typeof realCompsForAddress>[1],
    );
    const close = closeInForce(JOURNAL, currentStage);
    if (!close) return res;

    // THE ONE PATCH: the subject's OWN row becomes a recorded sale. just-sold.ts reads
    // the close from exactly here (`subjectRow` → `closeFrom`, priceKind === "sold") and
    // from nowhere else — an AVM estimate or a last-list can never fill that cell. So
    // this is the single point where a simulated close can honestly enter the pipeline.
    const self = realCanonStreet(STREET);
    const sold = (row: RenderComp): RenderComp => ({
      ...row,
      status: "sold",
      priceKind: "sold" as RenderComp["priceKind"],
      price: close.price,
      priceDate: close.date,
      // Fill only what the real row lacks, from the subject's own resolved record.
      beds: row.beds ?? (baseFacts?.beds ? Number(baseFacts.beds) : null),
      baths: row.baths ?? (baseFacts?.baths ? Number(baseFacts.baths) : null),
      sqft: row.sqft ?? (baseFacts?.sqft ? Number(baseFacts.sqft) : null),
    });

    const idx = res.comps.findIndex((c) => realCanonStreet(c.addressLine) === self);
    if (idx >= 0) {
      const comps = [...res.comps];
      comps[idx] = sold(comps[idx]!);
      return { ...res, comps };
    }
    // The subject didn't come back in its own nearby set — insert it, with its real specs.
    const injected: RenderComp = sold({
      addressLine: STREET,
      city: baseFacts?.city ?? "Fort Myers",
      beds: null,
      baths: null,
      sqft: null,
      status: "sold",
      priceKind: "sold" as RenderComp["priceKind"],
      price: close.price,
      priceDate: close.date,
      soldInDays: null,
      sourceUrl: null,
    });
    return { ...res, comps: [injected, ...res.comps] };
  },
}));

// ── Product modules, imported AFTER the mocks are installed ──────────────────────
const { authorDoc } = await import("@/lib/email/build-doc");
const { seedById, defaultDoc } = await import("@/lib/email/doc/default-docs");
const { EmailDocSchema } = await import("@/lib/email/doc/schema");
const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
const { collectAllowedUrls, lintCompiledHtml } = await import("@/lib/deliverable/url-lint");
const { recordEmailSent } = await import("@/lib/email/usage");
const { RECIPES } = await import("@/lib/deliverable/recipes");
const { BRAND_FONTS } = await import("@/lib/brand/fonts");
const { applyBrand } = await import("@/lib/email/brand/apply-brand");
const { brandingToTokens } = await import("@/lib/email/brand/branding-to-tokens");
const { createServiceRoleClient } = await import("@/utils/supabase/service-role");

const db = createServiceRoleClient();

/** THE ACCOUNT BRAND, loaded once. See the overlay note in runStage for why this
 *  program had to grow a server-side brand step the product does in the browser. */
const { data: brandRow } = await db
  .from("user_brand_profiles")
  .select("*")
  .eq("user_id", UID)
  .maybeSingle();
const brandTokens = brandRow
  ? brandingToTokens(brandRow as unknown as Record<string, string>)
  : null;
console.log(
  brandTokens
    ? `[sim] brand loaded — ${Object.keys(brandTokens).length} tokens ` +
        `(address=${brandTokens.ADDRESS ? "yes" : "MISSING"} · logo=${brandTokens.LOGO_URL ? "yes" : "no"} ` +
        `· accent=${brandTokens.ACCENT ?? brandTokens.ACCENT_COLOR ?? "—"})`
    : `[sim] NO brand profile for this user — emails will render house defaults`,
);

/** ENGINE-OWNED URLS the compiled email legitimately links to but the DOC never names.
 *
 *  `email-head.ts` injects `<link href="<webfontUrl>">` for any doc using a family that
 *  declares one (3 of 6 BRAND_FONTS do). Those URLs are engine-owned constants in
 *  lib/brand/fonts.ts — never model-written — exactly like the view-online and
 *  unsubscribe links `url-lint` already allows by host. Read from the font root itself
 *  so a new family can never silently fall outside this list.
 *
 *  ⚠️ PRODUCTION DOES NOT ALLOW THEM, AND THAT IS A LIVE BUG THIS SIMULATOR FOUND on its
 *  first run (check `blast_url_lint_rejects_webfont_link`, opened 07/20/2026): url-lint's
 *  PLATFORM_HOSTS holds only the swfldatagulf.com pair, so the blast route hard-422s
 *  `url_violation` on any real user's webfont doc. Patching a security gate on a live
 *  send route is ask-first (RULE 1), so the sim does NOT change it — it passes the engine
 *  URLs explicitly here and leaves the defect standing in the ledger where it belongs. */
const ENGINE_OWNED_URLS = Object.values(BRAND_FONTS)
  .map((f) => f.webfontUrl)
  .filter((u): u is string => Boolean(u));

// ════════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════════

/** The build-box text for a stage: the registry's own seed prompt with the [[blank]]
 *  filled, then the agent's description on its own paragraph.
 *
 *  The shape matters. `listingDescriptionFromPrompt` strips the leading instruction
 *  line — its INSTRUCTION_LINE regex anchors at string start and matches a first line
 *  beginning build/write/create/make/draft — and treats the remainder as lane-2 copy.
 *  So the recipe prompt must be the FIRST line and the description must follow it.
 *  Every lifecycle prompt in the registry starts with "Build". */
function promptFor(key: string): string {
  const recipe = RECIPES[key as keyof typeof RECIPES];
  if (!recipe) throw new Error(`no recipe for key "${key}"`);
  const filled = recipe.prompt.replace(/\[\[[^\]]*\]\]/g, SUBJECT_ADDRESS);
  return `${filled}\n\n${DESCRIPTION}`;
}

/** Strip tags so a "must contain" check reads what a HUMAN sees, not markup. Kept
 *  alongside the raw check: the teaser's address ban must hold in href/alt too. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ");
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Per-recipient unsubscribe + view-online footer — verbatim blast-route shape. */
function withFooter(html: string, webUrl: string, unsubUrl: string): string {
  const footer =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">` +
    `<tr><td style="padding:20px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#8a8a8a">` +
    `<a href="${escAttr(webUrl)}" style="color:#8a8a8a">View this report online</a> &middot; ` +
    `<a href="${escAttr(unsubUrl)}" style="color:#8a8a8a">Unsubscribe</a><br>` +
    `SWFL Data Gulf &middot; Fort Myers, FL` +
    `</td></tr></table>`;
  return html.includes("</body>") ? html.replace("</body>", `${footer}</body>`) : html + footer;
}

async function ensureSimProject(): Promise<void> {
  const { data } = await db.from("projects").select("id").eq("id", SIM_PROJECT_ID).maybeSingle();
  if (data) return;
  const { error } = await db.from("projects").insert({
    id: SIM_PROJECT_ID,
    user_id: UID,
    title: SIM_PROJECT_TITLE,
    kind: "listing",
    subject_address: SUBJECT_ADDRESS,
  });
  if (error) {
    console.error(`[sim] could not create the sim project: ${error.message}`);
    process.exit(1);
  }
  console.log(`[sim] created sim project "${SIM_PROJECT_ID}"`);
}

async function contactIdFor(email: string): Promise<string> {
  const { data: existing } = await db
    .from("contacts")
    .select("id")
    .eq("user_id", UID)
    .eq("email", email)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await db
    .from("contacts")
    .insert({ user_id: UID, email, name: "SWFL Data Gulf" })
    .select("id")
    .single();
  if (error || !created) throw new Error(`contact insert failed: ${error?.message}`);
  return created.id;
}

// ════════════════════════════════════════════════════════════════════════════════
// ONE STAGE
// ════════════════════════════════════════════════════════════════════════════════

/** "sent" | "built" (dry run) | "skipped" (already sent on an earlier run).
 *  The caller waits only after real work — see the loop's own note. */
type StageOutcome = "sent" | "built" | "skipped";

async function runStage(index: number): Promise<StageOutcome> {
  const stage = STAGES[index]!;
  const st = state.stages[index]!;
  currentStage = index; // ← the ONLY thing that drives the mocks
  writeLock(); // heartbeat — proves to any other process that this run is live

  const n = `${index + 1}/${STAGES.length}`;
  console.log(`\n${"─".repeat(72)}`);
  console.log(`[${n}] ${stage.label}  ·  recipe=${stage.key}`);
  console.log("─".repeat(72));

  if (st.sentAt && !RESEND_SENT) {
    console.log(`[${n}] already sent ${st.sentAt} — skipping (pass --resend to force)`);
    return "skipped";
  }

  // ── BUILD — the real product call. Same one the Lab's Build box fires. ──────────
  const prompt = promptFor(stage.key);
  const seed = seedById("skeleton-clean-white")?.build() ?? defaultDoc();

  const { httpStatus, payload } = await authorDoc({
    prompt,
    rawDoc: seed,
    recipeKey: stage.key,
    scope: { kind: "zip", value: SUBJECT_ZIP, address: SUBJECT_ADDRESS },
  });

  if (httpStatus || payload.applied !== true) {
    throw new Error(
      `[${n}] BUILD MISS — authorDoc returned status=${httpStatus} applied=${payload.applied} ` +
        `message=${JSON.stringify(payload.message ?? payload.error)}`,
    );
  }

  const parsed = EmailDocSchema.safeParse(payload.doc);
  if (!parsed.success) {
    throw new Error(`[${n}] built doc failed schema re-parse`);
  }
  // ── THE BRAND OVERLAY — the step this program was silently skipping ───────────
  //
  // Found 07/20/2026 when the operator asked why his postal address "never reached
  // the email". It never reached it because `applyBrand` is called from exactly TWO
  // places in the entire codebase, and both are React CLIENT components:
  // EmailLabGridShell.tsx (the Lab canvas) and ProjectSocialClient.tsx. There is no
  // server-side caller. In real use the brand is stamped onto the doc IN THE BROWSER,
  // after authoring and before sending.
  //
  // This program never opens a browser — it calls authorDoc and sends from the command
  // line — so every email it sent was UNBRANDED: house-default colors, no logo, no agent
  // card identity, and an empty footer `address`, which is why the CAN-SPAM nudge
  // rendered on all seven while the account profile HAD a valid address the whole time.
  // The blast route reads `business_address` too, but only to GATE the send
  // (resolvePostalAddress must find one) — it never stamps it into the footer.
  //
  // A simulator that skips the brand is not simulating what a user sends. Load the
  // account brand and apply the SAME pure overlay the canvas applies, server-side.
  // Empty-tolerant: no profile row → no tokens → applyBrand returns the doc untouched.
  const branded = brandTokens ? applyBrand(parsed.data, brandTokens) : parsed.data;
  const rebranded = EmailDocSchema.safeParse(branded);
  if (!rebranded.success) {
    throw new Error(`[${n}] brand overlay produced an INVALID doc — refusing to send`);
  }
  const doc = rebranded.data;
  const listing = payload.listing as { subject?: string; resolved?: boolean } | undefined;
  console.log(
    `[${n}] built · blocks=${doc.blocks.length} · subject-resolved=${listing?.resolved} ` +
      `· subject="${listing?.subject ?? "—"}"`,
  );

  // ── RENDER (the ONE EmailDoc→HTML root) ────────────────────────────────────────
  const baseHtml = await renderEmailDocHtml(doc);

  // ── ASSERT — failure mode #1. A stage that lost its headline must NEVER send. ───
  const text = visibleText(baseHtml);
  const missing = stage.mustContain.filter((s) => !text.includes(s) && !baseHtml.includes(s));
  const leaked = (stage.mustNotContain ?? []).filter(
    (s) => text.includes(s) || baseHtml.includes(s),
  );
  if (missing.length || leaked.length) {
    fs.writeFileSync(path.join(runDir, `FAILED-${index + 1}-${stage.key}.html`), baseHtml);
    throw new Error(
      `[${n}] ASSERTION FAILED — this email is WRONG and will not be sent.\n` +
        (missing.length ? `      missing from the render: ${JSON.stringify(missing)}\n` : "") +
        (leaked.length ? `      LEAKED (must not appear): ${JSON.stringify(leaked)}\n` : "") +
        `      HTML written to runs/campaign-sim/${runId}/FAILED-${index + 1}-${stage.key}.html\n` +
        `      Most likely cause: the recipe builder returned null and authorDoc fell back to\n` +
        `      the generic author — check stderr above for a "[recipe:${stage.key}]" error.`,
    );
  }
  console.log(`[${n}] assertions passed · ${stage.mustContain.length} required strings present`);

  // ── SAVE the deliverable (gives the email a real /p/<id> web view) ─────────────
  const deliverableId = st.deliverableId ?? crypto.randomUUID();
  if (!st.deliverableId) {
    const { error } = await db.from("deliverables").insert({
      id: deliverableId,
      project_id: SIM_PROJECT_ID,
      user_id: UID,
      template: "block-canvas",
      doc: doc as never,
      // SIM-tagged so a fake-event deliverable is never mistaken for a real listing.
      instruction: `SIM(${runId}/${stage.key}): ${prompt}`,
      scope_kind: "zip",
      scope_value: SUBJECT_ZIP,
      data_as_of: new Date().toISOString(),
      narrative: { exec_summary: "", sections: [], inference_notes: [] } as never,
      items_snapshot: [] as never,
      status: "ready",
    });
    if (error) throw new Error(`[${n}] deliverable insert failed: ${error.message}`);
    st.deliverableId = deliverableId;
  } else {
    await db
      .from("deliverables")
      .update({ doc: doc as never })
      .eq("id", deliverableId);
  }
  st.builtAt = new Date().toISOString();
  saveState();

  const webUrl = `${BASE_URL}/p/${deliverableId}`;
  const htmlPath = path.join(runDir, `${String(index + 1).padStart(2, "0")}-${stage.key}.html`);
  fs.writeFileSync(htmlPath, baseHtml);
  console.log(`[${n}] html → ${path.relative(process.cwd(), htmlPath)}`);
  console.log(`[${n}] web  → ${webUrl}`);

  // ── URL LINT — the same hard gate the blast route runs before any send ─────────
  const allowed = collectAllowedUrls(doc, [], null, null, webUrl, ENGINE_OWNED_URLS);
  const urlGate = lintCompiledHtml(baseHtml, allowed);
  if (!urlGate.ok) {
    throw new Error(`[${n}] URL LINT VIOLATIONS — aborting: ${JSON.stringify(urlGate.violations)}`);
  }
  console.log(`[${n}] url lint: clean`);

  if (!SEND) {
    console.log(`[${n}] DRY RUN — not sending`);
    return "built";
  }

  // ── THE LAST GATE BEFORE A REAL EMAIL LEAVES ──────────────────────────────────
  //
  // Re-read state FROM DISK, not from the copy this process loaded at startup. This
  // is the guard that would have prevented the 07/20/2026 triple-send: three
  // processes each held a stale in-memory state saying "stage 6 unsent" and each
  // sent it. Whatever else fails — a stale lock, a forced lock, a harness that
  // reports a kill it did not perform — a stage another process has already sent
  // must not go out twice.
  //
  // Deliberately NOT a full state swap: this process owns its own stage results.
  // We read exactly one fact — has THIS stage been sent by anyone? — and obey it.
  try {
    const onDisk = JSON.parse(fs.readFileSync(statePath, "utf-8")) as RunState;
    const theirs = onDisk.stages[index];
    if (theirs?.sentAt && !st.sentAt && !RESEND_SENT) {
      console.error(
        `[${n}] ABORTING SEND — another process already sent this stage at ${theirs.sentAt}\n` +
          `      (resend id ${theirs.resendId}). This process had a stale view of the run.\n` +
          `      Nothing was sent twice. Check for a second campaign-sim process.`,
      );
      st.sentAt = theirs.sentAt;
      st.resendId = theirs.resendId;
      saveState();
      return "skipped";
    }
  } catch {
    /* unreadable state → fall through; the lock is still holding */
  }

  // ── SEND — blast-route parity ─────────────────────────────────────────────────
  const contactId = await contactIdFor(TO);
  const unsubUrl = `${BASE_URL}/api/unsubscribe?id=${contactId}`;
  const html = withFooter(baseHtml, webUrl, unsubUrl);

  const { data: blast } = await db
    .from("email_blasts")
    .insert({
      user_id: UID,
      deliverable_id: deliverableId,
      contact_ids: [contactId],
      status: "sending",
    })
    .select("id")
    .single();

  const key = process.env.RESEND_AUDIENCES_KEY ?? process.env.RESEND_API_KEY;
  if (!key) throw new Error(`[${n}] no Resend key in env`);
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const res = await resend.emails.send({
    from: "SWFL Data Gulf <hello@swfldatagulf.com>",
    to: [TO],
    subject: stage.subject,
    html,
    replyTo: "hello@swfldatagulf.com",
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  const ok = !res.error;
  if (blast?.id) {
    await db
      .from("email_blasts")
      .update({
        status: ok ? "sent" : "failed",
        sent_count: ok ? 1 : 0,
        failed_count: ok ? 0 : 1,
        sent_at: new Date().toISOString(),
      })
      .eq("id", blast.id);
  }
  if (!ok) throw new Error(`[${n}] RESEND FAILED: ${JSON.stringify(res.error)}`);

  await recordEmailSent(UID, 1);
  st.sentAt = new Date().toISOString();
  st.resendId = res.data?.id ?? null;
  saveState();
  console.log(`[${n}] SENT → ${TO}  ·  subject: "${stage.subject}"  ·  resend id ${st.resendId}`);
  return "sent";
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════════

console.log("═".repeat(72));
console.log("CAMPAIGN SIMULATOR — teaser → sold");
console.log("═".repeat(72));
console.log(`subject   : ${SUBJECT_ADDRESS}  (REAL active listing)`);
console.log(`fakes     : description · price cut $24,000 (stage 5) · close $628,500 (stage 7)`);
console.log(`mode      : ${SEND ? `SEND → ${TO}` : "DRY RUN (no send)"}`);
console.log(`spacing   : ${NO_WAIT ? "none (back to back)" : `${SPACING_MIN} min between stages`}`);
console.log(`run       : ${runId}`);
console.log(`output    : runs/campaign-sim/${runId}/`);

await ensureSimProject();

const indices = ONLY
  ? STAGES.map((s, i) => (s.key === ONLY ? i : -1)).filter((i) => i >= 0)
  : STAGES.map((_, i) => i);

if (ONLY && indices.length === 0) {
  console.error(
    `[sim] --only "${ONLY}" matches no stage. Keys: ${STAGES.map((s) => s.key).join(", ")}`,
  );
  process.exit(1);
}

let failed = false;
for (let n = 0; n < indices.length; n++) {
  const i = indices[n]!;
  let outcome: StageOutcome;
  try {
    outcome = await runStage(i);
  } catch (err) {
    failed = true;
    state.stages[i]!.error = err instanceof Error ? err.message : String(err);
    saveState();
    console.error(`\n${err instanceof Error ? err.message : err}\n`);
    console.error(
      `[sim] STOPPING at stage ${i + 1}. Fix the cause, then resume with:\n` +
        `      bun scripts/email/campaign-sim.mts ${SEND ? "--send " : ""}--resume ${runId}`,
    );
    break;
  }
  // Wait before the NEXT stage — but ONLY after a real send, never after a stage
  // we skipped because an earlier run already sent it.
  //
  // Caught live on the first resume (07/20/2026): the killed run had sent 3 of 7, and
  // resuming slept the full spacing after EACH skipped stage — 12 idle minutes before
  // the campaign reached the first email it actually had to send. A resume is a
  // recovery path; it must catch up at once and only then fall back into cadence.
  const isLast = n === indices.length - 1;
  if (outcome === "sent" && !isLast && !NO_WAIT && SPACING_MIN > 0) {
    console.log(`\n[sim] waiting ${SPACING_MIN} min before the next email …`);
    await Bun.sleep(SPACING_MIN * 60_000);
  }
}

console.log(`\n${"═".repeat(72)}`);
const sent = state.stages.filter((s) => s.sentAt).length;
const built = state.stages.filter((s) => s.builtAt).length;
console.log(`built ${built}/${STAGES.length} · sent ${sent}/${STAGES.length} · run ${runId}`);
console.log(`state: runs/campaign-sim/${runId}/state.json`);
console.log("═".repeat(72));
process.exit(failed ? 1 : 0);
