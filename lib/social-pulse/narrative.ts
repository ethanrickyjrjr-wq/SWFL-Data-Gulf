// lib/social-pulse/narrative.ts
// Weekly narrative over the computed digest. The model restates figures; it never
// computes or invents one. Failure → null (the digest publishes without prose).
import type { PulseDigest } from "./digest";

export function narrativeSystem(): string {
  return [
    "You write a 3-5 sentence weekly brief about Southwest Florida real-estate social media engagement.",
    "You may use ONLY the figures present in the JSON the user provides — never compute, extrapolate, or invent a number.",
    "Attribute figures to a live Instagram scan of public posts; never name any internal system or data vendor.",
    "Plain text only: no blockquotes, no tables, no hashtags, no emojis, no marketing adjectives (no 'boost', 'supercharge', 'unlock').",
    "State the as-of date exactly once, as given in asOf.",
  ].join("\n");
}

async function defaultComplete(system: string, user: string): Promise<string> {
  const { getAnthropic } = await import("@/refinery/agents/anthropic.mts");
  const msg = await getAnthropic("other").messages.create({
    model: process.env.PULSE_NARRATIVE_MODEL ?? "claude-sonnet-5",
    max_tokens: 400,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}

export async function buildNarrative(
  digest: PulseDigest,
  deps?: { complete?: (system: string, user: string) => Promise<string> },
): Promise<string | null> {
  const complete = deps?.complete ?? defaultComplete;
  try {
    const text = await complete(narrativeSystem(), JSON.stringify(digest));
    return text || null;
  } catch {
    return null;
  }
}
