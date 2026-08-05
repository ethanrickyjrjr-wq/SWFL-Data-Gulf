#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════
// DOC RATCHET — the ledger that makes STANDING STILL a failure.
//
// *** WHY THIS IS NOT THE SAME AS `doc-reachability.mjs --check`. *** That check has the
// wrong polarity for what the operator asked for. It fires when things get WORSE, and is
// silent forever if nothing ever improves. Operator, 08/05/2026: *"Make sure we are
// actively improving every fucking day."* A guard that is happy with stagnation cannot
// answer that. This one goes off when we have NOT improved.
//
//   node scripts/doc-ratchet.mjs record    append today's measurement to the ledger
//   node scripts/doc-ratchet.mjs status    trend + days since last improvement
//   node scripts/doc-ratchet.mjs check     EXIT 1 if stagnant beyond STAGNATION_DAYS
//
// The ledger is COMMITTED (`docs/standards/doc-ratchet-ledger.json`) on purpose: a trend
// that lives only in a session log is a trend nobody can see. One row per calendar day —
// re-recording the same day OVERWRITES rather than appends, so a chatty session cannot
// manufacture the appearance of progress.
//
// *** THE ONLY HONEST WAYS THE ORPHAN COUNT MAY FALL. *** Deleting a dead document, or
// adding a REAL human-meaningful pointer to a live one. It may NEVER fall because a
// generated file started listing everything — that is self-referential fraud, and it
// already happened once on 08/05/2026 (the generated index briefly reported 0 orphans by
// counting itself as a referrer). `doc-reachability.mjs` excludes generated maps from the
// evidence corpus for exactly this reason. If you find yourself widening that exclusion to
// make a number move, stop: you are gaming, not improving.
// ═══════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { census } from "./doc-reachability.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(ROOT, "docs", "standards", "doc-ratchet-ledger.json");

/** How many days of NO improvement before this is a failure. Deliberately short: the
 *  operator asked for daily movement, and a week-long tolerance is how "we'll get to it"
 *  becomes "nobody looked at it in a month." */
const STAGNATION_DAYS = 7;

function today() {
  // Date is injectable so a scheduled run can be replayed deterministically.
  return process.env.DOC_RATCHET_DATE ?? new Date().toISOString().slice(0, 10);
}

function load() {
  if (!existsSync(LEDGER)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(LEDGER, "utf8"));
  } catch {
    return { entries: [] };
  }
}

function measure() {
  const r = census();
  return {
    docs: r.docs.length,
    byPath: r.byPath.length,
    byNameOnly: r.byNameOnly.length,
    orphans: r.orphans.length,
  };
}

function record() {
  const led = load();
  const date = today();
  const m = measure();
  // One row per calendar day. Overwrite, never append twice — otherwise a session that
  // runs this ten times invents ten data points and the trend becomes meaningless.
  const i = led.entries.findIndex((e) => e.date === date);
  const row = { date, ...m };
  if (i >= 0) led.entries[i] = row;
  else led.entries.push(row);
  led.entries.sort((a, b) => a.date.localeCompare(b.date));
  led.updated = date;
  writeFileSync(LEDGER, `${JSON.stringify(led, null, 2)}\n`, "utf8");
  return { led, row };
}

/** Days since the orphan count last went DOWN. Null when there is no prior improvement
 *  to compare against (a brand-new ledger is not yet stagnant). */
function daysSinceImprovement(entries) {
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1];
  for (let i = entries.length - 2; i >= 0; i--) {
    if (entries[i].orphans > last.orphans) {
      const a = new Date(entries[i + 1].date);
      const b = new Date(last.date);
      return Math.round((b - a) / 86400000);
    }
  }
  const first = new Date(entries[0].date);
  const lastD = new Date(last.date);
  return Math.round((lastD - first) / 86400000);
}

function status(led) {
  const e = led.entries;
  if (!e.length) return "  no measurements yet — run: node scripts/doc-ratchet.mjs record";
  const last = e[e.length - 1];
  const first = e[0];
  const moved = first.orphans - last.orphans;
  const since = daysSinceImprovement(e);
  const lines = [
    ``,
    `  DOC RATCHET — are we actually improving?`,
    ``,
    `  latest ${last.date}   ${last.orphans} orphaned of ${last.docs} docs ` +
      `(${last.byPath} by path · ${last.byNameOnly} weak)`,
    `  since  ${first.date}   ${moved >= 0 ? "-" : "+"}${Math.abs(moved)} orphans ` +
      `over ${e.length} measurement(s)`,
    `  days since last improvement: ${since === null ? "n/a (first entry)" : since}`,
    ``,
  ];
  const recent = e.slice(-7);
  lines.push(`  last ${recent.length}:`);
  for (const r of recent) lines.push(`    ${r.date}  ${String(r.orphans).padStart(5)} orphans`);
  lines.push(``);
  return lines.join("\n");
}

const cmd = process.argv[2] ?? "status";
const isMain = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));

if (isMain) {
  if (cmd === "record") {
    const { led, row } = record();
    console.log(`recorded ${row.date}: ${row.orphans} orphans of ${row.docs} docs`);
    console.log(status(led));
  } else if (cmd === "check") {
    const { led } = record();
    console.log(status(led));
    const since = daysSinceImprovement(led.entries);
    if (since !== null && since >= STAGNATION_DAYS) {
      console.error(
        `\nFAIL — ${since} days with no improvement (limit ${STAGNATION_DAYS}).\n\n` +
          `The orphan count has not gone DOWN. Standing still is the failure this check\n` +
          `exists to catch. Two honest ways to move it, and only two:\n` +
          `  1. DELETE a dead document — list them: node scripts/doc-reachability.mjs --orphans\n` +
          `  2. Add a REAL pointer to a live one from the doc that would need it\n\n` +
          `Do NOT move it by making a generated file list more things. That is fraud, and it\n` +
          `already happened once (08/05/2026: the index counted itself and reported 0 orphans).\n` +
          `Start here: _RESEARCH/audits/2026-07-18-data-consolidation/P7-corpse-deletelist.md\n`,
      );
      process.exit(1);
    }
  } else {
    console.log(status(load()));
  }
}
