import { createHash } from "node:crypto";
import type { BakeInputs } from "./types";

/** Deterministic JSON — object keys sorted at every depth. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** The delta gate: a surface rebakes only when this hash moves. Hashes the
 *  facts + as-of only — copy edits to prompt/context wording deliberately do
 *  NOT force a global rebake (use --force for those). */
export function inputsHash(inputs: BakeInputs): string {
  return createHash("sha256")
    .update(stableStringify({ facts: inputs.facts, asOf: inputs.asOf }))
    .digest("hex");
}
