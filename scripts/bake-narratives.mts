/**
 * Surface-narrative bake (spec docs/superpowers/specs/2026-07-09-zip-page-destination-design.md §Phase B;
 * batch migration: docs/superpowers/specs/2026-07-10-batch-narrative-bake-design.md).
 *
 *   bun scripts/bake-narratives.mts --surface zip [--keys 33920,33901] [--force] [--dry-run]
 *
 * Delta-gated: a surface bakes only when its inputs hash moved (--force overrides).
 * Three phases on the Message Batches API (50% of standard rates):
 *   Phase 0 — collect batches a prior run left pending (narrative_bake_batches rows)
 *   Phase 1 — assemble (delta-gated, unchanged) + submit ONE batch
 *   Phase 2 — poll until ended (or deadline → loud handoff; next run collects)
 * Guards (all mandatory, spec §Cost tracking & spend guards):
 *   - BAKE_CADENCE gate (weekly default → Mondays UTC; daily = every run; --force bypasses)
 *   - NARRATIVE_BAKE_RUN_CAP_USD per-run cap (default $1.00) — pre-submit sizing at batch
 *     rates; keys that don't fit are dropped LOUD and re-queue next run (hash never stored)
 *   - the metered client's own daily/monthly SpendCapError seam (refinery/agents/anthropic.mts;
 *     batches.create gates, batches.results logs each result at half rates)
 * Every result logs to api_usage_log as call_type "narrative_bake" (ops /spend line).
 * A validator failure keeps the previous row and fails the run loud (exit 1).
 */
import { getAnthropic, agentsAreMocked, SYNTHESIS_MODEL } from "../refinery/agents/anthropic.mts";
import { shouldRunToday } from "../lib/narratives/cadence";
import { inputsHash } from "../lib/narratives/hash";
import { buildNarrativePrompt, NARRATIVE_MAX_TOKENS } from "../lib/narratives/prompt";
import { validateNarrative } from "../lib/narratives/validate";
import { loadInputsHashes, upsertNarrative } from "../lib/narratives/store";
import {
  persistPendingBatch,
  loadPendingBatches,
  markBatchCollected,
  type BatchRequestEntry,
} from "../lib/narratives/batch-store";
import { sizeToCap } from "../lib/narratives/batch-estimate";
import { assembleZipBakeInputs, listZipSurfaceKeys } from "../lib/narratives/zip-inputs";
import {
  assembleCorridorBakeInputs,
  listCorridorSurfaceKeys,
} from "../lib/narratives/corridor-inputs";
import { assembleBrainBakeInputs, listBrainSurfaceKeys } from "../lib/narratives/brain-inputs";
import type { BakeInputs, NarrativeSectionsData } from "../lib/narratives/types";

type Args = { surface: string; keys: string[] | null; force: boolean; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  return {
    surface: get("--surface") ?? "zip",
    keys:
      get("--keys")
        ?.split(",")
        .map((k) => k.trim())
        .filter(Boolean) ?? null,
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
  };
}

const SURFACE_ADAPTERS: Record<
  string,
  { list: () => Promise<string[]>; assemble: (key: string) => Promise<BakeInputs | null> }
> = {
  zip: { list: listZipSurfaceKeys, assemble: assembleZipBakeInputs },
  corridor: { list: listCorridorSurfaceKeys, assemble: assembleCorridorBakeInputs },
  brain: { list: listBrainSurfaceKeys, assemble: assembleBrainBakeInputs },
};

function runCapUsd(): number {
  const n = Number(process.env.NARRATIVE_BAKE_RUN_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 1.0;
}

function parseSections(raw: string): NarrativeSectionsData {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  const parsed = JSON.parse(trimmed) as NarrativeSectionsData;
  if (typeof parsed.narration !== "string" || !Array.isArray(parsed.outlook)) {
    throw new Error("response JSON missing narration/outlook");
  }
  return parsed;
}

type WorkItem = {
  entry: BatchRequestEntry;
  inputs: BakeInputs;
  system: string;
  user: string;
  promptChars: number;
};

const POLL_INTERVAL_MS = Number(process.env.BAKE_POLL_INTERVAL_MS) || 60_000;
const POLL_DEADLINE_MS = Number(process.env.BAKE_POLL_DEADLINE_MS) || 80 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Validate + upsert one result. Returns "baked" | "failed". Previous row is
 *  kept on any failure (upsert only runs after a clean validate) — same
 *  semantics as the old per-key loop. */
async function landResult(
  entry: BatchRequestEntry,
  inputs: BakeInputs,
  rawText: string,
  model: string,
): Promise<"baked" | "failed"> {
  let sections: NarrativeSectionsData;
  try {
    sections = parseSections(rawText);
  } catch (e) {
    console.error(
      `[bake] ${entry.surface}/${entry.key} response not parseable (previous row kept):`,
      e instanceof Error ? e.message : e,
    );
    return "failed";
  }
  const errors = validateNarrative(sections, inputs);
  if (errors.length > 0) {
    console.error(
      `[bake] ${entry.surface}/${entry.key} FAILED validation (previous row kept):\n  ${errors.join("\n  ")}`,
    );
    return "failed";
  }
  await upsertNarrative({
    surface: entry.surface,
    surface_key: entry.key,
    sections,
    inputs_hash: entry.inputsHash,
    sources: inputs.sources,
    model,
  });
  return "baked";
}

type BatchResultRow = {
  custom_id: string;
  result: {
    type: string;
    message?: { model: string; content: Array<{ type: string; text?: string }> };
  };
};

type Tally = { baked: number; failed: number; skipped: number; failures: string[] };

/** Stream one ended batch's results and land each key. `inputsByCustomId` is
 *  the in-memory map for same-run collection; Phase 0 passes re-assembled
 *  inputs instead (hash-guarded — a drifted key is absent and skips). */
async function collectBatch(
  batchId: string,
  entries: BatchRequestEntry[],
  inputsByCustomId: Map<string, BakeInputs>,
): Promise<Tally> {
  const client = getAnthropic("narrative_bake");
  const byId = new Map(entries.map((e) => [e.customId, e]));
  const t: Tally = { baked: 0, failed: 0, skipped: 0, failures: [] };
  for await (const raw of await client.messages.batches.results(batchId)) {
    const row = raw as BatchResultRow;
    const entry = byId.get(row.custom_id);
    if (!entry) continue; // unknown id — not ours to land
    const inputs = inputsByCustomId.get(row.custom_id);
    if (!inputs) {
      t.skipped++; // Phase-0 hash drift — key re-bakes fresh this run
      continue;
    }
    if (inputsHash(inputs) !== entry.inputsHash) {
      // Invariant: a result only ever lands against the exact inputs it was
      // prompted from. A mismatch means wrong-map or drift — skip (key
      // re-bakes on a later run), never validate against foreign inputs.
      t.skipped++;
      console.error(
        `[bake] ${entry.surface}/${entry.key} inputs hash mismatch at collection — skipped (re-bakes later)`,
      );
      continue;
    }
    if (row.result.type !== "succeeded" || !row.result.message) {
      t.failed++;
      t.failures.push(`${entry.surface}/${entry.key}: batch result ${row.result.type}`);
      console.error(
        `[bake] ${entry.surface}/${entry.key} batch result ${row.result.type} (previous row kept)`,
      );
      continue;
    }
    const text = row.result.message.content.find((b) => b.type === "text")?.text ?? "";
    const landed = await landResult(entry, inputs, text, row.result.message.model);
    if (landed === "baked") {
      t.baked++;
      console.log(`[bake] ${entry.surface}/${entry.key} baked (batch ${batchId})`);
    } else {
      t.failed++;
      t.failures.push(`${entry.surface}/${entry.key}: validation/parse`);
    }
  }
  await markBatchCollected(batchId);
  return t;
}

/** Re-assemble a persisted batch's inputs with the hash guard: only keys whose
 *  fresh hash still matches the persisted one land; drifted keys re-bake fresh
 *  in this same run (their stored narratives hash never updated). */
async function reassembleGuarded(entries: BatchRequestEntry[]): Promise<Map<string, BakeInputs>> {
  const map = new Map<string, BakeInputs>();
  for (const entry of entries) {
    const adapter = SURFACE_ADAPTERS[entry.surface];
    const inputs = adapter ? await adapter.assemble(entry.key) : null;
    if (inputs && inputsHash(inputs) === entry.inputsHash) map.set(entry.customId, inputs);
  }
  return map;
}

/** Phase 0 — collect batches a prior run left pending. Still-processing
 *  batches are returned so Phase 2 polls them alongside today's submission,
 *  and their keys are excluded from Phase 1 (no double-spend). */
async function collectPending(): Promise<
  Tally & {
    inFlightKeys: Set<string>;
    inFlight: { batchId: string; entries: BatchRequestEntry[] }[];
  }
> {
  const client = getAnthropic("narrative_bake");
  const t: Tally = { baked: 0, failed: 0, skipped: 0, failures: [] };
  const inFlightKeys = new Set<string>();
  const inFlight: { batchId: string; entries: BatchRequestEntry[] }[] = [];
  for (const pending of await loadPendingBatches()) {
    const status = (await client.messages.batches.retrieve(pending.batchId)) as {
      processing_status: string;
    };
    if (status.processing_status !== "ended") {
      for (const e of pending.requests) inFlightKeys.add(`${e.surface}/${e.key}`);
      inFlight.push({ batchId: pending.batchId, entries: pending.requests });
      console.log(`[bake] pending batch ${pending.batchId} still ${status.processing_status}`);
      continue;
    }
    const inputsByCustomId = await reassembleGuarded(pending.requests);
    const c = await collectBatch(pending.batchId, pending.requests, inputsByCustomId);
    t.baked += c.baked;
    t.failed += c.failed;
    t.skipped += c.skipped;
    t.failures.push(...c.failures);
  }
  return { ...t, inFlightKeys, inFlight };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const surfaces = args.surface === "all" ? Object.keys(SURFACE_ADAPTERS) : [args.surface];
  if (args.surface === "all" && args.keys) {
    console.error("--keys requires a single named --surface (not all)");
    return 1;
  }
  for (const surface of surfaces) {
    if (!SURFACE_ADAPTERS[surface]) {
      console.error(
        `unknown surface "${surface}" — known: ${Object.keys(SURFACE_ADAPTERS).join(", ")}, all`,
      );
      return 1;
    }
  }

  const cadence = shouldRunToday(process.env.BAKE_CADENCE, new Date());
  if (!cadence.run && !args.force) {
    console.log(`[bake] skip: ${cadence.reason}`);
    return 0;
  }
  console.log(
    cadence.run
      ? `[bake] run: ${cadence.reason}`
      : `[bake] run: --force overrides cadence gate (${cadence.reason})`,
  );

  if (agentsAreMocked() && !args.dryRun) {
    console.error(
      "[bake] ANTHROPIC_API_KEY not set — refusing a real bake (use --dry-run offline)",
    );
    return 1;
  }

  const cap = runCapUsd();
  const t: Tally = { baked: 0, failed: 0, skipped: 0, failures: [] };

  // ── Phase 0 — collect what a prior run left pending ─────────────────────────
  let inFlightKeys = new Set<string>();
  let inFlight: { batchId: string; entries: BatchRequestEntry[] }[] = [];
  if (!args.dryRun) {
    const p0 = await collectPending();
    t.baked += p0.baked;
    t.failed += p0.failed;
    t.skipped += p0.skipped;
    t.failures.push(...p0.failures);
    inFlightKeys = p0.inFlightKeys;
    inFlight = p0.inFlight;
  }

  // ── Phase 1 — assemble (delta-gated, unchanged) + submit ONE batch ─────────
  const work: WorkItem[] = [];
  for (const surface of surfaces) {
    const adapter = SURFACE_ADAPTERS[surface];
    const keys = args.keys ?? (await adapter.list());
    const existing = args.force ? new Map<string, string>() : await loadInputsHashes(surface);
    for (const key of keys) {
      if (inFlightKeys.has(`${surface}/${key}`)) {
        t.skipped++; // a prior run's batch still holds this key — don't double-spend
        continue;
      }
      const inputs = await adapter.assemble(key);
      if (!inputs) {
        t.skipped++;
        continue;
      }
      const hash = inputsHash(inputs);
      if (existing.get(key) === hash) {
        t.skipped++;
        continue;
      }
      if (args.dryRun) {
        console.log(`[bake] would bake ${surface}/${key} (${inputs.facts.length} facts)`);
        t.baked++;
        continue;
      }
      const { system, user } = buildNarrativePrompt(inputs);
      work.push({
        entry: { customId: `req-${work.length}`, surface, key, inputsHash: hash },
        inputs,
        system,
        user,
        promptChars: system.length + user.length,
      });
    }
  }

  if (args.dryRun) {
    console.log(`[bake] done — dry-run baked=${t.baked} skipped=${t.skipped}`);
    return 0;
  }

  const { fit, dropped, estimatedUsd } = sizeToCap(work, cap);
  for (const d of dropped) {
    t.failures.push(
      `${d.entry.surface}/${d.entry.key}: dropped — run cap ($${cap.toFixed(2)}) estimate full`,
    );
  }
  if (dropped.length > 0) {
    console.error(
      `[bake] RUN CAP: estimate $${estimatedUsd.toFixed(2)} fits ${fit.length}/${work.length} keys — ${dropped.length} dropped (NARRATIVE_BAKE_RUN_CAP_USD)`,
    );
  }

  const toPoll = [...inFlight];
  const inputsByCustomId = new Map<string, BakeInputs>();
  let submittedBatchId: string | null = null;
  if (fit.length > 0) {
    const client = getAnthropic("narrative_bake");
    const batch = (await client.messages.batches.create({
      requests: fit.map((w) => ({
        custom_id: w.entry.customId,
        params: {
          model: SYNTHESIS_MODEL,
          max_tokens: NARRATIVE_MAX_TOKENS,
          system: w.system,
          messages: [{ role: "user" as const, content: w.user }],
        },
      })),
    })) as { id: string };
    // Persist BEFORE polling — a died run must leave a collectable trail.
    await persistPendingBatch(
      batch.id,
      fit.map((w) => w.entry),
    );
    submittedBatchId = batch.id;
    for (const w of fit) inputsByCustomId.set(w.entry.customId, w.inputs);
    toPoll.push({ batchId: batch.id, entries: fit.map((w) => w.entry) });
    console.log(
      `[bake] submitted batch ${batch.id} — ${fit.length} keys, estimate $${estimatedUsd.toFixed(3)} (batch rates)`,
    );
  }

  // ── Phase 2 — poll + collect ────────────────────────────────────────────────
  const deadline = Date.now() + POLL_DEADLINE_MS;
  const client = getAnthropic("narrative_bake");
  let outstanding = [...toPoll];
  while (outstanding.length > 0 && Date.now() < deadline) {
    const still: typeof outstanding = [];
    for (const b of outstanding) {
      const status = (await client.messages.batches.retrieve(b.batchId)) as {
        processing_status: string;
      };
      if (status.processing_status !== "ended") {
        still.push(b);
        continue;
      }
      // Same-run inputs apply ONLY to the batch this run submitted. Deciding by
      // customId overlap was the 07/19 outage: customIds are req-0, req-1, …
      // in EVERY run, so a prior run's batch always "matched" and its results
      // were validated against this run's unrelated inputs — 72 keys' results
      // discarded as invented-number failures. Prior-run batches re-assemble
      // with the hash guard instead.
      const inputsMap =
        b.batchId === submittedBatchId ? inputsByCustomId : await reassembleGuarded(b.entries);
      const c = await collectBatch(b.batchId, b.entries, inputsMap);
      t.baked += c.baked;
      t.failed += c.failed;
      t.skipped += c.skipped;
      t.failures.push(...c.failures);
    }
    outstanding = still;
    if (outstanding.length > 0) await sleep(POLL_INTERVAL_MS);
  }
  if (outstanding.length > 0) {
    console.error(
      `[bake] HANDOFF: ${outstanding.length} batch(es) still processing at deadline — next run's Phase 0 collects (rows persisted; results live 29 days): ${outstanding.map((b) => b.batchId).join(", ")}`,
    );
  }

  console.log(
    `[bake] done — surface=${args.surface} baked=${t.baked} skipped=${t.skipped} failed=${t.failed} (submit estimate $${estimatedUsd.toFixed(3)} at batch rates; real spend logs per result)`,
  );
  return t.failed > 0 || t.failures.length > 0 ? 1 : 0;
}

process.exit(await main());
