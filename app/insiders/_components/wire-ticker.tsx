// app/insiders/_components/wire-ticker.tsx
//
// The wire — a thin marquee band of LIVE figures under the hero. Server
// component, CSS-only motion (`.ins-wire-track`), static row under
// prefers-reduced-motion. The page passes only loader-backed values; when the
// lake degrades the page renders no ticker at all — a sample number never
// scrolls past a prospect on the page that sells "no invented numbers".

export interface WireItem {
  label: string;
  value: string;
}

export function WireTicker({ items, note }: { items: WireItem[]; note: string }) {
  if (items.length === 0) return null;
  const row = (ariaHidden: boolean) => (
    <div className="ins-wire-row" aria-hidden={ariaHidden || undefined}>
      {items.map((it, i) => (
        <span className="ins-wire-item" key={`${it.label}-${i}`}>
          <span className="ins-wire-label">{it.label}</span>
          <span className="ins-wire-value">{it.value}</span>
        </span>
      ))}
      <span className="ins-wire-item ins-wire-note">{note}</span>
    </div>
  );
  return (
    <div className="ins-wire" aria-label="Live market wire">
      <div className="ins-wire-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
