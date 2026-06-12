"use client";

/**
 * Visible, non-crashing fallback for a chart the dock could not render (a chart
 * spec with a missing or unknown `frameId`). Replaces a silent blank so the
 * failure is observable, but never takes the chat session down. The `reason` is
 * shown only in development — in production the user sees a plain label.
 */
export function ChartUnavailable({ reason }: { reason?: string }) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-6 text-center">
      <p className="text-xs font-medium text-gray-400">Chart unavailable</p>
      {isDev && reason ? <p className="font-mono text-[10px] text-gray-500">{reason}</p> : null}
    </div>
  );
}

export default ChartUnavailable;
