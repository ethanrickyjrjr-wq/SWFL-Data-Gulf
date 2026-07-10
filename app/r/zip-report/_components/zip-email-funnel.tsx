import { EmailPreviewFrame } from "@/app/p/[id]/EmailPreviewFrame";
import { openZipLab } from "@/lib/lab-entry/destination";

/**
 * Phase D funnel weave (spec 2026-07-09-zip-page-destination-design.md): a live
 * miniature of THIS ZIP's email — the same doc a lab visitor lands in — woven in
 * directly after the narration, so the forward action is native to the page's
 * purpose (Zillow-playbook evidence in the spec), never a bolted-on banner.
 *
 * The miniature is a real render of the zip-seed doc through the ONE
 * EmailDoc→HTML root (renderEmailDocHtml → compileGrid for grid docs — the same
 * engine real sends use) shown in the existing EmailPreviewFrame scaler. NOT a
 * fourth render engine. `inert` keeps the duplicate content out of the tab
 * order and accessibility tree; the CTA is the only interactive surface.
 *
 * Empty-tolerant: no seed HTML (out-of-scope ZIP, zero ranked signals, render
 * failure) → renders nothing, the page degrades to today's layout.
 */
export function ZipEmailFunnel({
  zip,
  html,
  refParam,
}: {
  zip: string;
  html: string | null;
  refParam: string | null;
}) {
  if (!html) return null;

  return (
    <div className="mx-auto max-w-[1120px] px-6 py-8 sm:px-10">
      <section
        aria-label={`This ZIP report as a branded email for ${zip}`}
        className="rounded-2xl glass-card-modern border border-teal-primary/20 p-5 sm:p-6"
      >
        <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,360px)_1fr]">
          <div
            inert
            className="relative max-h-[320px] overflow-hidden rounded-lg border border-white/10"
          >
            <EmailPreviewFrame srcDoc={html} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-navy-dark/90" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">This page, as your weekly email</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">
              This breakdown, branded as yours, in your clients&rsquo; inboxes weekly — free to
              build.
            </p>
            <a
              href={openZipLab(zip, { ref: refParam })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition"
              style={{ backgroundColor: "var(--brand-primary)" }}
            >
              Make it yours →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
