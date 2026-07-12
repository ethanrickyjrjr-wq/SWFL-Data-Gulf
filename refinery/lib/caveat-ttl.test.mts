import { test } from "bun:test";
import assert from "node:assert/strict";
import { caveatIsFresh, CAVEAT_TTL_DAYS, DEGRADE_CAVEAT } from "./caveat-ttl.mts";

// --- The corpus. Every string below is what Stage 4 actually sees. ---

/** The phantom. macro-swfl mints it; master re-lifts it byte-for-byte (master.mts:188). */
const PHANTOM =
  "Upstream brain 'macro-florida' failed to rebuild on 2026-06-29; using last good read from 2026-06-29 (v23).";

/** permits-swfl — LIVE-TRUE content caveats. Their embedded date is a last-SOURCE-EVENT
 *  date, not an emission date: they get MORE true as it recedes. A naive date-scan
 *  deletes both. These are the regression this phase exists to not ship. */
const PERMITS_NAPLES =
  "Most recent Naples permit issued 2026-04-30; monthly XLSX has not refreshed for 68 days (cadence 30d). Collier signal in this build is stale.";
const PERMITS_LEE =
  "Most recent Lee permit issued 2026-06-16; daily Accela scrape may be stalled (21 days since last issue).";

/** env-swfl methodology note (head of the live string) — a maintenance note that must never expire. */
const ENV_STORM_YEARS =
  "Storm-year list (Charley 2004 through Milton 2024) was last reviewed 2026-05-17.";

/** cre-swfl — representative of the 14 [fmb_planning]/[estero_edc] local-context FACTS
 *  (55-344d old) and the 2 Crexi disclosures. Facts, not staleness. */
const CRE_LOCAL_FACT = "[estero_edc] Corkscrew Rd Widening — construction start 2026-01-01.";
const CRE_CREXI = "Crexi listing counts are as of 2026-07-05.";

/** The two sibling engine templates (4-output.mts:182-183 and :171). Same latent
 *  freeze bug, unreachable by date math — a TTL must never touch them. */
const STALE_TEMPLATE =
  "Upstream brain 'macro-florida' was stale at build time (expired 2026-06-14).";
const UNAVAILABLE_TEMPLATE =
  "Upstream brain 'macro-florida' was unavailable at build time (no last-good read).";

// --- The phantom: the 14-day edge, pinned on three days ---

test("phantom KEPT at 13 days old (2026-06-29 -> 2026-07-12)", () => {
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-12", 14), true);
});

test("phantom DROPPED at exactly 14 days old (2026-07-13) — the boundary that pins the semantics", () => {
  // fresh <=> ageDays < ttlDays. The two brief-mandated cases (07-12 keep / 07-14 drop)
  // are satisfied by BOTH `< 14` and `<= 14`; only this case discriminates. Evidence
  // (08f-code-surface.md §0) says the phantom "starts dropping 07-13" -> DROP at age 14.
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-13", 14), false);
});

test("phantom DROPPED at 15 days old (2026-07-14)", () => {
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-14", 14), false);
});

test("phantom still KEPT today (2026-07-11, age 12) — a correct 14d TTL does not drop it yet", () => {
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-11", 14), true);
});

// --- No false drops. The whole point. ---

test("live content caveats with an old embedded date are KEPT (no false drop)", () => {
  const now = "2026-07-11"; // ages: 72d, 25d, 55d, 191d, 6d
  assert.equal(caveatIsFresh(PERMITS_NAPLES, now, 14), true);
  assert.equal(caveatIsFresh(PERMITS_LEE, now, 14), true);
  assert.equal(caveatIsFresh(ENV_STORM_YEARS, now, 14), true);
  assert.equal(caveatIsFresh(CRE_LOCAL_FACT, now, 14), true);
  assert.equal(caveatIsFresh(CRE_CREXI, now, 14), true);
});

test("a 344-day-old cre-swfl fact is STILL kept — age is irrelevant without the template", () => {
  assert.equal(
    caveatIsFresh("[fmb_planning] Bay Oaks Park opened 2025-08-01.", "2026-07-11", 14),
    true,
  );
});

test("the two sibling engine templates are KEPT — a TTL must never touch them", () => {
  // STALE_TEMPLATE embeds an EXPIRY, always in the past: filtering it would delete a
  // live staleness signal. UNAVAILABLE_TEMPLATE has no date at all.
  assert.equal(caveatIsFresh(STALE_TEMPLATE, "2026-12-31", 14), true);
  assert.equal(caveatIsFresh(UNAVAILABLE_TEMPLATE, "2026-12-31", 14), true);
});

test("undated + coarse-token caveats are KEPT (bare year, N days, BLS period)", () => {
  const now = "2026-07-11";
  assert.equal(caveatIsFresh("Sample size is thin in this ZIP.", now, 14), true);
  assert.equal(caveatIsFresh("Baseline is the 2019 pre-storm year.", now, 14), true);
  assert.equal(caveatIsFresh("Source refreshed 68 days ago.", now, 14), true);
  assert.equal(caveatIsFresh("BLS reference period 2026-M04.", now, 14), true); // NOT a date
});

// --- Template coupling: this test is the tripwire on 4-output.mts:191 ---

test("template mirror — a caveat built with 4-output.mts:191's interpolation shape drops", () => {
  // If someone edits the L191 template, DEGRADE_CAVEAT stops matching, caveatIsFresh
  // fails OPEN, and the phantom re-ships forever with no other test going red.
  // This test is the only thing that reddens. Keep it byte-aligned with :191.
  const id = "macro-florida";
  const today = "2026-06-29";
  const lastDate = "2026-06-29";
  const version = 23;
  const built = `Upstream brain '${id}' failed to rebuild on ${today}; using last good read from ${lastDate} (v${version}).`;
  assert.equal(built, PHANTOM); // the mirror itself
  assert.match(built, DEGRADE_CAVEAT);
  assert.equal(caveatIsFresh(built, "2026-07-20", 14), false);
});

// --- Fail-open: dropping is the destructive direction ---

test("an unparseable `now` FAILS OPEN (keeps the caveat, never drops on garbage)", () => {
  assert.equal(caveatIsFresh(PHANTOM, "garbage", 14), true);
  assert.equal(caveatIsFresh(PHANTOM, new Date(NaN), 14), true);
});

test("a Date object and a date string agree (UTC-day anchored, no TZ drift)", () => {
  assert.equal(caveatIsFresh(PHANTOM, new Date("2026-07-13T23:59:59Z"), 14), false);
  assert.equal(caveatIsFresh(PHANTOM, new Date("2026-07-12T00:00:01Z"), 14), true);
  // A full refined_at timestamp behaves identically to its calendar day.
  assert.equal(caveatIsFresh(PHANTOM, "2026-07-13T04:05:06Z", 14), false);
});

test("defaults: ttlDays is 14 and `now` is the live clock", () => {
  assert.equal(CAVEAT_TTL_DAYS, 14);
  // 1999 is decades past any TTL; 2999 is not yet born. Clock-independent.
  const ancient =
    "Upstream brain 'x' failed to rebuild on 1999-01-01; using last good read from 1999-01-01 (v1).";
  const future =
    "Upstream brain 'x' failed to rebuild on 2999-01-01; using last good read from 2999-01-01 (v1).";
  assert.equal(caveatIsFresh(ancient), false);
  assert.equal(caveatIsFresh(future), true);
});

// --- The whole-array shape Task 2 uses at 4-output.mts:438 ---

test("filtering master's re-lifted caveat array drops exactly the phantom", () => {
  const masterCaveats = [
    PHANTOM,
    PERMITS_NAPLES,
    PERMITS_LEE,
    ENV_STORM_YEARS,
    CRE_LOCAL_FACT,
    CRE_CREXI,
    STALE_TEMPLATE,
  ];
  const kept = masterCaveats.filter((c) => caveatIsFresh(c, new Date("2026-07-20T04:00:00Z"), 14));
  assert.deepEqual(kept, [
    PERMITS_NAPLES,
    PERMITS_LEE,
    ENV_STORM_YEARS,
    CRE_LOCAL_FACT,
    CRE_CREXI,
    STALE_TEMPLATE,
  ]);
  assert.equal(kept.length, 6);
});
