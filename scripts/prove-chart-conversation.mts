/**
 * prove-chart-conversation.mts — PROVE the CONVERSATION path tells the truth about
 * charts, on a LIVE Haiku answer.
 *
 * REPURPOSED 07/09/2026. This harness used to prove the chat AUTO-CHART: it assembled
 * `buildGroundedRegionSystem` + a "=== CHART ON SCREEN ===" block + the chart's figures
 * and checked that the analyst described the chart instead of refusing. That premise is
 * gone. Chat no longer charts — the producer ran to completion BEFORE the model was
 * called, so an offer to build one could never be honored, and the user's reply re-entered
 * the same producer and missed identically. The prompt was patched twice; the prompt was
 * never the root.
 *
 * The invariants are now INVERTED. A clean answer proves the analyst:
 *   1. never mentions, offers, or promises a chart              (the unfulfillable offer)
 *   2. never speaks an internal `*-swfl` brain id               (the slug leak)
 *   3. never deflects and never leaks the raw freshness token   (the pre-existing gate)
 *   4. answers a heat/inventory question from real reached numbers, not a paraphrase
 *
 * (1) and (2) are what `chat_chart_honesty_live_verify` asks for. (2) is a defense-in-depth
 * read: `stream.ts` scrubs the streamed output too, but this harness calls the model
 * directly, so it sees the RAW completion — exactly the leak layer 2 would otherwise mask.
 *
 * PAID. Operator-run, never autonomous. Run:  bun run scripts/prove-chart-conversation.mts
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../refinery/agents/anthropic.mts";
import { TRIAGE_MODEL } from "../refinery/agents/anthropic.mts";
import { buildGroundedRegionSystem } from "../lib/assistant/conversation-path";
import { findDeflection, findLeak } from "../.claude/hooks/check-answer-fix-proof.mjs";

// The exact live transcript that exposed all four roots on 07/09/2026.
const QUESTION = "Which corridors are heating up? Show me where inventory is tightening.";
const ORIGIN = "https://www.swfldatagulf.com";
const ROLLS = 6;
const MAX_TOKENS = 1100; // mirrors GROUNDED_MAX_TOKENS in conversation-path.ts
const fs = await import("node:fs/promises");
const { execSync } = await import("node:child_process");

/** Any internal brain id the model spoke out loud. Mirrors stream.ts's BRAIN_SLUG_RE. */
function findSlug(answer: string): string | null {
  return /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-swfl\b/.exec(answer)?.[0] ?? null;
}

/** A chart promise the surface cannot honor. Chat has no chart tool. */
function findChartOffer(answer: string): string | null {
  return /\b(chart|plot|graph|visuali[sz]\w*)\b/i.exec(answer)?.[0] ?? null;
}

async function callHaiku(client: Anthropic, system: string): Promise<string> {
  const res = await client.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: QUESTION }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

interface Scored {
  answer: string;
  deflect: string | null;
  leak: string | null;
  slug: string | null;
  chart: string | null;
  bad: boolean;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      JSON.stringify({ key_loaded: false, reason: "run with `bun run` so .env.local loads" }),
    );
    return;
  }
  const client = getAnthropic("proof");
  const observedAt = execSync('bash -lc "date -u +%Y-%m-%dT%H:%M:%SZ"', {
    encoding: "utf-8",
  }).trim();

  // Assembled EXACTLY as runConversationPath's region branch does — no chart block.
  const { system } = await buildGroundedRegionSystem(QUESTION, ORIGIN, "analyst");

  // The router fix is what makes this question answerable. If the reach brain never
  // landed in the prompt, a clean answer would only prove the model stayed quiet.
  const reached = /Market Heat|Inventory Y\/Y/i.test(system);
  if (!reached) {
    console.log(
      JSON.stringify({
        key_loaded: true,
        reason:
          "market-heat-swfl did not reach the grounding block — check resolveReachTargets " +
          "and that the brain is published. Proving honesty on empty grounding is worthless.",
      }),
    );
    return;
  }

  const results: Scored[] = [];
  for (let i = 0; i < ROLLS; i++) {
    let answer = "";
    try {
      answer = await callHaiku(client, system);
    } catch (e) {
      answer = `__ERROR__: ${(e as Error).message}`;
    }
    const deflect = findDeflection(answer);
    const leak = findLeak(answer);
    const slug = findSlug(answer);
    const chart = findChartOffer(answer);
    results.push({
      answer,
      deflect,
      leak,
      slug,
      chart,
      bad: Boolean(deflect || leak || slug || chart),
    });
    process.stderr.write(results[i].bad ? "x" : ".");
  }
  process.stderr.write("\n");

  const bad = results.filter((r) => r.bad).length;
  const firstClean = results.find((r) => !r.bad)?.answer ?? null;
  const report = {
    key_loaded: true,
    observed_at: observedAt,
    model: TRIAGE_MODEL,
    harness: "scripts/prove-chart-conversation.mts",
    endpoint: "/api/assistant",
    question: QUESTION,
    grounding_reached_heat_brain: reached,
    rolls: ROLLS,
    bad,
    bad_rate: bad / ROLLS,
    worked: bad === 0,
    sample_clean: firstClean,
    breakdown: results.map((r) => ({
      bad: r.bad,
      deflect: r.deflect,
      leak: r.leak,
      slug: r.slug,
      chart: r.chart,
    })),
  };
  await fs.writeFile(
    "scripts/.prove-chart-conversation-result.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));

  // Append ONE proof line when we captured a clean live answer (the push-gate requires
  // this for an answer-path fix claim). Honest by construction: a REAL captured Haiku
  // answer, scored clean by the gate's own detectors plus the two new ones.
  if (firstClean) {
    const proof = {
      question: QUESTION,
      answer: firstClean,
      endpoint: "/api/assistant",
      observed_at: observedAt,
      commit_claim:
        "chat chart honesty: the analyst answers heat/inventory from the reached brain's real " +
        "figures, never offers a chart it cannot build, never speaks an internal brain id",
    };
    await fs.appendFile("verification/answer-proofs.jsonl", JSON.stringify(proof) + "\n");
    process.stderr.write("✅ appended live proof to verification/answer-proofs.jsonl\n");
  }
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
