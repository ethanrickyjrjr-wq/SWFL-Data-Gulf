import type { ChartSpec } from "@/components/charts/registry/chart-spec";

/**
 * IN_CHAT_FRAME_ALLOWLIST — the SINGLE source of truth for which chart frames
 * may render on the in-chat surfaces: the `/r/*` converse dock and (post-Task-3)
 * the welcome/chat analyst. It is exactly the set `buildChartForIntent` emits
 * from its bounded scope router (asking-rent / vacancy → `bar-table`,
 * zhvi → `zhvi-area`, corridor-scatter → `corridor-scatter`).
 *
 * The wider `CHART_REGISTRY` (`composition`, `z-gauge`, `seasonal-radial`,
 * `storm-timeline`, and any frame added later) belongs to the deliverable /
 * template-build engine. Those template-build frames must NEVER reach the chat
 * dock — that is the `generic_chart_capability` scope fence, enforced here
 * FAIL-CLOSED (reject-by-default) rather than by comment.
 *
 * BOTH enforcement points import THIS constant — the producer-level refusal in
 * `buildChartForIntent` and the runtime strip at the SSE emission edge
 * (`screenInChatChartFrame`). Do not duplicate the list; a divergent second copy
 * is exactly the failure mode this prevents.
 */
export const IN_CHAT_FRAME_ALLOWLIST: ReadonlySet<string> = new Set([
  "bar-table",
  "zhvi-area",
  "corridor-scatter",
]);

/** True when `frameId` may render on an in-chat surface. */
export function isInChatFrameAllowed(frameId: string): boolean {
  return IN_CHAT_FRAME_ALLOWLIST.has(frameId);
}

/**
 * Runtime strip for the in-chat SSE chart-emission edge. Returns the spec ONLY
 * when its `frameId` is allow-listed; otherwise DROPS it (returns `null`) and
 * logs a telemetry line (frameId + source) so a leaking template-build frame is
 * observable, never silent.
 *
 * Fail-closed: a malformed payload, a missing `frameId`, or an unrecognized
 * `frameId` is dropped. `source` names the calling edge (e.g. `"converse"`,
 * `"welcome-chat"`) so the drop log points at which surface tried to emit it.
 */
export function screenInChatChartFrame(chart: unknown, source: string): ChartSpec | null {
  const frameId =
    chart && typeof chart === "object" && "frameId" in chart
      ? (chart as { frameId?: unknown }).frameId
      : undefined;

  if (typeof frameId === "string" && IN_CHAT_FRAME_ALLOWLIST.has(frameId)) {
    return chart as ChartSpec;
  }

  console.warn(
    "[in-chat-frames] dropped non-allowlisted chart frame",
    JSON.stringify({ frameId: typeof frameId === "string" ? frameId : null, source }),
  );
  return null;
}
