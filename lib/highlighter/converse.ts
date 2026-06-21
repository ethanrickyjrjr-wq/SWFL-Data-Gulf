// Pure, framework-free engine for the in-page Highlighter chat. Both the
// selection popup and the "Ask AI" dock drive this one function so there is a
// single grounded-`/api/converse` implementation (no duplicated SSE loop).
//
// Kept React-free on purpose: the streaming/accumulation logic is unit-tested
// (see converse.test.ts) by injecting a fetch stub; the thin `useConverse` hook
// (use-converse.ts) only wires this to React state.

import { parseSSEFrames } from "./sse";

export interface ConverseInput {
  reportId: string;
  /** Optional fact context (the selected figure). Omitted for report-level chat. */
  fact?: string;
  /** Metric slug for the highlighted figure, when known (chip/row path). Lets the
   *  server resolve the authored methodology entry. Undefined for free selections. */
  slug?: string;
  /** Selection type (date/token/place/metric/section) so the server can tailor BOTH
   *  the answer and the real-time follow-ups. Absent for the report-level dock —
   *  its absence also gates off the follow-ups directive (no chips there). */
  selectionType?: string;
  /** True when this ask originated from a model-generated real-time follow-up chip
   *  (vs a static starter chip). Analytics only. */
  isRealtime?: boolean;
  /** True when this ask came from a chip click (vs free-form textarea). Analytics only. */
  fromChip?: boolean;
  question: string;
}

/** The structured tail marker the converse model appends after its answer:
 *  `⟦FOLLOWUPS⟧ q1 | q2 | q3`. U+27E6 + "FOLLOWUPS" + U+27E7 = 11 JS chars. Exotic
 *  + non-markdown so it never collides with answer prose. */
const FOLLOWUPS_MARKER = "⟦FOLLOWUPS⟧";

/**
 * Split the accumulated answer into the visible prose and the follow-up chips.
 * Pure + exported so the parsing is unit-tested directly (no stream needed).
 *
 * - Full marker present → `visible` is everything before it (trimEnd); `followups`
 *   is the tail split on "|", trimmed, empties dropped, stray brackets stripped,
 *   capped at 3.
 * - No full marker → `followups` is empty and we trim any TRAILING PARTIAL of the
 *   marker off `visible` so a half-streamed "…answer.\n\n⟦FOLL" never flashes.
 */
export function splitFollowupTail(acc: string): { visible: string; followups: string[] } {
  const idx = acc.indexOf(FOLLOWUPS_MARKER);
  if (idx !== -1) {
    const visible = acc.slice(0, idx).trimEnd();
    const followups = acc
      .slice(idx + FOLLOWUPS_MARKER.length)
      .split("|")
      .map((q) => q.replace(/[⟦⟧]/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return { visible, followups };
  }
  // No full marker yet — hide any trailing partial of it (check every prefix,
  // longest first, so "⟦FOLLOWUPS" and "⟦F" are both caught). trimEnd drops the
  // blank line the model puts before the marker so it never flashes mid-stream.
  for (let len = FOLLOWUPS_MARKER.length - 1; len >= 1; len--) {
    if (acc.endsWith(FOLLOWUPS_MARKER.slice(0, len))) {
      return { visible: acc.slice(0, acc.length - len).trimEnd(), followups: [] };
    }
  }
  return { visible: acc, followups: [] };
}

export interface ConverseHandlers {
  /** Called with the ACCUMULATED answer text on every delta. */
  onText: (accumulated: string) => void;
  /** Called once with the reach slugs the server pulled (on the done frame). */
  onReach?: (reach: string[]) => void;
  /** Called once on the done frame with the model's real-time follow-up chips
   *  (empty when the tail was missing/malformed — caller falls back to static). */
  onFollowups?: (followups: string[]) => void;
  /**
   * Called once with the answered flag from the done frame.
   * false = the AI signalled it couldn't answer from the payload (data gap).
   */
  onAnswered?: (answered: boolean) => void;
  /** Called with the chart frame payload when the server emits one. */
  onChart?: (chart: unknown) => void;
  /** Called with a human-readable message on any failure. Terminal. */
  onError: (message: string) => void;
  /** Called once when the stream completes cleanly. */
  onDone?: () => void;
}

/**
 * POST the question to `/api/converse` and drive the handlers from the SSE
 * stream. Resolves when the stream ends (or an error/empty-question short-circuits).
 * `fetchImpl` is injectable for tests; defaults to the global `fetch`.
 */
export async function streamConverse(
  input: ConverseInput,
  handlers: ConverseHandlers,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const question = input.question.trim();
  if (!question) return;

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    res = await fetchImpl("/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The AssistantRequest contract, spoken directly (was the deleted /api/converse
      // shim's mapping): report_id present → the engine's report-grounding path; the
      // dock's single question becomes the one user turn. context:"outside" = OUTSIDE AI.
      body: JSON.stringify({
        context: "outside",
        report_id: input.reportId,
        fact: input.fact,
        slug: input.slug,
        selection_type: input.selectionType,
        is_realtime: input.isRealtime,
        from_chip: input.fromChip,
        messages: [{ role: "user", content: question }],
      }),
    });
  } catch (e) {
    handlers.onError((e as Error).message || "Something went wrong.");
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError(`Request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let acc = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSSEFrames(buffer);
      buffer = rest;
      for (const ev of events) {
        if (ev.error) {
          handlers.onError(ev.error);
          return;
        }
        if (ev.chart !== undefined) {
          handlers.onChart?.(ev.chart);
        }
        if (typeof ev.text === "string") {
          acc += ev.text;
          // Hide the follow-ups tail (and any half-streamed partial of it) from
          // the displayed answer; it surfaces as chips on the done frame instead.
          handlers.onText(splitFollowupTail(acc).visible);
        }
        if (ev.done) {
          if (Array.isArray(ev.reach)) handlers.onReach?.(ev.reach);
          // answered defaults to true when absent (older server / test stub).
          handlers.onAnswered?.(ev.answered !== false);
          handlers.onFollowups?.(splitFollowupTail(acc).followups);
          handlers.onDone?.();
        }
      }
    }
  } catch (e) {
    handlers.onError((e as Error).message || "Something went wrong.");
  }
}
