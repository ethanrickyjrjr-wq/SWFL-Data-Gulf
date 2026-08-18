//
// The ONE protocol for live build streaming (spec 2026-08-18). Both lanes —
// email (/api/email-lab/ai) and social (/api/email-lab/social/generate) —
// speak exactly these events. NDJSON: one JSON object per line.
import type { EmailDoc } from "@/lib/email/doc/types";

export type BuildStreamEvent =
  | { e: "status"; label: string }
  | { e: "skeleton"; doc: EmailDoc }
  | { e: "block"; id: string; props: Record<string, unknown> }
  | { e: "slot"; id: string; text: string }
  | { e: "done"; payload: unknown }
  | { e: "error"; message: string };

export function encodeEvent(ev: BuildStreamEvent): string {
  return `${JSON.stringify(ev)}\n`;
}

/** Reassemble events from arbitrary chunk boundaries. `carry` is the unfinished
 *  tail of the previous chunk; pass it back on the next call. */
export function decodeEvents(
  chunk: string,
  carry: string,
): { events: BuildStreamEvent[]; carry: string } {
  const lines = (carry + chunk).split("\n");
  const nextCarry = lines.pop() ?? "";
  const events: BuildStreamEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as BuildStreamEvent);
    } catch {
      events.push({ e: "error", message: "malformed stream line" });
    }
  }
  return { events, carry: nextCarry };
}
