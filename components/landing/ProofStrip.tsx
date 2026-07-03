/**
 * Proof strip — the social-proof slot (Lane B spec §2). No testimonials exist
 * yet; the thing we uniquely have is provenance, so the strip is the named
 * sources with their as-of dates, injected server-side from the same loader
 * that feeds the map. Never framed as "ZIP-level intelligence".
 */
export interface ProofItem {
  name: string;
  asOf?: string;
}

export default function ProofStrip({ items, zipCount }: { items: ProofItem[]; zipCount: number }) {
  if (items.length === 0) return null;
  return (
    <section className="proof-strip" aria-label="Data sources">
      <div className="proof-inner">
        <span className="proof-lead">
          {zipCount > 0 ? `${zipCount} ZIPs mapped · ` : ""}every number cited
        </span>
        {items.map((s) => (
          <span className="proof-item" key={s.name}>
            {s.name}
            {s.asOf ? <span className="proof-asof"> · {s.asOf}</span> : null}
          </span>
        ))}
      </div>
    </section>
  );
}
