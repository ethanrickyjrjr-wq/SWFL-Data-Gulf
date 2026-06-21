"use client";

import { useCallback, useEffect, useState } from "react";
import { TEMPLATE_MANIFEST } from "@/lib/templates/manifest";

/**
 * Client grid of viz templates. Preview opens the PUBLIC render
 * (`GET /api/templates/render?slug=…`, the card's own manifest previewData — no
 * auth/secret) in an IN-PLACE modal popup, NOT a new tab. Staying on /showcase
 * keeps the standalone AI pill (AppShell) visible, so a visitor can preview a
 * template and immediately ask the AI to build it for their scope without ever
 * leaving the page. Click the backdrop or press Escape to dismiss.
 */
export function ShowcaseGrid() {
  const vizTemplates = TEMPLATE_MANIFEST.filter((t) => t.family === "viz");
  const [preview, setPreview] = useState<{ slug: string; name: string } | null>(null);

  const close = useCallback(() => setPreview(null), []);

  // Escape-to-close + lock background scroll while the popup is open.
  useEffect(() => {
    if (!preview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [preview, close]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vizTemplates.map((t) => (
          <div
            key={t.slug}
            className="flex flex-col rounded-xl border border-gulf-haze bg-gulf-slate p-5 transition-colors hover:border-gulf-teal-dim"
          >
            <span className="font-mono text-[11px] font-semibold tracking-widest text-gulf-teal">
              {t.id}
            </span>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-text-primary">
              {t.name}
            </h3>
            <p className="mt-0.5 font-mono text-xs text-text-tertiary">{t.subtitle}</p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">
              {t.description}
            </p>
            <button
              type="button"
              onClick={() => setPreview({ slug: t.slug, name: t.name })}
              className="mt-4 self-start rounded-md border border-gulf-haze bg-gulf-slate-hi px-4 py-2 font-mono text-xs font-medium tracking-wide text-text-secondary transition-colors hover:border-gulf-teal-dim hover:text-gulf-teal"
            >
              Preview →
            </button>
          </div>
        ))}
      </div>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview: ${preview.name}`}
          onClick={close}
          // z-50 keeps the preview ABOVE page/nav but BELOW the universal AI pill
          // (z-56) + its panel (z-57), so the outside/data pill stays visible and
          // clickable while previewing — preview a template, then build with the pill.
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-8"
        >
          {/* Stop propagation so clicks inside the panel don't dismiss; the backdrop does. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gulf-haze bg-gulf-deep shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gulf-haze px-4 py-3">
              <span className="font-mono text-xs font-medium tracking-wide text-text-secondary">
                Preview · {preview.name}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close preview"
                className="rounded-md px-2 py-1 text-text-tertiary transition-colors hover:bg-gulf-slate-hi hover:text-text-primary"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {/* The render endpoint returns a full HTML document → isolate it in an iframe
                (its own styles), shown on white as the templates are designed. */}
            <iframe
              src={`/api/templates/render?slug=${encodeURIComponent(preview.slug)}`}
              title={`Preview of ${preview.name}`}
              className="h-full w-full flex-1 bg-white"
            />
          </div>
        </div>
      )}
    </>
  );
}
