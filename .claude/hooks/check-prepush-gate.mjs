#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Blocks `git push` when one of the known
// recurring nightly-rebuild / red-main breakers is about to ship. Each of these
// has reddened main or aborted the daily rebuild more than once; the prevention
// used to live only in prose (CLAUDE.md / docs/cron-rebuild-failures.md
// "Recurring Patterns"). This hook enforces it locally so the failure never
// reaches GHA.
//
//   1. LOCKFILE  — package.json dependency map changed but bun.lock did not
//                  → `bun install --frozen-lockfile` fails in CI in <1s.
//   2. VOCAB/ALIAS — a corridor rename or pack/vocab edit that orphans a slug on
//                  pack "master", or a corridor slug missing its alias.
//   3. SECRETS   — (advisory only) a new pipeline/workflow that may reference a
//                  secret not yet wired into the workflow `env:` block.
//   4. INGEST    — a destructive write (replace/truncate) with no non-null guard
//                  (BIBLE §0.2 rule 5); the one irreversible ingest failure.
//   5. PACK/CATALOG — a refinery/packs edit that drifts the leaf catalog from
//                  PER_PACK_REGISTRY (env-safe catalog.test mirror, hard block) or
//                  breaks a fast bun:test per-pack assertion (e.g. "sources wired").
//                  vitest/subprocess per-pack tests (zhvi/zori view parity) only
//                  resolve in CI, so they are skipped local-side, never blocked.
//   7. REGISTRY IDENTITY — a cadence_registry / workflow / pipeline edit that drifts
//                  one of the hand-synced identity strings (workflow ref, dlt schema,
//                  source_name, secret-in-env, timeout, action version). Runs
//                  `check-registry-identity.mts --static` — files only, no DB, no
//                  network (tags come from the maintained ingest/tools/action-tags.json
//                  allowlist and fail OPEN). Same block/exit contract as Gate 2/5.
//  10. SCHEDULE CATALOG — an ACTIVE-cron workflow (or vercel.json cron) with no
//                  cadence_registry.yaml entry. ONE catalog of everything
//                  scheduled (spec 2026-07-20); the error prints a paste-ready
//                  jobs: snippet so the fix never requires reading the registry.
//
// NOTE — what this hook can and cannot catch: it stops DETERMINISTIC failures
// (drift, orphans, lockfile). It does NOT and cannot reliably stop a FLAKY test
// (non-deterministic, e.g. a crypto/Date/random-seeded assertion) — that passes
// locally most of the time and reddens CI at random regardless of the diff. The
// only fix for a flake is to make the test deterministic, not to gate harder.
// (Incident 2026-06-13: the proposal-nonce "tampered signature" test flaked ~6.5%
// per push and reddened main repeatedly until the test itself was fixed.)
//
// Design notes:
//   • Fail-CLOSED on a real gate violation (exit 2 blocks the push).
//   • Fail-OPEN on an internal error (missing bun, git quirk) — a broken hook
//     must never wedge every push. We warn and allow.
//   • Runs alongside check-session-log-on-push.mjs; both must pass.

import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolvePushCwd } from "./push-context.mjs";
import { parseLedger, findOrphanedClaims } from "./lib/ledger-parse.mjs";
import { findUnwiredSecrets } from "./lib/secret-wiring.mjs";
import {
  orphanTables,
  tablesCreatedInSql,
  tablesDeclaredInPipeline,
} from "./lib/table-consumer.mjs";
import { cronViolations } from "./lib/cron-failclosed.mjs";
import { findDerivationCollisions, objectsCreatedInSql } from "./lib/duplicate-root.mjs";
import {
  computeGaps,
  invalidClasses,
  ratchetVerdict,
  baselineJson,
  ALLOWED_CLASSES,
} from "./lib/coverage-ratchet.mjs";

const BANNER = "=".repeat(72);

// Gate 4 (ingest hardening, BIBLE §0.2 rule 5) is LIVE (fail-closed). 2026-06-13:
// census_cbp + fdot carry a real non-null guard (assert_min_rows + a load-bearing
// non-null/non-zero floor); a clean re-run of the dry run confirmed they no longer
// trip the predicate. Both previously-HELD incidents are now RESOLVED:
//   • faf5 — RETIRED, not guarded. The dlt→Postgres replace pipeline was dead code
//     (faf_flows/faf_zone_lookup/faf_sctg_lookup never landed; the live freight path
//     is Tier-1 Parquet via faf5_to_parquet.py). pipeline.py/resources.py were deleted,
//     so the replace resource no longer exists to flag.
//   • fl_dbpr_applicants — FIXED + GUARDED. URL/layout/county corrected; the applicant
//     (replace) resource now carries assert_min_rows + per-county floors + city anchors.
// The block is PER-TOUCHED-FILE, so any future unguarded replace is caught the moment
// its file is edited. Operator override for a legitimate one-off:
// ALLOW_REPLACE_WITHOUT_GUARD=1 (reason is logged).
const BLOCK_REPLACE_WITHOUT_GUARD = true;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // not our shape
  }
  const cmd = String(payload?.tool_input?.command ?? "");
  if (!isGitPush(cmd)) process.exit(0);
  REPO_CWD = resolvePushCwd(payload);

  // ---- SCOPE GUARD (added 07/19/2026) --------------------------------------
  // Every gate below is brain-platform-specific (lockfile / vocab / ingest / pack /
  // registry), and several shell into scripts/ that exist ONLY in this repo. When
  // the SAME Claude session pushes a DIFFERENT repo (e.g. the ops repo
  // swfldatagulf-ops), this hook ran those gates against it and CRASHED fail-CLOSED
  // on a missing brain-platform script (`scripts/check-zip-scope-gate.mjs` →
  // MODULE_NOT_FOUND) — wedging every foreign-repo push, the exact "a broken hook
  // must never wedge every push" failure the header forbids. `git cat-file -e` is a
  // pure tree lookup (no fs path translation across msys); it succeeds for main AND
  // RULE-1.5 worktrees (they share HEAD's tree) and throws for any other repo.
  try {
    sh("git cat-file -e HEAD:refinery/packs/catalog.mts");
  } catch {
    process.exit(0); // push targets a non-brain-platform repo — these gates do not apply
  }

  // Comparison base: upstream if set, else origin/main. Mirrors the session-log hook.
  let base = "";
  try {
    base = sh("git rev-parse --abbrev-ref --symbolic-full-name @{u}");
  } catch {
    try {
      sh("git rev-parse --verify origin/main");
      base = "origin/main";
    } catch {
      process.exit(0); // can't enforce — allow
    }
  }

  let changed = [];
  try {
    const ahead = sh(`git rev-list --count ${base}..HEAD`);
    if (ahead === "0") process.exit(0); // nothing to push
    changed = sh(`git diff --name-only ${base}..HEAD`)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    process.exit(0); // git quirk — allow
  }

  // ---- Gate 1: lockfile drift ------------------------------------------------
  const pkgChanged = changed.includes("package.json");
  const lockChanged = changed.includes("bun.lock");
  if (pkgChanged && !lockChanged && depsChanged(base)) {
    block(
      "LOCKFILE — package.json dependencies changed but bun.lock did not",
      `A dependency add/remove/bump landed without regenerating the lockfile.\n` +
        `CI runs \`bun install --frozen-lockfile\`, detects the drift, and exits in\n` +
        `under 1s with \`error: lockfile had changes, but lockfile is frozen\` —\n` +
        `silently blocking the entire daily rebuild.\n\n` +
        `Fix:\n` +
        `  bun install && git add bun.lock && git commit -m "fix(lockfile): regenerate bun.lock"\n` +
        `(or \`--amend\` into the dep change), then retry the push.`,
    );
  }

  // ---- Gate 1.5: doc index drift -------------------------------------------
  // Same shape as Gate 1 (lockfile): a generated artifact must ship in the SAME push as
  // the thing that changes it. Here the artifact is the corpus map the `what-do-we-have`
  // skill greps — the ONLY place `_RESEARCH/` (gitignored, invisible to Grep) is
  // searchable. A stale map is worse than none: it answers "we don't have that" with
  // confidence, which is the exact re-derive-what-we-already-bought bug it was built to
  // kill. Escape: ALLOW_STALE_DOC_INDEX=1.
  const docsTouched = changed.some(
    (f) => f.toLowerCase().endsWith(".md") && f !== ".claude/skills/what-do-we-have/INDEX.md",
  );
  if (docsTouched && process.env.ALLOW_STALE_DOC_INDEX !== "1") {
    const gen = run("node scripts/doc-index.mjs");
    // A generator that cannot run must never silently pass — that is the empty-tolerance
    // failure shape (new-project-playbook §4.12). Only a clean run counts as evidence.
    if (gen.ran && gen.code !== 0) {
      block(
        "DOC INDEX — the generator failed, so the map cannot be trusted",
        `\`node scripts/doc-index.mjs\` exited ${gen.code}.\n\n${truncate(gen.out)}\n\n` +
          `Fix the generator, or push with ALLOW_STALE_DOC_INDEX=1 if this is unrelated.`,
      );
    }
    const drifted = sh("git status --porcelain .claude/skills/what-do-we-have/INDEX.md").trim();
    if (drifted) {
      block(
        "DOC INDEX — markdown changed but the generated map did not ship with it",
        `You changed .md file(s); the corpus map is now stale and has been REGENERATED for you.\n` +
          `It is the only place \`_RESEARCH/\` is visible to a search, so a stale copy makes\n` +
          `Claude answer "we don't have that" about documents we own.\n\n` +
          `Fix (the regeneration already ran — just ship it):\n` +
          `  git add .claude/skills/what-do-we-have/INDEX.md && git commit -m "chore(docs): regenerate doc index"\n` +
          `then retry the push.`,
      );
    }
  }

  // ---- Gate 2: vocab orphans / corridor-alias desync ------------------------
  const vocabTouched = changed.some(
    (f) =>
      f.startsWith("refinery/packs/") ||
      f.startsWith("refinery/vocab/") ||
      f === "refinery/lib/corridor-aliases.mts" ||
      f.startsWith("fixtures/corridor-") ||
      f === "brains/master.md",
  );
  if (vocabTouched) {
    const alias = run("bun test refinery/lib/corridor-aliases.test.mts");
    if (alias.ran && alias.code !== 0) {
      block(
        "VOCAB/ALIAS — corridor-alias coverage test failed",
        `A corridor slug is missing its entry in refinery/lib/corridor-aliases.mts.\n` +
          `This is the corridor-rename breaker (CI goes red the moment master rebuilds).\n` +
          `Add the one-line alias per renamed corridor, then retry.\n\n` +
          truncate(alias.out),
      );
    }
    // --all, NOT the bare (master-only) default. The bare check only inspects
    // master.md's own key_metrics, so a slug emitted by a LEAF brain that orphans
    // master's normalize at stage 2.5 sails right through it — that exact hole
    // held the 2026-06-07 rebuild (econ-dev-swfl emitted econ_dev_announcements_90d
    // / _prior_90d, never registered). --all walks every brains/*.md through the
    // real Stage-2.5 resolver and exits 1 on the first orphan.
    const vocab = run("bun refinery/tools/check-vocab-coverage.mts --all");
    if (vocab.ran && vocab.code !== 0) {
      block(
        "VOCAB/ALIAS — a brain emits a metric slug not registered in the vocabulary",
        `A brain claims a metric slug that does not resolve in\n` +
          `refinery/vocab/brain-vocabulary.json — the orphan-concept error that\n` +
          `aborts the nightly rebuild the moment master re-synthesizes.\n\n` +
          `Fix: add a documented concept (prefLabel + scope_note) with the slug in\n` +
          `its raw_slugs, in THIS commit, then retry. (slug_index is DERIVED from\n` +
          `raw_slugs at load since 2026-07-19 — there is no block to mirror.)\n\n` +
          truncate(vocab.out),
      );
    }
    // Conditional-slug guard: --all only sees slugs present in a RENDERED .md.
    // A slug emitted behind an `if` (e.g. econ_dev_investment_usd_90d, only when a
    // disclosure exists) is absent from the .md until data makes it computable —
    // then it orphans master with no warning. So read the touched pack SOURCE and
    // require every statically-emitted (double-quoted) metric literal to already be
    // registered in slug_index. Templated slugs use backticks → skipped (they
    // resolve via raw_slug_patterns, not slug_index).
    const unregistered = unregisteredLiteralSlugs(changed);
    if (unregistered.length > 0) {
      block(
        "VOCAB/ALIAS — a pack emits a metric slug literal not registered (conditional-orphan guard)",
        `These metric slugs are written as literals in pack source but are NOT\n` +
          `registered in refinery/vocab/brain-vocabulary.json (no concept carries\n` +
          `them in raw_slugs). Even if a slug is emitted only conditionally (behind\n` +
          `an \`if\`), it MUST be registered now — otherwise it orphans master the\n` +
          `first day its data makes it computable.\n\n` +
          unregistered.map((u) => `  - ${u.slug}   (${u.file})`).join("\n") +
          `\n\nFix: add a documented concept with each slug in its raw_slugs, in THIS\n` +
          `commit, then retry — slug_index is derived from raw_slugs at load. (If a\n` +
          `slug is genuinely templated, emit it via a backtick template and register\n` +
          `a raw_slug_patterns glob instead.)`,
      );
    }
    // grade-coverage artifact drift: the committed _AUDIT_AND_ROADMAP/grade-coverage.json
    // must match a fresh sweep, and the §3 gradeability pin must hold. Exit-code
    // driven — `block()` fires on any non-zero regardless of captured output.
    const sweep = run("bun refinery/tools/grade-config-sweep.mts --check");
    if (sweep.ran && sweep.code !== 0) {
      block(
        "VOCAB — grade-coverage artifact drift (grade-config-sweep --check failed)",
        `Either the §3 gradeability pin regressed (gateVector all-green ≠\n` +
          `resolveGradeConfig.gradeable), or _AUDIT_AND_ROADMAP/grade-coverage.json is\n` +
          `stale vs the current vocabulary.\n\n` +
          `Fix: bun refinery/tools/grade-config-sweep.mts && \\\n` +
          `     git add _AUDIT_AND_ROADMAP/grade-coverage.json\n` +
          `(commit the regenerated artifact in THIS push), then retry.\n\n` +
          truncate(sweep.out),
      );
    }
  }

  // ---- Gate 5: pack ⇆ catalog mirror + fast per-pack assertions -------------
  // The redfin-lee parity build (d9aa670, 2026-06-13) shipped a refinery/packs edit
  // that drifted catalog.mts from PER_PACK_REGISTRY (domain/scope/ttl) AND broke a
  // per-pack "source connectors wired" assertion. Both are DETERMINISTIC failures
  // `bun test` catches in CI — but NO pre-push gate ran them, so red main sat ~2h
  // across 5 pushes before anyone noticed. catalog.test.mts is a pure mirror (imports
  // only catalog.mts + index.mts — no DB, no creds; verified 4-pass on an empty env),
  // so it is the env-SAFE hard block. Per-pack bun:test files are ADDITIVE and also
  // env-safe (fixture round-trips / static assertions). The vitest per-pack files
  // (zhvi/zori GATE A + *-view-equivalence) spawn a DuckDB/Postgres subprocess that
  // only resolves in CI; they are SKIPPED locally (advisory), never blocked, so
  // active §04/§06 view-parity work is never wedged.
  if (changed.some((f) => f.startsWith("refinery/packs/") && f.endsWith(".mts"))) {
    const catalog = run("bun test refinery/packs/catalog.test.mts");
    if (catalog.ran && catalog.code !== 0) {
      block(
        "PACK/CATALOG — leaf catalog drifted from PER_PACK_REGISTRY",
        `refinery/packs/catalog.mts (the MCP capability inventory) no longer mirrors\n` +
          `PER_PACK_REGISTRY: a missing/extra brain id, or a domain/scope/ttl_seconds\n` +
          `that drifted from the pack definition. CI's \`bun test\` goes red on this the\n` +
          `moment it lands; this gate stops it before main (incident 2026-06-13,\n` +
          `redfin-lee parity build).\n\n` +
          `Fix: reconcile refinery/packs/catalog.mts with the pack — add/remove the\n` +
          `BRAIN_CATALOG entry, or align domain/scope/ttl_seconds — then retry.\n\n` +
          truncate(catalog.out),
      );
    }
    const packFails = runTouchedPackTests(changed);
    if (packFails.length > 0) {
      block(
        "PACK — a fast per-pack assertion failed (real drift, not env)",
        `A touched pack's own bun:test failed on a fast, deterministic assertion —\n` +
          `not a subprocess timeout or network error. This is the per-pack breaker\n` +
          `class: e.g. "source connectors wired" drifting when a pack's sources change\n` +
          `(incident 2026-06-13, properties-lee-value), or key_metrics math.\n\n` +
          packFails.map((p) => `  • ${p.file}\n${truncate(p.out, 800)}`).join("\n\n") +
          `\n\nFix the pack (or the assertion), then retry. If this is genuinely an\n` +
          `environment/credentials failure that escaped the transient filter, set\n` +
          `ALLOW_PACK_TEST_ENV_FAIL=1 to push anyway (logged).`,
      );
    }
  }

  // ---- Gate 6: BRAIN_GEO coverage (located-answer prod-500 backstop) --------
  // A brain added to BRAIN_CATALOG (refinery/packs/index.mts → catalog.mts) MUST have
  // a matching entry in lib/zip-dossier.ts BRAIN_GEO. assembleLocationDossier throws on
  // any catalog brain with no geo entry, so POST /api/assistant returns HTTP 500 for
  // EVERY question naming a SWFL place — a live located-answer outage. This shipped
  // TWICE (active-listings-swfl 1fb32c1f + market-heat-swfl ffdd28d9, incident
  // 2026-06-25): the G2 reproduction test (lib/zip-dossier.test.ts) was red locally the
  // whole time but was NOT a pre-push gate, so the outage went to prod. This is that
  // gate. Fires on a catalog/registry/geo edit; runs the canonical G2 assertion, which
  // is env-safe (fixtures only — no DB, no network).
  const geoTouched = changed.some(
    (f) =>
      f === "refinery/packs/catalog.mts" ||
      f === "refinery/packs/index.mts" ||
      f === "lib/zip-dossier.ts",
  );
  if (geoTouched) {
    const geo = run('bun test lib/zip-dossier.test.ts -t "BRAIN_GEO"');
    if (geo.ran && geo.code !== 0) {
      block(
        "BRAIN_GEO — a catalog brain has no geo entry (located answers will 500)",
        `A brain is in BRAIN_CATALOG but missing from lib/zip-dossier.ts BRAIN_GEO.\n` +
          `assembleLocationDossier throws on any catalog brain with no geo entry, so\n` +
          `POST /api/assistant returns HTTP 500 for EVERY question naming a SWFL place\n` +
          `(incident 2026-06-25: active-listings-swfl + market-heat-swfl each shipped a\n` +
          `live prod outage exactly this way — the test was red locally but ungated).\n\n` +
          `Fix: add a BRAIN_GEO entry { grains, covers } for the brain named below, in\n` +
          `THIS commit — grains finest-first; covers = the CountyFips[] it actually holds,\n` +
          `or "all" for a region/national footprint — then retry.\n\n` +
          truncate(geo.out),
      );
    }
  }

  // ---- Gate 7: registry ⇆ workflow ⇆ pipeline identity ----------------------
  // The wrong-letter class: a registry field that disagrees with the workflow YAML
  // or the pipeline Python goes silent for WEEKS (source_tag-vs-source_name cost two
  // weeks of false-RED on daily_truth; usgs_tier2 names a writer that does not exist
  // and env-swfl reads the frozen table live). --static reads FILES only — no DB, no
  // gh — so it is hook-safe, and every sub-check that cannot run degrades to a WARN
  // rather than a block (fail-OPEN, same as Gate 2/5).
  const identityTouched = changed.some(
    (f) =>
      f === "ingest/cadence_registry.yaml" ||
      f.startsWith(".github/workflows/") ||
      ((f.startsWith("ingest/pipelines/") || f.startsWith("ingest/duckdb_pipelines/")) &&
        f.endsWith(".py")),
  );
  if (identityTouched) {
    const identity = run("bun ingest/tools/check-registry-identity.mts --static");
    if (identity.ran && identity.code !== 0) {
      block(
        "REGISTRY IDENTITY — a config identity string drifted from the code it names",
        `A cadence_registry entry disagrees with the workflow YAML or the pipeline\n` +
          `Python it points at. Each failure below names BOTH sides.\n\n` +
          `Fix ONE of:\n` +
          `  • correct the drifting side (the usual answer — e.g. wire the secret into\n` +
          `    the workflow \`env:\`, or align dlt_schema_name with \`pipeline_name=\`);\n` +
          `  • state the truth structurally (\`dispatch_only: true\`, \`parked: true\`,\n` +
          `    \`schema_static: unverifiable\`, or a \`coverage_exempt: {table, reason}\`);\n` +
          `  • if it needs an operator decision, open a check and record it:\n` +
          `      node scripts/check.mjs open <project> <key> "<label>"\n` +
          `    then add \`known_drift: [{rule: <rule>, check: <key>}]\` to the entry.\n` +
          `    (RULE 2.4 — no silent deferrals. A prose note is not a deferral.)\n\n` +
          truncate(identity.out),
      );
    }
  }

  // ---- Gate 10: schedule-catalog membership (spec 2026-07-20) ---------------
  // ONE catalog: every scheduled surface (active-cron GHA workflow, vercel.json
  // cron) is registered in ingest/cadence_registry.yaml — pipelines:/
  // not_yet_running:/jobs: all count, because all three use the same `workflow:`
  // field. Membership is a FIELD match, NOT bare text-presence: the ref must
  // appear as an actual `workflow: <ref>` value, so a workflow merely name-dropped
  // in a comment or in another entry's `purpose:` prose does NOT count as
  // registered (29 of the 77 active-cron workflows are mentioned that way — a
  // text-presence check would hand them a free pass). This mirrors
  // scripts/schedule-catalog.mjs's isRegisteredRef EXACTLY; if the two ever
  // disagree about "registered", the gate is worthless. Both sides read HEAD, so
  // registering in the SAME commit passes. That script is the working-tree twin
  // (full-repo sweep + JSON view); its test file pins both shapes.
  scheduleCatalogGate(changed);

  // ---- Gate 11: source-coverage ratchet (operator decree 08/02/2026) --------
  // "Land the ratcheting lint first — everything before the hook lands is still
  // trust." Every pipeline entry declares source_scope + source_ceiling +
  // raw_landing_class; existing gaps are grandfathered in a committed baseline
  // that may only SHRINK. Ten prose trackers went unread; this is the one that
  // fails a push instead. Pure rules + positive controls:
  // lib/coverage-ratchet{,.test}.mjs.
  coverageRatchetGate(changed, base);

  // ---- Gate 12: brain-first — a new data_lake table nothing READS -----------
  // CLAUDE.md has always said "no bulk ingest hits Tier 2 (data_lake.*) without its
  // consuming brain's PackDefinition in the same PR." Gates 1-11 never implemented
  // it, so on 08/03/2026 three populated tables (245 neighborhoods / 16,304 amenity
  // businesses / 19,805 paired properties) pushed clean with zero readers anywhere in
  // refinery/ lib/ app/ — found a day later only because the operator asked. Prose
  // doctrine is not a gate; this is. Rules + positive controls against that exact
  // migration: lib/table-consumer{,.test}.mjs. Escape: ALLOW_TABLE_WITHOUT_CONSUMER=1.
  tableConsumerGate(base);

  // ---- Gate 13: a new SCHEDULED workflow that spends metered quota by default --
  // Born 08/04/2026: a `!= 'false'` job condition made a 500-call/day SteadyAPI
  // cron run whenever its flag was unset, and it was reported to the operator as
  // gated behind his approval. Rules + tests: lib/cron-failclosed{,.test}.mjs.
  // Escape: ALLOW_UNGATED_PAID_CRON=1.
  cronFailClosedGate(base);

  // ---- Gate 14: THE SAME ROOT, BUILT TWICE ---------------------------------
  // Operator decree 08/04/2026. Three typed tables landed 08/03 parsing
  // steadyapi_property_history_raw; the NEXT DAY a different session parsed the same
  // arrays into three views at IDENTICAL row counts (235,383 / 273,051 / 79,281) and
  // called them new roots. Every guard was green: repolith claims and git merge are
  // FILE-level and the sessions touched different files; Gate 12 wants a reader and
  // these had one; tests and typecheck passed. Nothing compared CONCEPTS. This does —
  // it keys on (source relation + the json array exploded), so three families off one
  // raw table stay legal while a second parse of the same array does not. Rules +
  // positive controls against the real artifacts: lib/duplicate-root{,.test}.mjs.
  // Escape: ALLOW_DUPLICATE_DERIVATION=1.
  duplicateRootGate(base);

  // ---- Gate 15: capture freshness — email code can't ship without its re-bake --
  // Strike registry shape `fixed-but-not-live`, 5 strikes before this existed
  // (_ASSISTANT/STRIKES.md). The recurring incident: recipe/render code is "fixed",
  // the push ships, but the baked capture under public/new-emails/ — the bytes the
  // operator actually opens on /showcase — was never re-rendered, so the site shows
  // the OLD email and the fix is announced-but-invisible ("just-sold fixed but
  // STILL THE SAME on the site", 08/10/2026).
  captureFreshnessGate(changed);

  // ---- Gate 16: ingest dispatch ack — a pipeline source change is not live ---
  // until its run lands rows. Strike 6 of `fixed-but-not-live` (08/10/2026): the
  // redfin_city_swfl retarget (9b020426) pushed green at 13:11, its cron fires
  // monthly on the 18th, nobody dispatched the run, and the operator found the
  // desk hero still serving May closes that night ("why the fuck is this still
  // 5/30... i just had it fucking fixed yesterday"). Gate 15 covers email
  // captures; this covers the ingest half of the same shape.
  ingestDispatchGate(changed);

  // ---- Gate 8: ZIP scope root (Lee + Collier, 57) ---------------------------
  // Coverage has ONE root (isCoreScope, refinery/lib/core-scope.mts) and the leak
  // still reopened twice, because nothing FORCED a new surface to call it: the
  // narrative bake enumerated 91 ZIPs off a Gulf-coast-wide feed and was one Monday
  // from paying a model to write about Bradenton; the homepage map kept its own
  // private 57-ZIP list that agreed only by hand. The lake really does hold
  // out-of-scope rows (home values: 109 ZIPs, 56 Sarasota/Charlotte/mailing), so an
  // ungated ZIP-grain read is a live leak, not a theory. Fail-closed on touched files.
  const scope = run("node scripts/check-zip-scope-gate.mjs");
  if (scope.ran && scope.code !== 0) {
    block(
      "ZIP scope root — a ZIP-grain surface bypasses isCoreScope (Lee + Collier, 57)",
      truncate(scope.out),
    );
  }

  // ---- Gate 9: ledger enforcement (per-unit coverage ledgers) --------------
  // An "Enforced" claim in a *.ledger.md names a real test. If that test file
  // or test string no longer exists, the ledger is reading as safety that
  // isn't there — worse than no ledger (spec
  // docs/superpowers/specs/2026-07-15-per-unit-coverage-ledgers-design.md §4).
  // Fires when a push touches: the ledger file itself, the recipe's SOURCE
  // (.ts), OR the recipe's TEST file (.test.ts) — the last one is the gate's
  // own central case (a renamed/deleted test string, which is exactly what
  // orphans a claim) and is easy to miss because the spec's own §4 wording
  // ("the unit's own source") reads as source-only. Verified against a direct
  // trace: a push editing ONLY price-reduced.test.ts (renaming the string an
  // Enforced claim names) must still trigger this gate.
  const ledgerTouched = changed.filter((f) =>
    /^lib\/deliverable\/recipes\/[a-z-]+\.ledger\.md$/.test(f),
  );
  const ledgerForTouchedUnit = changed
    .map((f) => {
      const m = /^lib\/deliverable\/recipes\/([a-z-]+)\.(?:ts|test\.ts)$/.exec(f);
      return m ? `lib/deliverable/recipes/${m[1]}.ledger.md` : null;
    })
    .filter(Boolean);
  const allTouchedLedgers = [...new Set([...ledgerTouched, ...ledgerForTouchedUnit])];

  if (allTouchedLedgers.length > 0) {
    const orphanReport = [];
    const testFilesToRun = new Set();
    for (const ledgerFile of allTouchedLedgers) {
      let ledgerSrc;
      try {
        ledgerSrc = sh(`git show HEAD:${ledgerFile}`);
      } catch {
        continue; // ledger file doesn't exist at HEAD (not yet authored) — nothing to check
      }
      const { enforced } = parseLedger(ledgerSrc);
      const orphans = findOrphanedClaims(enforced, {
        // `f` here is `entry.testFile`, parsed straight out of free-text ledger
        // markdown (the `Test: <file> > "<string>"` line) — not a validated path.
        // Reject anything outside the safe-path shape BEFORE it reaches `sh()`
        // (which shells out via execSync with `f` interpolated raw). Throwing is
        // the correct outcome either way: findOrphanedClaims treats any readFile
        // throw as reason: "missing-file", and an Enforced claim naming an
        // unsafe/malformed test-file reference can't be verified as protected —
        // that's a real defect, same as a genuinely missing file.
        readFile: (f) => {
          if (!isSafeTestFilePath(f)) {
            throw new Error(`unsafe test file path in ledger: ${f}`);
          }
          return sh(`git show HEAD:${f}`);
        },
      });
      for (const o of orphans) orphanReport.push({ ledgerFile, ...o });
      for (const e of enforced) testFilesToRun.add(e.testFile);
    }

    if (orphanReport.length > 0) {
      block(
        "LEDGER — an Enforced claim's test no longer exists",
        orphanReport
          .map(
            (o) =>
              `  ${o.ledgerFile}\n    Claim: ${o.claim}\n    ${o.reason === "missing-file" ? `Test file gone: ${o.testFile}` : `Test string no longer found in ${o.testFile}: "${o.testString}"`}`,
          )
          .join("\n\n") +
          `\n\nFix: either the code/test regressed (restore it) or the ledger is stale (correct or\n` +
          `remove the claim, and move it to Unenforced if it's no longer test-backed), then retry.`,
      );
    }

    const testFailures = [];
    for (const testFile of testFilesToRun) {
      // Same class of problem as the readFile callback above, different
      // sh-family call (`run`, which also shells out via execSync). Any
      // testFile that fails this check already threw inside the readFile
      // callback above and produced an orphan — which blocks the push before
      // this loop is ever reached — so this is a defense-in-depth skip, not
      // the primary catch.
      if (!isSafeTestFilePath(testFile)) continue;
      const res = run(`bun test ${testFile}`);
      if (res.ran && res.code !== 0 && !isPackTestEnvFailure(res.out)) {
        testFailures.push({ file: testFile, out: res.out });
      }
    }
    if (testFailures.length > 0) {
      block(
        "LEDGER — a test an Enforced claim depends on is failing",
        testFailures.map((t) => `  • ${t.file}\n${truncate(t.out, 800)}`).join("\n\n") +
          `\n\nFix the test or the code it protects, then retry.`,
      );
    }
  }

  // ---- Gate 3: secret wiring (BLOCKS as of 07/22/2026) ----------------------
  // WAS advisory — literally labelled "(advisory, never blocks)" and doing nothing
  // but a stdout NOTE. Its class ("secret wired in the repo but never passed to the
  // workflow") is documented in docs/cron-rebuild-failures.md with three May–June
  // instances AND a prescription, and then RECURRED 07/15/2026: 23410a45
  // "fix(ci): wire SUPABASE_PG_* secrets into daily-rebuild.yml", plus the follow-on
  // 57db3f8d. It recurred because the guard built to stop it was built not to stop
  // anything. Recording half shipped; acting half never did.
  //
  // WHY IT IS SAFE TO BLOCK — measured, not assumed. A naive "required env var
  // missing" rule flags 5 of 112 workflows, nearly all tuning knobs (DRY_RUN,
  // WEEKLY_READ_PREVIEW_ZIP) whose absence is harmless, plus fallback halves of
  // `A ?? process.env.B`. Narrowing to names the repo ACTUALLY manages as GitHub
  // secrets (referenced as `secrets.NAME` in some workflow) flags **0 of 112** on
  // the current tree — zero false positives, so this cannot wedge a push today,
  // and it bites exactly the class that broke the rebuild twice.
  secretWiringGate(changed);

  // ---- Gate 4: ingest hardening (BIBLE §0.2) --------------------------------
  // Backstop against the ONE irreversible ingest failure: a destructive write
  // (write_disposition="replace"/truncate) shipped with NO non-null guard, so a
  // bad/empty pull or a silent vendor field-rename wipes good data. Detection is
  // EXACT-STRING on the one canonical guard (ingest/lib/guards.py) — no fuzzy
  // "looks like a null check" heuristics (that's where false-positive wedges
  // live). The other three §0.2 artifacts (narrow $select, ArcGIS outFields,
  // cadence registration) are wasteful-but-recoverable → advise only.
  ingestHardeningGate(changed);

  process.exit(0);
});

// Match both the raw `git push` and the mandated `node scripts/safe-push.mjs`
// wrapper. safe-push runs `git push` in a child process the Bash PreToolUse hook
// can't intercept, so matching the wrapper command here is the only way the gate
// fires on the path operators are actually told to use.
function isGitPush(cmd) {
  return /(^|\s|&&|;|\|\|)\s*git\s+push(\s|$)/.test(cmd) || /safe-push(\.mjs)?\b/.test(cmd);
}

// Set from the push command itself — worktree pushes get gated in THEIR repo
// (see push-context.mjs), and the gates' test commands run there too.
let REPO_CWD = process.cwd();

function sh(c) {
  return execSync(c, { stdio: ["ignore", "pipe", "ignore"], cwd: REPO_CWD })
    .toString()
    .trim();
}

// Gate 9 guard: a `.ledger.md`'s `Test: <file> > "<string>"` line is free-text
// markdown content, not a validated path, but Gate 9 interpolates its testFile
// value directly into shell commands (`sh()`/`run()`, both execSync-backed).
// A real test file path in this repo only ever contains letters, digits, `.`,
// `/`, `-`, and `_` (e.g. lib/deliverable/recipes/price-reduced.test.ts) — so
// reject anything outside that shape BEFORE it reaches a shell command string.
// This must run ahead of EVERY sh()/run() call built from ledger-parsed content.
const SAFE_TEST_FILE_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;
function isSafeTestFilePath(f) {
  return typeof f === "string" && SAFE_TEST_FILE_RE.test(f);
}

// Run a command, capturing combined output and exit code. `ran:false` means the
// command could not be spawned at all (e.g. bun not on PATH) — caller fails open.
function run(c) {
  try {
    const out = execSync(c, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      cwd: REPO_CWD,
    });
    return { ran: true, code: 0, out };
  } catch (err) {
    if (typeof err?.status !== "number") {
      // Spawn failure, not a test failure — fail open with a warning.
      process.stdout.write(
        `\n[pre-push gate] WARN: could not run \`${c}\` (${err?.code ?? "unknown"}); ` +
          `skipping this check.\n`,
      );
      return { ran: false, code: 0, out: "" };
    }
    return {
      ran: true,
      code: err.status,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

function truncate(s, max = 2000) {
  const t = String(s || "").trim();
  return t.length > max ? `${t.slice(0, max)}\n… (truncated)` : t;
}

// ---- Gate 3 internals -----------------------------------------------------
// The rule itself is pure and lives in lib/secret-wiring.mjs so it can be proven by
// test; this file only supplies the filesystem. (Importing THIS file from a test
// hangs the runner — it attaches a stdin handler at module scope.)
function readOrNull(abs) {
  try {
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  } catch {
    return null;
  }
}

function secretWiringGate(changed) {
  if (process.env.ALLOW_MISSING_WORKFLOW_SECRET === "1") return;
  const touched = changed.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f));
  if (touched.length === 0) return;

  const wfDir = join(REPO_CWD, ".github", "workflows");
  let allWorkflowTexts = [];
  try {
    allWorkflowTexts = readdirSync(wfDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => readOrNull(join(wfDir, f)))
      .filter((t) => t != null);
  } catch {
    return; // no workflows dir — nothing to gate
  }

  const findings = findUnwiredSecrets({
    touched,
    allWorkflowTexts,
    readWorkflow: (wf) => readOrNull(join(REPO_CWD, wf)),
    readScript: (s) => readOrNull(join(REPO_CWD, s)),
  });

  if (findings.length > 0) {
    block(
      "SECRET WIRING — a touched workflow runs a script whose secret it never passes",
      findings.join("\n") +
        `\n\n\`gh secret set\` is step 1; adding it to the workflow's \`env:\` block is\n` +
        `step 2. This exact class aborted the daily rebuild in May, June, and again\n` +
        `on 07/15/2026 (23410a45). See docs/cron-rebuild-failures.md.\n\n` +
        `Override (only if the var is supplied another way): ALLOW_MISSING_WORKFLOW_SECRET=1`,
    );
  }
}

function block(title, body) {
  const msg = `\n${BANNER}\nPUSH BLOCKED — ${title}\n${BANNER}\n${body}\n${BANNER}\n`;
  process.stdout.write(msg);
  process.stderr.write(msg);
  process.exit(2);
}

// True if any of package.json's dependency maps differ between base and HEAD.
// A scripts-only / metadata-only edit returns false → no false lockfile block.
function depsChanged(base) {
  const keys = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  let basePkg, headPkg;
  try {
    basePkg = JSON.parse(sh(`git show ${base}:package.json`));
    headPkg = JSON.parse(sh(`git show HEAD:package.json`));
  } catch {
    // Can't read one side (new file, parse error) — be conservative and treat
    // a package.json change as dep-affecting so the lockfile rule still fires.
    return true;
  }
  for (const k of keys) {
    if (JSON.stringify(basePkg?.[k] ?? {}) !== JSON.stringify(headPkg?.[k] ?? {})) {
      return true;
    }
  }
  return false;
}

// Scan touched pack source for statically-emitted (double-quoted) metric slug
// literals and return any not present in the committed vocab's slug_index. The
// conditional-slug companion to `--all`: `--all` only sees slugs in a rendered
// .md, so a slug emitted behind an `if` is invisible until its data lands and
// orphans master with no warning. Reading the source catches it at push time.
// Both sides read HEAD so a slug registered in the SAME commit counts as covered.
// Fails OPEN (returns []) on any internal error — a broken guard must never wedge
// every push (mirrors the hook-wide fail-open design).
function unregisteredLiteralSlugs(changed) {
  try {
    const packs = changed.filter(
      (f) => f.startsWith("refinery/packs/") && f.endsWith(".mts") && !f.endsWith(".test.mts"),
    );
    if (packs.length === 0) return [];
    let vocabRaw;
    try {
      vocabRaw = sh("git show HEAD:refinery/vocab/brain-vocabulary.json");
    } catch {
      return []; // can't read vocab at HEAD — fail open
    }
    // slug_index is DERIVED from concepts[].raw_slugs at load (2026-07-19) — the
    // JSON no longer carries a block. Union both sources so the guard is correct
    // on either side of that transition (old HEADs still have the block).
    const vocabJson = JSON.parse(vocabRaw) ?? {};
    const registered = new Set(Object.keys(vocabJson.slug_index ?? {}));
    for (const concept of Object.values(vocabJson.concepts ?? {})) {
      for (const slug of concept?.raw_slugs ?? []) registered.add(slug);
    }
    const found = [];
    const seen = new Set();
    for (const file of packs) {
      let src;
      try {
        src = sh(`git show HEAD:${file}`);
      } catch {
        continue; // file gone at HEAD (rename/delete) — skip
      }
      // `metric: "slug"` — double-quoted literal only. Backtick templates
      // (per-ZIP / per-corridor emissions) are intentionally skipped; they
      // resolve via raw_slug_patterns, not slug_index.
      const re = /\bmetric:\s*"([a-z0-9_]+)"/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const slug = m[1];
        const key = `${file}::${slug}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!registered.has(slug)) found.push({ slug, file });
      }
    }
    return found;
  } catch {
    return []; // never wedge a push on a guard bug
  }
}

// Run the sibling <name>.test.mts of each touched non-test pack source and return
// only FAST, deterministic assertion failures (real drift). Skips:
//   • catalog.mts / index.mts (the catalog mirror is gated separately above),
//   • brand-new packs with no sibling test yet (the catalog mirror still gates them),
//   • vitest per-pack files — the zhvi/zori GATE A + *-view-equivalence tests spawn a
//     DuckDB/Postgres subprocess that only resolves in CI; running them in the local
//     pre-push context just times out, so they are advised + skipped (this is what
//     keeps active §04/§06 view-parity work from ever being wedged).
// A bun:test file that still fails in an env-looking way (timeout / subprocess /
// network / creds) is classified transient and ADVISED, never returned as a block
// (mirrors resilient-build.isTransientError). Fails OPEN ([]) on any internal error.
function runTouchedPackTests(changed) {
  try {
    if (process.env.ALLOW_PACK_TEST_ENV_FAIL === "1") return []; // operator escape
    const srcs = changed.filter(
      (f) =>
        f.startsWith("refinery/packs/") &&
        f.endsWith(".mts") &&
        !f.endsWith(".test.mts") &&
        f !== "refinery/packs/catalog.mts" &&
        f !== "refinery/packs/index.mts",
    );
    if (srcs.length === 0) return [];
    const failures = [];
    const seen = new Set();
    for (const src of srcs) {
      const testFile = src.replace(/\.mts$/, ".test.mts");
      if (seen.has(testFile)) continue;
      seen.add(testFile);
      let testSrc;
      try {
        testSrc = sh(`git show HEAD:${testFile}`);
      } catch {
        continue; // no sibling test (brand-new pack) — catalog mirror still gates it
      }
      // vitest files = the heavy subprocess / view-parity tests; CI-only, skip local.
      if (/from\s+["']vitest["']/.test(testSrc)) {
        process.stdout.write(
          `\n[pre-push gate] NOTE: skipped CI-only per-pack test ${testFile}\n` +
            `  (vitest + DuckDB/Postgres subprocess — does not resolve in the local\n` +
            `  pre-push context). The env-safe catalog mirror still gated this change.\n`,
        );
        continue;
      }
      const res = run(`bun test ${testFile}`);
      if (!res.ran || res.code === 0) continue;
      if (isPackTestEnvFailure(res.out)) {
        process.stdout.write(
          `\n[pre-push gate] ADVISE: ${testFile} failed in an environment-looking way\n` +
            `  (not real drift) — not blocking:\n` +
            truncate(res.out, 600) +
            `\n`,
        );
        continue;
      }
      failures.push({ file: testFile, out: res.out });
    }
    return failures;
  } catch {
    return []; // never wedge a push on a guard bug
  }
}

// Same transient/deterministic split resilient-build uses: a failure whose output
// names a subprocess, network, or credentials problem is environmental — not a real
// assertion drift — and must NOT block a local push.
function isPackTestEnvFailure(out) {
  return /timed out|subprocess failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|getaddrinfo|socket hang up|SUPABASE|credential|missing[_ ]secret|connect ECONN|password authentication|could not connect/i.test(
    String(out || ""),
  );
}

// Gate 4 body. Reads each touched ingest/pipelines/**.py at HEAD and checks the
// four BIBLE §0.2 artifacts. Blocks ONLY on the irreversible one (destructive
// write without a guard) and ONLY when BLOCK_REPLACE_WITHOUT_GUARD is true;
// everything else advises. Fails OPEN on any internal error.
function ingestHardeningGate(changed) {
  try {
    const files = changed.filter(
      (f) =>
        f.startsWith("ingest/pipelines/") &&
        f.endsWith(".py") &&
        !/(^|\/)test_|_test\.py$|\/tests?\//.test(f),
    );
    if (files.length === 0) return;

    const replaceNoGuard = [];
    const wideArcgis = [];
    const odataNoSelect = [];
    for (const file of files) {
      let src;
      try {
        src = sh(`git show HEAD:${file}`);
      } catch {
        continue; // gone at HEAD (rename/delete) — skip
      }
      const destructiveWrite =
        /write_disposition\s*=\s*["']replace["']/.test(src) || /\btruncate\b/i.test(src);
      // EXACT-STRING: the one canonical guard surface, no heuristics.
      const hasGuard =
        /ingest\.lib\.guards/.test(src) ||
        /\bassert_min_rows\s*\(/.test(src) ||
        /\bassert_vs_canonical\s*\(/.test(src) ||
        /\bassert_vs_baseline\s*\(/.test(src);
      if (destructiveWrite && !hasGuard) replaceNoGuard.push(file);

      // ArcGIS: bare paginate_arcgis( with no out_fields= → pulls "*" + geometry.
      // paginate_arcgis_tabular(...) and any call passing out_fields= are clean.
      if (/\bpaginate_arcgis\s*\(/.test(src) && !/out_fields\s*=/.test(src)) wideArcgis.push(file);

      // OData: a $top present with no $select → wide pull.
      if (/\$top/.test(src) && !/\$select/.test(src)) odataNoSelect.push(file);
    }

    const unregistered = unregisteredPipelineDirs(files);

    // --- the block (or advise) on the irreversible one: §0.2 rule 5 ----------
    if (replaceNoGuard.length > 0) {
      const body =
        `Destructive write (write_disposition="replace"/truncate) with NO non-null\n` +
        `guard — a bad/empty pull or a silent vendor field-rename will WIPE good data,\n` +
        `the one irreversible ingest failure. BIBLE §0.2 rule 5.\n\n` +
        replaceNoGuard.map((f) => `  - ${f}`).join("\n") +
        `\n\nFix: before the replace, compute each load-bearing column's non-null rate\n` +
        `via ingest.lib.guards (assert_min_rows / assert_vs_canonical + a non-null\n` +
        `floor) and abort below floor. Model: ingest/pipelines/fema/resources.py\n` +
        `_promote_nfip_to_tier2.`;
      const override = process.env.ALLOW_REPLACE_WITHOUT_GUARD === "1";
      if (BLOCK_REPLACE_WITHOUT_GUARD && override) {
        process.stdout.write(
          `\n[pre-push gate] OVERRIDE: ALLOW_REPLACE_WITHOUT_GUARD=1 — pushing a guardless\n` +
            `destructive write anyway (logged). Files:\n` +
            replaceNoGuard.map((f) => `  - ${f}`).join("\n") +
            `\n`,
        );
      } else if (BLOCK_REPLACE_WITHOUT_GUARD) {
        block("INGEST — destructive write without a non-null guard (BIBLE §0.2 rule 5)", body);
      } else {
        process.stdout.write(
          `\n[pre-push gate] ADVISE (Gate 4 — will BLOCK once the 4 legacy replace\n` +
            `pipelines are guarded; set BLOCK_REPLACE_WITHOUT_GUARD=true then):\n` +
            body +
            `\n`,
        );
      }
    }

    // --- advise on the recoverable ones --------------------------------------
    if (wideArcgis.length > 0)
      process.stdout.write(
        `\n[pre-push gate] ADVISE — ArcGIS pull with no outFields projection (BIBLE §0.2 rule 6):\n` +
          wideArcgis.map((f) => `  - ${f}`).join("\n") +
          `\n  paginate_arcgis() defaults out_fields="*" + geometry. Use\n` +
          `  paginate_arcgis_tabular(out_fields=…) with only the columns the normalizer reads.\n`,
      );
    if (odataNoSelect.length > 0)
      process.stdout.write(
        `\n[pre-push gate] ADVISE — OData $top with no $select (BIBLE §0.2 rule 2):\n` +
          odataNoSelect.map((f) => `  - ${f}`).join("\n") +
          `\n  $select only the fields the normalizer reads (also validates the field names).\n`,
      );
    if (unregistered.length > 0)
      process.stdout.write(
        `\n[pre-push gate] ADVISE — pipeline dir not found in cadence_registry.yaml (BIBLE §0.2 rule 7):\n` +
          unregistered.map((d) => `  - ${d}`).join("\n") +
          `\n  Register it (name/lane/cadence_days) so the freshness probe covers it, and\n` +
          `  confirm the cron is no more frequent than the source publishes.\n`,
      );
  } catch {
    // Gate 4 must never wedge a push on its own bug — fail open.
  }
}

// Dir-PRESENCE only. Returns touched ingest/pipelines/<dir>/ whose <dir> token
// does not appear anywhere in cadence_registry.yaml. It intentionally does NOT
// parse the registry or require any per-entry field — change_signal /
// vintage_policy / repro_pointer stay warn-only/additive (Row Layer decision);
// this check must NEVER hard-fail on a missing field. Reads HEAD so a dir
// registered in the same commit counts as present. Fails OPEN (returns []).
function unregisteredPipelineDirs(files) {
  try {
    let registry;
    try {
      registry = sh("git show HEAD:ingest/cadence_registry.yaml");
    } catch {
      return []; // no registry at HEAD — fail open
    }
    const dirs = new Set();
    for (const f of files) {
      const m = f.match(/^ingest\/pipelines\/([^/]+)\//);
      if (m) dirs.add(m[1]);
    }
    const missing = [];
    for (const d of dirs) if (!registry.includes(d)) missing.push(d);
    return missing;
  } catch {
    return [];
  }
}

// Gate 10 body. Only touched files are checked (the full-repo sweep lives in
// scripts/schedule-catalog.test.mjs "REPO SWEEP"). Commented-out crons do not
// count — a parked workflow with its cron commented is dispatch-only. Fails
// OPEN on any internal error; block() exits, so the catch never swallows it.
function scheduleCatalogGate(changed) {
  try {
    if (process.env.ALLOW_UNREGISTERED_CRON === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_UNREGISTERED_CRON=1 — pushing an\n` +
          `unregistered scheduled workflow anyway (logged).\n`,
      );
      return;
    }
    let registry;
    try {
      registry = sh("git show HEAD:ingest/cadence_registry.yaml");
    } catch {
      return; // no registry at HEAD — fail open
    }
    const missing = [];
    for (const f of changed) {
      const wf = /^\.github\/workflows\/([^/]+\.yml)$/.exec(f);
      if (wf) {
        let src;
        try {
          src = sh(`git show HEAD:${f}`);
        } catch {
          continue; // deleted at HEAD — nothing scheduled to register
        }
        if (!/^\s*-\s*cron:/m.test(src)) continue; // no ACTIVE cron
        if (!isRegisteredRefInline(registry, wf[1])) missing.push(wf[1]);
      }
      if (f === "vercel.json") {
        let vercel;
        try {
          vercel = JSON.parse(sh("git show HEAD:vercel.json"));
        } catch {
          continue; // gone/unparseable at HEAD — fail open for this file
        }
        for (const c of vercel?.crons ?? []) {
          // Same filter as schedule-catalog.mjs vercelCronRefs: an entry with no
          // schedule is not a scheduled surface.
          if (!c?.path || !c?.schedule) continue;
          const ref = `vercel.json#${c.path}`;
          if (!isRegisteredRefInline(registry, ref)) missing.push(ref);
        }
      }
    }
    if (missing.length === 0) return;
    block(
      "SCHEDULE CATALOG — a scheduled workflow has no cadence_registry entry (Gate 10)",
      `ONE catalog: everything that runs on a schedule is registered in\n` +
        `ingest/cadence_registry.yaml (spec 2026-07-20-schedule-catalog-design.md).\n` +
        `These scheduled surfaces are about to ship unregistered:\n\n` +
        missing.map((ref) => `  - ${ref}`).join("\n") +
        `\n\nFix: paste this under \`jobs:\` at the BOTTOM of ingest/cadence_registry.yaml,\n` +
        `fill the purpose line from the workflow's own \`name:\` field, commit it in\n` +
        `THIS push, then retry:\n\n` +
        missing.map((ref) => gate10SnippetInline(ref)).join("\n") +
        `\n\n(A mention in a comment or another entry's \`purpose:\` prose does NOT\n` +
        `register a workflow — the ref must be an actual \`workflow:\` field value.)\n` +
        `(An ingest SOURCE belongs under pipelines:/not_yet_running: instead — register\n` +
        `it there with lane/cadence so the freshness probe covers it.)\n` +
        `Operator escape for a legitimate one-off: ALLOW_UNREGISTERED_CRON=1.`,
    );
  } catch {
    // never wedge a push on a guard bug — fail open
  }
}

// Gate 12 body — the brain-first ingest gate, finally mechanized (08/04/2026).
//
// Fires only on ADDED .sql migrations and ADDED ingest pipeline .py files: a new
// table arrives with a new file, and looking only at additions means editing an old
// migration can never re-litigate a table that has been live for months.
//
// "Consumer" is decided by lib/table-consumer.mjs's isConsumerPath — a non-test file
// under refinery/ lib/ app/ components/ utils/ scripts/. The writer itself, the
// registry, the docs, and the tests explicitly do NOT count; a table catalogued in
// data-roots.md and read by nobody is precisely the failure being gated.
//
// Fail-OPEN on any internal error (a broken gate must never wedge a push).
// Fail-CLOSED on a real orphan. Escape: ALLOW_TABLE_WITHOUT_CONSUMER=1.
function tableConsumerGate(base) {
  try {
    if (process.env.ALLOW_TABLE_WITHOUT_CONSUMER === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_TABLE_WITHOUT_CONSUMER=1 — shipping a\n` +
          `data_lake table with no reader (logged).\n`,
      );
      return;
    }

    let added = [];
    try {
      added = sh(`git diff --name-only --diff-filter=A ${base}..HEAD`)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(isSafeTestFilePath); // same path-shape guard as Gate 9 before any sh()
    } catch {
      return; // fail open
    }
    if (added.length === 0) return;

    const tables = new Set();
    for (const f of added) {
      let body = "";
      try {
        body = sh(`git show HEAD:${f}`);
      } catch {
        continue;
      }
      if (/\.sql$/i.test(f)) for (const t of tablesCreatedInSql(body)) tables.add(t);
      if (/^ingest\/.*\.py$/i.test(f))
        for (const t of tablesDeclaredInPipeline(body)) tables.add(t);
    }
    if (tables.size === 0) return;

    // Where is each table named anywhere in the pushed tree? `git grep` at HEAD, so
    // wiring a consumer in the SAME commit passes — the gate asks for a reader in the
    // push, not a reader that predates it.
    const mentionsByTable = {};
    for (const t of tables) {
      const g = run(`git grep -lI --fixed-strings "${t}" HEAD`);
      mentionsByTable[t] =
        g.ran && g.code === 0
          ? g.out
              .split("\n")
              .map((l) => l.replace(/^HEAD:/, "").trim())
              .filter(Boolean)
          : [];
    }

    const orphans = orphanTables([...tables], mentionsByTable);
    if (orphans.length === 0) return;

    block(
      `BRAIN-FIRST — ${orphans.length} new data_lake table(s) that NOTHING reads`,
      `${orphans.map((t) => `  data_lake.${t}`).join("\n")}\n\n` +
        `Each table above is created by a file in this push and is referenced only by\n` +
        `its own writer, the registry, the docs, or a test — no product consumer under\n` +
        `refinery/ lib/ app/ components/.\n\n` +
        `This is CLAUDE.md's brain-first ingest gate, which was prose until 08/04/2026:\n` +
        `  "no bulk ingest hits Tier 2 (data_lake.*) without its consuming brain's\n` +
        `   PackDefinition in the same PR"\n` +
        `On 08/03/2026 three populated tables shipped past it — 245 neighborhoods,\n` +
        `16,304 amenity businesses, 19,805 paired properties — and were read by nothing\n` +
        `for a day, until the operator asked why.\n\n` +
        `Fix (either is legitimate):\n` +
        `  1. Wire a real consumer in THIS push — a brain source, a lib resolver, a\n` +
        `     recipe, or a route that actually SELECTs the table. A doc line is not a\n` +
        `     consumer; neither is a test that is the only reader.\n` +
        `  2. If the table is deliberately landing ahead of its consumer, say so out\n` +
        `     loud: ALLOW_TABLE_WITHOUT_CONSUMER=1 and open a check for the wiring in\n` +
        `     the same session (RULE 2.4 — no silent deferrals).`,
    );
  } catch {
    return; // never wedge a push on this gate's own bug
  }
}

// Gate 14 body — the same root, built twice (08/04/2026).
//
// Fires on ADDED **and MODIFIED** .sql / ingest .py files, unlike Gate 12 which looks at
// additions only. Deliberate: the 08/04 duplicate arrived as a NEW file, but the cheapest
// way to create the same collision tomorrow is to edit an existing view to re-parse an
// array something else already owns. Re-litigating an untouched months-old file is still
// impossible, because a file has to be in the push to be a candidate.
//
// The index it compares against is the pushed tree at HEAD — every .sql under docs/sql and
// migrations, plus every ingest/**.py. Python matters more than the SQL here: the 08/03
// migrations create EMPTY tables, and the link from table to source array lives only in the
// parser's SQL string. A gate that read .sql alone would have passed the exact push it
// exists to stop.
//
// Fail-OPEN on any internal error. Fail-CLOSED on a real collision.
// Escape: ALLOW_DUPLICATE_DERIVATION=1.
function duplicateRootGate(base) {
  try {
    if (process.env.ALLOW_DUPLICATE_DERIVATION === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_DUPLICATE_DERIVATION=1 — shipping a second\n` +
          `parse of an array another artifact already owns (logged).\n`,
      );
      return;
    }

    let touched = [];
    try {
      touched = sh(`git diff --name-only --diff-filter=AM ${base}..HEAD`)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(isSafeTestFilePath);
    } catch {
      return; // fail open
    }
    const isCandidate = (f) => /\.sql$/i.test(f) || /^ingest\/.*\.py$/i.test(f);
    const candidates = touched.filter(isCandidate);
    if (candidates.length === 0) return;

    const readAtHead = (f) => {
      try {
        return sh(`git show HEAD:${f}`);
      } catch {
        return "";
      }
    };

    // Only build the (expensive) index if something in the push actually CREATES a
    // data_lake object. A pushed probe script or a comment fix is not a candidate.
    const creating = candidates.filter((f) => objectsCreatedInSql(readAtHead(f)).length > 0);
    if (creating.length === 0) return;

    let indexPaths = [];
    try {
      indexPaths = sh(`git ls-tree -r --name-only HEAD`)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(isSafeTestFilePath)
        .filter(isCandidate);
    } catch {
      return; // fail open
    }
    const index = indexPaths.map((p) => ({ artifact: p, text: readAtHead(p) }));

    const hits = [];
    for (const f of creating) {
      for (const hit of findDerivationCollisions({ artifact: f, text: readAtHead(f) }, index)) {
        hits.push({ ...hit, newArtifact: f });
      }
    }
    if (hits.length === 0) return;

    const lines = hits
      .map(
        (h) =>
          `  data_lake.${h.newObject}  (${h.newArtifact})\n` +
          `    re-parses  ${h.key.replace("::", "  ->  ")}\n` +
          `    already owned by  ${h.existingArtifact}`,
      )
      .join("\n\n");

    block(
      `DUPLICATE ROOT — ${hits.length} second parse(s) of an array another artifact already owns`,
      `${lines}\n\n` +
        `The key is (source relation + the json array exploded), so three families off ONE\n` +
        `raw table remain legal — property_history, tax_history and building_permits do not\n` +
        `collide. What is blocked is a SECOND artifact exploding the SAME array.\n\n` +
        `THE INCIDENT THIS GATE IS ANCHORED TO (08/03-08/04/2026): three typed tables landed\n` +
        `parsing steadyapi_property_history_raw. The next day a different session parsed the\n` +
        `same arrays into three views at IDENTICAL row counts - 235,383 / 273,051 / 79,281 -\n` +
        `and a handoff called them new roots, one of them a "SOLE SOURCE". Both copies were\n` +
        `live, with DIFFERENT rules: the tables kept price=0 as a real price, the views NULLed\n` +
        `it; oldest event 1800-01-01 vs 1902-01-01. One question, two answers, depending on\n` +
        `which surface a caller reached. Every other guard was green - repolith claims and git\n` +
        `merges are FILE-level and the two sessions never touched the same file.\n\n` +
        `Fix (in order of what is usually right):\n` +
        `  1. READ the existing artifact. If it already does this, do not build it again -\n` +
        `     extend it, or build a READ LAYER on top of it (data-roots rule 4: ingest writes\n` +
        `     base tables, root views read them, consumers read root views). A view that\n` +
        `     SELECTs from the existing table is not a collision and will not trip this gate.\n` +
        `  2. If the two genuinely answer different questions, say which in\n` +
        `     docs/standards/data-roots.md - one root per concept - and set\n` +
        `     ALLOW_DUPLICATE_DERIVATION=1 with a check opened the same session (RULE 2.4).\n\n` +
        `Live half: this gate reads the REPO. An object created out of band has no artifact\n` +
        `to index - data_lake.steadyapi_property_permits is live in prod with no migration and\n` +
        `no parser anywhere, and this gate cannot see it. Run\n` +
        `  node scripts/check-duplicate-roots.mjs\n` +
        `to compare what is actually IN the database.`,
    );
  } catch {
    return; // never wedge a push on this gate's own bug
  }
}

// Gate 13 body — an UNATTENDED cron that spends metered vendor quota and runs by
// DEFAULT (08/04/2026).
//
// The incident: neighborhood-amenities-daily.yml landed with cron "30 9 * * *" and
//   if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}
// A NOT-EQUALS. An unset variable is not the string 'false', so the job runs — up to
// 500 SteadyAPI calls per day, unattended, on a schedule nobody approved. The session
// that wrote it then told the operator the drain was "blocked on an operator-only
// ENGINE_ENABLED flip", having never read the condition. Found a day later, by asking.
//
// check-no-paid-dispatch.mjs did not catch it because that guard defines paid as
// /ANTHROPIC_API_KEY/ — model credits only. SteadyAPI quota was in nobody's
// definition of money. lib/cron-failclosed.mjs names every metered key instead.
//
// Fires on ADDED workflow files only: retrofitting the 100+ existing workflows is a
// separate decision, and editing an old cron must not re-litigate it.
// Fail-OPEN on any internal error. Escape: ALLOW_UNGATED_PAID_CRON=1.
function cronFailClosedGate(base) {
  try {
    if (process.env.ALLOW_UNGATED_PAID_CRON === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_UNGATED_PAID_CRON=1 — shipping a scheduled\n` +
          `workflow that spends metered quota by default (logged).\n`,
      );
      return;
    }

    let added = [];
    try {
      added = sh(`git diff --name-only --diff-filter=A ${base}..HEAD`)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter(isSafeTestFilePath) // path-shape guard before any sh()
        .filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f));
    } catch {
      return; // fail open
    }
    if (added.length === 0) return;

    const files = [];
    for (const f of added) {
      try {
        files.push({ path: f, text: sh(`git show HEAD:${f}`) });
      } catch {
        continue;
      }
    }

    const violations = cronViolations(files);
    if (violations.length === 0) return;

    block(
      `UNGATED PAID CRON — ${violations.length} new scheduled workflow(s) that spend by default`,
      `${violations
        .map((v) => `  ${v.path}\n    spends: ${v.metered.join(", ")}\n    ${v.reason}`)
        .join("\n\n")}\n\n` +
        `Each workflow above runs on a CRON (no human present), spends METERED vendor\n` +
        `quota, and RUNS WHEN ITS ENABLING VARIABLE IS UNSET.\n\n` +
        `\`!= 'false'\` and \`== 'true'\` are OPPOSITE defaults for an unset variable.\n` +
        `On 08/03/2026 the not-equals form shipped on a 500-call/day SteadyAPI sweep and\n` +
        `was reported to the operator as gated behind his own approval. It was not.\n\n` +
        `Fix (either is legitimate):\n` +
        `  1. Make it fail-CLOSED — \`if: \${{ vars.YOUR_FLAG == 'true' }}\`, so the\n` +
        `     workflow cannot start spending until someone deliberately turns it on.\n` +
        `  2. If it is MEANT to run unattended from the moment it lands, say so out\n` +
        `     loud: ALLOW_UNGATED_PAID_CRON=1, and tell the operator the per-run call\n` +
        `     ceiling and the schedule in the same message — not the header comment's\n` +
        `     description of intent, the condition's actual behavior.`,
    );
  } catch {
    return; // never wedge a push on this gate's own bug
  }
}

// Gate 15 body. Fail-OPEN on internal error, BLOCK on violation, escape
// ALLOW_STALE_CAPTURE=1 (legitimate for pure refactors that provably leave the
// rendered bytes identical, doc-comment-only edits, or when the capture re-bake
// is blocked by a parallel session's file claim — say which in the push message).
function captureFreshnessGate(changed) {
  try {
    if (process.env.ALLOW_STALE_CAPTURE === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_STALE_CAPTURE=1 — email-surface code is\n` +
          `shipping without a re-baked capture (logged).\n`,
      );
      return;
    }
    const isEmailSurface = (f) =>
      (f.startsWith("lib/deliverable/") ||
        f.startsWith("lib/email/") ||
        /^scripts\/email\/render-.*\.mts$/.test(f)) &&
      !/\.test\.(ts|mts|tsx)$/.test(f) &&
      !f.endsWith(".md");
    const surface = changed.filter(isEmailSurface);
    if (surface.length === 0) return;
    const rebaked = changed.some((f) => /^public\/new-emails\/.*\.html$/.test(f));
    if (rebaked) return;
    block(
      "CAPTURE FRESHNESS — email code changed but no capture was re-baked (Gate 15)",
      `This push edits the email surface but ships no public/new-emails/*.html —\n` +
        `the bytes the operator actually opens. Five strikes of this shape are in\n` +
        `_ASSISTANT/STRIKES.md ("fixed-but-not-live"): the fix lands in code, the site\n` +
        `still shows the old email, and the repair gets announced as done.\n\n` +
        `Email-surface files in this push:\n` +
        surface.map((f) => `  - ${f}`).join("\n") +
        `\n\nFix: re-run the surface's acceptance render (scripts/email/render-*.mts) and\n` +
        `commit the refreshed capture in the SAME push.\n` +
        `Legitimate exceptions (pure refactor with identical bytes, capture blocked by a\n` +
        `parallel session's claim): ALLOW_STALE_CAPTURE=1 and say why in the message.`,
    );
  } catch {
    // never wedge a push on a guard bug — fail open
  }
}

// Gate 16 body. Fail-OPEN on internal error, BLOCK on violation. A change to an
// ingest pipeline's source-defining files (constants/resources/pipeline) only
// becomes real data when the workflow RUNS — and most of these crons are monthly,
// so a fix can sit dark for weeks while looking shipped. Two legal outs:
//   INGEST_RUN_DISPATCHED=1 — the run was dispatched this session (gh workflow run
//     or a live local run); say the run id/url in the push message.
//   ALLOW_NO_DISPATCH=1 — deliberately not running it (dry-run-only change, source
//     not live yet, cron imminent); say why in the push message.
function ingestDispatchGate(changed) {
  try {
    if (process.env.INGEST_RUN_DISPATCHED === "1") {
      process.stdout.write(
        `\n[pre-push gate] Gate 16: INGEST_RUN_DISPATCHED=1 — ingest source change\n` +
          `ships with its run dispatched (logged).\n`,
      );
      return;
    }
    if (process.env.ALLOW_NO_DISPATCH === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_NO_DISPATCH=1 — ingest source change is\n` +
          `shipping WITHOUT a dispatched run (logged; reason belongs in the message).\n`,
      );
      return;
    }
    const isSourceFile = (f) =>
      /^ingest\/pipelines\/[^/]+\/(constants|resources|pipeline)\.py$/.test(f);
    const touched = changed.filter(isSourceFile);
    if (touched.length === 0) return;
    block(
      "INGEST DISPATCH — pipeline source changed but no run was dispatched (Gate 16)",
      `This push edits what an ingest pipeline FETCHES or WRITES, but nothing here\n` +
        `says the pipeline actually ran. Strike 6 of "fixed-but-not-live"\n` +
        `(_ASSISTANT/STRIKES.md): the redfin_city retarget pushed green, its cron was\n` +
        `8 days out, and the desk served May closes into August.\n\n` +
        `Pipeline source files in this push:\n` +
        touched.map((f) => `  - ${f}`).join("\n") +
        `\n\nFix: dispatch the workflow (gh workflow run <workflow>.yml), verify rows\n` +
        `landed, then push with INGEST_RUN_DISPATCHED=1 and the run id in the message.\n` +
        `Deliberately not running it? ALLOW_NO_DISPATCH=1 and say why.`,
    );
  } catch {
    // never wedge a push on a guard bug — fail open
  }
}

// Gate 11 body. Fires when the registry OR the baseline is in the push. Reads
// both sides at HEAD plus the baseline at the push base (the ratchet reference).
// Fail-OPEN on any internal error; fail-CLOSED on a real violation.
const RATCHET_BASELINE = ".claude/hooks/lib/coverage-ratchet-baseline.json";
function coverageRatchetGate(changed, base) {
  try {
    if (process.env.ALLOW_COVERAGE_RATCHET === "1") {
      process.stdout.write(
        `\n[pre-push gate] OVERRIDE: ALLOW_COVERAGE_RATCHET=1 — skipping the\n` +
          `source-coverage ratchet (logged).\n`,
      );
      return;
    }
    const touched =
      changed.includes("ingest/cadence_registry.yaml") || changed.includes(RATCHET_BASELINE);
    if (!touched) return;

    let registry;
    try {
      registry = sh("git show HEAD:ingest/cadence_registry.yaml");
    } catch {
      return; // no registry at HEAD — fail open
    }
    const readJson = (ref) => {
      try {
        return JSON.parse(sh(`git show ${ref}:${RATCHET_BASELINE}`));
      } catch {
        return null; // absent/unparseable at that ref
      }
    };
    const baselineHead = readJson("HEAD");
    const baselineBase = readJson(base);

    const badClasses = invalidClasses(registry);
    if (badClasses.length > 0) {
      block(
        "COVERAGE RATCHET — invalid raw_landing_class value (Gate 11)",
        badClasses.map((b) => `  - ${b.name}: raw_landing_class: ${b.value}`).join("\n") +
          `\n\nAllowed values: ${ALLOWED_CLASSES.join(" | ")}\n` +
          `(paid_landed = raw bodies land via ingest/lib/raw_landing.py · scrape_fragile =\n` +
          `source can vanish, land bytes · free_refetchable = vendor archive IS the raw\n` +
          `store, do not copy it). Handoff:\n` +
          `docs/superpowers/handoffs/2026-08-02-coverage-contracts-all-sources-handoff.md`,
      );
    }

    const computed = computeGaps(registry);
    const verdict = ratchetVerdict({ computed, baselineHead, baselineBase });
    if (verdict.ok) return;

    if (verdict.newDebt.length > 0) {
      block(
        "COVERAGE RATCHET — the baseline only shrinks; new debt was added to it (Gate 11)",
        `These gaps were ADDED to ${RATCHET_BASELINE} instead of being filled:\n\n` +
          verdict.newDebt.map((a) => `  - ${a}`).join("\n") +
          `\n\nFill the missing block(s) in ingest/cadence_registry.yaml (FULL-SCOPE-FIRST:\n` +
          `cited source_url + as_of for scope/ceiling; raw_landing_class per the handoff\n` +
          `triage) and remove them from the baseline. New pipelines ship complete.\n` +
          `Operator escape for a legitimate one-off: ALLOW_COVERAGE_RATCHET=1.`,
      );
    }
    block(
      "COVERAGE RATCHET — registry gaps drifted from the committed baseline (Gate 11)",
      `Every pipeline entry declares source_scope + source_ceiling + raw_landing_class;\n` +
        `known gaps are grandfathered in ${RATCHET_BASELINE}\n` +
        `and burn DOWN from there. This push drifted:\n\n` +
        verdict.drift.map((d) => `  - ${d}`).join("\n") +
        `\n\nFix: fill the missing block(s) in the registry (preferred), or — ONLY for a\n` +
        `gap that shrank — update the baseline to match. Paste-ready current truth:\n\n` +
        truncate(baselineJson(computed), 3000) +
        `\nOperator escape for a legitimate one-off: ALLOW_COVERAGE_RATCHET=1.`,
    );
  } catch {
    // never wedge a push on a guard bug — fail open
  }
}

// Inline twin of scripts/schedule-catalog.mjs escapeRegExp. Escape a string for
// use inside a RegExp source (literal match).
function escapeRegExpInline(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Inline twin of scripts/schedule-catalog.mjs isRegisteredRef — MUST stay
// character-for-character identical to it. Is `ref` registered as an actual
// `workflow:` field value in the registry text — not merely name-dropped in a
// comment or another entry's `purpose:` prose? Matches a line like
// `    workflow: <ref>` (optionally followed by a trailing `# comment`), any
// leading whitespace, multiline mode. Bare text-presence (`registry.includes`)
// is NOT sufficient: 29 of the 77 active-cron workflows appear somewhere in the
// registry's prose, and nightly-chain.yml alone has 5 such mentions — every one
// of them would have satisfied a text-presence gate for free.
function isRegisteredRefInline(registryText, ref) {
  const re = new RegExp(`^\\s*workflow:\\s*${escapeRegExpInline(ref)}\\s*(#.*)?$`, "m");
  return re.test(String(registryText));
}

// Inline twin of scripts/schedule-catalog.mjs gate10Snippet (hooks stay
// self-contained; the script's test file pins this exact shape).
function gate10SnippetInline(ref) {
  const isVercel = ref.startsWith("vercel.json#");
  const name = isVercel
    ? ref
        .slice("vercel.json#".length)
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : ref.replace(/\.yml$/, "");
  return (
    `  - name: ${name}\n` +
    `    workflow: ${ref}\n` +
    `    purpose: <one line — what this job does>` +
    (isVercel ? `\n    scheduler: vercel` : ``)
  );
}
