"use client";

import { TEMPLATE_MANIFEST } from "@/lib/templates/manifest";

/**
 * Client grid of viz templates. The Preview button opens the PUBLIC preview
 * render (`GET /api/templates/render?slug=…`) in a new tab — it renders the
 * card's own manifest previewData, so no auth/secret is involved.
 */
export function ShowcaseGrid() {
  const vizTemplates = TEMPLATE_MANIFEST.filter((t) => t.family === "viz");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {vizTemplates.map((t) => (
        <div
          key={t.slug}
          className="flex flex-col rounded-xl border border-gulf-haze bg-gulf-slate p-5 transition-colors hover:border-gulf-teal-dim"
        >
          <span className="font-mono text-[11px] font-semibold tracking-widest text-gulf-teal">
            {t.id}
          </span>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-text-primary">{t.name}</h3>
          <p className="mt-0.5 font-mono text-xs text-text-tertiary">{t.subtitle}</p>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">{t.description}</p>
          <button
            type="button"
            onClick={() =>
              window.open(`/api/templates/render?slug=${encodeURIComponent(t.slug)}`, "_blank")
            }
            className="mt-4 self-start rounded-md border border-gulf-haze bg-gulf-slate-hi px-4 py-2 font-mono text-xs font-medium tracking-wide text-text-secondary transition-colors hover:border-gulf-teal-dim hover:text-gulf-teal"
          >
            Preview →
          </button>
        </div>
      ))}
    </div>
  );
}
