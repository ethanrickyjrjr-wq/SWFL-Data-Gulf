import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { GuideCard } from "@/components/guides/GuideCard";
import { GUIDES } from "@/lib/guides/registry";

export const metadata: Metadata = {
  title: "Guides — SWFL Data Gulf",
  description:
    "How the system works and how to get the most out of it: where every number comes from, why the emails look the way they do, and the builder features you might miss.",
};

export default function GuidesPage() {
  const guides = GUIDES.filter((g) => g.kind === "guide");
  const tips = GUIDES.filter((g) => g.kind === "tips");

  return (
    <PageShell width="wide" className="py-16">
      <header className="mb-12 max-w-2xl">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gulf-teal">
          SWFL Data Gulf · Guides
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          How it works, and how to work it
        </h1>
        <p className="mt-3 text-text-secondary">
          Why we build the way we build — and the features that make the builder yours.
        </p>
      </header>

      <section aria-labelledby="guides-band">
        <h2 id="guides-band" className="mb-6 text-xl font-semibold text-text-primary">
          Guides
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {guides.map((g) => (
            <GuideCard key={g.slug} guide={g} />
          ))}
        </div>
      </section>

      {tips.length > 0 && (
        <section aria-labelledby="tips-band" className="mt-14">
          <h2 id="tips-band" className="mb-6 text-xl font-semibold text-text-primary">
            Tips &amp; hidden features
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {tips.map((g) => (
              <GuideCard key={g.slug} guide={g} />
            ))}
          </div>
        </section>
      )}
    </PageShell>
  );
}
