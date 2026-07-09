/**
 * Launch cadence switch (spec §Cadence & launch switch). One repo-level GHA
 * variable — BAKE_CADENCE — gates every narrative-bake workflow. The cron
 * fires daily; this decides whether today actually bakes.
 *   weekly (default / unset / anything else) → Mondays (UTC) only
 *   daily                                    → every firing
 * Launch flip = edit the one variable. No code deploy.
 */
export function shouldRunToday(
  cadence: string | undefined,
  now: Date,
): { run: boolean; reason: string } {
  const mode = (cadence ?? "").trim().toLowerCase();
  if (mode === "daily") return { run: true, reason: "BAKE_CADENCE=daily" };
  const isMonday = now.getUTCDay() === 1;
  return isMonday
    ? { run: true, reason: "weekly cadence — Monday (UTC)" }
    : { run: false, reason: "weekly cadence — not Monday (UTC); skipping quietly" };
}
