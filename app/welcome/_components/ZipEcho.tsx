/** Instant echo-back of the submitted ZIP — a free trust micro-proof shown
 *  before the data lands. Name fills in from the {place}/{answer} frame. */
export function ZipEcho({ zip, name }: { zip: string; name?: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-sm">
      <span className="font-mono font-semibold tabular-nums text-text-primary">{zip}</span>
      <span className="text-text-tertiary">—</span>
      <span className="text-text-secondary">{name || "locating…"}</span>
    </div>
  );
}
