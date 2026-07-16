#!/usr/bin/env node
// verify-blitz.mjs — guided operator walk through the click-now verify checks.
//
//   node scripts/verify-blitz.mjs          interactive: one check at a time
//   node scripts/verify-blitz.mjs --list   print the queue and exit
//
// For each check it prints the URL to open and the ONE thing to confirm, then:
//   y = it works  → closes the check via check.mjs (the proof gate stays the
//       single close path); Enter accepts a default evidence line naming the
//       URL + date, or type what you saw for stronger evidence
//   n = it's broken → collected; a ready-to-run defect-open command prints at
//       the end (a failed verify is a new defect, never a close)
//   s = skip for now      q = quit (progress is already saved per-close)
//
// Companion doc (groups B–D: after-push, operator-gated, awaiting-a-run):
//   docs/handoff/2026-07-16-verify-blitz.md

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";

const ROOT = process.cwd();
const SITE = "https://www.swfldatagulf.com";
const OPS = "https://swfldatagulf-ops.vercel.app";

// Click-now items only (Group A of the handoff doc), in sitting order: stay on
// one surface and close everything it hosts before moving on.
const SITTINGS = [
  {
    title: "THE DESK — one tab, four closes",
    url: `${SITE}/desk`,
    items: [
      [
        "desk_v2_additions_live_verify",
        "command bar, watchlist, alerts, histogram, correlation heatmap all render",
      ],
      [
        "trend_fit_engine_live_verify",
        "fitted trend lines carry a code-computed read (no hand-waved trajectory prose)",
      ],
      ["trend_window_menu_live_verify", "window menu zooms + re-fits the read per window"],
      [
        "homes_only_sold_median_live_verify",
        "a Lee ZIP shows a homes-only county-deed sold median with its source",
      ],
    ],
  },
  {
    title: "HOMEPAGE + REPORTS",
    url: SITE,
    items: [
      ["homepage_one_site_live_verify", "one-site redesign live, no dead sections"],
      ["homepage_one_bar_live_verify", "the one working bar answers/builds — no theater"],
      [
        "gallery_listing_hero_live_verify",
        "'Pick a Starting Point' gallery routes; Listing Campaign hero present",
      ],
      ["multi_zip_city_chart_live_verify", "ask about a city → ZIP-by-ZIP chart comes back"],
      [
        "chat_chart_honesty_live_verify",
        "chat never negotiates a chart it can't build; answers stay grounded",
      ],
      [
        "place_gazetteer_phase1_live_verify",
        "a known place resolves; a missing place refuses instead of mis-resolving",
      ],
      [
        "welcome_smoke_no_invention",
        `on ${SITE}/welcome ask a 33931 flood/AAL question: leads with the email hook, offers a cited build, invents no number`,
      ],
    ],
  },
  {
    title: "EMAIL LAB — one tab, the biggest batch",
    url: `${SITE}/email-lab/grid`,
    items: [
      [
        "email_lab_text_styling_live_verify",
        "14 fonts, block text formatting, image overlay opacity",
      ],
      ["grid_email_canvas_v2_live_verify", "edits persist across reload; AI sections work"],
      [
        "lab_entry_root_live_verify",
        "blank skeleton, project/address popups, autosave + leave guard",
      ],
      ["sold_email_builder_live_verify", "build a grounded Just-Sold email"],
      [
        "new_listing_grid_fill_live_verify",
        "New Listing fills its grid from a real listing (photo+price+specs)",
      ],
      ["listing_flyer_email_live_verify", "paste a listing URL → flyer with scraped comps chart"],
      ["listing_flyer_design_variants_live_verify", "design variants switch; sticky default holds"],
      ["chart_picker_parity_live_verify", "chart-type picker shows 12/12 registry frames"],
      ["prochart_rendering_live_verify", "hi-res chart renders in email + PDF export"],
      [
        "saved_layout_live_verify",
        "build New Listing → edit grid → build a DIFFERENT address → same grid, all-new data",
      ],
      ["agent_profile_live_verify", "AI-authored bio persists and cites live data"],
      ["contact_segments_live_verify", "segment picker filters a blast audience"],
      ["bklit_chart_vendoring_live_verify", "live-line / pie / sankey chart types render"],
      [
        "email_lab_tracking_live_verify",
        "send a test to yourself, open it — an email_events open row lands",
      ],
    ],
  },
  {
    title: "PROJECTS / COCKPIT",
    url: `${SITE}/project`,
    items: [
      ["project_cockpit_live_verify", "open a project → unified email + social workspace"],
      ["unify_contact_stores_live_verify", "contacts import (vCard) lands deduped in one store"],
      ["property_watch_live_verify", "a watched address shows a nearby-market-movement nudge"],
      [
        "platform_arc_nudges_live_verify",
        "an armed sequence on a live address shows its auto-advance nudge chip",
      ],
      ["showing_prep_packet_live_verify", "Showing Prep Packet builds for a listing"],
      [
        "p1_ai_surface_prod_verify",
        "project chat reflects the P1 AI-surface fixes (grounded, not pitching)",
      ],
    ],
  },
  {
    title: "OPS DASHBOARD",
    url: OPS,
    items: [
      ["spend_tripwire_live_verify", "spend page shows real dollar figures; hourly tripwire green"],
      [
        "answer_path_observability_live_verify",
        "answer-path coverage snapshot renders; red-main sentinel present",
      ],
      [
        "data_contracts_doctor_live_verify",
        "doctor rollup renders on the census page (A→C health)",
      ],
      [
        "incremental_ingest_live_verify",
        "per-source replace/merge audit reads clean (dlt cursors present)",
      ],
      [
        "deliverability_diagnostic_panel_live_verify",
        "deliverability panel shows real DNS/domain state",
      ],
      [
        "send_window_guidance_live_verify",
        "send-time picker clamps to the window + shows the guidance",
      ],
      [
        "email_link_destinations_live_verify",
        "in a listing email build: hero/CTA/comp rows carry working links (pushed 07/12)",
      ],
    ],
  },
];

function fmtToday() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

async function openVerifyKeys() {
  const c = resolveSupabaseCreds({
    tomlText: readFileSync(resolve(ROOT, ".dlt/secrets.toml"), "utf8"),
    env: process.env,
  });
  const r = await fetch(
    `${c.url}/rest/v1/checks?state=eq.open&class=eq.verify&select=check_key&limit=1000`,
    { headers: { apikey: c.key, Authorization: `Bearer ${c.key}` } },
  );
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return new Set((await r.json()).map((row) => row.check_key));
}

const stillOpen = await openVerifyKeys();
const queue = SITTINGS.map((s) => ({
  ...s,
  items: s.items.filter(([key]) => stillOpen.has(key)),
})).filter((s) => s.items.length);
const clickNow = queue.reduce((n, s) => n + s.items.length, 0);
const curated = new Set(SITTINGS.flatMap((s) => s.items.map(([k]) => k)));
const elsewhere = [...stillOpen].filter((k) => !curated.has(k));

console.log(
  `\nVERIFY BLITZ — ${clickNow} click-now checks still open (${stillOpen.size} verify-class total;`,
);
console.log(
  `the other ${elsewhere.length} are after-push / operator-gated / awaiting-a-run — see docs/handoff/2026-07-16-verify-blitz.md)\n`,
);

if (process.argv.includes("--list")) {
  for (const s of queue) {
    console.log(`\n■ ${s.title}\n  open ${s.url}`);
    for (const [key, look] of s.items) console.log(`    · ${key} — ${look}`);
  }
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let closed = 0;
let seen = 0;
const failed = [];

outer: for (const s of queue) {
  console.log(`\n■ ${s.title}\n  → open ${s.url}\n`);
  for (const [key, look] of s.items) {
    seen++;
    console.log(`[${seen}/${clickNow}] ${key}\n    confirm: ${look}`);
    const a = (await rl.question("    works? (y)es close / (n)o broken / (s)kip / (q)uit: "))
      .trim()
      .toLowerCase();
    if (a === "q") break outer;
    if (a === "s" || a === "") continue;
    if (a === "n") {
      failed.push([key, look]);
      console.log("    noted — defect-open command prints at the end.");
      continue;
    }
    if (a === "y") {
      const fallback = `verified live at ${s.url} — ${look} (verify-blitz ${fmtToday()})`;
      const typed = (
        await rl.question(`    evidence [Enter = "${fallback.slice(0, 60)}..."]: `)
      ).trim();
      const evidence = typed || fallback;
      try {
        execFileSync("node", ["scripts/check.mjs", "close", key, "--evidence", evidence], {
          cwd: ROOT,
          stdio: "inherit",
        });
        closed++;
      } catch {
        console.log("    close failed (see message above) — leaving open, moving on.");
      }
    }
  }
}
rl.close();

console.log(
  `\nDone: ${closed} closed, ${failed.length} found broken, ${clickNow - seen} not reached.`,
);
if (failed.length) {
  console.log("\nBroken finds — each is a NEW defect, run these (edit the label to what you saw):");
  for (const [key, look] of failed)
    console.log(
      `  node scripts/check.mjs open brain-platform ${key}_failed "Verify failed ${fmtToday()}: ${look}" --class defect`,
    );
}
