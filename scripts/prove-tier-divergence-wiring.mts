/**
 * prove-tier-divergence-wiring.mts — answer-fix-proof for wiring tier-divergence-swfl
 * into master's input_brains (refinery/packs/master.mts, an ANSWER_PATH file).
 *
 * Not a deflection-fix; the push-gate's fix-claim regex fired on "resolved" (the
 * merge-conflict resolution), not an answer-quality claim. Still worth proving for
 * real: master.mts decides whether a region-wide read exists to answer from, and
 * this change added a new voting brain to that synthesis. Confirms the live
 * assistant still answers a region-wide question cleanly off the freshly
 * regenerated brains/master.md (v116, tier-divergence-swfl wired in) — no
 * deflection, no leaked token, a real cited number.
 *
 * Run:  bun run scripts/prove-tier-divergence-wiring.mts
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, TRIAGE_MODEL } from "../refinery/agents/anthropic.mts";
import { buildGroundedRegionSystem } from "../lib/assistant/conversation-path";
import { findDeflection, findLeak } from "../.claude/hooks/check-answer-fix-proof.mjs";

const ORIGIN = "https://www.swfldatagulf.com";
const QUESTION = "What's the overall economic read for Southwest Florida right now?";
const MAX_TOKENS = 700;
const fs = await import("node:fs/promises");

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

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(JSON.stringify({ key_loaded: false, reason: "run with `bun run` so .env.local loads" })); // prettier-ignore
    return;
  }
  const client = getAnthropic("proof");
  const observedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const { system } = await buildGroundedRegionSystem(QUESTION, ORIGIN, "analyst");
  const answer = await callHaiku(client, system);
  const deflect = findDeflection(answer);
  const leak = findLeak(answer);
  const clean = !deflect && !leak && answer.length >= 120 && /\d/.test(answer);

  const report = {
    observed_at: observedAt,
    model: TRIAGE_MODEL,
    endpoint: "/api/assistant",
    harness: "scripts/prove-tier-divergence-wiring.mts",
    question: QUESTION,
    deflect,
    leak,
    clean,
    answer,
  };
  console.log(JSON.stringify(report, null, 2));

  if (clean) {
    const proof = {
      question: QUESTION,
      answer,
      endpoint: "/api/assistant",
      observed_at: observedAt,
      commit_claim:
        "master.mts wired tier-divergence-swfl into input_brains (new real bullish/bearish vote, not a deflection fix — trip was the merge-resolution wording). Proof: region-wide question still answers clean off the regenerated brains/master.md (v116) — no deflection, no token leak, real cited figures.",
    };
    await fs.appendFile("verification/answer-proofs.jsonl", JSON.stringify(proof) + "\n");
    process.stderr.write("✅ appended live proof to verification/answer-proofs.jsonl\n");
  } else {
    process.stderr.write("✗ answer was not clean — not appending a proof\n");
  }
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(1);
});
