import { GUIDES } from "@/lib/guides/registry";
import type { GuideDef } from "@/lib/guides/types";
import { ArtifactFigure } from "./ArtifactFigure";
import { BestFor, ProTip, TryIt } from "./GuideBits";
import { GuideCard } from "./GuideCard";
import { GuideToc } from "./GuideToc";

/**
 * The one article template (spec §3) — Figma anatomy: hook intro → “what to
 * expect” bullets → TOC → sections (best-for tagline, prose, figure, pro-tips,
 * optional section CTA) → closing CTA → related guides.
 */
export function GuideArticle({ guide }: { guide: GuideDef }) {
  const related = GUIDES.filter((g) => g.slug !== guide.slug);

  return (
    <div className="py-16">
      <header className="mb-10 max-w-3xl">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gulf-teal">
          {guide.kind === "tips" ? "Tips & hidden features" : "Guide"}
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-secondary">{guide.hook}</p>
        {guide.expect.length > 0 && (
          <div className="mt-6 rounded-xl border border-gulf-haze bg-gulf-deep px-5 py-4">
            <p className="mb-2 text-sm font-semibold text-text-primary">
              Here&rsquo;s what you can expect
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {guide.expect.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <div className="gap-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="mb-10 lg:mb-0">
          <GuideToc sections={guide.sections} />
        </aside>

        <article className="max-w-3xl">
          {guide.sections.map((s) => (
            <section key={s.id} id={s.id} className="mb-12 scroll-mt-24">
              <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
                {s.heading}
              </h2>
              {s.bestFor && <BestFor>{s.bestFor}</BestFor>}
              {s.body.map((p) => (
                <p key={p.slice(0, 40)} className="mt-4 leading-relaxed text-text-secondary">
                  {p}
                </p>
              ))}
              {s.figure && <ArtifactFigure figure={s.figure} />}
              {s.proTips?.map((t) => (
                <ProTip key={t.slice(0, 40)}>{t}</ProTip>
              ))}
              {s.tryIt && <TryIt tryIt={s.tryIt} />}
            </section>
          ))}

          <TryIt tryIt={guide.tryIt} />

          {related.length > 0 && (
            <footer className="mt-16 border-t border-gulf-haze pt-10">
              <h2 className="mb-6 text-lg font-semibold text-text-primary">Keep reading</h2>
              <div className="grid gap-6 sm:grid-cols-2">
                {related.map((g) => (
                  <GuideCard key={g.slug} guide={g} />
                ))}
              </div>
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}
