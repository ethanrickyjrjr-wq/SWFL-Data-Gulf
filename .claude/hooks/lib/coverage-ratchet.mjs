// Gate 11 pure rules — SOURCE COVERAGE RATCHET (operator decree 08/02/2026:
// "land the ratcheting lint first — everything before the hook lands is still trust").
//
// Every pipeline entry in ingest/cadence_registry.yaml must declare:
//   • source_scope      — what we pull (FULL-SCOPE-FIRST, locked 07/14/2026)
//   • source_ceiling    — what the source offers beyond what we pull
//   • raw_landing_class — the coverage-handoff Step-C triage decision: do we keep
//                         the vendor's raw bytes? (paid_landed | scrape_fragile |
//                         free_refetchable)
//
// The RATCHET: existing gaps are grandfathered in a committed baseline
// (.claude/hooks/lib/coverage-ratchet-baseline.json). The baseline may only
// SHRINK. Three violations, all deterministic:
//   1. DRIFT      — computed gaps != baseline at HEAD (covers: new entry shipped
//                   incomplete; an entry regressed; a gap was fixed but the
//                   baseline wasn't shrunk in the same push). Fix is paste-ready.
//   2. NEW DEBT   — baseline at HEAD contains a gap absent from baseline at the
//                   push base: someone tried to ratchet the wrong way by adding
//                   their new gap to the baseline instead of filling the block.
//   3. BAD CLASS  — a raw_landing_class value outside the three allowed classes.
//
// Pure functions only — the hook supplies file/git IO. Provable by
// coverage-ratchet.test.mjs (positive controls: each violation MUST trip).

export const REQUIRED_KEYS = ["source_scope", "source_ceiling", "raw_landing_class"];
export const ALLOWED_CLASSES = ["paid_landed", "scrape_fragile", "free_refetchable"];

// Parse pipeline entries (everything before the top-level `jobs:` section — the
// pipelines:/not_yet_running: lists share the 2-space `  - name:` shape) and
// return { entryName: [missing required keys...] } for entries missing any.
// Complete entries are omitted — the result IS the burn-down list.
export function computeGaps(registryText) {
  const text = String(registryText ?? "");
  const jobsIdx = text.search(/^jobs:\s*$/m);
  const scoped = jobsIdx === -1 ? text : text.slice(0, jobsIdx);

  const entryRe = /^  - name:\s*([A-Za-z0-9_./-]+)/gm;
  const starts = [];
  let m;
  while ((m = entryRe.exec(scoped)) !== null) starts.push({ name: m[1], idx: m.index });

  const gaps = {};
  for (let i = 0; i < starts.length; i++) {
    const slice = scoped.slice(
      starts[i].idx,
      i + 1 < starts.length ? starts[i + 1].idx : undefined,
    );
    const missing = REQUIRED_KEYS.filter((k) => !new RegExp(`^\\s{4,}${k}:`, "m").test(slice));
    if (missing.length > 0) gaps[starts[i].name] = missing;
  }
  return gaps;
}

// Every raw_landing_class value must be one of ALLOWED_CLASSES.
// Returns [{name, value}] for offenders.
export function invalidClasses(registryText) {
  const text = String(registryText ?? "");
  const jobsIdx = text.search(/^jobs:\s*$/m);
  const scoped = jobsIdx === -1 ? text : text.slice(0, jobsIdx);
  const bad = [];
  const entryRe = /^  - name:\s*([A-Za-z0-9_./-]+)/gm;
  const starts = [];
  let m;
  while ((m = entryRe.exec(scoped)) !== null) starts.push({ name: m[1], idx: m.index });
  for (let i = 0; i < starts.length; i++) {
    const slice = scoped.slice(
      starts[i].idx,
      i + 1 < starts.length ? starts[i + 1].idx : undefined,
    );
    const cm = /^\s{4,}raw_landing_class:\s*([^\s#]+)/m.exec(slice);
    if (cm && !ALLOWED_CLASSES.includes(cm[1])) bad.push({ name: starts[i].name, value: cm[1] });
  }
  return bad;
}

// Flatten {entry: [keys]} to a Set of "entry::key" gap atoms.
function atoms(gapMap) {
  const s = new Set();
  for (const [name, keys] of Object.entries(gapMap ?? {})) {
    for (const k of keys ?? []) s.add(`${name}::${k}`);
  }
  return s;
}

// The verdict. computed = computeGaps(registry@HEAD); baselineHead = parsed
// baseline JSON @HEAD (null if absent); baselineBase = parsed baseline JSON at
// the push base (null if absent — first introduction, ratchet rule waived).
export function ratchetVerdict({ computed, baselineHead, baselineBase }) {
  const comp = atoms(computed);
  const head = atoms(baselineHead ?? {});
  const drift = [];
  for (const a of comp) if (!head.has(a)) drift.push(`${a}  (gap exists, not in baseline)`);
  for (const a of head)
    if (!comp.has(a)) drift.push(`${a}  (baseline lists it, gap is gone — shrink the baseline)`);

  const newDebt = [];
  if (baselineBase != null) {
    const base = atoms(baselineBase);
    for (const a of head) if (!base.has(a)) newDebt.push(a);
  }
  return {
    ok: drift.length === 0 && newDebt.length === 0,
    drift: drift.sort(),
    newDebt: newDebt.sort(),
  };
}

// Paste-ready baseline body for the drift error message — sorted, stable.
export function baselineJson(computed) {
  const sorted = {};
  for (const k of Object.keys(computed ?? {}).sort()) sorted[k] = [...computed[k]].sort();
  return JSON.stringify(sorted, null, 2) + "\n";
}
