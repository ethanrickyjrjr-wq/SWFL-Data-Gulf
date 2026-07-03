"use client";

import { useRef, useState } from "react";
import { EmailLabShell } from "@/components/email-lab/EmailLabShell";
import { SendToSelfModal } from "@/components/email-lab/SendToSelfModal";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

// Standalone Email Lab — block canvas, no project scope: the anonymous
// taste-surface. `initialDoc` (homepage-map / zip-report ?zip= prebuild)
// overrides the default seed. The header's primary action is the lab-first
// funnel's capture: "Send this to yourself" → inline OTP → project + one send
// (spec: 2026-07-03-lab-first-funnel-landing-design.md).
export function EmailLabClient({
  initialDoc = null,
  zip = null,
  refCode = null,
}: {
  initialDoc?: EmailDoc | null;
  zip?: string | null;
  refCode?: string | null;
}) {
  const [doc] = useState(() => initialDoc ?? SEED_DOCS[0].build());
  // The shell owns the live doc; we only need it at send time.
  const currentDocRef = useRef<EmailDoc>(doc);
  const [sendOpen, setSendOpen] = useState(false);

  return (
    <>
      <EmailLabShell
        initialDoc={doc}
        onDocChange={(d) => {
          currentDocRef.current = d;
        }}
        headerSlot={
          <>
            <p className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-white/30">Email Lab</p>
            <p className="text-sm font-semibold text-white/80">Design Surface</p>
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              className="btn-gradient mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold text-navy-dark"
            >
              Send this to yourself
            </button>
            <p className="mt-1 text-[10px] leading-snug text-white/35">
              Free — lands in your inbox, saved to your workspace.
            </p>
          </>
        }
      />
      <SendToSelfModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        getDoc={() => currentDocRef.current}
        zip={zip}
        refCode={refCode}
      />
    </>
  );
}
