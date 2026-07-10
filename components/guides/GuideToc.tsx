import type { GuideSection } from "@/lib/guides/types";

/** Anchor TOC — sticky aside on desktop, plain list above the article on mobile. */
export function GuideToc({ sections }: { sections: GuideSection[] }) {
  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-24">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
        On this page
      </p>
      <ul className="space-y-2 border-l border-gulf-haze pl-4">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="text-sm text-text-secondary transition-colors hover:text-gulf-teal"
            >
              {s.heading}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
