/**
 * Surface-narrative bake (spec docs/superpowers/specs/2026-07-09-zip-page-destination-design.md §Phase B).
 *
 *   bun scripts/bake-narratives.mts --surface zip [--keys 33920,33901] [--force] [--dry-run]
 *
 * Delta-gated: a surface bakes only when its inputs hash moved (--force overrides).
 * Guards (all mandatory, spec §Cost tracking & spend guards):
 *   - BAKE_CADENCE gate (weekly default → Mondays UTC; daily = every run; --force bypasses)
 *   - NARRATIVE_BAKE_RUN_CAP_USD per-run cap (default $1.00) — crossing it stops the run, exit 1
 *   - the metered client's own daily/monthly SpendCapError seam (refinery/agents/anthropic.mts)
 * Every call logs to api_usage_log as call_type "narrative_bake" (ops /spend line).
 * A validator failure keeps the previous row and fails the run loud (exit 1).
 */
import {
  getAnthropic,
  agentsAreMocked,
  computeCostUsd,
  SYNTHESIS_MODEL,
} from "../refinery/agents/anthropic.mts";
import { shouldRunToday } from "../lib/narratives/cadence";
import { inputsHash } from "../lib/narratives/hash";
import { buildNarrativePrompt, NARRATIVE_MAX_TOKENS } from "../lib/narratives/prompt";
import { validateNarrative } from "../lib/narratives/validate";
import { loadInputsHashes, upsertNarrative } from "../lib/narratives/store";
import { assembleZipBakeInputs, listZipSurfaceKeys } from "../lib/narratives/zip-inputs";
import {
  assembleCorridorBakeInputs,
  listCorridorSurfaceKeys,
} from "../lib/narratives/corridor-inputs";
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const adapter = SURFACE_ADAPTERS[args.surface];
  if (!adapter) {
    console.error(
      `unknown surface "${args.surface}" — known: ${Object.keys(SURFACE_ADAPTERS).join(", ")}`,
    );
    return 1;
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

  const keys = args.keys ?? (await adapter.list());
  const existing = args.force ? new Map<string, string>() : await loadInputsHashes(args.surface);
  const cap = runCapUsd();

  let spent = 0;
  let baked = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const key of keys) {
    const inputs = await adapter.assemble(key);
    if (!inputs) {
      skipped++;
      continue;
    }
    const hash = inputsHash(inputs);
    if (existing.get(key) === hash) {
      skipped++;
      continue;
    }
    if (args.dryRun) {
      console.log(`[bake] would bake ${args.surface}/${key} (${inputs.facts.length} facts)`);
      baked++;
      continue;
    }
    if (spent >= cap) {
      console.error(
        `[bake] RUN CAP: $${spent.toFixed(2)} logged >= $${cap.toFixed(2)} (NARRATIVE_BAKE_RUN_CAP_USD) — stopping with ${keys.length - baked - skipped - failed} keys unprocessed`,
      );
      failures.push(`run cap hit at $${spent.toFixed(2)}`);
      break;
    }

    const { system, user } = buildNarrativePrompt(inputs);
    try {
      const client = getAnthropic("narrative_bake");
      const response = await client.messages.create({
        model: SYNTHESIS_MODEL,
        max_tokens: NARRATIVE_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });
      spent += computeCostUsd(response.model, response.usage);
      const text = response.content.find((b) => b.type === "text")?.text ?? "";
      const sections = parseSections(text);
      const errors = validateNarrative(sections, inputs);
      if (errors.length > 0) {
        failed++;
        failures.push(`${key}: ${errors.join("; ")}`);
        console.error(
          `[bake] ${args.surface}/${key} FAILED validation (previous row kept):\n  ${errors.join("\n  ")}`,
        );
        continue;
      }
      await upsertNarrative({
        surface: args.surface,
        surface_key: key,
        sections,
        inputs_hash: hash,
        sources: inputs.sources,
        model: response.model,
      });
      baked++;
      console.log(`[bake] ${args.surface}/${key} baked ($${spent.toFixed(3)} run total)`);
    } catch (e) {
      failed++;
      failures.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(`[bake] ${args.surface}/${key} errored:`, e instanceof Error ? e.message : e);
      // SpendCapError from the metered seam = structural stop, not per-key noise.
      if (e instanceof Error && e.name === "SpendCapError") break;
    }
  }

  console.log(
    `[bake] done — surface=${args.surface} baked=${baked} skipped=${skipped} failed=${failed} spent=$${spent.toFixed(3)} cap=$${cap.toFixed(2)}${args.dryRun ? " (dry-run)" : ""}`,
  );
  return failed > 0 || failures.length > 0 ? 1 : 0;
}

process.exit(await main());
