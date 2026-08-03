// app/p/[id]/ShareCta.tsx
// One banner, one message, shown ONLY to non-owner viewers (the page decides;
// this component is dumb). Server-compatible — no client hooks.
import { SHARE_CTA_TEXT, SHARE_CTA_HREF } from "@/lib/share/cta";

export function ShareCta() {
  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-[#0d1e2b]/70 p-4 text-center">
      <a
        href={SHARE_CTA_HREF}
        className="text-sm font-medium text-gulf-teal transition-colors hover:text-white"
      >
        {SHARE_CTA_TEXT} →
      </a>
    </div>
  );
}
