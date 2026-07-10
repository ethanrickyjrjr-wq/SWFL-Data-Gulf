import Link from "next/link";
import type { TryIt as TryItDef } from "@/lib/guides/types";

/** Figma-style “Best for …” italic tagline under a section heading. */
export function BestFor({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm italic text-text-tertiary">Best for {children}</p>;
}

/** Inline pro-tip aside — the hidden-features mechanic (spec strand 3). */
export function ProTip({ children }: { children: React.ReactNode }) {
  return (
    <aside className="my-5 rounded-lg border border-gulf-haze bg-gulf-deep px-4 py-3 text-sm text-text-secondary">
      <span className="mr-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-gulf-teal">
        Pro tip
      </span>
      {children}
    </aside>
  );
}

/** Banded CTA deep-linking into the product — every guide exits into the lab or showcase. */
export function TryIt({ tryIt }: { tryIt: TryItDef }) {
  return (
    <div className="my-8 flex items-center justify-between gap-4 rounded-xl border border-gulf-haze bg-gulf-deep px-5 py-4">
      <span className="text-sm font-medium text-text-primary">Try it yourself</span>
      <Link
        href={tryIt.href}
        className="rounded-md bg-gulf-teal px-4 py-2 text-sm font-medium text-text-on-accent transition-opacity hover:opacity-90"
      >
        {tryIt.label} →
      </Link>
    </div>
  );
}
