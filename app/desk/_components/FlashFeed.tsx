import type { FlashItem } from "@/lib/desk/types";
import { FileFlashItem } from "./FileFlashItem";

const KIND_STYLE: Record<FlashItem["kind"], { label: string; className: string }> = {
  news: { label: "NEWS", className: "border-gulf-teal/40 text-gulf-teal" },
  price_cut: { label: "PRICE CUT", className: "border-[#d4b370]/40 text-[#d4b370]" },
  closing: { label: "CLOSED", className: "border-[#5bc97a]/40 text-[#5bc97a]" },
};

/**
 * The flash feed — a text wire of headlines and notable listing events,
 * newest first. Deliberately photo-free (a wire, not a gallery): no CDN
 * image can leak here by construction. Closings carry their code-owned
 * sold-price disclosure verbatim; the luxury-sampling caveat is the zone
 * note above. Empty-tolerant: with no items the zone hides entirely.
 */
export function FlashFeed({ items }: { items: FlashItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-white/5">
      {items.map((it) => {
        const kind = KIND_STYLE[it.kind];
        const link = it.href ?? it.lookupHref;
        return (
          <li key={it.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline gap-2">
              <span
                className={`shrink-0 rounded border px-1 font-mono text-[9px] uppercase tracking-wider ${kind.className}`}
              >
                {kind.label}
              </span>
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-sm text-gray-200 hover:text-gulf-teal hover:underline"
                >
                  {it.headline}
                </a>
              ) : (
                <span className="min-w-0 truncate text-sm text-gray-200">{it.headline}</span>
              )}
              <span className="ml-auto">
                <FileFlashItem item={it} />
              </span>
            </div>
            {it.detail ? <p className="pl-1 font-mono text-xs text-gray-400">{it.detail}</p> : null}
            {it.disclosure ? (
              <p className="pl-1 text-[11px] text-gray-500">{it.disclosure}</p>
            ) : null}
            <p className="pl-1 font-mono text-[10px] text-gray-600">
              {it.asOf ?? ""}
              {it.asOf ? " · " : ""}
              {it.sourceLabel}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
